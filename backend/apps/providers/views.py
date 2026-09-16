from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiResponse

from apps.organizations.models import Organization, OrganizationMembership
from apps.organizations.permissions import IsOrganizationManager
from .models import ProviderProfile, ProviderDocument, WeeklySchedule, ScheduleBreak, ProviderLeave
from .permissions import IsOrganizationManagerOrOwnProvider
from .serializers import (
    ProviderProfileSerializer,
    ProviderProfileCreateSerializer,
    ProviderProfileUpdateSerializer,
    ProviderDocumentSerializer,
    ProviderApplicationReviewSerializer,
    ProviderDocumentReviewSerializer,
    ProviderServiceSerializer,
    ProviderServiceCreateSerializer,
    WeeklyScheduleSerializer,
    WeeklyScheduleCreateUpdateSerializer,
    ScheduleBreakSerializer,
    ProviderLeaveSerializer,
)
from .services import ProviderService_ as ProviderBizService
from config.api import apply_list_query, list_response


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_org(organization_id):
    return get_object_or_404(Organization, id=organization_id, is_active=True)


def _get_provider(organization_id, provider_id, require_active_membership=True):
    org = _get_org(organization_id)
    kwargs = {
        'id': provider_id,
        'membership__organization': org,
        'membership__role': OrganizationMembership.Role.PROVIDER,
    }
    if require_active_membership:
        kwargs['membership__is_active'] = True
    return get_object_or_404(ProviderProfile, **kwargs)


from rest_framework.permissions import AllowAny, IsAuthenticated

def _is_org_manager_or_admin(user, organization_id):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=organization_id,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    ).exists()


# ---------------------------------------------------------------------------
# ProviderProfile CRUD
# ---------------------------------------------------------------------------

