import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Service
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak, ProviderLeave

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email, password="Password123!", **kwargs):
        return User.objects.create_user(email=email, password=password, **kwargs)
    return make_user


def _login(client, email, password="Password123!"):
    res = client.post(reverse('accounts:login'), {'email': email, 'password': password}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return client


@pytest.fixture
def setup_org(create_user):
    """Returns (org, manager, provider_user, staff_user)."""
    manager = create_user(email='manager@example.com')
    provider_user = create_user(email='provider@example.com')
    staff_user = create_user(email='staff@example.com')
    org = Organization.objects.create(name='Test Clinic', slug='test-clinic')
    mgr_mem = OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)
    prov_mem = OrganizationMembership.objects.create(user=provider_user, organization=org, role=OrganizationMembership.Role.PROVIDER)
    OrganizationMembership.objects.create(user=staff_user, organization=org, role=OrganizationMembership.Role.STAFF)
    return org, manager, provider_user, staff_user, prov_mem


@pytest.fixture
def manager_client(api_client, setup_org):
    org, manager, *_ = setup_org
    _login(api_client, 'manager@example.com')
    api_client.org = org
    return api_client


@pytest.fixture
def provider_profile(setup_org):
    org, manager, provider_user, staff_user, prov_mem = setup_org
    return ProviderProfile.objects.create(membership=prov_mem, bio='Expert provider', title='Dr.')


@pytest.fixture
def service(setup_org):
    org, *_ = setup_org
    return Service.objects.create(organization=org, name='Haircut', duration_minutes=30, price='20.00')


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _provider_list_url(org_id):
    return reverse('providers:provider_list_create', kwargs={'organization_id': org_id})

def _provider_detail_url(org_id, provider_id):
    return reverse('providers:provider_detail', kwargs={'organization_id': org_id, 'provider_id': provider_id})

def _prov_svc_list_url(org_id, provider_id):
    return reverse('providers:provider_service_list_create', kwargs={'organization_id': org_id, 'provider_id': provider_id})

def _schedule_list_url(org_id, provider_id):
    return reverse('providers:schedule_list_create', kwargs={'organization_id': org_id, 'provider_id': provider_id})

def _break_list_url(org_id, provider_id, schedule_id):
    return reverse('providers:break_list_create', kwargs={'organization_id': org_id, 'provider_id': provider_id, 'schedule_id': schedule_id})

def _leave_list_url(org_id, provider_id):
    return reverse('providers:leave_list_create', kwargs={'organization_id': org_id, 'provider_id': provider_id})


