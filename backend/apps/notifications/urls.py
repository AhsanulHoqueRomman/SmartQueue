from django.urls import path

from .views import NotificationListView, NotificationReadView, NotificationMarkAllReadView

app_name = 'notifications'

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification_list'),
    path('read-all/', NotificationMarkAllReadView.as_view(), name='notification_mark_all_read'),
    path('<uuid:notification_id>/read/', NotificationReadView.as_view(), name='notification_read'),
]
