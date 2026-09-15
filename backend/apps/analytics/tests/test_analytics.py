from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.services import AnalyticsService
from apps.appointments.models import Appointment
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.queue.models import QueueEntry
from apps.services.models import Service

User = get_user_model()
TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def analytics_setup(db):
    manager = User.objects.create_user(email='analytics-manager@example.com', password='Password123!')
    provider_user = User.objects.create_user(email='analytics-provider@example.com', password='Password123!')
    customer = User.objects.create_user(email='analytics-customer@example.com', password='Password123!')
    organization = Organization.objects.create(name='Analytics Clinic', slug='analytics-clinic')
    OrganizationMembership.objects.create(user=manager, organization=organization, role='MANAGER')
    membership = OrganizationMembership.objects.create(user=provider_user, organization=organization, role='PROVIDER')
    provider = ProviderProfile.objects.create(membership=membership, title='Analytics Provider')
    service = Service.objects.create(organization=organization, name='Analytics Service', duration_minutes=30, price='20.00')
    start = timezone.make_aware(datetime(2030, 1, 7, 9, 0), timezone=TZ)
    appointment = Appointment.objects.create(
        organization=organization, customer=customer, provider=provider, service=service,
        start_datetime=start, end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.COMPLETED,
    )
    completed = QueueEntry.objects.create(
        organization=organization, appointment=appointment, provider=provider,
        queue_date=date(2030, 1, 7), token_number=1, status=QueueEntry.Status.COMPLETED,
        called_at=start + timedelta(minutes=10), started_at=start + timedelta(minutes=12),
        completed_at=start + timedelta(minutes=42),
    )
    completed.created_at = start
    QueueEntry.objects.filter(pk=completed.pk).update(created_at=start)
    skipped_appointment = Appointment.objects.create(
        organization=organization, customer=customer, provider=provider, service=service,
        start_datetime=start + timedelta(hours=1), end_datetime=start + timedelta(hours=1, minutes=30),
        status=Appointment.Status.NO_SHOW,
    )
    skipped = QueueEntry.objects.create(
        organization=organization, appointment=skipped_appointment, provider=provider,
        queue_date=date(2030, 1, 7), token_number=2, status=QueueEntry.Status.SKIPPED,
        called_at=start + timedelta(hours=1, minutes=5),
    )
    QueueEntry.objects.filter(pk=skipped.pk).update(created_at=start + timedelta(hours=1))
    return locals()


def login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestAdvancedAnalytics:
    def test_provider_metrics_calculate_wait_and_throughput(self, analytics_setup):
        metrics = AnalyticsService.provider_metrics(provider=analytics_setup['provider'])
        assert metrics['total_queue_entries'] == 2
        assert metrics['completed_entries'] == 1
        assert metrics['skipped_entries'] == 1
        assert metrics['average_wait_seconds'] == 450.0
        assert metrics['throughput_per_hour'] == 2.0

    def test_dashboard_calculates_served_peak_and_dropoff(self, analytics_setup):
        dashboard = AnalyticsService.organization_dashboard(organization=analytics_setup['organization'], on_date=date(2030, 1, 7))
        assert dashboard['daily_total_served'] == 1
        assert dashboard['peak_queue_hour'] == 9
        assert dashboard['drop_off_rate'] == 50.0

    def test_provider_metrics_api_permissions(self, analytics_setup):
        url = f"/api/v1/analytics/providers/{analytics_setup['provider'].id}/metrics/"
        provider_client = APIClient()
        login(provider_client, analytics_setup['provider_user'])
        assert provider_client.get(url).status_code == 200
        customer_client = APIClient()
        login(customer_client, analytics_setup['customer'])
        assert customer_client.get(url).status_code == 403

    def test_dashboard_manager_access_and_csv_export(self, analytics_setup):
        manager_client = APIClient()
        login(manager_client, analytics_setup['manager'])
        dashboard_url = f"/api/v1/analytics/organizations/{analytics_setup['organization'].id}/dashboard/"
        assert manager_client.get(dashboard_url).status_code == 200
        export_url = f"/api/v1/analytics/export/?organization_id={analytics_setup['organization'].id}"
        response = manager_client.get(export_url)
        assert response.status_code == 200
        assert response['Content-Type'].startswith('text/csv')
        assert 'analytics-provider@example.com' in response.content.decode()
