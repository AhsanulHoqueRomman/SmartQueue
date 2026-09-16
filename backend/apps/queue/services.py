from datetime import date

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
          CONFIRMED → CHECKED_IN
          create QueueEntry WAITING with next provider/day token
        """
        if appointment.status != Appointment.Status.CONFIRMED:
            raise InvalidCheckInException(
                message=(
                    f'Only CONFIRMED appointments can be checked in '
                    f'(current: {appointment.status}).'
                ),
            )

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


            # Re-fetch appointment under the same transaction after provider lock.
            appointment = Appointment.objects.select_for_update().get(pk=appointment.pk)

            if appointment.status != Appointment.Status.CONFIRMED:
                raise InvalidCheckInException(
                    message=(
                        f'Only CONFIRMED appointments can be checked in '
                        f'(current: {appointment.status}).'
                    ),
                )

            if hasattr(appointment, 'queue_entry'):
                raise QueueEntryAlreadyExistsException()

            if QueueEntry.objects.filter(appointment=appointment).exists():
                raise QueueEntryAlreadyExistsException()

            if appointment.organization_id != provider.membership.organization_id:
                raise ApplicationError(
                    message='Appointment provider does not belong to the appointment organization.',
                    code='QUEUE_ORGANIZATION_MISMATCH',
                    status_code=400,
                )

            queue_date = business_date_for_appointment(appointment)
            next_token = (
                QueueEntry.objects.filter(provider=provider, queue_date=queue_date)
                .aggregate(m=Max('token_number'))['m']
                or 0
            ) + 1

            appointment.status = Appointment.Status.CHECKED_IN
            appointment.save(update_fields=['status', 'updated_at'])

            try:
                entry = QueueEntry.objects.create(
                    organization_id=appointment.organization_id,
                    appointment=appointment,
                    provider=provider,
                    queue_date=queue_date,
                    token_number=next_token,
                    status=QueueEntry.Status.WAITING,
                )
            except IntegrityError as exc:
                raise QueueEntryAlreadyExistsException() from exc

            NotificationService.create(
                recipient=appointment.customer,
                organization=appointment.organization,
                kind='APPOINTMENT_CHECKED_IN',
                title='Appointment checked in',
                message=f'You are checked in with queue token {entry.token_number}.',
                appointment=appointment,
                queue_entry=entry,
            )
            if provider.membership and provider.membership.user:
                NotificationService.create(
                    recipient=provider.membership.user,
                    organization=appointment.organization,
                    kind='PROVIDER_CHECKED_IN',
                    title='Customer checked in',
                    message=f'{appointment.customer.get_full_name() or appointment.customer.email} checked in for token #{entry.token_number}.',
                    appointment=appointment,
                    queue_entry=entry,
                )
            AuditService.record(
                action='APPOINTMENT_CHECKED_IN', entity_type='QueueEntry', entity_id=entry.id,
                organization_id=entry.organization_id, actor=actor or appointment.customer,
                metadata={'token_number': entry.token_number},
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
            .order_by('token_number')
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

            next_waiting = (
                QueueEntry.objects.select_for_update()
                .filter(
                    provider=provider,
                    queue_date=queue_date,
                    status=QueueEntry.Status.WAITING,
                )
                .order_by('token_number')
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
                message=f'Token {next_waiting.token_number} has been called.',
                appointment=next_waiting.appointment,
                queue_entry=next_waiting,
            )
            AuditService.record(
                action='QUEUE_CALLED', entity_type='QueueEntry', entity_id=next_waiting.id,
                organization_id=organization.id, actor=actor or provider.membership.user,
                metadata={'token_number': next_waiting.token_number},
            )
            return next_waiting

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
