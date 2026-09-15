import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _


class Organization(models.Model):
    """
    Represents an Organization (clinic, salon, consulting office, service center, etc.).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_('organization name'), max_length=255)
    slug = models.SlugField(_('slug'), max_length=255, unique=True, db_index=True)
    address = models.TextField(_('address'), blank=True)
    phone_number = models.CharField(_('phone number'), max_length=30, blank=True)
    email = models.EmailField(_('email'), blank=True)
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        verbose_name = _('organization')
        verbose_name_plural = _('organizations')
        ordering = ['-created_at']

    def __str__(self):
        return self.name


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
