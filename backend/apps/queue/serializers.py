from rest_framework import serializers

from .models import QueueEntry


class QueueEntrySerializer(serializers.ModelSerializer):
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    appointment_id = serializers.UUIDField(source='appointment.id', read_only=True)
    customer_id = serializers.IntegerField(source='appointment.customer.id', read_only=True)
    customer_email = serializers.EmailField(source='appointment.customer.email', read_only=True)
    service_id = serializers.UUIDField(source='appointment.service.id', read_only=True)
    service_name = serializers.CharField(source='appointment.service.name', read_only=True)
    appointment_start = serializers.DateTimeField(source='appointment.start_datetime', read_only=True)
    appointment_end = serializers.DateTimeField(source='appointment.end_datetime', read_only=True)

    class Meta:
        model = QueueEntry
        fields = [
            'id',
            'organization',
            'appointment_id',
            'provider_id',
            'queue_date',
            'token_number',
            'status',
            'customer_id',
            'customer_email',
            'service_id',
            'service_name',
            'appointment_start',
            'appointment_end',
            'created_at',
            'updated_at',
            'called_at',
            'started_at',
            'completed_at',
            'skipped_at',
        ]
        read_only_fields = fields


class QueueDateQuerySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
