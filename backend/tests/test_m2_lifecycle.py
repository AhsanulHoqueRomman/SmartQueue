from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from threading import Barrier
from zoneinfo import ZoneInfo

import pytest
from django.db import close_old_connections, connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment, ProviderDateSerial
from apps.appointments.services import AppointmentService, AppointmentValidationException, AppointmentNotCancellableException, DoubleBookingConflictException
from apps.appointments.booking_policy import booking_window, ETA_UNAVAILABLE_MESSAGE
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak
from apps.providers.services import ProviderService_ as ProviderOps
from apps.providers.schedule_changes import ScheduleChangeService, effective_schedule
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService, ActiveQueueCustomerException
from config.exceptions import ApplicationError

TZ = ZoneInfo('Asia/Dhaka')
TODAY = date(2026, 10, 11)


@pytest.fixture
def setup(db, monkeypatch):
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 11, 7, tzinfo=TZ))
    org = Organization.objects.create(name='M2', slug='m2', verification_status='APPROVED')
    manager = User.objects.create_user(email='manager@m2.test')
    staff = User.objects.create_user(email='staff@m2.test')
    provider_user = User.objects.create_user(email='provider@m2.test')
    customer = User.objects.create_user(email='customer@m2.test', first_name='Customer', phone_number='01712345678')
    OrganizationMembership.objects.create(organization=org, user=manager, role='MANAGER')
    OrganizationMembership.objects.create(organization=org, user=staff, role='STAFF')
    membership = OrganizationMembership.objects.create(organization=org, user=provider_user, role='PROVIDER')
    provider = ProviderProfile.objects.create(membership=membership, application_status='APPROVED')
    service = __import__('apps.services.models', fromlist=['Service']).Service.objects.create(organization=org, name='Consultation', price=1000, duration_minutes=30)
    assignment = ProviderService.objects.create(provider=provider, service=service, custom_price=1200)
    for weekday in range(7):
        WeeklySchedule.objects.create(provider=provider, day_of_week=weekday, start_time=time(10), end_time=time(20))
    return locals()


def book(s, customer=None, on_date=TODAY, **kwargs):
    return AppointmentService.book_appointment(organization_id=s['org'].pk, provider_id=s['provider'].pk, service_id=s['service'].pk, customer=customer or s['customer'], appointment_date=on_date, **kwargs)


def another(s, n=1):
    return User.objects.create_user(email=f'customer{n}@m2.test')


@pytest.mark.parametrize('delta,allowed', [(0, True), (1, True), (2, True), (3, True), (4, False), (-1, False)])
def test_booking_window(setup, delta, allowed):
    if allowed:
        assert book(setup, on_date=TODAY + timedelta(days=delta)).appointment_date == TODAY + timedelta(days=delta)
    else:
        with pytest.raises(AppointmentValidationException):
            book(setup, on_date=TODAY + timedelta(days=delta))
        assert not Appointment.objects.exists()


def test_window_rolls_at_dhaka_midnight(setup, monkeypatch):
    existing = book(setup, on_date=TODAY + timedelta(days=3))
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 12, 0, 1, tzinfo=TZ))
    assert booking_window() == (date(2026, 10, 12), date(2026, 10, 15))
    existing.refresh_from_db()
    assert existing.status == 'CONFIRMED'


@pytest.mark.parametrize('seconds,allowed', [(0, True), (1, False)])
def test_cancel_exact_cutoff(setup, monkeypatch, seconds, allowed):
    appt = book(setup)
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 11, 8, tzinfo=TZ) + timedelta(seconds=seconds))
    if allowed:
        AppointmentService.cancel_appointment(appointment=appt, actor=setup['customer'])
        appt.refresh_from_db()
        assert appt.status == appt.queue_entry.status == 'CANCELLED'
    else:
        with pytest.raises(AppointmentNotCancellableException):
            AppointmentService.cancel_appointment(appointment=appt, actor=setup['customer'])
        appt.refresh_from_db()
        assert appt.status == 'CONFIRMED' and appt.queue_entry.status == 'WAITING'
    assert appt.serial_number == 1


@pytest.mark.parametrize('state', ['CALLED', 'IN_PROGRESS'])
def test_cancel_refreshes_stale_state(setup, state):
    appt = book(setup, booking_channel='FRONT_DESK')
    QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    if state == 'IN_PROGRESS':
        QueueService.start_queue_entry(organization_id=setup['org'].pk, queue_entry_id=appt.queue_entry.pk)
    with pytest.raises(AppointmentNotCancellableException):
        AppointmentService.cancel_appointment(appointment=appt, actor=setup['customer'])
    assert QueueEntry.objects.get(appointment=appt).status == state


def test_serial_never_reused_after_cancel_reschedule_or_delete(setup):
    a = book(setup)
    AppointmentService.cancel_appointment(appointment=a, actor=setup['customer'])
    b = book(setup)
    assert b.serial_number == 2
    AppointmentService.reschedule_appointment(appointment=b, appointment_date=TODAY + timedelta(days=1), actor=setup['customer'])
    c = book(setup)
    assert c.serial_number == 3
    c.delete()
    assert book(setup).serial_number == 4
    assert ProviderDateSerial.objects.get(provider=setup['provider'], booking_date=TODAY).last_serial == 4


def test_duplicate_active_booking_and_other_dates(setup):
    book(setup)
    with pytest.raises(DoubleBookingConflictException):
        book(setup)
    assert book(setup, on_date=TODAY + timedelta(days=1)).serial_number == 1


