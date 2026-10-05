from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.appointments.serializers import AppointmentSerializer, AppointmentListSerializer, CustomerDashboardItemSerializer
from apps.appointments.services import AppointmentService, get_project_tz
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.providers.services import ProviderService_ as ProviderBusiness
from apps.queue.models import QueueEntry
from apps.queue.serializers import QueueEntrySerializer
from apps.queue.services import QueueService
from apps.services.models import Service

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup():
    org = Organization.objects.create(name='Snapshot Clinic', slug='snapshots', verification_status='APPROVED')
    user = User.objects.create_user(email='professional@snapshot.test')
    member = OrganizationMembership.objects.create(user=user, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(membership=member, application_status='APPROVED')
    service = Service.objects.create(organization=org, name='Consultation', duration_minutes=30, price='1000.00')
    assignment = ProviderService.objects.create(provider=provider, service=service, custom_price='1200.00')
    for day in range(7):
        WeeklySchedule.objects.create(provider=provider, day_of_week=day, start_time=time(0), end_time=time(23, 59))
    customer = User.objects.create_user(email='customer@snapshot.test', first_name='Original', last_name='Customer', phone_number='01712345678')
    on_date = timezone.localtime(timezone.now(), get_project_tz()).date() + timedelta(days=2)
    return org, provider, service, assignment, customer, on_date


def book(setup, **kwargs):
    org, provider, service, _, customer, on_date = setup
    return AppointmentService.book_appointment(organization_id=org.id, provider_id=provider.id,
        service_id=service.id, customer=customer, appointment_date=on_date, **kwargs)


def post(setup, **kwargs):
    client = APIClient()
    client.force_authenticate(setup[4])
    return client.post(f'/api/v1/organizations/{setup[0].id}/appointments/', {
        'provider_id': str(setup[1].id), 'service_id': str(setup[2].id),
        'appointment_date': setup[5].isoformat(), **kwargs,
    }, format='json')


@pytest.mark.parametrize('override,expected', [('1200.00', '1200.00'), (None, '1000.00'), ('0.00', '0.00')])
def test_price_snapshot_and_queue(setup, override, expected):
    ProviderService.objects.filter(pk=setup[3].pk).update(custom_price=override)
    appt = book(setup)
    assert appt.booked_service_charge == Decimal(expected)
    assert appt.serial_number == 1
    entry = QueueEntry.objects.get(appointment=appt)
    assert entry.serial_number == 1
    assert entry.status == 'WAITING'
    assert not entry.is_checked_in


def test_historical_price_immutable_new_booking_uses_new_price(setup):
    old = book(setup)
    ProviderBusiness.update_service_charge(provider=setup[1], provider_service_id=setup[3].id, custom_price=Decimal('1700.00'))
    new = book(setup)
    old.refresh_from_db()
    assert old.booked_service_charge == Decimal('1200.00')
    assert new.booked_service_charge == Decimal('1700.00')
    assert new.serial_number == 2
    assert AppointmentSerializer(old).data['booked_service_charge'] == '1200.00'


def test_client_cannot_forge_charge(setup):
    response = post(setup, booked_service_charge='1.00', custom_price='1.00')
    assert response.status_code == 201
    assert response.data['booked_service_charge'] == '1200.00'


@pytest.mark.parametrize('phone', ['01712345678', '+8801712345678'])
def test_explicit_contacts_normalized_profile_unchanged(setup, phone):
    response = post(setup, contact_name='  মাহমুদ রহমান  ', contact_phone=f' {phone} ')
    assert response.status_code == 201
    appt = Appointment.objects.get(pk=response.data['id'])
    assert appt.contact_name == 'মাহমুদ রহমান'
    assert appt.contact_phone == phone
    setup[4].refresh_from_db()
    assert (setup[4].first_name, setup[4].last_name, setup[4].phone_number) == ('Original', 'Customer', '01712345678')
    setup[4].first_name = 'Changed'
    setup[4].phone_number = '01912345678'
    setup[4].save()
    for serializer in (AppointmentSerializer, AppointmentListSerializer, CustomerDashboardItemSerializer):
        data = serializer(appt).data
        assert data['customer_name'] == 'মাহমুদ রহমান'
        assert data['contact_phone'] == phone
    assert QueueEntrySerializer(appt.queue_entry).data['customer_name'] == 'মাহমুদ রহমান'
    assert QueueEntrySerializer(appt.queue_entry).data['customer_phone'] == phone


def test_omitted_contact_fallback_and_missing_profile_data(setup):
    appt = book(setup)
    assert appt.contact_name == 'Original Customer'
    assert appt.contact_phone == '01712345678'
    User.objects.filter(pk=setup[4].pk).update(first_name='', last_name='', phone_number='')
    setup[4].refresh_from_db()
    empty = book(setup)
    assert empty.contact_name == setup[4].email
    assert empty.contact_phone is None


@pytest.mark.parametrize('fields', [
    {'contact_name': '   '}, {'contact_name': 'x' * 301}, {'contact_name': None},
    {'contact_phone': ''}, {'contact_phone': 'abc'}, {'contact_phone': '017123'},
    {'contact_phone': '+88017123456789'}, {'contact_phone': None},
])
def test_explicit_invalid_contact_rejected(setup, fields):
    assert post(setup, **fields).status_code == 400
    assert not Appointment.objects.exists()
    assert not QueueEntry.objects.exists()


def test_legacy_null_snapshot_display(setup):
    appt = book(setup)
    Appointment.objects.filter(pk=appt.pk).update(booked_service_charge=None, contact_name=None, contact_phone=None)
    appt.refresh_from_db()
    data = AppointmentSerializer(appt).data
    assert data['customer_name'] == 'Original Customer'
    assert data['booked_service_charge'] is None
    assert data['contact_name'] is None and data['contact_phone'] is None
    assert QueueEntrySerializer(appt.queue_entry).data['customer_phone'] == '01712345678'


@pytest.mark.parametrize('actor', ['anonymous', 'other_customer', 'other_manager'])
def test_contact_read_authorization(setup, actor):
    appt = book(setup, contact_name='Private Name', contact_phone='01912345678')
    client = APIClient()
    if actor != 'anonymous':
        user = User.objects.create_user(email=f'{actor}@snapshot.test')
        if actor == 'other_manager':
            other = Organization.objects.create(name='Other', slug='other-snapshots', verification_status='APPROVED')
            OrganizationMembership.objects.create(user=user, organization=other, role='MANAGER')
        client.force_authenticate(user)
    for path in (f'/api/v1/organizations/{setup[0].id}/appointments/{appt.id}/', f'/api/v1/customer/appointments/{appt.id}/'):
        response = client.get(path)
        assert response.status_code in (401, 403, 404)
        assert 'Private Name' not in str(response.data)
        assert '01912345678' not in str(response.data)


@pytest.mark.parametrize('phone', ['01712345678', ''])
def test_walk_in_preserves_entered_name_and_snapshots_charge(setup, phone):
    appt = QueueService.register_walk_in(organization_id=setup[0].id, provider_id=setup[1].id,
        service_id=setup[2].id, first_name='Walk-in', last_name='Contact', phone_number=phone)
    assert appt.contact_name == 'Walk-in Contact'
    assert appt.contact_phone == (phone or None)
    assert appt.booked_service_charge == Decimal('1200.00')
    assert appt.booking_channel == 'FRONT_DESK' and appt.arrival_type == 'WALK_IN'
    assert appt.queue_entry.is_checked_in
    setup[4].refresh_from_db()
    assert setup[4].get_full_name() == 'Original Customer'


def test_booking_locks_provider_then_assignment(setup):
    events = []
    provider_lock = ProviderProfile.objects.select_for_update
    assignment_lock = ProviderService.objects.select_for_update

    def lock_provider(*args, **kwargs):
        assert connection.in_atomic_block
        events.append('provider')
        return provider_lock(*args, **kwargs)

    def lock_assignment(*args, **kwargs):
        assert connection.in_atomic_block
        events.append('assignment')
        return assignment_lock(*args, **kwargs)

    with patch.object(ProviderProfile.objects, 'select_for_update', side_effect=lock_provider), patch.object(
        ProviderService.objects, 'select_for_update', side_effect=lock_assignment
    ):
        book(setup)
    assert events == ['provider', 'assignment']
