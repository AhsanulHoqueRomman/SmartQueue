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
    title = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationDocument
        fields = (
            'id', 'organization', 'document_type', 'title', 'file', 'original_filename',
            'uploaded_at', 'status', 'reviewed_by', 'reviewed_at', 'rejection_reason'
        )
        read_only_fields = ('id', 'organization', 'uploaded_at', 'status', 'reviewed_by', 'reviewed_at')
        extra_kwargs = {
            'file': {'required': True},
            'original_filename': {'required': False, 'allow_blank': True},
        }

    def get_title(self, obj):
        return obj.original_filename or obj.get_document_type_display()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.file:
            request = self.context.get('request') if isinstance(self.context, dict) else None
            if request is not None:
                data['file'] = request.build_absolute_uri(instance.file.url)
            else:
                url = instance.file.url
                data['file'] = f"http://127.0.0.1:8000{url}" if url.startswith('/') else url
        return data



class OrganizationSerializer(serializers.ModelSerializer):
    """
    Serializer for public & management Organization information.
    Exposes read-only verification status and timestamps.
    """
    industry_label = serializers.SerializerMethodField()
    services_count = serializers.SerializerMethodField()
    providers_count = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    documents_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            'id', 'name', 'slug', 'industry_type', 'industry_label',
            'address', 'phone_number', 'email', 'logo', 'cover_image', 'description',
            'is_active', 'verification_status',
            'verification_submitted_at', 'verification_reviewed_at',
            'verification_rejection_reason', 'verification_suspension_reason',
            'created_at', 'updated_at',
            'services_count', 'providers_count', 'rating', 'reviews_count',
            'documents', 'documents_count'
        )
        read_only_fields = (
            'id', 'is_active', 'verification_status',
            'verification_submitted_at', 'verification_reviewed_at',
            'verification_rejection_reason', 'verification_suspension_reason',
            'created_at', 'updated_at'
        )

    def get_industry_label(self, obj):
        return obj.get_industry_type_display() if obj.industry_type else 'Other Services'

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

    def get_documents_count(self, obj):
        if hasattr(obj, 'documents_count'):
            return obj.documents_count
        return obj.documents.count()

    def get_documents(self, obj):
        docs = getattr(obj, 'prefetched_documents', None)
        if docs is None:
            docs = obj.documents.all()
        ctx = self.context if isinstance(self.context, dict) else {}
        return OrganizationDocumentSerializer(docs, many=True, context=ctx).data


class AdminActionReasonSerializer(serializers.Serializer):
    """
    Serializer for payload requiring a reason (e.g. Reject, Suspend).
    """
    reason = serializers.CharField(required=True, allow_blank=False)


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
        fields = ('name', 'slug', 'industry_type', 'address', 'phone_number', 'email')
        extra_kwargs = {
            'industry_type': {'required': False}
        }

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


class OrganizationInvitationSerializer(serializers.ModelSerializer):
    """
    Serializer for displaying OrganizationInvitation records.
    """
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)

    class Meta:
        from .models import OrganizationInvitation
        model = OrganizationInvitation
        fields = (
            'id', 'organization', 'organization_name', 'email', 'role',
            'token', 'created_by', 'created_by_email', 'created_at',
            'expires_at', 'used_at', 'cancelled_at', 'is_valid'
        )
        read_only_fields = (
            'id', 'organization', 'token', 'created_by', 'created_at',
            'expires_at', 'used_at', 'cancelled_at', 'is_valid'
        )


class OrganizationInvitationCreateSerializer(serializers.Serializer):
    """
    Serializer for creating a provider invitation by manager.
    """
    email = serializers.EmailField(required=True)


class AcceptInvitationSerializer(serializers.Serializer):
    """
    Serializer for accepting a provider or staff invitation.
    """
    first_name = serializers.CharField(required=True, allow_blank=False)
    last_name = serializers.CharField(required=True, allow_blank=False)
    password = serializers.CharField(required=True, min_length=6, write_only=True)


class StaffMemberSerializer(serializers.ModelSerializer):
    """
    Serializer for displaying Staff members in an organization.
    """
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = (
            'id', 'user_id', 'user_email', 'user_first_name', 'user_last_name',
            'organization', 'organization_name', 'role', 'is_active', 'created_at', 'updated_at'
        )
        read_only_fields = fields


