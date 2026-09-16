import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from .validators import validate_document_file


class Organization(models.Model):
    """
    Represents an Organization (clinic, salon, consulting office, service center, etc.).
    """
    class VerificationStatus(models.TextChoices):
        SETUP_INCOMPLETE = 'SETUP_INCOMPLETE', _('Setup Incomplete')
        SUBMITTED = 'SUBMITTED', _('Submitted')
        UNDER_REVIEW = 'UNDER_REVIEW', _('Under Review')
        APPROVED = 'APPROVED', _('Approved')
        REJECTED = 'REJECTED', _('Rejected')
        SUSPENDED = 'SUSPENDED', _('Suspended')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_('organization name'), max_length=255)
    slug = models.SlugField(_('slug'), max_length=255, unique=True, db_index=True)
    address = models.TextField(_('address'), blank=True)
    phone_number = models.CharField(_('phone number'), max_length=30, blank=True)
    email = models.EmailField(_('email'), blank=True)
    is_active = models.BooleanField(_('active'), default=True)
    verification_status = models.CharField(
        _('verification status'),
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.SETUP_INCOMPLETE
    )
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        verbose_name = _('organization')
        verbose_name_plural = _('organizations')
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class OrganizationDocument(models.Model):
    """
    Verification documents uploaded by an Organization Manager for System Admin review.
    """
    class DocumentType(models.TextChoices):
        BUSINESS_LICENSE = 'BUSINESS_LICENSE', _('Business / Trade License')
        TAX_CERTIFICATE = 'TAX_CERTIFICATE', _('Tax / TIN Certificate')
        FACILITY_PERMIT = 'FACILITY_PERMIT', _('Health / Operational Permit')
        OTHER = 'OTHER', _('Other Supporting Document')

    class Status(models.TextChoices):
        PENDING = 'PENDING', _('Pending Review')
        APPROVED = 'APPROVED', _('Approved')
        REJECTED = 'REJECTED', _('Rejected')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    document_type = models.CharField(
        max_length=40,
        choices=DocumentType.choices
    )
    file = models.FileField(
        upload_to='organization_docs/%Y/%m/',
        validators=[validate_document_file]
    )
    original_filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_organization_documents'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        verbose_name = _('organization document')
        verbose_name_plural = _('organization documents')
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['organization', 'status'], name='org_doc_org_status_idx'),
        ]

    def __str__(self):
        return f"{self.organization.name} — {self.get_document_type_display()} ({self.status})"



class OrganizationMembership(models.Model):
    """
    Represents a user's role and active membership within a specific Organization.
    Global users with role 'CUSTOMER' do NOT have an OrganizationMembership instance.
    """
    class Role(models.TextChoices):
        MANAGER = 'MANAGER', _('Manager')
        STAFF = 'STAFF', _('Staff')
        PROVIDER = 'PROVIDER', _('Provider')

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('organization membership')
        verbose_name_plural = _('organization memberships')
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'organization'],
                name='unique_user_organization_membership'
            )
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} - {self.organization.name} ({self.role})"
