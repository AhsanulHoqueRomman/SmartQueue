from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.services import AnalyticsService
from apps.appointments.models import Appointment
from apps.audit.models import AuditLog
from apps.feedback.models import Review
from apps.notifications.models import Notification
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.queue.models import QueueEntry
from apps.services.models import Service

User = get_user_model()
TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def m7_setup(db):
    manager = User.objects.create_user(email='m7-manager@example.com', password='Password123!')
    provider_user = User.objects.create_user(email='m7-provider@example.com', password='Password123!')
    customer = User.objects.create_user(email='m7-customer@example.com', password='Password123!')
    outsider = User.objects.create_user(email='m7-outsider@example.com', password='Password123!')
    org = Organization.objects.create(
        name='M7 Clinic',
        slug='m7-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    other_org = Organization.objects.create(
        name='Other M7 Clinic',
        slug='other-m7-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    membership = OrganizationMembership.objects.create(user=provider_user, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(
        membership=membership,
        title='Dr Searchable',
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(organization=org, name='M7 Consultation', duration_minutes=30, price='20.00')
    other_service = Service.objects.create(organization=org, name='M7 Followup', duration_minutes=15, price='10.00')
    base = timezone.make_aware(datetime(2030, 1, 7, 9, 0), timezone=TZ)

    def appointment(status, customer=customer, service=service, hour=9):
        start = base + timedelta(hours=hour - 9)
        return Appointment.objects.create(
            organization=org, customer=customer, provider=provider, service=service,
            start_datetime=start, end_datetime=start + timedelta(minutes=30), status=status,
        )

    return locals()


def login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestM7Analytics:
    def test_manager_analytics_contains_status_queue_provider_and_service_counts(self, m7_setup):
        s = m7_setup
        completed = s['appointment'](Appointment.Status.COMPLETED)
        s['appointment'](Appointment.Status.CANCELLED, hour=10)
        s['appointment'](Appointment.Status.NO_SHOW, hour=11)
        QueueEntry.objects.create(
            organization=s['org'], appointment=completed, provider=s['provider'],
            queue_date=completed.start_datetime.date(), token_number=1,
            status=QueueEntry.Status.COMPLETED,
        )
        client = APIClient()
        login(client, s['manager'])
        url = reverse('analytics:summary', kwargs={'organization_id': s['org'].id})
        response = client.get(url)
        assert response.status_code == 200
        assert response.data['total_appointments'] == 3
        assert response.data['completed'] == 1
        assert response.data['cancelled'] == 1
        assert response.data['no_show'] == 1
        assert response.data['queue_counts']['COMPLETED'] == 1
        assert response.data['providers'][0]['total_appointments'] == 3
        assert response.data['services'][0]['total_appointments'] == 3

    def test_customer_and_cross_org_access_are_forbidden(self, m7_setup):
        s = m7_setup
        url = reverse('analytics:summary', kwargs={'organization_id': s['org'].id})
        customer_client = APIClient()
        login(customer_client, s['customer'])
        assert customer_client.get(url).status_code == 403
        outsider_client = APIClient()
        login(outsider_client, s['outsider'])
        assert outsider_client.get(url).status_code == 403


@pytest.mark.django_db
class TestM7ListTools:
    def test_appointment_filter_search_order_and_pagination(self, m7_setup):
        s = m7_setup
        s['appointment'](Appointment.Status.CONFIRMED, hour=11)
        s['appointment'](Appointment.Status.CANCELLED, hour=10)
        client = APIClient()
        login(client, s['manager'])
        url = reverse('appointments:appointment_list_create', kwargs={'organization_id': s['org'].id})
        response = client.get(url, {'status': 'CANCELLED', 'search': 'm7-customer', 'ordering': '-start_datetime', 'page': 1, 'page_size': 1})
        assert response.status_code == 200
        assert response.data['count'] == 1
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['status'] == Appointment.Status.CANCELLED

    def test_service_and_provider_search_and_pagination(self, m7_setup):
        s = m7_setup
        client = APIClient()
        login(client, s['customer'])
        services_url = reverse('services:service_list_create', kwargs={'organization_id': s['org'].id})
        service_response = client.get(services_url, {'search': 'Followup', 'page': 1, 'page_size': 1})
        assert service_response.status_code == 200
        assert service_response.data['count'] == 1
        assert service_response.data['results'][0]['name'] == 'M7 Followup'
        providers_url = reverse('providers:provider_list_create', kwargs={'organization_id': s['org'].id})
        provider_response = client.get(providers_url, {'search': 'Searchable', 'page': 1, 'page_size': 1})
        assert provider_response.status_code == 200
        assert provider_response.data['count'] == 1

    def test_m6_lists_support_pagination_and_do_not_leak_tenants(self, m7_setup):
        s = m7_setup
        Review.objects.create(
            organization=s['org'], appointment=s['appointment'](Appointment.Status.COMPLETED),
            customer=s['customer'], provider=s['provider'], rating=5,
        )
        Notification.objects.create(
            recipient=s['customer'], organization=s['org'], kind='APPOINTMENT_BOOKED',
            title='M7 notification', message='Searchable notification',
        )
        AuditLog.objects.create(
            organization=s['org'], actor=s['manager'], action='M7_ACTION',
            entity_type='Appointment', entity_id='one',
        )
        manager = APIClient()
        login(manager, s['manager'])
        review_url = reverse('feedback:review_list', kwargs={'organization_id': s['org'].id})
        assert manager.get(review_url, {'page': 1, 'page_size': 1}).data['count'] == 1
        notification_url = reverse('notifications:notification_list', kwargs={'organization_id': s['org'].id})
        customer_client = APIClient()
        login(customer_client, s['customer'])
        assert customer_client.get(notification_url, {'search': 'Searchable'}).data[0]['title'] == 'M7 notification'
        audit_url = reverse('audit:audit_list', kwargs={'organization_id': s['org'].id})
        assert manager.get(audit_url, {'page': 1, 'page_size': 1}).data['count'] == 1

    def test_openapi_schema_exposes_m7_endpoint(self):
        api_client = APIClient()
        response = api_client.get(reverse('schema'))
        assert response.status_code == 200
        assert '/api/v1/organizations/{organization_id}/analytics/summary/' in response.data['paths']
