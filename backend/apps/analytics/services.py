from datetime import date, timedelta
from django.db.models import Avg, Count, ExpressionWrapper, F, Max, Min, Q
from django.db.models.fields import DurationField
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.feedback.models import Review


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
        peak_hour = max(hourly, key=lambda k: hourly[k]) if hourly else None
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
    def organization_summary(*, organization, start_date=None, end_date=None):
        today = timezone.localdate()
        appt_filter = Q(organization=organization)
        review_filter = Q(organization=organization)
        queue_filter = Q(organization=organization)

        if start_date is not None or end_date is not None:
            if end_date is None:
                end_date = today
            if start_date is None:
                start_date = end_date - timedelta(days=30)
            appt_filter &= Q(start_datetime__date__range=(start_date, end_date))
            review_filter &= Q(created_at__date__range=(start_date, end_date))
            queue_filter &= Q(queue_date__range=(start_date, end_date))

        # Scoped appointments within date range
        appointments = Appointment.objects.filter(appt_filter)

        if start_date is None or end_date is None:
            dates = appointments.aggregate(min_d=Min('start_datetime__date'), max_d=Max('start_datetime__date'))
            effective_end = end_date or dates['max_d'] or today
            effective_start = start_date or dates['min_d'] or (effective_end - timedelta(days=30))
        else:
            effective_start = start_date
            effective_end = end_date

        status_counts = appointments.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            confirmed=Count('id', filter=Q(status=Appointment.Status.CONFIRMED)),
            checked_in=Count('id', filter=Q(status=Appointment.Status.CHECKED_IN)),
            in_progress=Count('id', filter=Q(status=Appointment.Status.IN_PROGRESS)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        )

        total_appts = status_counts['total'] or 0
        completed_appts = status_counts['completed'] or 0
        cancelled_appts = status_counts['cancelled'] or 0
        no_show_appts = status_counts['no_show'] or 0
        checked_in_appts = (status_counts['checked_in'] or 0) + (status_counts['in_progress'] or 0)

        completion_rate = round((completed_appts / total_appts * 100), 1) if total_appts > 0 else 0.0
        # Check-in rate includes checked-in, in_progress, completed, and no_show (all checked in patients)
        checked_in_total = completed_appts + checked_in_appts + no_show_appts
        check_in_rate = round((checked_in_total / total_appts * 100), 1) if total_appts > 0 else 0.0

        # Reviews & Ratings
        reviews = Review.objects.filter(review_filter)
        avg_rating_val = reviews.aggregate(r=Avg('rating'))['r']
        average_rating = round(avg_rating_val, 1) if avg_rating_val is not None else 0.0
        total_reviews = reviews.count()

        rating_dist_counts = reviews.aggregate(
            star_5=Count('id', filter=Q(rating=5)),
            star_4=Count('id', filter=Q(rating=4)),
            star_3=Count('id', filter=Q(rating=3)),
            star_2=Count('id', filter=Q(rating=2)),
            star_1=Count('id', filter=Q(rating=1)),
        )
        rating_distribution = {
            'star_5': rating_dist_counts['star_5'] or 0,
            'star_4': rating_dist_counts['star_4'] or 0,
            'star_3': rating_dist_counts['star_3'] or 0,
            'star_2': rating_dist_counts['star_2'] or 0,
            'star_1': rating_dist_counts['star_1'] or 0,
        }

        # Queue Entries Scoped Metrics
        queue_qs = QueueEntry.objects.filter(queue_filter)

        wait_expr = ExpressionWrapper(F('called_at') - F('created_at'), output_field=DurationField())
        service_expr = ExpressionWrapper(F('completed_at') - F('started_at'), output_field=DurationField())

        queue_aggs = queue_qs.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=QueueEntry.Status.COMPLETED)),
            skipped=Count('id', filter=Q(status=QueueEntry.Status.SKIPPED)),
            avg_wait=Avg(wait_expr, filter=Q(called_at__isnull=False)),
            avg_service=Avg(service_expr, filter=Q(completed_at__isnull=False, started_at__isnull=False)),
        )

        avg_wait_sec = queue_aggs['avg_wait'].total_seconds() if queue_aggs['avg_wait'] else 0.0
        avg_service_sec = queue_aggs['avg_service'].total_seconds() if queue_aggs['avg_service'] else 0.0

        queue_summary = {
            'total_entries': queue_aggs['total'] or 0,
            'completed_entries': queue_aggs['completed'] or 0,
            'skipped_entries': queue_aggs['skipped'] or 0,
            'average_wait_seconds': round(avg_wait_sec, 1),
            'average_service_seconds': round(avg_service_sec, 1),
        }

        # Time-Series Appointment Trend
        daily_appts = appointments.annotate(day=TruncDate('start_datetime')).values('day').annotate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        )

        daily_map = {row['day']: row for row in daily_appts}

        trend = []
        curr_date = effective_start
        while curr_date <= effective_end:
            row = daily_map.get(curr_date)
            trend.append({
                'date': curr_date.isoformat(),
                'total': row['total'] if row else 0,
                'completed': row['completed'] if row else 0,
                'cancelled': row['cancelled'] if row else 0,
                'no_show': row['no_show'] if row else 0,
            })
            curr_date += timedelta(days=1)

        # Provider Operational Summary
        provider_rows = appointments.values(
            'provider_id',
            'provider__membership__user__first_name',
            'provider__membership__user__last_name',
            'provider__membership__user__email',
        ).annotate(
            total_appointments=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        ).order_by('-total_appointments')

        # Map provider reviews
        prov_ratings = dict(
            reviews.values('provider_id').annotate(avg_r=Avg('rating')).values_list('provider_id', 'avg_r')
        )

        providers = []
        for row in provider_rows:
            p_id = row['provider_id']
            name = ' '.join(filter(None, [
                row['provider__membership__user__first_name'],
                row['provider__membership__user__last_name'],
            ])) or row['provider__membership__user__email']

            p_rating_val = prov_ratings.get(p_id)
            p_avg_rating = round(p_rating_val, 1) if p_rating_val is not None else 0.0

            providers.append({
                'provider_id': p_id,
                'provider_name': name,
                'total_appointments': row['total_appointments'],
                'completed': row['completed'],
                'cancelled': row['cancelled'],
                'no_show': row['no_show'],
                'average_rating': p_avg_rating,
            })

        # Service Utilization Summary
        service_rows = appointments.values(
            'service_id', 'service__name',
        ).annotate(
            total_appointments=Count('id'),
            completed=Count('id', filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count('id', filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count('id', filter=Q(status=Appointment.Status.NO_SHOW)),
        ).order_by('-total_appointments')

        services = [{
            'service_id': row['service_id'],
            'service_name': row['service__name'],
            'total_appointments': row['total_appointments'],
            'completed': row['completed'],
            'cancelled': row['cancelled'],
            'no_show': row['no_show'],
        } for row in service_rows]

        status_counts_dict = {
            'TOTAL': total_appts,
            'COMPLETED': completed_appts,
            'CONFIRMED': status_counts['confirmed'] or 0,
            'CHECKED_IN': status_counts['checked_in'] or 0,
            'IN_PROGRESS': status_counts['in_progress'] or 0,
            'CANCELLED': cancelled_appts,
            'NO_SHOW': no_show_appts,
        }

        return {
            'period': {
                'start_date': (start_date or effective_start).isoformat(),
                'end_date': (end_date or effective_end).isoformat(),
            },
            'summary': {
                'total_appointments': total_appts,
                'completed': completed_appts,
                'cancelled': cancelled_appts,
                'no_show': no_show_appts,
                'completion_rate': completion_rate,
                'check_in_rate': check_in_rate,
                'average_rating': average_rating,
                'total_reviews': total_reviews,
            },
            'status_counts': status_counts_dict,
            'rating_distribution': rating_distribution,
            'queue_summary': queue_summary,
            'appointment_trend': trend,
            'providers': providers,
            'services': services,
            'services_summary': services,  # Backward compatibility field
            'total_appointments': total_appts,  # Backward compatibility top-level key
            'completed': completed_appts,  # Backward compatibility top-level key
            'cancelled': cancelled_appts,  # Backward compatibility top-level key
            'no_show': no_show_appts,  # Backward compatibility top-level key
            'queue_counts': {
                'COMPLETED': queue_aggs['completed'] or 0,
                'SKIPPED': queue_aggs['skipped'] or 0,
                'TOTAL': queue_aggs['total'] or 0,
            },  # Backward compatibility top-level key
        }
