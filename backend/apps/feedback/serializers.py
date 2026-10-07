from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_email = serializers.EmailField(source='customer.email', read_only=True)
    customer_avatar_url = serializers.ImageField(source='customer.avatar', read_only=True)
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
            'customer', 'customer_email', 'customer_avatar_url', 'provider_id', 'provider_name',
            'rating', 'comment', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'organization', 'organization_name', 'appointment_id', 'service_name',
            'customer', 'customer_email', 'customer_avatar_url', 'provider_id', 'provider_name',
            'created_at', 'updated_at',
        ]


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default='')


class PublicReviewSerializer(serializers.ModelSerializer):
    """
    Public representation of an organization appointment review.
    Excludes customer email and private identifiers for customer privacy.
    """
    customer_name = serializers.SerializerMethodField()
    customer_avatar_url = serializers.ImageField(source='customer.avatar', read_only=True)
    service_name = serializers.CharField(source='appointment.service.name', read_only=True, default='')
    provider_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            'id', 'rating', 'comment', 'customer_name', 'customer_avatar_url',
            'service_name', 'provider_name', 'created_at',
        ]
        read_only_fields = fields

    def get_customer_name(self, obj):
        if obj.customer:
            first = (obj.customer.first_name or '').strip()
            last = (obj.customer.last_name or '').strip()
            if first and last:
                return f"{first} {last[0]}."
            elif first:
                return first
        return "Verified Client"

    def get_provider_name(self, obj):
        if obj.provider and obj.provider.membership and obj.provider.membership.user:
            return obj.provider.membership.user.get_full_name() or obj.provider.title or 'Professional'
        return 'Professional'
