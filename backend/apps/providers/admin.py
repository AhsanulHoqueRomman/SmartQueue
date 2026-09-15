from django.contrib import admin
from .models import ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak, ProviderLeave


@admin.register(ProviderProfile)
class ProviderProfileAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'title', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['membership__user__email', 'membership__organization__name', 'title']
    ordering = ['-created_at']


@admin.register(ProviderService)
class ProviderServiceAdmin(admin.ModelAdmin):
    list_display = ['provider', 'service', 'custom_duration_minutes', 'custom_price']
    search_fields = ['provider__membership__user__email', 'service__name']


@admin.register(WeeklySchedule)
class WeeklyScheduleAdmin(admin.ModelAdmin):
    list_display = ['provider', 'day_of_week', 'start_time', 'end_time', 'is_working_day']
    list_filter = ['day_of_week', 'is_working_day']


@admin.register(ScheduleBreak)
class ScheduleBreakAdmin(admin.ModelAdmin):
    list_display = ['title', 'weekly_schedule', 'start_time', 'end_time']


@admin.register(ProviderLeave)
class ProviderLeaveAdmin(admin.ModelAdmin):
    list_display = ['provider', 'start_datetime', 'end_datetime', 'reason']
    ordering = ['start_datetime']
