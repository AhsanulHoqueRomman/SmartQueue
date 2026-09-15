from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source='actor.email', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'organization', 'actor', 'actor_email', 'action',
            'entity_type', 'entity_id', 'metadata', 'created_at',
        ]
        read_only_fields = fields
