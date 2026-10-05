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

    # Under serial provider queue model, provider working hours, breaks, and leaves remain enforced.
    # Rigid single-patient slot overlap blocking is removed as patients receive sequential serials.



# ---------------------------------------------------------------------------
def check_provider_date_capacity(
    *, provider: ProviderProfile, on_date: date, new_service_duration: int, exclude_appointment_id=None
) -> tuple[bool, int, int]:
    """
    Calculates date-level workload capacity for a provider.
    effective_work_minutes = working_minutes - break_minutes
    reserved_workload = sum(duration of non-terminal appointments for provider on on_date)
    has_capacity = (effective_work_minutes - reserved_workload) >= new_service_duration
    Returns (has_capacity, effective_work_minutes, reserved_workload).
    """
    schedule = _get_working_schedule(provider, on_date)
    if schedule is None or not schedule.is_working_day:
        return False, 0, 0

    sched_start = _combine_date_time(on_date, schedule.start_time)
    sched_end = _combine_date_time(on_date, schedule.end_time)
    working_minutes = int((sched_end - sched_start).total_seconds() // 60)

    breaks = ScheduleBreak.objects.filter(weekly_schedule=schedule)
    break_minutes = 0
    for brk in breaks:
        b_start = _combine_date_time(on_date, brk.start_time)
        b_end = _combine_date_time(on_date, brk.end_time)
        break_minutes += int((b_end - b_start).total_seconds() // 60)

    effective_work_minutes = max(0, working_minutes - break_minutes)

    active_appts = Appointment.objects.filter(
        provider=provider,
        appointment_date=on_date,
        status__in=Appointment.BLOCKING_STATUSES,
    )
    if exclude_appointment_id is not None:
        active_appts = active_appts.exclude(pk=exclude_appointment_id)

    reserved_workload = 0
    for appt in active_appts:
        try:
            duration = get_effective_duration_minutes(provider=provider, service=appt.service)
        except Exception:
            if appt.start_datetime and appt.end_datetime:
                duration = int((appt.end_datetime - appt.start_datetime).total_seconds() // 60)
            else:
                duration = 15
        reserved_workload += max(1, duration)

    remaining = effective_work_minutes - reserved_workload
    has_capacity = remaining >= new_service_duration
    return has_capacity, effective_work_minutes, reserved_workload


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

class AppointmentAvailabilityService:
    """
    Dynamically compute customer-safe date availability for a provider/service/date under serial queue model.
    """

    @classmethod
    def get_available_slots(cls, *, organization_id, provider_id, service_id, on_date: date) -> dict:
        organization = _load_active_organization(organization_id)
        provider = _load_active_provider(organization=organization, provider_id=provider_id)
        service = _load_active_service(organization=organization, service_id=service_id)
        _ensure_provider_offers_service(provider=provider, service=service)

        duration = get_effective_duration_minutes(provider=provider, service=service)

        from apps.queue.services import current_business_date
        today = current_business_date()
        if on_date < today:
            return {
                'date': on_date.isoformat(),
                'provider_id': str(provider.id),
                'service_id': str(service.id),
                'duration_minutes': duration,
                'is_available': False,
                'reason': 'PAST_DATE',
                'message': 'Appointments cannot be booked for a past date.',
                'working_hours_display': None,
                'start_time': None,
                'end_time': None,
                'remaining_capacity_minutes': 0,
                'slots': [],
            }

        schedule = _get_working_schedule(provider, on_date)
        if schedule is None or not schedule.is_working_day:
            return {
                'date': on_date.isoformat(),
                'provider_id': str(provider.id),
                'service_id': str(service.id),
                'duration_minutes': duration,
                'is_available': False,
                'reason': 'Not working on this date',
                'working_hours_display': None,
                'start_time': None,
                'end_time': None,
                'remaining_capacity_minutes': 0,
                'slots': [],
            }

        schedule_start = _combine_date_time(on_date, schedule.start_time)
        schedule_end = _combine_date_time(on_date, schedule.end_time)

        leaves = list(
            ProviderLeave.objects.filter(
                provider=provider,
                start_datetime__lt=schedule_end,
                end_datetime__gt=schedule_start,
            )
        )
        full_day_leave = any(
            leave.start_datetime <= schedule_start and leave.end_datetime >= schedule_end
            for leave in leaves
        )
        if full_day_leave:
            return {
                'date': on_date.isoformat(),
                'provider_id': str(provider.id),
                'service_id': str(service.id),
                'duration_minutes': duration,
                'is_available': False,
                'reason': 'Provider is unavailable on this date',
                'working_hours_display': None,
                'start_time': None,
                'end_time': None,
                'remaining_capacity_minutes': 0,
                'slots': [],
            }

        has_capacity, effective_work_minutes, reserved_workload = check_provider_date_capacity(
            provider=provider,
            on_date=on_date,
            new_service_duration=duration,
        )
        remaining_capacity = max(0, effective_work_minutes - reserved_workload)

        start_str = schedule.start_time.strftime('%I:%M %p').lstrip('0')
        end_str = schedule.end_time.strftime('%I:%M %p').lstrip('0')
        working_hours_display = f"{start_str} – {end_str}"

        breaks = list(ScheduleBreak.objects.filter(weekly_schedule=schedule))
        blocking_appts = list(_blocking_appointment_qs(provider).filter(appointment_date=on_date))

        slots = []
        if has_capacity:
            curr = schedule_start
            step = timedelta(minutes=15)
            dur = timedelta(minutes=duration)
            while curr + dur <= schedule_end:
                slot_end = curr + dur
                if not _slot_overlaps_breaks(curr, slot_end, breaks, on_date) and \
                   not _slot_overlaps_leaves(curr, slot_end, leaves) and \
                   not _slot_overlaps_appointments(curr, slot_end, blocking_appts):
                    slots.append({
                        'start': curr.isoformat(),
                        'end': slot_end.isoformat(),
                    })
                curr += step

        return {
            'date': on_date.isoformat(),
            'provider_id': str(provider.id),
            'service_id': str(service.id),
            'duration_minutes': duration,
            'is_available': has_capacity,
            'reason': None if has_capacity else 'Fully booked for this date',
            'working_hours_display': working_hours_display,
            'start_time': schedule.start_time.strftime('%H:%M:%S'),
            'end_time': schedule.end_time.strftime('%H:%M:%S'),
            'remaining_capacity_minutes': remaining_capacity,
            'slots': slots,
        }


# ---------------------------------------------------------------------------
# Booking / lifecycle
# ---------------------------------------------------------------------------

class AppointmentService:
    """
    Concurrency-safe serial-based appointment booking and lifecycle operations.
    """

    @classmethod
    def book_appointment(
        cls,
        *,
        organization_id,
        customer,
        provider_id,
        service_id,
        appointment_date: date | None = None,
        start_datetime: datetime | None = None,
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

            tz = get_project_tz()
            today = timezone.localtime(timezone.now(), tz).date()
            now = timezone.now()

            if appointment_date is not None:
                on_date = appointment_date
            elif start_datetime is not None:
                on_date = timezone.localtime(start_datetime, tz).date()
            else:
                raise AppointmentValidationException(
                    message='appointment_date or start_datetime must be provided.',
                )

            if on_date < today:
                raise AppointmentValidationException(
                    message='Cannot book an appointment for a past date.',
                    code='PAST_APPOINTMENT',
                )

            schedule = _get_working_schedule(provider, on_date)
            if schedule is None or not schedule.is_working_day:
                raise AppointmentValidationException(
                    message='Provider is not working on the requested date.',
                    code='PROVIDER_NOT_WORKING',
                )

            schedule_start = _combine_date_time(on_date, schedule.start_time)
            schedule_end = _combine_date_time(on_date, schedule.end_time)

            duration = get_effective_duration_minutes(provider=provider, service=service)

            if start_datetime is not None:
                op_start = start_datetime
                op_end = op_start + timedelta(minutes=duration)
                if appointment_date is not None:
                    if op_start < schedule_start:
                        op_start = schedule_start
                    elif op_start + timedelta(minutes=duration) > schedule_end:
                        op_start = max(schedule_start, schedule_end - timedelta(minutes=duration))
                    op_end = op_start + timedelta(minutes=duration)
                else:
                    if not _slot_fits_schedule(op_start, op_end, schedule, on_date):
                        raise AppointmentValidationException(
                            message='Appointment does not fall within provider working hours.',
                            code='OUTSIDE_WORKING_HOURS',
                        )
                breaks = list(ScheduleBreak.objects.filter(weekly_schedule=schedule))
                if _slot_overlaps_breaks(op_start, op_end, breaks, on_date):
                    raise AppointmentValidationException(
                        message='Appointment overlaps a schedule break.',
                        code='BREAK_CONFLICT',
                    )
                leaves = list(
                    ProviderLeave.objects.filter(
                        provider=provider,
                        start_datetime__lt=op_end,
                        end_datetime__gt=op_start,
                    )
                )
                if _slot_overlaps_leaves(op_start, op_end, leaves):
                    raise AppointmentValidationException(
                        message='Appointment overlaps provider leave.',
                        code='LEAVE_CONFLICT',
                    )
            else:
                if on_date == today:
                    op_start = max(now, schedule_start)
                else:
                    op_start = schedule_start
                op_end = op_start + timedelta(minutes=duration)

                leaves = list(
                    ProviderLeave.objects.filter(
                        provider=provider,
                        start_datetime__lt=schedule_end,
                        end_datetime__gt=schedule_start,
                    )
                )
                full_day_leave = any(
                    leave.start_datetime <= schedule_start and leave.end_datetime >= schedule_end
                    for leave in leaves
                )
                if full_day_leave:
                    raise AppointmentValidationException(
                        message='Provider is on leave on the requested date.',
                        code='LEAVE_CONFLICT',
                    )

            # Capacity Check: ensure workload fits provider working capacity
            has_capacity, eff_work, res_work = check_provider_date_capacity(
                provider=provider,
                on_date=on_date,
                new_service_duration=duration,
            )
            if not has_capacity:
                raise AppointmentValidationException(
                    message='Provider capacity for this date has been reached.',
                    code='CAPACITY_EXCEEDED',
                )

            from django.db.models import Max
            from apps.queue.models import QueueEntry


            max_appt_serial = (
                Appointment.objects.filter(
                    provider=provider,
                    appointment_date=on_date,
                ).aggregate(m=Max('serial_number'))['m'] or 0
            )
            max_queue_serial = (
                QueueEntry.objects.filter(
                    provider=provider,
                    queue_date=on_date,
                ).aggregate(m=Max('serial_number'))['m'] or 0
            )
            serial_number = max(max_appt_serial, max_queue_serial) + 1

            is_auto_checked_in = (
                arrival_type == Appointment.ArrivalType.WALK_IN
                or booking_channel == Appointment.BookingChannel.FRONT_DESK
            )
            initial_status = Appointment.Status.CHECKED_IN if is_auto_checked_in else Appointment.Status.CONFIRMED

            appointment = Appointment.objects.create(
                organization=organization,
                customer=customer,
                provider=provider,
                service=service,
                start_datetime=op_start,
                end_datetime=op_end,
                appointment_date=on_date,
                serial_number=serial_number,
                booking_channel=booking_channel,
                arrival_type=arrival_type,
                status=initial_status,
                notes=notes or '',
            )

            # Create linked QueueEntry
            QueueEntry.objects.create(
                organization=organization,
                appointment=appointment,
                provider=provider,
                queue_date=on_date,
                serial_number=serial_number,
                token_number=serial_number,
                status=QueueEntry.Status.WAITING,
                is_checked_in=is_auto_checked_in,
                checked_in_at=now if is_auto_checked_in else None,
            )

            NotificationService.create(
                recipient=customer,
                organization=organization,
                kind='APPOINTMENT_BOOKED',
                title='Appointment booked',
                message=f'Your appointment (Serial #{serial_number}) is booked for {appointment.appointment_date}.',
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
        appointment_date: date | None = None,
        start_datetime: datetime | None = None,
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

            tz = get_project_tz()
            today = timezone.localtime(timezone.now(), tz).date()

            if appointment_date is not None:
                target_date = appointment_date
            elif start_datetime is not None:
                target_date = timezone.localtime(start_datetime, tz).date()
            else:
                raise AppointmentValidationException(
                    message='Reschedule requires appointment_date or start_datetime.',
                )

            if target_date < today:
                raise AppointmentValidationException(
                    message='Cannot reschedule an appointment to a past date.',
                    code='PAST_APPOINTMENT',
                )

            schedule = _get_working_schedule(provider, target_date)
            if schedule is None or not schedule.is_working_day:
                raise AppointmentValidationException(
                    message='Provider is not working on the requested date.',
                    code='PROVIDER_NOT_WORKING',
                )

            sched_start = _combine_date_time(target_date, schedule.start_time)
            sched_end = _combine_date_time(target_date, schedule.end_time)

            leaves = list(
                ProviderLeave.objects.filter(
                    provider=provider,
                    start_datetime__lt=sched_end,
                    end_datetime__gt=sched_start,
                )
            )
            if _slot_overlaps_leaves(sched_start, sched_end, leaves):
                raise AppointmentValidationException(
                    message='Provider is on leave on the requested date.',
                    code='LEAVE_CONFLICT',
                )

            if start_datetime is not None:
                op_start = start_datetime
            else:
                now = timezone.now()
                if target_date == today:
                    op_start = max(now, sched_start)
                else:
                    op_start = sched_start

            duration = get_effective_duration_minutes(
                provider=provider, service=appointment.service
            )
            op_end = op_start + timedelta(minutes=duration)

            from django.db.models import Max
            from apps.queue.models import QueueEntry

            if appointment.appointment_date != target_date:
                max_appt_serial = (
                    Appointment.objects.filter(
                        provider=provider,
                        appointment_date=target_date,
                    ).aggregate(m=Max('serial_number'))['m'] or 0
                )
                max_queue_serial = (
                    QueueEntry.objects.filter(
                        provider=provider,
                        queue_date=target_date,
                    ).aggregate(m=Max('serial_number'))['m'] or 0
                )
                new_serial = max(max_appt_serial, max_queue_serial) + 1
            else:
                new_serial = appointment.serial_number or 1

            appointment.appointment_date = target_date
            appointment.serial_number = new_serial
            appointment.start_datetime = op_start
            appointment.end_datetime = op_end
            appointment.save(update_fields=['appointment_date', 'serial_number', 'start_datetime', 'end_datetime', 'updated_at'])

            queue_entry = QueueEntry.objects.filter(appointment=appointment).first()
            if queue_entry:
                queue_entry.queue_date = target_date
                queue_entry.serial_number = new_serial
                queue_entry.token_number = new_serial
                queue_entry.save(update_fields=['queue_date', 'serial_number', 'token_number', 'updated_at'])
                appointment.queue_entry = queue_entry

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

        with transaction.atomic():
            appointment.status = Appointment.Status.CANCELLED
            appointment.cancellation_reason = reason or ''
            appointment.save(update_fields=['status', 'cancellation_reason', 'updated_at'])

            from apps.queue.models import QueueEntry
            entry = QueueEntry.objects.filter(appointment=appointment).first()
            if entry:
                entry.status = QueueEntry.Status.CANCELLED
                entry.save(update_fields=['status', 'updated_at'])

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
