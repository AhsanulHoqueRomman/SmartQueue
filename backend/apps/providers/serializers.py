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
    """Read serializer — exposes derived user/organization info, application status, review fields, and operational state."""
    user_email = serializers.EmailField(source='membership.user.email', read_only=True)
    user_first_name = serializers.CharField(source='membership.user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='membership.user.last_name', read_only=True)
    user_id = serializers.IntegerField(source='membership.user.id', read_only=True)
    organization_id = serializers.UUIDField(source='membership.organization.id', read_only=True)
    organization_name = serializers.CharField(source='membership.organization.name', read_only=True)
    membership_id = serializers.IntegerField(source='membership.id', read_only=True)
    membership_is_active = serializers.BooleanField(source='membership.is_active', read_only=True)
    is_operationally_active = serializers.BooleanField(read_only=True)
    documents = ProviderDocumentSerializer(many=True, read_only=True)
    application_reviewed_by_email = serializers.EmailField(source='application_reviewed_by.email', read_only=True)

    class Meta:
        model = ProviderProfile
        fields = [
            'id', 'membership_id', 'membership_is_active', 'user_id', 'user_email',
            'user_first_name', 'user_last_name', 'organization_id', 'organization_name',
            'bio', 'title', 'profile_photo', 'experience_years',
            'education', 'experience_history', 'certifications', 'specialties',
            'is_active', 'application_status', 'application_rejection_reason',
            'application_reviewed_at', 'application_reviewed_by', 'application_reviewed_by_email',
            'is_operationally_active', 'documents',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ProviderApplicationReviewSerializer(serializers.Serializer):
    """
    Serializer for Manager review (approve or reject) of a provider application.
    """
    action = serializers.ChoiceField(choices=['APPROVE', 'REJECT'], required=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        if data.get('action') == 'REJECT' and not data.get('reason', '').strip():
            raise serializers.ValidationError({'reason': "Rejection reason is mandatory when rejecting an application."})
        return data


class ProviderDocumentReviewSerializer(serializers.Serializer):
    """
    Serializer for Manager review of a provider document.
    """
    status = serializers.ChoiceField(choices=[ProviderDocument.Status.APPROVED, ProviderDocument.Status.REJECTED], required=True)
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        if data.get('status') == ProviderDocument.Status.REJECTED and not data.get('rejection_reason', '').strip():
            raise serializers.ValidationError({'rejection_reason': "Rejection reason is mandatory when rejecting a document."})
        return data




class EducationItemSerializer(serializers.Serializer):
    degree = serializers.CharField(max_length=200, required=True)
    institution = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    year = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')


class ExperienceItemSerializer(serializers.Serializer):
    role = serializers.CharField(max_length=200, required=True)
    organization = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    period = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    description = serializers.CharField(required=False, allow_blank=True, default='')


class CertificationItemSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=True)
    issuer = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    year = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')


class ProviderProfileCreateSerializer(serializers.Serializer):
    """
    Create a ProviderProfile from an existing PROVIDER membership.
    Client supplies `membership_id`; service validates role and org scope.
    """
    membership_id = serializers.IntegerField()
    bio = serializers.CharField(required=False, allow_blank=True, default='')
    title = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')


class ProviderProfileUpdateSerializer(serializers.ModelSerializer):
    """Partial-update serializer for bio, title, credentials, profile_photo, is_active."""
    bio = serializers.CharField(required=False, allow_blank=True)
    title = serializers.CharField(required=False, allow_blank=True)
    profile_photo = serializers.URLField(required=False, allow_blank=True)
    experience_years = serializers.IntegerField(min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = ProviderProfile
        fields = [
            'bio', 'title', 'profile_photo', 'experience_years',
            'education', 'experience_history', 'certifications',
            'specialties', 'is_active'
        ]

    def validate_education(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("education must be a list of objects.")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each education item must be an object.")
            s = EducationItemSerializer(data=item)
            if not s.is_valid():
                raise serializers.ValidationError(s.errors)
        return value

    def validate_experience_history(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("experience_history must be a list of objects.")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each experience item must be an object.")
            s = ExperienceItemSerializer(data=item)
            if not s.is_valid():
                raise serializers.ValidationError(s.errors)
        return value

    def validate_certifications(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("certifications must be a list of objects.")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each certification item must be an object.")
            s = CertificationItemSerializer(data=item)
            if not s.is_valid():
                raise serializers.ValidationError(s.errors)
        return value

    def validate_specialties(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("specialties must be a list of strings.")
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise serializers.ValidationError("Specialties must be non-empty strings.")
        return value


class ProviderPublicProfileSerializer(serializers.ModelSerializer):
    """
    Public Profile Serializer for Provider.
    Exposes provider info, credentials, derived categories, offered services, and rating metrics.
    No ProviderCategory or redundant DB relations.
    """
    provider_name = serializers.SerializerMethodField()
    organization_id = serializers.UUIDField(source='membership.organization.id', read_only=True)
    organization_name = serializers.CharField(source='membership.organization.name', read_only=True)
    categories = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()

    class Meta:
        model = ProviderProfile
        fields = [
            'id', 'provider_name', 'profile_photo', 'title', 'bio',
            'organization_id', 'organization_name',
            'experience_years', 'education', 'experience_history',
            'certifications', 'specialties',
            'categories', 'services', 'rating', 'reviews_count',
        ]
        read_only_fields = fields

    def get_provider_name(self, obj):
        user = obj.membership.user
        full_name = f"{user.first_name} {user.last_name}".strip()
        return full_name if full_name else user.email

    def get_categories(self, obj):
        categories_dict = {}
        for ps in obj.provider_services.select_related('service__category').all():
            cat = ps.service.category
            if cat and cat.is_active:
                categories_dict[str(cat.id)] = {
                    'id': str(cat.id),
                    'name': cat.name,
                    'slug': cat.slug,
                    'icon': cat.icon,
                }
        return list(categories_dict.values())

    def get_services(self, obj):
        services_list = []
        for ps in obj.provider_services.select_related('service__category').all():
            svc = ps.service
            if svc.is_active:
                duration = ps.custom_duration_minutes if ps.custom_duration_minutes is not None else svc.duration_minutes
                price = ps.custom_price if ps.custom_price is not None else svc.price
                cat_data = None
                if svc.category and svc.category.is_active:
                    cat_data = {
                        'id': str(svc.category.id),
                        'name': svc.category.name,
                        'slug': svc.category.slug,
                        'icon': svc.category.icon,
                    }
                services_list.append({
                    'id': str(svc.id),
                    'name': svc.name,
                    'description': svc.description,
                    'duration_minutes': duration,
                    'price': str(price),
                    'category': cat_data,
                })
        return services_list

    def get_rating(self, obj):
        reviews = getattr(obj, 'reviews', None)
        if reviews is None or not hasattr(reviews, 'all'):
            return 0.0
        review_list = reviews.all()
        if not review_list:
            return 0.0
        avg = sum(r.rating for r in review_list) / len(review_list)
        return round(float(avg), 1)

    def get_reviews_count(self, obj):
        reviews = getattr(obj, 'reviews', None)
        if reviews is None or not hasattr(reviews, 'count'):
            return 0
        return reviews.count()



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
