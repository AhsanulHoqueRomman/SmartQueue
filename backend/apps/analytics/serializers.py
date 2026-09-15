from rest_framework import serializers


class ProviderSummarySerializer(serializers.Serializer):
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField()
    total_appointments = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()


class ServiceSummarySerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    service_name = serializers.CharField()
    total_appointments = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()


class AnalyticsSummarySerializer(serializers.Serializer):
    total_appointments = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()
    queue_counts = serializers.DictField(child=serializers.IntegerField())
    providers = ProviderSummarySerializer(many=True)
    services = ServiceSummarySerializer(many=True)


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
