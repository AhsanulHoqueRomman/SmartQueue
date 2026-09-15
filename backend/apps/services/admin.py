from django.contrib import admin
from .models import Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'duration_minutes', 'price', 'is_active', 'created_at']
    list_filter = ['is_active', 'organization']
    search_fields = ['name', 'organization__name']
    ordering = ['organization', 'name']
