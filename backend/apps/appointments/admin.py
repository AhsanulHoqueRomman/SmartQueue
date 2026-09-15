from django.contrib import admin
from .models import Appointment


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'organization',
        'customer',
        'provider',
        'service',
        'status',
        'start_datetime',
        'end_datetime',
    ]
    list_filter = ['status', 'organization', 'start_datetime']
    search_fields = [
        'customer__email',
        'provider__membership__user__email',
        'service__name',
        'notes',
        'cancellation_reason',
    ]
    ordering = ['-start_datetime']
    readonly_fields = ['id', 'created_at', 'updated_at']
    raw_id_fields = ['organization', 'customer', 'provider', 'service']
