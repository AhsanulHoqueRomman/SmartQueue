import csv

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organization
from apps.providers.models import ProviderProfile
from apps.queue.models import QueueEntry

from .permissions import CanExportAnalytics, CanViewAnalytics, CanViewProviderMetrics
from .serializers import AnalyticsSummarySerializer, DashboardMetricsSerializer, ProviderMetricsSerializer
from .services import AnalyticsService


class ProviderMetricsView(APIView):
    permission_classes = [IsAuthenticated, CanViewProviderMetrics]

    @extend_schema(
        responses={200: ProviderMetricsSerializer, 403: OpenApiResponse(description='Forbidden'), 404: OpenApiResponse(description='Not Found')},
        summary='Get provider queue metrics',
    )
    def get(self, request, provider_id):
        provider = get_object_or_404(
            ProviderProfile.objects.select_related('membership__user'),
            id=provider_id,
            is_active=True,
            membership__is_active=True,
            membership__role='PROVIDER',
        )
        return Response(ProviderMetricsSerializer(
            AnalyticsService.provider_metrics(provider=provider)
        ).data)


class OrganizationDashboardView(APIView):
    permission_classes = [IsAuthenticated, CanViewAnalytics]

    @extend_schema(
        responses={200: DashboardMetricsSerializer, 403: OpenApiResponse(description='Forbidden'), 404: OpenApiResponse(description='Not Found')},
        summary='Get daily organization dashboard analytics',
    )
    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        return Response(DashboardMetricsSerializer(
            AnalyticsService.organization_dashboard(organization=organization)
        ).data)


class AnalyticsExportView(APIView):
    permission_classes = [IsAuthenticated, CanExportAnalytics]

    @extend_schema(
        parameters=[OpenApiParameter(name='organization_id', type=str, required=True)],
        responses={200: OpenApiResponse(description='CSV analytics export'), 400: OpenApiResponse(description='organization_id is required')},
        summary='Export organization queue analytics as CSV',
    )
    def get(self, request):
        organization_id = request.query_params.get('organization_id')
        if not organization_id:
            return Response({'detail': 'organization_id is required.'}, status=400)
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        entries = QueueEntry.objects.filter(organization=organization).select_related(
            'provider__membership__user', 'appointment__customer', 'appointment__service'
        ).order_by('queue_date', 'token_number')
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{organization.slug}-analytics.csv"'
        writer = csv.writer(response)
        writer.writerow(['queue_date', 'token_number', 'provider', 'customer', 'service', 'status', 'created_at', 'called_at', 'completed_at'])
        for entry in entries:
            writer.writerow([
                entry.queue_date, entry.token_number,
                entry.provider.membership.user.get_full_name(),
                entry.appointment.customer.email, entry.appointment.service.name,
                entry.status, entry.created_at, entry.called_at, entry.completed_at,
            ])
        return response


class AnalyticsSummaryView(APIView):
    permission_classes = [IsAuthenticated, CanViewAnalytics]

    @extend_schema(
        responses={200: AnalyticsSummarySerializer, 403: OpenApiResponse(description='Manager or admin only'), 404: OpenApiResponse(description='Not Found')},
        summary='Get organization appointment and queue analytics',
    )
    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id, is_active=True)
        return Response(AnalyticsSummarySerializer(
            AnalyticsService.organization_summary(organization=organization)
        ).data)
