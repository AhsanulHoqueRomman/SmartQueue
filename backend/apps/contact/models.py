import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class ContactMessage(models.Model):
    class Status(models.TextChoices):
        NEW = 'NEW', _('New')
        IN_REVIEW = 'IN_REVIEW', _('In Review')
        REPLIED = 'REPLIED', _('Replied')
        CLOSED = 'CLOSED', _('Closed')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=255)
    phone = models.CharField(max_length=32, blank=True, default='')
    subject = models.CharField(max_length=255)
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='replied_contact_messages',
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Contact Message')
        verbose_name_plural = _('Contact Messages')
        indexes = [
            models.Index(fields=['status', 'created_at'], name='contact_status_created_idx'),
        ]

    def __str__(self):
        return f'{self.subject} from {self.email} ({self.status})'


class AppointmentIssueReport(models.Model):
    class Reason(models.TextChoices):
        RECEIVED_SERVICE_NOT_UPDATED = 'RECEIVED_SERVICE_NOT_UPDATED', _('I received the service, but the appointment was not updated')
        CHECKED_IN_NOT_SERVED = 'CHECKED_IN_NOT_SERVED', _('I checked in but was not served')
        LEFT_BEFORE_CONSULTATION = 'LEFT_BEFORE_CONSULTATION', _('I left before the consultation')
        OTHER = 'OTHER', _('Other issue')

    class Status(models.TextChoices):
        PENDING = 'PENDING', _('Pending')
        RESOLVED = 'RESOLVED', _('Resolved')
        DISMISSED = 'DISMISSED', _('Dismissed')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.ForeignKey(
        'appointments.Appointment',
        on_delete=models.CASCADE,
        related_name='issue_reports',
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='appointment_issue_reports',
    )
    reason = models.CharField(max_length=60, choices=Reason.choices, default=Reason.CHECKED_IN_NOT_SERVED)
    details = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Appointment Issue Report')
        verbose_name_plural = _('Appointment Issue Reports')

    def __str__(self):
        return f'Issue for Appointment #{self.appointment_id} by {self.customer.email} ({self.status})'
