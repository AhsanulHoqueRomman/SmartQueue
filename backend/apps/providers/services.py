from django.db import transaction
from django.utils import timezone
from apps.organizations.models import OrganizationMembership
from apps.services.models import Service
from apps.audit.services import AuditService
from config.exceptions import ApplicationError
from .models import ProviderProfile, ProviderDocument, ProviderService, WeeklySchedule, ScheduleBreak, ProviderLeave


class ProviderNotProviderRoleException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'MEMBERSHIP_NOT_PROVIDER_ROLE'
    default_detail = 'The specified membership does not have the PROVIDER role.'


class ProviderAlreadyExistsException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'PROVIDER_PROFILE_EXISTS'
    default_detail = 'A provider profile already exists for this membership.'


class ServiceOrganizationMismatchException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'SERVICE_ORGANIZATION_MISMATCH'
    default_detail = 'The service does not belong to the same organization as the provider.'


class DuplicateProviderServiceException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'DUPLICATE_PROVIDER_SERVICE'
    default_detail = 'This service is already assigned to the provider.'


class BreakOnNonWorkingDayException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'BREAK_ON_NON_WORKING_DAY'
    default_detail = 'Breaks cannot be created on a non-working day.'


class BreakOutsideWorkingHoursException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'BREAK_OUTSIDE_WORKING_HOURS'
    default_detail = 'Break must fall entirely within the schedule working hours.'


class BreakOverlapException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'BREAK_OVERLAP'
    default_detail = 'Break overlaps an existing break on this schedule day.'


