from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from types import SimpleNamespace
import uuid
import pytest
from django.db import connection, close_old_connections, IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ProviderEmergency, EmergencyRecovery, EmergencyCommunication
from apps.providers.emergencies import EmergencyService, attempt_email
from apps.providers.emergency_read import summary, operational_appointments, operational_entries
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.appointments.capacity import date_capacity
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService
from apps.notifications.models import Notification
from apps.services.models import Service
from apps.contact.email_service import send_emergency_notification as real_emergency_adapter
from unittest.mock import Mock
from resend.exceptions import ResendError
from config.exceptions import ApplicationError

TODAY=date(2026,10,13)
TZ=ZoneInfo('Asia/Dhaka')
pytestmark=pytest.mark.django_db


@pytest.fixture
def env(db,monkeypatch):
    clock={'now':datetime.combine(TODAY,time(10),TZ)}
    monkeypatch.setattr(timezone,'now',lambda:clock['now'])
    sends=[]
    def send(**kwargs):
        sends.append(kwargs)
        return SimpleNamespace(success=True,email_id='fake-accepted-id',error=None)
    monkeypatch.setattr('apps.contact.email_service.send_emergency_notification',send)
    org=Organization.objects.create(name='Emergency test',slug='emergency-test',verification_status='APPROVED',phone_number='01712345678')
    foreign=Organization.objects.create(name='Foreign test',slug='foreign-emergency',verification_status='APPROVED')
    users={r:User.objects.create_user(email=r+'@emergency.test') for r in ['provider','manager','staff','customer','foreign','admin']}
    for r in ['provider','manager','staff']:
        OrganizationMembership.objects.create(organization=org,user=users[r],role=r.upper())
    OrganizationMembership.objects.create(organization=foreign,user=users['foreign'],role='MANAGER')
    users['admin'].is_staff=True;users['admin'].save()
    profile=ProviderProfile.objects.create(membership=OrganizationMembership.objects.get(user=users['provider'],organization=org),application_status='APPROVED',average_service_minutes=10)
    service=Service.objects.create(organization=org,name='Consultation',duration_minutes=25,price=1000)
    ProviderService.objects.create(provider=profile,service=service,custom_price=1200)
    for d in range(7): WeeklySchedule.objects.create(provider=profile,day_of_week=d,start_time=time(10),end_time=time(17))
    return dict(org=org,foreign=foreign,users=users,provider=profile,service=service,clock=clock,sends=sends)


def book(e,customer=None,on_date=TODAY):
    customer=customer or User.objects.create_user(email=uuid.uuid4().hex+'@emergency.test')
    return AppointmentService.book_appointment(organization_id=e['org'].pk,provider_id=e['provider'].pk,service_id=e['service'].pk,customer=customer,appointment_date=on_date)


def declare(e,actor='provider'):
    return EmergencyService.declare(provider=e['provider'],actor=e['users'][actor],service_date=TODAY,private_reason='PRIVATE MEDICAL REASON')


def client(e,actor):
    c=APIClient()
    if actor!='anonymous':c.force_authenticate(e['users'][actor])
    return c


def root(e):return f"/api/v1/organizations/{e['org'].pk}/providers/{e['provider'].pk}/emergencies/"


@pytest.mark.parametrize('actor',['provider','manager','customer','anonymous'])
def test_declare_authorization(env,actor):
    e=env
    response=client(e,actor).post(root(e),{'service_date':str(TODAY)},format='json')
    assert response.status_code==(200 if actor in ['provider','manager'] else (401 if actor=='anonymous' else 403))
    assert ProviderEmergency.objects.count()==int(actor in ['provider','manager'])


def test_own_provider_foreign_nested_scope_denied(env):
    url=root(env).replace(str(env['org'].pk),str(env['foreign'].pk))
    assert client(env,'provider').post(url,{'service_date':str(TODAY)},format='json').status_code==404
    assert not ProviderEmergency.objects.exists()


def test_hold_preserves_bookings_and_blocks_booking_call_start(env):
    first=book(env);second=book(env)
    QueueService.check_in_appointment(appointment=first,actor=first.customer)
    before=list(Appointment.objects.values_list('pk','status','serial_number','appointment_date','start_datetime','end_datetime'))
    incident=declare(env)
    assert incident.state=='TEMPORARY' and incident.recoveries.count()==2
    assert list(Appointment.objects.values_list('pk','status','serial_number','appointment_date','start_datetime','end_datetime'))==before
    with pytest.raises(ApplicationError):book(env)
    with pytest.raises(ApplicationError):QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    assert date_capacity(env['provider'],TODAY)['allocated_count']==2
    assert book(env,on_date=TODAY+timedelta(days=1)).serial_number==1


def test_duplicate_declaration_no_duplicate_notice_or_email(env,django_capture_on_commit_callbacks):
    book(env)
    with django_capture_on_commit_callbacks(execute=True): incident=declare(env)
    counts=(Notification.objects.count(),EmergencyRecovery.objects.count(),EmergencyCommunication.objects.count())
    with django_capture_on_commit_callbacks(execute=True): assert declare(env).pk==incident.pk
    assert counts==(Notification.objects.count(),EmergencyRecovery.objects.count(),EmergencyCommunication.objects.count())
    assert len(env['sends'])==1 and env['sends'][0]['idempotency_key']
    delivery=EmergencyCommunication.objects.get(); assert delivery.email_state=='ACCEPTED'
    attempt_email(delivery.pk);assert len(env['sends'])==1