@pytest.mark.parametrize('case', ['provider_delayed', 'previous_day'])
def test_eta_unavailable_preserves_booking(setup, monkeypatch, case):
    appt = book(setup)
    if case == 'provider_delayed':
        monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 11, 10, 21, tzinfo=TZ))
    else:
        monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 12, 7, tzinfo=TZ))
    with pytest.raises(AppointmentValidationException) as error:
        AppointmentService.reschedule_appointment(appointment=appt, appointment_date=TODAY + timedelta(days=1), actor=setup['customer'])
    assert str(error.value.detail) == ETA_UNAVAILABLE_MESSAGE
    appt.refresh_from_db()
    assert (appt.appointment_date, appt.serial_number, appt.status, appt.queue_entry.status) == (TODAY, 1, 'CONFIRMED', 'WAITING')


@pytest.mark.parametrize('seconds,allowed', [(0, True), (1, False)])
def test_reschedule_90_minute_boundary(setup, monkeypatch, seconds, allowed):
    appt = book(setup)
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 11, 8, 30, tzinfo=TZ) + timedelta(seconds=seconds))
    if allowed:
        moved = AppointmentService.reschedule_appointment(appointment=appt, appointment_date=TODAY + timedelta(days=1), actor=setup['customer'])
        assert moved.queue_entry.queue_date == moved.appointment_date == TODAY + timedelta(days=1)
        assert moved.booked_service_charge == 1200 and Appointment.objects.count() == QueueEntry.objects.count() == 1
    else:
        with pytest.raises(AppointmentValidationException):
            AppointmentService.reschedule_appointment(appointment=appt, appointment_date=TODAY + timedelta(days=1), actor=setup['customer'])


def test_eta_recovered_and_final_request_rechecks(setup, monkeypatch):
    appt = book(setup)
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': None})
    assert not AppointmentService.self_reschedule_eligibility(appt)['allowed']
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': (timezone.now() + timedelta(hours=3)).isoformat()})
    assert AppointmentService.self_reschedule_eligibility(appt)['allowed']
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': (timezone.now() + timedelta(minutes=89)).isoformat()})
    with pytest.raises(AppointmentValidationException):
        AppointmentService.reschedule_appointment(appointment=appt, appointment_date=TODAY + timedelta(days=1), actor=setup['customer'])
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': (timezone.now() + timedelta(hours=3)).isoformat()})
    assert AppointmentService.reschedule_appointment(appointment=appt, appointment_date=TODAY + timedelta(days=1), actor=setup['customer']).appointment_date != TODAY


def test_real_delayed_provider_eta_recovers_after_service_starts(setup, monkeypatch):
    appts = [book(setup, another(setup, n)) for n in range(1, 6)]
    subject = appts[-1]
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 11, 10, 21, tzinfo=TZ))
    eligibility = AppointmentService.self_reschedule_eligibility(subject)
    assert eligibility['code'] == 'RESCHEDULE_ETA_UNAVAILABLE'
    assert eligibility['message'] == ETA_UNAVAILABLE_MESSAGE
    QueueService.check_in_appointment(appointment=appts[0], actor=setup['staff'])
    QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    QueueService.start_queue_entry(organization_id=setup['org'].pk, queue_entry_id=appts[0].queue_entry.pk)
    assert AppointmentService.self_reschedule_eligibility(subject)['allowed'] is True
    moved = AppointmentService.reschedule_appointment(appointment=subject, appointment_date=TODAY + timedelta(days=1), actor=subject.customer)
    assert moved.appointment_date == TODAY + timedelta(days=1) and moved.booked_service_charge == 1200


def test_same_date_reschedule_preserves_checkin_and_snapshots(setup):
    appt = book(setup, booking_channel='FRONT_DESK')
    original = (appt.pk, appt.serial_number, appt.status, appt.queue_entry.pk, appt.queue_entry.checked_in_at, appt.booked_service_charge, appt.contact_name, appt.contact_phone)
    result = AppointmentService.reschedule_appointment(appointment=appt, appointment_date=TODAY, actor=setup['customer'])
    assert (result.pk, result.serial_number, result.status, result.queue_entry.pk, result.queue_entry.checked_in_at, result.booked_service_charge, result.contact_name, result.contact_phone) == original
    assert result.queue_entry.is_checked_in and result.queue_entry.status == 'WAITING'


def test_call_skip_restore_preserves_order_and_active_consultation(setup):
    entries = [book(setup, customer=setup['customer'] if n == 0 else another(setup, n), booking_channel='FRONT_DESK').queue_entry for n in range(3)]
    QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    QueueService.skip_queue_entry(organization_id=setup['org'].pk, queue_entry_id=entries[0].pk)
    assert not QueueEntry.objects.filter(status='CALLED').exists()
    assert QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk).pk == entries[1].pk
    QueueService.start_queue_entry(organization_id=setup['org'].pk, queue_entry_id=entries[1].pk)
    restored = QueueService.restore_queue_entry(organization_id=setup['org'].pk, queue_entry_id=entries[0].pk, actor=setup['staff'])
    assert restored.serial_number == 1 and restored.status == 'WAITING'
    assert QueueService.restore_queue_entry(organization_id=setup['org'].pk, queue_entry_id=entries[0].pk, actor=setup['staff']).pk == restored.pk
    with pytest.raises(ActiveQueueCustomerException):
        QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    QueueService.complete_queue_entry(organization_id=setup['org'].pk, queue_entry_id=entries[1].pk)
    assert QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk).pk == entries[0].pk


def test_unchecked_customer_bypassed_without_skip(setup):
    first = book(setup)
    second = book(setup, another(setup), booking_channel='FRONT_DESK')
    assert QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk).pk == second.queue_entry.pk
    first.refresh_from_db()
    assert first.status == 'CONFIRMED' and first.queue_entry.status == 'WAITING'