class ProviderService_:
    """
    Business logic layer for ProviderProfile and related models.
    """

    # ------------------------------------------------------------------
    # ProviderProfile
    # ------------------------------------------------------------------

    @staticmethod
    def create_provider_profile(*, organization, membership_id, bio='', title='', average_service_minutes=None):
        """
        Create a ProviderProfile.
        Validates:
          - membership exists within organization
          - membership.role == PROVIDER
          - no existing ProviderProfile for that membership
        """
        with transaction.atomic():
            try:
                membership = OrganizationMembership.objects.select_for_update().get(
                    id=membership_id,
                    organization=organization,
                    is_active=True,
                )
            except OrganizationMembership.DoesNotExist:
                raise ApplicationError(
                    message="Membership not found within this organization.",
                    code="MEMBERSHIP_NOT_FOUND",
                    status_code=404
                )

            if membership.role != OrganizationMembership.Role.PROVIDER:
                raise ProviderNotProviderRoleException()

            if hasattr(membership, 'provider_profile'):
                raise ProviderAlreadyExistsException()

            return ProviderProfile.objects.create(
                membership=membership,
                bio=bio,
                title=title,
                average_service_minutes=average_service_minutes,
                is_active=True,
            )

    @staticmethod
    def get_provider_unresolved_obligations(*, provider_id, organization_id) -> dict[str, int]:
        """
        Calculates itemized unresolved obligations blocking provider deactivation.
        Scoped strictly by provider_id and organization_id across 4 distinct categories.
        """
        from apps.appointments.models import Appointment
        from apps.queue.models import QueueEntry
        from .emergency_models import ProviderEmergency, EmergencyRecovery

        non_terminal_appointment_statuses = [
            Appointment.Status.PENDING,
            Appointment.Status.CONFIRMED,
            Appointment.Status.CHECKED_IN,
            Appointment.Status.IN_PROGRESS,
        ]
        appointments_count = Appointment.objects.filter(
            provider_id=provider_id,
            organization_id=organization_id,
            status__in=non_terminal_appointment_statuses,
        ).count()

        unresolved_queue_statuses = [
            QueueEntry.Status.WAITING,
            QueueEntry.Status.CALLED,
            QueueEntry.Status.IN_PROGRESS,
            QueueEntry.Status.SKIPPED,
        ]
        queue_entries_count = QueueEntry.objects.filter(
            provider_id=provider_id,
            organization_id=organization_id,
            status__in=unresolved_queue_statuses,
        ).count()

        emergency_recoveries_count = EmergencyRecovery.objects.filter(
            incident__provider_id=provider_id,
            appointment__organization_id=organization_id,
            resolution=EmergencyRecovery.Resolution.UNRESOLVED,
        ).count()

        active_emergency_states = [
            ProviderEmergency.State.TEMPORARY,
            ProviderEmergency.State.UNAVAILABLE,
        ]
        active_emergencies_count = ProviderEmergency.objects.filter(
            provider_id=provider_id,
            provider__membership__organization_id=organization_id,
            state__in=active_emergency_states,
        ).count()

        return {
            'appointments': appointments_count,
            'queue_entries': queue_entries_count,
            'emergency_recoveries': emergency_recoveries_count,
            'active_emergencies': active_emergencies_count,
        }

    @staticmethod
    @transaction.atomic
    def update_provider_profile(*, profile, actor=None, **kwargs):
        profile = ProviderProfile.objects.select_for_update(of=('self',)).get(pk=profile.pk)
        if 'average_service_minutes' in kwargs:
            from .permissions import require_provider_average_manager
            require_provider_average_manager(profile=profile, actor=actor)
            value = kwargs['average_service_minutes']
            if value is None or isinstance(value, bool) or value < 1:
                raise ApplicationError(message='Average service time must be a positive number of minutes.')
            from apps.appointments.capacity import date_capacity
            from apps.appointments.models import Appointment
            from apps.queue.services import business_date_for_appointment, current_business_date
            dates = {business_date_for_appointment(a) for a in profile.appointments.exclude(status='CANCELLED')
                     if business_date_for_appointment(a) >= current_business_date() or a.status in Appointment.BLOCKING_STATUSES}
            for on_date in dates:
                result = date_capacity(profile, on_date, average=value)
                if result['daily_capacity'] < result['allocated_count']:
                    raise ApplicationError(message='This average service time would reduce capacity below protected bookings.',
                                           code='DURATION_BOOKING_CONFLICT', status_code=409)

        # Obligation check if deactivating provider profile
        was_op = profile.is_operationally_active
        was_active = profile.is_active
        new_is_active = kwargs.get('is_active')
        if new_is_active is False and was_active is True:
            obligations = ProviderBizService.get_provider_unresolved_obligations(
                provider_id=profile.id,
                organization_id=profile.membership.organization_id,
            )
            if any(count > 0 for count in obligations.values()):
                raise ApplicationError(
                    message='Provider cannot be deactivated while unresolved appointments, active queue entries, or emergency obligations exist.',
                    code='PROVIDER_HAS_UNRESOLVED_OBLIGATIONS',
                    status_code=400,
                    details=obligations,
                )

        allowed_fields = {
            'bio', 'title', 'profile_photo', 'experience_years',
            'education', 'experience_history', 'certifications',
            'specialties', 'is_active', 'average_service_minutes'
        }
        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(profile, field, value)
        profile.save()

        # Emit audit logs if effective operational state transitioned
        profile.refresh_from_db()
        now_op = profile.is_operationally_active
        if was_op and not now_op:
            AuditService.record(
                action='PROVIDER_DEACTIVATED',
                entity_type='ProviderProfile',
                entity_id=profile.id,
                organization_id=profile.membership.organization_id,
                actor=actor,
                metadata={
                    'trigger': 'profile_deactivation',
                    'previous_operational_state': True,
                    'new_operational_state': False,
                    'changed_flag': 'profile.is_active',
                },
            )
        elif not was_op and now_op:
            AuditService.record(
                action='PROVIDER_ACTIVATED',
                entity_type='ProviderProfile',
                entity_id=profile.id,
                organization_id=profile.membership.organization_id,
                actor=actor,
                metadata={
                    'trigger': 'profile_activation',
                    'previous_operational_state': False,
                    'new_operational_state': True,
                    'changed_flag': 'profile.is_active',
                },
            )

        return profile

    @staticmethod
    def submit_application(*, provider_profile, actor=None):
        """
        Provider submits their completed profile and documents for manager review.
        Transitions application_status to PENDING_REVIEW and clears rejection reason.
        """
        with transaction.atomic():
            if provider_profile.application_status == ProviderProfile.ApplicationStatus.APPROVED:
                raise ApplicationError(message="Provider application is already approved.", code="ALREADY_APPROVED")

            provider_profile.application_status = ProviderProfile.ApplicationStatus.PENDING_REVIEW
            provider_profile.application_rejection_reason = ''
            provider_profile.save()

            AuditService.record(
                action='PROVIDER_APPLICATION_SUBMITTED',
                entity_type='ProviderProfile',
                entity_id=provider_profile.id,
                organization_id=provider_profile.organization.id,
                actor=actor or provider_profile.user,
            )
            return provider_profile

    @staticmethod
    def _require_initial_schedule_manager(provider, actor):
        if not OrganizationMembership.objects.filter(organization=provider.organization, user=actor, role=OrganizationMembership.Role.MANAGER, is_active=True).exists():
            raise ApplicationError(message='Only the organization manager may review the initial schedule.', status_code=403)

    @staticmethod
    def approve_application(*, provider_profile, manager_user):
        """
        Manager approves a pending provider application.
        Sets profile application_status=APPROVED and membership is_active=True.
        """
        with transaction.atomic():
            provider_profile = ProviderProfile.objects.select_for_update().get(pk=provider_profile.pk)
            was_op = provider_profile.is_operationally_active
            ProviderService_._require_initial_schedule_manager(provider_profile, manager_user)
            from .schedule_changes import validate_schedule
            schedules = list(provider_profile.weekly_schedules.prefetch_related('breaks'))
            if not any(day.is_working_day for day in schedules):
                raise ApplicationError(message='Configure the initial working schedule before approving this provider.', code='INITIAL_SCHEDULE_REQUIRED')
            for day in schedules:
                validate_schedule({'day_of_week': day.day_of_week, 'start_time': str(day.start_time), 'end_time': str(day.end_time), 'is_working_day': day.is_working_day, 'breaks': [{'title': b.title, 'start_time': str(b.start_time), 'end_time': str(b.end_time)} for b in day.breaks.all()]})
            provider_profile.application_status = ProviderProfile.ApplicationStatus.APPROVED
            provider_profile.application_reviewed_by = manager_user
            provider_profile.application_reviewed_at = timezone.now()
            provider_profile.application_rejection_reason = ''
            provider_profile.save()

            membership = provider_profile.membership
            if not membership.is_active:
                membership.is_active = True
                membership.save()

            AuditService.record(
                action='PROVIDER_APPLICATION_APPROVED',
                entity_type='ProviderProfile',
                entity_id=provider_profile.id,
                organization_id=provider_profile.organization.id,
                actor=manager_user,
            )

            provider_profile.refresh_from_db()
            now_op = provider_profile.is_operationally_active
            if not was_op and now_op:
                AuditService.record(
                    action='PROVIDER_ACTIVATED',
                    entity_type='ProviderProfile',
                    entity_id=provider_profile.id,
                    organization_id=provider_profile.organization.id,
                    actor=manager_user,
                    metadata={
                        'trigger': 'application_approved',
                        'previous_operational_state': False,
                        'new_operational_state': True,
                    },
                )

            return provider_profile

    @staticmethod
    def reject_application(*, provider_profile, manager_user, reason):
        """
        Manager rejects a provider application. Mandatory rejection reason required.
        Sets profile application_status=REJECTED and membership is_active=False.
        """
        reason_clean = (reason or '').strip()
        if not reason_clean:
            raise ApplicationError(message="Rejection reason is mandatory.", code="REASON_REQUIRED")

        with transaction.atomic():
            provider_profile = ProviderProfile.objects.select_for_update().get(pk=provider_profile.pk)
            if provider_profile.application_status == ProviderProfile.ApplicationStatus.APPROVED:
                raise ApplicationError(
                    message="Approved provider applications cannot be rejected. Use provider deactivation.",
                    code="CANNOT_REJECT_APPROVED_PROVIDER",
                    status_code=400,
                )
            ProviderService_._require_initial_schedule_manager(provider_profile, manager_user)
            provider_profile.application_status = ProviderProfile.ApplicationStatus.REJECTED
            provider_profile.application_rejection_reason = reason_clean
            provider_profile.application_reviewed_by = manager_user
            provider_profile.application_reviewed_at = timezone.now()
            provider_profile.save()

            membership = provider_profile.membership
            if membership.is_active:
                membership.is_active = False
                membership.save()

            AuditService.record(
                action='PROVIDER_APPLICATION_REJECTED',
                entity_type='ProviderProfile',
                entity_id=provider_profile.id,
                organization_id=provider_profile.organization.id,
                actor=manager_user,
                metadata={'reason': reason_clean}
            )
            return provider_profile

    @staticmethod
    def review_provider_document(*, document, status, reviewer_user, rejection_reason=''):
        """
        Manager reviews a provider document (APPROVED or REJECTED).
        """
        if status not in [ProviderDocument.Status.APPROVED, ProviderDocument.Status.REJECTED]:
            raise ApplicationError(message="Invalid document status.", code="INVALID_STATUS")

        reason_clean = (rejection_reason or '').strip()
        if status == ProviderDocument.Status.REJECTED and not reason_clean:
            raise ApplicationError(message="Rejection reason is mandatory when rejecting a document.", code="REASON_REQUIRED")

        with transaction.atomic():
            document.status = status
            document.reviewed_by = reviewer_user
            document.reviewed_at = timezone.now()
            document.rejection_reason = reason_clean if status == ProviderDocument.Status.REJECTED else ''
            document.save()

            AuditService.record(
                action='PROVIDER_DOCUMENT_REVIEWED',
                entity_type='ProviderDocument',
                entity_id=document.id,
                organization_id=document.provider_profile.organization.id,
                actor=reviewer_user,
                metadata={'status': status, 'rejection_reason': document.rejection_reason}
            )
            return document


    # ------------------------------------------------------------------
    # ProviderService (Service Assignments)
    # ------------------------------------------------------------------

    @staticmethod
    @transaction.atomic
    def assign_service_to_provider(*, provider, service_id, custom_duration_minutes=None, custom_price=None):
        """
        Assign a Service to a ProviderProfile.
        Validates:
          - service belongs to the same organization as provider
          - assignment is not a duplicate
        """
        provider = ProviderService_._lock_assignment_provider(provider)
        try:
            service = Service.objects.get(id=service_id, is_active=True)
        except Service.DoesNotExist:
            raise ApplicationError(
                message="Active service not found.",
                code="SERVICE_NOT_FOUND",
                status_code=404
            )

        if service.organization_id != provider.organization.id:
            raise ServiceOrganizationMismatchException()

        if ProviderService.objects.filter(provider=provider, service=service).exists():
            raise DuplicateProviderServiceException()

        from .duration import protect_legacy_average
        protect_legacy_average(provider, extra_duration=custom_duration_minutes if custom_duration_minutes is not None else service.duration_minutes)
        return ProviderService.objects.create(
            provider=provider,
            service=service,
            custom_duration_minutes=custom_duration_minutes,
            custom_price=custom_price,
        )

    @staticmethod
    def _lock_assignment_provider(provider):
        """Shared with booking: provider first, then assignment; never reversed."""
        try:
            return ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership').get(
                pk=provider.pk, membership__organization_id=provider.membership.organization_id,
                membership__is_active=True, membership__role=OrganizationMembership.Role.PROVIDER,
            )
        except ProviderProfile.DoesNotExist:
            raise ApplicationError(message='Provider not found in this organization.', code='PROVIDER_NOT_FOUND', status_code=404)

    @staticmethod
    def _lock_assignment(provider, provider_service_id):
        try:
            return ProviderService.objects.select_for_update(of=('self',)).select_related('service').get(
                id=provider_service_id, provider=provider,
                service__organization_id=provider.membership.organization_id,
            )
        except ProviderService.DoesNotExist:
            raise ApplicationError(message='Provider service assignment not found.', code='PROVIDER_SERVICE_NOT_FOUND', status_code=404)

    @staticmethod
    @transaction.atomic
    def update_service_charge(*, provider, provider_service_id, custom_price):
        provider = ProviderService_._lock_assignment_provider(provider)
        assignment = ProviderService_._lock_assignment(provider, provider_service_id)
        assignment.custom_price = custom_price
        assignment.save(update_fields=['custom_price'])
        return assignment

    @staticmethod
    @transaction.atomic
    def remove_service_from_provider(*, provider, provider_service_id):
        provider = ProviderService_._lock_assignment_provider(provider)
        ps = ProviderService_._lock_assignment(provider, provider_service_id)
        from .duration import protect_legacy_average
        protect_legacy_average(provider, exclude_assignment_id=ps.pk)
        ps.delete()

    # ------------------------------------------------------------------
    # WeeklySchedule
    # ------------------------------------------------------------------

    @staticmethod
    def create_or_update_schedule(*, provider, day_of_week, start_time, end_time, is_working_day=True):
        """
        Upsert: create or fully update the schedule entry for a given day.
        """
        from .schedule_changes import validate_schedule
        with transaction.atomic():
            provider = ProviderProfile.objects.select_for_update().get(pk=provider.pk)
            if provider.application_status == 'APPROVED':
                raise ApplicationError(message='Approved schedules can only change through a manager-reviewed schedule request.', code='SCHEDULE_APPROVAL_REQUIRED')
            old = WeeklySchedule.objects.filter(provider=provider, day_of_week=day_of_week).first()
            breaks = [{'title': b.title, 'start_time': b.start_time.isoformat(), 'end_time': b.end_time.isoformat()} for b in old.breaks.all()] if old else []
            validate_schedule({'day_of_week': day_of_week, 'start_time': str(start_time), 'end_time': str(end_time), 'is_working_day': is_working_day, 'breaks': breaks})
            return WeeklySchedule.objects.update_or_create(provider=provider, day_of_week=day_of_week, defaults={'start_time': start_time, 'end_time': end_time, 'is_working_day': is_working_day})

    # ------------------------------------------------------------------
    # ScheduleBreak
    # ------------------------------------------------------------------

    @staticmethod
    @transaction.atomic
    def add_break(*, weekly_schedule, title, start_time, end_time):
        """
        Create a break on a weekly schedule day.
        Validates:
          - schedule is a working day
          - break lies entirely inside schedule working hours
          - break does not overlap another break on the same day
        """
        provider = ProviderProfile.objects.select_for_update().get(pk=weekly_schedule.provider_id)
        if provider.application_status == 'APPROVED':
            raise ApplicationError(message='Approved breaks require a schedule change request.', code='SCHEDULE_APPROVAL_REQUIRED')
        weekly_schedule = WeeklySchedule.objects.select_for_update().get(pk=weekly_schedule.pk)
        if end_time <= start_time:
            raise ApplicationError(message='Break end must be after its start.')
        if not weekly_schedule.is_working_day:
            raise BreakOnNonWorkingDayException()

        if start_time < weekly_schedule.start_time or end_time > weekly_schedule.end_time:
            raise BreakOutsideWorkingHoursException()

        overlapping = ScheduleBreak.objects.filter(
            weekly_schedule=weekly_schedule,
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exists()
        if overlapping:
            raise BreakOverlapException()

        return ScheduleBreak.objects.create(
            weekly_schedule=weekly_schedule,
            title=title,
            start_time=start_time,
            end_time=end_time,
        )

    # ------------------------------------------------------------------
    # ProviderLeave
    # ------------------------------------------------------------------

    @staticmethod
    def create_leave(*, provider, start_datetime, end_datetime, reason='', actor=None):
        from .leave_requests import LeaveRequestService
        return LeaveRequestService.submit(provider=provider, actor=actor,
            start_datetime=start_datetime, end_datetime=end_datetime, reason=reason)


ProviderBizService = ProviderService_