def test_email_failure_and_retry_do_not_rollback_or_duplicate_in_app(env,monkeypatch,django_capture_on_commit_callbacks):
    book(env)
    monkeypatch.setattr('apps.contact.email_service.send_emergency_notification',lambda **kw:SimpleNamespace(success=False,email_id=None,error='fake failure'))
    with django_capture_on_commit_callbacks(execute=True): incident=declare(env)
    delivery=EmergencyCommunication.objects.get(); assert delivery.email_state=='FAILED' and ProviderEmergency.objects.get().state=='TEMPORARY'
    count=Notification.objects.count();keys=[]
    def success(**kw):keys.append(kw['idempotency_key']);return SimpleNamespace(success=True,email_id='accepted',error=None)
    monkeypatch.setattr('apps.contact.email_service.send_emergency_notification',success)
    attempt_email(delivery.pk);attempt_email(delivery.pk)
    assert len(keys)==1 and Notification.objects.count()==count
    assert EmergencyCommunication.objects.get().attempts==2


def test_temporary_no_outbound_calling_but_inbound_request_recorded(env):
    appt=book(env);incident=declare(env);recovery=incident.recoveries.get()
    args=dict(recovery=recovery,actor=env['users']['staff'],outcome='UNREACHABLE',note='No consent assumed',request_id=uuid.uuid4())
    with pytest.raises(ApplicationError):EmergencyService.contact(direction='OUTBOUND',**args)
    result=EmergencyService.contact(direction='INBOUND',**{**args,'outcome':'UNDECIDED'})
    EmergencyService.contact(direction='INBOUND',**{**args,'outcome':'UNDECIDED'})
    assert len(result.contact_attempts)==1
    appt.refresh_from_db();assert appt.status=='CONFIRMED' and result.resolution=='UNRESOLVED'


def test_resume_requires_request_and_manager_never_final_resume(env):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    incident=declare(env)
    with pytest.raises(ApplicationError):EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
    assert ProviderEmergency.objects.get().state=='TEMPORARY'
    with pytest.raises(ApplicationError):EmergencyService.transition(incident=incident,actor=env['users']['staff'],action='APPROVE_RESUME')
    resumed=EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    assert resumed.state=='RESUMED'
    assert QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk).serial_number==1
    redeclared=declare(env)
    finalized=EmergencyService.transition(incident=redeclared,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    with pytest.raises(ApplicationError):EmergencyService.transition(incident=finalized,actor=env['users']['provider'],action='REQUEST_RESUME')
    assert declare(env).state=='UNAVAILABLE'


def test_early_provider_confirmation_and_explicit_manager_end_closure(env):
    book(env);incident=declare(env)
    with pytest.raises(ApplicationError):EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='CONFIRM_UNAVAILABLE')
    env['clock']['now']=datetime.combine(TODAY,time(17),TZ)
    assert ProviderEmergency.objects.get().state=='TEMPORARY'  # Clock alone cannot close.
    assert EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='CONFIRM_UNAVAILABLE').state=='UNAVAILABLE'


def test_interrupted_active_preserved_then_real_completion_resolves(env):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    entry=QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk)
    entry.refresh_from_db();started=entry.started_at
    incident=declare(env);entry.refresh_from_db();assert entry.status=='IN_PROGRESS' and entry.started_at==started
    info=QueueService.calculate_readiness_and_eta(entry);assert info['emergency']['hold'] and info['estimated_completion_at'] is None
    QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk,actor=env['users']['provider'])
    assert incident.recoveries.get().resolution=='COMPLETED'
    with pytest.raises(ApplicationError):QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk)


def recover_args(e,row,action='RESCHEDULE'):
    return dict(recovery=row,actor=e['users']['staff'],action=action,consent=True,consent_note='Customer explicitly agreed by phone',direction='OUTBOUND',target_date=TODAY+timedelta(days=1))


def test_replacement_atomic_fair_and_original_immutable(env):
    original=book(env,customer=env['users']['customer']);other=book(env,on_date=TODAY+timedelta(days=1))
    old=(original.status,original.serial_number,original.appointment_date,original.start_datetime,original.end_datetime,original.booked_service_charge)
    incident=declare(env);EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    row=incident.recoveries.get(appointment=original)
    assert not AppointmentService.self_reschedule_eligibility(original)['allowed']
    with pytest.raises(ApplicationError):EmergencyService.recover(**{**recover_args(env,row),'consent':False})
    result=EmergencyService.recover(**recover_args(env,row)); replacement=result.replacement
    original.refresh_from_db()
    assert old==(original.status,original.serial_number,original.appointment_date,original.start_datetime,original.end_datetime,original.booked_service_charge)
    assert replacement.serial_number==other.serial_number+1 and replacement.customer_id==original.customer_id
    assert date_capacity(env['provider'],TODAY)['allocated_count']==0
    assert QueueService.list_provider_queue(organization_id=env['org'].pk,provider_id=env['provider'].pk)[2].count()==0
    assert EmergencyService.recover(**recover_args(env,row)).replacement_id==replacement.pk
    assert Appointment.objects.count()==3
    with pytest.raises(ApplicationError):QueueService.check_in_appointment(appointment=original,actor=original.customer)