def test_checkin_actor_repeat_and_legacy_allocation(setup):
    appt = book(setup)
    assert QueueService.check_in_appointment(appointment=appt, actor=setup['customer']).pk == QueueService.check_in_appointment(appointment=appt, actor=setup['customer']).pk
    assert QueueEntry.objects.count() == 1
    appt.queue_entry.delete()
    appt.serial_number = None
    appt.save(update_fields=['serial_number'])
    entry = AppointmentService.check_in(appointment=appt).queue_entry
    appt.refresh_from_db()
    assert entry.serial_number == appt.serial_number == 2
    assert QueueEntry.objects.count() == 1


def test_midnight_preservation_and_cross_date_guard(setup, monkeypatch):
    a = book(setup, booking_channel='FRONT_DESK')
    QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    QueueService.start_queue_entry(organization_id=setup['org'].pk, queue_entry_id=a.queue_entry.pk)
    b = book(setup, another(setup), on_date=TODAY + timedelta(days=1), booking_channel='FRONT_DESK')
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 12, 0, 20, tzinfo=TZ))
    QueueService.list_provider_queue(organization_id=setup['org'].pk, provider_id=setup['provider'].pk, on_date=TODAY)
    with pytest.raises(ActiveQueueCustomerException):
        QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    complete = QueueService.complete_queue_entry(organization_id=setup['org'].pk, queue_entry_id=a.queue_entry.pk)
    assert complete.queue_date == TODAY and complete.completed_at.date() == TODAY + timedelta(days=1)
    QueueService.check_in_appointment(appointment=b, actor=setup['staff'])
    assert QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk).pk == b.queue_entry.pk


def proposal(s, kind='SPECIFIC_DATE', notice=4, **changes):
    effective = TODAY + timedelta(days=notice)
    days = range(7) if kind == 'PERMANENT' else [effective.weekday()]
    data = [dict(day_of_week=d, start_time='10:00:00', end_time='20:00:00', is_working_day=True, **{}) for d in days]
    for day in data:
        day.update(changes)
    return dict(provider=s['provider'], actor=s['provider_user'], kind=kind, effective_date=effective, proposed_schedule=data, reason='Fictional schedule change')


@pytest.mark.parametrize('kind,days,valid', [('SPECIFIC_DATE', 4, True), ('SPECIFIC_DATE', 3, False), ('PERMANENT', 10, True), ('PERMANENT', 9, False)])
def test_schedule_notice_and_effective_version(setup, monkeypatch, kind, days, valid):
    values = proposal(setup, kind, days, start_time='09:00:00')
    if not valid:
        with pytest.raises(ApplicationError):
            ScheduleChangeService.submit(**values)
        return
    request = ScheduleChangeService.submit(**values)
    ScheduleChangeService.review(request=request, actor=setup['manager'], decision='APPROVED')
    assert effective_schedule(setup['provider'], TODAY).start_time == time(10)
    assert effective_schedule(setup['provider'], request.effective_date).start_time == time(9)
    if kind == 'SPECIFIC_DATE':
        assert effective_schedule(setup['provider'], request.effective_date + timedelta(days=7)).start_time == time(10)
    assert WeeklySchedule.objects.get(provider=setup['provider'], day_of_week=request.effective_date.weekday()).start_time == time(10)


@pytest.mark.parametrize('changes', [{'end_time': '23:00:00'}, {'reason': ''}])
def test_invalid_schedule_or_reason(setup, changes):
    values = proposal(setup)
    if 'reason' in changes:
        values.update(changes)
    else:
        values['proposed_schedule'][0].update(changes)
    with pytest.raises(ApplicationError):
        ScheduleChangeService.submit(**values)


def test_retained_break_and_overlap_validation(setup):
    day = WeeklySchedule.objects.get(provider=setup['provider'], day_of_week=(TODAY + timedelta(days=4)).weekday())
    ScheduleBreak.objects.create(weekly_schedule=day, title='Rest', start_time=time(19), end_time=time(19, 30))
    with pytest.raises(ApplicationError):
        ScheduleChangeService.submit(**proposal(setup, end_time='17:00:00'))
    values = proposal(setup)
    values['proposed_schedule'][0]['breaks'] = [{'start_time': '12:00:00', 'end_time': '13:00:00'}, {'start_time': '12:30:00', 'end_time': '14:00:00'}]
    with pytest.raises(ApplicationError):
        ScheduleChangeService.submit(**values)


def test_live_schedule_edit_denied_and_initial_validated(setup):
    with pytest.raises(ApplicationError):
        ProviderOps.create_or_update_schedule(provider=setup['provider'], day_of_week=0, start_time=time(9), end_time=time(17))
    provider = setup['provider']
    provider.application_status = 'INCOMPLETE'
    provider.save(update_fields=['application_status'])
    with pytest.raises(ApplicationError):
        ProviderOps.create_or_update_schedule(provider=provider, day_of_week=0, start_time=time(9), end_time=time(23))
    assert ProviderOps.create_or_update_schedule(provider=provider, day_of_week=0, start_time=time(9), end_time=time(17))[0].end_time == time(17)


def test_approval_conflict_rechecked_and_rejection_unchanged(setup):
    request = ScheduleChangeService.submit(**proposal(setup, start_time='11:00:00'))
    # A grandfathered confirmed booking beyond the new horizon must still be protected.
    appt = book(setup)
    Appointment.objects.filter(pk=appt.pk).update(appointment_date=request.effective_date)
    with pytest.raises(ApplicationError) as error:
        ScheduleChangeService.review(request=request, actor=setup['manager'], decision='APPROVED')
    assert error.value.details['affected_bookings'][0]['appointment_id'] == str(appt.pk)
    request.refresh_from_db()
    assert request.status == 'PENDING'
    ScheduleChangeService.review(request=request, actor=setup['manager'], decision='REJECTED', reason='Customer commitments')
    assert effective_schedule(setup['provider'], request.effective_date).start_time == time(10)


