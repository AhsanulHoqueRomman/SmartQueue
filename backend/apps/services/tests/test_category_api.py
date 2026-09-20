import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Category, Service


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
def setup_orgs(create_user):
    manager_a = create_user(email="manager_a@example.com")
    org_a = Organization.objects.create(name="Org A", slug="org-a", verification_status=Organization.VerificationStatus.APPROVED)
    OrganizationMembership.objects.create(user=manager_a, organization=org_a, role=OrganizationMembership.Role.MANAGER)

    manager_b = create_user(email="manager_b@example.com")
    org_b = Organization.objects.create(name="Org B", slug="org-b", verification_status=Organization.VerificationStatus.APPROVED)
    OrganizationMembership.objects.create(user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER)

    return org_a, manager_a, org_b, manager_b


@pytest.mark.django_db
class TestCategoryAndServiceIntegration:
    def _cat_list_url(self, org_id):
        return reverse('categories:category_list_create', kwargs={'organization_id': org_id})

    def _cat_detail_url(self, org_id, cat_id):
        return reverse('categories:category_detail', kwargs={'organization_id': org_id, 'category_id': cat_id})

    def _svc_list_url(self, org_id):
        return reverse('services:service_list_create', kwargs={'organization_id': org_id})

    # -----------------------------------------------------------------------
    # Category CRUD & Tenant Isolation
    # -----------------------------------------------------------------------

    def test_manager_can_crud_category(self, api_client, setup_orgs):
        org_a, manager_a, _, _ = setup_orgs
        _login(api_client, manager_a.email)

        # 1. Create
        res = api_client.post(self._cat_list_url(org_a.id), {'name': 'General Health', 'description': 'General care'}, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        cat_id = res.data['id']
        assert res.data['name'] == 'General Health'
        assert res.data['slug'] == 'general-health'

        # 2. List
        res_list = api_client.get(self._cat_list_url(org_a.id))
        assert res_list.status_code == status.HTTP_200_OK
        assert len(res_list.data) == 1

        # 3. Update
        res_patch = api_client.patch(self._cat_detail_url(org_a.id, cat_id), {'name': 'General & Family Medicine'}, format='json')
        assert res_patch.status_code == status.HTTP_200_OK
        assert res_patch.data['name'] == 'General & Family Medicine'

        # 4. Delete
        res_del = api_client.delete(self._cat_detail_url(org_a.id, cat_id))
        assert res_del.status_code == status.HTTP_204_NO_CONTENT
        assert not Category.objects.filter(id=cat_id).exists()

    def test_category_slug_uniqueness_per_organization(self, api_client, setup_orgs):
        org_a, manager_a, org_b, manager_b = setup_orgs

        # Org A creates 'dermatology'
        Category.objects.create(organization=org_a, name='Dermatology', slug='dermatology')

        # Org A creating duplicate slug raises 400
        _login(api_client, manager_a.email)
        res = api_client.post(self._cat_list_url(org_a.id), {'name': 'Dermatology Care', 'slug': 'dermatology'}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'slug' in res.data

        # Org B creating same slug 'dermatology' succeeds (org-scoped uniqueness)
        _login(api_client, manager_b.email)
        res_b = api_client.post(self._cat_list_url(org_b.id), {'name': 'Dermatology', 'slug': 'dermatology'}, format='json')
        assert res_b.status_code == status.HTTP_201_CREATED

    def test_manager_tenant_isolation_cross_organization_category_rejection(self, api_client, setup_orgs):
        org_a, _, org_b, manager_b = setup_orgs
        cat_a = Category.objects.create(organization=org_a, name='Cat A', slug='cat-a')

        # Manager B attempts to modify Org A's category via Org B's endpoint -> 404
        _login(api_client, manager_b.email)
        res = api_client.patch(self._cat_detail_url(org_b.id, cat_a.id), {'name': 'Hacked Cat'}, format='json')
        assert res.status_code == status.HTTP_404_NOT_FOUND

        # Manager B attempts to modify Org A's category via Org A's endpoint -> 403
        res_a = api_client.patch(self._cat_detail_url(org_a.id, cat_a.id), {'name': 'Hacked Cat'}, format='json')
        assert res_a.status_code == status.HTTP_403_FORBIDDEN

    # -----------------------------------------------------------------------
    # Service Category Validation Rules
    # -----------------------------------------------------------------------

    def test_active_new_service_requires_category(self, api_client, setup_orgs):
        org_a, manager_a, _, _ = setup_orgs
        _login(api_client, manager_a.email)

        # Attempting to create active new service without category_id -> 400
        payload = {
            'name': 'Uncategorized Active Service',
            'duration_minutes': 30,
            'price': '100.00',
            'is_active': True,
        }
        res = api_client.post(self._svc_list_url(org_a.id), payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'category_id' in res.data

    def test_service_category_organization_mismatch_rejected(self, api_client, setup_orgs):
        org_a, manager_a, org_b, _ = setup_orgs
        cat_b = Category.objects.create(organization=org_b, name='Org B Category', slug='org-b-cat')

        _login(api_client, manager_a.email)

        # Manager A tries to create service in Org A using Org B's category ID -> 400
        payload = {
            'name': 'Cross Org Service',
            'category_id': str(cat_b.id),
            'duration_minutes': 30,
            'price': '50.00',
            'is_active': True,
        }
        res = api_client.post(self._svc_list_url(org_a.id), payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'category_id' in res.data

    def test_legacy_uncategorized_services_remain_readable(self, api_client, setup_orgs):
        org_a, _, _, _ = setup_orgs
        # Legacy service created in DB with category=NULL
        legacy_svc = Service.objects.create(
            organization=org_a,
            category=None,
            name='Legacy Consultation',
            duration_minutes=20,
            price='0.00',
            is_active=True
        )

        res = api_client.get(reverse('services:service_detail', kwargs={'organization_id': org_a.id, 'service_id': legacy_svc.id}))
        assert res.status_code == status.HTTP_200_OK
        assert res.data['name'] == 'Legacy Consultation'
        assert res.data['category'] is None

    def test_cannot_delete_category_with_linked_services(self, api_client, setup_orgs):
        org_a, manager_a, _, _ = setup_orgs
        cat_a = Category.objects.create(organization=org_a, name='Surgery', slug='surgery')
        Service.objects.create(
            organization=org_a,
            category=cat_a,
            name='Appendectomy',
            duration_minutes=120,
            price='15000.00'
        )

        _login(api_client, manager_a.email)
        res = api_client.delete(self._cat_detail_url(org_a.id, cat_a.id))
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "Cannot delete category that has linked services" in res.data['detail']
