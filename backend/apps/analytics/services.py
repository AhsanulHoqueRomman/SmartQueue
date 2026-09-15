from django.db.models import Avg, Count, ExpressionWrapper, F, Max, Min, Q
from django.db.models.fields import DurationField
from django.db.models.functions import ExtractHour
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry


class AnalyticsService:
    @staticmethod
    def provider_metrics(*, provider):
        entries = QueueEntry.objects.filter(provider=provider).select_related(
            'appointment', 'provider__membership__user'
        )
        wait_duration = ExpressionWrapper(
            F('called_at') - F('created_at'), output_field=DurationField()
        )
        aggregates = entries.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=QueueEntry.Status.COMPLETED)),
            skipped=Count('id', filter=Q(status=QueueEntry.Status.SKIPPED)),
            average_wait=Avg(wait_duration, filter=Q(called_at__isnull=False)),
        )
        completed = entries.filter(status=QueueEntry.Status.COMPLETED)
        bounds = completed.aggregate(first=Min('started_at'), last=Max('completed_at'))
        span_hours = 0
        if bounds['first'] and bounds['last'] and bounds['last'] > bounds['first']:
            span_hours = (bounds['last'] - bounds['first']).total_seconds() / 3600
        throughput = aggregates['completed'] / span_hours if span_hours else 0.0
        average_wait = aggregates['average_wait'].total_seconds() if aggregates['average_wait'] else 0.0
        user = provider.membership.user
        return {
            'provider_id': provider.id,
            'provider_name': user.get_full_name(),
            'total_queue_entries': aggregates['total'],
            'completed_entries': aggregates['completed'],
            'skipped_entries': aggregates['skipped'],
            'average_wait_seconds': round(average_wait, 2),
            'throughput_per_hour': round(throughput, 2),
        }

    @staticmethod
    def organization_dashboard(*, organization, on_date=None):
        on_date = on_date or timezone.localdate()
        entries = QueueEntry.objects.filter(
            organization=organization, queue_date=on_date
        ).select_related('provider', 'appointment')
        counts = entries.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=QueueEntry.Status.COMPLETED)),
            skipped=Count('id', filter=Q(status=QueueEntry.Status.SKIPPED)),
        )
        hourly = dict(entries.filter(called_at__isnull=False).annotate(
            hour=ExtractHour('called_at')
        ).values('hour').annotate(count=Count('id')).values_list('hour', 'count'))
        peak_hour = max(hourly, key=hourly.get) if hourly else None
        drop_off_rate = (
            counts['skipped'] / counts['total'] * 100 if counts['total'] else 0.0
        )
        return {
            'organization_id': organization.id,
            'daily_total_served': counts['completed'],
            'peak_queue_hour': peak_hour,
            'peak_queue_hour_label': f'{peak_hour:02d}:00' if peak_hour is not None else None,
            'drop_off_rate': round(drop_off_rate, 2),
            'total_queue_entries': counts['total'],
            'completed_entries': counts['completed'],
            'skipped_entries': counts['skipped'],
        }

    @staticmethod
    def organization_summary(*, organization):
        appointments = Appointment.objects.filter(organization=organization)
        status_counts = appointments.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        )
        queue_counts = dict(
            QueueEntry.objects.filter(organization=organization)
            .values_list('status')
            .annotate(count=Count('id'))
        )
        provider_rows = appointments.values(
            'provider_id', 'provider__membership__user__first_name',
            'provider__membership__user__last_name', 'provider__membership__user__email',
        ).annotate(
            total_appointments=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        ).order_by('provider_id')
        service_rows = appointments.values(
            'service_id', 'service__name',
        ).annotate(
            total_appointments=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        ).order_by('service__name')

        providers = []
        for row in provider_rows:
            name = ' '.join(filter(None, [
                row['provider__membership__user__first_name'],
                row['provider__membership__user__last_name'],
            ])) or row['provider__membership__user__email']
            providers.append({
                'provider_id': row['provider_id'], 'provider_name': name,
                'total_appointments': row['total_appointments'],
                'completed': row['completed'], 'cancelled': row['cancelled'],
                'no_show': row['no_show'],
            })
        services = [{
            'service_id': row['service_id'], 'service_name': row['service__name'],
            'total_appointments': row['total_appointments'],
            'completed': row['completed'], 'cancelled': row['cancelled'],
            'no_show': row['no_show'],
        } for row in service_rows]
        return {
            'total_appointments': status_counts['total'],
            'completed': status_counts['completed'],
            'cancelled': status_counts['cancelled'],
            'no_show': status_counts['no_show'],
            'queue_counts': queue_counts,
            'providers': providers,
            'services': services,
        }
