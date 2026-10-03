from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_email = serializers.EmailField(source='customer.email', read_only=True)
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    appointment_id = serializers.UUIDField(source='appointment.id', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    service_name = serializers.CharField(source='appointment.service.name', read_only=True, default='')
    provider_name = serializers.SerializerMethodField()

    def get_provider_name(self, obj):
        if not obj.provider:
            return ''
        if obj.provider.title:
            return obj.provider.title
        if obj.provider.membership and obj.provider.membership.user:
            return obj.provider.membership.user.get_full_name()
        return ''

    class Meta:
        model = Review
        fields = [
            'id', 'organization', 'organization_name', 'appointment_id', 'service_name',
            'customer', 'customer_email', 'provider_id', 'provider_name',
            'rating', 'comment', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'organization', 'organization_name', 'appointment_id', 'service_name',
            'customer', 'customer_email', 'provider_id', 'provider_name',
            'created_at', 'updated_at',
        ]


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default='')
