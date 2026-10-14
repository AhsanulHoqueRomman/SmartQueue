"""Emergency-only transitions. Normal leave and customer cutoffs remain separate."""
import logging
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from apps.audit.services import AuditService
from apps.organizations.models import OrganizationMembership
from apps.notifications.services import NotificationService
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from config.exceptions import ApplicationError
from .models import ProviderProfile, ProviderEmergency, EmergencyRecovery, EmergencyCommunication
from .emergency_read import MESSAGES, operational_entries, operational_appointments, ensure_no_hold

logger = logging.getLogger(__name__)
HOLD = ['TEMPORARY', 'UNAVAILABLE']


def role(actor, provider):
    if not actor or not actor.is_authenticated or not actor.is_active:
        return None
    membership = OrganizationMembership.objects.filter(user=actor,
        organization_id=provider.membership.organization_id, is_active=True).first()
    if membership and membership.role in ['MANAGER', 'STAFF']:
        return membership.role
    if actor.pk == provider.membership.user_id and provider.is_operationally_active:
        return 'PROVIDER'
    return None


def require(actor, provider, roles):
    if role(actor, provider) not in roles:
        raise ApplicationError(message='You are not authorized for this emergency action.', status_code=403)


def locked_provider(pk):
    return ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization', 'membership__user').get(pk=pk)


def audit(incident, actor, action, **metadata):
    AuditService.record(action='EMERGENCY_' + action, entity_type='ProviderEmergency', entity_id=incident.pk,
        organization_id=incident.provider.membership.organization_id, actor=actor,
        metadata={'service_date': str(incident.service_date), 'version': incident.version, **metadata})


def operator_notice(incident, roles, message):
    members = OrganizationMembership.objects.filter(organization_id=incident.provider.membership.organization_id,
                                                    is_active=True, role__in=roles).select_related('user')
    for member in members:
        NotificationService.create(recipient=member.user, organization=incident.provider.organization,
            kind='PROVIDER_EMERGENCY_OPERATOR', title='Provider service interruption', message=message)


def customer_notices(incident, event):
    rows = incident.recoveries.filter(resolution='UNRESOLVED', appointment__status__in=['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS']).select_related('appointment__customer')
    seen = set()
    for row in rows:
        if event=='RESUMED' and row.appointment.emergency_recoveries.exclude(incident=incident).filter(resolution='UNRESOLVED',incident__state__in=HOLD).exists():
            continue
        customer = row.appointment.customer
        if customer.pk in seen:
            continue
        seen.add(customer.pk)
        notice = NotificationService.create(recipient=customer, organization=incident.provider.organization,
            kind='PROVIDER_EMERGENCY_' + event, title=incident.get_state_display(), message=MESSAGES[incident.state],
            appointment=row.appointment, queue_entry=row.appointment.queue_entry)
        delivery = EmergencyCommunication.objects.create(incident=incident, customer=customer,
            appointment=row.appointment, version=incident.version, event=event, notification=notice)
        transaction.on_commit(lambda pk=delivery.pk: attempt_email(pk), robust=True)


def attempt_email(pk):
    # Claim once, outside the incident transaction. A crash leaves SENDING for
    # operator review; never blindly retry an uncertain send.
    with transaction.atomic():
        delivery = EmergencyCommunication.objects.select_for_update(of=('self',)).select_related('incident__provider__membership__organization', 'customer').get(pk=pk)
        if delivery.email_state not in ['PENDING', 'FAILED']:
            return
        affected = delivery.incident.recoveries.filter(
            appointment__customer_id=delivery.customer_id, resolution='UNRESOLVED')
        renewed_hold = delivery.event == 'RESUMED' and EmergencyRecovery.objects.filter(
            appointment_id__in=affected.values('appointment_id'),
            resolution='UNRESOLVED', incident__state__in=HOLD).exclude(incident=delivery.incident).exists()
        if delivery.version != delivery.incident.version or not affected.exists() or renewed_hold:
            delivery.email_state='UNKNOWN'; delivery.save(update_fields=['email_state'])
            logger.info('Superseded or resolved emergency communication %s not attempted.',pk)
            return
        delivery.email_state = 'SENDING'; delivery.attempts += 1; delivery.attempted_at = timezone.now()
        delivery.save(update_fields=['email_state', 'attempts', 'attempted_at'])
    try:
        from apps.contact.email_service import send_emergency_notification
        result = send_emergency_notification(to=delivery.customer.email,
            subject='QueueTurn — ' + {'DECLARED':'Temporary service interruption', 'UNAVAILABLE':'Service recovery assistance', 'RESUMED':'Provider service resumed'}[delivery.event],
            text=f"{delivery.incident.provider.organization.name}\nService date: {delivery.incident.service_date}\n{MESSAGES[{'DECLARED':'TEMPORARY','UNAVAILABLE':'UNAVAILABLE','RESUMED':'RESUMED'}[delivery.event]]}\nPlease view your appointment details in QueueTurn.",
            idempotency_key='queueturn-emergency-' + str(delivery.pk))
        state = ('UNKNOWN' if getattr(result, 'outcome_uncertain', False)
                 else 'ACCEPTED' if result.success and result.email_id
                 else 'UNKNOWN' if result.success else 'FAILED')
        email_id = result.email_id or ''
    except Exception:
        logger.exception('Emergency email attempt failed; incident and bookings remain committed.')
        state, email_id = 'UNKNOWN', ''
    EmergencyCommunication.objects.filter(pk=pk, email_state='SENDING').update(email_state=state, email_id=email_id)
    if state != 'ACCEPTED':
        logger.warning('Emergency communication %s has email state %s; not a delivery confirmation.', pk, state)


