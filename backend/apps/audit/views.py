from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organization

from .models import AuditLog
from .permissions import CanViewAuditLogs
from .serializers import AuditLogSerializer
from config.api import apply_list_query, list_response


class AuditLogListView(APIView):
    permission_classes = [IsAuthenticated, CanViewAuditLogs]
    serializer_class = AuditLogSerializer

    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        logs = AuditLog.objects.filter(organization=organization).select_related('actor')
        logs = apply_list_query(
            logs, request,
            filter_fields=('action', 'entity_type', 'actor_id'),
            search_fields=('action', 'entity_type', 'entity_id', 'actor__email'),
            ordering_fields=('created_at', 'action', 'entity_type'),
            default_ordering=('-created_at',),
        )
        return list_response(logs, AuditLogSerializer, request)
