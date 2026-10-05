"""Public business hours, independent of provider booking availability."""
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from .models import Organization, OrganizationOperatingHours


def _period(record, on_date, tz):
    if record is None or record.is_closed or record.open_time is None or record.close_time is None:
        return None
    if record.open_time == record.close_time:
        return None  # Ambiguous legacy data is not an implied 24-hour opening.
    end_date = on_date + timedelta(days=record.close_time < record.open_time)
    return (
        timezone.make_aware(datetime.combine(on_date, record.open_time), tz),
        timezone.make_aware(datetime.combine(end_date, record.close_time), tz),
    )


def _format_time(value):
    return value.strftime('%I:%M %p').lstrip('0')


def organization_hours_status(records, *, now=None):
    """Evaluate one loaded week in project timezone; no database queries."""
    tz = timezone.get_default_timezone()
    local_now = timezone.localtime(now if now is not None else timezone.now(), tz)
    today = local_now.date()
    by_day = {record.day_of_week: record for record in records}
    record = by_day.get(today.weekday())
    period = _period(record, today, tz)
    previous_date = today - timedelta(days=1)
    previous = _period(by_day.get(previous_date.weekday()), previous_date, tz)

    active = None
    # An explicitly closed weekday wins even over yesterday's overnight period.
    if record is None or (not record.is_closed and period is not None):
        active = next((p for p in (previous, period) if p and p[0] <= local_now < p[1]), None)
    if active and active[1].date() > today:
        following = by_day.get((today.weekday() + 1) % 7)
        if following is not None and following.is_closed:
            # Closed-day override also makes the advertised closing time truthful.
            active = (active[0], timezone.make_aware(datetime.combine(today + timedelta(days=1), datetime.min.time()), tz))
    known = active is not None or (record is not None and (record.is_closed or period is not None))
    is_open = active is not None if known else None

    next_open = None
    if not active:
        for offset in range(8):  # Include the same weekday next week.
            candidate_date = today + timedelta(days=offset)
            candidate = _period(by_day.get(candidate_date.weekday()), candidate_date, tz)
            if candidate and candidate[0] > local_now:
                next_open = candidate[0]
                break

    label = 'Hours unavailable' if not known else ('Open Now' if active else 'Closed Now')
    detail = ''
    if active:
        detail = f'Closes at {_format_time(active[1])}'
    elif next_open:
        offset = (next_open.date() - today).days
        day = 'today' if offset == 0 else ('tomorrow' if offset == 1 else f"on {next_open.strftime('%A')}")
        detail = f'Opens {day} at {_format_time(next_open)}'

    open_time = record.open_time if record and not record.is_closed else None
    close_time = record.close_time if record and not record.is_closed else None
    return {
        'today_hours': {
            'weekday': today.weekday(),
            'is_open': is_open,
            'is_closed': record.is_closed if record else None,
            'open_time': open_time.isoformat() if open_time else None,
            'close_time': close_time.isoformat() if close_time else None,
            'text': f'{label} — {detail}' if detail else label,
            'window_text': f'{_format_time(open_time)} – {_format_time(close_time)}' if open_time and close_time else '',
        },
        'current_status': {
            'is_open_now': is_open,
            'status_label': label,
            'status_detail': detail,
            'closes_at': active[1].isoformat() if active else None,
            'next_opens_at': next_open.isoformat() if next_open else None,
        },
    }


@transaction.atomic
def update_organization_hours(*, organization, rows):
    """Validated batch upsert; one organization lock serializes hours writers."""
    Organization.objects.select_for_update().get(pk=organization.pk)
    for row in rows:
        values = dict(row)
        day = values.pop('day_of_week')
        OrganizationOperatingHours.objects.update_or_create(
            organization=organization, day_of_week=day, defaults=values,
        )
