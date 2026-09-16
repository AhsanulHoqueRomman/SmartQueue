import io
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import ValidationError

from apps.organizations.models import Organization, OrganizationDocument
from apps.organizations.validators import validate_document_file, ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES

User = get_user_model()


class OrganizationApprovalFoundationTest(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email='admin@smartqueue.com',
            password='Password123!'
        )
        self.org = Organization.objects.create(
            name='Test Aesthetic Clinic',
            slug='test-aesthetic-clinic',
            email='info@testaesthetic.com'
        )

    def test_new_organization_defaults_to_setup_incomplete(self):
        """Verify new Organization instance defaults to SETUP_INCOMPLETE."""
        self.assertEqual(
            self.org.verification_status,
            Organization.VerificationStatus.SETUP_INCOMPLETE
        )

    def test_organization_verification_status_valid_choices(self):
        """Verify verification_status accepts only valid choices."""
        valid_statuses = [
            Organization.VerificationStatus.SETUP_INCOMPLETE,
            Organization.VerificationStatus.SUBMITTED,
            Organization.VerificationStatus.UNDER_REVIEW,
            Organization.VerificationStatus.APPROVED,
            Organization.VerificationStatus.REJECTED,
            Organization.VerificationStatus.SUSPENDED,
        ]
        for status in valid_statuses:
            self.org.verification_status = status
            self.org.full_clean()
            self.org.save()
            self.assertEqual(self.org.verification_status, status)

    def test_organization_document_creation_and_relations(self):
        """Verify OrganizationDocument model relations and fields."""
        dummy_file = SimpleUploadedFile(
            "trade_license.pdf",
            b"Dummy PDF Content for Trade License",
            content_type="application/pdf"
        )
        doc = OrganizationDocument.objects.create(
            organization=self.org,
            document_type=OrganizationDocument.DocumentType.BUSINESS_LICENSE,
            file=dummy_file,
            original_filename="trade_license.pdf",
            status=OrganizationDocument.Status.PENDING,
            reviewed_by=self.admin_user
        )

        self.assertEqual(doc.organization, self.org)
        self.assertEqual(doc.document_type, OrganizationDocument.DocumentType.BUSINESS_LICENSE)
        self.assertEqual(doc.status, OrganizationDocument.Status.PENDING)
        self.assertEqual(doc.reviewed_by, self.admin_user)
        self.assertTrue(doc.file.name.startswith("organization_docs/"))

    def test_file_validator_extension_check(self):
        """Verify document file validator rejects unsupported file extensions."""
        invalid_file = SimpleUploadedFile(
            "script.exe",
            b"Executable File Content",
            content_type="application/octet-stream"
        )
        with self.assertRaises(ValidationError) as ctx:
            validate_document_file(invalid_file)
        self.assertIn("Unsupported file format", str(ctx.exception))

    def test_file_validator_size_limit_check(self):
        """Verify document file validator rejects files exceeding 10MB limit."""
        oversized_content = b"X" * (MAX_DOCUMENT_SIZE_BYTES + 1024)
        large_file = SimpleUploadedFile(
            "large_doc.pdf",
            oversized_content,
            content_type="application/pdf"
        )
        with self.assertRaises(ValidationError) as ctx:
            validate_document_file(large_file)
        self.assertIn("File size exceeds", str(ctx.exception))

    def test_file_validator_valid_files(self):
        """Verify document file validator passes valid files."""
        for ext in ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']:
            file_name = f"valid_document{ext}"
            valid_file = SimpleUploadedFile(
                file_name,
                b"Valid Content",
                content_type="application/octet-stream"
            )
            # Should not raise exception
            validate_document_file(valid_file)
