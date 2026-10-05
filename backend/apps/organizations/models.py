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

    class IndustryType(models.TextChoices):
        HEALTHCARE = 'HEALTHCARE', _('Healthcare & Medical')
        LEGAL = 'LEGAL', _('Legal & Law Firm')
        BEAUTY = 'BEAUTY', _('Beauty, Salon & Wellness')
        REPAIR = 'REPAIR', _('Technical Repair & Service')
        CONSULTING = 'CONSULTING', _('Consulting & Professional Services')
        OTHER = 'OTHER', _('Other Services')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_('organization name'), max_length=255)
    slug = models.SlugField(_('slug'), max_length=255, unique=True, db_index=True)
    industry_type = models.CharField(
        _('industry type'),
        max_length=30,
        choices=IndustryType.choices,
        default=IndustryType.OTHER
    )
    address = models.TextField(_('address'), blank=True)
    phone_number = models.CharField(_('phone number'), max_length=30, blank=True)
    email = models.EmailField(_('email'), blank=True)
    logo = models.URLField(_('logo url'), max_length=500, blank=True)
    cover_image = models.URLField(_('cover image url'), max_length=500, blank=True)
    tagline = models.CharField(_('tagline / motto'), max_length=255, blank=True)
    description = models.TextField(_('description'), blank=True)
    is_active = models.BooleanField(_('active'), default=True)
    verification_status = models.CharField(
        _('verification status'),
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.SETUP_INCOMPLETE
    )
    verification_submitted_at = models.DateTimeField(_('verification submitted at'), null=True, blank=True)
    verification_reviewed_at = models.DateTimeField(_('verification reviewed at'), null=True, blank=True)
    verification_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_organizations'
    )
    verification_rejection_reason = models.TextField(_('verification rejection reason'), blank=True)
    verification_suspension_reason = models.TextField(_('verification suspension reason'), blank=True)
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


class OrganizationInvitation(models.Model):
    """
    Secure tokenized invitation sent by an Organization Manager to invite a Provider.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='invitations'
    )
    email = models.EmailField(_('invited email'))
    role = models.CharField(
        max_length=20,
        choices=OrganizationMembership.Role.choices,
        default=OrganizationMembership.Role.PROVIDER
    )
    token = models.CharField(max_length=100, unique=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_organization_invitations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='accepted_organization_invitations'
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _('organization invitation')
        verbose_name_plural = _('organization invitations')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'email'], name='org_inv_org_email_idx'),
            models.Index(fields=['token'], name='org_inv_token_idx'),
        ]

    def __str__(self):
        return f"Invitation for {self.email} -> {self.organization.name} ({self.role})"

    def save(self, *args, **kwargs):
        if not self.token:
            import secrets
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            from django.utils import timezone
            import datetime
            self.expires_at = timezone.now() + datetime.timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        from django.utils import timezone
        return (
            self.used_at is None and
            self.cancelled_at is None and
            self.expires_at > timezone.now()
        )


class OrganizationCredential(models.Model):
    """
    Multi-industry credential, registration, license, permit, or accreditation for an Organization.
    Manager uploads/submits -> verification_status = PENDING.
    Only SmartQueue admin can VERIFY or REJECT.
    Only VERIFIED and is_public credentials appear on the public storefront.
    """
    class CredentialType(models.TextChoices):
        BUSINESS_REGISTRATION = 'BUSINESS_REGISTRATION', _('Business / Trade Registration')
        OPERATING_LICENSE = 'OPERATING_LICENSE', _('Operating / Facility License')
        PROFESSIONAL_ACCREDITATION = 'PROFESSIONAL_ACCREDITATION', _('Professional Accreditation')
        TAX_REGISTRATION = 'TAX_REGISTRATION', _('Tax / TIN Registration')
        OTHER = 'OTHER', _('Other Official Credential')

    class VerificationStatus(models.TextChoices):
        PENDING = 'PENDING', _('Pending Verification')
        VERIFIED = 'VERIFIED', _('Verified')
        REJECTED = 'REJECTED', _('Rejected')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='credentials'
    )
    credential_type = models.CharField(
        max_length=40,
        choices=CredentialType.choices,
        default=CredentialType.BUSINESS_REGISTRATION
    )
    credential_name = models.CharField(_('credential name'), max_length=255)
    credential_number = models.CharField(_('credential number / license ID'), max_length=100, blank=True)
    issuing_authority = models.CharField(_('issuing authority / board'), max_length=255, blank=True)
    issued_date = models.DateField(_('issued date'), null=True, blank=True)
    expiry_date = models.DateField(_('expiry date'), null=True, blank=True)
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING
    )
    document = models.FileField(
        upload_to='org_credentials/%Y/%m/',
        null=True,
        blank=True,
        validators=[validate_document_file]
    )
    is_public = models.BooleanField(_('display publicly'), default=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='verified_organization_credentials'
    )
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('organization credential')
        verbose_name_plural = _('organization credentials')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'verification_status', 'is_public'], name='org_cred_pub_status_idx'),
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.credential_name} ({self.verification_status})"

    @property
    def masked_credential_number(self):
        """Privacy-safe masking showing only last 4 chars if long enough."""
        if not self.credential_number:
            return ""
        clean = self.credential_number.strip()
        if len(clean) <= 4:
            return "•••• " + clean
        return "•••• " + clean[-4:]


class OrganizationOperatingHours(models.Model):
    """
    Weekly operating hours for an Organization.
    Distinct from Provider working hours (which dictate appointment booking availability).
    """
    class DayOfWeek(models.IntegerChoices):
        MONDAY = 0, _('Monday')
        TUESDAY = 1, _('Tuesday')
        WEDNESDAY = 2, _('Wednesday')
        THURSDAY = 3, _('Thursday')
        FRIDAY = 4, _('Friday')
        SATURDAY = 5, _('Saturday')
        SUNDAY = 6, _('Sunday')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='operating_hours'
    )
    day_of_week = models.IntegerField(choices=DayOfWeek.choices)
    open_time = models.TimeField(null=True, blank=True)
    close_time = models.TimeField(null=True, blank=True)
    is_closed = models.BooleanField(default=False)

    class Meta:
        verbose_name = _('organization operating hours')
        verbose_name_plural = _('organization operating hours')
        ordering = ['day_of_week']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'day_of_week'],
                name='unique_org_day_operating_hours'
            )
        ]

    def __str__(self):
        day_name = self.get_day_of_week_display()
        if self.is_closed:
            return f"{self.organization.name} - {day_name}: Closed"
        return f"{self.organization.name} - {day_name}: {self.open_time} - {self.close_time}"



