from datetime import date, datetime, timedelta, time
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import (
    ProviderLeave,
    ProviderProfile,
    ProviderService,
    ScheduleBreak,
    WeeklySchedule,
)
from apps.audit.services import AuditService
from apps.notifications.services import NotificationService
from apps.services.models import Service
from config.exceptions import ApplicationError

from .models import Appointment


SLOT_INCREMENT_MINUTES = 15


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------

class AppointmentValidationException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'APPOINTMENT_VALIDATION_ERROR'
    default_detail = 'Appointment validation failed.'


class DoubleBookingConflictException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'DOUBLE_BOOKING_CONFLICT'
    default_detail = 'The selected time slot is no longer available.'


class InvalidAppointmentTransitionException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'INVALID_APPOINTMENT_TRANSITION'
    default_detail = 'This appointment status transition is not allowed.'


class AppointmentNotCancellableException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'APPOINTMENT_NOT_CANCELLABLE'
    default_detail = 'This appointment cannot be cancelled in its current status.'


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def get_project_tz():
    return ZoneInfo(settings.TIME_ZONE)


def intervals_overlap(start_a, end_a, start_b, end_b) -> bool:
    """Standard half-open-style overlap: start < other_end AND end > other_start."""
    return start_a < end_b and end_a > start_b


def get_effective_duration_minutes(*, provider: ProviderProfile, service: Service) -> int:
    """
    Prefer ProviderService.custom_duration_minutes when set; otherwise Service.duration_minutes.
    """
    assignment = ProviderService.objects.filter(provider=provider, service=service).first()
    if assignment and assignment.custom_duration_minutes:
        duration = assignment.custom_duration_minutes
    else:
        duration = service.duration_minutes
    if duration is None or duration <= 0:
        raise AppointmentValidationException(
            message='Effective service duration must be greater than zero.',
            code='INVALID_SERVICE_DURATION',
        )
    return duration


def _combine_date_time(d: date, t: time) -> datetime:
    tz = get_project_tz()
    return timezone.make_aware(datetime.combine(d, t), timezone=tz)


def _load_active_organization(organization_id) -> Organization:
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


def _load_active_provider(*, organization: Organization, provider_id) -> ProviderProfile:
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
        raise AppointmentValidationException(
            message='Provider is not operationally active.',
            code='PROVIDER_INACTIVE',
        )
    return provider



def _load_active_service(*, organization: Organization, service_id) -> Service:
    try:
        service = Service.objects.get(id=service_id, organization=organization)
    except Service.DoesNotExist:
        raise ApplicationError(
            message='Service not found in this organization.',
            code='SERVICE_NOT_FOUND',
            status_code=404,
        )
    if not service.is_active:
        raise AppointmentValidationException(
            message='Service is not active.',
            code='SERVICE_INACTIVE',
        )
    return service


def _ensure_provider_offers_service(*, provider: ProviderProfile, service: Service) -> None:
    if not ProviderService.objects.filter(provider=provider, service=service).exists():
        raise AppointmentValidationException(
            message='Provider is not assigned to this service.',
            code='PROVIDER_SERVICE_NOT_ASSIGNED',
        )


def _get_working_schedule(provider: ProviderProfile, on_date: date):
    """Return WeeklySchedule for date.weekday() or None."""
    return WeeklySchedule.objects.filter(
        provider=provider,
        day_of_week=on_date.weekday(),
    ).first()


def _blocking_appointment_qs(provider: ProviderProfile, *, exclude_appointment_id=None):
    qs = Appointment.objects.filter(
        provider=provider,
        status__in=Appointment.BLOCKING_STATUSES,
    )
    if exclude_appointment_id is not None:
        qs = qs.exclude(pk=exclude_appointment_id)
    return qs


def _slot_fits_schedule(slot_start: datetime, slot_end: datetime, schedule: WeeklySchedule, on_date: date) -> bool:
    schedule_start = _combine_date_time(on_date, schedule.start_time)
    schedule_end = _combine_date_time(on_date, schedule.end_time)
    return slot_start >= schedule_start and slot_end <= schedule_end


def _slot_overlaps_breaks(slot_start: datetime, slot_end: datetime, breaks, on_date: date) -> bool:
    for brk in breaks:
        brk_start = _combine_date_time(on_date, brk.start_time)
        brk_end = _combine_date_time(on_date, brk.end_time)
        if intervals_overlap(slot_start, slot_end, brk_start, brk_end):
            return True
    return False


