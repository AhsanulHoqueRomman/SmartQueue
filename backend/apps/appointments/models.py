import uuid
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Appointment(models.Model):
    """
    A booked appointment between a customer and a provider for a service
    within an organization. Availability is computed dynamically; only
    confirmed bookings are persisted.
    """

    class Status(models.TextChoices):
        PENDING = 'PENDING', _('Pending')
        CONFIRMED = 'CONFIRMED', _('Confirmed')
        CHECKED_IN = 'CHECKED_IN', _('Checked in')
        IN_PROGRESS = 'IN_PROGRESS', _('In progress')
        COMPLETED = 'COMPLETED', _('Completed')
        CANCELLED = 'CANCELLED', _('Cancelled')
        NO_SHOW = 'NO_SHOW', _('No show')

    class BookingChannel(models.TextChoices):
        ONLINE = 'ONLINE', _('Online')
        PHONE = 'PHONE', _('Phone')
        FRONT_DESK = 'FRONT_DESK', _('Front Desk')

    class ArrivalType(models.TextChoices):
        SCHEDULED = 'SCHEDULED', _('Scheduled')
        WALK_IN = 'WALK_IN', _('Walk-in')

    # Statuses that block a provider's availability / cause double-booking.
    BLOCKING_STATUSES = (
        Status.PENDING,
        Status.CONFIRMED,
        Status.CHECKED_IN,
        Status.IN_PROGRESS,
    )

    # Allowed state-machine transitions.
    ALLOWED_TRANSITIONS = {
        Status.PENDING: {Status.CONFIRMED, Status.CANCELLED},
        Status.CONFIRMED: {Status.CHECKED_IN, Status.CANCELLED},
        Status.CHECKED_IN: {Status.IN_PROGRESS, Status.NO_SHOW},
        Status.IN_PROGRESS: {Status.COMPLETED},
        Status.COMPLETED: set(),
        Status.CANCELLED: set(),
        Status.NO_SHOW: set(),
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization',
        on_delete=models.CASCADE,
        related_name='appointments',
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='appointments',
    )
    provider = models.ForeignKey(
        'providers.ProviderProfile',
        on_delete=models.CASCADE,
        related_name='appointments',
    )
    service = models.ForeignKey(
        'services.Service',
        on_delete=models.PROTECT,
        related_name='appointments',
    )
    appointment_date = models.DateField(_('appointment date'), null=True, blank=True, db_index=True)
    serial_number = models.PositiveIntegerField(_('serial number'), null=True, blank=True, db_index=True)
    booking_channel = models.CharField(
        _('booking channel'),
        max_length=20,
        choices=BookingChannel.choices,
        default=BookingChannel.ONLINE,
    )
    arrival_type = models.CharField(
        _('arrival type'),
        max_length=20,
        choices=ArrivalType.choices,
        default=ArrivalType.SCHEDULED,
    )
    start_datetime = models.DateTimeField(_('start datetime'))
    end_datetime = models.DateTimeField(_('end datetime'))
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=Status.choices,
        default=Status.CONFIRMED,
        db_index=True,
    )
    cancellation_reason = models.TextField(_('cancellation reason'), blank=True)
    notes = models.TextField(_('notes'), blank=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        verbose_name = _('appointment')
        verbose_name_plural = _('appointments')
        ordering = ['appointment_date', 'serial_number', 'start_datetime']
        indexes = [
            models.Index(
                fields=['provider', 'appointment_date', 'serial_number'],
                name='appt_provider_date_serial_idx',
            ),
            models.Index(
                fields=['provider', 'start_datetime', 'end_datetime'],
                name='appt_provider_time_idx',
            ),
            models.Index(
                fields=['provider', 'status'],
                name='appt_provider_status_idx',
            ),
            models.Index(
                fields=['organization', 'start_datetime'],
                name='appt_org_start_idx',
            ),
            models.Index(
                fields=['customer', 'start_datetime'],
                name='appt_customer_start_idx',
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_datetime__gt=models.F('start_datetime')),
                name='appointment_end_after_start',
            ),
            models.UniqueConstraint(
                fields=['provider', 'appointment_date', 'serial_number'],
                name='unique_provider_date_serial',
            ),
        ]

    def __str__(self):
        return (
            f"{self.customer} -> {self.provider} "
            f"[{self.start_datetime:%Y-%m-%d %H:%M}] ({self.status})"
        )

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.ALLOWED_TRANSITIONS.get(self.status, set())
