import uuid
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _


from apps.organizations.validators import validate_document_file
from django.conf import settings


class ProviderProfile(models.Model):
    """
    Represents a Provider's profile within an Organization.
    Linked 1-to-1 with an OrganizationMembership where role='PROVIDER'.
    organization and user are derived through membership (no redundant FKs).
    """
    class ApplicationStatus(models.TextChoices):
        INCOMPLETE = 'INCOMPLETE', _('Incomplete')
        PENDING_REVIEW = 'PENDING_REVIEW', _('Pending Review')
        APPROVED = 'APPROVED', _('Approved')
        REJECTED = 'REJECTED', _('Rejected')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.OneToOneField(
        'organizations.OrganizationMembership',
        on_delete=models.CASCADE,
        related_name='provider_profile'
    )
    bio = models.TextField(_('bio'), blank=True)
    title = models.CharField(_('title'), max_length=100, blank=True)
    application_status = models.CharField(
        _('application status'),
        max_length=20,
        choices=ApplicationStatus.choices,
        default=ApplicationStatus.INCOMPLETE
    )
    application_rejection_reason = models.TextField(_('application rejection reason'), blank=True)
    application_reviewed_at = models.DateTimeField(_('application reviewed at'), null=True, blank=True)
    application_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_provider_applications'
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        verbose_name = _('provider profile')
        verbose_name_plural = _('provider profiles')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.membership.user.email} — Provider @ {self.membership.organization.name}"

    def clean(self):
        from apps.organizations.models import OrganizationMembership
        if self.membership_id and self.membership.role != OrganizationMembership.Role.PROVIDER:
            raise ValidationError(
                {'membership': 'ProviderProfile requires a membership with role PROVIDER.'}
            )

    def save(self, *args, **kwargs):
        # Enforce PROVIDER-role invariant even for ORM/admin creates that skip forms.
        from apps.organizations.models import OrganizationMembership
        if self.membership_id:
            role = (
                self.membership.role
                if hasattr(self, 'membership') and self.membership is not None
                else OrganizationMembership.objects.values_list('role', flat=True).get(pk=self.membership_id)
            )
            if role != OrganizationMembership.Role.PROVIDER:
                raise ValidationError(
                    {'membership': 'ProviderProfile requires a membership with role PROVIDER.'}
                )
        return super().save(*args, **kwargs)

    @property
    def organization(self):
        """Derived; never stored redundantly."""
        return self.membership.organization

    @property
    def user(self):
        """Derived; never stored redundantly."""
        return self.membership.user

    @property
    def is_operationally_active(self):
        """
        Dynamically derives operational status.
        True ONLY when:
        1. ProviderProfile.application_status == APPROVED
        2. OrganizationMembership.is_active is True
        3. Organization.is_active is True
        4. Organization.verification_status == APPROVED
        """
        from apps.organizations.models import Organization
        return (
            self.application_status == ProviderProfile.ApplicationStatus.APPROVED and
            self.membership.is_active is True and
            self.membership.organization.is_active is True and
            self.membership.organization.verification_status == Organization.VerificationStatus.APPROVED
        )


class ProviderDocument(models.Model):
    """
    Verification documents uploaded by a Provider for Organization Manager review.
    """
    class DocumentType(models.TextChoices):
        GOVT_ID = 'GOVT_ID', _('Government Issued ID')
        PROFESSIONAL_LICENSE = 'PROFESSIONAL_LICENSE', _('Professional License')
        CERTIFICATE = 'CERTIFICATE', _('Degree / Certificate')
        OTHER = 'OTHER', _('Other Supporting Document')

    class Status(models.TextChoices):
        PENDING = 'PENDING', _('Pending Review')
        APPROVED = 'APPROVED', _('Approved')
        REJECTED = 'REJECTED', _('Rejected')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider_profile = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    document_type = models.CharField(
        max_length=40,
        choices=DocumentType.choices
    )
    file = models.FileField(
        upload_to='provider_docs/%Y/%m/',
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
        related_name='reviewed_provider_documents'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        verbose_name = _('provider document')
        verbose_name_plural = _('provider documents')
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['provider_profile', 'status'], name='prov_doc_profile_status_idx'),
        ]

    def __str__(self):
        return f"{self.provider_profile.user.email} — {self.get_document_type_display()} ({self.status})"



