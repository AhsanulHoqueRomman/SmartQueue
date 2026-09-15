from django.urls import path

from .views import (
    CallNextQueueView,
    CompleteQueueEntryView,
    MyQueueListView,
    ProviderQueueListView,
    SkipQueueEntryView,
    StartQueueEntryView,
)

app_name = 'queue'

urlpatterns = [
    path('my/', MyQueueListView.as_view(), name='my_queue'),
    path('providers/<uuid:provider_id>/', ProviderQueueListView.as_view(), name='provider_queue'),
    path('providers/<uuid:provider_id>/call-next/', CallNextQueueView.as_view(), name='call_next'),
    path('<uuid:queue_entry_id>/start/', StartQueueEntryView.as_view(), name='queue_start'),
    path('<uuid:queue_entry_id>/complete/', CompleteQueueEntryView.as_view(), name='queue_complete'),
    path('<uuid:queue_entry_id>/skip/', SkipQueueEntryView.as_view(), name='queue_skip'),
]
