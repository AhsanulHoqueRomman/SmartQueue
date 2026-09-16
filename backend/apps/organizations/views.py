from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema, OpenApiResponse

from config.api import apply_list_query, list_response
from .models import Organization, OrganizationMembership, OrganizationDocument, OrganizationInvitation
from .permissions import IsOrganizationManager, IsOrganizationMember, IsSystemAdmin
from .services import OrganizationService
from .serializers import (
    OrganizationSerializer,
    OrganizationCreateSerializer,
    OrganizationMembershipSerializer,
    OrganizationDocumentSerializer,
    MemberAddSerializer,
    MemberUpdateSerializer,
    AdminActionReasonSerializer,
    OrganizationInvitationSerializer,
    OrganizationInvitationCreateSerializer,
    AcceptInvitationSerializer,
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


# ---------------------------------------------------------------------------
# Phase B: Organization Verification & Document Endpoints
# ---------------------------------------------------------------------------

class ManagerVerificationSubmitView(APIView):
    """
    POST: Manager submits organization for Admin verification review.
    Validates profile completeness and document attachment.
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={200: OrganizationSerializer, 400: OpenApiResponse(description="Validation or State Error")},
        summary="Submit organization for Admin verification review (Manager only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        updated_org = OrganizationService.submit_verification(organization=org, actor=request.user)
        return Response(OrganizationSerializer(updated_org).data, status=status.HTTP_200_OK)


class OrganizationDocumentListUploadView(APIView):
    """
    GET: List verification documents for organization (Manager or System Admin).
    POST: Upload a verification document (Manager only, when SETUP_INCOMPLETE or REJECTED).
    """
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    @extend_schema(
        responses={200: OrganizationDocumentSerializer(many=True)},
        summary="List organization verification documents"
    )
    def get(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        docs = OrganizationDocument.objects.filter(organization=org)
        serializer = OrganizationDocumentSerializer(docs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=OrganizationDocumentSerializer,
        responses={201: OrganizationDocumentSerializer, 400: OpenApiResponse(description="Validation Error")},
        summary="Upload organization verification document (Manager only)"
    )
    def post(self, request, organization_id):
        # Strict Manager permission check
        perm = IsOrganizationManager()
        if not perm.has_permission(request, self):
            return Response({'detail': 'Only organization managers may upload documents.'}, status=status.HTTP_403_FORBIDDEN)

        org = get_object_or_404(Organization, id=organization_id)
        serializer = OrganizationDocumentSerializer(data=request.data)
        if serializer.is_valid():
            doc = OrganizationService.upload_document(
                organization=org,
                document_type=serializer.validated_data['document_type'],
                file=serializer.validated_data['file'],
                original_filename=serializer.validated_data.get('original_filename', ''),
                actor=request.user
            )
            return Response(OrganizationDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrganizationDocumentDetailDeleteView(APIView):
    """
    DELETE: Delete a verification document (Manager only, when SETUP_INCOMPLETE or REJECTED).
    Safely scoped by organization_id in URL.
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={204: OpenApiResponse(description="Document Deleted"), 400: OpenApiResponse(description="Document locked")},
        summary="Delete organization verification document (Manager only)"
    )
    def delete(self, request, organization_id, document_id):
        doc = get_object_or_404(
            OrganizationDocument,
            id=document_id,
            organization_id=organization_id
        )
        OrganizationService.delete_document(document=doc, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminOrganizationVerificationQueueView(APIView):
    """
    GET: List system organizations for Admin verification queue.
    Supports filtering by verification_status query parameter.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        responses={200: OrganizationSerializer(many=True)},
        summary="List system organizations for Admin verification queue (Admin only)"
    )
    def get(self, request):
        status_param = request.query_params.get('status') or request.query_params.get('verification_status')
        orgs = Organization.objects.all()
        if status_param:
            orgs = orgs.filter(verification_status=status_param.upper())

        orgs = apply_list_query(
            orgs, request,
            filter_fields=('verification_status', 'is_active'),
            search_fields=('name', 'address', 'email', 'slug'),
            ordering_fields=('created_at', 'verification_submitted_at'),
            default_ordering=('-created_at',),
        )
        return list_response(orgs, OrganizationSerializer, request)


class AdminOrganizationStartReviewView(APIView):
    """
    POST: Admin marks a SUBMITTED organization as UNDER_REVIEW.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        responses={200: OrganizationSerializer, 400: OpenApiResponse(description="Invalid transition")},
        summary="Start reviewing an organization (Admin only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        updated_org = OrganizationService.start_review(organization=org, admin_user=request.user)
        return Response(OrganizationSerializer(updated_org).data, status=status.HTTP_200_OK)


class AdminOrganizationApproveView(APIView):
    """
    POST: Admin approves an UNDER_REVIEW organization.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        responses={200: OrganizationSerializer, 400: OpenApiResponse(description="Invalid transition")},
        summary="Approve an organization (Admin only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        updated_org = OrganizationService.approve_organization(organization=org, admin_user=request.user)
        return Response(OrganizationSerializer(updated_org).data, status=status.HTTP_200_OK)


class AdminOrganizationRejectView(APIView):
    """
    POST: Admin rejects an UNDER_REVIEW organization. Requires mandatory rejection reason.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        request=AdminActionReasonSerializer,
        responses={200: OrganizationSerializer, 400: OpenApiResponse(description="Reason required or invalid transition")},
        summary="Reject an organization (Admin only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        serializer = AdminActionReasonSerializer(data=request.data)
        if serializer.is_valid():
            updated_org = OrganizationService.reject_organization(
                organization=org,
                admin_user=request.user,
                reason=serializer.validated_data['reason']
            )
            return Response(OrganizationSerializer(updated_org).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminOrganizationSuspendView(APIView):
    """
    POST: Admin suspends an APPROVED organization. Requires mandatory suspension reason.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        request=AdminActionReasonSerializer,
        responses={200: OrganizationSerializer, 400: OpenApiResponse(description="Reason required or invalid transition")},
        summary="Suspend an organization (Admin only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        serializer = AdminActionReasonSerializer(data=request.data)
        if serializer.is_valid():
            updated_org = OrganizationService.suspend_organization(
                organization=org,
                admin_user=request.user,
                reason=serializer.validated_data['reason']
            )
            return Response(OrganizationSerializer(updated_org).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminOrganizationUnsuspendView(APIView):
    """
    POST: Admin unsuspends a SUSPENDED organization back to APPROVED.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        responses={200: OrganizationSerializer, 400: OpenApiResponse(description="Invalid transition")},
        summary="Unsuspend an organization (Admin only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        updated_org = OrganizationService.unsuspend_organization(organization=org, admin_user=request.user)
        return Response(OrganizationSerializer(updated_org).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Phase C: OrganizationInvitation Views
# ---------------------------------------------------------------------------

class OrganizationInvitationListCreateView(APIView):
    """
    GET: List all invitations for an organization (Manager only).
    POST: Create a new provider invitation for an email (Manager only).
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={200: OrganizationInvitationSerializer(many=True)},
        summary="List organization invitations (Manager only)"
    )
    def get(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        invitations = OrganizationInvitation.objects.filter(organization=org).order_by('-created_at')
        serializer = OrganizationInvitationSerializer(invitations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=OrganizationInvitationCreateSerializer,
        responses={201: OrganizationInvitationSerializer, 400: OpenApiResponse(description="Validation error")},
        summary="Create provider invitation (Manager only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        serializer = OrganizationInvitationCreateSerializer(data=request.data)
        if serializer.is_valid():
            invitation = OrganizationService.create_provider_invitation(
                organization=org,
                email=serializer.validated_data['email'],
                actor=request.user
            )
            return Response(OrganizationInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrganizationInvitationCancelView(APIView):
    """
    POST: Cancel a pending provider invitation (Manager only).
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={200: OrganizationInvitationSerializer, 400: OpenApiResponse(description="Invalid action")},
        summary="Cancel provider invitation (Manager only)"
    )
    def post(self, request, organization_id, invitation_id):
        invitation = get_object_or_404(
            OrganizationInvitation,
            id=invitation_id,
            organization_id=organization_id
        )
        cancelled = OrganizationService.cancel_invitation(invitation=invitation, actor=request.user)
        return Response(OrganizationInvitationSerializer(cancelled).data, status=status.HTTP_200_OK)


class PublicInvitationDetailsView(APIView):
    """
    GET: Retrieve invitation details by token for public acceptance page.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        responses={200: OrganizationInvitationSerializer, 404: OpenApiResponse(description="Invitation not found or expired")},
        summary="Retrieve provider invitation details (Public)"
    )
    def get(self, request, token):
        invitation = OrganizationService.get_invitation_details(token=token)
        return Response(OrganizationInvitationSerializer(invitation).data, status=status.HTTP_200_OK)


class PublicAcceptInvitationView(APIView):
    """
    POST: Accept a provider invitation by token.
    Creates user account (if new), sets membership and provider profile as APPROVED.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=AcceptInvitationSerializer,
        responses={200: OpenApiResponse(description="Invitation accepted successfully"), 400: OpenApiResponse(description="Validation error")},
        summary="Accept provider invitation (Public)"
    )
    def post(self, request, token):
        serializer = AcceptInvitationSerializer(data=request.data)
        if serializer.is_valid():
            user, membership, profile = OrganizationService.accept_provider_invitation(
                token=token,
                first_name=serializer.validated_data['first_name'],
                last_name=serializer.validated_data['last_name'],
                password=serializer.validated_data['password']
            )
            return Response({
                'message': 'Invitation accepted successfully.',
                'user_id': user.id,
                'email': user.email,
                'organization_id': str(membership.organization_id),
                'membership_id': membership.id,
                'provider_profile_id': str(profile.id),
                'application_status': profile.application_status
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


