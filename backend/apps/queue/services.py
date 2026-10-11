import random
from datetime import date, timedelta

from django.db import IntegrityError, models, transaction
from django.db.models import Max
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.appointments.services import (
    InvalidAppointmentTransitionException,
    get_project_tz,
)
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.audit.services import AuditService
from apps.notifications.services import NotificationService
from config.exceptions import ApplicationError

from .models import QueueEntry


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------

class QueueEntryAlreadyExistsException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'QUEUE_ENTRY_ALREADY_EXISTS'
    default_detail = 'This appointment is already in the queue.'


class InvalidQueueStateException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'INVALID_QUEUE_STATE'
    default_detail = 'This queue state transition is not allowed.'


class ActiveQueueCustomerException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'ACTIVE_QUEUE_CUSTOMER_EXISTS'
    default_detail = 'A customer is already active in the queue.'


class NoWaitingCustomerException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'NO_WAITING_CUSTOMER'
    default_detail = 'There is no waiting customer in the queue.'


class InvalidCheckInException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'INVALID_CHECK_IN'
    default_detail = 'This appointment cannot be checked in.'


class InvalidQueueDateException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'INVALID_QUEUE_DATE'
    default_detail = 'The queue date is invalid.'


def business_date_for_appointment(appointment: Appointment) -> date:
    """Derive queue business date from appointment start using project TIME_ZONE."""
    return appointment.appointment_date or timezone.localtime(appointment.start_datetime, get_project_tz()).date()


def current_business_date() -> date:
    return timezone.localtime(timezone.now(), get_project_tz()).date()


def _load_org(organization_id) -> Organization:
    try:
        return Organization.objects.get(
            id=organization_id,
            is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED
        )
    except Organization.DoesNotExist:
        raise ApplicationError(
            message='Organization not found.',
            code='ORGANIZATION_NOT_FOUND',
            status_code=404,
        )


def _load_provider(*, organization: Organization, provider_id) -> ProviderProfile:
    try:
        provider = ProviderProfile.objects.select_related(
            'membership__organization', 'membership__user'
        ).get(
            id=provider_id,
            membership__organization=organization,
            membership__is_active=True,
            membership__role=OrganizationMembership.Role.PROVIDER,
        )
    except ProviderProfile.DoesNotExist:
        raise ApplicationError(
            message='Provider not found in this organization.',
            code='PROVIDER_NOT_FOUND',
            status_code=404,
        )
    if not provider.is_operationally_active:
        raise ApplicationError(
            message='Provider is not operationally active.',
            code='PROVIDER_INACTIVE',
            status_code=400,
        )
    return provider



