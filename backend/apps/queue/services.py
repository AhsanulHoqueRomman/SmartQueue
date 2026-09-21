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
    return timezone.localtime(appointment.start_datetime, get_project_tz()).date()


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
    def check_in_appointment(cls, *, appointment: Appointment, actor=None) -> QueueEntry:
        """
        Atomically:
          Mark appointment CONFIRMED -> CHECKED_IN
          Mark QueueEntry is_checked_in = True, checked_in_at = now()
        """
        with transaction.atomic():
            try:
                provider = (
                    ProviderProfile.objects.select_for_update()
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

            # Re-fetch appointment under lock
            appointment = Appointment.objects.select_for_update().get(pk=appointment.pk)

            if appointment.status in (
                Appointment.Status.COMPLETED,
                Appointment.Status.CANCELLED,
                Appointment.Status.NO_SHOW,
            ):
                raise InvalidCheckInException(
                    message=f'Cannot check in an appointment in status {appointment.status}.'
                )

            # Look for existing QueueEntry
            entry = QueueEntry.objects.filter(appointment=appointment).first()
            now = timezone.now()

            if entry:
                if entry.is_checked_in:
                    return entry  # Already checked in, idempotent return
                entry.is_checked_in = True
                entry.checked_in_at = now
                entry.save(update_fields=['is_checked_in', 'checked_in_at', 'updated_at'])
            else:
                queue_date = business_date_for_appointment(appointment)
                serial_num = appointment.serial_number
                if not serial_num:
                    max_serial = (
                        QueueEntry.objects.filter(provider=provider, queue_date=queue_date)
                        .aggregate(m=Max('serial_number'))['m'] or 0
                    )
                    serial_num = max_serial + 1
                    appointment.serial_number = serial_num

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
            .order_by('-is_urgent', 'serial_number')
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
            provider = _load_provider(organization=organization, provider_id=provider_id)
            ProviderProfile.objects.select_for_update().get(pk=provider.pk)

            active = QueueEntry.objects.filter(
                provider=provider,
                queue_date=queue_date,
                status__in=QueueEntry.ACTIVE_STATUSES,
            ).exists()
            if active:
                raise ActiveQueueCustomerException()

            # Under Phase 5 serial model: call next checked-in waiting customer (urgent first)
            next_waiting = (
                QueueEntry.objects.select_for_update()
                .filter(
                    provider=provider,
                    queue_date=queue_date,
                    status=QueueEntry.Status.WAITING,
                    is_checked_in=True,
                    appointment__status__in=[Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN],
                )
                .order_by('-is_urgent', 'serial_number')
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
    def mark_urgent(cls, *, organization_id, queue_entry_id, reason='', actor=None) -> QueueEntry:
        organization = _load_org(organization_id)
        with transaction.atomic():
            entry = cls._lock_entry(organization=organization, queue_entry_id=queue_entry_id)
            entry.is_urgent = True
            entry.urgent_reason = reason or 'Marked urgent by staff/provider'
            entry.save(update_fields=['is_urgent', 'urgent_reason', 'updated_at'])
            AuditService.record(
                action='QUEUE_MARKED_URGENT', entity_type='QueueEntry', entity_id=entry.id,
                organization_id=organization.id, actor=actor,
                metadata={'reason': entry.urgent_reason},
            )
            return entry

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
    ) -> Appointment:
        from apps.accounts.models import User
        from apps.appointments.services import AppointmentService

        with transaction.atomic():
            # Create or fetch guest customer
            email_fallback = f"walkin.{int(timezone.now().timestamp())}.{random.randint(100, 999)}@smartqueue.local"
            user, _ = User.objects.get_or_create(
                phone_number=phone_number if phone_number else email_fallback,
                defaults={
                    'email': email_fallback,
                    'first_name': first_name,
                    'last_name': last_name,
                    'is_active': True,
                }
            )

            start_dt = timezone.now() + timedelta(seconds=5)
            appt = AppointmentService.book_appointment(
                organization_id=organization_id,
                customer=user,
                provider_id=provider_id,
                service_id=service_id,
                start_datetime=start_dt,
                booking_channel=Appointment.BookingChannel.FRONT_DESK,
                arrival_type=Appointment.ArrivalType.WALK_IN,
                notes=notes,
            )
            return appt

    @classmethod
    def calculate_readiness_and_eta(cls, queue_entry: QueueEntry) -> dict:
        if queue_entry.status == QueueEntry.Status.COMPLETED:
            return {'readiness_state': 'COMPLETED', 'people_ahead': 0, 'estimated_wait_minutes': 0}
        if queue_entry.status == QueueEntry.Status.SKIPPED:
            return {'readiness_state': 'SKIPPED', 'people_ahead': 0, 'estimated_wait_minutes': 0}
        if queue_entry.status in (QueueEntry.Status.CANCELLED, QueueEntry.Status.NO_SHOW):
            return {'readiness_state': queue_entry.status, 'people_ahead': 0, 'estimated_wait_minutes': 0}
        if queue_entry.status in (QueueEntry.Status.IN_PROGRESS, QueueEntry.Status.CALLED):
            return {'readiness_state': QueueEntry.ReadinessState.TURN_NOW, 'people_ahead': 0, 'estimated_wait_minutes': 0}

        now = timezone.now()

        # Active entry in consultation / called
        active_entry = QueueEntry.objects.filter(
            provider=queue_entry.provider,
            queue_date=queue_entry.queue_date,
            status__in=[QueueEntry.Status.CALLED, QueueEntry.Status.IN_PROGRESS],
        ).select_related('appointment__service').first()

        active_remaining = 0
        if active_entry:
            dur = 15
            if active_entry.appointment and active_entry.appointment.service:
                dur = active_entry.appointment.service.duration_minutes or 15
            if active_entry.started_at:
                elapsed = (now - active_entry.started_at).total_seconds() / 60.0
                active_remaining = max(0, int(round(dur - elapsed)))
            else:
                active_remaining = dur

        # Query preceding waiting entries according to effective queue ordering (-is_urgent, serial_number)
        if queue_entry.is_urgent:
            ahead_qs = QueueEntry.objects.filter(
                provider=queue_entry.provider,
                queue_date=queue_entry.queue_date,
                status=QueueEntry.Status.WAITING,
                is_checked_in=True,
                is_urgent=True,
                serial_number__lt=queue_entry.serial_number,
                appointment__status__in=[Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN],
            )
        else:
            ahead_qs = QueueEntry.objects.filter(
                provider=queue_entry.provider,
                queue_date=queue_entry.queue_date,
                status=QueueEntry.Status.WAITING,
                is_checked_in=True,
                appointment__status__in=[Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN],
            ).filter(
                models.Q(is_urgent=True) | models.Q(is_urgent=False, serial_number__lt=queue_entry.serial_number)
            )

        waiting_ahead_count = ahead_qs.count()
        people_ahead = waiting_ahead_count + (1 if active_entry else 0)

        waiting_ahead_minutes = 0
        for entry in ahead_qs.select_related('appointment__service'):
            dur = 15
            if entry.appointment and entry.appointment.service:
                dur = entry.appointment.service.duration_minutes or 15
            waiting_ahead_minutes += dur

        est_wait = active_remaining + waiting_ahead_minutes

        if people_ahead == 0:
            readiness = QueueEntry.ReadinessState.BE_READY
        elif people_ahead <= 2:
            readiness = QueueEntry.ReadinessState.GET_READY
        else:
            readiness = QueueEntry.ReadinessState.NOT_YET

        est_start = now + timedelta(minutes=est_wait)
        rec_arrival = now + timedelta(minutes=max(0, est_wait - 15))

        return {
            'readiness_state': readiness,
            'people_ahead': people_ahead,
            'estimated_wait_minutes': est_wait,
            'estimated_start_time': est_start.isoformat(),
            'recommended_arrival_time': rec_arrival.isoformat(),
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
            entry = QueueEntry.objects.select_for_update().select_related('appointment').get(
                pk=entry.pk, organization=organization
            )

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
            entry = QueueEntry.objects.select_for_update().select_related('appointment').get(
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
            entry = QueueEntry.objects.select_for_update().select_related('appointment').get(
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
