"""Field-specific planning-duration authority; unrelated profile edits remain valid."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.capacity import date_capacity
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.providers.services import ProviderService_ as ProviderOps
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService
from apps.services.models import Service


TODAY = date(2026, 10, 13)
TZ = ZoneInfo('Asia/Dhaka')


@pytest.fixture
def setup(db, monkeypatch):
    monkeypatch.setattr(timezone, 'now', lambda: datetime.combine(TODAY, time(7), TZ))
    org = Organization.objects.create(name='Duration permissions', slug='duration-permissions', verification_status='APPROVED')
    foreign = Organization.objects.create(name='Foreign duration', slug='foreign-duration', verification_status='APPROVED')
    roles = ('manager', 'provider', 'staff', 'customer', 'inactive', 'foreign', 'admin', 'superuser', 'customer2')
    users = {role: User.objects.create_user(email=f'{role}@duration.test',
             is_staff=role == 'admin', is_superuser=role == 'superuser') for role in roles}
    memberships = {}
    for role in ('manager', 'provider', 'staff', 'inactive'):
        memberships[role] = OrganizationMembership.objects.create(
            organization=org, user=users[role], role='MANAGER' if role == 'inactive' else role.upper(),
            is_active=role != 'inactive')
    OrganizationMembership.objects.create(organization=foreign, user=users['foreign'], role='MANAGER')
    provider = ProviderProfile.objects.create(membership=memberships['provider'], application_status='APPROVED',
                                             title='Original title', bio='Original bio', average_service_minutes=10)
    service = Service.objects.create(organization=org, name='Consultation', duration_minutes=25, price=1000)
    ProviderService.objects.create(provider=provider, service=service, custom_price=1200)
    for day in range(7):
        WeeklySchedule.objects.create(provider=provider, day_of_week=day, start_time=time(10), end_time=time(17))
    return dict(org=org, foreign=foreign, users=users, memberships=memberships, provider=provider, service=service)


def client(setup, role):
    result = APIClient()
    if role != 'anonymous':
        result.force_authenticate(setup['users'][role])
    return result


def url(setup):
    return reverse('providers:provider_detail', kwargs={'organization_id': setup['org'].pk,
                                                       'provider_id': setup['provider'].pk})


def snapshot(setup):
    return ProviderProfile.objects.values().get(pk=setup['provider'].pk)


@pytest.mark.parametrize('role', ['provider', 'admin', 'superuser', 'staff', 'customer', 'inactive', 'foreign', 'anonymous'])
@pytest.mark.parametrize('payload', [
    {'average_service_minutes': 15},
    {'average_service_minutes': None},
    {'average_service_minutes': 15, 'title': 'Changed title', 'bio': 'Changed bio'},
])
def test_unauthorized_duration_patch_is_denied_without_any_profile_write(setup, role, payload):
    before = snapshot(setup)
    response = client(setup, role).patch(url(setup), payload, format='json')
    assert response.status_code == (401 if role == 'anonymous' else 403)
    assert snapshot(setup) == before


def test_active_own_manager_can_update_duration_and_other_fields(setup):
    response = client(setup, 'manager').patch(url(setup), {'average_service_minutes': 15, 'bio': 'Manager edit'}, format='json')
    assert response.status_code == 200
    assert response.data['average_service_minutes'] == 15
    assert snapshot(setup)['average_service_minutes'] == 15
    assert snapshot(setup)['bio'] == 'Manager edit'


@pytest.mark.parametrize('role', ['admin', 'superuser'])
@pytest.mark.parametrize('membership_state', ['active', 'inactive', 'foreign'])
def test_platform_flags_require_independent_active_own_manager_membership(setup, role, membership_state):
    OrganizationMembership.objects.create(user=setup['users'][role],
        organization=setup['foreign'] if membership_state == 'foreign' else setup['org'],
        role='MANAGER', is_active=membership_state != 'inactive')
    before = snapshot(setup)
    response = client(setup, role).patch(url(setup), {'average_service_minutes': 15}, format='json')
    assert response.status_code == (200 if membership_state == 'active' else 403)
    if membership_state == 'active':
        assert snapshot(setup)['average_service_minutes'] == 15
    else:
        assert snapshot(setup) == before


@pytest.mark.parametrize('state', ['INCOMPLETE', 'PENDING_REVIEW', 'REJECTED'])
def test_onboarding_profile_ownership_does_not_grant_duration_authority(setup, state):
    provider = setup['provider']
    provider.application_status = state
    provider.save()
    setup['memberships']['provider'].is_active = False
    setup['memberships']['provider'].save()
    before = snapshot(setup)
    response = client(setup, 'provider').patch(url(setup), {'average_service_minutes': 15, 'bio': 'Invalid mixed edit'}, format='json')
    assert response.status_code == 403
    assert snapshot(setup) == before
    response = client(setup, 'provider').patch(url(setup), {'bio': 'Valid onboarding edit'}, format='json')
    assert response.status_code == 200
    assert snapshot(setup)['bio'] == 'Valid onboarding edit'
    assert snapshot(setup)['average_service_minutes'] == 10


@pytest.mark.parametrize('role', ['provider', 'admin', 'superuser', 'manager'])
def test_unrelated_profile_edit_permissions_are_preserved(setup, role):
    response = client(setup, role).patch(url(setup), {'title': 'Allowed title', 'bio': 'Allowed bio'}, format='json')
    assert response.status_code == 200
    assert snapshot(setup)['title'] == 'Allowed title'
    assert snapshot(setup)['bio'] == 'Allowed bio'
    assert snapshot(setup)['average_service_minutes'] == 10


@pytest.mark.parametrize('role', ['provider', 'admin', 'superuser', 'staff', 'customer', 'foreign', 'inactive', None])
def test_service_call_without_authorized_manager_cannot_bypass_field_guard(setup, role):
    before = snapshot(setup)
    with pytest.raises(PermissionDenied):
        ProviderOps.update_provider_profile(profile=setup['provider'],
            actor=setup['users'][role] if role else None, average_service_minutes=15, bio='Must not persist')
    assert snapshot(setup) == before


def test_service_preserves_unrelated_internal_edits_and_requires_actor_for_duration(setup):
    updated = ProviderOps.update_provider_profile(profile=setup['provider'], bio='Internal edit')
    assert updated.bio == 'Internal edit' and updated.average_service_minutes == 10
    updated = ProviderOps.update_provider_profile(profile=updated, actor=setup['users']['manager'], average_service_minutes=15)
    assert updated.average_service_minutes == 15


@pytest.mark.parametrize('value', [0, -1, None, 1.5, True, 'invalid'])
def test_authorized_manager_invalid_duration_preserves_entire_profile(setup, value):
    before = snapshot(setup)
    response = client(setup, 'manager').patch(url(setup), {'average_service_minutes': value, 'bio': 'Must not persist'}, format='json')
    assert response.status_code == 400
    assert snapshot(setup) == before


def booked_pair(setup):
    schedule = setup['provider'].weekly_schedules.get(day_of_week=TODAY.weekday())
    schedule.end_time = time(10, 20)
    schedule.save()
    appointments = []
    for role in ('customer', 'customer2'):
        appointments.append(AppointmentService.book_appointment(organization_id=setup['org'].pk,
            provider_id=setup['provider'].pk, service_id=setup['service'].pk,
            customer=setup['users'][role], appointment_date=TODAY))
    return appointments


def test_manager_capacity_conflict_cannot_partially_update_profile_or_bookings(setup):
    booked_pair(setup)
    before = snapshot(setup)
    appointments = list(Appointment.objects.order_by('id').values())
    entries = list(QueueEntry.objects.order_by('id').values())
    response = client(setup, 'manager').patch(url(setup), {'average_service_minutes': 20, 'bio': 'Must not persist'}, format='json')
    assert response.status_code == 409
    assert response.data['error']['code'] == 'DURATION_BOOKING_CONFLICT'
    assert snapshot(setup) == before
    assert list(Appointment.objects.order_by('id').values()) == appointments
    assert list(QueueEntry.objects.order_by('id').values()) == entries


def test_authorized_average_drives_capacity_and_eta_without_rewriting_history(setup):
    appointments = booked_pair(setup)
    before = list(Appointment.objects.order_by('id').values())
    assert date_capacity(setup['provider'], TODAY)['daily_capacity'] == 2
    response = client(setup, 'manager').patch(url(setup), {'average_service_minutes': 5}, format='json')
    assert response.status_code == 200
    setup['provider'].refresh_from_db()
    assert date_capacity(setup['provider'], TODAY)['daily_capacity'] == 4
    entry = QueueEntry.objects.select_related('provider', 'appointment').get(appointment=appointments[1])
    eta = QueueService.calculate_readiness_and_eta(entry)
    assert datetime.fromisoformat(eta['estimated_start_time']) == datetime.combine(TODAY, time(10), TZ) + timedelta(minutes=5)
    assert list(Appointment.objects.order_by('id').values()) == before
    assert [a.serial_number for a in appointments] == [1, 2]
    assert QueueEntry.objects.count() == 2


def test_manager_membership_is_rechecked_inside_locked_service(setup, monkeypatch):
    original = ProviderOps.update_provider_profile
    def revoke_then_update(**kwargs):
        OrganizationMembership.objects.filter(pk=setup['memberships']['manager'].pk).update(is_active=False)
        return original(**kwargs)
    monkeypatch.setattr(ProviderOps, 'update_provider_profile', revoke_then_update)
    before = snapshot(setup)
    response = client(setup, 'manager').patch(url(setup), {'average_service_minutes': 15, 'bio': 'Must not persist'}, format='json')
    assert response.status_code == 403
    assert snapshot(setup) == before


def test_guessed_foreign_nested_provider_id_does_not_allow_edit(setup):
    before = snapshot(setup)
    foreign_url = reverse('providers:provider_detail', kwargs={'organization_id': setup['foreign'].pk,
                                                            'provider_id': setup['provider'].pk})
    response = client(setup, 'foreign').patch(foreign_url, {'average_service_minutes': 15}, format='json')
    assert response.status_code == 404
    assert snapshot(setup) == before


@pytest.mark.parametrize('role', ['provider', 'manager', 'admin'])
@pytest.mark.parametrize('method', ['put', 'post'])
def test_unsupported_profile_methods_cannot_bypass_duration_guard(setup, role, method):
    before = snapshot(setup)
    response = getattr(client(setup, role), method)(url(setup), {'average_service_minutes': 15, 'bio': 'Must not persist'}, format='json')
    assert response.status_code in (403, 405)
    assert snapshot(setup) == before


def test_public_profile_is_not_an_alternative_update_endpoint(setup):
    before = snapshot(setup)
    public_url = reverse('providers:provider_public_profile', kwargs={'organization_id': setup['org'].pk,
                                                                    'provider_id': setup['provider'].pk})
    response = client(setup, 'provider').patch(public_url, {'average_service_minutes': 15}, format='json')
    assert response.status_code == 405
    assert snapshot(setup) == before


def test_unsupported_nested_duration_payload_does_not_change_authoritative_field(setup):
    response = client(setup, 'provider').patch(url(setup), {'provider_profile': {'average_service_minutes': 15},
                                                        'bio': 'Allowed bio'}, format='json')
    assert response.status_code == 200
    assert snapshot(setup)['bio'] == 'Allowed bio'
    assert snapshot(setup)['average_service_minutes'] == 10


@pytest.mark.parametrize('role', ['manager', 'admin'])
def test_duplicate_profile_creation_cannot_overwrite_existing_average(setup, role):
    before = snapshot(setup)
    create_url = reverse('providers:provider_list_create', kwargs={'organization_id': setup['org'].pk})
    response = client(setup, role).post(create_url, {'membership_id': setup['memberships']['provider'].pk,
                                                   'average_service_minutes': 15}, format='json')
    assert response.status_code == 409
    assert response.data['error']['code'] == 'PROVIDER_PROFILE_EXISTS'
    assert snapshot(setup) == before


def test_duplicate_registration_cannot_update_existing_average(setup):
    before = snapshot(setup)
    response = client(setup, 'provider').post(reverse('accounts:register_provider'), {
        'email': setup['users']['provider'].email, 'password': 'Strong!Pass2026', 'password_confirm': 'Strong!Pass2026',
        'organization_id': str(setup['org'].pk), 'average_service_minutes': 15}, format='json')
    assert response.status_code == 400
    assert snapshot(setup) == before
