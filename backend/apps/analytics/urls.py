from django.urls import path

from .views import AnalyticsSummaryView

app_name = 'analytics'
from .views import AnalyticsExportView, OrganizationDashboardView, ProviderMetricsView

urlpatterns = [
    path('summary/', AnalyticsSummaryView.as_view(), name='summary'),
    path('providers/<uuid:provider_id>/metrics/', ProviderMetricsView.as_view(), name='provider_metrics'),
    path('organizations/<uuid:organization_id>/dashboard/', OrganizationDashboardView.as_view(), name='organization_dashboard'),
    path('export/', AnalyticsExportView.as_view(), name='export'),
]
