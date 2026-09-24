from django.urls import path
from .views import ContactMessageCreateView

app_name = 'contact'

urlpatterns = [
    path('', ContactMessageCreateView.as_view(), name='contact_create'),
]