def test_staff_channels_and_api_security(setup):
    client = APIClient()
    client.force_authenticate(setup['staff'])
    url = f"/api/v1/organizations/{setup['org'].pk}/queue/providers/{setup['provider'].pk}/walk-in/"
    first = book(setup)
    for channel, n in [('PHONE', 1), ('FRONT_DESK', 2)]:
        response = client.post(url, {'customer_id': another(setup, n).pk, 'first_name': 'Entered', 'last_name': 'Contact', 'phone_number': '01712345678', 'service_id': str(setup['service'].pk), 'booking_channel': channel}, format='json')
        assert response.status_code == 201, response.data
        assert response.data['serial_number'] == n + 1
        assert response.data['is_checked_in'] == (channel == 'FRONT_DESK')
    response = client.patch(f"/api/v1/organizations/{setup['org'].pk}/appointments/{first.pk}/", {'appointment_date': str(TODAY + timedelta(days=1))})
    assert response.status_code == 403
    client.force_authenticate(setup['customer'])
    assert client.post(url, {}).status_code == 403
    assert client.post(f"/api/v1/organizations/{setup['org'].pk}/queue/{first.queue_entry.pk}/urgent/", {}).status_code == 404


def test_private_attachment_and_foreign_review_denied(setup):
    from django.core.files.uploadedfile import SimpleUploadedFile
    values = proposal(setup)
    values['attachment'] = SimpleUploadedFile('proof.pdf', b'%PDF-1.4 fictional', content_type='application/pdf')
    request = ScheduleChangeService.submit(**values)
    client = APIClient()
    url = f"/api/v1/organizations/{setup['org'].pk}/providers/{setup['provider'].pk}/schedule-requests/{request.pk}/attachment/"
    assert client.get(url).status_code == 401
    client.force_authenticate(setup['customer'])
    assert client.get(url).status_code == 403
    client.force_authenticate(setup['manager'])
    response = client.get(url)
    assert response.status_code == 200 and response.content == b'%PDF-1.4 fictional'
    assert response['Cache-Control'] == 'no-store'
    with pytest.raises(ApplicationError):
        ScheduleChangeService.review(request=request, actor=setup['staff'], decision='APPROVED')


def race(functions):
    barrier = Barrier(len(functions))
    def run(fn):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            try:
                return fn()
            except ApplicationError as exc:
                return exc
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run, functions))