@pytest.mark.parametrize('case',['horizon','capacity','hold','foreign','consent'])
def test_recovery_validates_target_and_rolls_back(env,case):
    appt=book(env);incident=declare(env);row=incident.recoveries.get()
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    args=recover_args(env,row)
    if case=='horizon':args['target_date']=TODAY+timedelta(days=4)
    if case=='capacity':
        schedule=env['provider'].weekly_schedules.get(day_of_week=(TODAY+timedelta(days=1)).weekday());schedule.end_time=time(10,10);schedule.save();book(env,on_date=TODAY+timedelta(days=1))
    if case=='hold':args['target_date']=TODAY
    if case=='foreign':args['actor']=env['users']['foreign']
    if case=='consent':args['consent_note']=''
    before=Appointment.objects.count()
    with pytest.raises(ApplicationError):EmergencyService.recover(**args)
    row.refresh_from_db();assert row.resolution=='UNRESOLVED' and row.replacement_id is None and Appointment.objects.count()==before


def test_emergency_cancellation_bypasses_only_explicit_staff_scope(env):
    appt=book(env);incident=declare(env);row=incident.recoveries.get()
    with pytest.raises(ApplicationError):AppointmentService.cancel_appointment(appointment=appt,actor=appt.customer)
    result=EmergencyService.recover(**{**recover_args(env,row,'CANCEL'),'direction':'INBOUND'})
    appt.refresh_from_db();assert result.resolution=='CANCELLED' and appt.cancellation_reason=='Provider Emergency — Customer Requested Cancellation'
    assert appt.serial_number==1 and appt.queue_entry.status=='CANCELLED'
    count=Notification.objects.count();EmergencyService.recover(**{**recover_args(env,row,'CANCEL'),'direction':'INBOUND'})
    assert Notification.objects.count()==count


def test_recovered_active_does_not_block_other_date_and_cannot_complete_original(env):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    active=QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=active.pk)
    incident=declare(env);row=incident.recoveries.get()
    EmergencyService.recover(**{**recover_args(env,row,'CANCEL'),'direction':'INBOUND'})
    with pytest.raises(ApplicationError):QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=active.pk)


def test_customer_projection_private_reason_absent_and_cross_customer_denied(env):
    appt=book(env,customer=env['users']['customer']);declare(env)
    c=client(env,'customer');response=c.get(f'/api/v1/customer/appointments/{appt.pk}/')
    assert response.status_code==200 and response.data['emergency']['hold']
    assert 'PRIVATE MEDICAL' not in str(response.data)
    assert client(env,'foreign').get(f'/api/v1/customer/appointments/{appt.pk}/').status_code==404
    assert client(env,'customer').get(root(env)).status_code==403
    assert 'private_reason' not in client(env,'staff').get(root(env)).data[0]


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('case',['book_declare','call_declare','resume_close','recover_cancel','duplicate_declare','duplicate_recover'])
def test_postgresql_emergency_races(env,case):
    if connection.vendor!='postgresql':pytest.skip('Real PostgreSQL locks required')
    appt=book(env)
    if case=='book_declare':functions=[lambda:book(env),lambda:declare(env)]
    elif case=='duplicate_declare':functions=[lambda:declare(env),lambda:declare(env)]
    elif case=='call_declare':
        QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
        functions=[lambda:QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk),lambda:declare(env)]
    else:
        incident=declare(env)
        if case=='resume_close':
            EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
            functions=[lambda:EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME'),lambda:EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')]
        else:
            EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE');row=incident.recoveries.get()
            functions=[lambda:EmergencyService.recover(**recover_args(env,row)),lambda:EmergencyService.recover(**recover_args(env,row,'CANCEL' if case=='recover_cancel' else 'RESCHEDULE'))]
    barrier=Barrier(2)
    def run(fn):
        close_old_connections();barrier.wait()
        try:fn();return 'ok'
        except ApplicationError:return 'blocked'
        finally:close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:result=list(pool.map(run,functions))
    if case in ['resume_close','recover_cancel']:assert sorted(result)==['blocked','ok']
    assert ProviderEmergency.objects.count()==1
    incident=ProviderEmergency.objects.get()
    if case in ['book_declare','duplicate_declare']:
        assert incident.recoveries.count()==Appointment.objects.count()
        assert incident.communications.count()==Appointment.objects.values('customer_id').distinct().count()
        with pytest.raises(ApplicationError):book(env)
    if case=='call_declare':
        appt.refresh_from_db()
        assert incident.recoveries.filter(appointment=appt).exists()
        assert appt.serial_number==1 and appt.queue_entry.status in ['WAITING','CALLED']
        with pytest.raises(ApplicationError):QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    if case=='duplicate_recover':
        assert result==['ok','ok'] and Appointment.objects.count()==2
        row=EmergencyRecovery.objects.get();assert row.resolution=='RESCHEDULED' and row.replacement_id
    if case=='recover_cancel':
        assert EmergencyRecovery.objects.get().resolution in ['RESCHEDULED','CANCELLED']
        resolved=EmergencyRecovery.objects.get()
        assert Appointment.objects.count()==(2 if resolved.resolution=='RESCHEDULED' else 1)
        appt.refresh_from_db();assert appt.appointment_date==TODAY and appt.serial_number==1
        assert appt.status==('CONFIRMED' if resolved.resolution=='RESCHEDULED' else 'CANCELLED')
    else:assert ProviderEmergency.objects.get().state in ['TEMPORARY','RESUMED','UNAVAILABLE']


