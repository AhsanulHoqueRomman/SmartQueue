import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email, password="Password123!", **kwargs):
        return User.objects.create_user(email=email, password=password, **kwargs)
    return make_user


@pytest.fixture
def auth_client(api_client, create_user):
    user = create_user(email="user@example.com")
    login_res = api_client.post(reverse('accounts:login'), {'email': 'user@example.com', 'password': 'Password123!'}, format='json')
    token = login_res.data['access']
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    api_client.user = user
    return api_client


@pytest.mark.django_db
class TestOrganizationBootstrapAndDiscovery:
    def test_unauthenticated_user_cannot_create_organization(self, api_client):
        url = reverse('organizations:organization_list_create')
        payload = {'name': 'Clinic A', 'slug': 'clinic-a'}
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_user_can_bootstrap_organization(self, auth_client):
        url = reverse('organizations:organization_list_create')
        payload = {
            'name': 'SmartCare Clinic',
            'slug': 'smartcare-clinic',
            'address': 'Dhaka',
            'phone_number': '01700000000',
            'email': 'contact@smartcare.com'
        }
        response = auth_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'SmartCare Clinic'
        assert response.data['slug'] == 'smartcare-clinic'
        assert response.data['membership']['role'] == 'MANAGER'
        assert response.data['membership']['is_active'] is True

        # Verify DB records created atomically
        org = Organization.objects.get(slug='smartcare-clinic')
        membership = OrganizationMembership.objects.get(organization=org, user=auth_client.user)
        assert membership.role == OrganizationMembership.Role.MANAGER

    def test_active_organizations_discovery(self, auth_client):
        org1 = Organization.objects.create(
            name='Active Org', slug='active-org', is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED
        )
        org2 = Organization.objects.create(name='Inactive Org', slug='inactive-org', is_active=False)

        url = reverse('organizations:organization_list_create')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        slugs = [item['slug'] for item in response.data]
        assert 'active-org' in slugs
        assert 'inactive-org' not in slugs

    def test_organization_detail_retrieval(self, auth_client):
        org = Organization.objects.create(
            name='Public Org', slug='public-org', is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED
        )
        url = reverse('organizations:organization_detail', kwargs={'organization_id': org.id})
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Public Org'

    def test_manager_can_patch_organization(self, api_client, create_user):
        manager = create_user(email="orgmanager@example.com")
        org = Organization.objects.create(name='Original Org', slug='original-org', is_active=True)
        OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)

        login_res = api_client.post(reverse('accounts:login'), {'email': 'orgmanager@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        url = reverse('organizations:organization_detail', kwargs={'organization_id': org.id})
        payload = {'name': 'Updated Org Name', 'phone_number': '+8801999999999'}
        res = api_client.patch(url, payload, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['name'] == 'Updated Org Name'
        assert res.data['phone_number'] == '+8801999999999'


@pytest.mark.django_db
class TestOrganizationMemberManagement:
    def test_manager_can_list_add_and_update_members(self, api_client, create_user):
        manager = create_user(email="manager@example.com")
        staff = create_user(email="staff@example.com")
        provider = create_user(email="provider@example.com")

        org = Organization.objects.create(name='Clinic A', slug='clinic-a')
        OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)

        # Authenticate as Manager
        login_res = api_client.post(reverse('accounts:login'), {'email': 'manager@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        # 1. Add STAFF
        add_url = reverse('organizations:member_list_add', kwargs={'organization_id': org.id})
        res_staff = api_client.post(add_url, {'user_id': staff.id, 'role': 'STAFF'}, format='json')
        assert res_staff.status_code == status.HTTP_201_CREATED
        assert res_staff.data['role'] == 'STAFF'

        # 2. Add PROVIDER
        res_prov = api_client.post(add_url, {'user_id': provider.id, 'role': 'PROVIDER'}, format='json')
        assert res_prov.status_code == status.HTTP_201_CREATED
        assert res_prov.data['role'] == 'PROVIDER'

        # 3. List Members
        res_list = api_client.get(add_url)
        assert res_list.status_code == status.HTTP_200_OK
        assert len(res_list.data) == 3

        # 4. Update member role (change STAFF to PROVIDER)
        staff_mem = OrganizationMembership.objects.get(user=staff, organization=org)
        update_url = reverse('organizations:member_detail_update', kwargs={'organization_id': org.id, 'membership_id': staff_mem.id})
        res_update = api_client.patch(update_url, {'role': 'PROVIDER'}, format='json')
        assert res_update.status_code == status.HTTP_200_OK
        assert res_update.data['role'] == 'PROVIDER'

        # 5. Deactivate member
        res_deact = api_client.patch(update_url, {'is_active': False}, format='json')
        assert res_deact.status_code == status.HTTP_200_OK
        assert res_deact.data['is_active'] is False

    def test_duplicate_member_addition_rejected(self, api_client, create_user):
        manager = create_user(email="manager@example.com")
        staff = create_user(email="staff@example.com")
        org = Organization.objects.create(name='Clinic A', slug='clinic-a')
        OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)
        OrganizationMembership.objects.create(user=staff, organization=org, role=OrganizationMembership.Role.STAFF)

        login_res = api_client.post(reverse('accounts:login'), {'email': 'manager@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        add_url = reverse('organizations:member_list_add', kwargs={'organization_id': org.id})
        res_dup = api_client.post(add_url, {'user_id': staff.id, 'role': 'PROVIDER'}, format='json')
        assert res_dup.status_code == status.HTTP_409_CONFLICT
        assert res_dup.data['error']['code'] == 'DUPLICATE_MEMBERSHIP'

    def test_staff_and_provider_cannot_manage_members(self, api_client, create_user):
        manager = create_user(email="manager@example.com")
        staff = create_user(email="staff@example.com")
        new_user = create_user(email="newuser@example.com")
        org = Organization.objects.create(name='Clinic A', slug='clinic-a')
        OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)
        OrganizationMembership.objects.create(user=staff, organization=org, role=OrganizationMembership.Role.STAFF)

        # Authenticate as Staff
        login_res = api_client.post(reverse('accounts:login'), {'email': 'staff@example.com', 'password': 'Password123!'}, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

        add_url = reverse('organizations:member_list_add', kwargs={'organization_id': org.id})
        
        # Staff list members -> 403 Forbidden
        res_list = api_client.get(add_url)
        assert res_list.status_code == status.HTTP_403_FORBIDDEN

        # Staff add member -> 403 Forbidden
        res_add = api_client.post(add_url, {'user_id': new_user.id, 'role': 'STAFF'}, format='json')
        assert res_add.status_code == status.HTTP_403_FORBIDDEN