@pytest.mark.django_db(transaction=True)
def test_postgresql_concurrent_serial_and_duplicate(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    customers = [another(setup, n) for n in (1, 2)]
    result = race([lambda c=c: book(setup, c) for c in customers])
    assert sorted(r.serial_number for r in result) == [1, 2]
    result = race([lambda: book(setup), lambda: book(setup)])
    assert sum(isinstance(r, Appointment) for r in result) == 1
    assert sum(isinstance(r, DoubleBookingConflictException) for r in result) == 1


@pytest.mark.django_db(transaction=True)
def test_postgresql_call_next_exclusion(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    for n in (1, 2):
        book(setup, another(setup, n), booking_channel='FRONT_DESK')
    fn = lambda: QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    result = race([fn, fn])
    assert sum(isinstance(r, QueueEntry) for r in result) == 1
    assert sum(isinstance(r, ActiveQueueCustomerException) for r in result) == 1
    assert QueueEntry.objects.filter(status='CALLED').count() == 1


@pytest.mark.django_db(transaction=True)
def test_postgresql_cancel_vs_call_next(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    appt = book(setup, booking_channel='FRONT_DESK')
    result = race([lambda: AppointmentService.cancel_appointment(appointment=appt, actor=setup['customer']), lambda: QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)])
    appt.refresh_from_db()
    entry = QueueEntry.objects.get(appointment=appt)
    assert (appt.status, entry.status) in [('CANCELLED', 'CANCELLED'), ('CHECKED_IN', 'CALLED')]
    assert sum(isinstance(r, ApplicationError) for r in result) == 1


def test_read_api_reports_eta_unavailable_and_recovers(setup, monkeypatch):
    appt = book(setup)
    client = APIClient()
    client.force_authenticate(setup['customer'])
    url = f"/api/v1/organizations/{setup['org'].pk}/appointments/{appt.pk}/"
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': None})
    response = client.get(url)
    assert response.status_code == 200
    assert response.data['self_reschedule']['message'] == ETA_UNAVAILABLE_MESSAGE
    assert response.data['self_reschedule']['allowed'] is False
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': (timezone.now() + timedelta(hours=3)).isoformat()})
    assert client.get(url).data['self_reschedule']['allowed'] is True
    # A previously displayed eligible state must not authorize a stale final request.
    monkeypatch.setattr(QueueService, 'calculate_readiness_and_eta', lambda entry: {'estimated_start_time': None})
    response = client.patch(url, {'appointment_date': str(TODAY + timedelta(days=1))}, format='json')
    assert response.status_code == 400 and response.data['error']['message'] == ETA_UNAVAILABLE_MESSAGE
    appt.refresh_from_db()
    assert (appt.appointment_date, appt.serial_number, appt.queue_entry.status) == (TODAY, 1, 'WAITING')


def test_future_front_desk_not_present_and_not_callable(setup):
    appt = book(setup, on_date=TODAY + timedelta(days=1), booking_channel='FRONT_DESK')
    assert not appt.queue_entry.is_checked_in
    with pytest.raises(ApplicationError):
        QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk, on_date=appt.appointment_date)
    assert QueueEntry.objects.get(appointment=appt).status == 'WAITING'


def test_initial_schedule_registration_validation_and_approval(setup):
    from apps.accounts.serializers import ProviderRegisterSerializer
    days = [dict(day_of_week=d, start_time='09:00:00', end_time='17:00:00', is_working_day=True, breaks=[]) for d in range(7)]
    assert len(ProviderRegisterSerializer().validate_initial_schedule(days)) == 7
    from rest_framework.exceptions import ValidationError
    days[0]['end_time'] = '23:00:00'
    with pytest.raises(ValidationError):
        ProviderRegisterSerializer().validate_initial_schedule(days)
    provider = setup['provider']
    provider.application_status = 'PENDING'
    provider.save(update_fields=['application_status'])
    WeeklySchedule.objects.filter(provider=provider).delete()
    with pytest.raises(ApplicationError):
        ProviderOps.approve_application(provider_profile=provider, manager_user=setup['manager'])
    provider.refresh_from_db()
    assert provider.application_status == 'PENDING'
    ProviderOps.create_or_update_schedule(provider=provider, day_of_week=0, start_time=time(9), end_time=time(17))
    assert ProviderOps.approve_application(provider_profile=provider, manager_user=setup['manager']).application_status == 'APPROVED'


@pytest.mark.parametrize('case', ['valid', 'invalid', 'write_failure'])
def test_initial_schedule_registration_atomic_api(setup, monkeypatch, case):
    days = [dict(day_of_week=d, start_time='09:00:00', end_time='17:00:00', is_working_day=True, breaks=[]) for d in range(7)]
    days[0]['breaks'] = [{'title': 'Rest', 'start_time': '12:00:00', 'end_time': '12:30:00'}]
    payload = {'email': 'onboarding@m2.test', 'first_name': 'New', 'password': 'M2longSecurePassword!57', 'password_confirm': 'M2longSecurePassword!57', 'organization_id': str(setup['org'].pk), 'initial_schedule': days}
    client = APIClient()
    if case == 'invalid':
        days[0]['end_time'] = '23:00:00'
        assert client.post('/api/v1/auth/register/provider/', payload, format='json').status_code == 400
    elif case == 'write_failure':
        def fail(**kwargs):
            raise RuntimeError('Simulated initial schedule write failure')
        monkeypatch.setattr(WeeklySchedule.objects, 'create', fail)
        with pytest.raises(RuntimeError):
            client.post('/api/v1/auth/register/provider/', payload, format='json')
    else:
        response = client.post('/api/v1/auth/register/provider/', payload, format='json')
        assert response.status_code == 201, response.data
        provider = ProviderProfile.objects.get(pk=response.data['provider_profile_id'])
        assert provider.weekly_schedules.count() == 7
        assert ScheduleBreak.objects.filter(weekly_schedule__provider=provider).count() == 1
        assert provider.membership.organization_id == setup['org'].pk and not provider.membership.is_active
        assert not provider.is_operationally_active
        client.force_authenticate(provider.user)
        assert client.post(f"/api/v1/organizations/{setup['org'].pk}/queue/providers/{provider.pk}/call-next/", {}).status_code == 403
        return
    assert not User.objects.filter(email=payload['email']).exists()
    assert ProviderProfile.objects.count() == 1 and OrganizationMembership.objects.count() == 3


def test_schedule_request_multipart_and_cross_tenant_security(setup):
    import json
    from django.core.files.uploadedfile import SimpleUploadedFile
    client = APIClient()
    client.force_authenticate(setup['provider_user'])
    values = proposal(setup)
    url = f"/api/v1/organizations/{setup['org'].pk}/providers/{setup['provider'].pk}/schedule-requests/"
    response = client.post(url, {'kind': values['kind'], 'effective_date': str(values['effective_date']), 'reason': values['reason'], 'proposed_schedule': json.dumps(values['proposed_schedule']), 'attachment': SimpleUploadedFile('proof.pdf', b'%PDF-1.4 demo', content_type='application/pdf')}, format='multipart')
    assert response.status_code == 201, response.data
    assert response.data['has_attachment'] is True and 'attachment' not in response.data
    rid = response.data['id']
    foreign = Organization.objects.create(name='Other', slug='other', verification_status='APPROVED')
    outsider = another(setup, 99)
    OrganizationMembership.objects.create(organization=foreign, user=outsider, role='MANAGER')
    client.force_authenticate(outsider)
    assert client.get(url).status_code == 403
    assert client.get(f'{url}{rid}/attachment/').status_code == 403
    assert client.post(f'{url}{rid}/review/', {'decision': 'APPROVED'}).status_code == 403
    client.force_authenticate(setup['manager'])
    assert client.post(f'{url}{rid}/review/', {'decision': 'APPROVED'}).status_code == 200
    assert WeeklySchedule.objects.get(provider=setup['provider'], day_of_week=values['effective_date'].weekday()).start_time == time(10)


def test_schedule_request_disk_backed_upload_is_private(setup, settings):
    import json
    from django.core.files.uploadedfile import SimpleUploadedFile
    settings.FILE_UPLOAD_MAX_MEMORY_SIZE = 1
    client = APIClient()
    client.force_authenticate(setup['provider_user'])
    values = proposal(setup)
    url = f"/api/v1/organizations/{setup['org'].pk}/providers/{setup['provider'].pk}/schedule-requests/"
    content = b'%PDF-1.4 fictional upload'
    response = client.post(url, {'kind': values['kind'], 'effective_date': str(values['effective_date']), 'reason': values['reason'], 'proposed_schedule': json.dumps(values['proposed_schedule']), 'attachment': SimpleUploadedFile('proof.pdf', content, content_type='application/pdf')}, format='multipart')
    assert response.status_code == 201, response.data
    download = client.get(f"{url}{response.data['id']}/attachment/")
    assert download.status_code == 200 and download.content == content
    assert download['Cache-Control'] == 'no-store' and 'attachment' not in response.data


def test_cross_tenant_read_does_not_cleanup_unfinished_bookings(setup, monkeypatch):
    appt = book(setup)
    foreign = Organization.objects.create(name='Other', slug='other', verification_status='APPROVED')
    outsider = another(setup, 99)
    OrganizationMembership.objects.create(organization=foreign, user=outsider, role='STAFF')
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 12, 7, tzinfo=TZ))
    client = APIClient()
    client.force_authenticate(outsider)
    url = f"/api/v1/organizations/{setup['org'].pk}/queue/providers/{setup['provider'].pk}/"
    assert client.get(url, {'date': str(TODAY)}).status_code == 403
    client.force_authenticate(setup['staff'])
    assert client.get(url, {'date': str(TODAY)}).status_code == 200
    appt.refresh_from_db()
    assert (appt.appointment_date, appt.serial_number, appt.status, appt.queue_entry.status) == (TODAY, 1, 'CONFIRMED', 'WAITING')