def test_explicit_interrupted_outcome_preserves_history_and_releases_only_real_active_guard(env):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    active=QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=active.pk)
    incident=declare(env);row=incident.recoveries.get()
    future=book(env,on_date=TODAY+timedelta(days=1))
    env['clock']['now']=datetime.combine(TODAY+timedelta(days=1),time(10),TZ)
    QueueService.check_in_appointment(appointment=future,actor=future.customer)
    with pytest.raises(ApplicationError):QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    EmergencyService.interrupt(recovery=row,actor=env['users']['staff'])
    active.refresh_from_db();appt.refresh_from_db()
    assert active.status=='IN_PROGRESS' and appt.status=='IN_PROGRESS' and active.started_at==datetime.combine(TODAY,time(10),TZ)
    assert row.incident.recoveries.get().resolution=='UNRESOLVED'
    assert date_capacity(env['provider'],TODAY)['allocated_count']==1
    assert QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk).pk==future.queue_entry.pk


@pytest.mark.parametrize('actor',['provider','manager','customer','anonymous'])
def test_actual_interruption_outcome_authorization(env,actor):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    incident=declare(env);row=incident.recoveries.get()
    response=client(env,actor).post(root(env)+f'{incident.pk}/recoveries/{row.pk}/',{'action':'INTERRUPTED'},format='json')
    assert response.status_code==(200 if actor in ['provider','manager','staff'] else (401 if actor=='anonymous' else 403))
    assert bool(EmergencyRecovery.objects.get().interrupted_at)==(actor in ['provider','manager','staff'])


def test_resume_does_not_reinstate_replaced_customer_or_send_stale_emails(env):
    appt=book(env);incident=declare(env);row=incident.recoveries.get()
    EmergencyService.recover(**{**recover_args(env,row),'direction':'INBOUND'})
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
    EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    assert not EmergencyCommunication.objects.filter(event='RESUMED').exists()
    old=EmergencyCommunication.objects.get();attempt_email(old.pk)
    assert env['sends']==[] and EmergencyCommunication.objects.get().email_state=='UNKNOWN'
    assert summary(appt)['resolution']=='RESCHEDULED'


def test_staff_http_recovery_and_foreign_target_are_scoped(env):
    appt=book(env);incident=declare(env);row=incident.recoveries.get()
    staff=client(env,'staff');endpoint=root(env)+f'{incident.pk}/recoveries/{row.pk}/'
    denied=staff.post(endpoint,{'action':'RESCHEDULE','direction':'INBOUND','consent':False,'consent_note':'Not agreed','target_date':str(TODAY+timedelta(days=1))},format='json')
    assert denied.status_code==400
    response=staff.post(endpoint,{'action':'RESCHEDULE','direction':'INBOUND','consent':True,'consent_note':'Customer specifically requested this date','target_date':str(TODAY+timedelta(days=1))},format='json')
    assert response.status_code==200 and response.data['replacement_id']
    assert client(env,'foreign').post(endpoint,{'action':'CANCEL','direction':'INBOUND','consent':True,'consent_note':'forged'},format='json').status_code==403
    appt.refresh_from_db();assert appt.status=='CONFIRMED' and appt.appointment_date==TODAY


@pytest.mark.parametrize('original_state', ['CALLED', 'IN_PROGRESS'])
def test_interrupted_work_cannot_restart_or_skip_after_resume(env, original_state):
    appt=book(env); QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    entry=QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    if original_state=='IN_PROGRESS':
        QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk)
    incident=declare(env); row=incident.recoveries.get()
    EmergencyService.interrupt(recovery=row,actor=env['users']['provider'])
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
    EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    for fn in [QueueService.start_queue_entry, QueueService.skip_queue_entry]:
        with pytest.raises(ApplicationError): fn(organization_id=env['org'].pk,queue_entry_id=entry.pk)
    entry.refresh_from_db(); assert entry.status==original_state
    if original_state=='IN_PROGRESS':
        QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk)
        row.refresh_from_db(); assert row.resolution=='COMPLETED'


def test_same_organization_other_provider_recovery_keeps_history_and_current_server_charge(env):
    original=book(env)
    target_user=User.objects.create_user(email='replacement@emergency.test')
    member=OrganizationMembership.objects.create(organization=env['org'],user=target_user,role='PROVIDER')
    target=ProviderProfile.objects.create(membership=member,application_status='APPROVED',average_service_minutes=15)
    ProviderService.objects.create(provider=target,service=env['service'],custom_price=1700)
    tomorrow=TODAY+timedelta(days=1)
    WeeklySchedule.objects.create(provider=target,day_of_week=tomorrow.weekday(),start_time=time(10),end_time=time(17))
    occupied=AppointmentService.book_appointment(organization_id=env['org'].pk,provider_id=target.pk,service_id=env['service'].pk,customer=env['users']['customer'],appointment_date=tomorrow)
    incident=declare(env);row=incident.recoveries.get()
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    result=EmergencyService.recover(**{**recover_args(env,row),'target_provider_id':target.pk})
    assert result.replacement.provider_id==target.pk and result.replacement.serial_number==occupied.serial_number+1
    assert result.replacement.booked_service_charge==1700
    original.refresh_from_db();assert original.booked_service_charge==1200 and original.appointment_date==TODAY and original.serial_number==1
    assert result.original_snapshot['provider_id']==str(env['provider'].pk)


