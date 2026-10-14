from apps.providers.emergency_read import operational_entries
"""Customer-safe planning telemetry, separate from physically callable entries."""
from datetime import timedelta

from django.utils import timezone

from apps.appointments.models import Appointment
from apps.appointments.capacity import at_date
from apps.providers.duration import average_service_minutes
from apps.providers.schedule_changes import effective_schedule
from config.exceptions import ApplicationError
from .models import QueueEntry


def calculate(entry):
    from .services import current_business_date
    now, today = timezone.now(), current_business_date()
    appointment, provider = entry.appointment, entry.provider
    result = dict(readiness_state='NOT_YET', scheduled_ahead=0, checked_in_ahead=0,
        people_ahead=0, estimated_wait_minutes=None, estimated_start_time=None,
        estimated_end_time=None, recommended_arrival_time=None, now_serving_serial=None,
        can_check_in=False, check_in_available_at=None, actual_started_at=None,
        estimated_completion_at=None, remaining_service_minutes=None, is_delayed=False,
        provider_has_started=False, eta_reliable=False, queue_status_text='',
        queue_status_message='', provider_activity_state='NOT_STARTED')
    if entry.status in ('COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW'):
        return {**result, 'readiness_state': entry.status, 'estimated_wait_minutes': 0}

    active = operational_entries(QueueEntry.objects).filter(provider=provider, status__in=QueueEntry.ACTIVE_STATUSES).order_by('-started_at', '-called_at').first()
    started = active is not None or operational_entries(QueueEntry.objects).filter(provider=provider,
        queue_date=entry.queue_date, status__in=['COMPLETED', 'IN_PROGRESS', 'CALLED']).exists()
    result.update(provider_has_started=started, now_serving_serial=active.serial_number if active else None,
                  provider_activity_state='ACTIVE' if active else ('STARTED' if started else 'NOT_STARTED'))
    try:
        duration = average_service_minutes(provider)
    except ApplicationError:
        duration = None

    if entry.status == 'IN_PROGRESS':
        actual = entry.started_at
        completion = actual + timedelta(minutes=duration) if actual and duration else None
        remaining = max(0, int(round(duration - max(0, (now - actual).total_seconds() / 60)))) if completion else None
        return {**result, 'readiness_state': 'IN_SERVICE', 'estimated_wait_minutes': 0,
                'actual_started_at': actual.isoformat() if actual else None,
                'estimated_completion_at': completion.isoformat() if completion else None,
                'estimated_end_time': completion.isoformat() if completion else None,
                'remaining_service_minutes': remaining, 'now_serving_serial': entry.serial_number,
                'provider_has_started': True, 'queue_status_text': 'Service in Progress'}
    if entry.status == 'CALLED':
        start = entry.called_at or now
        return {**result, 'readiness_state': 'TURN_NOW', 'estimated_wait_minutes': 0,
                'estimated_start_time': start.isoformat(),
                'estimated_end_time': (start + timedelta(minutes=duration)).isoformat() if duration else None,
                'now_serving_serial': entry.serial_number, 'provider_has_started': True,
                'eta_reliable': True, 'queue_status_text': 'Called for Consultation',
                'queue_status_message': "It's your turn."}

    eligible = operational_entries(QueueEntry.objects).filter(provider=provider, queue_date=entry.queue_date,
        status='WAITING', appointment__status__in=['CONFIRMED', 'CHECKED_IN'])
    serial = entry.serial_number or entry.token_number
    if serial is None:
        return {**result, 'queue_status_text': 'Queue Identity Needs Attention',
                'queue_status_message': 'Please contact the organization to confirm queue details.'}
    preceding = eligible.filter(serial_number__lt=serial)
    scheduled, checked = preceding.count(), preceding.filter(is_checked_in=True).count()
    result.update(scheduled_ahead=scheduled, checked_in_ahead=checked,
        people_ahead=checked + (1 if active else 0),
        can_check_in=entry.queue_date == today and not entry.is_checked_in and
                     appointment.status in ['CONFIRMED', 'CHECKED_IN'] and provider.is_operationally_active)
    if entry.queue_date < today:
        return {**result, 'queue_status_text': 'Unfinished Earlier Queue',
                'queue_status_message': 'Your original booking and serial remain unchanged. Please contact the organization for assistance.',
                'provider_activity_state': 'UNFINISHED_PREVIOUS_DATE'}
    if entry.queue_date == today and operational_entries(QueueEntry.objects).filter(provider=provider, queue_date__lt=today,
            status='WAITING', appointment__status__in=['CONFIRMED', 'CHECKED_IN']).exists():
        return {**result, 'queue_status_text': 'Earlier Queue Needs Attention',
                'queue_status_message': 'An unfinished earlier queue needs organization assistance. Timing will update after it is resolved.',
                'provider_activity_state': 'UNFINISHED_PREVIOUS_DATE'}

    schedule = effective_schedule(provider, entry.queue_date)
    if not duration or not schedule or not schedule.is_working_day:
        return {**result, 'queue_status_text': 'Timing Configuration Unavailable',
                'queue_status_message': 'Please contact the organization; service timing needs configuration.'}
    scheduled_start = at_date(entry.queue_date, schedule.start_time)
    future = entry.queue_date > today
    behind_start = not started and now > scheduled_start and not future
    if behind_start:
        result.update(is_delayed=True, queue_status_text='Running Behind Schedule',
            queue_status_message='Your provider has not started consultations as expected. Please follow queue updates or contact the organization for assistance.')
        if now > scheduled_start + timedelta(minutes=20):
            return result

    active_remaining = 0
    if active and not future:
        if active.status == 'IN_PROGRESS':
            if not active.started_at:
                return {**result, 'queue_status_text': 'Service Progress Needs Attention',
                        'queue_status_message': 'Timing will update after the organization confirms service progress.'}
            elapsed = max(0, (now - active.started_at).total_seconds() / 60)
            active_remaining = max(0, duration - elapsed)
            if elapsed > duration:
                result.update(is_delayed=True, queue_status_text='Running Behind Schedule',
                    queue_status_message='Consultations are progressing slower than planned. Please follow queue updates for the latest estimate.')
        else:
            active_remaining = duration
    anchor = scheduled_start if future or not started else now
    start = max(now, anchor) + timedelta(minutes=active_remaining + scheduled * duration)
    # A completed first allocation still identifies the queue's first serial;
    # later customers must not each acquire the five-minute exception in turn.
    first = operational_entries(QueueEntry.objects).filter(provider=provider, queue_date=entry.queue_date).exclude(
        status__in=['CANCELLED', 'SKIPPED', 'NO_SHOW']).exclude(
        appointment__status__in=['CANCELLED', 'NO_SHOW']).order_by('serial_number').first()
    buffer = appointment.organization.arrival_buffer_minutes
    arrival = scheduled_start - timedelta(minutes=5) if first and first.pk == entry.pk else start - timedelta(minutes=buffer)
    remaining = (start - now).total_seconds() / 60
    readiness = 'NOT_YET' if future or remaining > buffer + 10 else ('GET_READY' if remaining > buffer else 'BE_READY')
    if not result['queue_status_text']:
        result['queue_status_text'] = 'Service scheduled for later today' if not started and now < scheduled_start else 'Normal Operational Pace'
    return {**result, 'readiness_state': readiness, 'estimated_start_time': start.isoformat(),
            'estimated_end_time': (start + timedelta(minutes=duration)).isoformat(),
            'estimated_wait_minutes': max(0, int(round(remaining))), 'eta_reliable': True,
            'recommended_arrival_time': None if entry.is_checked_in else arrival.isoformat()}
