from django.urls import path

from .views import AppointmentReviewView, OrganizationReviewListView

app_name = 'feedback'

urlpatterns = [
    path('', OrganizationReviewListView.as_view(), name='review_list'),
    path('appointments/<uuid:appointment_id>/', AppointmentReviewView.as_view(), name='appointment_review'),
]
