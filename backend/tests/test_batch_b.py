"""Approved Batch B allocation, leave, provider-average and live telemetry rules."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from threading import Barrier
from zoneinfo import ZoneInfo
import uuid

import pytest
from django.db import close_old_connections, connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.capacity import date_capacity
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.appointments.booking_policy import ETA_UNAVAILABLE_MESSAGE
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, ProviderLeave, WeeklySchedule, ScheduleBreak
from apps.providers.services import ProviderService_ as ProviderOps
from apps.providers.leave_requests import LeaveRequestService
from apps.providers.duration import average_service_minutes
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService
from apps.notifications.models import Notification
from apps.services.models import Service
from config.exceptions import ApplicationError

TZ = ZoneInfo('Asia/Dhaka')
TODAY = date(2026, 10, 12)


def at(on_date=TODAY, hour=10, minute=0):
    return datetime.combine(on_date, time(hour, minute), TZ)


@pytest.fixture
def env(db, monkeypatch):
    monkeypatch.setattr(timezone, 'now', lambda: at(hour=7))
    org = Organization.objects.create(name='Batch B', slug='batch-b', verification_status='APPROVED')
    foreign = Organization.objects.create(name='Foreign B', slug='foreign-b', verification_status='APPROVED')
    users = {role: User.objects.create_user(email=role+'@batch-b.test') for role in ['provider', 'manager', 'staff', 'customer', 'foreign', 'admin']}
    memberships = {}
    for role in ['provider', 'manager', 'staff']:
        memberships[role] = OrganizationMembership.objects.create(organization=org, user=users[role], role=role.upper())
    OrganizationMembership.objects.create(organization=foreign, user=users['foreign'], role='MANAGER')
    users['admin'].is_staff = True; users['admin'].save()
    provider = ProviderProfile.objects.create(membership=memberships['provider'], application_status='APPROVED', average_service_minutes=10)
    service = Service.objects.create(organization=org, name='Consultation', price=1000, duration_minutes=25)
    ProviderService.objects.create(provider=provider, service=service, custom_duration_minutes=40)
    for weekday in range(7):
        WeeklySchedule.objects.create(provider=provider, day_of_week=weekday, start_time=time(10), end_time=time(17))
    return dict(org=org, foreign=foreign, users=users, provider=provider, service=service, memberships=memberships)


def book(env, on_date=TODAY, customer=None, **kwargs):
    customer = customer or User.objects.create_user(email=uuid.uuid4().hex+'@batch-b.test')
    return AppointmentService.book_appointment(organization_id=env['org'].pk, provider_id=env['provider'].pk,
        service_id=env['service'].pk, customer=customer, appointment_date=on_date, **kwargs)


def committed(env, on_date, serial, status='CONFIRMED'):
    customer = User.objects.create_user(email=uuid.uuid4().hex+'@batch-b.test')
    appt = Appointment.objects.create(organization=env['org'], provider=env['provider'], service=env['service'], customer=customer,
        appointment_date=on_date, start_datetime=at(on_date), end_datetime=at(on_date)+timedelta(minutes=10), serial_number=serial, status=status)
    QueueEntry.objects.create(organization=env['org'], provider=env['provider'], appointment=appt, queue_date=on_date,
        serial_number=serial, token_number=serial, status='WAITING')
    return appt


def client(env, role):
    result = APIClient()
    if role != 'anonymous': result.force_authenticate(env['users'][role])
    return result


def break30(env, on_date=TODAY):
    return ScheduleBreak.objects.create(weekly_schedule=env['provider'].weekly_schedules.get(day_of_week=on_date.weekday()),
        title='Internal note', start_time=time(13), end_time=time(13, 30))


@pytest.mark.parametrize('intervals,expected', [
    ([], 39), ([(14,0,16,0)],27), ([(13,15,15,15)],28),
    ([(9,0,18,0)],0), ([(10,0,13,30),(13,30,17,0)],0), ([(8,0,11,0)],33),
])
def test_clipped_union_capacity(env, intervals, expected):
    break30(env)
    for sh,sm,eh,em in intervals:
        ProviderLeave.objects.create(provider=env['provider'], start_datetime=at(hour=sh,minute=sm),
            end_datetime=at(hour=eh,minute=em), status='APPROVED')
    assert date_capacity(env['provider'], TODAY)['daily_capacity'] == expected


@pytest.mark.parametrize('status', ['PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW'])
def test_all_uncancelled_allocations_consume_capacity(env, status):
    schedule=env['provider'].weekly_schedules.get(day_of_week=TODAY.weekday()); schedule.end_time=time(10,10); schedule.save()
    committed(env,TODAY,1,status)
    assert date_capacity(env['provider'],TODAY)['remaining_capacity']==0
    with pytest.raises(ApplicationError): book(env)
    assert Appointment.objects.count()==1 and QueueEntry.objects.count()==1


def test_cancellation_releases_allocation_without_serial_reuse(env):
    schedule=env['provider'].weekly_schedules.get(day_of_week=TODAY.weekday()); schedule.end_time=time(10,20); schedule.save()
    first,second=book(env),book(env)
    AppointmentService.cancel_appointment(appointment=first,actor=first.customer)
    third=book(env)
    assert third.serial_number==3 and third.queue_entry.token_number==3
    assert date_capacity(env['provider'],TODAY)['allocated_count']==2


def test_progress_updates_eta_not_fixed_allocation_budget(env,monkeypatch):
    first,second=book(env),book(env)
    monkeypatch.setattr(timezone,'now',lambda: at(hour=10))
    QueueService.check_in_appointment(appointment=first,actor=first.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=first.queue_entry.pk)
    before=QueueService.calculate_readiness_and_eta(second.queue_entry)
    monkeypatch.setattr(timezone,'now',lambda: at(hour=10,minute=5))
    QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=first.queue_entry.pk)
    after=QueueService.calculate_readiness_and_eta(second.queue_entry)
    assert before['estimated_start_time']==at(hour=10,minute=10).isoformat()
    assert after['estimated_start_time']==at(hour=10,minute=5).isoformat()
    assert date_capacity(env['provider'],TODAY)['allocated_count']==2
    assert date_capacity(env['provider'],TODAY)['daily_capacity']==42
    assert book(env).serial_number==3  # Unused fixed capacity remains bookable after start.



def test_long_actual_service_moves_eta_without_releasing_capacity(env, monkeypatch):
    first, second = book(env), book(env)
    monkeypatch.setattr(timezone, 'now', lambda: at())
    QueueService.check_in_appointment(appointment=first, actor=first.customer)
    QueueService.call_next(organization_id=env['org'].pk, provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk, queue_entry_id=first.queue_entry.pk)
    monkeypatch.setattr(timezone, 'now', lambda: at(minute=15))
    info = QueueService.calculate_readiness_and_eta(second.queue_entry)
    assert info['is_delayed'] and info['eta_reliable']
    assert info['estimated_start_time'] == at(minute=15).isoformat()
    assert QueueEntry.objects.get(appointment=first).status == 'IN_PROGRESS'
    assert date_capacity(env['provider'], TODAY)['allocated_count'] == 2
    assert date_capacity(env['provider'], TODAY)['daily_capacity'] == 42
    QueueService.complete_queue_entry(organization_id=env['org'].pk, queue_entry_id=first.queue_entry.pk)
    assert date_capacity(env['provider'], TODAY)['allocated_count'] == 2


def test_current_active_service_does_not_shift_future_planning(env, monkeypatch):
    today = book(env)
    future = book(env, on_date=TODAY+timedelta(days=1))
    monkeypatch.setattr(timezone, 'now', lambda: at())
    QueueService.check_in_appointment(appointment=today, actor=today.customer)
    QueueService.call_next(organization_id=env['org'].pk, provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk, queue_entry_id=today.queue_entry.pk)
    assert QueueService.calculate_readiness_and_eta(future.queue_entry)['estimated_start_time'] == at(TODAY+timedelta(days=1)).isoformat()

def test_partial_leave_same_booking_and_reschedule_capacity(env):
    destination=TODAY+timedelta(days=1)
    ProviderLeave.objects.create(provider=env['provider'],start_datetime=at(destination,14),end_datetime=at(destination,16),status='APPROVED')
    appt=book(env)
    AppointmentService.reschedule_appointment(appointment=appt,appointment_date=destination,actor=appt.customer)
    other=book(env,on_date=destination)
    assert other.serial_number==2 and date_capacity(env['provider'],destination)['daily_capacity']==30
    assert Appointment.objects.get(pk=appt.pk).booked_service_charge==1000


@pytest.mark.parametrize('offset,allowed',[(3,False),(4,True)])
def test_planned_leave_notice_and_pending_not_effective(env,offset,allowed):
    on_date=TODAY+timedelta(days=offset)
    args=dict(provider=env['provider'],actor=env['users']['provider'],start_datetime=at(on_date),end_datetime=at(on_date,17))
    if allowed:
        leave=LeaveRequestService.submit(**args)
        assert leave.status=='PENDING' and date_capacity(env['provider'],on_date)['daily_capacity']==42
    else:
        with pytest.raises(ApplicationError): LeaveRequestService.submit(**args)
        assert not ProviderLeave.objects.exists()


def test_leave_conflict_submitted_then_blocked_until_genuinely_resolved(env):
    on_date=TODAY+timedelta(days=4); break30(env,on_date)
    bookings=[committed(env,on_date,i+1) for i in range(30)]
    leave=LeaveRequestService.submit(provider=env['provider'],actor=env['users']['provider'],start_datetime=at(on_date,14),end_datetime=at(on_date,16))
    before=list(Appointment.objects.values_list('pk','status','appointment_date','serial_number'))
    with pytest.raises(ApplicationError): LeaveRequestService.review(leave=leave,actor=env['users']['manager'],decision='APPROVED')
    assert list(Appointment.objects.values_list('pk','status','appointment_date','serial_number'))==before
    assert ProviderLeave.objects.get(pk=leave.pk).status=='PENDING'
    for appt in bookings: AppointmentService.cancel_appointment(appointment=appt,actor=env['users']['manager'])
    approved=LeaveRequestService.review(leave=leave,actor=env['users']['manager'],decision='APPROVED')
    assert approved.status=='APPROVED' and approved.reviewed_by==env['users']['manager']
    assert date_capacity(env['provider'],on_date)['daily_capacity']==27
    assert Appointment.objects.count()==30  # Resolution retains history; nothing silently deleted.


@pytest.mark.parametrize('role',['provider','staff','customer','foreign','admin','anonymous'])
def test_leave_approval_requires_active_own_manager(env,role):
    on_date=TODAY+timedelta(days=4)
    leave=LeaveRequestService.submit(provider=env['provider'],actor=env['users']['provider'],start_datetime=at(on_date),end_datetime=at(on_date,17))
    url=f"/api/v1/organizations/{env['org'].pk}/providers/{env['provider'].pk}/leaves/{leave.pk}/review/"
    response=client(env,role).post(url,{'decision':'APPROVED'},format='json')
    assert response.status_code in [401,403,404]
    assert ProviderLeave.objects.get(pk=leave.pk).status=='PENDING'


def test_legacy_leave_unknown_approval_preserved_as_effective(env):
    ProviderLeave.objects.create(provider=env['provider'],start_datetime=at(),end_datetime=at(hour=17),status=None)
    assert date_capacity(env['provider'],TODAY)['daily_capacity']==0


def test_provider_average_ignores_competing_service_and_assignment_sources(env):
    appt=book(env)
    assert (appt.end_datetime-appt.start_datetime).total_seconds()==600
    assert average_service_minutes(env['provider'])==10


def test_ambiguous_legacy_duration_is_explicitly_unavailable(env):
    provider=env['provider']; provider.average_service_minutes=None; provider.save()
    assert average_service_minutes(provider)==40  # One legitimate existing assignment, no DB backfill.
    second=Service.objects.create(organization=env['org'],name='Second',duration_minutes=20,price=100)
    ProviderService.objects.create(provider=provider,service=second)
    with pytest.raises(ApplicationError): average_service_minutes(provider)
    assert ProviderProfile.objects.get(pk=provider.pk).average_service_minutes is None


def test_unsafe_duration_change_blocks_without_displacement(env):
    schedule=env['provider'].weekly_schedules.get(day_of_week=TODAY.weekday()); schedule.end_time=time(10,20); schedule.save()
    book(env);book(env)
    with pytest.raises(ApplicationError): ProviderOps.update_provider_profile(profile=env['provider'],actor=env['users']['manager'],average_service_minutes=20)
    assert ProviderProfile.objects.get(pk=env['provider'].pk).average_service_minutes==10
    assert Appointment.objects.count()==2


def test_legacy_catalog_duration_cannot_silently_change_queue_average(env):
    from apps.services.services import ServiceService
    env['provider'].average_service_minutes=None; env['provider'].save()
    with pytest.raises(ApplicationError): ServiceService.update_service(service=env['service'],duration_minutes=30)
    env['service'].refresh_from_db(); assert env['service'].duration_minutes==25
    ProviderOps.update_provider_profile(profile=env['provider'],actor=env['users']['manager'],average_service_minutes=10)
    assert ServiceService.update_service(service=env['service'],duration_minutes=30).duration_minutes==30


@pytest.mark.parametrize('value',[0,-1,None])
def test_provider_average_validation(env,value):
    url=f"/api/v1/organizations/{env['org'].pk}/providers/{env['provider'].pk}/"
    assert client(env,'manager').patch(url,{'average_service_minutes':value},format='json').status_code==400
    assert ProviderProfile.objects.get(pk=env['provider'].pk).average_service_minutes==10


@pytest.mark.parametrize('buffer',[15,20,25,30])
def test_manager_buffer_configuration_and_subsequent_arrival(env,buffer):
    url=f"/api/v1/organizations/{env['org'].pk}/"
    response=client(env,'manager').patch(url,{'arrival_buffer_minutes':buffer},format='json')
    assert response.status_code==200
    first,second=book(env),book(env)
    assert QueueService.calculate_readiness_and_eta(first.queue_entry)['recommended_arrival_time']==at(hour=9,minute=55).isoformat()
    assert QueueService.calculate_readiness_and_eta(second.queue_entry)['recommended_arrival_time']==(at(hour=10,minute=10)-timedelta(minutes=buffer)).isoformat()


@pytest.mark.parametrize('value',[5,10,35,0])
def test_buffer_invalid_values_rejected(env,value):
    assert client(env,'manager').patch(f"/api/v1/organizations/{env['org'].pk}/",{'arrival_buffer_minutes':value},format='json').status_code==400
    assert Organization.objects.get(pk=env['org'].pk).arrival_buffer_minutes==15


@pytest.mark.parametrize('role',['provider','staff','customer','foreign','admin','anonymous'])
def test_buffer_role_and_tenant_boundaries(env,role):
    response=client(env,role).patch(f"/api/v1/organizations/{env['org'].pk}/",{'arrival_buffer_minutes':20},format='json')
    assert response.status_code in [401,403,404]
    assert Organization.objects.get(pk=env['org'].pk).arrival_buffer_minutes==15


@pytest.mark.parametrize('minutes,state',[(26,'NOT_YET'),(25,'GET_READY'),(16,'GET_READY'),(15,'BE_READY'),(0,'BE_READY')])
def test_time_first_readiness_boundaries(env,monkeypatch,minutes,state):
    appt=book(env)
    monkeypatch.setattr(timezone,'now',lambda: at()-timedelta(minutes=minutes))
    assert QueueService.calculate_readiness_and_eta(appt.queue_entry)['readiness_state']==state


def test_first_effective_serial_after_cancel_and_not_after_completion(env,monkeypatch):
    first,second,third=book(env),book(env),book(env)
    AppointmentService.cancel_appointment(appointment=first,actor=first.customer)
    assert QueueService.calculate_readiness_and_eta(second.queue_entry)['recommended_arrival_time']==at(hour=9,minute=55).isoformat()
    monkeypatch.setattr(timezone,'now',lambda: at())
    QueueService.check_in_appointment(appointment=second,actor=second.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=second.queue_entry.pk)
    QueueService.complete_queue_entry(organization_id=env['org'].pk,queue_entry_id=second.queue_entry.pk)
    assert QueueService.calculate_readiness_and_eta(third.queue_entry)['recommended_arrival_time']==at(hour=9,minute=45).isoformat()
    assert Appointment.objects.get(pk=second.pk).serial_number==2


def test_forecast_reservations_and_actual_presence_are_distinct(env):
    first,second=book(env),book(env)
    info=QueueService.calculate_readiness_and_eta(second.queue_entry)
    assert info['scheduled_ahead']==1 and info['checked_in_ahead']==0
    assert info['estimated_start_time']==at(hour=10,minute=10).isoformat()
    QueueService.check_in_appointment(appointment=second,actor=second.customer)
    called=QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    assert called.pk==second.queue_entry.pk and called.serial_number==2
    assert QueueEntry.objects.get(appointment=first).status=='WAITING'
    assert QueueService.calculate_readiness_and_eta(called)['readiness_state']=='TURN_NOW'


def test_customer_early_checkin_is_idempotent_and_operator_endpoint_stays_private(env):
    appt=book(env,customer=env['users']['customer'])
    endpoint=f"/api/v1/organizations/{env['org'].pk}/appointments/{appt.pk}/check-in/"
    assert client(env,'customer').post(endpoint).status_code==200
    count=Notification.objects.count()
    assert client(env,'customer').post(endpoint).status_code==200
    assert Notification.objects.count()==count and QueueEntry.objects.count()==1
    assert client(env,'customer').get(f"/api/v1/organizations/{env['org'].pk}/queue/providers/{env['provider'].pk}/").status_code==403
    own=client(env,'customer').get(f'/api/v1/customer/appointments/{appt.pk}/')
    assert own.status_code==200 and own.data['queue_entry']['serial_number']==1
    assert client(env,'foreign').get(f'/api/v1/customer/appointments/{appt.pk}/').status_code==404


def test_delay_unavailable_and_actual_activity_recovers_eta(env,monkeypatch):
    first=book(env); waiting=[book(env) for _ in range(11)]; target=waiting[-1]
    monkeypatch.setattr(timezone,'now',lambda: at(minute=21))
    info=QueueService.calculate_readiness_and_eta(target.queue_entry)
    assert info['queue_status_text']=='Running Behind Schedule'
    assert info['estimated_start_time'] is info['estimated_end_time'] is info['recommended_arrival_time'] is None
    assert info['can_check_in'] is True and info['scheduled_ahead']==11
    assert AppointmentService.self_reschedule_eligibility(target)['message']==ETA_UNAVAILABLE_MESSAGE
    QueueService.check_in_appointment(appointment=first,actor=first.customer)
    QueueService.call_next(organization_id=env['org'].pk,provider_id=env['provider'].pk)
    QueueService.start_queue_entry(organization_id=env['org'].pk,queue_entry_id=first.queue_entry.pk)
    recovered=QueueService.calculate_readiness_and_eta(target.queue_entry)
    assert recovered['eta_reliable'] and recovered['estimated_start_time'] is not None
    assert AppointmentService.self_reschedule_eligibility(target)['allowed'] is True
    assert Appointment.objects.get(pk=target.pk).appointment_date==TODAY


def test_previous_day_unfinished_preserved_and_no_replacement_eta(env):
    old=committed(env,TODAY-timedelta(days=1),1)
    today=book(env)
    for appt in [old,today]:
        info=QueueService.calculate_readiness_and_eta(appt.queue_entry)
        assert info['estimated_start_time'] is info['recommended_arrival_time'] is None
        assert AppointmentService.self_reschedule_eligibility(appt)['message']==ETA_UNAVAILABLE_MESSAGE
    old.refresh_from_db(); assert old.status=='CONFIRMED' and old.serial_number==1 and old.appointment_date==TODAY-timedelta(days=1)


def test_normal_today_waiting_does_not_make_future_planning_unreliable(env):
    book(env)
    future=book(env,on_date=TODAY+timedelta(days=1))
    info=QueueService.calculate_readiness_and_eta(future.queue_entry)
    assert info['eta_reliable'] and info['estimated_start_time']==at(TODAY+timedelta(days=1)).isoformat()


def test_legacy_null_date_allocation_is_not_lost(env):
    appt=committed(env,TODAY,1,'COMPLETED')
    appt.appointment_date=None; appt.save(update_fields=['appointment_date'])
    assert date_capacity(env['provider'],TODAY)['allocated_count']==1


@pytest.mark.parametrize('value,expected',[(0,400),(-1,400),(10,201)])
def test_registration_average_validation_is_atomic(env,value,expected):
    before=User.objects.count()
    response=APIClient().post('/api/v1/auth/register/provider/',{
        'email':'new-professional@batch-b.test','first_name':'Synthetic','last_name':'Professional',
        'password':'RegistrationTests9465!','password_confirm':'RegistrationTests9465!',
        'organization_id':str(env['org'].pk),'average_service_minutes':value},format='json')
    assert response.status_code==expected
    assert User.objects.count()==before+(expected==201)
    if expected==201:
        profile=ProviderProfile.objects.get(pk=response.data['provider_profile_id'])
        assert profile.average_service_minutes==10 and not profile.membership.is_active


@pytest.mark.django_db(transaction=True)
def test_postgresql_migration_preserves_unknown_legacy_values(env):
    if connection.vendor!='postgresql': pytest.skip('Explicit PostgreSQL migration verification')
    from django.db.migrations.executor import MigrationExecutor
    executor=MigrationExecutor(connection); latest=executor.loader.graph.leaf_nodes()
    old=[('organizations','0010_alter_organizationcredential_document_and_more'),('providers','0008_alter_providerdocument_file')]
    try:
        executor.migrate(old)
        historical=executor.loader.project_state(old).apps
        leave=historical.get_model('providers','ProviderLeave').objects.create(provider_id=env['provider'].pk,
            start_datetime=at(),end_datetime=at(hour=17),reason='Historical effective block')
        MigrationExecutor(connection).migrate(latest)
        current=ProviderLeave.objects.get(pk=leave.pk)
        assert current.status is None and current.reviewed_by_id is None and current.reviewed_at is None
        assert current.reason=='Historical effective block' and current.start_datetime==at()
        assert ProviderProfile.objects.get(pk=env['provider'].pk).average_service_minutes is None
        assert Organization.objects.get(pk=env['org'].pk).arrival_buffer_minutes==15
        assert User.objects.count()==6 and Organization.objects.count()==2
    finally:
        MigrationExecutor(connection).migrate(latest)


def race(functions):
    barrier=Barrier(len(functions))
    def run(fn):
        close_old_connections(); barrier.wait()
        try: fn(); return 'ok'
        except ApplicationError: return 'blocked'
        finally: close_old_connections()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool: return list(pool.map(run,functions))


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('case',['last_capacity','leave','average'])
def test_postgresql_capacity_relevant_writers_coordinate(env,monkeypatch,case):
    if connection.vendor!='postgresql': pytest.skip('Real PostgreSQL row locks required')
    if case=='last_capacity':
        schedule=env['provider'].weekly_schedules.get(day_of_week=TODAY.weekday()); schedule.end_time=time(10,10); schedule.save()
        users=[User.objects.create_user(email=uuid.uuid4().hex+'@batch-b.test') for _ in range(2)]
        result=race([lambda: book(env,customer=users[0]),lambda: book(env,customer=users[1])])
    elif case=='average':
        schedule=env['provider'].weekly_schedules.get(day_of_week=TODAY.weekday()); schedule.end_time=time(10,20); schedule.save()
        book(env)
        result=race([lambda: book(env),lambda: ProviderOps.update_provider_profile(profile=env['provider'],actor=env['users']['manager'],average_service_minutes=20)])
    else:
        on_date=TODAY+timedelta(days=4)
        leave=LeaveRequestService.submit(provider=env['provider'],actor=env['users']['provider'],start_datetime=at(on_date),end_datetime=at(on_date,17))
        monkeypatch.setattr(timezone,'now',lambda: at(TODAY+timedelta(days=1),7))
        result=race([lambda: book(env,on_date=on_date),lambda: LeaveRequestService.review(leave=leave,actor=env['users']['manager'],decision='APPROVED')])
    assert sorted(result)==['blocked','ok']
    provider=ProviderProfile.objects.get(pk=env['provider'].pk)
    capacity=date_capacity(provider,on_date if case=='leave' else TODAY)
    assert capacity['allocated_count']<=capacity['daily_capacity']


@pytest.mark.parametrize('operation', ['mixed-add', 'remove', 'same-average-add'])
def test_legacy_assignment_changes_cannot_move_committed_planning_basis(env, operation):
    provider = env['provider']; provider.average_service_minutes = None; provider.save()
    book(env)  # Legitimate existing uniform assignment average is 40.
    service = Service.objects.create(organization=env['org'], name='Additional', duration_minutes=40 if operation=='same-average-add' else 20, price=100)
    if operation=='same-average-add':
        ProviderOps.assign_service_to_provider(provider=provider, service_id=service.pk)
        assert average_service_minutes(provider)==40
    else:
        with pytest.raises(ApplicationError):
            if operation=='remove':
                ProviderOps.remove_service_from_provider(provider=provider, provider_service_id=provider.provider_services.get().pk)
            else:
                ProviderOps.assign_service_to_provider(provider=provider, service_id=service.pk)
        assert provider.provider_services.count()==1 and average_service_minutes(provider)==40
    assert Appointment.objects.count()==1 and QueueEntry.objects.count()==1


def test_inactive_manager_cannot_review_leave_or_change_buffer(env):
    on_date = TODAY+timedelta(days=4)
    leave = LeaveRequestService.submit(provider=env['provider'], actor=env['users']['provider'], start_datetime=at(on_date), end_datetime=at(on_date,17))
    membership = env['memberships']['manager']; membership.is_active=False; membership.save()
    review = f"/api/v1/organizations/{env['org'].pk}/providers/{env['provider'].pk}/leaves/{leave.pk}/review/"
    assert client(env,'manager').post(review, {'decision':'APPROVED'},format='json').status_code==403
    assert client(env,'manager').patch(f"/api/v1/organizations/{env['org'].pk}/",{'arrival_buffer_minutes':20},format='json').status_code==403
    assert ProviderLeave.objects.get(pk=leave.pk).status=='PENDING'
    assert Organization.objects.get(pk=env['org'].pk).arrival_buffer_minutes==15


def test_leave_review_rejection_and_owner_withdrawal_preserve_history(env):
    on_date=TODAY+timedelta(days=4)
    leave=LeaveRequestService.submit(provider=env['provider'],actor=env['users']['provider'],start_datetime=at(on_date),end_datetime=at(on_date,17))
    rejected=LeaveRequestService.review(leave=leave,actor=env['users']['manager'],decision='REJECTED',reason='Coordinate dates')
    assert rejected.decision_reason=='Coordinate dates' and date_capacity(env['provider'],on_date)['daily_capacity']==42
    with pytest.raises(ApplicationError): LeaveRequestService.remove(leave=rejected,actor=env['users']['provider'])
    pending=LeaveRequestService.submit(provider=env['provider'],actor=env['users']['provider'],start_datetime=at(on_date),end_datetime=at(on_date,17))
    LeaveRequestService.remove(leave=pending,actor=env['users']['provider'])
    assert ProviderLeave.objects.count()==1 and ProviderLeave.objects.get().status=='REJECTED'


def test_schedule_review_protects_legacy_null_booking_date(env):
    from apps.providers.schedule_changes import ScheduleChangeService
    on_date=TODAY+timedelta(days=4)
    appt=committed(env,on_date,1); appt.appointment_date=None; appt.save(update_fields=['appointment_date'])
    proposal=ScheduleChangeService.submit(provider=env['provider'],actor=env['users']['provider'],kind='SPECIFIC_DATE',effective_date=on_date,
        proposed_schedule=[{'day_of_week':on_date.weekday(),'is_working_day':True,'start_time':'11:00','end_time':'17:00','breaks':[]}],reason='Later start')
    with pytest.raises(ApplicationError): ScheduleChangeService.review(request=proposal,actor=env['users']['manager'],decision='APPROVED')
    proposal.refresh_from_db(); appt.refresh_from_db()
    assert proposal.status=='PENDING' and appt.appointment_date is None and appt.serial_number==1
