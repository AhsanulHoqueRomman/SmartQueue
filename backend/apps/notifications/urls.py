from django.urls import path

from .views import NotificationListView, NotificationReadView

app_name = 'notifications'

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification_list'),
    path('<uuid:notification_id>/read/', NotificationReadView.as_view(), name='notification_read'),
]
