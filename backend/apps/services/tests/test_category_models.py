import pytest
from django.db.models.deletion import ProtectedError
from django.db.utils import IntegrityError
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Category, Service
from apps.accounts.models import User


@pytest.mark.django_db
class TestPhase1DatabaseModels:
    def test_organization_industry_type_explicit(self):
        org = Organization.objects.create(
            name="Dhaka Dental Clinic",
            slug="dhaka-dental-clinic",
            industry_type=Organization.IndustryType.HEALTHCARE
        )
        assert org.industry_type == "HEALTHCARE"
        assert org.logo == ""
        assert org.cover_image == ""

    def test_category_model_creation(self):
        org = Organization.objects.create(name="Care Clinic", slug="care-clinic", industry_type=Organization.IndustryType.HEALTHCARE)
        cat1 = Category.objects.create(
            organization=org,
            name="Dentistry",
            slug="dentistry",
            description="Dental care services",
            icon="tooth"
        )
        assert cat1.name == "Dentistry"
        assert str(cat1) == "Dentistry (Care Clinic)"

        # Unique constraint per organization
        with pytest.raises(IntegrityError):
            Category.objects.create(organization=org, name="Dentistry", slug="dentistry")

    def test_service_category_protected_deletion(self):
        org = Organization.objects.create(name="Legal Associates", slug="legal-associates", industry_type=Organization.IndustryType.LEGAL)
        cat = Category.objects.create(organization=org, name="Corporate Law", slug="corporate-law")
        svc = Service.objects.create(
            organization=org,
            category=cat,
            name="Company Registration",
            duration_minutes=60,
            price="5000.00"
        )
        assert svc.category == cat

        # Attempting to delete category with linked service must raise ProtectedError
        with pytest.raises(ProtectedError):
            cat.delete()

    def test_provider_profile_json_credentials_fields(self):
        user = User.objects.create_user(email="doctor@example.com", password="Password123!")
        org = Organization.objects.create(name="City Hospital", slug="city-hospital", industry_type=Organization.IndustryType.HEALTHCARE)
        membership = OrganizationMembership.objects.create(
            user=user, organization=org, role=OrganizationMembership.Role.PROVIDER
        )
        profile = ProviderProfile.objects.create(
            membership=membership,
            title="Dr. Rahman",
            experience_years=10,
            education=[{"degree": "MBBS", "institution": "DMC", "year": "2012"}],
            experience_history=[{"role": "Consultant", "organization": "Square Hospital", "period": "2015-2020"}],
            certifications=[{"title": "FCPS", "issuer": "BCPS", "year": "2017"}],
            specialties=["Cardiology", "ECG"]
        )
        profile.refresh_from_db()
        assert profile.experience_years == 10
        assert len(profile.education) == 1
        assert profile.education[0]["degree"] == "MBBS"
        assert len(profile.specialties) == 2
        assert "Cardiology" in profile.specialties
