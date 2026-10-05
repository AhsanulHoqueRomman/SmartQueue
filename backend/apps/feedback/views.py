from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.appointments.models import Appointment
from apps.organizations.models import Organization, OrganizationMembership

from .models import Review
from .permissions import CanReviewAppointment, CanViewOrganizationReviews
from .serializers import ReviewCreateSerializer, ReviewSerializer, PublicReviewSerializer
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
    """
    GET: Return reviews for organization.
         Public / customer users receive privacy-safe PublicReviewSerializer.
         Managers and staff receive full ReviewSerializer.
    """
    permission_classes = [AllowAny]
    serializer_class = ReviewSerializer

    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        reviews = organization.reviews.select_related('customer', 'provider', 'appointment', 'appointment__service').all()

        is_internal = False
        if request.user.is_authenticated:
            if request.user.is_staff or request.user.is_superuser:
                is_internal = True
            else:
                membership = OrganizationMembership.objects.filter(
                    user=request.user, organization=organization, is_active=True,
                ).first()
                if membership and membership.role in (OrganizationMembership.Role.MANAGER, OrganizationMembership.Role.STAFF):
                    is_internal = True
                elif membership and membership.role == OrganizationMembership.Role.PROVIDER:
                    reviews = reviews.filter(provider__membership=membership)
                    is_internal = True

        target_serializer = ReviewSerializer if is_internal else PublicReviewSerializer

        reviews = apply_list_query(
            reviews, request,
            filter_fields=('rating', 'provider_id'),
            search_fields=('comment', 'customer__email', 'provider__membership__user__email') if is_internal else ('comment',),
            ordering_fields=('rating', 'created_at', 'updated_at'),
            default_ordering=('-created_at',),
        )
        return list_response(reviews, target_serializer, request)



class CustomerMyReviewsView(APIView):
    """
    GET /api/v1/customer/reviews/
    Lists all reviews created by the authenticated customer across all organizations.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ReviewSerializer

    def get(self, request):
        reviews = Review.objects.filter(customer=request.user).select_related(
            'organization', 'customer', 'provider', 'provider__membership__user', 'appointment', 'appointment__service'
        )
        reviews = apply_list_query(
            reviews, request,
            filter_fields=('rating', 'organization_id', 'provider_id'),
            search_fields=('comment', 'organization__name'),
            ordering_fields=('rating', 'created_at', 'updated_at'),
            default_ordering=('-created_at',),
        )
        return list_response(reviews, ReviewSerializer, request)
