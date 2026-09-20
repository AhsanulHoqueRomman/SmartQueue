import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


class Category(models.Model):
    """
    Represents an Organization-scoped Category / Department / Practice Area.
    Groups related bookable services within a specific Organization.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization',
        on_delete=models.CASCADE,
        related_name='categories'
    )
    name = models.CharField(_('category name'), max_length=100)
    slug = models.SlugField(_('slug'), max_length=100)
    description = models.TextField(_('description'), blank=True)
    icon = models.CharField(_('icon'), max_length=50, blank=True)
    display_order = models.PositiveIntegerField(_('display order'), default=0)
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('category')
        verbose_name_plural = _('categories')
        ordering = ['display_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'slug'],
                name='unique_category_slug_per_organization'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"


class Service(models.Model):
    """
    Represents a bookable service offered by an Organization.
    Scoped strictly to one Organization.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization',
        on_delete=models.CASCADE,
        related_name='services'
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='services'
    )
    name = models.CharField(_('name'), max_length=255)
    description = models.TextField(_('description'), blank=True)
    duration_minutes = models.PositiveIntegerField(_('duration (minutes)'))
    price = models.DecimalField(
        _('price'),
        max_digits=10,
        decimal_places=2,
        default='0.00'
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        verbose_name = _('service')
        verbose_name_plural = _('services')
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_service_name_per_organization'
            ),
            models.CheckConstraint(
                condition=models.Q(duration_minutes__gt=0),
                name='service_duration_positive'
            ),
            models.CheckConstraint(
                condition=models.Q(price__gte=0),
                name='service_price_non_negative'
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"
