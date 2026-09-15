from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/organizations/', include('apps.organizations.urls')),
    path('api/v1/organizations/<uuid:organization_id>/services/', include('apps.services.urls')),
    path('api/v1/organizations/<uuid:organization_id>/providers/', include('apps.providers.urls')),
    path('api/v1/organizations/<uuid:organization_id>/appointments/', include('apps.appointments.urls')),
    path('api/v1/organizations/<uuid:organization_id>/queue/', include('apps.queue.urls')),
    path('api/v1/organizations/<uuid:organization_id>/reviews/', include('apps.feedback.urls')),
    path('api/v1/organizations/<uuid:organization_id>/notifications/', include('apps.notifications.urls')),
    path('api/v1/organizations/<uuid:organization_id>/audit/', include('apps.audit.urls')),
    path(
        'api/v1/organizations/<uuid:organization_id>/analytics/',
        include('apps.analytics.urls', namespace='analytics'),
    ),
    path('api/v1/analytics/', include('apps.analytics.urls', namespace='analytics_root')),
    
    # OpenAPI Schema & Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
