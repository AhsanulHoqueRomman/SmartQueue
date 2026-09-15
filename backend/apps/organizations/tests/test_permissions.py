import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.organizations.models import Organization, OrganizationMembership

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email, password="Password123!", **kwargs):
        return User.objects.create_user(email=email, password=password, **kwargs)
    return make_user


@pytest.mark.django_db
class TestTenantIsolationAndSecurity:
    def test_manager_of_org_a_cannot_access_or_modify_org_b_members(self, api_client, create_user):
        manager_a = create_user(email="manager_a@example.com")
        manager_b = create_user(email="manager_b@example.com")
        staff_b = create_user(email="staff_b@example.com")

        org_a = Organization.objects.create(name='Org A', slug='org-a')
        org_b = Organization.objects.create(name='Org B', slug='org-b')

        OrganizationMembership.objects.create(user=manager_a, organization=org_a, role=OrganizationMembership.Role.MANAGER)
        OrganizationMembership.objects.create(user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER)
        mem_b_staff = OrganizationMembership.objects.create(user=staff_b, organization=org_b, role=OrganizationMembership.Role.STAFF)

        # Authenticate as Manager A
        login_res = api_client.post(reverse('accounts:login'), {'email': 'manager_a@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        # 1. Manager A listing Org B members -> 403 Forbidden
        list_url = reverse('organizations:member_list_add', kwargs={'organization_id': org_b.id})
        res_list = api_client.get(list_url)
        assert res_list.status_code == status.HTTP_403_FORBIDDEN

        # 2. Manager A modifying Org B staff member -> 403 Forbidden or 404
        update_url = reverse('organizations:member_detail_update', kwargs={'organization_id': org_b.id, 'membership_id': mem_b_staff.id})
        res_patch = api_client.patch(update_url, {'role': 'PROVIDER'}, format='json')
        assert res_patch.status_code == status.HTTP_403_FORBIDDEN

        # 3. Manager A passing Org A ID in URL but trying to update Org B membership -> 404 Not Found (safe tenant isolation)
        mismatch_url = reverse('organizations:member_detail_update', kwargs={'organization_id': org_a.id, 'membership_id': mem_b_staff.id})
        res_mismatch = api_client.patch(mismatch_url, {'role': 'PROVIDER'}, format='json')
        assert res_mismatch.status_code == status.HTTP_404_NOT_FOUND

    def test_role_escalation_prevented(self, api_client, create_user):
        manager = create_user(email="manager@example.com")
        user = create_user(email="user@example.com")
        org = Organization.objects.create(name='Org A', slug='org-a')
        OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)

        login_res = api_client.post(reverse('accounts:login'), {'email': 'manager@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        add_url = reverse('organizations:member_list_add', kwargs={'organization_id': org.id})
        res_esc = api_client.post(add_url, {'user_id': user.id, 'role': 'MANAGER'}, format='json')
        assert res_esc.status_code == status.HTTP_400_BAD_REQUEST
        assert 'role' in res_esc.data


@pytest.mark.django_db
class TestLastManagerProtection:
    def test_deactivating_sole_active_manager_rejected_409(self, api_client, create_user):
        manager = create_user(email="manager@example.com")
        org = Organization.objects.create(name='Org A', slug='org-a')
        mem = OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)

        login_res = api_client.post(reverse('accounts:login'), {'email': 'manager@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        update_url = reverse('organizations:member_detail_update', kwargs={'organization_id': org.id, 'membership_id': mem.id})
        
        # Attempt to deactivate sole manager -> 409 Conflict
        res_deact = api_client.patch(update_url, {'is_active': False}, format='json')
        assert res_deact.status_code == status.HTTP_409_CONFLICT
        assert res_deact.data['error']['code'] == 'LAST_MANAGER_PROTECTION'

        # Attempt to demote sole manager to STAFF -> 409 Conflict
        res_demote = api_client.patch(update_url, {'role': 'STAFF'}, format='json')
        assert res_demote.status_code == status.HTTP_409_CONFLICT
        assert res_demote.data['error']['code'] == 'LAST_MANAGER_PROTECTION'

    def test_deactivating_one_of_multiple_managers_succeeds(self, api_client, create_user):
        manager1 = create_user(email="manager1@example.com")
        manager2 = create_user(email="manager2@example.com")
        org = Organization.objects.create(name='Org A', slug='org-a')
        mem1 = OrganizationMembership.objects.create(user=manager1, organization=org, role=OrganizationMembership.Role.MANAGER)
        mem2 = OrganizationMembership.objects.create(user=manager2, organization=org, role=OrganizationMembership.Role.MANAGER)

        login_res = api_client.post(reverse('accounts:login'), {'email': 'manager1@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        update_url = reverse('organizations:member_detail_update', kwargs={'organization_id': org.id, 'membership_id': mem2.id})
        res_deact = api_client.patch(update_url, {'is_active': False}, format='json')
        assert res_deact.status_code == status.HTTP_200_OK
        assert res_deact.data['is_active'] is False


@pytest.mark.django_db
class TestSystemAdminAccess:
    def test_system_admin_can_access_organization_management(self, api_client, create_user):
        admin = create_user(email="admin@example.com", is_staff=True, is_superuser=True)
        staff = create_user(email="staff@example.com")
        org = Organization.objects.create(name='Org A', slug='org-a')

        login_res = api_client.post(reverse('accounts:login'), {'email': 'admin@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        # Admin lists members
        add_url = reverse('organizations:member_list_add', kwargs={'organization_id': org.id})
        res_list = api_client.get(add_url)
        assert res_list.status_code == status.HTTP_200_OK

        # Admin adds staff member
        res_add = api_client.post(add_url, {'user_id': staff.id, 'role': 'STAFF'}, format='json')
        assert res_add.status_code == status.HTTP_201_CREATED