# ---------------------------------------------------------------------------
# ProviderProfile tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProviderProfileCRUD:
    def test_manager_can_create_provider_profile(self, manager_client, setup_org):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        url = _provider_list_url(org.id)
        res = manager_client.post(url, {'membership_id': prov_mem.id, 'bio': 'Expert', 'title': 'Dr.'}, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['title'] == 'Dr.'
        assert ProviderProfile.objects.filter(membership=prov_mem).exists()

    def test_create_profile_with_non_provider_role_rejected(self, manager_client, setup_org):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        # Use staff membership
        staff_mem = OrganizationMembership.objects.get(user=staff_user, organization=org)
        url = _provider_list_url(org.id)
        res = manager_client.post(url, {'membership_id': staff_mem.id}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'MEMBERSHIP_NOT_PROVIDER_ROLE'

    def test_duplicate_provider_profile_rejected(self, manager_client, setup_org, provider_profile):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        url = _provider_list_url(org.id)
        res = manager_client.post(url, {'membership_id': prov_mem.id, 'bio': 'Dup'}, format='json')
        assert res.status_code == status.HTTP_409_CONFLICT
        assert res.data['error']['code'] == 'PROVIDER_PROFILE_EXISTS'

    def test_list_providers_visible_to_members(self, api_client, setup_org, provider_profile):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        _login(api_client, 'staff@example.com')
        url = _provider_list_url(org.id)
        res = api_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1

    def test_manager_can_update_provider_profile(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        url = _provider_detail_url(org.id, provider_profile.id)
        res = manager_client.patch(url, {'title': 'Prof.', 'is_active': False}, format='json')
        assert res.status_code == status.HTTP_200_OK
        provider_profile.refresh_from_db()
        assert provider_profile.title == 'Prof.'
        assert provider_profile.is_active is False

    def test_manager_can_delete_provider_profile(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        url = _provider_detail_url(org.id, provider_profile.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_provider_profile_tenant_isolation(self, api_client, create_user, setup_org, provider_profile):
        """A manager of org B cannot access org A's provider via org B URL."""
        org_a, *_ = setup_org
        manager_b = create_user(email='manager_b@example.com')
        org_b = Organization.objects.create(name='Org B', slug='org-b')
        OrganizationMembership.objects.create(user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER)
        _login(api_client, 'manager_b@example.com')
        url = _provider_detail_url(org_b.id, provider_profile.id)
        res = api_client.get(url)
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_cross_org_membership_rejected_for_profile_creation(self, manager_client, create_user, setup_org):
        """Membership from a different org cannot be used to create a profile in this org."""
        org_a, *_ = setup_org
        manager_b = create_user(email='manager_b@example.com')
        user_b = create_user(email='provider_b@example.com')
        org_b = Organization.objects.create(name='Org B', slug='org-b')
        OrganizationMembership.objects.create(user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER)
        mem_b = OrganizationMembership.objects.create(user=user_b, organization=org_b, role=OrganizationMembership.Role.PROVIDER)
        # manager_client is for org_a; tries to use membership from org_b
        url = _provider_list_url(org_a.id)
        res = manager_client.post(url, {'membership_id': mem_b.id}, format='json')
        # membership not found within org_a → 404 error
        assert res.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# ProviderService assignment tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProviderServiceAssignment:
    def test_manager_can_assign_service_to_provider(self, manager_client, setup_org, provider_profile, service):
        org = manager_client.org
        url = _prov_svc_list_url(org.id, provider_profile.id)
        res = manager_client.post(url, {'service_id': str(service.id)}, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert ProviderService.objects.filter(provider=provider_profile, service=service).exists()

    def test_duplicate_service_assignment_rejected(self, manager_client, setup_org, provider_profile, service):
        org = manager_client.org
        ProviderService.objects.create(provider=provider_profile, service=service)
        url = _prov_svc_list_url(org.id, provider_profile.id)
        res = manager_client.post(url, {'service_id': str(service.id)}, format='json')
        assert res.status_code == status.HTTP_409_CONFLICT
        assert res.data['error']['code'] == 'DUPLICATE_PROVIDER_SERVICE'

    def test_cross_org_service_assignment_rejected(self, manager_client, setup_org, provider_profile, create_user):
        org_a, *_ = setup_org
        org_b = Organization.objects.create(name='Org B', slug='org-b')
        # service from org_b
        svc_b = Service.objects.create(organization=org_b, name='Org B Svc', duration_minutes=15, price='0.00')
        url = _prov_svc_list_url(org_a.id, provider_profile.id)
        res = manager_client.post(url, {'service_id': str(svc_b.id)}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'SERVICE_ORGANIZATION_MISMATCH'

    def test_manager_can_list_provider_services(self, manager_client, setup_org, provider_profile, service):
        org = manager_client.org
        ProviderService.objects.create(provider=provider_profile, service=service)
        url = _prov_svc_list_url(org.id, provider_profile.id)
        res = manager_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1

    def test_manager_can_remove_provider_service(self, manager_client, setup_org, provider_profile, service):
        org = manager_client.org
        ps = ProviderService.objects.create(provider=provider_profile, service=service)
        url = reverse('providers:provider_service_detail', kwargs={
            'organization_id': org.id,
            'provider_id': provider_profile.id,
            'provider_service_id': ps.id,
        })
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not ProviderService.objects.filter(id=ps.id).exists()


# ---------------------------------------------------------------------------
# WeeklySchedule tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestWeeklySchedule:
    def test_manager_can_set_schedule(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        url = _schedule_list_url(org.id, provider_profile.id)
        payload = {
            'day_of_week': 1,  # Tuesday
            'start_time': '09:00:00',
            'end_time': '17:00:00',
            'is_working_day': True,
        }
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['day_of_week'] == 1
        assert WeeklySchedule.objects.filter(provider=provider_profile, day_of_week=1).exists()

    def test_schedule_upserts_existing_day(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='08:00', end_time='16:00', is_working_day=True
        )
        url = _schedule_list_url(org.id, provider_profile.id)
        payload = {'day_of_week': 0, 'start_time': '09:00:00', 'end_time': '17:00:00', 'is_working_day': True}
        res = manager_client.post(url, payload, format='json')
        # Should update, not create → 200 OK
        assert res.status_code == status.HTTP_200_OK
        assert res.data['start_time'] == '09:00:00'
        assert WeeklySchedule.objects.filter(provider=provider_profile, day_of_week=0).count() == 1

    def test_invalid_schedule_end_before_start_rejected(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        url = _schedule_list_url(org.id, provider_profile.id)
        payload = {'day_of_week': 2, 'start_time': '17:00:00', 'end_time': '09:00:00', 'is_working_day': True}
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_schedules(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00'
        )
        url = _schedule_list_url(org.id, provider_profile.id)
        res = manager_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1


# ---------------------------------------------------------------------------
# ScheduleBreak tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestScheduleBreak:
    def test_manager_can_add_break(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        schedule = WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00'
        )
        url = _break_list_url(org.id, provider_profile.id, schedule.id)
        payload = {'title': 'Lunch', 'start_time': '12:00:00', 'end_time': '13:00:00'}
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['title'] == 'Lunch'
        assert ScheduleBreak.objects.filter(weekly_schedule=schedule).count() == 1

    def test_invalid_break_end_before_start(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        schedule = WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00'
        )
        url = _break_list_url(org.id, provider_profile.id, schedule.id)
        payload = {'title': 'Bad Break', 'start_time': '14:00:00', 'end_time': '12:00:00'}
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_break(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        schedule = WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00'
        )
        brk = ScheduleBreak.objects.create(
            weekly_schedule=schedule, title='Lunch',
            start_time='12:00', end_time='13:00'
        )
        url = reverse('providers:break_detail', kwargs={
            'organization_id': org.id,
            'provider_id': provider_profile.id,
            'schedule_id': schedule.id,
            'break_id': brk.id,
        })
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not ScheduleBreak.objects.filter(id=brk.id).exists()


# ---------------------------------------------------------------------------
# ProviderLeave tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProviderLeave:
    def test_manager_can_create_leave(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        url = _leave_list_url(org.id, provider_profile.id)
        payload = {
            'start_datetime': '2025-01-10T00:00:00Z',
            'end_datetime': '2025-01-15T23:59:00Z',
            'reason': 'Vacation',
        }
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['reason'] == 'Vacation'
        assert ProviderLeave.objects.filter(provider=provider_profile).count() == 1

    def test_leave_end_before_start_rejected(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        url = _leave_list_url(org.id, provider_profile.id)
        payload = {
            'start_datetime': '2025-01-15T00:00:00Z',
            'end_datetime': '2025-01-10T00:00:00Z',
        }
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_manager_can_delete_leave(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        from datetime import datetime, timezone
        leave = ProviderLeave.objects.create(
            provider=provider_profile,
            start_datetime=datetime(2025, 1, 10, tzinfo=timezone.utc),
            end_datetime=datetime(2025, 1, 15, tzinfo=timezone.utc),
        )
        url = reverse('providers:leave_detail', kwargs={
            'organization_id': org.id,
            'provider_id': provider_profile.id,
            'leave_id': leave.id,
        })
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not ProviderLeave.objects.filter(id=leave.id).exists()

    def test_list_leaves(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        from datetime import datetime, timezone
        ProviderLeave.objects.create(
            provider=provider_profile,
            start_datetime=datetime(2025, 2, 1, tzinfo=timezone.utc),
            end_datetime=datetime(2025, 2, 5, tzinfo=timezone.utc),
        )
        url = _leave_list_url(org.id, provider_profile.id)
        res = manager_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1


# ---------------------------------------------------------------------------
# Staff cannot write (permission enforcement)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProviderWritePermissions:
    def test_staff_cannot_create_provider_profile(self, api_client, setup_org):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        _login(api_client, 'staff@example.com')
        url = _provider_list_url(org.id)
        res = api_client.post(url, {'membership_id': prov_mem.id}, format='json')
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_staff_cannot_create_service(self, api_client, setup_org):
        org, *_ = setup_org
        _login(api_client, 'staff@example.com')
        url = reverse('services:service_list_create', kwargs={'organization_id': org.id})
        res = api_client.post(url, {'name': 'X', 'duration_minutes': 10, 'price': '0.00'}, format='json')
        assert res.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# ScheduleBreak business rules
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestScheduleBreakRules:
    def test_break_outside_working_hours_rejected(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        schedule = WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00', is_working_day=True
        )
        url = _break_list_url(org.id, provider_profile.id, schedule.id)
        res = manager_client.post(
            url,
            {'title': 'Late', 'start_time': '16:00:00', 'end_time': '18:00:00'},
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'BREAK_OUTSIDE_WORKING_HOURS'

    def test_break_on_non_working_day_rejected(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        schedule = WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00', is_working_day=False
        )
        url = _break_list_url(org.id, provider_profile.id, schedule.id)
        res = manager_client.post(
            url,
            {'title': 'Lunch', 'start_time': '12:00:00', 'end_time': '13:00:00'},
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'BREAK_ON_NON_WORKING_DAY'

    def test_overlapping_breaks_rejected(self, manager_client, setup_org, provider_profile):
        org = manager_client.org
        schedule = WeeklySchedule.objects.create(
            provider=provider_profile, day_of_week=0,
            start_time='09:00', end_time='17:00', is_working_day=True
        )
        ScheduleBreak.objects.create(
            weekly_schedule=schedule, title='Lunch',
            start_time='12:00', end_time='13:00'
        )
        url = _break_list_url(org.id, provider_profile.id, schedule.id)
        res = manager_client.post(
            url,
            {'title': 'Overlap', 'start_time': '12:30:00', 'end_time': '13:30:00'},
            format='json',
        )
        assert res.status_code == status.HTTP_409_CONFLICT
        assert res.data['error']['code'] == 'BREAK_OVERLAP'


# ---------------------------------------------------------------------------
# Provider self-management & customer discovery
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProviderSelfManagementAndDiscovery:
    def test_provider_can_update_own_profile(self, api_client, setup_org, provider_profile):
        org, *_ = setup_org
        _login(api_client, 'provider@example.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.patch(url, {'bio': 'Updated by provider'}, format='json')
        assert res.status_code == status.HTTP_200_OK
        provider_profile.refresh_from_db()
        assert provider_profile.bio == 'Updated by provider'

    def test_provider_can_set_own_schedule(self, api_client, setup_org, provider_profile):
        org, *_ = setup_org
        _login(api_client, 'provider@example.com')
        url = _schedule_list_url(org.id, provider_profile.id)
        res = api_client.post(
            url,
            {'day_of_week': 3, 'start_time': '10:00:00', 'end_time': '16:00:00', 'is_working_day': True},
            format='json',
        )
        assert res.status_code == status.HTTP_201_CREATED

    def test_demoted_provider_cannot_manage_own_schedule(self, api_client, setup_org, provider_profile):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        prov_mem.role = OrganizationMembership.Role.STAFF
        prov_mem.save()
        _login(api_client, 'provider@example.com')
        url = _schedule_list_url(org.id, provider_profile.id)
        res = api_client.post(
            url,
            {'day_of_week': 3, 'start_time': '10:00:00', 'end_time': '16:00:00', 'is_working_day': True},
            format='json',
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_provider_cannot_update_another_provider_profile(self, api_client, create_user, setup_org, provider_profile):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        other_user = create_user(email='provider2@example.com')
        other_mem = OrganizationMembership.objects.create(
            user=other_user, organization=org, role=OrganizationMembership.Role.PROVIDER
        )
        other_profile = ProviderProfile.objects.create(membership=other_mem, title='Other')
        _login(api_client, 'provider@example.com')
        url = _provider_detail_url(org.id, other_profile.id)
        res = api_client.patch(url, {'title': 'Hacked'}, format='json')
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_customer_can_list_active_providers(self, api_client, create_user, setup_org, provider_profile):
        org, *_ = setup_org
        provider_profile.is_active = True
        provider_profile.save()
        inactive_user = create_user(email='inactive_prov@example.com')
        inactive_mem = OrganizationMembership.objects.create(
            user=inactive_user, organization=org, role=OrganizationMembership.Role.PROVIDER
        )
        ProviderProfile.objects.create(membership=inactive_mem, is_active=False)
        create_user(email='customer@example.com')
        _login(api_client, 'customer@example.com')
        res = api_client.get(_provider_list_url(org.id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1
        assert res.data[0]['id'] == str(provider_profile.id)

    def test_demoted_provider_profile_is_hidden_from_discovery(self, api_client, create_user, setup_org, provider_profile):
        org, manager, provider_user, staff_user, prov_mem = setup_org
        prov_mem.role = OrganizationMembership.Role.STAFF
        prov_mem.save()
        create_user(email='customer-demoted@example.com')
        _login(api_client, 'customer-demoted@example.com')
        res = api_client.get(_provider_list_url(org.id))
        assert res.status_code == status.HTTP_200_OK
        assert res.data == []
