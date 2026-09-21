from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organization

from .models import QueueEntry
from .permissions import CanActOnQueueEntry, CanManageProviderQueue, CanViewOwnQueue
from .serializers import QueueDateQuerySerializer, QueueEntrySerializer
from .services import InvalidQueueDateException, QueueService
from config.api import apply_list_query, list_response


def _organization(organization_id):
    return get_object_or_404(Organization, id=organization_id, is_active=True)


def _requested_date(request):
    serializer = QueueDateQuerySerializer(data=request.query_params)
    if not serializer.is_valid():
        raise InvalidQueueDateException()
    return serializer.validated_data.get('date')


def _entry_for_org(organization_id, queue_entry_id):
    return get_object_or_404(
        QueueEntry.objects.select_related(
            'appointment', 'appointment__customer', 'appointment__service', 'provider'
        ),
        id=queue_entry_id,
        organization_id=organization_id,
    )


class ProviderQueueListView(APIView):
    permission_classes = [IsAuthenticated, CanManageProviderQueue]
    serializer_class = QueueEntrySerializer

    def get(self, request, organization_id, provider_id):
        on_date = _requested_date(request)
        _, queue_date, entries = QueueService.list_provider_queue(
            organization_id=organization_id,
            provider_id=provider_id,
            on_date=on_date,
        )
        return Response({
            'queue_date': queue_date,
            'entries': QueueEntrySerializer(entries, many=True).data,
        })


class MyQueueListView(APIView):
    permission_classes = [IsAuthenticated, CanViewOwnQueue]
    serializer_class = QueueEntrySerializer

    def get(self, request, organization_id):
        organization = _organization(organization_id)
        on_date = _requested_date(request)
        entries = QueueEntry.objects.filter(
            organization=organization,
            appointment__customer=request.user,
        ).select_related(
            'appointment', 'appointment__customer', 'appointment__service', 'provider'
        ).order_by('queue_date', 'token_number')
        if on_date is not None:
            entries = entries.filter(queue_date=on_date)
        entries = apply_list_query(
            entries, request,
            filter_fields=('status', 'provider_id'),
            search_fields=('appointment__customer__email', 'appointment__service__name'),
            ordering_fields=('queue_date', 'token_number', 'status', 'created_at'),
            default_ordering=('queue_date', 'token_number'),
        )
        return list_response(entries, QueueEntrySerializer, request)


class CallNextQueueView(APIView):
    permission_classes = [IsAuthenticated, CanManageProviderQueue]
    serializer_class = QueueEntrySerializer

    def post(self, request, organization_id, provider_id):
        entry = QueueService.call_next(
            organization_id=organization_id,
            provider_id=provider_id,
            on_date=_requested_date(request),
            actor=request.user,
        )
        return Response(QueueEntrySerializer(entry).data, status=status.HTTP_200_OK)


class _QueueEntryActionView(APIView):
    permission_classes = [IsAuthenticated, CanActOnQueueEntry]
    serializer_class = QueueEntrySerializer
    handler = None

    def post(self, request, organization_id, queue_entry_id):
        entry = _entry_for_org(organization_id, queue_entry_id)
        permission = CanActOnQueueEntry()
        if not permission.has_object_permission(request, self, entry):
            return Response(status=status.HTTP_403_FORBIDDEN)
        updated = self.handler(
            organization_id=organization_id,
            queue_entry_id=queue_entry_id,
            actor=request.user,
        )
        return Response(QueueEntrySerializer(updated).data)


class StartQueueEntryView(_QueueEntryActionView):
    handler = QueueService.start_queue_entry


class CompleteQueueEntryView(_QueueEntryActionView):
    handler = QueueService.complete_queue_entry


class SkipQueueEntryView(_QueueEntryActionView):
    handler = QueueService.skip_queue_entry


class WalkInRegisterView(APIView):
    permission_classes = [IsAuthenticated, CanManageProviderQueue]
    serializer_class = QueueEntrySerializer

    def post(self, request, organization_id, provider_id):
        from .serializers import WalkInRegisterSerializer
        serializer = WalkInRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        appt = QueueService.register_walk_in(
            organization_id=organization_id,
            provider_id=provider_id,
            service_id=serializer.validated_data['service_id'],
            first_name=serializer.validated_data['first_name'],
            last_name=serializer.validated_data['last_name'],
            phone_number=serializer.validated_data.get('phone_number', ''),
            notes=serializer.validated_data.get('notes', ''),
            actor=request.user,
        )
        queue_entry = getattr(appt, 'queue_entry', None) or QueueEntry.objects.filter(appointment=appt).first()
        return Response(QueueEntrySerializer(queue_entry).data, status=status.HTTP_201_CREATED)


class MarkUrgentQueueView(APIView):
    permission_classes = [IsAuthenticated, CanActOnQueueEntry]
    serializer_class = QueueEntrySerializer

    def post(self, request, organization_id, queue_entry_id):
        from .serializers import MarkUrgentSerializer
        entry = _entry_for_org(organization_id, queue_entry_id)
        permission = CanActOnQueueEntry()
        if not permission.has_object_permission(request, self, entry):
            return Response(status=status.HTTP_403_FORBIDDEN)
        
        serializer = MarkUrgentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated = QueueService.mark_urgent(
            organization_id=organization_id,
            queue_entry_id=queue_entry_id,
            reason=serializer.validated_data.get('reason', ''),
            actor=request.user,
        )
        return Response(QueueEntrySerializer(updated).data)
