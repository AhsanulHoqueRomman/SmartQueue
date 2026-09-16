import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Notification(models.Model):
    class Kind(models.TextChoices):
        APPOINTMENT_BOOKED = 'APPOINTMENT_BOOKED', _('Appointment booked')
        APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED', _('Appointment cancelled')
        APPOINTMENT_CHECKED_IN = 'APPOINTMENT_CHECKED_IN', _('Appointment checked in')
        QUEUE_CALLED = 'QUEUE_CALLED', _('Queue called')
        QUEUE_SKIPPED = 'QUEUE_SKIPPED', _('Queue skipped')
        SERVICE_COMPLETED = 'SERVICE_COMPLETED', _('Service completed')
        PROVIDER_NEW_APPOINTMENT = 'PROVIDER_NEW_APPOINTMENT', _('New appointment assigned')
        PROVIDER_APPOINTMENT_CANCELLED = 'PROVIDER_APPOINTMENT_CANCELLED', _('Appointment cancelled')
        PROVIDER_CHECKED_IN = 'PROVIDER_CHECKED_IN', _('Customer checked in')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    organization = models.ForeignKey('organizations.Organization', on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=40, choices=Kind.choices, db_index=True)
    title = models.CharField(max_length=200)
    message = models.TextField()
    appointment = models.ForeignKey('appointments.Appointment', null=True, blank=True, on_delete=models.SET_NULL, related_name='notifications')
    queue_entry = models.ForeignKey('queue.QueueEntry', null=True, blank=True, on_delete=models.SET_NULL, related_name='notifications')
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'read_at', 'created_at'], name='notif_recipient_read_idx'),
            models.Index(fields=['organization', 'created_at'], name='notif_org_created_idx'),
        ]

    def __str__(self):
        return f'{self.kind}: {self.recipient}'
