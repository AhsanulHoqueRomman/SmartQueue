from django.urls import path
from .views import ServiceListCreateView, ServiceDetailView

app_name = 'services'

urlpatterns = [
    path('', ServiceListCreateView.as_view(), name='service_list_create'),
    path('<uuid:service_id>/', ServiceDetailView.as_view(), name='service_detail'),
]
