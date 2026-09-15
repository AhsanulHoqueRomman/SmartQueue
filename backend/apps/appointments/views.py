from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.organizations.models import Organization
from .models import Appointment
from .permissions import (
    CanQueryAvailability,
    CanCreateAppointment,
    CanAccessOrganizationAppointments,
    CanCancelOrRescheduleAppointment,
    CanCheckInAppointment,
    filter_appointments_for_user,
    _is_org_manager,
    _is_org_staff,
    _is_admin,
)
from .serializers import (
    AppointmentSerializer,
    AppointmentListSerializer,
    AppointmentCreateSerializer,
    AppointmentRescheduleSerializer,
    AppointmentCancelSerializer,
    AvailabilityQuerySerializer,
    AvailabilityResponseSerializer,
)
from .services import AppointmentService, AppointmentAvailabilityService
from apps.queue.services import QueueService
from config.api import apply_list_query, list_response


def _get_org(organization_id):
    return get_object_or_404(Organization, id=organization_id, is_active=True)


def _get_appointment(organization_id, appointment_id):
    org = _get_org(organization_id)
    return get_object_or_404(Appointment, id=appointment_id, organization=org)


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

from rest_framework.permissions import AllowAny, IsAuthenticated

class ProviderAvailabilityView(APIView):
    """
    GET /api/v1/organizations/{organization_id}/providers/{provider_id}/availability/
        ?service_id=<uuid>&date=YYYY-MM-DD
    """
    permission_classes = [AllowAny, CanQueryAvailability]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='service_id', type=str, location=OpenApiParameter.QUERY, required=True,
                description='Service UUID',
            ),
            OpenApiParameter(
                name='date', type=str, location=OpenApiParameter.QUERY, required=True,
                description='Date in YYYY-MM-DD',
            ),
        ],
        responses={
            200: AvailabilityResponseSerializer,
            400: OpenApiResponse(description='Validation Error'),
            404: OpenApiResponse(description='Not Found'),
        },
        summary='Get available appointment slots for a provider/service/date',
    )
    def get(self, request, organization_id, provider_id):
        query = AvailabilityQuerySerializer(data=request.query_params)
        if not query.is_valid():
            return Response(query.errors, status=status.HTTP_400_BAD_REQUEST)

        result = AppointmentAvailabilityService.get_available_slots(
            organization_id=organization_id,
            provider_id=provider_id,
            service_id=query.validated_data['service_id'],
            on_date=query.validated_data['date'],
        )
        return Response(result, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Appointment list / create
# ---------------------------------------------------------------------------

class AppointmentListCreateView(APIView):
    """
    GET  — List appointments visible to the requester within the organization.
    POST — Book an appointment as request.user (customer = authenticated user).
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), CanCreateAppointment()]
        return [IsAuthenticated(), CanAccessOrganizationAppointments()]

    @extend_schema(
        responses={200: AppointmentListSerializer(many=True)},
        summary='List appointments for an organization (scoped by role)',
    )
    def get(self, request, organization_id):
        org = _get_org(organization_id)
        qs = Appointment.objects.filter(organization=org).select_related(
            'customer', 'provider', 'service', 'organization'
        )
        qs = filter_appointments_for_user(qs, request.user, organization_id)
        qs = apply_list_query(
            qs, request,
            filter_fields=('status', 'provider_id', 'customer_id'),
            search_fields=(
                'customer__email', 'service__name',
                'provider__membership__user__email',
                'provider__membership__user__first_name',
                'provider__membership__user__last_name',
            ),
            ordering_fields=('start_datetime', 'end_datetime', 'status', 'created_at'),
            default_ordering=('start_datetime',),
        )
        response = list_response(qs, AppointmentListSerializer, request)
        response.status_code = status.HTTP_200_OK
        return response

    @extend_schema(
        request=AppointmentCreateSerializer,
        responses={
            201: AppointmentSerializer,
            400: OpenApiResponse(description='Validation Error'),
            403: OpenApiResponse(description='Forbidden'),
            404: OpenApiResponse(description='Not Found'),
            409: OpenApiResponse(description='DOUBLE_BOOKING_CONFLICT'),
        },
        summary='Book an appointment (customer = authenticated user)',
    )
    def post(self, request, organization_id):
        serializer = AppointmentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        appointment = AppointmentService.book_appointment(
            organization_id=organization_id,
            customer=request.user,
            provider_id=serializer.validated_data['provider_id'],
            service_id=serializer.validated_data['service_id'],
            start_datetime=serializer.validated_data['start_datetime'],
            notes=serializer.validated_data.get('notes', ''),
        )
        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Appointment detail / reschedule
# ---------------------------------------------------------------------------

class AppointmentDetailView(APIView):
    """
    GET   — Retrieve an appointment (tenant + role scoped).
    PATCH — Reschedule (new start_datetime only).
    """

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAuthenticated(), CanCancelOrRescheduleAppointment()]
        return [IsAuthenticated(), CanAccessOrganizationAppointments()]

    def _check_object(self, request, appointment):
        for perm in self.get_permissions():
            if hasattr(perm, 'has_object_permission'):
                if not perm.has_object_permission(request, self, appointment):
                    return False
        return True

    @extend_schema(
        responses={
            200: AppointmentSerializer,
            403: OpenApiResponse(description='Forbidden'),
            404: OpenApiResponse(description='Not Found'),
        },
        summary='Retrieve an appointment',
    )
    def get(self, request, organization_id, appointment_id):
        appointment = _get_appointment(organization_id, appointment_id)
        if not self._check_object(request, appointment):
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(AppointmentSerializer(appointment).data)

    @extend_schema(
        request=AppointmentRescheduleSerializer,
        responses={
            200: AppointmentSerializer,
            400: OpenApiResponse(description='Validation Error'),
            403: OpenApiResponse(description='Forbidden'),
            404: OpenApiResponse(description='Not Found'),
            409: OpenApiResponse(description='DOUBLE_BOOKING_CONFLICT'),
        },
        summary='Reschedule an appointment (recalculates end_datetime)',
    )
    def patch(self, request, organization_id, appointment_id):
        appointment = _get_appointment(organization_id, appointment_id)
        if not self._check_object(request, appointment):
            return Response(status=status.HTTP_403_FORBIDDEN)

        # Only the customer (owner), manager, staff, or admin may reschedule.
        # Providers who are not the customer cannot reschedule someone else's booking.
        org_id = organization_id
        if not (
            _is_admin(request.user)
            or _is_org_manager(request.user, org_id)
            or _is_org_staff(request.user, org_id)
            or appointment.customer_id == request.user.id
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = AppointmentRescheduleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated = AppointmentService.reschedule_appointment(
            appointment=appointment,
            start_datetime=serializer.validated_data['start_datetime'],
        )
        return Response(AppointmentSerializer(updated).data)


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------

class AppointmentCancelView(APIView):
    """POST — Cancel an appointment."""
    permission_classes = [IsAuthenticated, CanCancelOrRescheduleAppointment]

    @extend_schema(
        request=AppointmentCancelSerializer,
        responses={
            200: AppointmentSerializer,
            400: OpenApiResponse(description='Not cancellable'),
            403: OpenApiResponse(description='Forbidden'),
            404: OpenApiResponse(description='Not Found'),
        },
        summary='Cancel an appointment',
    )
    def post(self, request, organization_id, appointment_id):
        appointment = _get_appointment(organization_id, appointment_id)
        perm = CanCancelOrRescheduleAppointment()
        if not perm.has_object_permission(request, self, appointment):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = AppointmentCancelSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated = AppointmentService.cancel_appointment(
            appointment=appointment,
            reason=serializer.validated_data.get('cancellation_reason', ''),
            actor=request.user,
        )
        return Response(AppointmentSerializer(updated).data)


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------

class AppointmentCheckInView(APIView):
    """POST — CONFIRMED -> CHECKED_IN and create a WAITING queue entry."""
    permission_classes = [IsAuthenticated, CanCheckInAppointment]

    @extend_schema(
        request=None,
        responses={
            200: AppointmentSerializer,
            400: OpenApiResponse(description='Invalid transition'),
            403: OpenApiResponse(description='Forbidden'),
            404: OpenApiResponse(description='Not Found'),
        },
        summary='Check in an appointment and add it to the queue',
    )
    def post(self, request, organization_id, appointment_id):
        appointment = _get_appointment(organization_id, appointment_id)
        perm = CanCheckInAppointment()
        if not perm.has_object_permission(request, self, appointment):
            return Response(status=status.HTTP_403_FORBIDDEN)

        entry = QueueService.check_in_appointment(appointment=appointment, actor=request.user)
        return Response(AppointmentSerializer(entry.appointment).data)
