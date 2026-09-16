from rest_framework import serializers
from apps.organizations.models import OrganizationMembership
from .models import ProviderProfile, ProviderDocument, ProviderService, WeeklySchedule, ScheduleBreak, ProviderLeave


class ProviderDocumentSerializer(serializers.ModelSerializer):
    """Serializer for ProviderDocument verification documents."""
    class Meta:
        model = ProviderDocument
        fields = [
            'id', 'provider_profile', 'document_type', 'file', 'original_filename',
            'uploaded_at', 'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
        ]
        read_only_fields = ['id', 'uploaded_at', 'status', 'reviewed_by', 'reviewed_at']


class ProviderProfileSerializer(serializers.ModelSerializer):
    """Read serializer — exposes derived user/organization info, application status, and operational state."""
    user_email = serializers.EmailField(source='membership.user.email', read_only=True)
    user_id = serializers.IntegerField(source='membership.user.id', read_only=True)
    organization_id = serializers.UUIDField(source='membership.organization.id', read_only=True)
    membership_id = serializers.IntegerField(source='membership.id', read_only=True)
    is_operationally_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProviderProfile
        fields = [
            'id', 'membership_id', 'user_id', 'user_email',
            'organization_id', 'bio', 'title', 'is_active',
            'application_status', 'is_operationally_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields



class ProviderProfileCreateSerializer(serializers.Serializer):
    """
    Create a ProviderProfile from an existing PROVIDER membership.
    Client supplies `membership_id`; service validates role and org scope.
    """
    membership_id = serializers.IntegerField()
    bio = serializers.CharField(required=False, allow_blank=True, default='')
    title = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')


class ProviderProfileUpdateSerializer(serializers.ModelSerializer):
    """Partial-update serializer for bio, title, is_active."""

    class Meta:
        model = ProviderProfile
        fields = ['bio', 'title', 'is_active']


# ---------------------------------------------------------------------------
# ProviderService
# ---------------------------------------------------------------------------

class ProviderServiceSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_id = serializers.UUIDField(source='service.id', read_only=True)

    class Meta:
        model = ProviderService
        fields = [
            'id', 'service_id', 'service_name',
            'custom_duration_minutes', 'custom_price',
        ]
        read_only_fields = ['id', 'service_id', 'service_name']


class ProviderServiceCreateSerializer(serializers.Serializer):
    """Assign a Service to a ProviderProfile."""
    service_id = serializers.UUIDField()
    custom_duration_minutes = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    custom_price = serializers.DecimalField(
        max_digits=10, decimal_places=2,
        required=False, allow_null=True, min_value=0
    )


# ---------------------------------------------------------------------------
# WeeklySchedule & ScheduleBreak
# ---------------------------------------------------------------------------

class ScheduleBreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleBreak
        fields = ['id', 'title', 'start_time', 'end_time']
        read_only_fields = ['id']

    def validate(self, data):
        if data.get('end_time') and data.get('start_time'):
            if data['end_time'] <= data['start_time']:
                raise serializers.ValidationError("Break end_time must be after start_time.")
        return data


class WeeklyScheduleSerializer(serializers.ModelSerializer):
    breaks = ScheduleBreakSerializer(many=True, read_only=True)
    day_of_week_display = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = WeeklySchedule
        fields = [
            'id', 'day_of_week', 'day_of_week_display',
            'start_time', 'end_time', 'is_working_day', 'breaks',
        ]
        read_only_fields = ['id', 'day_of_week_display', 'breaks']

    def validate(self, data):
        start = data.get('start_time')
        end = data.get('end_time')
        if start and end and end <= start:
            raise serializers.ValidationError("end_time must be after start_time.")
        return data


class WeeklyScheduleCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklySchedule
        fields = ['day_of_week', 'start_time', 'end_time', 'is_working_day']

    def validate(self, data):
        start = data.get('start_time')
        end = data.get('end_time')
        if start and end and end <= start:
            raise serializers.ValidationError("end_time must be after start_time.")
        return data


# ---------------------------------------------------------------------------
# ProviderLeave
# ---------------------------------------------------------------------------

class ProviderLeaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProviderLeave
        fields = ['id', 'start_datetime', 'end_datetime', 'reason']
        read_only_fields = ['id']

    def validate(self, data):
        start = data.get('start_datetime')
        end = data.get('end_datetime')
        if start and end and end <= start:
            raise serializers.ValidationError("end_datetime must be after start_datetime.")
        return data