def test_foreign_target_and_inactive_membership_are_denied(env):
    appt=book(env);incident=declare(env);row=incident.recoveries.get()
    user=User.objects.create_user(email='foreign-provider@emergency.test')
    member=OrganizationMembership.objects.create(organization=env['foreign'],user=user,role='PROVIDER')
    foreign=ProviderProfile.objects.create(membership=member,application_status='APPROVED',average_service_minutes=10)
    with pytest.raises(ApplicationError):EmergencyService.recover(**{**recover_args(env,row),'direction':'INBOUND','target_provider_id':foreign.pk})
    OrganizationMembership.objects.filter(user=env['users']['staff']).update(is_active=False)
    with pytest.raises(ApplicationError):EmergencyService.recover(**{**recover_args(env,row,'CANCEL'),'direction':'INBOUND'})
    row.refresh_from_db();appt.refresh_from_db();assert row.resolution=='UNRESOLVED' and appt.status=='CONFIRMED'


def test_confirmed_closure_allows_outbound_calls_before_scheduled_end(env):
    book(env);incident=declare(env);row=incident.recoveries.get()
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    assert env['clock']['now'].time()<time(17)
    result=EmergencyService.contact(recovery=row,actor=env['users']['staff'],direction='OUTBOUND',outcome='UNREACHABLE',note='No response',request_id=uuid.uuid4())
    assert result.resolution=='UNRESOLVED' and len(result.contact_attempts)==1
    assert Appointment.objects.get().status=='CONFIRMED'


def test_resume_restores_original_checked_in_serial_order(env):
    first=book(env);second=book(env)
    for appt in [second,first]:QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    incident=declare(env)
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
    with pytest.raises(ApplicationError):QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    assert QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk).appointment_id==first.pk
    assert first.serial_number<second.serial_number


@pytest.mark.parametrize('kind',['exception','accepted_without_id'])
def test_ambiguous_email_not_blindly_retried(env,monkeypatch,django_capture_on_commit_callbacks,kind):
    book(env);attempts=[]
    def send(**kwargs):
        attempts.append(kwargs['idempotency_key'])
        if kind=='exception':raise RuntimeError('Synthetic uncertain transport failure')
        return SimpleNamespace(success=True,email_id=None,error=None)
    monkeypatch.setattr('apps.contact.email_service.send_emergency_notification',send)
    with django_capture_on_commit_callbacks(execute=True):declare(env)
    delivery=EmergencyCommunication.objects.get()
    assert delivery.email_state=='UNKNOWN' and ProviderEmergency.objects.get().state=='TEMPORARY'
    attempt_email(delivery.pk);assert len(attempts)==1 and delivery.notification_id


def test_historical_duplicate_customer_receives_one_notice_without_record_reconciliation(env,django_capture_on_commit_callbacks):
    first=book(env)
    second=Appointment.objects.create(organization=first.organization,provider=first.provider,service=first.service,customer=first.customer,
        appointment_date=first.appointment_date,start_datetime=first.start_datetime,end_datetime=first.end_datetime,status='CONFIRMED',serial_number=2)
    QueueEntry.objects.create(organization=first.organization,provider=first.provider,appointment=second,queue_date=TODAY,token_number=2,serial_number=2)
    with django_capture_on_commit_callbacks(execute=True):incident=declare(env)
    assert incident.recoveries.count()==2 and incident.communications.count()==1 and len(env['sends'])==1
    assert Appointment.objects.count()==2 and QueueEntry.objects.count()==2
    assert all(appt.status=='CONFIRMED' for appt in Appointment.objects.all())



def test_past_incident_cannot_capture_only_current_active_work_and_bypass_manager_end_guard(env):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    with pytest.raises(ApplicationError):
        EmergencyService.declare(provider=env['provider'],actor=env['users']['manager'],service_date=TODAY-timedelta(days=1))
    assert not ProviderEmergency.objects.exists() and QueueEntry.objects.get(appointment=appt).status=='CALLED'



def repeat_episode_setup(env):
    env['clock']['now']=datetime.combine(TODAY,time(8),TZ)
    appt=book(env,customer=env['users']['customer'])
    incident=declare(env)
    row=incident.recoveries.get()
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
    EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    EmergencyService.contact(recovery=row,actor=env['users']['staff'],direction='OUTBOUND',outcome='ATTENDING',note='Customer confirmed attendance',request_id=uuid.uuid4())
    AppointmentService.reschedule_appointment(appointment=appt,appointment_date=TODAY+timedelta(days=1),actor=appt.customer)
    appt.refresh_from_db()
    AppointmentService.reschedule_appointment(appointment=appt,appointment_date=TODAY,actor=appt.customer)
    appt.refresh_from_db(); row.refresh_from_db();incident.refresh_from_db()
    return appt,incident,row


