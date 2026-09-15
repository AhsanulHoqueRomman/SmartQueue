import uuid
import pytest
from django.db.utils import IntegrityError
from django.contrib.auth import get_user_model
from apps.organizations.models import Organization, OrganizationMembership

User = get_user_model()


@pytest.mark.django_db
class TestOrganizationModels:
    def test_organization_creation(self):
        org = Organization.objects.create(
            name="SmartCare Clinic",
            slug="smartcare-clinic",
            address="Dhaka",
            phone_number="01700000000",
            email="info@smartcare.com"
        )
        assert isinstance(org.id, uuid.UUID)
        assert org.name == "SmartCare Clinic"
        assert org.slug == "smartcare-clinic"
        assert org.is_active is True
        assert org.created_at is not None
        assert org.updated_at is not None
        assert str(org) == "SmartCare Clinic"

    def test_unique_slug_constraint(self):
        Organization.objects.create(name="Clinic A", slug="clinic-a")
        with pytest.raises(IntegrityError):
            Organization.objects.create(name="Clinic B", slug="clinic-a")

    def test_membership_creation(self):
        user = User.objects.create_user(email="member@example.com", password="Password123!")
        org = Organization.objects.create(name="Clinic A", slug="clinic-a")
        
        membership = OrganizationMembership.objects.create(
            user=user,
            organization=org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )
        assert membership.user == user
        assert membership.organization == org
        assert membership.role == OrganizationMembership.Role.MANAGER
        assert membership.is_active is True
        assert "member@example.com" in str(membership)

    def test_unique_user_organization_membership(self):
        user = User.objects.create_user(email="unique@example.com", password="Password123!")
        org = Organization.objects.create(name="Clinic A", slug="clinic-a")
        
        OrganizationMembership.objects.create(
            user=user,
            organization=org,
            role=OrganizationMembership.Role.STAFF
        )
        
        with pytest.raises(IntegrityError):
            OrganizationMembership.objects.create(
                user=user,
                organization=org,
                role=OrganizationMembership.Role.PROVIDER
            )

    def test_user_can_belong_to_multiple_organizations_with_different_roles(self):
        user = User.objects.create_user(email="multi@example.com", password="Password123!")
        org_a = Organization.objects.create(name="Clinic A", slug="clinic-a")
        org_b = Organization.objects.create(name="Clinic B", slug="clinic-b")
        
        mem_a = OrganizationMembership.objects.create(
            user=user,
            organization=org_a,
            role=OrganizationMembership.Role.STAFF
        )
        mem_b = OrganizationMembership.objects.create(
            user=user,
            organization=org_b,
            role=OrganizationMembership.Role.PROVIDER
        )
        
        assert mem_a.role == OrganizationMembership.Role.STAFF
        assert mem_b.role == OrganizationMembership.Role.PROVIDER
        assert user.memberships.count() == 2
