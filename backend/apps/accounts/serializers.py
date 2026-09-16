from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from .models import User


class UserMembershipSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    organization_id = serializers.UUIDField(source='organization.id', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    organization_slug = serializers.CharField(source='organization.slug', read_only=True)
    role = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)


class UserSerializer(serializers.ModelSerializer):
    """
    Public profile serializer for User model.
    Includes active organization memberships and admin status.
    """
    memberships = UserMembershipSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'email', 'first_name', 'last_name', 'phone_number',
            'is_staff', 'is_superuser', 'date_joined', 'memberships'
        )
        read_only_fields = ('id', 'email', 'is_staff', 'is_superuser', 'date_joined')


class UserRegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )

    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name', 'phone_number', 'password', 'password_confirm')

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password_confirm": "Password fields do not match."})
        role = self.initial_data.get('role')
        if role and str(role).upper() == 'STAFF':
            raise serializers.ValidationError({"role": "Staff members cannot self-register. Registration is invitation-only."})
        return attrs


    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone_number=validated_data.get('phone_number', '')
        )
        return user


class ManagerRegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for Manager registration + Organization creation in an atomic operation.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    organization_name = serializers.CharField(required=True, max_length=255)
    organization_slug = serializers.CharField(required=False, allow_blank=True, max_length=255)
    organization_type = serializers.CharField(required=False, allow_blank=True, max_length=100)
    address = serializers.CharField(required=False, allow_blank=True)
    organization_phone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    organization_email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            'email', 'first_name', 'last_name', 'phone_number', 'password', 'password_confirm',
            'organization_name', 'organization_slug', 'organization_type', 'address',
            'organization_phone', 'organization_email'
        )

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password_confirm": "Password fields do not match."})
        return attrs


class ProviderRegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for Provider registration + ProviderProfile creation + optional Org selection.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    title = serializers.CharField(required=False, allow_blank=True, max_length=100)
    bio = serializers.CharField(required=False, allow_blank=True)
    organization_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            'email', 'first_name', 'last_name', 'phone_number', 'password', 'password_confirm',
            'title', 'bio', 'organization_id'
        )

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password_confirm": "Password fields do not match."})
        return attrs


class UserLoginSerializer(serializers.Serializer):
    """
    Serializer for user login and token generation.
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')

        if email and password:
            user = authenticate(request=self.context.get('request'), email=email, password=password)
            if not user:
                raise serializers.ValidationError({"detail": "Unable to log in with provided credentials."})
            if not user.is_active:
                raise serializers.ValidationError({"detail": "User account is disabled."})
            attrs['user'] = user
            return attrs
        else:
            raise serializers.ValidationError({"detail": "Must include 'email' and 'password'."})


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating profile fields (first_name, last_name, phone_number).
    """
    class Meta:
        model = User
        fields = ('first_name', 'last_name', 'phone_number')


class ChangePasswordSerializer(serializers.Serializer):
    """
    Serializer for password change.
    """
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        user = self.context['request'].user
        if not user.check_password(attrs['old_password']):
            raise serializers.ValidationError({"old_password": "Old password is incorrect."})
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({"new_password_confirm": "New passwords do not match."})
        return attrs


class LogoutSerializer(serializers.Serializer):
    """
    Serializer for logout request containing the refresh token.
    """
    refresh = serializers.CharField(required=True)
