from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema, OpenApiResponse

from config.api import apply_list_query, list_response
from .models import Organization, OrganizationMembership
from .permissions import IsOrganizationManager, IsOrganizationMember
from .services import OrganizationService
from .serializers import (
    OrganizationSerializer,
    OrganizationCreateSerializer,
    OrganizationMembershipSerializer,
    MemberAddSerializer,
    MemberUpdateSerializer,
)

User = get_user_model()


class OrganizationListCreateView(APIView):
    """
    GET: List active public organizations (Customer discovery).
    POST: Bootstrap a new organization with current user as MANAGER.
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    @extend_schema(
        responses={200: OrganizationSerializer(many=True)},
        summary="List active public organizations"
    )
    def get(self, request):
        orgs = Organization.objects.filter(is_active=True)
        orgs = apply_list_query(
            orgs, request,
            filter_fields=('is_active',),
            search_fields=('name', 'address', 'email', 'slug'),
            ordering_fields=('name', 'created_at'),
            default_ordering=('name',),
        )
        return list_response(orgs, OrganizationSerializer, request)

    @extend_schema(
        request=OrganizationCreateSerializer,
        responses={201: OrganizationSerializer, 400: OpenApiResponse(description="Validation Error")},
        summary="Bootstrap a new organization (Creator becomes MANAGER)"
    )
    def post(self, request):
        serializer = OrganizationCreateSerializer(data=request.data)
        if serializer.is_valid():
            org, membership = OrganizationService.create_organization(
                user=request.user,
                **serializer.validated_data
            )
            data = OrganizationSerializer(org).data
            data['membership'] = {
                'role': membership.role,
                'is_active': membership.is_active
            }
            return Response(data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrganizationDetailView(APIView):
    """
    GET: View details of a specific active organization.
    Includes current user's membership role if user is an internal member.
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    @extend_schema(
        responses={200: OrganizationSerializer, 404: OpenApiResponse(description="Organization not found")},
        summary="Retrieve organization details"
    )
    def get(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        data = OrganizationSerializer(org).data
        
        # Optionally attach current user's membership info if they are a member
        if request.user.is_authenticated:
            membership = OrganizationMembership.objects.filter(
                user=request.user,
                organization=org,
                is_active=True
            ).first()
            
            if membership:
                data['user_membership'] = {
                    'role': membership.role,
                    'is_active': membership.is_active
                }
            
        return Response(data, status=status.HTTP_200_OK)


class OrganizationMemberListAddView(APIView):
    """
    GET: List members of the target organization (Manager only).
    POST: Add an existing User as a member with role STAFF or PROVIDER (Manager only).
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={200: OrganizationMembershipSerializer(many=True), 403: OpenApiResponse(description="Forbidden")},
        summary="List organization members (Manager only)"
    )
    def get(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        memberships = OrganizationMembership.objects.filter(organization=org).select_related('user')
        serializer = OrganizationMembershipSerializer(memberships, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=MemberAddSerializer,
        responses={201: OrganizationMembershipSerializer, 400: OpenApiResponse(description="Validation Error"), 403: OpenApiResponse(description="Forbidden"), 409: OpenApiResponse(description="Duplicate membership")},
        summary="Add a user to organization (Manager only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        serializer = MemberAddSerializer(data=request.data)
        if serializer.is_valid():
            target_user = User.objects.get(id=serializer.validated_data['user_id'])
            role = serializer.validated_data['role']
            
            membership = OrganizationService.add_member(
                organization=org,
                target_user=target_user,
                role=role,
                actor=request.user,
            )
            return Response(OrganizationMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrganizationMemberDetailUpdateView(APIView):
    """
    GET: View a specific member's details (Manager only).
    PATCH: Update a member's role or active status (Manager only).
    Safely scoped by organization_id in URL to prevent tenant leaks.
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={200: OrganizationMembershipSerializer, 404: OpenApiResponse(description="Member not found in organization")},
        summary="Retrieve member details (Manager only)"
    )
    def get(self, request, organization_id, membership_id):
        # Tenant isolation check: ensure membership belongs to organization_id in URL
        membership = get_object_or_404(
            OrganizationMembership.objects.select_related('user'),
            id=membership_id,
            organization_id=organization_id
        )
        serializer = OrganizationMembershipSerializer(membership)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=MemberUpdateSerializer,
        responses={200: OrganizationMembershipSerializer, 400: OpenApiResponse(description="Validation Error"), 404: OpenApiResponse(description="Member not found"), 409: OpenApiResponse(description="Last manager protection rule triggered")},
        summary="Update member role or active status (Manager only)"
    )
    def patch(self, request, organization_id, membership_id):
        # Tenant isolation check: ensure membership belongs to organization_id in URL
        membership = get_object_or_404(
            OrganizationMembership,
            id=membership_id,
            organization_id=organization_id
        )
        serializer = MemberUpdateSerializer(data=request.data, partial=True)
        if serializer.is_valid():
            updated_membership = OrganizationService.update_membership(
                membership=membership,
                new_role=serializer.validated_data.get('role'),
                new_is_active=serializer.validated_data.get('is_active'),
                actor=request.user,
            )
            return Response(OrganizationMembershipSerializer(updated_membership).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
