from django.urls import path
from .views import (
    AppointmentListCreateView,
    AppointmentDetailView,
    AppointmentCancelView,
    AppointmentCheckInView,
)

app_name = 'appointments'

urlpatterns = [
    path('', AppointmentListCreateView.as_view(), name='appointment_list_create'),
    path('<uuid:appointment_id>/', AppointmentDetailView.as_view(), name='appointment_detail'),
    path('<uuid:appointment_id>/cancel/', AppointmentCancelView.as_view(), name='appointment_cancel'),
    path('<uuid:appointment_id>/check-in/', AppointmentCheckInView.as_view(), name='appointment_check_in'),
]
