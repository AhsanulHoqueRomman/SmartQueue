from rest_framework import serializers


class PeriodSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class KPISummarySerializer(serializers.Serializer):
    total_appointments = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()
    completion_rate = serializers.FloatField()
    check_in_rate = serializers.FloatField()
    average_rating = serializers.FloatField()
    total_reviews = serializers.IntegerField()


class DailyTrendSerializer(serializers.Serializer):
    date = serializers.DateField()
    total = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()


class QueueSummarySerializer(serializers.Serializer):
    total_entries = serializers.IntegerField()
    completed_entries = serializers.IntegerField()
    skipped_entries = serializers.IntegerField()
    average_wait_seconds = serializers.FloatField()
    average_service_seconds = serializers.FloatField()


class ProviderSummarySerializer(serializers.Serializer):
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField()
    total_appointments = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()
    average_rating = serializers.FloatField(required=False, default=0.0)


class ServiceSummarySerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    service_name = serializers.CharField()
    total_appointments = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()


class AnalyticsSummarySerializer(serializers.Serializer):
    period = PeriodSerializer()
    summary = KPISummarySerializer()
    status_counts = serializers.DictField(child=serializers.IntegerField())
    rating_distribution = serializers.DictField(child=serializers.IntegerField())
    queue_summary = QueueSummarySerializer()
    appointment_trend = DailyTrendSerializer(many=True)
    providers = ProviderSummarySerializer(many=True)
    services = ServiceSummarySerializer(many=True)
    services_summary = ServiceSummarySerializer(many=True, required=False)
    total_appointments = serializers.IntegerField(required=False)
    completed = serializers.IntegerField(required=False)
    cancelled = serializers.IntegerField(required=False)
    no_show = serializers.IntegerField(required=False)
    queue_counts = serializers.DictField(child=serializers.IntegerField(), required=False)


class ProviderMetricsSerializer(serializers.Serializer):
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField()
    total_queue_entries = serializers.IntegerField()
    completed_entries = serializers.IntegerField()
    skipped_entries = serializers.IntegerField()
    average_wait_seconds = serializers.FloatField()
    throughput_per_hour = serializers.FloatField()


class DashboardMetricsSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField()
    daily_total_served = serializers.IntegerField()
    peak_queue_hour = serializers.IntegerField(allow_null=True)
    peak_queue_hour_label = serializers.CharField(allow_null=True)
    drop_off_rate = serializers.FloatField()
    total_queue_entries = serializers.IntegerField()
    completed_entries = serializers.IntegerField()
    skipped_entries = serializers.IntegerField()
