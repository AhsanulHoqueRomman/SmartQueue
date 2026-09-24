from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from config.api import apply_list_query, list_response

from .models import ContactMessage
from .permissions import IsSystemAdmin
from .serializers import (
    AdminContactMessageSerializer,
    AdminContactReplySerializer,
    ContactMessageSerializer,
)
from .throttling import ContactRateThrottle


class ContactMessageCreateView(APIView):
    """
    Public API endpoint to submit a Contact Us inquiry.
    Supports both anonymous visitors and authenticated customers.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ContactRateThrottle]
    serializer_class = ContactMessageSerializer

    @extend_schema(
        request=ContactMessageSerializer,
        responses={
            201: ContactMessageSerializer,
            400: OpenApiResponse(description="Validation Error"),
            429: OpenApiResponse(description="Too Many Requests"),
        },
        summary="Submit a public Contact Us inquiry"
    )
    def post(self, request):
        serializer = ContactMessageSerializer(data=request.data)
        if serializer.is_valid():
            contact_message = serializer.save()
            return Response(
                ContactMessageSerializer(contact_message).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminContactListView(APIView):
    """
    Admin API endpoint to list and search incoming Contact Us inquiries.
    Restricted to system-wide staff or superuser administrators.
    """
    permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]
    serializer_class = AdminContactMessageSerializer

    @extend_schema(
        responses={200: AdminContactMessageSerializer(many=True)},
        summary="List & search Contact Us inquiries (Admin only)"
    )
    def get(self, request):
        queryset = ContactMessage.objects.select_related('replied_by').all()
        
        # Apply filtering, search, and ordering via config.api
        queryset = apply_list_query(
            queryset,
            request,
            filter_fields=('status',),
            search_fields=('name', 'email', 'phone', 'subject', 'message'),
            ordering_fields=('created_at', 'updated_at', 'status'),
            default_ordering=('-created_at',),
        )

        return list_response(queryset, AdminContactMessageSerializer, request)


class AdminContactDetailView(APIView):
    """
    Admin API endpoint to retrieve or update status of a Contact Us inquiry.
    Restricted to system-wide staff or superuser administrators.
    """
    permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]
    serializer_class = AdminContactMessageSerializer

    def _get_message(self, message_id):
        return get_object_or_404(ContactMessage.objects.select_related('replied_by'), id=message_id)

    @extend_schema(
        responses={200: AdminContactMessageSerializer, 404: OpenApiResponse(description="Not Found")},
        summary="Retrieve a Contact Us inquiry detail (Admin only)"
    )
    def get(self, request, message_id):
        message = self._get_message(message_id)
        # Optional helper: if message is NEW, auto-mark IN_REVIEW when opened by admin if requested via query param
        if request.query_params.get('mark_review') == 'true' and message.status == ContactMessage.Status.NEW:
            message.status = ContactMessage.Status.IN_REVIEW
            message.save(update_fields=['status', 'updated_at'])

        return Response(AdminContactMessageSerializer(message).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=AdminContactMessageSerializer,
        responses={
            200: AdminContactMessageSerializer,
            400: OpenApiResponse(description="Validation Error"),
            404: OpenApiResponse(description="Not Found"),
        },
        summary="Update Contact Us inquiry status (Admin only)"
    )
    def patch(self, request, message_id):
        message = self._get_message(message_id)
        serializer = AdminContactMessageSerializer(message, data=request.data, partial=True)
        if serializer.is_valid():
            new_status = serializer.validated_data.get('status')
            if new_status == ContactMessage.Status.REPLIED:
                message.replied_at = timezone.now()
                message.replied_by = request.user
            
            serializer.save()
            return Response(AdminContactMessageSerializer(message).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminContactReplyView(APIView):
    """
    Admin API endpoint to submit a reply to a Contact Us inquiry.
    Sets status = REPLIED, replied_at = now(), replied_by = request.user.
    Does NOT dispatch emails in Phase 3.
    """
    permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]
    serializer_class = AdminContactReplySerializer

    @extend_schema(
        request=AdminContactReplySerializer,
        responses={
            200: AdminContactMessageSerializer,
            400: OpenApiResponse(description="Validation Error"),
            404: OpenApiResponse(description="Not Found"),
        },
        summary="Submit an admin reply to a Contact Us inquiry (Admin only)"
    )
    def post(self, request, message_id):
        message = get_object_or_404(ContactMessage.objects.select_related('replied_by'), id=message_id)
        serializer = AdminContactReplySerializer(data=request.data)
        if serializer.is_valid():
            message.status = ContactMessage.Status.REPLIED
            message.replied_at = timezone.now()
            message.replied_by = request.user
            message.save()
            return Response(
                AdminContactMessageSerializer(message).data,
                status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