def test_repeat_emergency_after_same_appointment_reschedules_away_and_back(env,django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):appt,previous,old_row=repeat_episode_setup(env)
    history=(old_row.original_snapshot,old_row.contact_attempts,old_row.resolution,old_row.resolved_at,previous.declared_at,previous.resumed_at)
    assert old_row.resolution=='CUSTOMER_RESCHEDULED' and appt.serial_number>old_row.original_snapshot['serial']
    with django_capture_on_commit_callbacks(execute=True): current=declare(env)
    assert current.pk!=previous.pk and current.state=='TEMPORARY'
    fresh=current.recoveries.get(appointment=appt)
    assert fresh.resolution=='UNRESOLVED' and fresh.original_snapshot['serial']==appt.serial_number
    old_row.refresh_from_db();previous.refresh_from_db()
    assert history==(old_row.original_snapshot,old_row.contact_attempts,old_row.resolution,old_row.resolved_at,previous.declared_at,previous.resumed_at)
    assert previous.state=='RESUMED' and EmergencyRecovery.objects.filter(appointment=appt).count()==2
    before=(Notification.objects.count(),EmergencyCommunication.objects.count(),len(env['sends']))
    with django_capture_on_commit_callbacks(execute=True):assert declare(env).pk==current.pk
    assert before==(Notification.objects.count(),EmergencyCommunication.objects.count(),len(env['sends']))
    assert EmergencyCommunication.objects.filter(event='DECLARED',customer=appt.customer).count()==2
    assert Notification.objects.filter(recipient=appt.customer,kind='PROVIDER_EMERGENCY_DECLARED').count()==2
    assert len({args['idempotency_key'] for args in env['sends']})==len(env['sends'])
    response=client(env,'staff').get(root(env),{'service_date':str(TODAY)})
    assert response.data[0]['id']==str(current.pk) and response.data[0]['recoveries'][0]['resolution']=='UNRESOLVED'
    assert summary(appt)['incident_id']==str(current.pk) and summary(appt)['hold']


def test_new_incident_retains_unfinished_interruption_and_skips_old_resume_email(env):
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    first=declare(env);row=first.recoveries.get()
    EmergencyService.interrupt(recovery=row,actor=env['users']['provider']);row.refresh_from_db()
    EmergencyService.transition(incident=first,actor=env['users']['provider'],action='REQUEST_RESUME')
    EmergencyService.transition(incident=first,actor=env['users']['manager'],action='APPROVE_RESUME')
    old_send=first.communications.get(event='RESUMED')
    second=declare(env);new_row=second.recoveries.get(appointment=appt)
    assert new_row.interrupted_at==row.interrupted_at and new_row.resolution=='UNRESOLVED'
    assert operational_entries(QueueEntry.objects).filter(appointment=appt).count()==0
    attempt_email(old_send.pk);old_send.refresh_from_db()
    assert old_send.email_state=='UNKNOWN' and old_send.attempts==0 and not env['sends']


def test_positive_resumption_notices_email_attempt_and_staff_attendance_tracking(env,django_capture_on_commit_callbacks):
    appt=book(env)
    with django_capture_on_commit_callbacks(execute=True):incident=declare(env)
    with django_capture_on_commit_callbacks(execute=True):
        EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
        resumed=EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    notice=Notification.objects.get(recipient=appt.customer,kind='PROVIDER_EMERGENCY_RESUMED')
    delivery=EmergencyCommunication.objects.get(incident=incident,event='RESUMED',customer=appt.customer)
    assert notice.appointment_id==appt.pk and delivery.notification_id==notice.pk
    assert delivery.email_state=='ACCEPTED' and delivery.attempts==1 and len(env['sends'])==2
    before=(Notification.objects.count(),len(env['sends']))
    with django_capture_on_commit_callbacks(execute=True):EmergencyService.transition(incident=resumed,actor=env['users']['manager'],action='APPROVE_RESUME')
    assert before==(Notification.objects.count(),len(env['sends']))
    row=incident.recoveries.get()
    response=client(env,'staff').post(root(env)+f'{incident.pk}/recoveries/{row.pk}/',{'action':'CONTACT','direction':'OUTBOUND','outcome':'ATTENDING','note':'Customer confirmed attendance','request_id':str(uuid.uuid4())},format='json')
    assert response.status_code==200 and response.data['contact_attempts'][-1]['outcome']=='ATTENDING'
    appt.refresh_from_db();row.refresh_from_db()
    assert row.resolution=='UNRESOLVED' and appt.status=='CONFIRMED' and appt.serial_number==1
    assert not appt.queue_entry.is_checked_in  # Attendance agreement is not physical check-in.


@pytest.mark.parametrize('action',['RESCHEDULE','CANCEL'])
def test_next_day_unresolved_visibility_and_staff_recovery(env,action):
    appt=book(env,customer=env['users']['customer']);incident=declare(env);row=incident.recoveries.get()
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    env['clock']['now']=datetime.combine(TODAY+timedelta(days=1),time(10),TZ)
    customer=client(env,'customer')
    detail=customer.get(f'/api/v1/customer/appointments/{appt.pk}/')
    assert detail.status_code==200 and detail.data['emergency']['resolution']=='UNRESOLVED'
    assert detail.data['appointment_date']==str(TODAY) and detail.data['serial_number']==1
    dashboard=customer.get('/api/v1/customer/dashboard/')
    assert any(str(item['id'])==str(appt.pk) and item['emergency']['hold'] for item in dashboard.data)
    staff=client(env,'staff');rows=staff.get(root(env),{'service_date':str(TODAY)})
    assert rows.status_code==200 and rows.data[0]['unresolved_count']==1
    payload={'action':action,'direction':'OUTBOUND','consent':True,'consent_note':'Customer expressly requested this outcome'}
    if action=='RESCHEDULE':payload['target_date']=str(TODAY+timedelta(days=2))
    result=staff.post(root(env)+f'{incident.pk}/recoveries/{row.pk}/',payload,format='json')
    assert result.status_code==200
    row.refresh_from_db();appt.refresh_from_db()
    assert row.resolution==('RESCHEDULED' if action=='RESCHEDULE' else 'CANCELLED')
    assert appt.appointment_date==TODAY and appt.serial_number==1 and appt.queue_entry.queue_date==TODAY
    if action=='RESCHEDULE':assert row.replacement.appointment_date==TODAY+timedelta(days=2) and appt.status=='CONFIRMED'
    else:assert appt.status=='CANCELLED' and appt.cancellation_reason=='Provider Emergency — Customer Requested Cancellation'


