import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService
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
def setup_provider_environment(create_user):
    manager = create_user(email="manager@clinic.com")
    org = Organization.objects.create(
        name="Apex Health Clinic",
        slug="apex-health",
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role=OrganizationMembership.Role.MANAGER)

    provider_user_1 = create_user(email="dr.smith@clinic.com", first_name="John", last_name="Smith")
    mem_1 = OrganizationMembership.objects.create(user=provider_user_1, organization=org, role=OrganizationMembership.Role.PROVIDER)
    profile_1 = ProviderProfile.objects.create(
        membership=mem_1,
        title="Dr. John Smith, MD",
        bio="Cardiologist with 15 years experience",
        experience_years=15,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True
    )

    provider_user_2 = create_user(email="dr.jones@clinic.com", first_name="Sarah", last_name="Jones")
    mem_2 = OrganizationMembership.objects.create(user=provider_user_2, organization=org, role=OrganizationMembership.Role.PROVIDER)
    profile_2 = ProviderProfile.objects.create(
        membership=mem_2,
        title="Dr. Sarah Jones",
        experience_years=8,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True
    )

    cat_cardio = Category.objects.create(organization=org, name="Cardiology", slug="cardiology", icon="heart")
    svc_ecg = Service.objects.create(
        organization=org, category=cat_cardio, name="ECG Scan", duration_minutes=30, price="1500.00"
    )

    ProviderService.objects.create(provider=profile_1, service=svc_ecg)

    return org, manager, profile_1, provider_user_1, profile_2, provider_user_2, cat_cardio, svc_ecg


@pytest.mark.django_db
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
