from rest_framework import serializers
from .models import Service


class ServiceSerializer(serializers.ModelSerializer):
    """Read serializer for Service — includes organization ID for context."""

    class Meta:
        model = Service
        fields = [
            'id', 'organization', 'name', 'description',
            'duration_minutes', 'price', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']


class ServiceCreateUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for creating / updating a Service.
    organization is injected by the view from the URL, never supplied by the client.
    """

    class Meta:
        model = Service
        fields = ['name', 'description', 'duration_minutes', 'price', 'is_active']

    def validate_duration_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("duration_minutes must be greater than zero.")
        return value

    def validate_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("price must be greater than or equal to zero.")
        return value