def test_reschedule_full_date_preserves_original(setup):
    appt = book(setup)
    target = TODAY + timedelta(days=1)
    day = WeeklySchedule.objects.get(provider=setup['provider'], day_of_week=target.weekday())
    day.end_time = time(10, 30)
    day.save(update_fields=['end_time'])
    book(setup, another(setup), on_date=target)
    with pytest.raises(AppointmentValidationException):
        AppointmentService.reschedule_appointment(appointment=appt, appointment_date=target, actor=setup['customer'])
    appt.refresh_from_db()
    assert (appt.appointment_date, appt.serial_number, appt.queue_entry.queue_date) == (TODAY, 1, TODAY)


@pytest.mark.django_db(transaction=True)
def test_postgresql_concurrent_reschedules(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    appts = [book(setup, another(setup, n)) for n in (1, 2)]
    target = TODAY + timedelta(days=1)
    result = race([lambda a=a: AppointmentService.reschedule_appointment(appointment=a, appointment_date=target, actor=a.customer) for a in appts])
    assert sorted(a.serial_number for a in result) == [1, 2]
    assert list(QueueEntry.objects.filter(queue_date=target).order_by('serial_number').values_list('serial_number', flat=True)) == [1, 2]


@pytest.mark.django_db(transaction=True)
def test_postgresql_restore_vs_call_next(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    a = book(setup, booking_channel='FRONT_DESK')
    b = book(setup, another(setup), booking_channel='FRONT_DESK')
    QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    QueueService.skip_queue_entry(organization_id=setup['org'].pk, queue_entry_id=a.queue_entry.pk)
    result = race([lambda: QueueService.restore_queue_entry(organization_id=setup['org'].pk, queue_entry_id=a.queue_entry.pk, actor=setup['staff']), lambda: QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)])
    assert all(isinstance(r, QueueEntry) for r in result)
    assert QueueEntry.objects.filter(status='CALLED').count() == 1
    a.refresh_from_db(); b.refresh_from_db()
    assert (a.serial_number, b.serial_number) == (1, 2)
    assert a.status == 'CHECKED_IN'


@pytest.mark.django_db(transaction=True)
def test_postgresql_cancel_vs_checkin_and_start(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    a = book(setup)
    race([lambda: AppointmentService.cancel_appointment(appointment=a, actor=setup['customer']), lambda: QueueService.check_in_appointment(appointment=a, actor=setup['staff'])])
    a.refresh_from_db()
    assert a.status == a.queue_entry.status == 'CANCELLED'
    b = book(setup, another(setup), booking_channel='FRONT_DESK')
    QueueService.call_next(organization_id=setup['org'].pk, provider_id=setup['provider'].pk)
    result = race([lambda: AppointmentService.cancel_appointment(appointment=b, actor=setup['customer']), lambda: QueueService.start_queue_entry(organization_id=setup['org'].pk, queue_entry_id=b.queue_entry.pk)])
    b.refresh_from_db()
    assert b.status == b.queue_entry.status == 'IN_PROGRESS'
    assert sum(isinstance(r, AppointmentNotCancellableException) for r in result) == 1


@pytest.mark.django_db(transaction=True)
def test_postgresql_schedule_approval_vs_booking(setup, monkeypatch):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    request = ScheduleChangeService.submit(**proposal(setup, start_time='11:00:00'))
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 12, 7, tzinfo=TZ))
    result = race([lambda: book(setup, on_date=request.effective_date), lambda: ScheduleChangeService.review(request=request, actor=setup['manager'], decision='APPROVED')])
    request.refresh_from_db()
    appt = Appointment.objects.get()
    if request.status == 'APPROVED':
        assert appt.start_datetime.astimezone(TZ).hour == 11
        assert not any(isinstance(r, ApplicationError) for r in result)
    else:
        assert appt.start_datetime.astimezone(TZ).hour == 10
        assert sum(isinstance(r, ApplicationError) for r in result) == 1


