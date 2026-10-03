from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from drf_spectacular.utils import extend_schema, OpenApiResponse

from django.db import transaction
from django.utils.text import slugify
import uuid
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.organizations.services import OrganizationService

from apps.accounts.throttling import PasswordResetAnonRateThrottle
from .serializers import (
    UserSerializer,
    UserRegisterSerializer,
    ManagerRegisterSerializer,
    ProviderRegisterSerializer,
    UserLoginSerializer,
    UserUpdateSerializer,
    ChangePasswordSerializer,
    LogoutSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)


class RegisterView(APIView):
    """
    API endpoint for registering a new user account (Customer).
    Returns the created user data along with initial JWT access and refresh tokens.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=UserRegisterSerializer,
        responses={201: UserSerializer, 400: OpenApiResponse(description="Validation Error")},
        summary="Register a new user account"
    )
    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RegisterManagerView(APIView):
    """
    API endpoint for registering a new Manager account and bootstrapping an Organization atomically.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=ManagerRegisterSerializer,
        responses={201: UserSerializer, 400: OpenApiResponse(description="Validation Error")},
        summary="Register a new Manager and create their Organization atomically"
    )
    def post(self, request):
        serializer = ManagerRegisterSerializer(data=request.data)
        if serializer.is_valid():
            data = serializer.validated_data
            with transaction.atomic():
                user = User.objects.create_user(
                    email=data['email'],
                    password=data['password'],
                    first_name=data.get('first_name', ''),
                    last_name=data.get('last_name', ''),
                    phone_number=data.get('phone_number', '')
                )
                
                org_name = data['organization_name']
                base_slug = slugify(data.get('organization_slug') or org_name)
                if not base_slug:
                    base_slug = f"org-{uuid.uuid4().hex[:8]}"
                
                slug = base_slug
                counter = 1
                while Organization.objects.filter(slug=slug).exists():
                    slug = f"{base_slug}-{counter}"
                    counter += 1

                org, membership = OrganizationService.create_organization(
                    user=user,
                    name=org_name,
                    slug=slug,
                    address=data.get('address', ''),
                    phone_number=data.get('organization_phone', ''),
                    email=data.get('organization_email', data['email'])
                )

                refresh = RefreshToken.for_user(user)
                return Response({
                    'user': UserSerializer(user).data,
                    'organization': {
                        'id': str(org.id),
                        'name': org.name,
                        'slug': org.slug,
                    },
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RegisterProviderView(APIView):
    """
    API endpoint for registering a new Provider account and submitting optional profile/application.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=ProviderRegisterSerializer,
        responses={201: UserSerializer, 400: OpenApiResponse(description="Validation Error")},
        summary="Register a new Provider account and submit optional profile/application"
    )
    def post(self, request):
        serializer = ProviderRegisterSerializer(data=request.data)
        if serializer.is_valid():
            data = serializer.validated_data
            with transaction.atomic():
                user = User.objects.create_user(
                    email=data['email'],
                    password=data['password'],
                    first_name=data.get('first_name', ''),
                    last_name=data.get('last_name', ''),
                    phone_number=data.get('phone_number', '')
                )

                org_id = data.get('organization_id')
                is_pending_approval = False

                if org_id:
                    try:
                        org = Organization.objects.get(id=org_id, is_active=True)
                    except Organization.DoesNotExist:
                        return Response(
                            {'organization_id': ['Selected organization does not exist or is inactive.']},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    org_membership = OrganizationMembership.objects.create(
                        user=user,
                        organization=org,
                        role=OrganizationMembership.Role.PROVIDER,
                        is_active=False
                    )
                    
                    ProviderProfile.objects.create(
                        membership=org_membership,
                        title=data.get('title', ''),
                        bio=data.get('bio', ''),
                        is_active=True
                    )
                    is_pending_approval = True

                refresh = RefreshToken.for_user(user)
                return Response({
                    'user': UserSerializer(user).data,
                    'is_pending_approval': is_pending_approval,
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    """
    API endpoint for user login.
    Validates credentials and returns JWT access and refresh tokens along with user info.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=UserLoginSerializer,
        responses={200: OpenApiResponse(description="JWT Tokens & User Object"), 400: OpenApiResponse(description="Invalid credentials")},
        summary="Login with email and password"
    )
    def post(self, request):
        serializer = UserLoginSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    """
    API endpoint for logging out a user.
    Blacklists the provided refresh token.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=LogoutSerializer,
        responses={200: OpenApiResponse(description="Successfully logged out"), 400: OpenApiResponse(description="Invalid refresh token")},
        summary="Logout and blacklist refresh token"
    )
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        refresh_token = serializer.validated_data['refresh']
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        except TokenError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

class CurrentUserView(APIView):
    """
    API endpoint to retrieve or update the authenticated user's profile.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(
        responses={200: UserSerializer},
        summary="Retrieve authenticated user profile"
    )
    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=UserUpdateSerializer,
        responses={200: UserSerializer, 400: OpenApiResponse(description="Validation Error")},
        summary="Update authenticated user profile fields"
    )
    def patch(self, request):
        serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(request.user, context={'request': request}).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    """
    API endpoint for changing authenticated user's password.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={200: OpenApiResponse(description="Password successfully updated"), 400: OpenApiResponse(description="Validation Error")},
        summary="Change user password"
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({'detail': 'Password successfully updated.'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetRequestView(APIView):
    """
    Public API endpoint to request a password reset email.
    Generates a secure, time-limited token and sends an email via Resend if the user exists.
    Returns a generic message regardless of email existence to prevent account enumeration.
    """
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetAnonRateThrottle]

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={200: OpenApiResponse(description="Generic confirmation response")},
        summary="Request a password reset email"
    )
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            user = User.objects.filter(email__iexact=email, is_active=True).first()
            if user:
                from django.contrib.auth.tokens import default_token_generator
                from django.utils.http import urlsafe_base64_encode
                from django.utils.encoding import force_bytes
                from django.conf import settings
                from apps.contact.email_service import send_password_reset_email

                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
                reset_url = f"{frontend_url}/reset-password/{uid}/{token}"

                send_password_reset_email(user=user, reset_url=reset_url)

            return Response(
                {"detail": "If an account exists for this email, a password reset link has been sent."},
                status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmView(APIView):
    """
    Public API endpoint to validate a password reset token and update the user's password.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={200: OpenApiResponse(description="Password successfully reset"), 400: OpenApiResponse(description="Validation Error")},
        summary="Confirm password reset with UID and token"
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            new_password = serializer.validated_data['new_password']
            user.set_password(new_password)
            user.save()
            return Response(
                {"detail": "Your password has been reset successfully."},
                status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

