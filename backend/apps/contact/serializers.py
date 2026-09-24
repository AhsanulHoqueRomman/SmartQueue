from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import ContactMessage

User = get_user_model()


class ContactMessageSerializer(serializers.ModelSerializer):
    """
    Public serializer for Contact Us inquiries.
    Explicitly excludes internal admin fields (replied_at, replied_by)
    from serialized output to prevent public metadata exposure.
    """
    class Meta:
        model = ContactMessage
        fields = [
            'id',
            'name',
            'email',
            'phone',
            'subject',
            'message',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'created_at',
            'updated_at',
        ]

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Name cannot be empty or whitespace only.')
        return value.strip()

    def validate_email(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Email address cannot be empty.')
        return value.strip().lower()

    def validate_phone(self, value):
        if value:
            return value.strip()
        return ''

    def validate_subject(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Subject cannot be empty or whitespace only.')
        return value.strip()

    def validate_message(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Message cannot be empty or whitespace only.')
        value = value.strip()
        if len(value) > 5000:
            raise serializers.ValidationError('Message body cannot exceed 5000 characters.')
        return value


class AdminUserSerializer(serializers.ModelSerializer):
    """
    Safe serializer for admin identity metadata.
    """
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'name']

    def get_name(self, obj):
        if obj.first_name or obj.last_name:
            return f"{obj.first_name} {obj.last_name}".strip()
        return obj.email


class AdminContactMessageSerializer(serializers.ModelSerializer):
    """
    Admin serializer for Contact Us inbox detail & status management.
    Exposes internal administrative metadata (replied_at, replied_by).
    """
    replied_by_detail = AdminUserSerializer(source='replied_by', read_only=True)

    class Meta:
        model = ContactMessage
        fields = [
            'id',
            'name',
            'email',
            'phone',
            'subject',
            'message',
            'status',
            'created_at',
            'updated_at',
            'replied_at',
            'replied_by',
            'replied_by_detail',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'replied_at',
            'replied_by',
            'replied_by_detail',
        ]

    def validate_status(self, value):
        if value not in ContactMessage.Status.values:
            raise serializers.ValidationError(
                f"Invalid status '{value}'. Choice must be one of {ContactMessage.Status.values}."
            )
        return value


class AdminContactReplySerializer(serializers.Serializer):
    """
    Serializer for admin reply submission.
    """
    message = serializers.CharField(required=True, max_length=5000)

    def validate_message(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Reply message cannot be empty or whitespace only.')
        value = value.strip()
        if len(value) > 5000:
            raise serializers.ValidationError('Reply message cannot exceed 5000 characters.')
        return value
