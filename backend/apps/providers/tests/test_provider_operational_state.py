from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import ValidationError

from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderDocument

User = get_user_model()


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
