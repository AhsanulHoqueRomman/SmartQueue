from rest_framework import serializers

from .models import Appointment


class AppointmentSerializer(serializers.ModelSerializer):
    """Full read serializer for appointments."""
    customer_email = serializers.EmailField(source='customer.email', read_only=True)
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    service_id = serializers.UUIDField(source='service.id', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    organization_id = serializers.UUIDField(source='organization.id', read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id',
            'organization_id',
            'customer',
            'customer_email',
            'customer_name',
            'provider_id',
            'service_id',
            'service_name',
            'appointment_date',
            'serial_number',
            'booking_channel',
            'arrival_type',
            'start_datetime',
            'end_datetime',
            'status',
            'cancellation_reason',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class AppointmentListSerializer(serializers.ModelSerializer):
    """Compact list serializer."""
    customer_email = serializers.EmailField(source='customer.email', read_only=True)
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    service_id = serializers.UUIDField(source='service.id', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id',
            'customer',
            'customer_email',
            'customer_name',
            'provider_id',
            'service_id',
            'service_name',
            'appointment_date',
            'serial_number',
            'booking_channel',
            'arrival_type',
            'start_datetime',
            'end_datetime',
            'status',
            'notes',
        ]
        read_only_fields = fields


class AppointmentCreateSerializer(serializers.Serializer):
    """
    Client-controlled booking fields only.
    customer / organization / end_datetime / status are server-owned.
    """
    provider_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    start_datetime = serializers.DateTimeField()
    booking_channel = serializers.CharField(required=False, default=Appointment.BookingChannel.ONLINE)
    arrival_type = serializers.CharField(required=False, default=Appointment.ArrivalType.SCHEDULED)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_start_datetime(self, value):
        from django.utils import timezone
        if timezone.is_naive(value):
            raise serializers.ValidationError('start_datetime must be timezone-aware.')
        return value


class AppointmentRescheduleSerializer(serializers.Serializer):
    start_datetime = serializers.DateTimeField()

    def validate_start_datetime(self, value):
        from django.utils import timezone
        if timezone.is_naive(value):
            raise serializers.ValidationError('start_datetime must be timezone-aware.')
        return value


class AppointmentCancelSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(
        required=False, allow_blank=True, default=''
    )


class AvailabilityQuerySerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    date = serializers.DateField()


class AvailabilitySlotSerializer(serializers.Serializer):
    start = serializers.CharField()
    end = serializers.CharField()


class AvailabilityResponseSerializer(serializers.Serializer):
    date = serializers.DateField()
    provider_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    duration_minutes = serializers.IntegerField()
    slots = AvailabilitySlotSerializer(many=True)


class CustomerDashboardItemSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(source='organization.id', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    organization_slug = serializers.CharField(source='organization.slug', read_only=True)
    organization_category = serializers.CharField(source='organization.industry_type', read_only=True)
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    provider_name = serializers.SerializerMethodField()
    provider_title = serializers.CharField(source='provider.title', read_only=True)
    service_id = serializers.UUIDField(source='service.id', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    category_id = serializers.UUIDField(source='service.category.id', read_only=True, default=None)
    category_name = serializers.CharField(source='service.category.name', read_only=True, default=None)
    queue_entry = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            'id',
            'organization_id',
            'organization_name',
            'organization_slug',
            'organization_category',
            'provider_id',
            'provider_name',
            'provider_title',
            'service_id',
            'service_name',
            'category_id',
            'category_name',
            'appointment_date',
            'serial_number',
            'booking_channel',
            'arrival_type',
            'start_datetime',
            'end_datetime',
            'status',
            'notes',
            'queue_entry',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_provider_name(self, obj):
        if obj.provider and obj.provider.membership and obj.provider.membership.user:
            return obj.provider.membership.user.get_full_name() or obj.provider.membership.user.email
        return obj.provider.title if obj.provider else ''

    def get_queue_entry(self, obj):
        from apps.queue.serializers import QueueEntrySerializer
        q = getattr(obj, 'queue_entry', None)
        if q is None:
            from apps.queue.models import QueueEntry
            q = QueueEntry.objects.filter(appointment=obj).first()
        if q:
            return QueueEntrySerializer(q).data
        return None

