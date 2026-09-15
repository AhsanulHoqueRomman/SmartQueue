from django.urls import path
from apps.appointments.views import ProviderAvailabilityView
from .views import (
    ProviderProfileListCreateView,
    ProviderProfileDetailView,
    ProviderServiceListCreateView,
    ProviderServiceDetailView,
    WeeklyScheduleListCreateView,
    ScheduleBreakListCreateView,
    ScheduleBreakDetailView,
    ProviderLeaveListCreateView,
    ProviderLeaveDetailView,
)

app_name = 'providers'

urlpatterns = [
    # Provider Profiles
    path('', ProviderProfileListCreateView.as_view(), name='provider_list_create'),
    path('<uuid:provider_id>/', ProviderProfileDetailView.as_view(), name='provider_detail'),

    # Dynamic availability (Milestone 4)
    path(
        '<uuid:provider_id>/availability/',
        ProviderAvailabilityView.as_view(),
        name='provider_availability',
    ),

    # Provider Service Assignments
    path('<uuid:provider_id>/services/', ProviderServiceListCreateView.as_view(), name='provider_service_list_create'),
    path('<uuid:provider_id>/services/<int:provider_service_id>/', ProviderServiceDetailView.as_view(), name='provider_service_detail'),

    # Weekly Schedules
    path('<uuid:provider_id>/schedules/', WeeklyScheduleListCreateView.as_view(), name='schedule_list_create'),

    # Schedule Breaks
    path('<uuid:provider_id>/schedules/<int:schedule_id>/breaks/', ScheduleBreakListCreateView.as_view(), name='break_list_create'),
    path('<uuid:provider_id>/schedules/<int:schedule_id>/breaks/<int:break_id>/', ScheduleBreakDetailView.as_view(), name='break_detail'),

    # Provider Leaves
    path('<uuid:provider_id>/leaves/', ProviderLeaveListCreateView.as_view(), name='leave_list_create'),
    path('<uuid:provider_id>/leaves/<int:leave_id>/', ProviderLeaveDetailView.as_view(), name='leave_detail'),
]
