from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    appointment_id = serializers.UUIDField(source='appointment.id', read_only=True)
    queue_entry_id = serializers.UUIDField(source='queue_entry.id', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'organization', 'organization_name', 'kind', 'title', 'message',
            'appointment_id', 'queue_entry_id', 'read_at', 'created_at',
        ]
        read_only_fields = fields
