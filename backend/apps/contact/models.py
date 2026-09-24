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
