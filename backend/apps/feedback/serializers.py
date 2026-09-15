from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_email = serializers.EmailField(source='customer.email', read_only=True)
    provider_id = serializers.UUIDField(source='provider.id', read_only=True)
    appointment_id = serializers.UUIDField(source='appointment.id', read_only=True)

    class Meta:
        model = Review
        fields = [
            'id', 'organization', 'appointment_id', 'customer', 'customer_email',
            'provider_id', 'rating', 'comment', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'organization', 'appointment_id', 'customer', 'customer_email', 'provider_id', 'created_at', 'updated_at']


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default='')
