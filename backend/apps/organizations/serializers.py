from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Organization, OrganizationMembership, OrganizationDocument

User = get_user_model()


class OrganizationMembershipUserSerializer(serializers.ModelSerializer):
    """
    Nested safe representation of User inside membership payloads.
    Excludes sensitive authentication fields.
    """
    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'phone_number')
        read_only_fields = ('id', 'email', 'first_name', 'last_name', 'phone_number')


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    """
    Serializer for OrganizationMembership details.
    """
    user = OrganizationMembershipUserSerializer(read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ('id', 'user', 'role', 'is_active', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')


class OrganizationDocumentSerializer(serializers.ModelSerializer):
    """
    Serializer for OrganizationDocument verification documents.
    """
    class Meta:
        model = OrganizationDocument
        fields = (
            'id', 'organization', 'document_type', 'file', 'original_filename',
            'uploaded_at', 'status', 'reviewed_by', 'reviewed_at', 'rejection_reason'
        )
        read_only_fields = ('id', 'uploaded_at', 'status', 'reviewed_by', 'reviewed_at')


class OrganizationSerializer(serializers.ModelSerializer):
    """
    Serializer for public Organization information.
    """
    category = serializers.SerializerMethodField()
    services_count = serializers.SerializerMethodField()
    providers_count = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            'id', 'name', 'slug', 'address', 'phone_number',
            'email', 'is_active', 'verification_status', 'created_at', 'updated_at',
            'category', 'services_count', 'providers_count', 'rating', 'reviews_count'
        )
        read_only_fields = ('id', 'is_active', 'verification_status', 'created_at', 'updated_at')

    def get_category(self, obj):
        name_lower = obj.name.lower()
        if any(k in name_lower for k in ['beauty', 'salon', 'glow', 'style', 'spa', 'barber', 'aesthetic', 'chic', 'glamour']):
            return 'Salon & Beauty'
        if any(k in name_lower for k in ['dental', 'orthodontic', 'tooth', 'teeth', 'smile', 'pearl']):
            return 'Dental Care'
        if any(k in name_lower for k in ['diagnostic', 'lab', 'imaging', 'scan', 'pathology', 'biomed', 'mri', 'medinova']):
            return 'Diagnostic'
        if any(k in name_lower for k in ['consulting', 'advisory', 'legal', 'cpa', 'career', 'tax', 'audit', 'financial', 'venture']):
            return 'Consulting'
        return 'Healthcare'

    def get_services_count(self, obj):
        if hasattr(obj, 'services_count'):
            return obj.services_count
        return obj.services.filter(is_active=True).count()

    def get_providers_count(self, obj):
        if hasattr(obj, 'providers_count'):
            return obj.providers_count
        return obj.memberships.filter(role=OrganizationMembership.Role.PROVIDER, is_active=True).count()

    def get_rating(self, obj):
        if hasattr(obj, 'avg_rating') and obj.avg_rating is not None:
            return round(float(obj.avg_rating), 1)
        reviews = obj.reviews.all()
        if not reviews:
            return 0.0
        avg = sum(r.rating for r in reviews) / len(reviews)
        return round(float(avg), 1)

    def get_reviews_count(self, obj):
        if hasattr(obj, 'reviews_count'):
            return obj.reviews_count
        return obj.reviews.count()


class OrganizationCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for bootstrapping a new Organization.
    """
    class Meta:
        model = Organization
        fields = ('name', 'slug', 'address', 'phone_number', 'email')

    def validate_slug(self, value):
        if Organization.objects.filter(slug=value).exists():
            raise serializers.ValidationError("An organization with this slug already exists.")
        return value


class MemberAddSerializer(serializers.Serializer):
    """
    Serializer for adding an existing user to an organization.
    """
    user_id = serializers.IntegerField(required=True)
    role = serializers.ChoiceField(
        choices=[
            (OrganizationMembership.Role.STAFF, 'Staff'),
            (OrganizationMembership.Role.PROVIDER, 'Provider'),
        ],
        required=True
    )

    def validate_user_id(self, value):
        try:
            target_user = User.objects.get(id=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("Target user does not exist.")
        
        if not target_user.is_active:
            raise serializers.ValidationError("Target user is disabled.")
            
        return value


class MemberUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating a member's role or active status.
    """
    role = serializers.ChoiceField(
        choices=OrganizationMembership.Role.choices,
        required=False
    )
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = OrganizationMembership
        fields = ('role', 'is_active')
