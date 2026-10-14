import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment, ProviderDateSerial
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ProviderLeave
from apps.queue.models import QueueEntry


TZ = ZoneInfo('Asia/Dhaka')
TODAY = date(2026, 10, 15)


@pytest.fixture
def f012_setup(db, monkeypatch):
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 15, 8, tzinfo=TZ))

    # Org 1
    org1 = Organization.objects.create(name='F012 Org 1', slug='f012-org-1', verification_status='APPROVED')
    manager1 = User.objects.create_user(email='f012_mgr1@org1.test')
    staff1 = User.objects.create_user(email='f012_staff1@org1.test')
    prov_user1 = User.objects.create_user(email='f012_p1@org1.test')
    prov_user2 = User.objects.create_user(email='f012_p2@org1.test')
    cust1 = User.objects.create_user(email='f012_c1@test.test', phone_number='01700000001')

    OrganizationMembership.objects.create(organization=org1, user=manager1, role='MANAGER')
    OrganizationMembership.objects.create(organization=org1, user=staff1, role='STAFF')
    m_p1 = OrganizationMembership.objects.create(organization=org1, user=prov_user1, role='PROVIDER')
    m_p2 = OrganizationMembership.objects.create(organization=org1, user=prov_user2, role='PROVIDER')

    provider1 = ProviderProfile.objects.create(membership=m_p1, application_status='APPROVED')
    provider2 = ProviderProfile.objects.create(membership=m_p2, application_status='APPROVED')

    service1 = __import__('apps.services.models', fromlist=['Service']).Service.objects.create(
        organization=org1, name='F012 Service', price=500, duration_minutes=30,
    )
    assignment1 = ProviderService.objects.create(provider=provider1, service=service1, custom_price=500)
    assignment2 = ProviderService.objects.create(provider=provider2, service=service1, custom_price=500)

    for day in range(7):
        WeeklySchedule.objects.create(provider=provider1, day_of_week=day, start_time=time(9), end_time=time(17), is_working_day=True)
        WeeklySchedule.objects.create(provider=provider2, day_of_week=day, start_time=time(9), end_time=time(17), is_working_day=True)

    # Org 2 (Foreign)
    org2 = Organization.objects.create(name='F012 Org 2', slug='f012-org-2', verification_status='APPROVED')
    foreign_staff = User.objects.create_user(email='f012_fstaff@org2.test')
    OrganizationMembership.objects.create(organization=org2, user=foreign_staff, role='STAFF')

    return {
        'org1': org1,
        'org2': org2,
        'manager1': manager1,
        'staff1': staff1,
        'provider1': provider1,
        'prov_user1': prov_user1,
        'provider2': provider2,
        'prov_user2': prov_user2,
        'foreign_staff': foreign_staff,
        'cust1': cust1,
        'service1': service1,
    }


def _walkin_url(org, provider):
    return f"/api/v1/organizations/{org.pk}/queue/providers/{provider.pk}/walk-in/"


def test_authorized_provider_walk_in_registration_with_body_provider_id(f012_setup):
    """1. Successful authorized provider walk-in registration with provider_id in body."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['prov_user1'])

    payload = {
        'provider_id': str(s['provider1'].pk),
        'service_id': str(s['service1'].pk),
        'first_name': 'Walkin',
        'last_name': 'Patient1',
        'phone_number': '01711111111',
        'booking_channel': 'FRONT_DESK',
        'notes': 'Provider command board walk-in',
    }
    resp = client.post(_walkin_url(s['org1'], s['provider1']), payload, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['serial_number'] == 1
    assert resp.data['token_number'] == 1
    assert resp.data['status'] == 'WAITING'
    assert resp.data['is_checked_in'] is True
    assert resp.data['booking_channel'] == 'FRONT_DESK'
    assert resp.data['arrival_type'] == 'WALK_IN'


def test_authorized_staff_front_desk_and_phone_flow(f012_setup):
    """2. Successful authorized staff/front-desk flow for FRONT_DESK and PHONE."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['staff1'])

    # FRONT_DESK: auto checked-in
    resp1 = client.post(_walkin_url(s['org1'], s['provider1']), {
        'provider_id': str(s['provider1'].pk),
        'service_id': str(s['service1'].pk),
        'first_name': 'Staff',
        'last_name': 'DeskPatient',
        'phone_number': '01722222222',
        'booking_channel': 'FRONT_DESK',
    }, format='json')
    assert resp1.status_code == 201, resp1.data
    assert resp1.data['serial_number'] == 1
    assert resp1.data['is_checked_in'] is True

    # PHONE: not auto checked-in
    resp2 = client.post(_walkin_url(s['org1'], s['provider1']), {
        'provider_id': str(s['provider1'].pk),
        'service_id': str(s['service1'].pk),
        'first_name': 'Phone',
        'last_name': 'CallerPatient',
        'phone_number': '01733333333',
        'booking_channel': 'PHONE',
    }, format='json')
    assert resp2.status_code == 201, resp2.data
    assert resp2.data['serial_number'] == 2
    assert resp2.data['is_checked_in'] is False
    assert resp2.data['status'] == 'WAITING'


