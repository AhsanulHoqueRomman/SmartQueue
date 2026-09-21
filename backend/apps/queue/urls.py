from django.urls import path

from .views import (
    CallNextQueueView,
    CompleteQueueEntryView,
    MarkUrgentQueueView,
    MyQueueListView,
    ProviderQueueListView,
    SkipQueueEntryView,
    StartQueueEntryView,
    WalkInRegisterView,
)

app_name = 'queue'

urlpatterns = [
    path('my/', MyQueueListView.as_view(), name='my_queue'),
    path('providers/<uuid:provider_id>/', ProviderQueueListView.as_view(), name='provider_queue'),
    path('providers/<uuid:provider_id>/call-next/', CallNextQueueView.as_view(), name='call_next'),
    path('providers/<uuid:provider_id>/walk-in/', WalkInRegisterView.as_view(), name='walk_in'),
    path('<uuid:queue_entry_id>/start/', StartQueueEntryView.as_view(), name='queue_start'),
    path('<uuid:queue_entry_id>/complete/', CompleteQueueEntryView.as_view(), name='queue_complete'),
    path('<uuid:queue_entry_id>/skip/', SkipQueueEntryView.as_view(), name='queue_skip'),
    path('<uuid:queue_entry_id>/urgent/', MarkUrgentQueueView.as_view(), name='queue_urgent'),
]