def _slot_overlaps_leaves(slot_start: datetime, slot_end: datetime, leaves) -> bool:
    for leave in leaves:
        if intervals_overlap(slot_start, slot_end, leave.start_datetime, leave.end_datetime):
            return True
    return False


def _slot_overlaps_appointments(slot_start: datetime, slot_end: datetime, appointments) -> bool:
    for appt in appointments:
        if intervals_overlap(slot_start, slot_end, appt.start_datetime, appt.end_datetime):
            return True
    return False


def validate_slot_against_schedule_and_blocks(
    *,
    provider: ProviderProfile,
    start_datetime: datetime,
    end_datetime: datetime,
    exclude_appointment_id=None,
) -> None:
    """
    Validate that [start, end] fits working hours and does not overlap breaks/leave/appointments.
    Raises AppointmentValidationException or DoubleBookingConflictException.
    """
    if timezone.is_naive(start_datetime) or timezone.is_naive(end_datetime):
        raise AppointmentValidationException(
            message='start_datetime must be timezone-aware.',
            code='NAIVE_DATETIME',
        )

    if end_datetime <= start_datetime:
        raise AppointmentValidationException(
            message='end_datetime must be after start_datetime.',
            code='INVALID_DATETIME_INTERVAL',
        )

    if start_datetime < timezone.now():
        raise AppointmentValidationException(
            message='Cannot book an appointment in the past.',
            code='PAST_APPOINTMENT',
        )

    on_date = timezone.localtime(start_datetime, get_project_tz()).date()
    schedule = _get_working_schedule(provider, on_date)
    if schedule is None or not schedule.is_working_day:
        raise AppointmentValidationException(
            message='Provider is not working on the requested date.',
            code='PROVIDER_NOT_WORKING',
        )

    if not _slot_fits_schedule(start_datetime, end_datetime, schedule, on_date):
        raise AppointmentValidationException(
            message='Appointment does not fall within provider working hours.',
            code='OUTSIDE_WORKING_HOURS',
        )

    breaks = list(ScheduleBreak.objects.filter(weekly_schedule=schedule))
    if _slot_overlaps_breaks(start_datetime, end_datetime, breaks, on_date):
        raise AppointmentValidationException(
            message='Appointment overlaps a schedule break.',
            code='BREAK_CONFLICT',
        )

    leaves = list(
        ProviderLeave.objects.filter(
            provider=provider,
            start_datetime__lt=end_datetime,
            end_datetime__gt=start_datetime,
        )
    )
    if _slot_overlaps_leaves(start_datetime, end_datetime, leaves):
        raise AppointmentValidationException(
            message='Appointment overlaps provider leave.',
            code='LEAVE_CONFLICT',
        )

    conflicting = _blocking_appointment_qs(
        provider, exclude_appointment_id=exclude_appointment_id
    ).filter(
        start_datetime__lt=end_datetime,
        end_datetime__gt=start_datetime,
    ).exists()
    if conflicting:
        raise DoubleBookingConflictException()


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

class AppointmentAvailabilityService:
    """
    Dynamically compute available booking slots for a provider/service/date.
    Slots are never persisted.
    """

    @classmethod
    def get_available_slots(cls, *, organization_id, provider_id, service_id, on_date: date) -> dict:
        organization = _load_active_organization(organization_id)
        provider = _load_active_provider(organization=organization, provider_id=provider_id)
        service = _load_active_service(organization=organization, service_id=service_id)
        _ensure_provider_offers_service(provider=provider, service=service)

        duration = get_effective_duration_minutes(provider=provider, service=service)

        schedule = _get_working_schedule(provider, on_date)
        empty = {
            'date': on_date.isoformat(),
            'provider_id': str(provider.id),
            'service_id': str(service.id),
            'duration_minutes': duration,
            'slots': [],
        }
        if schedule is None or not schedule.is_working_day:
            return empty

        schedule_start = _combine_date_time(on_date, schedule.start_time)
        schedule_end = _combine_date_time(on_date, schedule.end_time)
        duration_delta = timedelta(minutes=duration)
        step = timedelta(minutes=SLOT_INCREMENT_MINUTES)

        breaks = list(ScheduleBreak.objects.filter(weekly_schedule=schedule))
        day_start = schedule_start
        day_end = schedule_end
        leaves = list(
            ProviderLeave.objects.filter(
                provider=provider,
                start_datetime__lt=day_end,
                end_datetime__gt=day_start,
            )
        )
        appointments = list(
            _blocking_appointment_qs(provider).filter(
                start_datetime__lt=day_end,
                end_datetime__gt=day_start,
            )
        )

        now = timezone.now()
        slots = []
        cursor = schedule_start
        while cursor + duration_delta <= schedule_end:
            slot_start = cursor
            slot_end = cursor + duration_delta
            cursor += step

            # Skip past slots (lead-time: now).
            if slot_start < now:
                continue
            if _slot_overlaps_breaks(slot_start, slot_end, breaks, on_date):
                continue
            if _slot_overlaps_leaves(slot_start, slot_end, leaves):
                continue
            if _slot_overlaps_appointments(slot_start, slot_end, appointments):
                continue

            slots.append({
                'start': slot_start.isoformat(),
                'end': slot_end.isoformat(),
            })

        return {
            'date': on_date.isoformat(),
            'provider_id': str(provider.id),
            'service_id': str(service.id),
            'duration_minutes': duration,
            'slots': slots,
        }