@pytest.mark.django_db(transaction=True)
def test_postgresql_retained_break_vs_initial_hours_edit(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL settings')
    provider = setup['provider']
    provider.application_status = 'INCOMPLETE'
    provider.save(update_fields=['application_status'])
    day = WeeklySchedule.objects.get(provider=provider, day_of_week=0)
    result = race([lambda: ProviderOps.add_break(weekly_schedule=day, title='Rest', start_time=time(18), end_time=time(19)), lambda: ProviderOps.create_or_update_schedule(provider=provider, day_of_week=0, start_time=time(10), end_time=time(17))])
    day.refresh_from_db()
    assert sum(isinstance(r, ApplicationError) for r in result) == 1
    assert all(day.start_time <= b.start_time < b.end_time <= day.end_time for b in day.breaks.all())


@pytest.mark.django_db(transaction=True)
def test_postgresql_migrations_archive_priority_and_initialize_serial_ledger(setup):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires explicit PostgreSQL migration workflow')
    from django.db.migrations.executor import MigrationExecutor
    from apps.audit.models import AuditLog
    appt = book(setup)
    entry_id = appt.queue_entry.pk
    final = [('appointments', '0005_providerdateserial'), ('queue', '0006_remove_queueentry_is_urgent_and_more')]
    old = [('appointments', '0004_booking_snapshots'), ('queue', '0005_alter_queueentry_readiness_state')]
    # Schema transitions are confined to the disposable test database.
    executor = MigrationExecutor(connection)
    try:
        executor.migrate(old)
        historical = executor.loader.project_state(old).apps
        historical.get_model('queue', 'QueueEntry').objects.filter(pk=entry_id).update(is_urgent=True, urgent_reason='Historical reason')
        MigrationExecutor(connection).migrate(final)
        archive = AuditLog.objects.get(action='LEGACY_QUEUE_PRIORITY_ARCHIVED', entity_id=str(entry_id))
        assert archive.organization_id == setup['org'].pk
        assert archive.metadata['urgent_reason'] == 'Historical reason'
        assert ProviderDateSerial.objects.get(provider=setup['provider'], booking_date=TODAY).last_serial == 1
        appt.refresh_from_db()
        assert appt.serial_number == appt.queue_entry.serial_number == 1
        assert book(setup, another(setup)).serial_number == 2
    finally:
        MigrationExecutor(connection).migrate(final)


@pytest.mark.parametrize('case', ['valid', 'omitted', 'invalid', 'write_failure'])
def test_invitation_initial_schedule_requires_review_and_is_atomic(setup, monkeypatch, case):
    from apps.organizations.models import OrganizationInvitation
    invitation = OrganizationInvitation.objects.create(organization=setup['org'], email='invite@m2.test', created_by=setup['manager'])
    days = [dict(day_of_week=d, start_time='09:00:00', end_time='17:00:00', is_working_day=True, breaks=[]) for d in range(7)]
    days[0]['breaks'] = [dict(title='Rest', start_time='12:00:00', end_time='12:30:00')]
    payload = dict(first_name='Invited', last_name='Provider', password='M2longSecurePassword!57')
    if case != 'omitted':
        payload['initial_schedule'] = days
    client = APIClient()
    url = f'/api/v1/invitations/provider/{invitation.token}/accept/'
    if case == 'invalid':
        days[0]['end_time'] = '23:00:00'
        assert client.post(url, payload, format='json').status_code == 400
    elif case == 'write_failure':
        def fail(**kwargs):
            raise RuntimeError('Simulated initial schedule failure')
        monkeypatch.setattr(WeeklySchedule.objects, 'create', fail)
        with pytest.raises(RuntimeError):
            client.post(url, payload, format='json')
    else:
        response = client.post(url, payload, format='json')
        assert response.status_code == 200, response.data
        provider = ProviderProfile.objects.get(pk=response.data['provider_profile_id'])
        assert not provider.membership.is_active and not provider.is_operationally_active
        assert provider.application_status == ('PENDING_REVIEW' if case == 'valid' else 'INCOMPLETE')
        assert provider.weekly_schedules.count() == (7 if case == 'valid' else 0)
        if case == 'valid':
            assert ScheduleBreak.objects.filter(weekly_schedule__provider=provider).count() == 1
            ProviderOps.approve_application(provider_profile=provider, manager_user=setup['manager'])
            provider.refresh_from_db()
            assert provider.is_operationally_active
        else:
            with pytest.raises(ApplicationError):
                ProviderOps.approve_application(provider_profile=provider, manager_user=setup['manager'])
        assert client.post(url, payload, format='json').status_code == 400
        return
    invitation.refresh_from_db()
    assert invitation.used_at is None and invitation.accepted_by_id is None
    assert not User.objects.filter(email='invite@m2.test').exists()


@pytest.mark.parametrize('role', ['customer', 'staff', 'provider', 'foreign_manager', 'inactive_manager', 'admin'])
@pytest.mark.parametrize('action', ['approve', 'reject'])
def test_initial_schedule_review_only_active_own_manager(setup, role, action):
    provider = setup['provider']
    provider.application_status = 'PENDING_REVIEW'
    provider.save(update_fields=['application_status'])
    if role in ('customer', 'staff'):
        actor = setup[role]
    elif role == 'provider':
        actor = setup['provider_user']
    else:
        actor = another(setup, 99)
        if role == 'admin':
            actor.is_staff = actor.is_superuser = True
            actor.save()
        elif role == 'foreign_manager':
            foreign = Organization.objects.create(name='Foreign', slug='foreign')
            OrganizationMembership.objects.create(organization=foreign, user=actor, role='MANAGER')
        else:
            OrganizationMembership.objects.create(organization=setup['org'], user=actor, role='MANAGER', is_active=False)
    with pytest.raises(ApplicationError) as error:
        if action == 'approve':
            ProviderOps.approve_application(provider_profile=provider, manager_user=actor)
        else:
            ProviderOps.reject_application(provider_profile=provider, manager_user=actor, reason='Review')
    assert error.value.status_code == 403
    provider.refresh_from_db()
    assert provider.application_status == 'PENDING_REVIEW' and provider.application_reviewed_by_id is None


@pytest.mark.parametrize('role', ['owner', 'manager', 'staff', 'customer', 'foreign_provider', 'inactive_manager', 'anonymous'])
def test_private_schedule_attachment_download_role_matrix(setup, role):
    from django.core.files.uploadedfile import SimpleUploadedFile
    request = ScheduleChangeService.submit(attachment=SimpleUploadedFile('proof.pdf', b'%PDF-1.4 private'), **proposal(setup))
    client = APIClient()
    if role in ('owner', 'manager', 'staff', 'customer'):
        actor = setup['provider_user'] if role == 'owner' else setup[role]
    elif role != 'anonymous':
        actor = another(setup, 99)
        if role == 'inactive_manager':
            OrganizationMembership.objects.create(organization=setup['org'], user=actor, role='MANAGER', is_active=False)
        else:
            foreign = Organization.objects.create(name='Foreign', slug='foreign')
            member = OrganizationMembership.objects.create(organization=foreign, user=actor, role='PROVIDER')
            ProviderProfile.objects.create(membership=member, application_status='APPROVED')
    if role != 'anonymous':
        client.force_authenticate(actor)
    url = f"/api/v1/organizations/{setup['org'].pk}/providers/{setup['provider'].pk}/schedule-requests/{request.pk}/attachment/"
    response = client.get(url)
    if role in ('owner', 'manager'):
        assert response.status_code == 200 and response.content == b'%PDF-1.4 private'
        assert response['Content-Type'] == 'application/octet-stream'
        assert response['X-Content-Type-Options'] == 'nosniff' and response['Cache-Control'] == 'no-store'
        assert response['Content-Disposition'].startswith('attachment;')
        assert client.get(url.replace(str(setup['org'].pk), '00000000-0000-0000-0000-000000000001')).status_code == 404
    else:
        assert response.status_code in (401, 403)
        assert b'%PDF' not in response.content


def test_booking_date_filter_preserves_legacy_null_and_original_date(setup):
    appt = book(setup)
    # Actual/operational datetime must not override the original booking date.
    tomorrow = TODAY + timedelta(days=1)
    Appointment.objects.filter(pk=appt.pk).update(start_datetime=datetime.combine(tomorrow, time(0, 30), tzinfo=TZ), end_datetime=datetime.combine(tomorrow, time(1), tzinfo=TZ))
    legacy = Appointment.objects.create(organization=setup['org'], provider=setup['provider'], service=setup['service'], customer=another(setup), appointment_date=None, start_datetime=datetime.combine(tomorrow, time(0, 30), tzinfo=TZ), end_datetime=datetime.combine(tomorrow, time(1), tzinfo=TZ), status='CONFIRMED')
    client = APIClient()
    client.force_authenticate(setup['manager'])
    url = f"/api/v1/organizations/{setup['org'].pk}/appointments/"
    def ids(on_date):
        response = client.get(url, {'date': str(on_date)})
        assert response.status_code == 200
        rows = response.data if isinstance(response.data, list) else response.data['results']
        return {str(row['id']) for row in rows}
    assert ids(TODAY) == {str(appt.pk)}
    assert ids(tomorrow) == {str(legacy.pk)}
    legacy.refresh_from_db()
    assert legacy.appointment_date is None


@pytest.mark.parametrize('role', ['customer', 'manager'])
def test_effective_schedule_projection_preserves_m1_annotation_privacy(setup, role):
    day = WeeklySchedule.objects.get(provider=setup['provider'], day_of_week=TODAY.weekday())
    ScheduleBreak.objects.create(weekly_schedule=day, title='Private operational reason', start_time=time(12), end_time=time(13))
    client = APIClient()
    client.force_authenticate(setup[role])
    response = client.get(f"/api/v1/organizations/{setup['org'].pk}/providers/{setup['provider'].pk}/schedules/")
    assert response.status_code == 200 and len(response.data) == 7
    actual = next(d for d in response.data if d['day_of_week'] == TODAY.weekday())
    assert actual['breaks'][0]['start_time'] == '12:00:00'
    if role == 'manager':
        assert actual['breaks'][0]['title'] == 'Private operational reason'
    else:
        assert 'title' not in actual['breaks'][0] and 'Private operational reason' not in str(response.data)


@pytest.mark.parametrize('application_state', ['INCOMPLETE', 'PENDING_REVIEW', 'REJECTED'])
def test_pending_owner_can_prepare_initial_hours_without_operational_access(setup, application_state):
    provider = setup['provider']
    provider.application_status = application_state
    provider.save(update_fields=['application_status'])
    membership = provider.membership
    membership.is_active = False
    membership.save(update_fields=['is_active'])
    client = APIClient()
    client.force_authenticate(setup['provider_user'])
    url = f"/api/v1/organizations/{setup['org'].pk}/providers/{provider.pk}/schedules/"
    response = client.post(url, {'day_of_week': 0, 'start_time': '09:00:00', 'end_time': '17:00:00', 'is_working_day': True}, format='json')
    assert response.status_code == 200, response.data
    provider.refresh_from_db()
    assert provider.application_status == application_state and not provider.is_operationally_active
    assert client.post(f"/api/v1/organizations/{setup['org'].pk}/queue/providers/{provider.pk}/call-next/", {}).status_code == 403
    from apps.providers.models import ProviderLeave
    leave_start = datetime.combine(TODAY + timedelta(days=1), time(12), tzinfo=TZ)
    leave_url = f"/api/v1/organizations/{setup['org'].pk}/providers/{provider.pk}/leaves/"
    response = client.post(leave_url, {
        'start_datetime': leave_start.isoformat(),
        'end_datetime': (leave_start + timedelta(hours=1)).isoformat(),
        'reason': 'Applicant cannot change operational leave',
    }, format='json')
    assert response.status_code == 403, response.data
    assert not ProviderLeave.objects.filter(provider=provider).exists()
    protected = ProviderLeave.objects.create(
        provider=provider, start_datetime=leave_start,
        end_datetime=leave_start + timedelta(hours=1), reason='Authorized existing leave',
    )
    assert client.delete(f'{leave_url}{protected.pk}/').status_code == 403
    protected.refresh_from_db()
    assert protected.reason == 'Authorized existing leave'
    assert ProviderLeave.objects.filter(provider=provider).count() == 1

