from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from config.exceptions import ApplicationError
from apps.organizations.models import Organization, OrganizationDocument, OrganizationMembership
from apps.organizations.services import OrganizationService

User = get_user_model()


class OrganizationVerificationWorkflowTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='admin@smartqueue.com',
            password='Password123!',
            first_name='Admin',
            last_name='User'
        )
        self.manager_user = User.objects.create_user(
            email='manager@aesthetic.com',
            password='Password123!',
            first_name='Manager',
            last_name='User'
        )
        self.other_manager = User.objects.create_user(
            email='other@clinic.com',
            password='Password123!',
            first_name='Other',
            last_name='Manager'
        )
        self.org = Organization.objects.create(
            name='Dhanmondi Aesthetic & Spa',
            slug='dhanmondi-aesthetic-spa',
            email='contact@dhanmondiaesthetic.com',
            phone_number='+8801700000000',
            address='House 12, Road 5, Dhanmondi, Dhaka',
            verification_status=Organization.VerificationStatus.SETUP_INCOMPLETE
        )
        self.org_membership = OrganizationMembership.objects.create(
            user=self.manager_user,
            organization=self.org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )

        self.other_org = Organization.objects.create(
            name='Other Clinic',
            slug='other-clinic',
            email='info@otherclinic.com',
            phone_number='+8801800000000',
            address='Gulshan, Dhaka',
            verification_status=Organization.VerificationStatus.SETUP_INCOMPLETE
        )
        self.other_membership = OrganizationMembership.objects.create(
            user=self.other_manager,
            organization=self.other_org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )

        self.sample_doc = SimpleUploadedFile(
            "license.pdf",
            b"PDF content for trade license",
            content_type="application/pdf"
        )

    # ----------------------------------------------------
    # Service Level Unit Tests
    # ----------------------------------------------------

    def test_submit_verification_requires_complete_profile(self):
        """Submit verification fails if profile fields are missing."""
        incomplete_org = Organization.objects.create(
            name='Incomplete Org',
            slug='incomplete-org',
            email='',  # Missing email
            phone_number='',
            address='',
            verification_status=Organization.VerificationStatus.SETUP_INCOMPLETE
        )
        # Add a document
        OrganizationService.upload_document(
            organization=incomplete_org,
            document_type=OrganizationDocument.DocumentType.BUSINESS_LICENSE,
            file=self.sample_doc,
            original_filename='license.pdf',
            actor=self.manager_user
        )

        with self.assertRaises(ApplicationError) as ctx:
            OrganizationService.submit_verification(organization=incomplete_org, actor=self.manager_user)
        self.assertIn("Organization profile is incomplete", str(ctx.exception))

    def test_submit_verification_requires_documents(self):
        """Submit verification fails if no documents uploaded."""
        with self.assertRaises(ApplicationError) as ctx:
            OrganizationService.submit_verification(organization=self.org, actor=self.manager_user)
        self.assertIn("At least one verification document", str(ctx.exception))

    def test_successful_verification_submission(self):
        """Organization moves to SUBMITTED state when profile is complete and doc uploaded."""
        OrganizationService.upload_document(
            organization=self.org,
            document_type=OrganizationDocument.DocumentType.BUSINESS_LICENSE,
            file=self.sample_doc,
            original_filename='license.pdf',
            actor=self.manager_user
        )
        updated_org = OrganizationService.submit_verification(organization=self.org, actor=self.manager_user)
        self.assertEqual(updated_org.verification_status, Organization.VerificationStatus.SUBMITTED)
        self.assertIsNotNone(updated_org.verification_submitted_at)

    def test_document_lock_during_non_editable_states(self):
        """Uploading/Deleting documents is locked when status is SUBMITTED, UNDER_REVIEW, APPROVED, or SUSPENDED."""
        OrganizationService.upload_document(
            organization=self.org,
            document_type=OrganizationDocument.DocumentType.BUSINESS_LICENSE,
            file=self.sample_doc,
            original_filename='license.pdf',
            actor=self.manager_user
        )
        doc = self.org.documents.first()
        OrganizationService.submit_verification(organization=self.org, actor=self.manager_user)

        # Try to upload another document while SUBMITTED
        with self.assertRaises(ApplicationError) as ctx:
            OrganizationService.upload_document(
                organization=self.org,
                document_type=OrganizationDocument.DocumentType.TAX_CERTIFICATE,
                file=self.sample_doc,
                original_filename='tax.pdf',
                actor=self.manager_user
            )
        self.assertIn("Cannot upload documents", str(ctx.exception))

        # Try to delete existing document while SUBMITTED
        with self.assertRaises(ApplicationError) as ctx:
            OrganizationService.delete_document(document=doc, actor=self.manager_user)
        self.assertIn("Cannot delete documents", str(ctx.exception))

    def test_admin_review_lifecycle_transitions(self):
        """Test full Admin review cycle: SUBMITTED -> UNDER_REVIEW -> REJECTED -> RESUBMITTED -> APPROVED -> SUSPENDED -> APPROVED."""
        # 1. Upload & Submit
        OrganizationService.upload_document(
            organization=self.org,
            document_type=OrganizationDocument.DocumentType.BUSINESS_LICENSE,
            file=self.sample_doc,
            original_filename='license.pdf',
            actor=self.manager_user
        )
        OrganizationService.submit_verification(organization=self.org, actor=self.manager_user)

        # 2. Start Review (Admin)
        OrganizationService.start_review(organization=self.org, admin_user=self.admin)
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.UNDER_REVIEW)

        # 3. Reject with Reason
        with self.assertRaises(ApplicationError):
            # Fails without reason
            OrganizationService.reject_organization(organization=self.org, admin_user=self.admin, reason="")

        OrganizationService.reject_organization(organization=self.org, admin_user=self.admin, reason="License expired.")
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.REJECTED)
        self.assertEqual(self.org.verification_rejection_reason, "License expired.")

        # 4. Resubmit by Manager
        OrganizationService.submit_verification(organization=self.org, actor=self.manager_user)
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.SUBMITTED)
        self.assertEqual(self.org.verification_rejection_reason, "")

        # 5. Start Review & Approve (Admin)
        OrganizationService.start_review(organization=self.org, admin_user=self.admin)
        OrganizationService.approve_organization(organization=self.org, admin_user=self.admin)
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.APPROVED)
        self.assertEqual(self.org.verification_reviewed_by, self.admin)
        self.assertIsNotNone(self.org.verification_reviewed_at)

        # 6. Suspend with Reason
        with self.assertRaises(ApplicationError):
            OrganizationService.suspend_organization(organization=self.org, admin_user=self.admin, reason="  ")

        OrganizationService.suspend_organization(organization=self.org, admin_user=self.admin, reason="Compliance violation.")
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.SUSPENDED)
        self.assertEqual(self.org.verification_suspension_reason, "Compliance violation.")

        # 7. Unsuspend
        OrganizationService.unsuspend_organization(organization=self.org, admin_user=self.admin)
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.APPROVED)
        self.assertEqual(self.org.verification_suspension_reason, "")

    # ----------------------------------------------------
    # API View Endpoint Integration Tests
    # ----------------------------------------------------

    def test_manager_verification_endpoints_permissions_and_tenant_isolation(self):
        """Test API endpoints for manager submission, document upload, and tenant isolation."""
        client = APIClient()

        # Manager 1 uploads document
        client.force_authenticate(user=self.manager_user)
        upload_resp = client.post(
            f'/api/v1/organizations/{self.org.id}/documents/',
            {
                'document_type': 'BUSINESS_LICENSE',
                'title': 'Trade License 2026',
                'file': self.sample_doc
            },
            format='multipart'
        )
        self.assertEqual(upload_resp.status_code, status.HTTP_201_CREATED)

        # Manager 2 tries to access Manager 1's org documents -> 403 Forbidden
        client.force_authenticate(user=self.other_manager)
        forbidden_resp = client.get(f'/api/v1/organizations/{self.org.id}/documents/')
        self.assertEqual(forbidden_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Manager 1 submits verification
        client.force_authenticate(user=self.manager_user)
        submit_resp = client.post(f'/api/v1/organizations/{self.org.id}/verification/submit/')
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_resp.data['verification_status'], 'SUBMITTED')

    def test_admin_verification_queue_and_actions_api(self):
        """Test Admin verification queue, review, approve, reject, suspend endpoints via API."""
        client = APIClient()

        # Prepare submitted org
        OrganizationService.upload_document(
            organization=self.org,
            document_type=OrganizationDocument.DocumentType.BUSINESS_LICENSE,
            file=self.sample_doc,
            original_filename='license.pdf',
            actor=self.manager_user
        )
        OrganizationService.submit_verification(organization=self.org, actor=self.manager_user)

        # Non-admin manager tries to access queue -> 403 Forbidden
        client.force_authenticate(user=self.manager_user)
        queue_resp = client.get('/api/v1/organizations/admin/verification/')
        self.assertEqual(queue_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Admin accesses queue
        client.force_authenticate(user=self.admin)
        queue_resp = client.get('/api/v1/organizations/admin/verification/?verification_status=SUBMITTED')
        self.assertEqual(queue_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(queue_resp.data), 1)
        self.assertEqual(queue_resp.data[0]['id'], str(self.org.id))

        # Admin starts review
        start_resp = client.post(f'/api/v1/organizations/{self.org.id}/admin/start-review/')
        self.assertEqual(start_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(start_resp.data['verification_status'], 'UNDER_REVIEW')

        # Admin approves
        approve_resp = client.post(f'/api/v1/organizations/{self.org.id}/admin/approve/')
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_resp.data['verification_status'], 'APPROVED')

        # Admin suspends
        suspend_resp = client.post(
            f'/api/v1/organizations/{self.org.id}/admin/suspend/',
            {'reason': 'Policy audit failure'},
            format='json'
        )
        self.assertEqual(suspend_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(suspend_resp.data['verification_status'], 'SUSPENDED')

        # Admin unsuspends
        unsuspend_resp = client.post(f'/api/v1/organizations/{self.org.id}/admin/unsuspend/')
        self.assertEqual(unsuspend_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(unsuspend_resp.data['verification_status'], 'APPROVED')