# ---------------------------------------------------------------------------
# Booking / lifecycle
# ---------------------------------------------------------------------------

class AppointmentService:
    """
    Concurrency-safe appointment booking and lifecycle operations.
    """

    @classmethod
    def book_appointment(
        cls,
        *,
        organization_id,
        customer,
        provider_id,
        service_id,
        start_datetime: datetime,
        booking_channel: str = Appointment.BookingChannel.ONLINE,
        arrival_type: str = Appointment.ArrivalType.SCHEDULED,
        notes: str = '',
    ) -> Appointment:
        organization = _load_active_organization(organization_id)

        with transaction.atomic():
            # Provider-row lock serializes concurrent bookings for this provider.
            try:
                provider = (
                    ProviderProfile.objects.select_for_update()
                    .select_related('membership__organization')
                    .get(
                        id=provider_id,
                        membership__organization=organization,
                        membership__is_active=True,
                        membership__role=OrganizationMembership.Role.PROVIDER,
                    )
                )
            except ProviderProfile.DoesNotExist:
                raise ApplicationError(
                    message='Provider not found in this organization.',
                    code='PROVIDER_NOT_FOUND',
                    status_code=404,
                )
            if not provider.is_operationally_active:
                raise AppointmentValidationException(
                    message='Provider is not operationally active.',
                    code='PROVIDER_INACTIVE',
                )

            service = _load_active_service(organization=organization, service_id=service_id)
            _ensure_provider_offers_service(provider=provider, service=service)

            duration = get_effective_duration_minutes(provider=provider, service=service)
            end_datetime = start_datetime + timedelta(minutes=duration)

            validate_slot_against_schedule_and_blocks(
                provider=provider,
                start_datetime=start_datetime,
                end_datetime=end_datetime,
            )

            appt_date = timezone.localtime(start_datetime, get_project_tz()).date()

            from django.db.models import Max
            max_serial = (
                Appointment.objects.filter(
                    provider=provider,
                    appointment_date=appt_date,
                ).aggregate(m=Max('serial_number'))['m'] or 0
            )
            serial_number = max_serial + 1

            appointment = Appointment.objects.create(
                organization=organization,
                customer=customer,
                provider=provider,
                service=service,
                start_datetime=start_datetime,
                end_datetime=end_datetime,
                appointment_date=appt_date,
                serial_number=serial_number,
                booking_channel=booking_channel,
                arrival_type=arrival_type,
                status=Appointment.Status.CONFIRMED,
                notes=notes or '',
            )

            # Auto-create linked QueueEntry
            from apps.queue.models import QueueEntry
            is_auto_checked_in = (
                arrival_type == Appointment.ArrivalType.WALK_IN
                or booking_channel == Appointment.BookingChannel.FRONT_DESK
            )
            QueueEntry.objects.create(
                organization=organization,
                appointment=appointment,
                provider=provider,
                queue_date=appt_date,
                serial_number=serial_number,
                token_number=serial_number,
                status=QueueEntry.Status.WAITING,
                is_checked_in=is_auto_checked_in,
                checked_in_at=timezone.now() if is_auto_checked_in else None,
            )

            NotificationService.create(
                recipient=customer,
                organization=organization,
                kind='APPOINTMENT_BOOKED',
                title='Appointment booked',
                message=f'Your appointment (Serial #{serial_number}) is booked for {appointment.start_datetime}.',
                appointment=appointment,
            )
            if provider.membership and provider.membership.user and provider.membership.user != customer:
                NotificationService.create(
                    recipient=provider.membership.user,
                    organization=organization,
                    kind='PROVIDER_NEW_APPOINTMENT',
                    title='New appointment assigned',
                    message=f'New appointment (Serial #{serial_number}) booked with {customer.get_full_name() or customer.email}.',
                    appointment=appointment,
                )
            AuditService.record(
                action='APPOINTMENT_BOOKED', entity_type='Appointment', entity_id=appointment.id,
                organization_id=organization.id, actor=customer,
                metadata={'provider_id': str(provider.id), 'service_id': str(service.id), 'serial_number': serial_number},
            )
            return appointment

    @classmethod
    def reschedule_appointment(
        cls,
        *,
        appointment: Appointment,
        start_datetime: datetime,
    ) -> Appointment:
        with transaction.atomic():
            provider = (
                ProviderProfile.objects.select_for_update()
                .select_related('membership__organization')
                .get(pk=appointment.provider_id)
            )

            if appointment.status in (
                Appointment.Status.COMPLETED,
                Appointment.Status.CANCELLED,
                Appointment.Status.NO_SHOW,
                Appointment.Status.IN_PROGRESS,
                Appointment.Status.CHECKED_IN,
            ):
                raise AppointmentValidationException(
                    message='This appointment cannot be rescheduled in its current status.',
                    code='APPOINTMENT_NOT_RESCHEDULABLE',
                )

            duration = get_effective_duration_minutes(
                provider=provider, service=appointment.service
            )
            end_datetime = start_datetime + timedelta(minutes=duration)

            validate_slot_against_schedule_and_blocks(
                provider=provider,
                start_datetime=start_datetime,
                end_datetime=end_datetime,
                exclude_appointment_id=appointment.id,
            )

            appointment.start_datetime = start_datetime
            appointment.end_datetime = end_datetime
            appointment.save(update_fields=['start_datetime', 'end_datetime', 'updated_at'])
            return appointment

    @classmethod
    def cancel_appointment(
        cls,
        *,
        appointment: Appointment,
        reason: str = '',
        actor=None,
    ) -> Appointment:
        if appointment.status in (
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
        ):
            raise AppointmentNotCancellableException()

        if not appointment.can_transition_to(Appointment.Status.CANCELLED):
            raise InvalidAppointmentTransitionException(
                message=f'Cannot cancel appointment in status {appointment.status}.',
            )

        appointment.status = Appointment.Status.CANCELLED
        appointment.cancellation_reason = reason or ''
        appointment.save(update_fields=['status', 'cancellation_reason', 'updated_at'])
        organization = appointment.organization
        NotificationService.create(
            recipient=appointment.customer,
            organization=organization,
            kind='APPOINTMENT_CANCELLED',
            title='Appointment cancelled',
            message='Your appointment has been cancelled.',
            appointment=appointment,
        )
        if (
            appointment.provider
            and appointment.provider.membership
            and appointment.provider.membership.user
            and appointment.provider.membership.user != (actor or appointment.customer)
        ):
            NotificationService.create(
                recipient=appointment.provider.membership.user,
                organization=organization,
                kind='PROVIDER_APPOINTMENT_CANCELLED',
                title='Appointment cancelled',
                message=f'Appointment with {appointment.customer.get_full_name() or appointment.customer.email} has been cancelled.',
                appointment=appointment,
            )
        AuditService.record(
            action='APPOINTMENT_CANCELLED', entity_type='Appointment', entity_id=appointment.id,
            organization_id=organization.id, actor=actor or appointment.customer,
            metadata={'reason': reason or ''},
        )
        return appointment

    @classmethod
    def transition_status(
        cls,
        *,
        appointment: Appointment,
        new_status: str,
    ) -> Appointment:
        if not appointment.can_transition_to(new_status):
            raise InvalidAppointmentTransitionException(
                message=(
                    f'Cannot transition from {appointment.status} to {new_status}.'
                ),
            )
        appointment.status = new_status
        appointment.save(update_fields=['status', 'updated_at'])
        return appointment

    @classmethod
    def check_in(cls, *, appointment: Appointment) -> Appointment:
        """Legacy status-only helper; API check-in uses QueueService to create QueueEntry."""
        return cls.transition_status(
            appointment=appointment,
            new_status=Appointment.Status.CHECKED_IN,
        )
