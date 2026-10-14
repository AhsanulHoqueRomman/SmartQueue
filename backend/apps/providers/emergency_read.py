"""Shared operational exclusions and customer-safe interruption projection."""
from django.db.models import Q
from config.exceptions import ApplicationError
from .models import ProviderEmergency, EmergencyRecovery


def operational_appointments(queryset):
    return queryset.exclude(emergency_recoveries__resolution='RESCHEDULED')


def operational_entries(queryset):
    interrupted = EmergencyRecovery.objects.filter(interrupted_at__isnull=False, resolution='UNRESOLVED')
    return queryset.exclude(appointment__emergency_recoveries__resolution='RESCHEDULED').exclude(appointment__emergency_recoveries__in=interrupted)


def held_incident(provider, on_date):
    return ProviderEmergency.objects.filter(provider=provider, state__in=['TEMPORARY', 'UNAVAILABLE']).filter(
        Q(service_date=on_date) | Q(recoveries__original_date=on_date, recoveries__resolution='UNRESOLVED')
    ).distinct().first()


def ensure_no_hold(provider, on_date):
    if held_incident(provider, on_date):
        raise ApplicationError(message='This provider/date is on emergency hold. Please contact the organization.',
                               code='PROVIDER_EMERGENCY_HOLD', status_code=409)


def ensure_not_replaced(appointment):
    if appointment.emergency_recoveries.filter(resolution='RESCHEDULED').exists():
        raise ApplicationError(message='This original booking was resolved by an emergency replacement.',
                               code='EMERGENCY_ALREADY_RESOLVED', status_code=409)


def ensure_not_interrupted(appointment):
    if appointment.emergency_recoveries.filter(resolution='UNRESOLVED', interrupted_at__isnull=False).exists():
        raise ApplicationError(message='This consultation was recorded as interrupted. Resolve it through emergency recovery or record genuine completion.',
                               code='EMERGENCY_UNFINISHED_CONSULTATION', status_code=409)


MESSAGES = {
    'TEMPORARY': 'Your provider is temporarily unavailable due to an emergency. Your appointment requires assistance. Please view the details.',
    'UNAVAILABLE': 'Your provider is confirmed unavailable for this service date. Staff will contact you to coordinate recovery. Your booking is preserved until you agree to a resolution.',
    'RESUMED': 'Your provider has returned and consultations are ready to resume. Staff will confirm whether you can still attend or prefer another available date. Follow updated live queue guidance.',
}


def summary(appointment):
    rows = appointment.emergency_recoveries.select_related('incident__provider__membership__organization', 'replacement').order_by('-incident__updated_at')
    row = rows.filter(resolution='UNRESOLVED', incident__state__in=['TEMPORARY','UNAVAILABLE']).first() or rows.filter(resolution='UNRESOLVED').first() or rows.first()
    if not row:
        return None
    incident = row.incident
    org = incident.provider.membership.organization
    resolved = row.resolution != 'UNRESOLVED'
    interrupted = not resolved and row.interrupted_at is not None
    return {'incident_id': str(incident.pk), 'state': incident.state,
            'status_label': 'Unresolved Emergency Recovery' if interrupted else incident.get_state_display(), 'service_date': str(incident.service_date),
            'original_date': str(row.original_date), 'original_serial': row.original_snapshot['serial'],
            'resolution': row.resolution, 'hold': not resolved and (incident.state in ['TEMPORARY', 'UNAVAILABLE'] or interrupted),
            'consultation_interrupted': interrupted,
            'message': ('Your consultation was recorded as unfinished or interrupted. Staff assistance is required; no completed outcome or replacement is assumed.' if interrupted else MESSAGES[incident.state]) if not resolved else row.get_resolution_display(),
            'replacement_id': str(row.replacement_id) if row.replacement_id else None,
            'contact_phone': org.phone_number or '', 'organization_name': org.name}


def decorate_readiness(entry, info):
    emergency = summary(entry.appointment)
    info = {**info, 'emergency': emergency}
    if emergency and emergency['resolution'] == 'RESCHEDULED':
        return {**info, 'readiness_state': 'RESCHEDULED', 'can_check_in': False, 'eta_reliable': False,
                'estimated_start_time': None, 'estimated_end_time': None, 'recommended_arrival_time': None,
                'estimated_completion_at': None, 'remaining_service_minutes': None, 'estimated_wait_minutes': None}
    if emergency and emergency['hold']:
        info.update(eta_reliable=False, estimated_start_time=None, estimated_end_time=None,
                    estimated_completion_at=None, remaining_service_minutes=None,
                    recommended_arrival_time=None, estimated_wait_minutes=None,
                    queue_status_text=emergency['status_label'], queue_status_message=emergency['message'])
    return info


def ordinary_resolution(appointment, resolution):
    from django.utils import timezone
    appointment.emergency_recoveries.filter(resolution='UNRESOLVED').update(resolution=resolution, resolved_at=timezone.now())
