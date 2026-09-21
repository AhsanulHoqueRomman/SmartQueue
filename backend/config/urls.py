from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.appointments.views import CustomerDashboardView
from apps.notifications.views import (
    CustomerNotificationListView,
    CustomerNotificationMarkAllReadView,
)
from apps.organizations.views import (
    PublicInvitationDetailsView,
    PublicAcceptInvitationView,
    PublicStaffInvitationDetailsView,
    PublicAcceptStaffInvitationView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/customer/dashboard/', CustomerDashboardView.as_view(), name='customer_dashboard'),
    path('api/v1/customer/notifications/', CustomerNotificationListView.as_view(), name='customer_notifications_list'),
    path('api/v1/customer/notifications/read-all/', CustomerNotificationMarkAllReadView.as_view(), name='customer_notifications_mark_all_read'),
    path('api/v1/invitations/provider/<str:token>/', PublicInvitationDetailsView.as_view(), name='public_invitation_detail'),
    path('api/v1/invitations/provider/<str:token>/accept/', PublicAcceptInvitationView.as_view(), name='public_accept_invitation'),
    path('api/v1/invitations/staff/<str:token>/', PublicStaffInvitationDetailsView.as_view(), name='public_staff_invitation_detail'),
    path('api/v1/invitations/staff/<str:token>/accept/', PublicAcceptStaffInvitationView.as_view(), name='public_accept_staff_invitation'),

    path('api/v1/organizations/', include('apps.organizations.urls')),
    path('api/v1/organizations/<uuid:organization_id>/categories/', include('apps.services.category_urls')),
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

from django.conf import settings
from django.conf.urls.static import static

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

