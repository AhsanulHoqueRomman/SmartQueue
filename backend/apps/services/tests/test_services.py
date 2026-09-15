import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Service

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


def _login(api_client, email, password="Password123!"):
    res = api_client.post(reverse('accounts:login'), {'email': email, 'password': password}, format='json')
    token = res.data['access']
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return api_client


@pytest.fixture
def org_with_manager(create_user):
    manager = create_user(email='manager@example.com')
    org = Organization.objects.create(name='Test Clinic', slug='test-clinic')
    OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)
    return org, manager


@pytest.fixture
def manager_client(api_client, org_with_manager):
    org, manager = org_with_manager
    _login(api_client, 'manager@example.com')
    api_client.org = org
    api_client.manager = manager
    return api_client


# ---------------------------------------------------------------------------
# Service CRUD Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestServiceCRUD:
    def _list_url(self, org_id):
        return reverse('services:service_list_create', kwargs={'organization_id': org_id})

    def _detail_url(self, org_id, service_id):
        return reverse('services:service_detail', kwargs={'organization_id': org_id, 'service_id': service_id})

    def test_manager_can_create_service(self, manager_client):
        org = manager_client.org
        url = self._list_url(org.id)
        payload = {
            'name': 'Haircut',
            'description': 'Basic haircut service',
            'duration_minutes': 30,
            'price': '15.00',
            'is_active': True,
        }
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['name'] == 'Haircut'
        assert res.data['duration_minutes'] == 30
        assert Service.objects.filter(name='Haircut', organization=org).exists()

    def test_manager_can_list_services(self, manager_client):
        org = manager_client.org
        Service.objects.create(organization=org, name='Consult', duration_minutes=15, price='0.00')
        res = manager_client.get(self._list_url(org.id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) >= 1

    def test_manager_can_update_service(self, manager_client):
        org = manager_client.org
        svc = Service.objects.create(organization=org, name='Old Name', duration_minutes=20, price='10.00')
        url = self._detail_url(org.id, svc.id)
        res = manager_client.patch(url, {'name': 'New Name', 'price': '12.50'}, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['name'] == 'New Name'
        svc.refresh_from_db()
        assert str(svc.price) == '12.50'

    def test_manager_can_delete_service(self, manager_client):
        org = manager_client.org
        svc = Service.objects.create(organization=org, name='Delete Me', duration_minutes=10, price='5.00')
        url = self._detail_url(org.id, svc.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not Service.objects.filter(id=svc.id).exists()

    def test_zero_duration_rejected(self, manager_client):
        org = manager_client.org
        url = self._list_url(org.id)
        payload = {'name': 'Bad Service', 'duration_minutes': 0, 'price': '0.00'}
        res = manager_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_user_cannot_create_service(self, api_client, org_with_manager):
        org, _ = org_with_manager
        url = self._list_url(org.id)
        res = api_client.post(url, {'name': 'X', 'duration_minutes': 10, 'price': '0.00'}, format='json')
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_manager_cannot_create_service(self, api_client, create_user, org_with_manager):
        org, _ = org_with_manager
        staff = create_user(email='staff@example.com')
        OrganizationMembership.objects.create(user=staff, organization=org, role=OrganizationMembership.Role.STAFF)
        _login(api_client, 'staff@example.com')
        url = self._list_url(org.id)
        res = api_client.post(url, {'name': 'X', 'duration_minutes': 10, 'price': '0.00'}, format='json')
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_service_tenant_isolation(self, api_client, create_user, org_with_manager):
        """
        A service belonging to org A cannot be accessed via org B's URL.
        """
        org_a, _ = org_with_manager
        manager_b = create_user(email='manager_b@example.com')
        org_b = Organization.objects.create(name='Org B', slug='org-b')
        OrganizationMembership.objects.create(user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER)
        _login(api_client, 'manager_b@example.com')

        # Service belongs to org_a
        svc = Service.objects.create(organization=org_a, name='OrgA Service', duration_minutes=20, price='0.00')
        url = reverse('services:service_detail', kwargs={'organization_id': org_b.id, 'service_id': svc.id})
        res = api_client.get(url)
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_any_authenticated_user_can_list_services(self, api_client, create_user, org_with_manager):
        """Customers (no membership) can discover active services."""
        org, _ = org_with_manager
        Service.objects.create(organization=org, name='Public Svc', duration_minutes=30, price='0.00')
        customer = create_user(email='customer@example.com')
        _login(api_client, 'customer@example.com')
        url = self._list_url(org.id)
        res = api_client.get(url)
        assert res.status_code == status.HTTP_200_OK

    def test_duplicate_service_name_rejected(self, manager_client):
        org = manager_client.org
        Service.objects.create(organization=org, name='Haircut', duration_minutes=30, price='10.00')
        url = self._list_url(org.id)
        res = manager_client.post(
            url,
            {'name': 'Haircut', 'duration_minutes': 20, 'price': '5.00'},
            format='json',
        )
        assert res.status_code == status.HTTP_409_CONFLICT
        assert res.data['error']['code'] == 'DUPLICATE_SERVICE_NAME'

    def test_negative_price_rejected(self, manager_client):
        org = manager_client.org
        url = self._list_url(org.id)
        res = manager_client.post(
            url,
            {'name': 'Bad Price', 'duration_minutes': 20, 'price': '-1.00'},
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_customer_sees_only_active_services(self, api_client, create_user, org_with_manager):
        org, _ = org_with_manager
        Service.objects.create(organization=org, name='Active', duration_minutes=10, price='0.00', is_active=True)
        Service.objects.create(organization=org, name='Inactive', duration_minutes=10, price='0.00', is_active=False)
        create_user(email='customer2@example.com')
        _login(api_client, 'customer2@example.com')
        res = api_client.get(self._list_url(org.id))
        assert res.status_code == status.HTTP_200_OK
        names = {row['name'] for row in res.data}
        assert names == {'Active'}
