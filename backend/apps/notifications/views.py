from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# pyrefly: ignore [missing-import]
from apps.organizations.models import Organization

from .models import Notification
from .permissions import CanViewNotifications
from .serializers import NotificationSerializer
from .services import NotificationService
from config.api import apply_list_query, list_response


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated, CanViewNotifications]
    serializer_class = NotificationSerializer

    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        notifications = Notification.objects.filter(
            organization=organization, recipient=request.user
        ).select_related('appointment', 'queue_entry')
        notifications = apply_list_query(
            notifications, request,
            filter_fields=('kind', 'read_at'),
            search_fields=('title', 'message'),
            ordering_fields=('created_at', 'read_at', 'kind'),
            default_ordering=('-created_at',),
        )
        return list_response(notifications, NotificationSerializer, request)


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated, CanViewNotifications]
    serializer_class = NotificationSerializer

    def post(self, request, organization_id, notification_id):
        notification = get_object_or_404(
            Notification, id=notification_id, organization_id=organization_id, recipient=request.user
        )
        NotificationService.mark_read(notification=notification)
        return Response(NotificationSerializer(notification).data, status=status.HTTP_200_OK)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated, CanViewNotifications]

    def post(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        updated_count = NotificationService.mark_all_read(recipient=request.user, organization=organization)
        return Response({'status': 'success', 'updated_count': updated_count}, status=status.HTTP_200_OK)
