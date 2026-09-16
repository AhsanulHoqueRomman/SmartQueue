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
    def create_provider_profile(*, organization, membership_id, bio='', title=''):
        """
        Create a ProviderProfile.
        Validates:
          - membership exists within organization
          - membership.role == PROVIDER
          - no existing ProviderProfile for that membership
        """
        try:
            membership = OrganizationMembership.objects.get(
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
            is_active=True,
        )

    @staticmethod
    def update_provider_profile(*, profile, bio=None, title=None, is_active=None):
        if bio is not None:
            profile.bio = bio
        if title is not None:
            profile.title = title
        if is_active is not None:
            profile.is_active = is_active
        profile.save()
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
    def approve_application(*, provider_profile, manager_user):
        """
        Manager approves a pending provider application.
        Sets profile application_status=APPROVED and membership is_active=True.
        """
        with transaction.atomic():
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
                organization_id=document.provider.organization.id,
                actor=reviewer_user,
                metadata={'status': status, 'rejection_reason': document.rejection_reason}
            )
            return document


    # ------------------------------------------------------------------
    # ProviderService (Service Assignments)
    # ------------------------------------------------------------------

    @staticmethod
    def assign_service_to_provider(*, provider, service_id, custom_duration_minutes=None, custom_price=None):
        """
        Assign a Service to a ProviderProfile.
        Validates:
          - service belongs to the same organization as provider
          - assignment is not a duplicate
        """
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

        return ProviderService.objects.create(
            provider=provider,
            service=service,
            custom_duration_minutes=custom_duration_minutes,
            custom_price=custom_price,
        )

    @staticmethod
    def remove_service_from_provider(*, provider, provider_service_id):
        try:
            ps = ProviderService.objects.get(id=provider_service_id, provider=provider)
        except ProviderService.DoesNotExist:
            raise ApplicationError(
                message="Provider service assignment not found.",
                code="PROVIDER_SERVICE_NOT_FOUND",
                status_code=404
            )
        ps.delete()

    # ------------------------------------------------------------------
    # WeeklySchedule
    # ------------------------------------------------------------------

    @staticmethod
    def create_or_update_schedule(*, provider, day_of_week, start_time, end_time, is_working_day=True):
        """
        Upsert: create or fully update the schedule entry for a given day.
        """
        schedule, created = WeeklySchedule.objects.update_or_create(
            provider=provider,
            day_of_week=day_of_week,
            defaults={
                'start_time': start_time,
                'end_time': end_time,
                'is_working_day': is_working_day,
            }
        )
        return schedule, created

    # ------------------------------------------------------------------
    # ScheduleBreak
    # ------------------------------------------------------------------

    @staticmethod
    def add_break(*, weekly_schedule, title, start_time, end_time):
        """
        Create a break on a weekly schedule day.
        Validates:
          - schedule is a working day
          - break lies entirely inside schedule working hours
          - break does not overlap another break on the same day
        """
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
    def create_leave(*, provider, start_datetime, end_datetime, reason=''):
        return ProviderLeave.objects.create(
            provider=provider,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            reason=reason,
        )