class ProviderProfileListCreateView(APIView):
    """
    GET  — List provider profiles.
          Managers/admins see all; everyone else sees active profiles only.
          Authenticated customers/non-members/guests may discover active providers.
    POST — Create a provider profile from an existing PROVIDER membership (Manager only).
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManager()]
        return [AllowAny()]

    @extend_schema(
        responses={200: ProviderProfileSerializer(many=True)},
        summary="List provider profiles for an organization"
    )
    def get(self, request, organization_id):
        org = _get_org(organization_id)
        if _is_org_manager_or_admin(request.user, organization_id):
            profiles = ProviderProfile.objects.filter(
                membership__organization=org,
                membership__role=OrganizationMembership.Role.PROVIDER,
            ).select_related('membership__user', 'membership__organization')
        else:
            profiles = ProviderProfile.objects.filter(
                membership__organization=org,
                membership__is_active=True,
                membership__role=OrganizationMembership.Role.PROVIDER,
                is_active=True,
                application_status=ProviderProfile.ApplicationStatus.APPROVED
            ).select_related('membership__user', 'membership__organization')
        profiles = apply_list_query(
            profiles, request,
            filter_fields=('is_active',),
            search_fields=('title', 'bio', 'membership__user__email', 'membership__user__first_name', 'membership__user__last_name'),
            ordering_fields=('title', 'created_at', 'updated_at'),
            default_ordering=('title', 'created_at'),
        )
        return list_response(profiles, ProviderProfileSerializer, request)

    @extend_schema(
        request=ProviderProfileCreateSerializer,
        responses={
            201: ProviderProfileSerializer,
            400: OpenApiResponse(description="Validation / Role Error"),
            403: OpenApiResponse(description="Forbidden — Manager only"),
            409: OpenApiResponse(description="Profile already exists"),
        },
        summary="Create a provider profile (Manager only)"
    )
    def post(self, request, organization_id):
        org = _get_org(organization_id)
        serializer = ProviderProfileCreateSerializer(data=request.data)
        if serializer.is_valid():
            profile = ProviderBizService.create_provider_profile(
                organization=org,
                **serializer.validated_data
            )
            return Response(
                ProviderProfileSerializer(profile).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProviderProfileDetailView(APIView):
    """
    GET   — Retrieve a provider profile (authenticated/guest; inactive hidden from non-managers).
    PATCH — Update bio, title, is_active (Manager, or the owning Provider).
    DELETE — Remove provider profile (Manager only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        if self.request.method == 'PATCH':
            return [IsAuthenticated(), IsOrganizationManagerOrOwnProvider()]
        return [IsAuthenticated(), IsOrganizationManager()]

    @extend_schema(
        responses={200: ProviderProfileSerializer, 404: OpenApiResponse(description="Not Found")},
        summary="Retrieve a provider profile"
    )
    def get(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        if not profile.is_active and not _is_org_manager_or_admin(request.user, organization_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ProviderProfileSerializer(profile).data)

    @extend_schema(
        request=ProviderProfileUpdateSerializer,
        responses={
            200: ProviderProfileSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
        },
        summary="Update a provider profile (Manager or owning Provider)"
    )
    def patch(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        serializer = ProviderProfileUpdateSerializer(data=request.data, partial=True)
        if serializer.is_valid():
            updated = ProviderBizService.update_provider_profile(
                profile=profile,
                **serializer.validated_data
            )
            return Response(ProviderProfileSerializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        responses={204: OpenApiResponse(description="Deleted"), 403: OpenApiResponse(description="Forbidden")},
        summary="Delete a provider profile (Manager only)"
    )
    def delete(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        profile.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# ProviderService (Service assignments)
# ---------------------------------------------------------------------------

class ProviderServiceListCreateView(APIView):
    """
    GET  — List services assigned to a provider (any authenticated user for discovery).
    POST — Assign a service to a provider (Manager only).
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManager()]
        return [IsAuthenticated()]

    @extend_schema(
        responses={200: ProviderServiceSerializer(many=True)},
        summary="List services assigned to a provider"
    )
    def get(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        if not profile.is_active and not _is_org_manager_or_admin(request.user, organization_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        assignments = profile.provider_services.select_related('service').all()
        return Response(ProviderServiceSerializer(assignments, many=True).data)

    @extend_schema(
        request=ProviderServiceCreateSerializer,
        responses={
            201: ProviderServiceSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
            404: OpenApiResponse(description="Service Not Found"),
            409: OpenApiResponse(description="Duplicate or org mismatch"),
        },
        summary="Assign a service to a provider (Manager only)"
    )
    def post(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        serializer = ProviderServiceCreateSerializer(data=request.data)
        if serializer.is_valid():
            ps = ProviderBizService.assign_service_to_provider(
                provider=profile,
                service_id=serializer.validated_data['service_id'],
                custom_duration_minutes=serializer.validated_data.get('custom_duration_minutes'),
                custom_price=serializer.validated_data.get('custom_price'),
            )
            return Response(ProviderServiceSerializer(ps).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProviderServiceDetailView(APIView):
    """DELETE — Remove a service assignment (Manager only)."""
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        responses={204: OpenApiResponse(description="Deleted"), 404: OpenApiResponse(description="Not Found")},
        summary="Remove a service assignment from a provider (Manager only)"
    )
    def delete(self, request, organization_id, provider_id, provider_service_id):
        profile = _get_provider(organization_id, provider_id)
        ProviderBizService.remove_service_from_provider(
            provider=profile,
            provider_service_id=provider_service_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# WeeklySchedule
# ---------------------------------------------------------------------------

class WeeklyScheduleListCreateView(APIView):
    """
    GET  — List weekly schedules for a provider (authenticated).
    POST — Upsert (create or update) a day's schedule (Manager or owning Provider).
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManagerOrOwnProvider()]
        return [IsAuthenticated()]

    @extend_schema(
        responses={200: WeeklyScheduleSerializer(many=True)},
        summary="List weekly schedules for a provider"
    )
    def get(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        if not profile.is_active and not _is_org_manager_or_admin(request.user, organization_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        schedules = profile.weekly_schedules.prefetch_related('breaks').all()
        return Response(WeeklyScheduleSerializer(schedules, many=True).data)

    @extend_schema(
        request=WeeklyScheduleCreateUpdateSerializer,
        responses={
            200: WeeklyScheduleSerializer,
            201: WeeklyScheduleSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
        },
        summary="Set (upsert) a weekly schedule day (Manager or owning Provider)"
    )
    def post(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        serializer = WeeklyScheduleCreateUpdateSerializer(data=request.data)
        if serializer.is_valid():
            schedule, created = ProviderBizService.create_or_update_schedule(
                provider=profile,
                **serializer.validated_data
            )
            resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
            return Response(WeeklyScheduleSerializer(schedule).data, status=resp_status)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# ScheduleBreak
# ---------------------------------------------------------------------------

class ScheduleBreakListCreateView(APIView):
    """
    GET  — List breaks for a schedule day (authenticated).
    POST — Add a break to a schedule day (Manager or owning Provider).
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManagerOrOwnProvider()]
        return [IsAuthenticated()]

    def _get_schedule(self, organization_id, provider_id, schedule_id):
        profile = _get_provider(organization_id, provider_id)
        return get_object_or_404(WeeklySchedule, id=schedule_id, provider=profile)

    @extend_schema(
        responses={200: ScheduleBreakSerializer(many=True)},
        summary="List breaks for a weekly schedule entry"
    )
    def get(self, request, organization_id, provider_id, schedule_id):
        schedule = self._get_schedule(organization_id, provider_id, schedule_id)
        if (
            not schedule.provider.is_active
            and not _is_org_manager_or_admin(request.user, organization_id)
        ):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ScheduleBreakSerializer(schedule.breaks.all(), many=True).data)

    @extend_schema(
        request=ScheduleBreakSerializer,
        responses={
            201: ScheduleBreakSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
            409: OpenApiResponse(description="Break overlap"),
        },
        summary="Add a break to a weekly schedule entry (Manager or owning Provider)"
    )
    def post(self, request, organization_id, provider_id, schedule_id):
        schedule = self._get_schedule(organization_id, provider_id, schedule_id)
        serializer = ScheduleBreakSerializer(data=request.data)
        if serializer.is_valid():
            brk = ProviderBizService.add_break(weekly_schedule=schedule, **serializer.validated_data)
            return Response(ScheduleBreakSerializer(brk).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ScheduleBreakDetailView(APIView):
    """DELETE — Remove a break (Manager or owning Provider)."""
    permission_classes = [IsAuthenticated, IsOrganizationManagerOrOwnProvider]

    @extend_schema(
        responses={204: OpenApiResponse(description="Deleted")},
        summary="Delete a schedule break (Manager or owning Provider)"
    )
    def delete(self, request, organization_id, provider_id, schedule_id, break_id):
        profile = _get_provider(organization_id, provider_id)
        schedule = get_object_or_404(WeeklySchedule, id=schedule_id, provider=profile)
        brk = get_object_or_404(ScheduleBreak, id=break_id, weekly_schedule=schedule)
        brk.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# ProviderLeave
# ---------------------------------------------------------------------------

class ProviderLeaveListCreateView(APIView):
    """
    GET  — List leaves for a provider (authenticated).
    POST — Record a leave period (Manager or owning Provider).
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManagerOrOwnProvider()]
        return [IsAuthenticated()]

    @extend_schema(
        responses={200: ProviderLeaveSerializer(many=True)},
        summary="List leave periods for a provider"
    )
    def get(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        if not profile.is_active and not _is_org_manager_or_admin(request.user, organization_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        leaves = profile.leaves.all()
        return Response(ProviderLeaveSerializer(leaves, many=True).data)

    @extend_schema(
        request=ProviderLeaveSerializer,
        responses={
            201: ProviderLeaveSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
        },
        summary="Record a leave period for a provider (Manager or owning Provider)"
    )
    def post(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id)
        serializer = ProviderLeaveSerializer(data=request.data)
        if serializer.is_valid():
            leave = ProviderBizService.create_leave(provider=profile, **serializer.validated_data)
            return Response(ProviderLeaveSerializer(leave).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProviderLeaveDetailView(APIView):
    """DELETE — Cancel/remove a leave record (Manager or owning Provider)."""
    permission_classes = [IsAuthenticated, IsOrganizationManagerOrOwnProvider]

    @extend_schema(
        responses={204: OpenApiResponse(description="Deleted")},
        summary="Delete a provider leave record (Manager or owning Provider)"
    )
    def delete(self, request, organization_id, provider_id, leave_id):
        profile = _get_provider(organization_id, provider_id)
        leave = get_object_or_404(ProviderLeave, id=leave_id, provider=profile)
        leave.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Phase C: Provider Application & Document Review Views
# ---------------------------------------------------------------------------

class ProviderApplicationSubmitView(APIView):
    """
    POST: Provider submits their application for Manager review.
    """
    permission_classes = [IsAuthenticated, IsOrganizationManagerOrOwnProvider]

    @extend_schema(
        responses={200: ProviderProfileSerializer, 400: OpenApiResponse(description="Invalid transition")},
        summary="Submit provider application for Manager review"
    )
    def post(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id, require_active_membership=False)
        submitted = ProviderBizService.submit_application(provider_profile=profile, actor=request.user)
        return Response(ProviderProfileSerializer(submitted).data, status=status.HTTP_200_OK)


class ManagerProviderApplicationReviewView(APIView):
    """
    POST: Manager approves or rejects a provider application.
    Action: APPROVE or REJECT (with mandatory reason if REJECT).
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        request=ProviderApplicationReviewSerializer,
        responses={200: ProviderProfileSerializer, 400: OpenApiResponse(description="Validation or State error")},
        summary="Approve or Reject provider application (Manager only)"
    )
    def post(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id, require_active_membership=False)
        serializer = ProviderApplicationReviewSerializer(data=request.data)
        if serializer.is_valid():
            action = serializer.validated_data['action']
            if action == 'APPROVE':
                updated = ProviderBizService.approve_application(provider_profile=profile, manager_user=request.user)
            else:
                updated = ProviderBizService.reject_application(
                    provider_profile=profile,
                    manager_user=request.user,
                    reason=serializer.validated_data['reason']
                )
            return Response(ProviderProfileSerializer(updated).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProviderDocumentUploadView(APIView):
    """
    GET: List verification documents uploaded by provider.
    POST: Upload a verification document (Provider or Manager).
    """
    permission_classes = [IsAuthenticated, IsOrganizationManagerOrOwnProvider]

    @extend_schema(
        responses={200: ProviderDocumentSerializer(many=True)},
        summary="List provider verification documents"
    )
    def get(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id, require_active_membership=False)
        docs = ProviderDocument.objects.filter(provider=profile)
        serializer = ProviderDocumentSerializer(docs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=ProviderDocumentSerializer,
        responses={201: ProviderDocumentSerializer, 400: OpenApiResponse(description="Validation error")},
        summary="Upload provider verification document"
    )
    def post(self, request, organization_id, provider_id):
        profile = _get_provider(organization_id, provider_id, require_active_membership=False)
        serializer = ProviderDocumentSerializer(data=request.data)
        if serializer.is_valid():
            doc = ProviderDocument.objects.create(
                provider=profile,
                document_type=serializer.validated_data['document_type'],
                file=serializer.validated_data['file'],
                original_filename=serializer.validated_data.get('original_filename', ''),
                status=ProviderDocument.Status.PENDING
            )
            return Response(ProviderDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ManagerProviderDocumentReviewView(APIView):
    """
    POST: Manager reviews a provider document (APPROVE or REJECT with mandatory reason).
    """
    permission_classes = [IsAuthenticated, IsOrganizationManager]

    @extend_schema(
        request=ProviderDocumentReviewSerializer,
        responses={200: ProviderDocumentSerializer, 400: OpenApiResponse(description="Validation error")},
        summary="Review provider document (Manager only)"
    )
    def post(self, request, organization_id, provider_id, document_id):
        profile = _get_provider(organization_id, provider_id, require_active_membership=False)
        doc = get_object_or_404(ProviderDocument, id=document_id, provider=profile)
        serializer = ProviderDocumentReviewSerializer(data=request.data)
        if serializer.is_valid():
            reviewed = ProviderBizService.review_provider_document(
                document=doc,
                status=serializer.validated_data['status'],
                reviewer_user=request.user,
                rejection_reason=serializer.validated_data.get('rejection_reason', '')
            )
            return Response(ProviderDocumentSerializer(reviewed).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


