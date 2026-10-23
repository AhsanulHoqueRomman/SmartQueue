from datetime import time, date, timedelta

from apps.organizations.services import OrganizationService
from apps.providers.models import ProviderDocument
from apps.providers.services import ProviderService_ as ProviderBizService
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

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
    org = Organization.objects.create(
        name='Test Clinic', slug='test-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
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
    return ProviderProfile.objects.create(
        membership=prov_mem, bio='Expert provider', title='Dr.',
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )


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
        """Hard deletion of provider profile is prohibited; returns 405."""
        org = manager_client.org
        url = _provider_detail_url(org.id, provider_profile.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert res.json()['error']['code'] == 'PROVIDER_DELETION_DISABLED'
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

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
    @pytest.fixture(autouse=True)
    def initial_schedule_application(self, provider_profile):
        # Initial hours are editable; approved live hours require manager review.
        provider_profile.application_status = 'INCOMPLETE'
        provider_profile.save(update_fields=['application_status'])

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
        assert len(res.data) == 7
        assert [day['day_of_week'] for day in res.data] == list(range(7))
        monday = next(day for day in res.data if day['day_of_week'] == 0)
        assert monday['is_working_day'] and monday['start_time'] == '09:00:00'
        assert all(not day['is_working_day'] and day['id'] is None for day in res.data if day['day_of_week'] != 0)


# ---------------------------------------------------------------------------
# ScheduleBreak tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestScheduleBreak:
    @pytest.fixture(autouse=True)
    def initial_schedule_application(self, provider_profile):
        provider_profile.application_status = 'INCOMPLETE'
        provider_profile.save(update_fields=['application_status'])

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
        from django.utils import timezone
        from datetime import timedelta
        start = timezone.now() + timedelta(days=4)
        url = _leave_list_url(manager_client.org.id, provider_profile.id)
        payload = {'start_datetime': start.isoformat(),
                   'end_datetime': (start + timedelta(days=2)).isoformat(), 'reason': 'Vacation'}
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['reason'] == 'Vacation' and res.data['status'] == 'PENDING'
        assert ProviderLeave.objects.filter(provider=provider_profile, status='PENDING').count() == 1

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
        leave = ProviderLeave.objects.create(status='APPROVED',
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
        ProviderLeave.objects.create(status='APPROVED',
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
    @pytest.fixture(autouse=True)
    def initial_schedule_application(self, provider_profile):
        provider_profile.application_status = 'INCOMPLETE'
        provider_profile.save(update_fields=['application_status'])

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

    def test_provider_can_prepare_initial_hours_but_cannot_edit_approved_hours(self, api_client, setup_org, provider_profile):
        org, *_ = setup_org
        _login(api_client, 'provider@example.com')
        url = _schedule_list_url(org.id, provider_profile.id)
        res = api_client.post(
            url,
            {'day_of_week': 3, 'start_time': '10:00:00', 'end_time': '16:00:00', 'is_working_day': True},
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'SCHEDULE_APPROVAL_REQUIRED'
        assert not WeeklySchedule.objects.filter(provider=provider_profile).exists()
        provider_profile.application_status = 'INCOMPLETE'
        provider_profile.save(update_fields=['application_status'])
        provider_profile.membership.is_active = False
        provider_profile.membership.save(update_fields=['is_active'])
        res = api_client.post(url, {
            'day_of_week': 3, 'start_time': '10:00:00', 'end_time': '16:00:00', 'is_working_day': True,
        }, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        provider_profile.refresh_from_db()
        provider_profile.membership.refresh_from_db()
        assert provider_profile.weekly_schedules.get(day_of_week=3).start_time.isoformat() == '10:00:00'
        assert not provider_profile.is_operationally_active
        assert not provider_profile.membership.is_active

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


class ProviderPhaseCOnboardingTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Manager and Org
        self.manager_user = User.objects.create_user(
            email='manager@clinic.com',
            first_name='Org',
            last_name='Manager',
            password='password123',
            is_active=True
        )
        self.org, self.manager_membership = OrganizationService.create_organization(
            user=self.manager_user,
            name='Alpha Medical Center',
            slug='alpha-medical',
            address='123 Health Ave',
            phone_number='+15550100',
            email='contact@alphamedical.com'
        )
        # Set Org as APPROVED for operational testing
        self.org.verification_status = Organization.VerificationStatus.APPROVED
        self.org.save()

    def test_manager_provider_invitation_lifecycle(self):
        """Test Flow A: Manager invites provider via email, token acceptance submits initial hours for manager approval."""
        # 1. Manager creates provider invitation
        invitation = OrganizationService.create_provider_invitation(
            organization=self.org,
            email='invited.provider@clinic.com',
            actor=self.manager_user
        )
        self.assertIsNotNone(invitation.token)
        self.assertTrue(invitation.is_valid)

        # 2. Retrieve public invitation details by token
        url_details = f'/api/v1/invitations/provider/{invitation.token}/'
        response = self.client.get(url_details)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['organization_name'], 'Alpha Medical Center')
        self.assertEqual(response.data['email'], 'invited.provider@clinic.com')

        # 3. Accept invitation
        url_accept = f'/api/v1/invitations/provider/{invitation.token}/accept/'
        payload = {
          'first_name': 'Invited',
          'last_name': 'Doctor',
          'password': 'StrongPassword123!',
          'initial_schedule': [dict(day_of_week=d, start_time='09:00:00', end_time='17:00:00', is_working_day=True, breaks=[]) for d in range(7)],
        }
        resp_accept = self.client.post(url_accept, payload, format="json")
        self.assertEqual(resp_accept.status_code, status.HTTP_200_OK)

        # 4. Verify DB state
        invited_user = User.objects.get(email='invited.provider@clinic.com')
        membership = OrganizationMembership.objects.get(user=invited_user, organization=self.org)
        self.assertEqual(membership.role, OrganizationMembership.Role.PROVIDER)
        self.assertFalse(membership.is_active)

        profile = ProviderProfile.objects.get(membership=membership)
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.PENDING_REVIEW)
        self.assertFalse(profile.is_operationally_active)
        self.assertEqual(profile.weekly_schedules.count(), 7)
        ProviderBizService.approve_application(provider_profile=profile, manager_user=self.manager_user)
        profile.refresh_from_db()
        self.assertTrue(profile.is_operationally_active)

    def test_self_registered_provider_approval_and_rejection_flow(self):
        """Test Flow B: Self-registered provider starts PENDING_REVIEW/inactive, manager approves or rejects."""
        # Create user
        prov_user = User.objects.create_user(
            email='applicant@clinic.com',
            first_name='John',
            last_name='Doe',
            password='password123',
            is_active=True
        )

        # Member registers for organization
        membership = OrganizationMembership.objects.create(
            user=prov_user,
            organization=self.org,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=False
        )

        profile = ProviderProfile.objects.create(
            membership=membership,
            title='Cardiologist',
            application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
            is_active=True
        )

        # Confirm operational activation is False while pending
        self.assertFalse(profile.is_operationally_active)

        # Manager rejects application without reason -> fails
        self.client.force_authenticate(user=self.manager_user)
        review_url = f'/api/v1/organizations/{self.org.id}/providers/{profile.id}/review-application/'

        resp_reject_no_reason = self.client.post(review_url, {'action': 'REJECT', 'reason': ''})
        self.assertEqual(resp_reject_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # Manager rejects application with mandatory reason
        resp_reject = self.client.post(review_url, {'action': 'REJECT', 'reason': 'Incomplete certifications.'})
        self.assertEqual(resp_reject.status_code, status.HTTP_200_OK)

        profile.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.REJECTED)
        self.assertEqual(profile.application_rejection_reason, 'Incomplete certifications.')
        self.assertFalse(membership.is_active)
        self.assertFalse(profile.is_operationally_active)

        # Provider resubmits application -> clears rejection reason
        ProviderBizService.submit_application(provider_profile=profile, actor=prov_user)
        profile.refresh_from_db()
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.PENDING_REVIEW)
        self.assertEqual(profile.application_rejection_reason, '')

        # Initial working hours must be reviewed with the application.
        WeeklySchedule.objects.create(provider=profile, day_of_week=0, start_time=time(9), end_time=time(17))
        # Manager approves application
        resp_approve = self.client.post(review_url, {'action': 'APPROVE'})
        self.assertEqual(resp_approve.status_code, status.HTTP_200_OK)

        profile.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.APPROVED)
        self.assertTrue(membership.is_active)
        self.assertTrue(profile.is_operationally_active)


class ProviderOperationalStateTest(TestCase):
    def setUp(self):
        self.manager_user = User.objects.create_user(
            email='manager@clinic.com',
            password='Password123!'
        )
        self.provider_user = User.objects.create_user(
            email='doctor.smith@clinic.com',
            password='Password123!'
        )

        self.org = Organization.objects.create(
            name='Metro Care Clinic',
            slug='metro-care-clinic',
            verification_status=Organization.VerificationStatus.APPROVED,
            is_active=True
        )

        self.membership = OrganizationMembership.objects.create(
            user=self.provider_user,
            organization=self.org,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=True
        )

        self.provider_profile = ProviderProfile.objects.create(
            membership=self.membership,
            title='Cardiologist',
            bio='Expert in cardiovascular health',
            application_status=ProviderProfile.ApplicationStatus.APPROVED,
            is_active=True
        )

    def test_new_provider_profile_defaults_to_incomplete(self):
        """Verify new ProviderProfile instance defaults to INCOMPLETE application_status."""
        new_user = User.objects.create_user(
            email='new.doctor@clinic.com',
            password='Password123!'
        )
        new_membership = OrganizationMembership.objects.create(
            user=new_user,
            organization=self.org,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=True
        )
        new_profile = ProviderProfile.objects.create(
            membership=new_membership
        )
        self.assertEqual(
            new_profile.application_status,
            ProviderProfile.ApplicationStatus.INCOMPLETE
        )

    def test_scenario_a_all_valid_conditions_returns_true(self):
        """
        Scenario A:
        Org APPROVED + Org active + Membership active + Provider APPROVED
        -> is_operationally_active == True
        """
        self.assertTrue(self.provider_profile.is_operationally_active)

    def test_scenario_b_org_not_approved_returns_false(self):
        """
        Scenario B:
        Org NOT APPROVED + everything else valid
        -> is_operationally_active == False
        """
        self.org.verification_status = Organization.VerificationStatus.SUBMITTED
        self.org.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

    def test_scenario_c_org_inactive_returns_false(self):
        """
        Scenario C:
        Org inactive + everything else valid
        -> is_operationally_active == False
        """
        self.org.is_active = False
        self.org.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

    def test_scenario_d_membership_inactive_returns_false(self):
        """
        Scenario D:
        Membership inactive + everything else valid
        -> is_operationally_active == False
        """
        self.membership.is_active = False
        self.membership.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

    def test_scenario_e_provider_application_rejected_returns_false(self):
        """
        Scenario E:
        Provider application REJECTED + everything else valid
        -> is_operationally_active == False
        """
        self.provider_profile.application_status = ProviderProfile.ApplicationStatus.REJECTED
        self.provider_profile.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

    def test_scenario_f_provider_application_pending_review_returns_false(self):
        """
        Scenario F:
        Provider application PENDING_REVIEW + everything else valid
        -> is_operationally_active == False
        """
        self.provider_profile.application_status = ProviderProfile.ApplicationStatus.PENDING_REVIEW
        self.provider_profile.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

    def test_scenario_g_org_later_becomes_suspended_returns_false(self):
        """
        Scenario G:
        Provider application APPROVED + Org later becomes SUSPENDED
        -> is_operationally_active == False
        """
        self.assertTrue(self.provider_profile.is_operationally_active)
        self.org.verification_status = Organization.VerificationStatus.SUSPENDED
        self.org.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

    def test_scenario_h_org_becomes_approved_again_dynamic_reevaluation(self):
        """
        Scenario H:
        Org becomes APPROVED again
        -> property dynamically evaluates to True again without mutating database fields.
        """
        self.org.verification_status = Organization.VerificationStatus.SUSPENDED
        self.org.save()
        self.assertFalse(self.provider_profile.is_operationally_active)

        # Restore Org verification status
        self.org.verification_status = Organization.VerificationStatus.APPROVED
        self.org.save()

        # Proves property is computed dynamically rather than hardcoded/stored
        self.assertTrue(self.provider_profile.is_operationally_active)

    def test_provider_document_creation(self):
        """Verify ProviderDocument creation and relation to ProviderProfile."""
        dummy_file = SimpleUploadedFile(
            "medical_license.pdf",
            b"Medical License Content",
            content_type="application/pdf"
        )
        doc = ProviderDocument.objects.create(
            provider_profile=self.provider_profile,
            document_type=ProviderDocument.DocumentType.PROFESSIONAL_LICENSE,
            file=dummy_file,
            original_filename="medical_license.pdf",
            status=ProviderDocument.Status.PENDING,
            reviewed_by=self.manager_user
        )

        self.assertEqual(doc.provider_profile, self.provider_profile)
        self.assertEqual(doc.document_type, ProviderDocument.DocumentType.PROFESSIONAL_LICENSE)
        self.assertEqual(doc.status, ProviderDocument.Status.PENDING)
        self.assertEqual(doc.reviewed_by, self.manager_user)
        self.assertTrue(doc.file.name.startswith("provider_docs/"))



from apps.services.models import Category

@pytest.fixture
def setup_provider_environment(create_user):
    manager = create_user(email="manager_prof@clinic.com")
    org = Organization.objects.create(
        name="Apex Health Clinic",
        slug="apex-health-prof",
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)

    provider_user_1 = create_user(email="dr.smith_prof@clinic.com", first_name="John", last_name="Smith")
    mem_1 = OrganizationMembership.objects.create(user=provider_user_1, organization=org, role=OrganizationMembership.Role.PROVIDER)
    profile_1 = ProviderProfile.objects.create(
        membership=mem_1,
        title="Dr. John Smith, MD",
        bio="Cardiologist with 15 years experience",
        experience_years=15,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True
    )

    provider_user_2 = create_user(email="dr.jones_prof@clinic.com", first_name="Sarah", last_name="Jones")
    mem_2 = OrganizationMembership.objects.create(user=provider_user_2, organization=org, role=OrganizationMembership.Role.PROVIDER)
    profile_2 = ProviderProfile.objects.create(
        membership=mem_2,
        title="Dr. Sarah Jones",
        experience_years=8,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True
    )

    cat_cardio = Category.objects.create(organization=org, name="Cardiology", slug="cardiology-prof", icon="heart")
    svc_ecg = Service.objects.create(
        organization=org, category=cat_cardio, name="ECG Scan", duration_minutes=30, price="1500.00"
    )

    ProviderService.objects.create(provider=profile_1, service=svc_ecg)

    return org, manager, profile_1, provider_user_1, profile_2, provider_user_2, cat_cardio, svc_ecg


class TestProviderProfileAndPublicProfileAPI:

    # -----------------------------------------------------------------------
    # Provider Public Profile & Derived Categories
    # -----------------------------------------------------------------------

    def test_provider_public_profile_retrieval(self, api_client, setup_provider_environment):
        org, _, profile_1, _, _, _, cat_cardio, svc_ecg = setup_provider_environment

        url = reverse('providers:provider_public_profile', kwargs={'organization_id': org.id, 'provider_id': profile_1.id})
        res = api_client.get(url)

        assert res.status_code == status.HTTP_200_OK
        data = res.data
        assert data['provider_name'] == "John Smith"
        assert data['title'] == "Dr. John Smith, MD"
        assert data['experience_years'] == 15

        # Verify derived categories (derived from services offered)
        assert len(data['categories']) == 1
        assert data['categories'][0]['id'] == str(cat_cardio.id)
        assert data['categories'][0]['name'] == "Cardiology"

        # Verify services list
        assert len(data['services']) == 1
        assert data['services'][0]['id'] == str(svc_ecg.id)

    def test_no_provider_category_model_or_relation_exists(self, setup_provider_environment):
        """Verify architecture invariant: Provider categories are derived only, no ProviderCategory model/relation."""
        _, _, profile_1, _, _, _, _, _ = setup_provider_environment

        # Assert profile_1 has no direct category attribute/relation
        assert not hasattr(profile_1, 'categories')
        assert not hasattr(profile_1, 'provider_categories')

    # -----------------------------------------------------------------------
    # Provider Profile Updates & Structured Credentials Validation
    # -----------------------------------------------------------------------

    def test_provider_can_update_own_profile_with_nested_credentials(self, api_client, setup_provider_environment):
        org, _, profile_1, provider_user_1, _, _, _, _ = setup_provider_environment
        _login(api_client, provider_user_1.email)

        url = reverse('providers:provider_detail', kwargs={'organization_id': org.id, 'provider_id': profile_1.id})
        payload = {
            'title': 'Senior Consultant Cardiologist',
            'experience_years': 16,
            'education': [
                {'degree': 'MBBS', 'institution': 'Dhaka Medical College', 'year': '2008'},
                {'degree': 'FCPS (Cardiology)', 'institution': 'BCPS', 'year': '2014'}
            ],
            'experience_history': [
                {'role': 'Senior Registrar', 'organization': 'National Heart Foundation', 'period': '2014-2018'}
            ],
            'certifications': [
                {'name': 'Interventional Cardiology Board', 'issuer': 'ACC', 'year': '2019'}
            ],
            'specialties': ['ECG', 'Echocardiography', 'Heart Failure']
        }

        res = api_client.patch(url, payload, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['title'] == 'Senior Consultant Cardiologist'
        assert res.data['experience_years'] == 16
        assert len(res.data['education']) == 2
        assert len(res.data['specialties']) == 3

    def test_malformed_nested_credentials_rejected(self, api_client, setup_provider_environment):
        org, _, profile_1, provider_user_1, _, _, _, _ = setup_provider_environment
        _login(api_client, provider_user_1.email)

        url = reverse('providers:provider_detail', kwargs={'organization_id': org.id, 'provider_id': profile_1.id})

        # Education item missing required 'degree'
        bad_payload = {
            'education': [
                {'institution': 'Some College', 'year': '2020'}
            ]
        }
        res = api_client.patch(url, bad_payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'education' in res.data

    def test_provider_cannot_update_another_provider_profile(self, api_client, setup_provider_environment):
        org, _, profile_1, _, profile_2, provider_user_2, _, _ = setup_provider_environment

        # Provider 2 logs in and attempts to update Provider 1's profile -> 403 Forbidden
        _login(api_client, provider_user_2.email)
        url = reverse('providers:provider_detail', kwargs={'organization_id': org.id, 'provider_id': profile_1.id})
        res = api_client.patch(url, {'title': 'Hacked Title'}, format='json')
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_cross_tenant_provider_profile_access_returns_404(self, api_client, create_user, setup_provider_environment):
        org_a, _, profile_1, _, _, _, _, _ = setup_provider_environment

        # Create Org B
        org_b = Organization.objects.create(name="Org B", slug="org-b")

        url = reverse('providers:provider_public_profile', kwargs={'organization_id': org_b.id, 'provider_id': profile_1.id})
        res = api_client.get(url)
        assert res.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Schedule Change & Leave Request Workflows
# ---------------------------------------------------------------------------

from apps.providers.schedule_changes import ScheduleChangeService
from apps.providers.leave_requests import LeaveRequestService
from datetime import date, timedelta
from django.utils import timezone
from config.exceptions import ApplicationError

class TestProviderWorkflowServices(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Workflow Clinic", slug="workflow-clinic", verification_status=Organization.VerificationStatus.APPROVED)
        self.mgr_user = User.objects.create_user(email="wf_mgr@clinic.com", password="password123")
        self.prov_user = User.objects.create_user(email="wf_doc@clinic.com", password="password123")
        self.staff_user = User.objects.create_user(email="wf_staff@clinic.com", password="password123")
        OrganizationMembership.objects.create(organization=self.org, user=self.mgr_user, role=OrganizationMembership.Role.MANAGER)
        OrganizationMembership.objects.create(organization=self.org, user=self.staff_user, role=OrganizationMembership.Role.STAFF)
        prov_mem = OrganizationMembership.objects.create(organization=self.org, user=self.prov_user, role=OrganizationMembership.Role.PROVIDER)
        self.provider = ProviderProfile.objects.create(membership=prov_mem, application_status=ProviderProfile.ApplicationStatus.APPROVED, average_service_minutes=15)

    def test_leave_request_submission_and_manager_approval(self):
        start = timezone.now() + timedelta(days=5)
        end = start + timedelta(hours=4)
        leave = LeaveRequestService.submit(provider=self.provider, actor=self.prov_user, start_datetime=start, end_datetime=end, reason="Vacation")
        self.assertEqual(leave.status, 'PENDING')

        # Manager approves
        approved = LeaveRequestService.review(leave=leave, actor=self.mgr_user, decision='APPROVED')
        self.assertEqual(approved.status, 'APPROVED')

    def test_leave_request_staff_approval_rejected(self):
        start = timezone.now() + timedelta(days=5)
        end = start + timedelta(hours=4)
        leave = LeaveRequestService.submit(provider=self.provider, actor=self.prov_user, start_datetime=start, end_datetime=end)
        with self.assertRaises(ApplicationError):
            LeaveRequestService.review(leave=leave, actor=self.staff_user, decision='APPROVED')

    def test_schedule_change_submission_and_rejection(self):
        eff_date = date.today() + timedelta(days=5)
        req = ScheduleChangeService.submit(
            provider=self.provider,
            actor=self.prov_user,
            kind='SPECIFIC_DATE',
            effective_date=eff_date,
            proposed_schedule=[{'day_of_week': eff_date.weekday(), 'start_time': '10:00:00', 'end_time': '16:00:00', 'is_working_day': True}],
            reason='Adjust hours'
        )
        self.assertEqual(req.status, 'PENDING')

        rejected = ScheduleChangeService.review(request=req, actor=self.mgr_user, decision='REJECTED', reason='Staffing needs')
        self.assertEqual(rejected.status, 'REJECTED')
        self.assertEqual(rejected.decision_reason, 'Staffing needs')