class EmergencyService:
    @staticmethod
    @transaction.atomic
    def interrupt(*, recovery, actor):
        provider=locked_provider(recovery.incident.provider_id); require(actor,provider,['PROVIDER','MANAGER','STAFF'])
        incident=ProviderEmergency.objects.select_for_update().get(pk=recovery.incident_id)
        recovery=EmergencyRecovery.objects.select_for_update().get(pk=recovery.pk)
        entry=QueueEntry.objects.select_for_update().get(appointment_id=recovery.appointment_id)
        appt=Appointment.objects.select_for_update().get(pk=recovery.appointment_id)
        if recovery.resolution!='UNRESOLVED' or appt.status not in Appointment.BLOCKING_STATUSES or entry.status not in ['CALLED','IN_PROGRESS']:
            raise ApplicationError(message='Only unresolved called or in-progress emergency work may be recorded as interrupted.',status_code=409)
        if recovery.interrupted_at: return recovery
        recovery.interrupted_at=timezone.now(); recovery.save(update_fields=['interrupted_at'])
        audit(incident,actor,'CONSULTATION_INTERRUPTED',recovery_id=str(recovery.pk),queue_entry_id=str(entry.pk))
        return recovery

    @staticmethod
    @transaction.atomic
    def declare(*, provider, actor, service_date, private_reason=''):
        from apps.queue.services import current_business_date
        provider = locked_provider(provider.pk); require(actor, provider, ['PROVIDER', 'MANAGER'])
        if service_date > current_business_date():
            raise ApplicationError(message='Future unavailability uses planned leave or schedule review.')
        existing = ProviderEmergency.objects.select_for_update().filter(
            provider=provider, service_date=service_date, state__in=HOLD).first()
        if existing:
            return existing
        # Same-date unfinished work stays affected even if an earlier incident
        # recorded it as interrupted. Only actual active work crosses dates.
        active_ids = operational_entries(QueueEntry.objects.filter(
            provider=provider, status__in=['CALLED', 'IN_PROGRESS'])).values('pk')
        candidates = QueueEntry.objects.filter(provider=provider,
            status__in=['WAITING', 'CALLED', 'IN_PROGRESS'],
            appointment__status__in=Appointment.BLOCKING_STATUSES).exclude(
                appointment__emergency_recoveries__resolution='RESCHEDULED').filter(
                Q(queue_date=service_date) | Q(pk__in=active_ids))
        if service_date < current_business_date() and not candidates.filter(queue_date=service_date).exists():
            raise ApplicationError(message='No unfinished service exists for that date.')
        # A new interruption is a new incident; never reopen a resolved history.
        incident = ProviderEmergency(provider=provider, service_date=service_date,
            declared_by=actor, declared_at=timezone.now())
        incident.state='TEMPORARY'; incident.private_reason=private_reason
        incident.declared_by=actor; incident.declared_at=timezone.now(); incident.resume_requested_at=None
        incident.save()
        for entry in candidates.select_related('appointment'):
            appt=entry.appointment
            previous_interruption = appt.emergency_recoveries.filter(
                resolution='UNRESOLVED', interrupted_at__isnull=False).order_by('interrupted_at').first()
            EmergencyRecovery.objects.get_or_create(incident=incident, appointment=appt, defaults={
                'original_date': entry.queue_date,
                'interrupted_at': previous_interruption.interrupted_at if previous_interruption else None,
                'original_snapshot': {'serial': appt.serial_number, 'provider_id':str(appt.provider_id), 'service_id':str(appt.service_id),
                    'appointment_date':str(entry.queue_date), 'appointment_status':appt.status, 'queue_status':entry.status,
                    'start_datetime':appt.start_datetime.isoformat(), 'end_datetime':appt.end_datetime.isoformat(),
                    'called_at':entry.called_at.isoformat() if entry.called_at else None,
                    'started_at':entry.started_at.isoformat() if entry.started_at else None}})
        audit(incident, actor, 'DECLARED')
        customer_notices(incident, 'DECLARED')
        if role(actor,provider)=='PROVIDER':
            operator_notice(incident,['MANAGER'],f'Provider emergency declared for {service_date}. Review the provider queue.')
        return incident

    @staticmethod
    @transaction.atomic
    def transition(*, incident, actor, action):
        from apps.appointments.capacity import at_date
        from .schedule_changes import effective_schedule
        provider=locked_provider(incident.provider_id)
        incident=ProviderEmergency.objects.select_for_update().get(pk=incident.pk); incident.provider=provider
        if action=='REQUEST_RESUME':
            require(actor,provider,['PROVIDER'])
            if incident.state!='TEMPORARY': raise ApplicationError(message='Only a temporary emergency may request resumption.',status_code=409)
            if incident.resume_requested_at: return incident
            incident.resume_requested_at=timezone.now(); incident.save(update_fields=['resume_requested_at','updated_at'])
            audit(incident,actor,'RESUME_REQUESTED'); operator_notice(incident,['MANAGER'],'Provider requests approval to resume service. The hold remains active.')
            return incident
        if action=='APPROVE_RESUME':
            require(actor,provider,['MANAGER'])
            if incident.state=='RESUMED': return incident
            if incident.state!='TEMPORARY' or not incident.resume_requested_at:
                raise ApplicationError(message='A temporary emergency and provider resume request are required.',status_code=409)
            incident.state='RESUMED'; incident.resumed_at=timezone.now(); event='RESUMED'
        elif action=='CONFIRM_UNAVAILABLE':
            require(actor,provider,['PROVIDER','MANAGER'])
            if incident.state=='UNAVAILABLE': return incident
            if incident.state!='TEMPORARY': raise ApplicationError(message='Only an active temporary incident can be finalized.',status_code=409)
            schedule=effective_schedule(provider,incident.service_date)
            if role(actor,provider)=='MANAGER' and (not schedule or timezone.now()<at_date(incident.service_date,schedule.end_time)):
                raise ApplicationError(message='Before scheduled end, the provider must personally confirm they cannot return.',status_code=409)
            incident.state='UNAVAILABLE'; incident.finalized_at=timezone.now(); event='UNAVAILABLE'
        else: raise ApplicationError(message='Unknown emergency action.')
        incident.version+=1; incident.save(); audit(incident,actor,event)
        customer_notices(incident,event)
        operator_notice(incident,['STAFF','MANAGER'], 'Contact affected customers for recovery.' if event=='UNAVAILABLE' else 'Service resumed: personally confirm customer attendance or another available date.')
        return incident

    @staticmethod
    def _contact_allowed(incident, direction):
        if direction not in ['INBOUND','OUTBOUND']:
            raise ApplicationError(message='Record the actual contact direction.')
        if direction=='OUTBOUND' and incident.state=='TEMPORARY':
            raise ApplicationError(message='Do not begin outbound recovery calling during a temporary emergency.',status_code=409)

    @staticmethod
    @transaction.atomic
    def contact(*, recovery, actor, direction, outcome, note, request_id):
        provider=locked_provider(recovery.incident.provider_id); require(actor,provider,['STAFF','MANAGER'])
        incident=ProviderEmergency.objects.select_for_update().get(pk=recovery.incident_id)
        recovery=EmergencyRecovery.objects.select_for_update().get(pk=recovery.pk)
        EmergencyService._contact_allowed(incident,direction)
        if recovery.resolution!='UNRESOLVED': raise ApplicationError(message='This recovery is already resolved.',status_code=409)
        if any(a['request_id']==str(request_id) for a in recovery.contact_attempts): return recovery
        recovery.contact_attempts=[*recovery.contact_attempts,{'request_id':str(request_id),'at':timezone.now().isoformat(),
            'actor_id':actor.pk,'direction':direction,'outcome':outcome,'note':note}]
        recovery.save(update_fields=['contact_attempts']); audit(incident,actor,'CONTACT_RECORDED',recovery_id=str(recovery.pk),outcome=outcome)
        return recovery

    @staticmethod
    @transaction.atomic
    def recover(*, recovery, actor, action, consent, consent_note, direction, target_date=None, target_provider_id=None):
        from apps.appointments.services import AppointmentService
        original_provider_id=recovery.appointment.provider_id
        target_provider_id=target_provider_id or original_provider_id
        # Deterministic provider order coordinates cross-provider recovery with
        # booking, declaration, schedule/duration writers and other recovery.
        providers=list(ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization').filter(
            pk__in=[original_provider_id,target_provider_id,recovery.incident.provider_id]).order_by('pk'))
        provider=next(p for p in providers if p.pk==recovery.incident.provider_id)
        require(actor,provider,['STAFF','MANAGER'])
        target=next((p for p in providers if str(p.pk)==str(target_provider_id)),None)
        if not target or target.membership.organization_id!=provider.membership.organization_id:
            raise ApplicationError(message='Target provider must belong to the same organization.',status_code=403)
        incident=ProviderEmergency.objects.select_for_update().get(pk=recovery.incident_id)
        recovery=EmergencyRecovery.objects.select_for_update().get(pk=recovery.pk)
        entry=QueueEntry.objects.select_for_update().get(appointment_id=recovery.appointment_id)
        appt=Appointment.objects.select_for_update(of=('self',)).select_related('customer').get(pk=recovery.appointment_id)
        if appt.organization_id!=provider.membership.organization_id or appt.provider_id!=provider.pk:
            raise ApplicationError(message='Affected booking does not belong to this incident provider and organization.',status_code=403)
        if consent is not True or not consent_note.strip(): raise ApplicationError(message='Explicit customer consent and its record are required.')
        EmergencyService._contact_allowed(incident,direction)
        expected='RESCHEDULED' if action=='RESCHEDULE' else 'CANCELLED'
        if recovery.resolution==expected:
            if action=='RESCHEDULE' and (recovery.replacement.provider_id!=target.pk or recovery.replacement.appointment_date!=target_date):
                raise ApplicationError(message='A different replacement was already booked.',status_code=409)
            return recovery
        if recovery.resolution!='UNRESOLVED' or appt.status not in Appointment.BLOCKING_STATUSES or entry.status not in ['WAITING','CALLED','IN_PROGRESS']:
            raise ApplicationError(message='This appointment is no longer unresolved emergency work.',status_code=409)
        if appt.emergency_recoveries.exclude(pk=recovery.pk).exclude(resolution='UNRESOLVED').filter(resolution__in=['RESCHEDULED','CANCELLED','COMPLETED']).exists():
            raise ApplicationError(message='Another emergency recovery already resolved this booking.',status_code=409)
        if action not in ['RESCHEDULE','CANCEL']: raise ApplicationError(message='Unknown recovery action.')
        recovery.resolution=expected; recovery.consent_note=consent_note.strip(); recovery.resolved_by=actor; recovery.resolved_at=timezone.now()
        recovery.save(update_fields=['resolution','consent_note','resolved_by','resolved_at'])
        if action=='RESCHEDULE':
            kwargs={'contact_name':appt.contact_name} if appt.contact_name else {}
            if appt.contact_phone: kwargs['contact_phone']=appt.contact_phone
            replacement=AppointmentService.book_appointment(organization_id=appt.organization_id,provider_id=target.pk,
                service_id=appt.service_id,customer=appt.customer,appointment_date=target_date,notes=appt.notes,**kwargs)
            recovery.replacement=replacement; recovery.save(update_fields=['replacement'])
        else:
            appt.status='CANCELLED'; appt.cancellation_reason='Provider Emergency — Customer Requested Cancellation'
            appt.save(update_fields=['status','cancellation_reason','updated_at'])
            entry.status='CANCELLED'; entry.save(update_fields=['status','updated_at'])
            NotificationService.create(recipient=appt.customer,organization=provider.organization,kind='APPOINTMENT_CANCELLED',
                title='Emergency cancellation requested',message=appt.cancellation_reason,appointment=appt,queue_entry=entry)
        appt.emergency_recoveries.exclude(pk=recovery.pk).filter(resolution='UNRESOLVED').update(
            resolution=expected,replacement_id=recovery.replacement_id,resolved_at=recovery.resolved_at,resolved_by=actor,consent_note=recovery.consent_note)
        audit(incident,actor,'CUSTOMER_'+expected,recovery_id=str(recovery.pk),original=recovery.original_snapshot,
            replacement_id=str(recovery.replacement_id) if recovery.replacement_id else None,consent_note=consent_note.strip(),direction=direction)
        return recovery
