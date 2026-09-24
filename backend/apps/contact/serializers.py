from rest_framework import serializers
from .models import ContactMessage


class ContactMessageSerializer(serializers.ModelSerializer):
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
        ]
        read_only_fields = [
            'id',
            'status',
            'created_at',
            'updated_at',
            'replied_at',
            'replied_by',
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
