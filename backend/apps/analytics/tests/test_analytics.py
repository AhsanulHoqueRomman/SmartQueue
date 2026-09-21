from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.analytics.services import AnalyticsService
from apps.appointments.models import Appointment
from apps.feedback.models import Review
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.queue.models import QueueEntry
from apps.services.models import Service

User = get_user_model()
TZ = ZoneInfo(settings.TIME_ZONE)


class TestAdvancedAnalytics(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(email='analytics-manager@example.com', password='Password123!')
        self.other_manager = User.objects.create_user(email='other-manager@example.com', password='Password123!')
        self.provider_user = User.objects.create_user(email='analytics-provider@example.com', password='Password123!')
        self.customer = User.objects.create_user(email='analytics-customer@example.com', password='Password123!')

        self.organization = Organization.objects.create(
            name='Analytics Clinic', slug='analytics-clinic', verification_status=Organization.VerificationStatus.APPROVED, is_active=True
        )
        self.other_org = Organization.objects.create(
            name='Other Clinic', slug='other-clinic', verification_status=Organization.VerificationStatus.APPROVED, is_active=True
        )

        OrganizationMembership.objects.create(user=self.manager, organization=self.organization, role='MANAGER', is_active=True)
        OrganizationMembership.objects.create(user=self.other_manager, organization=self.other_org, role='MANAGER', is_active=True)

        membership = OrganizationMembership.objects.create(user=self.provider_user, organization=self.organization, role='PROVIDER', is_active=True)
        self.provider = ProviderProfile.objects.create(membership=membership, title='Analytics Provider', application_status=ProviderProfile.ApplicationStatus.APPROVED)
        self.service = Service.objects.create(organization=self.organization, name='Analytics Service', duration_minutes=30, price='20.00', is_active=True)

        start = timezone.make_aware(datetime(2030, 1, 7, 9, 0), timezone=TZ)
        self.appointment = Appointment.objects.create(
            organization=self.organization, customer=self.customer, provider=self.provider, service=self.service,
            start_datetime=start, end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
        )
        completed = QueueEntry.objects.create(
            organization=self.organization, appointment=self.appointment, provider=self.provider,
            queue_date=date(2030, 1, 7), token_number=1, status=QueueEntry.Status.COMPLETED,
            checked_in_at=start + timedelta(minutes=5),
            called_at=start + timedelta(minutes=10), started_at=start + timedelta(minutes=12),
            completed_at=start + timedelta(minutes=42),
        )
        completed.created_at = start
        QueueEntry.objects.filter(pk=completed.pk).update(created_at=start)

        skipped_appointment = Appointment.objects.create(
            organization=self.organization, customer=self.customer, provider=self.provider, service=self.service,
            start_datetime=start + timedelta(hours=1), end_datetime=start + timedelta(hours=1, minutes=30),
            status=Appointment.Status.NO_SHOW,
        )
        skipped = QueueEntry.objects.create(
            organization=self.organization, appointment=skipped_appointment, provider=self.provider,
            queue_date=date(2030, 1, 7), token_number=2, status=QueueEntry.Status.SKIPPED,
            checked_in_at=start + timedelta(hours=1, minutes=2),
            called_at=start + timedelta(hours=1, minutes=5),
        )
        QueueEntry.objects.filter(pk=skipped.pk).update(created_at=start + timedelta(hours=1))

        review = Review.objects.create(
            organization=self.organization, appointment=self.appointment, customer=self.customer, provider=self.provider, rating=5, comment='Great service!'
        )
        Review.objects.filter(pk=review.pk).update(created_at=start)

    def test_provider_metrics_calculate_wait_and_throughput(self):
        metrics = AnalyticsService.provider_metrics(provider=self.provider)
        self.assertEqual(metrics['total_queue_entries'], 2)
        self.assertEqual(metrics['completed_entries'], 1)
        self.assertEqual(metrics['skipped_entries'], 1)
        # Entry 1 wait: 10 - 5 = 5m (300s). Entry 2 wait: 5 - 2 = 3m (180s). Avg = 240s.
        self.assertEqual(metrics['average_wait_seconds'], 240.0)
        self.assertEqual(metrics['throughput_per_hour'], 2.0)

    def test_queue_wait_uses_checked_in_at_not_created_at_example(self):
        # Example from prompt requirement:
        # created_at = 5:00 PM, checked_in_at = 6:50 PM, called_at = 7:10 PM -> wait = 20 minutes (1200s), NOT 130 min (7800s)
        test_provider_user = User.objects.create_user(email='wait-test-provider@example.com', password='Password123!')
        test_mem = OrganizationMembership.objects.create(user=test_provider_user, organization=self.organization, role='PROVIDER', is_active=True)
        test_provider = ProviderProfile.objects.create(membership=test_mem, title='Wait Test Provider', application_status=ProviderProfile.ApplicationStatus.APPROVED)

        base_time = timezone.make_aware(datetime(2030, 2, 1, 17, 0), timezone=TZ) # 5:00 PM
        checked_in = base_time + timedelta(hours=1, minutes=50) # 6:50 PM
        called = base_time + timedelta(hours=2, minutes=10) # 7:10 PM
        
        appt = Appointment.objects.create(
            organization=self.organization, customer=self.customer, provider=test_provider, service=self.service,
            start_datetime=base_time, end_datetime=base_time + timedelta(minutes=30),
            status=Appointment.Status.CHECKED_IN,
        )
        q_entry = QueueEntry.objects.create(
            organization=self.organization, appointment=appt, provider=test_provider,
            queue_date=date(2030, 2, 1), token_number=99, status=QueueEntry.Status.CALLED,
            checked_in_at=checked_in, called_at=called,
        )
        QueueEntry.objects.filter(pk=q_entry.pk).update(created_at=base_time)

        p_metrics = AnalyticsService.provider_metrics(provider=test_provider)
        org_summary = AnalyticsService.organization_summary(
            organization=self.organization, start_date=date(2030, 2, 1), end_date=date(2030, 2, 1)
        )
        # Wait time must be 20 min = 1200.0s, NOT 130 min = 7800.0s
        self.assertEqual(p_metrics['average_wait_seconds'], 1200.0)
        self.assertEqual(org_summary['queue_summary']['average_wait_seconds'], 1200.0)

    def test_dashboard_calculates_served_peak_and_dropoff(self):
        dashboard = AnalyticsService.organization_dashboard(organization=self.organization, on_date=date(2030, 1, 7))
        self.assertEqual(dashboard['daily_total_served'], 1)
        self.assertEqual(dashboard['peak_queue_hour'], 9)
        self.assertEqual(dashboard['drop_off_rate'], 50.0)

    def test_organization_summary_date_range_and_metrics(self):
        summary = AnalyticsService.organization_summary(
            organization=self.organization,
            start_date=date(2030, 1, 1),
            end_date=date(2030, 1, 31)
        )
        self.assertEqual(summary['summary']['total_appointments'], 2)
        self.assertEqual(summary['summary']['completed'], 1)
        self.assertEqual(summary['summary']['no_show'], 1)
        self.assertEqual(summary['summary']['completion_rate'], 50.0)
        self.assertEqual(summary['summary']['average_rating'], 5.0)
        self.assertEqual(summary['summary']['total_reviews'], 1)
        self.assertEqual(summary['queue_summary']['average_wait_seconds'], 240.0)
        self.assertEqual(len(summary['appointment_trend']), 31)

    def test_analytics_summary_api_date_range_validation(self):
        self.client.force_authenticate(user=self.manager)
        url = f"/api/v1/organizations/{self.organization.id}/analytics/summary/?start_date=2030-01-31&end_date=2030-01-01"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start_date cannot be after end_date', res.json()['detail'])

    def test_analytics_tenant_isolation(self):
        self.client.force_authenticate(user=self.other_manager)
        url = f"/api/v1/organizations/{self.organization.id}/analytics/summary/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_provider_metrics_api_permissions(self):
        url = f"/api/v1/analytics/providers/{self.provider.id}/metrics/"
        self.client.force_authenticate(user=self.provider_user)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        self.client.force_authenticate(user=self.customer)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_dashboard_manager_access_and_csv_export(self):
        self.client.force_authenticate(user=self.manager)
        dashboard_url = f"/api/v1/analytics/organizations/{self.organization.id}/dashboard/"
        self.assertEqual(self.client.get(dashboard_url).status_code, status.HTTP_200_OK)
        export_url = f"/api/v1/analytics/export/?organization_id={self.organization.id}"
        response = self.client.get(export_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response['Content-Type'].startswith('text/csv'))
        self.assertIn('analytics-provider@example.com', response.content.decode())