@pytest.mark.parametrize('case,expected',[('timeout','UNKNOWN'),('server_error','UNKNOWN'),('validation_error','FAILED'),('rate_limit','FAILED')])
def test_real_adapter_boundary_classifies_uncertain_outcome_and_controls_retry(env,monkeypatch,django_capture_on_commit_callbacks,case,expected):
    book(env)
    monkeypatch.setattr('apps.contact.email_service.send_emergency_notification',real_emergency_adapter)
    monkeypatch.setattr('apps.contact.email_service._get_config',lambda:{'api_key':'synthetic-test-key','from_email':'sender@example.test','from_name':'QueueTurn','support_email':'support@example.test'})
    error=TimeoutError('Synthetic uncertain network timeout') if case=='timeout' else ResendError(code={'server_error':503,'validation_error':422,'rate_limit':429}[case],error_type=case,message='Synthetic SDK failure',suggested_action='Test only')
    sdk=Mock(side_effect=error);monkeypatch.setattr('apps.contact.email_service.resend.Emails.send',sdk)
    with django_capture_on_commit_callbacks(execute=True):incident=declare(env)
    delivery=incident.communications.get();assert delivery.email_state==expected and delivery.attempts==1
    assert ProviderEmergency.objects.get().state=='TEMPORARY' and Notification.objects.filter(kind='PROVIDER_EMERGENCY_DECLARED').count()==1
    key=sdk.call_args.kwargs['options']['idempotency_key']
    sdk.side_effect=None;sdk.return_value={'id':'synthetic-accepted-id'}
    response=client(env,'manager').post(root(env)+f'{incident.pk}/action/',{'action':'RETRY_EMAILS'},format='json')
    assert response.status_code==200
    delivery.refresh_from_db()
    if expected=='UNKNOWN':assert sdk.call_count==1 and delivery.attempts==1 and delivery.email_state=='UNKNOWN'
    else:
        assert sdk.call_count==2 and delivery.email_state=='ACCEPTED' and delivery.attempts==2
        assert sdk.call_args.kwargs['options']['idempotency_key']==key
    assert 'DELIVERED' not in response.data['email_states']


@pytest.mark.parametrize('state',['CALLED','IN_PROGRESS'])
def test_interrupted_legacy_null_date_blocks_duplicate_after_resume_without_rewriting(env,state):
    appt=book(env,customer=env['users']['customer']);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    if state=='IN_PROGRESS':QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=appt.queue_entry.pk)
    appt.appointment_date=None;appt.save(update_fields=['appointment_date'])
    incident=declare(env);row=incident.recoveries.get();EmergencyService.interrupt(recovery=row,actor=env['users']['staff'])
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='REQUEST_RESUME')
    EmergencyService.transition(incident=incident,actor=env['users']['manager'],action='APPROVE_RESUME')
    with pytest.raises(ApplicationError):book(env,customer=appt.customer)
    appt.refresh_from_db()
    assert appt.appointment_date is None and appt.queue_entry.status==state and Appointment.objects.count()==1
    assert date_capacity(env['provider'],TODAY)['allocated_count']==1
    assert book(env,customer=appt.customer,on_date=TODAY+timedelta(days=1)).appointment_date==TODAY+timedelta(days=1)


def test_null_date_fallback_uses_dhaka_midnight_and_explicit_date_remains_authoritative(env):
    customer=env['users']['customer'];tomorrow=TODAY+timedelta(days=1)
    legacy=book(env,customer=customer,on_date=tomorrow)
    legacy.appointment_date=None
    legacy.start_datetime=datetime.combine(TODAY,time(23,30),ZoneInfo('UTC'))
    legacy.end_datetime=legacy.start_datetime+timedelta(minutes=10)
    legacy.save(update_fields=['appointment_date','start_datetime','end_datetime'])
    with pytest.raises(ApplicationError):book(env,customer=customer,on_date=tomorrow)
    today=book(env,customer=customer)
    assert today.appointment_date==TODAY and date_capacity(env['provider'],tomorrow)['allocated_count']==1
    legacy.refresh_from_db();assert legacy.appointment_date is None
    other_customer=User.objects.create_user(email='explicit-date@emergency.test')
    explicit=book(env,customer=other_customer,on_date=tomorrow)
    explicit.start_datetime=datetime.combine(TODAY,time(10),TZ);explicit.save(update_fields=['start_datetime'])
    assert book(env,customer=other_customer).appointment_date==TODAY


