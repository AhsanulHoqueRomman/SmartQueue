import uuid
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _


class ProviderProfile(models.Model):
    """
    Represents a Provider's profile within an Organization.
    Linked 1-to-1 with an OrganizationMembership where role='PROVIDER'.
    organization and user are derived through membership (no redundant FKs).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.OneToOneField(
        'organizations.OrganizationMembership',
        on_delete=models.CASCADE,
        related_name='provider_profile'
    )
    bio = models.TextField(_('bio'), blank=True)
    title = models.CharField(_('title'), max_length=100, blank=True)
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
