from rest_framework import serializers
from django.utils.text import slugify
from .models import Service, Category


class CategoryNestedSerializer(serializers.ModelSerializer):
    """Minimal nested category serializer for Service payload."""
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'icon']


class CategorySerializer(serializers.ModelSerializer):
    """Read serializer for Organization-scoped Category."""
    services_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id', 'organization', 'name', 'slug', 'description',
            'icon', 'display_order', 'is_active', 'services_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']

    def get_services_count(self, obj):
        return obj.services.filter(is_active=True).count()


class CategoryCreateUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for creating / updating a Category."""
    slug = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Category
        fields = ['name', 'slug', 'description', 'icon', 'display_order', 'is_active']

    def validate(self, data):
        name = data.get('name', getattr(self.instance, 'name', ''))
        slug = data.get('slug', getattr(self.instance, 'slug', '')).strip()
        if not slug and name:
            slug = slugify(name)
        data['slug'] = slug

        # Check unique slug per organization
        organization = self.context.get('organization')
        if organization:
            qs = Category.objects.filter(organization=organization, slug=slug)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'slug': 'A category with this slug already exists in the organization.'})
        return data


class ServiceSerializer(serializers.ModelSerializer):
    """Read serializer for Service — includes organization ID and nested Category."""
    category = CategoryNestedSerializer(read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'organization', 'category', 'name', 'description',
            'duration_minutes', 'price', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']


class ServiceCreateUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for creating / updating a Service.
    organization is injected by the view from the URL, never supplied by the client.
    """
    category_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Service
        fields = ['category_id', 'name', 'description', 'duration_minutes', 'price', 'is_active']

    def validate_duration_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("duration_minutes must be greater than zero.")
        return value

    def validate_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("price must be greater than or equal to zero.")
        return value

    def validate(self, data):
        organization = self.context.get('organization')
        is_active = data.get('is_active', getattr(self.instance, 'is_active', True))
        category_id = data.get('category_id')

        # Rule: NEW active services must specify a category
        if self.instance is None and is_active and not category_id:
            raise serializers.ValidationError({'category_id': 'Category is required for active new services.'})

        # Tenant boundary check if category_id supplied
        if category_id:
            try:
                category = Category.objects.get(id=category_id)
                if organization and category.organization_id != organization.id:
                    raise serializers.ValidationError({'category_id': 'Category does not belong to this organization.'})
                data['category'] = category
            except Category.DoesNotExist:
                raise serializers.ValidationError({'category_id': 'Invalid category ID.'})

        # Remove category_id raw key from validated_data so kwargs unpack cleanly
        data.pop('category_id', None)
        return data
