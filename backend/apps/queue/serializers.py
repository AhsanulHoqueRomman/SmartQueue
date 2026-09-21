from rest_framework import serializers

from .models import QueueEntry
from .services import QueueService


class QueueEntrySerializer(serializers.ModelSerializer):
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    provider_name = serializers.CharField(source='provider.title', read_only=True)
    appointment_id = serializers.UUIDField(source='appointment.id', read_only=True)
    customer_id = serializers.IntegerField(source='appointment.customer.id', read_only=True)
    customer_email = serializers.EmailField(source='appointment.customer.email', read_only=True)
    customer_name = serializers.CharField(source='appointment.customer.get_full_name', read_only=True)
    customer_phone = serializers.CharField(source='appointment.customer.phone_number', read_only=True)
    service_id = serializers.UUIDField(source='appointment.service.id', read_only=True)
    service_name = serializers.CharField(source='appointment.service.name', read_only=True)
    booking_channel = serializers.CharField(source='appointment.booking_channel', read_only=True)
    arrival_type = serializers.CharField(source='appointment.arrival_type', read_only=True)
    appointment_start = serializers.DateTimeField(source='appointment.start_datetime', read_only=True)
    appointment_end = serializers.DateTimeField(source='appointment.end_datetime', read_only=True)
    readiness_info = serializers.SerializerMethodField()

    class Meta:
        model = QueueEntry
        fields = [
            'id',
            'organization',
            'appointment_id',
            'provider_id',
            'provider_name',
            'queue_date',
            'serial_number',
            'token_number',
            'status',
            'is_checked_in',
            'checked_in_at',
            'is_urgent',
            'urgent_reason',
            'booking_channel',
            'arrival_type',
            'customer_id',
            'customer_email',
            'customer_name',
            'customer_phone',
            'service_id',
            'service_name',
            'appointment_start',
            'appointment_end',
            'readiness_info',
            'created_at',
            'updated_at',
            'called_at',
            'started_at',
            'completed_at',
            'skipped_at',
        ]
        read_only_fields = fields

    def get_readiness_info(self, obj):
        return QueueService.calculate_readiness_and_eta(obj)


class WalkInRegisterSerializer(serializers.Serializer):
    provider_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone_number = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class MarkUrgentSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class QueueDateQuerySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
