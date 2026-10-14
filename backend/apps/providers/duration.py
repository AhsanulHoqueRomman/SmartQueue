"""One provider planning average, shared by capacity and every forecast."""
from config.exceptions import ApplicationError


def legacy_durations(provider, *, exclude_assignment_id=None, extra_duration=None):
    assignments = provider.provider_services.select_related('service')
    if exclude_assignment_id is not None:
        assignments = assignments.exclude(pk=exclude_assignment_id)
    durations = {a.custom_duration_minutes if a.custom_duration_minutes is not None
                 else a.service.duration_minutes for a in assignments}
    if extra_duration is not None:
        durations.add(extra_duration)
    if not durations:
        durations = set(provider.appointments.values_list('service__duration_minutes', flat=True))
    return durations


def average_service_minutes(provider):
    value = provider.average_service_minutes
    if value is None:
        # Read-only compatibility with existing legitimate uniform settings.
        # Never choose the requested service's duration from a mixed catalog.
        durations = legacy_durations(provider)
        if len(durations) == 1:
            value = durations.pop()
    if value is None or isinstance(value, bool) or value <= 0:
        raise ApplicationError(
            message='Configure a positive provider average service time before booking or forecasting this queue.',
            code='PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED',
        )
    return value


def protect_legacy_average(provider, *, exclude_assignment_id=None, extra_duration=None):
    """Called under the provider lock before changing a compatibility source."""
    if provider.average_service_minutes is not None:
        return
    from apps.appointments.models import Appointment
    from apps.queue.services import business_date_for_appointment, current_business_date
    protected = any(business_date_for_appointment(a) >= current_business_date() or
                    a.status in Appointment.BLOCKING_STATUSES
                    for a in provider.appointments.exclude(status='CANCELLED'))
    if not protected:
        return
    current = average_service_minutes(provider)
    if legacy_durations(provider, exclude_assignment_id=exclude_assignment_id, extra_duration=extra_duration) != {current}:
        raise ApplicationError(
            message='Configure a provider-level average service time before changing assignments that affect booked queue planning.',
            code='PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED', status_code=409,
        )
