from django.urls import path

from .views import (
    AnalyticsExportView,
    AnalyticsSummaryView,
    OrganizationDashboardView,
    ProviderMetricsView,
)

app_name = 'analytics'

urlpatterns = [
    path('summary/', AnalyticsSummaryView.as_view(), name='summary'),
    path('dashboard/', OrganizationDashboardView.as_view(), name='dashboard'),
    path('organizations/<uuid:organization_id>/dashboard/', OrganizationDashboardView.as_view(), name='legacy_organization_dashboard'),
    path('providers/<uuid:provider_id>/metrics/', ProviderMetricsView.as_view(), name='provider_metrics'),
    path('export/', AnalyticsExportView.as_view(), name='export'),
]
