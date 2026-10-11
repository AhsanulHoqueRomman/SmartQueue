from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import OrganizationMembership
from .models import ProviderProfile, ScheduleChangeRequest
from .schedule_changes import ScheduleChangeService, booking_conflicts


class ProposedDaySerializer(serializers.Serializer):
    day_of_week = serializers.IntegerField(min_value=0, max_value=6)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    is_working_day = serializers.BooleanField()
    breaks = serializers.ListField(child=serializers.DictField(), required=False)


class ScheduleRequestInputSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=ScheduleChangeRequest.Kind.choices)
    effective_date = serializers.DateField()
    reason = serializers.CharField(allow_blank=False)
    proposed_schedule = ProposedDaySerializer(many=True)
    attachment = serializers.FileField(required=False)


class ScheduleRequestSerializer(serializers.ModelSerializer):
    has_attachment = serializers.SerializerMethodField()
    provider_name = serializers.CharField(source='provider.user.get_full_name', read_only=True)
    affected_bookings = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleChangeRequest
        fields = ['id', 'provider_id', 'provider_name', 'kind', 'effective_date', 'reason', 'proposed_schedule', 'current_schedule', 'status', 'decision_reason', 'reviewed_at', 'created_at', 'has_attachment', 'affected_bookings']
        read_only_fields = fields

    def get_has_attachment(self, obj):
        return bool(obj.attachment_name)

    def get_affected_bookings(self, obj):
        return booking_conflicts(obj) if obj.status == 'PENDING' else []


def permitted_provider(request, organization_id, provider_id):
    provider = get_object_or_404(ProviderProfile.objects.select_related('membership__user', 'membership__organization'), pk=provider_id, membership__organization_id=organization_id, membership__role='PROVIDER')
    manager = OrganizationMembership.objects.filter(user=request.user, organization_id=organization_id, role='MANAGER', is_active=True).exists()
    owner = provider.membership.user_id == request.user.pk
    if not (manager or owner):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied()
    return provider


class ScheduleRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, organization_id, provider_id):
        provider = permitted_provider(request, organization_id, provider_id)
        return Response(ScheduleRequestSerializer(provider.schedule_change_requests.all(), many=True).data)

    def post(self, request, organization_id, provider_id):
        provider = permitted_provider(request, organization_id, provider_id)
        # A deep QueryDict copy tries to pickle disk-backed uploaded files.
        # Preserve each uploaded object and the JSON schedule list directly.
        data = {key: request.data.get(key) for key in request.data}
        if isinstance(data.get('proposed_schedule'), str):
            import json
            try:
                data['proposed_schedule'] = json.loads(data['proposed_schedule'])
            except (ValueError, TypeError):
                raise serializers.ValidationError({'proposed_schedule': 'Enter a valid schedule.'})
        serializer = ScheduleRequestInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        proposed = values.pop('proposed_schedule')
        for d in proposed:
            d['start_time'], d['end_time'] = d['start_time'].isoformat(), d['end_time'].isoformat()
        result = ScheduleChangeService.submit(provider=provider, actor=request.user, proposed_schedule=proposed, **values)
        return Response(ScheduleRequestSerializer(result).data, status=201)


class ScheduleRequestReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, organization_id, provider_id, request_id):
        provider = permitted_provider(request, organization_id, provider_id)
        change = get_object_or_404(ScheduleChangeRequest, provider=provider, pk=request_id)
        result = ScheduleChangeService.review(request=change, actor=request.user, decision=request.data.get('decision'), reason=request.data.get('reason', ''))
        return Response(ScheduleRequestSerializer(result).data)


class ScheduleRequestAttachmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, organization_id, provider_id, request_id):
        provider = permitted_provider(request, organization_id, provider_id)
        change = get_object_or_404(ScheduleChangeRequest, provider=provider, pk=request_id, attachment__isnull=False)
        response = HttpResponse(bytes(change.attachment), content_type='application/octet-stream')
        from django.utils.http import content_disposition_header
        response['Content-Disposition'] = content_disposition_header(True, change.attachment_name)
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'no-store'
        return response
