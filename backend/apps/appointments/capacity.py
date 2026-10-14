"""Fixed booking-date allocation budget; completion never releases an allocation."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from apps.providers.duration import average_service_minutes
from apps.providers.models import ProviderLeave
from apps.providers.schedule_changes import effective_schedule
from .models import Appointment


def at_date(on_date, clock):
    return timezone.make_aware(datetime.combine(on_date, clock), ZoneInfo('Asia/Dhaka'))


def effective_leaves(provider):
    return ProviderLeave.objects.filter(provider=provider).filter(Q(status='APPROVED') | Q(status__isnull=True))


def booking_date_filter(on_date):
    """Explicit booking date wins; legacy NULL uses the original Dhaka day."""
    start = at_date(on_date, time.min)
    return (
        Q(appointment_date=on_date) |
        Q(appointment_date__isnull=True, start_datetime__gte=start, start_datetime__lt=start + timedelta(days=1))
    )


def allocations(provider, on_date, exclude_appointment_id=None):
    result = Appointment.objects.filter(provider=provider).exclude(status='CANCELLED').filter(booking_date_filter(on_date))
    from apps.providers.emergency_read import operational_appointments
    result = operational_appointments(result)
    return result.exclude(pk=exclude_appointment_id) if exclude_appointment_id else result


def effective_minutes(provider, on_date, *, schedule=None, extra_leaves=()):
    schedule = schedule or effective_schedule(provider, on_date)
    if not schedule or not schedule.is_working_day:
        return 0
    start, end = at_date(on_date, schedule.start_time), at_date(on_date, schedule.end_time)
    blocked = [(at_date(on_date, b.start_time), at_date(on_date, b.end_time)) for b in schedule.breaks.all()]
    blocked += list(effective_leaves(provider).filter(start_datetime__lt=end, end_datetime__gt=start).values_list('start_datetime', 'end_datetime'))
    blocked += list(extra_leaves)
    clipped = sorted((max(a, start), min(b, end)) for a, b in blocked if max(a, start) < min(b, end))
    merged = []
    for a, b in clipped:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    seconds = (end - start).total_seconds() - sum((b - a).total_seconds() for a, b in merged)
    return max(0, int(seconds // 60))


def date_capacity(provider, on_date, *, exclude_appointment_id=None, schedule=None, extra_leaves=(), average=None):
    average = average if average is not None else average_service_minutes(provider)
    minutes = effective_minutes(provider, on_date, schedule=schedule, extra_leaves=extra_leaves)
    count = allocations(provider, on_date, exclude_appointment_id).count()
    capacity = minutes // average
    return {'daily_capacity': capacity, 'allocated_count': count,
            'remaining_capacity': max(0, capacity - count),
            'effective_available_minutes': minutes, 'average_service_minutes': average}
