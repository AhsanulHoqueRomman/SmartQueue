from django.urls import path
from .views import (
    AdminContactListView,
    AdminContactDetailView,
    AdminContactReplyView,
)

urlpatterns = [
    path('', AdminContactListView.as_view(), name='admin_contact_list'),
    path('<uuid:message_id>/', AdminContactDetailView.as_view(), name='admin_contact_detail'),
    path('<uuid:message_id>/reply/', AdminContactReplyView.as_view(), name='admin_contact_reply'),
]
