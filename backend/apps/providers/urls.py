from django.urls import path
from apps.appointments.views import ProviderAvailabilityView
from .views import (
    ProviderProfileListCreateView,
    ProviderProfileDetailView,
    ProviderPublicProfileView,
    ProviderServiceListCreateView,
    ProviderServiceDetailView,
    WeeklyScheduleListCreateView,
    ScheduleBreakListCreateView,
    ScheduleBreakDetailView,
    ProviderLeaveListCreateView,
    ProviderLeaveDetailView,
    ProviderApplicationSubmitView,
    ManagerProviderApplicationReviewView,
    ProviderDocumentUploadView,
    ManagerProviderDocumentReviewView,
)

app_name = 'providers'

urlpatterns = [
    # Provider Profiles
    path('', ProviderProfileListCreateView.as_view(), name='provider_list_create'),
    path('<uuid:provider_id>/', ProviderProfileDetailView.as_view(), name='provider_detail'),
    path('<uuid:provider_id>/profile/', ProviderPublicProfileView.as_view(), name='provider_public_profile'),
    path('<uuid:provider_id>/submit-application/', ProviderApplicationSubmitView.as_view(), name='provider_submit_application'),
    path('<uuid:provider_id>/review-application/', ManagerProviderApplicationReviewView.as_view(), name='provider_review_application'),
    path('<uuid:provider_id>/documents/', ProviderDocumentUploadView.as_view(), name='provider_document_list_upload'),
    path('<uuid:provider_id>/documents/<uuid:document_id>/review/', ManagerProviderDocumentReviewView.as_view(), name='provider_document_review'),

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