def test_null_date_target_blocks_self_reschedule_and_restore(env):
    env['clock']['now']=datetime.combine(TODAY,time(8),TZ)
    original=book(env,customer=env['users']['customer']);target=book(env,customer=original.customer,on_date=TODAY+timedelta(days=1))
    target.appointment_date=None;target.save(update_fields=['appointment_date'])
    with pytest.raises(ApplicationError):AppointmentService.reschedule_appointment(appointment=original,appointment_date=TODAY+timedelta(days=1),actor=original.customer)
    original.refresh_from_db();assert original.appointment_date==TODAY and original.serial_number==1
    env['clock']['now']=datetime.combine(TODAY,time(10),TZ)
    QueueService.check_in_appointment(appointment=original,actor=original.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.skip_queue_entry(organization_id=env['org'].pk,queue_entry_id=original.queue_entry.pk)
    new=book(env,customer=original.customer);new.appointment_date=None;new.save(update_fields=['appointment_date'])
    with pytest.raises(ApplicationError):QueueService.restore_queue_entry(organization_id=env['org'].pk,queue_entry_id=original.queue_entry.pk,actor=env['users']['staff'])
    original.refresh_from_db();assert original.status=='NO_SHOW' and original.queue_entry.status=='SKIPPED'


@pytest.mark.django_db(transaction=True)
def test_postgresql_repeat_declaration_is_one_new_incident_and_association(env):
    if connection.vendor!='postgresql':pytest.skip('Real PostgreSQL locks required')
    appt,previous,old_row=repeat_episode_setup(env)
    barrier=Barrier(2)
    def run(_):
        close_old_connections();barrier.wait()
        try:return EmergencyService.declare(provider=env['provider'],actor=env['users']['provider'],service_date=TODAY).pk
        finally:close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:ids=list(pool.map(run,[1,2]))
    assert len(set(ids))==1 and ids[0]!=previous.pk
    assert ProviderEmergency.objects.count()==2 and ProviderEmergency.objects.filter(state='TEMPORARY').count()==1
    assert EmergencyRecovery.objects.filter(appointment=appt).count()==2
    assert EmergencyCommunication.objects.filter(incident_id=ids[0],event='DECLARED').count()==1
    old_row.refresh_from_db();assert old_row.resolution=='CUSTOMER_RESCHEDULED'


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('action',['RESCHEDULE','CANCEL'])
def test_postgresql_completion_versus_interrupted_recovery_has_one_consistent_outcome(env,action):
    if connection.vendor!='postgresql':pytest.skip('Real PostgreSQL locks required')
    appt=book(env);QueueService.check_in_appointment(appointment=appt,actor=appt.customer)
    entry=QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk)
    prior=book(env,on_date=TODAY+timedelta(days=1))
    incident=declare(env);row=incident.recoveries.get()
    EmergencyService.interrupt(recovery=row,actor=env['users']['provider'])
    EmergencyService.transition(incident=incident,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    env['clock']['now']=datetime.combine(TODAY,time(11),TZ)
    functions=[lambda:QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=entry.pk,actor=env['users']['provider']),lambda:EmergencyService.recover(**recover_args(env,row,action))]
    barrier=Barrier(2)
    def run(fn):
        close_old_connections();barrier.wait()
        try:fn();return 'ok'
        except ApplicationError:return 'blocked'
        finally:close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,functions))
    assert sorted(results)==['blocked','ok']
    row.refresh_from_db();appt.refresh_from_db();entry.refresh_from_db()
    assert appt.appointment_date==TODAY and appt.serial_number==1 and entry.started_at==datetime.combine(TODAY,time(10),TZ)
    assert operational_entries(QueueEntry.objects).filter(provider=env['provider'],status__in=QueueEntry.ACTIVE_STATUSES).count()==0
    if row.resolution=='COMPLETED':
        assert appt.status==entry.status=='COMPLETED' and row.replacement_id is None and Appointment.objects.count()==2
        assert Notification.objects.filter(kind='SERVICE_COMPLETED').count()==1
    elif action=='RESCHEDULE':
        assert row.resolution=='RESCHEDULED' and appt.status==entry.status=='IN_PROGRESS' and entry.completed_at is None
        assert row.replacement.serial_number==prior.serial_number+1 and Appointment.objects.count()==3
        assert operational_appointments(Appointment.objects).filter(customer=appt.customer,appointment_date=TODAY+timedelta(days=1),status__in=Appointment.BLOCKING_STATUSES).count()==1
        assert not Notification.objects.filter(kind='SERVICE_COMPLETED').exists()
    else:
        assert row.resolution=='CANCELLED' and appt.status==entry.status=='CANCELLED' and entry.completed_at is None
        assert row.replacement_id is None and Appointment.objects.count()==2
        assert not Notification.objects.filter(kind='SERVICE_COMPLETED').exists()



def test_incident_constraint_allows_history_but_only_one_active_or_final_hold(env):
    book(env);first=declare(env)
    EmergencyService.transition(incident=first,actor=env['users']['provider'],action='REQUEST_RESUME')
    EmergencyService.transition(incident=first,actor=env['users']['manager'],action='APPROVE_RESUME')
    current=declare(env)
    assert current.pk!=first.pk and ProviderEmergency.objects.count()==2
    with pytest.raises(IntegrityError),transaction.atomic():
        ProviderEmergency.objects.create(provider=env['provider'],service_date=TODAY,state='TEMPORARY',declared_by=env['users']['provider'],declared_at=env['clock']['now'])
    EmergencyService.transition(incident=current,actor=env['users']['provider'],action='CONFIRM_UNAVAILABLE')
    with pytest.raises(IntegrityError),transaction.atomic():
        ProviderEmergency.objects.create(provider=env['provider'],service_date=TODAY,state='TEMPORARY',declared_by=env['users']['provider'],declared_at=env['clock']['now'])
    assert declare(env).pk==current.pk
    with pytest.raises(ApplicationError):EmergencyService.transition(incident=current,actor=env['users']['manager'],action='APPROVE_RESUME')
    assert ProviderEmergency.objects.filter(state='UNAVAILABLE').count()==1