class QueueService:
    """
    Queue business logic: check-in/token generation, call-next, start, complete, skip.
    """

    # ------------------------------------------------------------------
    # Check-in → QueueEntry WAITING
    # ------------------------------------------------------------------

    @classmethod
    def check_in_appointment(cls, *, appointment: Appointment, actor=None, bypass_window=False) -> QueueEntry:
        """
        Atomically:
          Mark appointment CONFIRMED -> CHECKED_IN
          Mark QueueEntry is_checked_in = True, checked_in_at = now()
        """
        with transaction.atomic():
            try:
                provider = (
                    ProviderProfile.objects.select_for_update(of=('self',))
                    .select_related('membership__organization')
                    .get(
                        pk=appointment.provider_id,
                        membership__is_active=True,
                        membership__role=OrganizationMembership.Role.PROVIDER,
                    )
                )
            except ProviderProfile.DoesNotExist:
                raise InvalidCheckInException(
                    message='Appointment provider is not an active provider.'
                )
            if not (appointment.organization.is_active and appointment.organization.verification_status == Organization.VerificationStatus.APPROVED):
                raise InvalidCheckInException(
                    message='Organization is not operational.'
                )
            if not provider.is_operationally_active:
                raise InvalidCheckInException(
                    message='Appointment provider is not operationally active.'
                )

            # Shared lock order: provider, existing queue entry, appointment.
            entry = QueueEntry.objects.select_for_update().filter(appointment_id=appointment.pk).first()
            appointment = Appointment.objects.select_for_update().get(pk=appointment.pk)

            if appointment.status in (
                Appointment.Status.COMPLETED,
                Appointment.Status.CANCELLED,
                Appointment.Status.NO_SHOW,
            ):
                raise InvalidCheckInException(
                    message=f'Cannot check in an appointment in status {appointment.status}.'
                )

            # Check-in business date validation
            appt_date = appointment.appointment_date or business_date_for_appointment(appointment)
            today_date = current_business_date()
            if appt_date > today_date:
                raise InvalidCheckInException(
                    message=f'Cannot check in today ({today_date}). Appointment is scheduled for {appt_date}.'
                )

            if entry and entry.status not in (QueueEntry.Status.WAITING, QueueEntry.Status.CALLED, QueueEntry.Status.IN_PROGRESS):
                raise InvalidCheckInException(message='This queue entry is not eligible for check-in.')
            if entry and entry.is_checked_in:
                entry.appointment = appointment
                return entry
            if not bypass_window and actor and hasattr(actor, 'id') and actor.id == appointment.customer_id:
                if entry:
                    readiness = cls.calculate_readiness_and_eta(entry)
                    if not readiness.get('can_check_in', True):
                        raise InvalidCheckInException(
                            message='Check-in is not open yet for this appointment.'
                        )
            now = timezone.now()

            if entry:
                if entry.is_checked_in:
                    return entry  # Already checked in, idempotent return
                entry.is_checked_in = True
                entry.checked_in_at = now
                entry.save(update_fields=['is_checked_in', 'checked_in_at', 'updated_at'])
            else:
                queue_date = appt_date
                serial_num = appointment.serial_number
                if not serial_num:
                    from apps.appointments.serials import allocate_serial
                    serial_num = allocate_serial(provider, queue_date)
                appointment.serial_number = serial_num
                appointment.appointment_date = queue_date
                appointment.save(update_fields=['serial_number', 'appointment_date', 'updated_at'])

                entry = QueueEntry.objects.create(
                    organization_id=appointment.organization_id,
                    appointment=appointment,
                    provider=provider,
                    queue_date=queue_date,
                    serial_number=serial_num,
                    token_number=serial_num,
                    status=QueueEntry.Status.WAITING,
                    is_checked_in=True,
                    checked_in_at=now,
                )

            if appointment.status == Appointment.Status.CONFIRMED:
                appointment.status = Appointment.Status.CHECKED_IN
                appointment.save(update_fields=['status', 'updated_at'])

            if entry:
                entry.appointment = appointment

            NotificationService.create(
                recipient=appointment.customer,
                organization=appointment.organization,
                kind='APPOINTMENT_CHECKED_IN',
                title='Appointment checked in',
                message=f'You are checked in with Serial #{entry.serial_number}.',
                appointment=appointment,
                queue_entry=entry,
            )
            if provider.membership and provider.membership.user:
                NotificationService.create(
                    recipient=provider.membership.user,
                    organization=appointment.organization,
                    kind='PROVIDER_CHECKED_IN',
                    title='Customer checked in',
                    message=f'{appointment.customer.get_full_name() or appointment.customer.email} checked in for Serial #{entry.serial_number}.',
                    appointment=appointment,
                    queue_entry=entry,
                )
            AuditService.record(
                action='APPOINTMENT_CHECKED_IN', entity_type='QueueEntry', entity_id=entry.id,
                organization_id=entry.organization_id, actor=actor or appointment.customer,
                metadata={'serial_number': entry.serial_number},
            )
            return entry

    # ------------------------------------------------------------------
    # Listing helpers
    # ------------------------------------------------------------------

    @classmethod
    def list_provider_queue(cls, *, organization_id, provider_id, on_date: date | None = None):
        organization = _load_org(organization_id)
        provider = _load_provider(organization=organization, provider_id=provider_id)
        queue_date = on_date or current_business_date()
        entries = (
            QueueEntry.objects.filter(
                organization=organization,
                provider=provider,
                queue_date=queue_date,
            )
            .select_related(
                'appointment',
                'appointment__customer',
                'appointment__service',
                'provider',
                'provider__membership__user',
            )
            .order_by('serial_number')
        )
        return provider, queue_date, entries

    # ------------------------------------------------------------------
    # call_next
    # ------------------------------------------------------------------

    @classmethod
    def call_next(cls, *, organization_id, provider_id, on_date: date | None = None, actor=None) -> QueueEntry:
        organization = _load_org(organization_id)
        queue_date = on_date or current_business_date()

        with transaction.atomic():
            if queue_date > current_business_date():
                raise InvalidQueueDateException(message='A future booking-date queue cannot be called yet.')
            provider = _load_provider(organization=organization, provider_id=provider_id)
            ProviderProfile.objects.select_for_update().get(pk=provider.pk)

            active = QueueEntry.objects.filter(
                provider=provider,
                status__in=QueueEntry.ACTIVE_STATUSES,
            ).exists()
            if active:
                raise ActiveQueueCustomerException()

            # Presence-gated ascending serials; the active guard spans booking dates.
            next_waiting = (
                QueueEntry.objects.select_for_update(of=('self',))
                .filter(
                    provider=provider,
                    queue_date=queue_date,
                    status=QueueEntry.Status.WAITING,
                    is_checked_in=True,
                    appointment__status__in=[Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN],
                )
                .order_by('serial_number')
                .first()
            )
            if next_waiting is None:
                raise NoWaitingCustomerException()

            now = timezone.now()
            next_waiting.status = QueueEntry.Status.CALLED
            next_waiting.called_at = now
            next_waiting.save(update_fields=['status', 'called_at', 'updated_at'])
            next_waiting = QueueEntry.objects.select_related('appointment', 'appointment__customer').get(pk=next_waiting.pk)
            NotificationService.create(
                recipient=next_waiting.appointment.customer,
                organization=organization,
                kind='QUEUE_CALLED',
                title='Your queue turn is called',
                message=f'Serial #{next_waiting.serial_number} has been called.',
                appointment=next_waiting.appointment,
                queue_entry=next_waiting,
            )
            AuditService.record(
                action='QUEUE_CALLED', entity_type='QueueEntry', entity_id=next_waiting.id,
                organization_id=organization.id, actor=actor or provider.membership.user,
                metadata={'serial_number': next_waiting.serial_number},
            )
            return next_waiting

    @classmethod
    def register_walk_in(
        cls,
        *,
        organization_id,
        provider_id,
        service_id,
        first_name: str,
        last_name: str,
        phone_number: str = '',
        notes: str = '',
        actor=None,
        customer_id=None,
        appointment_date=None,
        booking_channel=Appointment.BookingChannel.FRONT_DESK,
    ) -> Appointment:
        from apps.accounts.models import User
        from apps.appointments.services import AppointmentService

        with transaction.atomic():
            from apps.appointments.contacts import normalize_contact_phone
            from django.core.exceptions import ValidationError
            try:
                phone_number = normalize_contact_phone(phone_number) if phone_number else ''
            except ValidationError as exc:
                raise ApplicationError(message=' '.join(exc.messages))
            if customer_id:
                try:
                    user = User.objects.get(pk=customer_id, is_active=True)
                except User.DoesNotExist:
                    raise ApplicationError(message='Customer not found.', status_code=404)
            else:
                # A shared contact phone does not establish account ownership.
                if phone_number and User.objects.filter(phone_number=phone_number).exists():
                    raise ApplicationError(message='Confirm the existing customer ID for this phone before booking.', code='CUSTOMER_ID_REQUIRED')
                import uuid
                user = User.objects.create_user(email=f'walkin.{uuid.uuid4().hex}@smartqueue.local', first_name=first_name, last_name=last_name, phone_number=phone_number)
                user.set_unusable_password()
                user.save(update_fields=['password'])
            today = appointment_date or current_business_date()
            appt = AppointmentService.book_appointment(
                organization_id=organization_id,
                customer=user,
                provider_id=provider_id,
                service_id=service_id,
                appointment_date=today,
                booking_channel=booking_channel,
                arrival_type=Appointment.ArrivalType.WALK_IN if booking_channel == Appointment.BookingChannel.FRONT_DESK else Appointment.ArrivalType.SCHEDULED,
                notes=notes,
                contact_name=f'{first_name} {last_name}'.strip(),
                contact_phone=phone_number if phone_number else None,
            )
            return appt

    @classmethod
    def reconcile_stale_historical_queue_entries(cls) -> int:
        """Compatibility no-op: midnight never authorizes lifecycle mutation."""
        return 0

    @classmethod
    def calculate_readiness_and_eta(cls, queue_entry: QueueEntry) -> dict:
        now = timezone.now()
        today = current_business_date()

        if queue_entry.status == QueueEntry.Status.COMPLETED:
            return {
                'readiness_state': 'COMPLETED',
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'now_serving_serial': None,
                'can_check_in': False,
                'check_in_available_at': None,
            }
        if queue_entry.status == QueueEntry.Status.SKIPPED:
            return {
                'readiness_state': 'SKIPPED',
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'now_serving_serial': None,
                'can_check_in': False,
                'check_in_available_at': None,
            }
        if queue_entry.status in (QueueEntry.Status.CANCELLED, QueueEntry.Status.NO_SHOW):
            return {
                'readiness_state': queue_entry.status,
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'now_serving_serial': None,
                'can_check_in': False,
                'check_in_available_at': None,
            }

        # Temporal classification: future or historical queue entries must NOT return active readiness guidance
        if queue_entry.queue_date > today:
            service_dur = 15
            if queue_entry.appointment and queue_entry.appointment.service:
                service_dur = queue_entry.appointment.service.duration_minutes or 15
            appt_start = queue_entry.appointment.start_datetime if queue_entry.appointment else None
            est_start = appt_start or now
            est_end = est_start + timedelta(minutes=service_dur)
            rec_arrival = (appt_start - timedelta(minutes=15)) if appt_start else est_start
            chk_avail = (rec_arrival - timedelta(minutes=30)) if rec_arrival else est_start
            return {
                'readiness_state': QueueEntry.ReadinessState.NOT_YET,
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'estimated_start_time': est_start.isoformat(),
                'estimated_end_time': est_end.isoformat(),
                'recommended_arrival_time': rec_arrival.isoformat(),
                'now_serving_serial': None,
                'can_check_in': False,
                'check_in_available_at': chk_avail.isoformat(),
            }

        if queue_entry.queue_date < today and queue_entry.status not in QueueEntry.ACTIVE_STATUSES:
            return {
                'readiness_state': QueueEntry.ReadinessState.NOT_YET,
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'now_serving_serial': None,
                'can_check_in': False,
                'check_in_available_at': None,
            }

        service_dur = 15
        if queue_entry.appointment and queue_entry.appointment.service:
            service_dur = queue_entry.appointment.service.duration_minutes or 15

        appt_start = queue_entry.appointment.start_datetime if queue_entry.appointment else None

        # Check provider active consultation or activity today
        in_prog_entry = QueueEntry.objects.filter(
            provider=queue_entry.provider,
            status=QueueEntry.Status.IN_PROGRESS,
        ).order_by('-started_at', '-updated_at').first()

        active_entry = in_prog_entry or QueueEntry.objects.filter(
            provider=queue_entry.provider,
            status=QueueEntry.Status.CALLED,
        ).order_by('-called_at', '-updated_at').first()

        provider_has_started = (
            active_entry is not None or
            QueueEntry.objects.filter(
                provider=queue_entry.provider,
                queue_date=today,
                status__in=[QueueEntry.Status.COMPLETED, QueueEntry.Status.IN_PROGRESS, QueueEntry.Status.CALLED]
            ).exists()
        )

        if queue_entry.status == QueueEntry.Status.IN_PROGRESS:
            started_at_dt = queue_entry.started_at or now
            elapsed_mins = max(0.0, (now - started_at_dt).total_seconds() / 60.0)
            remaining_mins = max(0, int(round(service_dur - elapsed_mins)))
            est_comp_dt = started_at_dt + timedelta(minutes=service_dur)
            return {
                'readiness_state': QueueEntry.ReadinessState.IN_SERVICE,
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'estimated_start_time': None,  # Suppress stale pending start window for active consultation
                'estimated_end_time': est_comp_dt.isoformat(),
                'actual_started_at': started_at_dt.isoformat(),
                'estimated_completion_at': est_comp_dt.isoformat(),
                'remaining_service_minutes': remaining_mins,
                'recommended_arrival_time': None,
                'now_serving_serial': queue_entry.serial_number,
                'can_check_in': False,
                'check_in_available_at': None,
                'is_delayed': False,
                'provider_has_started': True,
                'queue_status_text': 'Service in Progress',
            }

        if queue_entry.status == QueueEntry.Status.CALLED:
            est_start = queue_entry.called_at or now
            est_end = est_start + timedelta(minutes=service_dur)
            return {
                'readiness_state': QueueEntry.ReadinessState.TURN_NOW,
                'scheduled_ahead': 0,
                'checked_in_ahead': 0,
                'people_ahead': 0,
                'estimated_wait_minutes': 0,
                'estimated_start_time': est_start.isoformat(),
                'estimated_end_time': est_end.isoformat(),
                'actual_started_at': None,
                'estimated_completion_at': None,
                'remaining_service_minutes': None,
                'recommended_arrival_time': None,
                'now_serving_serial': queue_entry.serial_number,
                'can_check_in': False,
                'check_in_available_at': None,
                'is_delayed': False,
                'provider_has_started': True,
                'queue_status_text': 'Called for Consultation',
            }

        active_remaining = 0
        if active_entry and active_entry.pk != queue_entry.pk:
            dur = 15
            if active_entry.appointment and active_entry.appointment.service:
                dur = active_entry.appointment.service.duration_minutes or 15
            if active_entry.started_at:
                elapsed = (now - active_entry.started_at).total_seconds() / 60.0
                active_remaining = max(0, int(round(dur - elapsed)))
            else:
                active_remaining = dur

        # Query preceding non-terminal entries for this provider/date
        base_preceding = QueueEntry.objects.filter(
            provider=queue_entry.provider,
            queue_date=queue_entry.queue_date,
            status=QueueEntry.Status.WAITING,
        ).exclude(
            appointment__status__in=[
                Appointment.Status.COMPLETED,
                Appointment.Status.CANCELLED,
                Appointment.Status.NO_SHOW,
            ]
        )

        preceding_qs = base_preceding.filter(serial_number__lt=queue_entry.serial_number)

        scheduled_ahead = preceding_qs.count()
        checked_in_ahead = preceding_qs.filter(is_checked_in=True).count()
        people_ahead = checked_in_ahead + (1 if (active_entry and active_entry.pk != queue_entry.pk) else 0)

        scheduled_ahead_wait = 0
        for entry in preceding_qs.select_related('appointment__service'):
            dur = 15
            if entry.appointment and entry.appointment.service:
                dur = entry.appointment.service.duration_minutes or 15
            scheduled_ahead_wait += dur

        total_est_wait = active_remaining + scheduled_ahead_wait
        dynamic_start = now + timedelta(minutes=total_est_wait)

        if appt_start:
            if now < appt_start:
                est_start = max(appt_start, dynamic_start)
            else:
                est_start = dynamic_start
        else:
            est_start = dynamic_start

        est_end = est_start + timedelta(minutes=service_dur)
        rec_arrival = est_start - timedelta(minutes=15)
        check_in_available_at = est_start - timedelta(hours=6)

        is_confirmed = (queue_entry.appointment.status in (Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN)) if queue_entry.appointment else True
        can_check_in = bool(
            not queue_entry.is_checked_in and
            is_confirmed
        )

        rec_arrival_iso = None if queue_entry.is_checked_in else rec_arrival.isoformat()

        if provider_has_started:
            is_delayed = bool(appt_start and est_start > appt_start + timedelta(minutes=20))
            queue_status_text = 'Running Behind Schedule' if is_delayed else 'Normal Operational Pace'
            est_start_iso = est_start.isoformat()
            est_wait_mins = int(round(total_est_wait))
        else:
            is_delayed = bool(appt_start and now > appt_start + timedelta(minutes=20))
            if is_delayed:
                queue_status_text = 'Running Behind Schedule'
                est_start_iso = None
                est_wait_mins = None
            elif appt_start and now < appt_start:
                queue_status_text = 'Service scheduled for later today'
                est_start_iso = est_start.isoformat()
                est_wait_mins = int(round(total_est_wait))
            else:
                queue_status_text = 'Normal Operational Pace'
                est_start_iso = est_start.isoformat()
                est_wait_mins = int(round(total_est_wait))

        time_until_start = (est_start - now).total_seconds() / 60.0

        if queue_entry.is_checked_in and checked_in_ahead == 0:
            readiness = QueueEntry.ReadinessState.BE_READY
        elif checked_in_ahead <= 2 or (time_until_start <= 45 and time_until_start > 15):
            readiness = QueueEntry.ReadinessState.GET_READY
        elif time_until_start <= 15:
            readiness = QueueEntry.ReadinessState.BE_READY
        else:
            readiness = QueueEntry.ReadinessState.NOT_YET

        return {
            'readiness_state': readiness,
            'scheduled_ahead': scheduled_ahead,
            'checked_in_ahead': checked_in_ahead,
            'people_ahead': people_ahead,
            'estimated_wait_minutes': est_wait_mins,
            'estimated_start_time': est_start_iso,
            'estimated_end_time': est_end.isoformat(),
            'actual_started_at': None,
            'estimated_completion_at': None,
            'remaining_service_minutes': None,
            'recommended_arrival_time': rec_arrival_iso,
            'now_serving_serial': active_entry.serial_number if active_entry else None,
            'can_check_in': can_check_in,
            'check_in_available_at': check_in_available_at.isoformat(),
            'is_delayed': is_delayed,
            'provider_has_started': provider_has_started,
            'queue_status_text': queue_status_text,
        }

    # ------------------------------------------------------------------
    # start / complete / skip
    # ------------------------------------------------------------------

    @classmethod
    def start_queue_entry(cls, *, organization_id, queue_entry_id, actor=None) -> QueueEntry:
        organization = _load_org(organization_id)

        with transaction.atomic():
            entry = cls._lock_entry(organization=organization, queue_entry_id=queue_entry_id)
            provider = ProviderProfile.objects.select_for_update().get(pk=entry.provider_id)
            # Re-bind after provider lock for serialization with call_next/check-in.
            entry = QueueEntry.objects.select_for_update(of=('self',)).select_related('appointment').get(
                pk=entry.pk, organization=organization
            )

            if QueueEntry.objects.filter(provider=provider, status__in=QueueEntry.ACTIVE_STATUSES).exclude(pk=entry.pk).exists():
                raise ActiveQueueCustomerException()
            if not entry.can_transition_to(QueueEntry.Status.IN_PROGRESS):
                raise InvalidQueueStateException(
                    message=f'Cannot start queue entry in status {entry.status}.',
                )

            appointment = Appointment.objects.select_for_update().get(pk=entry.appointment_id)
            if appointment.status != Appointment.Status.CHECKED_IN:
                if not appointment.can_transition_to(Appointment.Status.IN_PROGRESS):
                    raise InvalidAppointmentTransitionException(
                        message=(
                            f'Cannot set appointment to IN_PROGRESS '
                            f'from {appointment.status}.'
                        ),
                    )

            now = timezone.now()
            entry.status = QueueEntry.Status.IN_PROGRESS
            entry.started_at = now
            entry.save(update_fields=['status', 'started_at', 'updated_at'])

            appointment.status = Appointment.Status.IN_PROGRESS
            appointment.save(update_fields=['status', 'updated_at'])
            AuditService.record(
                action='QUEUE_STARTED', entity_type='QueueEntry', entity_id=entry.id,
                organization_id=organization.id, actor=actor or provider.membership.user,
                metadata={},
            )
            return entry

    @classmethod
    def complete_queue_entry(cls, *, organization_id, queue_entry_id, actor=None) -> QueueEntry:
        organization = _load_org(organization_id)

        with transaction.atomic():
            entry = cls._lock_entry(organization=organization, queue_entry_id=queue_entry_id)
            provider = ProviderProfile.objects.select_for_update().select_related('membership__user').get(pk=entry.provider_id)
            entry = QueueEntry.objects.select_for_update(of=('self',)).select_related('appointment').get(
                pk=entry.pk, organization=organization
            )

            if not entry.can_transition_to(QueueEntry.Status.COMPLETED):
                raise InvalidQueueStateException(
                    message=f'Cannot complete queue entry in status {entry.status}.',
                )

            appointment = Appointment.objects.select_for_update().get(pk=entry.appointment_id)
            if appointment.status != Appointment.Status.IN_PROGRESS:
                raise InvalidAppointmentTransitionException(
                    message=(
                        f'Cannot set appointment to COMPLETED from {appointment.status}.'
                    ),
                )

            now = timezone.now()
            entry.status = QueueEntry.Status.COMPLETED
            entry.completed_at = now
            entry.save(update_fields=['status', 'completed_at', 'updated_at'])

            appointment.status = Appointment.Status.COMPLETED
            appointment.save(update_fields=['status', 'updated_at'])
            entry.appointment = appointment
            NotificationService.create(
                recipient=appointment.customer,
                organization=organization,
                kind='SERVICE_COMPLETED',
                title='Service completed',
                message='Your appointment has been completed.',
                appointment=appointment,
                queue_entry=entry,
            )
            AuditService.record(
                action='QUEUE_COMPLETED', entity_type='QueueEntry', entity_id=entry.id,
                organization_id=organization.id, actor=actor or provider.membership.user,
                metadata={},
            )
            return entry

    @classmethod
    def skip_queue_entry(cls, *, organization_id, queue_entry_id, actor=None) -> QueueEntry:
        """
        CALLED → SKIPPED.
        The linked appointment becomes NO_SHOW so it does not remain stuck.
        Does not automatically call the next customer.
        """
        organization = _load_org(organization_id)

        with transaction.atomic():
            entry = cls._lock_entry(organization=organization, queue_entry_id=queue_entry_id)
            provider = ProviderProfile.objects.select_for_update().select_related('membership__user').get(pk=entry.provider_id)
            entry = QueueEntry.objects.select_for_update(of=('self',)).select_related('appointment').get(
                pk=entry.pk, organization=organization
            )

            if not entry.can_transition_to(QueueEntry.Status.SKIPPED):
                raise InvalidQueueStateException(
                    message=f'Cannot skip queue entry in status {entry.status}.',
                )

            now = timezone.now()
            entry.status = QueueEntry.Status.SKIPPED
            entry.skipped_at = now
            entry.save(update_fields=['status', 'skipped_at', 'updated_at'])

            appointment = Appointment.objects.select_for_update().get(pk=entry.appointment_id)
            if not appointment.can_transition_to(Appointment.Status.NO_SHOW):
                raise InvalidAppointmentTransitionException(
                    message=f'Cannot set appointment to NO_SHOW from {appointment.status}.',
                )
            appointment.status = Appointment.Status.NO_SHOW
            appointment.save(update_fields=['status', 'updated_at'])
            entry.appointment = appointment

            NotificationService.create(
                recipient=appointment.customer,
                organization=organization,
                kind='QUEUE_SKIPPED',
                title='Queue token skipped',
                message=f'Your queue token {entry.token_number} was skipped.',
                appointment=appointment,
                queue_entry=entry,
            )
            AuditService.record(
                action='QUEUE_SKIPPED', entity_type='QueueEntry', entity_id=entry.id,
                organization_id=organization.id, actor=actor or provider.membership.user,
                metadata={'appointment_status': Appointment.Status.NO_SHOW},
            )
            return entry

    @staticmethod
    def _lock_entry(*, organization: Organization, queue_entry_id) -> QueueEntry:
        try:
            return QueueEntry.objects.select_related(
                'appointment', 'provider', 'appointment__customer', 'appointment__service'
            ).get(id=queue_entry_id, organization=organization)
        except QueueEntry.DoesNotExist:
            raise ApplicationError(
                message='Queue entry not found.',
                code='QUEUE_ENTRY_NOT_FOUND',
                status_code=404,
            )

    @classmethod
    def restore_queue_entry(cls, *, organization_id, queue_entry_id, actor=None):
        from .permissions import _is_org_staff, _is_org_manager
        if not (_is_org_staff(actor, organization_id) or _is_org_manager(actor, organization_id)):
            raise ApplicationError(message='Only authorized staff or managers may restore a skipped customer.', status_code=403)
        organization = _load_org(organization_id)
        with transaction.atomic():
            entry = cls._lock_entry(organization=organization, queue_entry_id=queue_entry_id)
            ProviderProfile.objects.select_for_update().get(pk=entry.provider_id)
            entry = QueueEntry.objects.select_for_update().get(pk=entry.pk)
            appointment = Appointment.objects.select_for_update().get(pk=entry.appointment_id)
            if entry.status == 'WAITING' and appointment.status == 'CHECKED_IN' and entry.is_checked_in:
                entry.appointment = appointment
                return entry
            if entry.status != 'SKIPPED' or appointment.status != 'NO_SHOW':
                raise InvalidQueueStateException(message='Only a skipped appointment can be restored.')
            if Appointment.objects.filter(provider_id=entry.provider_id, customer_id=appointment.customer_id, appointment_date=entry.queue_date, status__in=Appointment.BLOCKING_STATUSES).exclude(pk=appointment.pk).exists():
                raise InvalidQueueStateException(message='This customer already has another active booking for this provider and date.')
            entry.status = 'WAITING'
            entry.is_checked_in = True
            entry.checked_in_at = timezone.now()
            entry.called_at = None
            entry.save(update_fields=['status', 'is_checked_in', 'checked_in_at', 'called_at', 'updated_at'])
            appointment.status = 'CHECKED_IN'
            appointment.save(update_fields=['status', 'updated_at'])
            entry.appointment = appointment
            AuditService.record(action='QUEUE_RESTORED', entity_type='QueueEntry', entity_id=entry.pk, organization_id=organization.pk, actor=actor, metadata={'serial_number': entry.serial_number, 'booking_date': str(entry.queue_date), 'previous_skipped_at': str(entry.skipped_at)})
            return entry
