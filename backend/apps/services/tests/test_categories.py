import pytest
from django.db.models.deletion import ProtectedError
from django.db.utils import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Category, Service


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def setup_orgs(db):
    manager_a = User.objects.create_user(email="manager_a@example.com", password="Password123!")
    org_a = Organization.objects.create(name="Org A", slug="org-a", verification_status=Organization.VerificationStatus.APPROVED)
    OrganizationMembership.objects.create(user=manager_a, organization=org_a, role=OrganizationMembership.Role.MANAGER)

    manager_b = User.objects.create_user(email="manager_b@example.com", password="Password123!")
    org_b = Organization.objects.create(name="Org B", slug="org-b", verification_status=Organization.VerificationStatus.APPROVED)
    OrganizationMembership.objects.create(user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER)

    return org_a, manager_a, org_b, manager_b


def _login(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestCategoryModel:
    def test_category_model_creation_and_str(self):
        org = Organization.objects.create(name="Care Clinic", slug="care-clinic", industry_type=Organization.IndustryType.HEALTHCARE)
        cat = Category.objects.create(
            organization=org, name="Dentistry", slug="dentistry", description="Dental care services", icon="tooth"
        )
        assert cat.name == "Dentistry"
        assert str(cat) == "Dentistry (Care Clinic)"

    def test_category_unique_together_org_and_slug(self):
        org = Organization.objects.create(name="Care Clinic", slug="care-clinic-uniq")
        Category.objects.create(organization=org, name="Dentistry", slug="dentistry")
        with pytest.raises(IntegrityError):
            Category.objects.create(organization=org, name="Dentistry 2", slug="dentistry")

    def test_service_category_protected_deletion(self):
        org = Organization.objects.create(name="Legal Associates", slug="legal-associates")
        cat = Category.objects.create(organization=org, name="Corporate Law", slug="corporate-law")
        Service.objects.create(
            organization=org, category=cat, name="Company Registration", duration_minutes=60, price="5000.00"
        )
        with pytest.raises(ProtectedError):
            cat.delete()


@pytest.mark.django_db
class TestCategoryAPI:
    def _cat_list_url(self, org_id):
        return reverse('categories:category_list_create', kwargs={'organization_id': org_id})

    def _cat_detail_url(self, org_id, cat_id):
        return reverse('categories:category_detail', kwargs={'organization_id': org_id, 'category_id': cat_id})

    def _svc_list_url(self, org_id):
        return reverse('services:service_list_create', kwargs={'organization_id': org_id})

    def test_manager_can_crud_category(self, api_client, setup_orgs):
        org_a, manager_a, _, _ = setup_orgs
        _login(api_client, manager_a)

        # Create
        res = api_client.post(self._cat_list_url(org_a.id), {'name': 'General Health', 'description': 'General care'}, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        cat_id = res.data['id']
        assert res.data['slug'] == 'general-health'

        # List
        res_list = api_client.get(self._cat_list_url(org_a.id))
        assert res_list.status_code == status.HTTP_200_OK
        assert len(res_list.data) == 1

        # Update
        res_patch = api_client.patch(self._cat_detail_url(org_a.id, cat_id), {'name': 'General & Family Medicine'}, format='json')
        assert res_patch.status_code == status.HTTP_200_OK
        assert res_patch.data['name'] == 'General & Family Medicine'

        # Delete
        res_del = api_client.delete(self._cat_detail_url(org_a.id, cat_id))
        assert res_del.status_code == status.HTTP_204_NO_CONTENT
        assert not Category.objects.filter(id=cat_id).exists()

    def test_category_slug_uniqueness_per_organization(self, api_client, setup_orgs):
        org_a, manager_a, org_b, manager_b = setup_orgs
        Category.objects.create(organization=org_a, name='Dermatology', slug='dermatology')

        # Org A duplicate slug -> 400
        _login(api_client, manager_a)
        res = api_client.post(self._cat_list_url(org_a.id), {'name': 'Dermatology Care', 'slug': 'dermatology'}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

        # Org B same slug -> 201 (scoped to org)
        _login(api_client, manager_b)
        res_b = api_client.post(self._cat_list_url(org_b.id), {'name': 'Dermatology', 'slug': 'dermatology'}, format='json')
        assert res_b.status_code == status.HTTP_201_CREATED

    def test_manager_tenant_isolation_cross_organization(self, api_client, setup_orgs):
        org_a, _, org_b, manager_b = setup_orgs
        cat_a = Category.objects.create(organization=org_a, name='Cat A', slug='cat-a')

        _login(api_client, manager_b)
        assert api_client.patch(self._cat_detail_url(org_b.id, cat_a.id), {'name': 'Hacked'}, format='json').status_code == 404
        assert api_client.patch(self._cat_detail_url(org_a.id, cat_a.id), {'name': 'Hacked'}, format='json').status_code == 403

    def test_active_new_service_requires_category(self, api_client, setup_orgs):
        org_a, manager_a, _, _ = setup_orgs
        _login(api_client, manager_a)
        payload = {'name': 'Uncategorized Service', 'duration_minutes': 30, 'price': '100.00', 'is_active': True}
        res = api_client.post(self._svc_list_url(org_a.id), payload, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'category_id' in res.data

    def test_cannot_delete_category_with_linked_services(self, api_client, setup_orgs):
        org_a, manager_a, _, _ = setup_orgs
        cat_a = Category.objects.create(organization=org_a, name='Surgery', slug='surgery')
        Service.objects.create(organization=org_a, category=cat_a, name='Appendectomy', duration_minutes=120, price='15000.00')

        _login(api_client, manager_a)
        res = api_client.delete(self._cat_detail_url(org_a.id, cat_a.id))
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "Cannot delete category that has linked services" in res.data['detail']