class ProviderService(models.Model):
    """
    Configures which Services a ProviderProfile offers, optionally overriding
    the base duration and price defined on the Service.
    Invariant: provider.membership.organization == service.organization
    """
    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='provider_services'
    )
    service = models.ForeignKey(
        'services.Service',
        on_delete=models.CASCADE,
        related_name='provider_services'
    )
    custom_duration_minutes = models.PositiveIntegerField(
        _('custom duration (minutes)'),
        null=True,
        blank=True
    )
    custom_price = models.DecimalField(
        _('custom price'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    class Meta:
        verbose_name = _('provider service')
        verbose_name_plural = _('provider services')
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'service'],
                name='unique_provider_service'
            ),
            models.CheckConstraint(
                condition=models.Q(custom_price__isnull=True) | models.Q(custom_price__gte=0),
                name='provider_service_custom_price_non_negative'
            ),
        ]

    def __str__(self):
        return f"{self.provider} -> {self.service.name}"


class WeeklySchedule(models.Model):
    """
    Defines a ProviderProfile's working hours for a specific day of the week.
    """
    class DayOfWeek(models.IntegerChoices):
        MONDAY = 0, _('Monday')
        TUESDAY = 1, _('Tuesday')
        WEDNESDAY = 2, _('Wednesday')
        THURSDAY = 3, _('Thursday')
        FRIDAY = 4, _('Friday')
        SATURDAY = 5, _('Saturday')
        SUNDAY = 6, _('Sunday')

    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='weekly_schedules'
    )
    day_of_week = models.IntegerField(
        _('day of week'),
        choices=DayOfWeek.choices
    )
    start_time = models.TimeField(_('start time'))
    end_time = models.TimeField(_('end time'))
    is_working_day = models.BooleanField(_('working day'), default=True)

    class Meta:
        verbose_name = _('weekly schedule')
        verbose_name_plural = _('weekly schedules')
        ordering = ['day_of_week']
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'day_of_week'],
                name='unique_provider_schedule_day'
            ),
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='schedule_end_after_start'
            ),
            models.CheckConstraint(
                condition=models.Q(day_of_week__gte=0) & models.Q(day_of_week__lte=6),
                name='schedule_day_of_week_range'
            ),
        ]

    def __str__(self):
        return f"{self.provider} — {self.get_day_of_week_display()} {self.start_time}–{self.end_time}"


class ScheduleBreak(models.Model):
    """
    Defines a break period within a WeeklySchedule entry (e.g., lunch break).
    """
    weekly_schedule = models.ForeignKey(
        WeeklySchedule,
        on_delete=models.CASCADE,
        related_name='breaks'
    )
    title = models.CharField(_('title'), max_length=100)
    start_time = models.TimeField(_('start time'))
    end_time = models.TimeField(_('end time'))

    class Meta:
        verbose_name = _('schedule break')
        verbose_name_plural = _('schedule breaks')
        ordering = ['start_time']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='break_end_after_start'
            ),
        ]

    def __str__(self):
        return f"{self.title}: {self.start_time}–{self.end_time}"


class ProviderLeave(models.Model):
    """
    Represents a block of leave/unavailability for a ProviderProfile
    (e.g., vacation, sick leave, special closure).
    """
    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='leaves'
    )
    start_datetime = models.DateTimeField(_('start datetime'))
    end_datetime = models.DateTimeField(_('end datetime'))
    reason = models.TextField(_('reason'), blank=True)

    class Meta:
        verbose_name = _('provider leave')
        verbose_name_plural = _('provider leaves')
        ordering = ['start_datetime']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_datetime__gt=models.F('start_datetime')),
                name='leave_end_after_start'
            ),
        ]
        indexes = [
            models.Index(
                fields=['provider', 'start_datetime'],
                name='provider_leave_start_idx'
            ),
            models.Index(
                fields=['provider', 'end_datetime'],
                name='provider_leave_end_idx'
            ),
        ]

    def __str__(self):
        return f"{self.provider} — Leave {self.start_datetime.date()} to {self.end_datetime.date()}"
