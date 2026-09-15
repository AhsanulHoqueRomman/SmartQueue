from django.utils import timezone

from .models import Notification


class NotificationService:
    @staticmethod
    def create(*, recipient, organization, kind, title, message, appointment=None, queue_entry=None):
        if not recipient:
            return None
        return Notification.objects.create(
            recipient=recipient,
            organization=organization,
            kind=kind,
            title=title,
            message=message,
            appointment=appointment,
            queue_entry=queue_entry,
        )

    @staticmethod
    def mark_read(*, notification):
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return notification
