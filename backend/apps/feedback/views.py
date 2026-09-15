from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.appointments.models import Appointment
from apps.organizations.models import Organization, OrganizationMembership

from .models import Review
from .permissions import CanReviewAppointment, CanViewOrganizationReviews
from .serializers import ReviewCreateSerializer, ReviewSerializer
from .services import ReviewService
from config.api import apply_list_query, list_response


class AppointmentReviewView(APIView):
    permission_classes = [IsAuthenticated, CanReviewAppointment]
    serializer_class = ReviewSerializer

    def _appointment(self, organization_id, appointment_id):
        return get_object_or_404(Appointment, id=appointment_id, organization_id=organization_id)

    def get(self, request, organization_id, appointment_id):
        appointment = self._appointment(organization_id, appointment_id)
        review = get_object_or_404(Review, appointment=appointment)
        permission = CanReviewAppointment()
        if not permission.has_object_permission(request, self, appointment):
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(ReviewSerializer(review).data)

    def post(self, request, organization_id, appointment_id):
        appointment = self._appointment(organization_id, appointment_id)
        if appointment.customer_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = ReviewService.create_review(
            appointment=appointment, customer=request.user, **serializer.validated_data
        )
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class OrganizationReviewListView(APIView):
    permission_classes = [IsAuthenticated, CanViewOrganizationReviews]
    serializer_class = ReviewSerializer

    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        reviews = organization.reviews.select_related('customer', 'provider', 'appointment').all()
        membership = OrganizationMembership.objects.filter(
            user=request.user, organization=organization, is_active=True,
        ).first()
        if membership and membership.role == OrganizationMembership.Role.PROVIDER:
            reviews = reviews.filter(provider__membership=membership)
        reviews = apply_list_query(
            reviews, request,
            filter_fields=('rating', 'provider_id'),
            search_fields=('comment', 'customer__email', 'provider__membership__user__email'),
            ordering_fields=('rating', 'created_at', 'updated_at'),
            default_ordering=('-created_at',),
        )
        return list_response(reviews, ReviewSerializer, request)
