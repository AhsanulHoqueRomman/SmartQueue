from apps.providers.emergency_read import operational_entries, operational_appointments, ensure_no_hold, ensure_not_replaced, ensure_not_interrupted, ordinary_resolution, decorate_readiness
import random
from datetime import date, timedelta

from django.db import IntegrityError, models, transaction
from django.db.models import Max
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.appointments.capacity import booking_date_filter
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
    # Check-in â†’ QueueEntry WAITING
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
            ensure_not_replaced(appointment)

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
            operational_entries(QueueEntry.objects).filter(
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
            ensure_no_hold(provider, queue_date)

            active = operational_entries(QueueEntry.objects).filter(
                provider=provider,
                status__in=QueueEntry.ACTIVE_STATUSES,
            ).exists()
            if active:
                raise ActiveQueueCustomerException()

            # Presence-gated ascending serials; the active guard spans booking dates.
            next_waiting = (
                operational_entries(QueueEntry.objects).select_for_update(of=('self',))
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
        from .forecast import calculate
        return decorate_readiness(queue_entry, calculate(queue_entry))

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

            if operational_entries(QueueEntry.objects).filter(provider=provider, status__in=QueueEntry.ACTIVE_STATUSES).exclude(pk=entry.pk).exists():
                raise ActiveQueueCustomerException()
            ensure_no_hold(provider, entry.queue_date)
            if not entry.can_transition_to(QueueEntry.Status.IN_PROGRESS):
                raise InvalidQueueStateException(
                    message=f'Cannot start queue entry in status {entry.status}.',
                )

            appointment = Appointment.objects.select_for_update().get(pk=entry.appointment_id)
            ensure_not_replaced(appointment)
            ensure_not_interrupted(appointment)
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
            ensure_not_replaced(appointment)
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
            ordinary_resolution(appointment, 'COMPLETED')
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
        CALLED â†’ SKIPPED.
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

            ensure_no_hold(provider, entry.queue_date)
            if not entry.can_transition_to(QueueEntry.Status.SKIPPED):
                raise InvalidQueueStateException(
                    message=f'Cannot skip queue entry in status {entry.status}.',
                )

            now = timezone.now()
            entry.status = QueueEntry.Status.SKIPPED
            entry.skipped_at = now
            entry.save(update_fields=['status', 'skipped_at', 'updated_at'])

            appointment = Appointment.objects.select_for_update().get(pk=entry.appointment_id)
            ensure_not_replaced(appointment)
            ensure_not_interrupted(appointment)
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
            ensure_not_replaced(appointment)
            ensure_not_interrupted(appointment)
            if entry.status == 'WAITING' and appointment.status == 'CHECKED_IN' and entry.is_checked_in:
                entry.appointment = appointment
                return entry
            if entry.status != 'SKIPPED' or appointment.status != 'NO_SHOW':
                raise InvalidQueueStateException(message='Only a skipped appointment can be restored.')
            if operational_appointments(Appointment.objects).filter(provider_id=entry.provider_id, customer_id=appointment.customer_id, status__in=Appointment.BLOCKING_STATUSES).filter(booking_date_filter(entry.queue_date)).exclude(pk=appointment.pk).exists():
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