def test_missing_body_provider_id_uses_url_provider(f012_setup):
    """3. Missing body provider_id when the URL identifies the provider."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['prov_user1'])

    # Body omits provider_id entirely (like ProviderQueuePage.jsx state before fix)
    payload = {
        'service_id': str(s['service1'].pk),
        'first_name': 'NoBody',
        'last_name': 'ProviderID',
        'phone_number': '01744444444',
        'booking_channel': 'FRONT_DESK',
    }
    resp = client.post(_walkin_url(s['org1'], s['provider1']), payload, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['serial_number'] == 1
    assert resp.data['provider_id'] == str(s['provider1'].pk)


def test_conflicting_body_and_url_provider_id_rejected(f012_setup):
    """4. Conflicting body and URL provider_id returns 400 error."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    # URL is provider1, but body says provider2
    payload = {
        'provider_id': str(s['provider2'].pk),
        'service_id': str(s['service1'].pk),
        'first_name': 'Conflicting',
        'last_name': 'Target',
        'phone_number': '01755555555',
        'booking_channel': 'FRONT_DESK',
    }
    resp = client.post(_walkin_url(s['org1'], s['provider1']), payload, format='json')
    assert resp.status_code == 400, resp.data
    assert resp.data['detail'] == 'The body provider must match the authorized URL provider.'


def test_unauthorized_provider_cannot_register_on_other_provider_queue(f012_setup):
    """5. Unauthorized provider (Provider 1 trying to register on Provider 2's queue)."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['prov_user1'])

    # Provider 1 calls walk-in endpoint for Provider 2
    payload = {
        'service_id': str(s['service1'].pk),
        'first_name': 'Sneaky',
        'last_name': 'Attempt',
        'phone_number': '01766666666',
    }
    resp = client.post(_walkin_url(s['org1'], s['provider2']), payload, format='json')
    assert resp.status_code == 403


def test_foreign_organization_staff_denied(f012_setup):
    """6. Staff from a foreign organization cannot register walk-ins."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['foreign_staff'])

    payload = {
        'service_id': str(s['service1'].pk),
        'first_name': 'Foreign',
        'last_name': 'StaffCall',
        'phone_number': '01777777777',
    }
    resp = client.post(_walkin_url(s['org1'], s['provider1']), payload, format='json')
    assert resp.status_code == 403


def test_correct_appointment_queue_entry_and_serial_allocation(f012_setup):
    """7. Correct appointment/QueueEntry creation, monotonic serials, and snapshot retention."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['staff1'])

    resp1 = client.post(_walkin_url(s['org1'], s['provider1']), {
        'service_id': str(s['service1'].pk),
        'first_name': 'Alice',
        'last_name': 'Smith',
        'phone_number': '01788888881',
        'notes': 'Urgent checkup request',
    }, format='json')
    assert resp1.status_code == 201
    assert resp1.data['serial_number'] == 1

    resp2 = client.post(_walkin_url(s['org1'], s['provider1']), {
        'service_id': str(s['service1'].pk),
        'first_name': 'Bob',
        'last_name': 'Jones',
        'phone_number': '01788888882',
    }, format='json')
    assert resp2.status_code == 201
    assert resp2.data['serial_number'] == 2

    appt1 = Appointment.objects.get(pk=resp1.data['appointment_id'])
    assert appt1.serial_number == 1
    assert appt1.contact_name == 'Alice Smith'
    assert appt1.contact_phone == '01788888881'
    assert appt1.notes == 'Urgent checkup request'
    assert appt1.booked_service_charge == 500
    assert appt1.status == Appointment.Status.CHECKED_IN

    entry1 = QueueEntry.objects.get(appointment=appt1)
    assert entry1.serial_number == 1
    assert entry1.status == QueueEntry.Status.WAITING
    assert entry1.is_checked_in is True
    assert entry1.checked_in_at is not None

    # Persistent counter is updated
    counter = ProviderDateSerial.objects.get(provider=s['provider1'], booking_date=TODAY)
    assert counter.last_serial == 2


def test_rejection_when_capacity_or_leave_blocks_registration(f012_setup):
    """8. Rejection when capacity or leave rules block registration."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['prov_user1'])

    # Add approved full-day leave on TODAY
    sched_start = datetime.combine(TODAY, time(9), tzinfo=TZ)
    sched_end = datetime.combine(TODAY, time(17), tzinfo=TZ)
    ProviderLeave.objects.create(
        provider=s['provider1'],
        start_datetime=sched_start,
        end_datetime=sched_end,
        status='APPROVED',
    )

    payload = {
        'service_id': str(s['service1'].pk),
        'first_name': 'Leave',
        'last_name': 'ConflictPatient',
        'phone_number': '01799999999',
    }
    resp = client.post(_walkin_url(s['org1'], s['provider1']), payload, format='json')
    assert resp.status_code == 400
    assert resp.data['error']['code'] == 'LEAVE_CONFLICT'


def test_strict_serializer_rejects_null_customer_id_and_appointment_date(f012_setup):
    """9. Verify that passing explicit null for customer_id or appointment_date is rejected."""
    s = f012_setup
    client = APIClient()
    client.force_authenticate(s['prov_user1'])

    # Test explicit null customer_id
    payload1 = {
        'service_id': str(s['service1'].pk),
        'first_name': 'Null',
        'last_name': 'Customer',
        'customer_id': None,
    }
    resp1 = client.post(_walkin_url(s['org1'], s['provider1']), payload1, format='json')
    assert resp1.status_code == 400
    assert 'customer_id' in resp1.data

    # Test explicit null appointment_date
    payload2 = {
        'service_id': str(s['service1'].pk),
        'first_name': 'Null',
        'last_name': 'Date',
        'appointment_date': None,
    }
    resp2 = client.post(_walkin_url(s['org1'], s['provider1']), payload2, format='json')
    assert resp2.status_code == 400
    assert 'appointment_date' in resp2.data

