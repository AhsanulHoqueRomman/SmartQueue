from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import importlib
import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.queue.models import QueueEntry
from apps.services.models import Service

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def m11_security_setup(db):
    # Setup Org A
    manager_a = User.objects.create_user(email='sec-manager-a@example.com', password='Password123!')
    provider_user_a = User.objects.create_user(email='sec-provider-a@example.com', password='Password123!')
    customer_a = User.objects.create_user(email='sec-customer-a@example.com', password='Password123!')

    org_a = Organization.objects.create(name='Security Clinic A', slug='sec-clinic-a')
    OrganizationMembership.objects.create(user=manager_a, organization=org_a, role='MANAGER')
    mem_prov_a = OrganizationMembership.objects.create(user=provider_user_a, organization=org_a, role='PROVIDER')
    provider_a = ProviderProfile.objects.create(membership=mem_prov_a)
    service_a = Service.objects.create(organization=org_a, name='Service A', duration_minutes=30, price='50.00')

    start_a = timezone.make_aware(datetime(2030, 2, 1, 10, 0), timezone=TZ)
    appointment_a = Appointment.objects.create(
        organization=org_a,
        customer=customer_a,
        provider=provider_a,
        service=service_a,
        start_datetime=start_a,
        end_datetime=start_a + timedelta(minutes=30),
        status=Appointment.Status.CONFIRMED,
    )
    queue_entry_a = QueueEntry.objects.create(
        organization=org_a,
        appointment=appointment_a,
        provider=provider_a,
        queue_date=start_a.date(),
        token_number=1,
        status=QueueEntry.Status.WAITING,
    )
    audit_a = AuditLog.objects.create(
        organization=org_a,
        actor=manager_a,
        action='TEST_ACTION_A',
        entity_type='Appointment',
        entity_id=str(appointment_a.id),
    )

    # Setup Org B
    manager_b = User.objects.create_user(email='sec-manager-b@example.com', password='Password123!')
    provider_user_b = User.objects.create_user(email='sec-provider-b@example.com', password='Password123!')
    customer_b = User.objects.create_user(email='sec-customer-b@example.com', password='Password123!')

    org_b = Organization.objects.create(name='Security Clinic B', slug='sec-clinic-b')
    OrganizationMembership.objects.create(user=manager_b, organization=org_b, role='MANAGER')
    mem_prov_b = OrganizationMembership.objects.create(user=provider_user_b, organization=org_b, role='PROVIDER')
    provider_b = ProviderProfile.objects.create(membership=mem_prov_b)
    service_b = Service.objects.create(organization=org_b, name='Service B', duration_minutes=30, price='60.00')

    start_b = timezone.make_aware(datetime(2030, 2, 1, 11, 0), timezone=TZ)
    appointment_b = Appointment.objects.create(
        organization=org_b,
        customer=customer_b,
        provider=provider_b,
        service=service_b,
        start_datetime=start_b,
        end_datetime=start_b + timedelta(minutes=30),
        status=Appointment.Status.CONFIRMED,
    )

    return locals()


def auth_client(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestTenantIsolationBOLA:
    def test_cross_tenant_appointment_detail_access_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['customer_a'])

        # Customer A tries to access Appointment B using Org A route
        url_wrong_org = reverse('appointments:appointment_detail', kwargs={
            'organization_id': s['org_a'].id,
            'appointment_id': s['appointment_b'].id
        })
        res = client.get(url_wrong_org)
        assert res.status_code in (403, 404)

        # Customer A tries to access Appointment B using Org B route
        url_org_b = reverse('appointments:appointment_detail', kwargs={
            'organization_id': s['org_b'].id,
            'appointment_id': s['appointment_b'].id
        })
        res_b = client.get(url_org_b)
        assert res_b.status_code in (403, 404)

    def test_cross_tenant_queue_entry_access_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['manager_b'])

        # Manager B tries to start Queue Entry A from Org A in Org B route
        url = reverse('queue:queue_start', kwargs={
            'organization_id': s['org_b'].id,
            'queue_entry_id': s['queue_entry_a'].id
        })
        res = client.post(url)
        assert res.status_code in (403, 404)

    def test_cross_tenant_service_update_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['manager_b'])

        # Manager B tries to modify Service A
        url = reverse('services:service_detail', kwargs={
            'organization_id': s['org_a'].id,
            'service_id': s['service_a'].id
        })
        res = client.patch(url, {'name': 'Hacked Service'}, format='json')
        assert res.status_code in (403, 404)

    def test_cross_tenant_provider_profile_access_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['manager_b'])

        # Manager B tries to update Provider A in Org A
        url = reverse('providers:provider_detail', kwargs={
            'organization_id': s['org_a'].id,
            'provider_id': s['provider_a'].id
        })
        res = client.patch(url, {'bio': 'Hacked Bio'}, format='json')
        assert res.status_code in (403, 404)

    def test_cross_tenant_audit_logs_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['manager_b'])

        # Manager B tries to get audit logs for Org A
        url = reverse('audit:audit_list', kwargs={'organization_id': s['org_a'].id})
        res = client.get(url)
        assert res.status_code == 403

    def test_cross_tenant_membership_access_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['manager_b'])

        # Manager B tries to list members of Org A
        url = reverse('organizations:member_list_add', kwargs={'organization_id': s['org_a'].id})
        res = client.get(url)
        assert res.status_code == 403


@pytest.mark.django_db
class TestRoleAuthorizationBoundaries:
    def test_customer_cannot_access_manager_membership_endpoint(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['customer_a'])

        url = reverse('organizations:member_list_add', kwargs={'organization_id': s['org_a'].id})
        res = client.get(url)
        assert res.status_code == 403

    def test_customer_cannot_access_audit_logs(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['customer_a'])

        url = reverse('audit:audit_list', kwargs={'organization_id': s['org_a'].id})
        res = client.get(url)
        assert res.status_code == 403

    def test_customer_cannot_access_analytics(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client(s['customer_a'])

        url = reverse('analytics:summary', kwargs={'organization_id': s['org_a'].id})
        res = client.get(url)
        assert res.status_code == 403

    def test_unauthenticated_requests_rejected(self, m11_security_setup):
        s = m11_security_setup
        client = auth_client()  # No auth

        urls = [
            reverse('organizations:member_list_add', kwargs={'organization_id': s['org_a'].id}),
            reverse('audit:audit_list', kwargs={'organization_id': s['org_a'].id}),
            reverse('services:service_list_create', kwargs={'organization_id': s['org_a'].id}),
            reverse('appointments:appointment_list_create', kwargs={'organization_id': s['org_a'].id}),
        ]
        for url in urls:
            res = client.post(url, {}) if 'services' in url else client.get(url)
            assert res.status_code == 401


class TestProductionSettingsSecurity:
    def test_production_settings_validation_and_defaults(self, monkeypatch):
        valid_secret = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+' * 2
        monkeypatch.setenv('SECRET_KEY', valid_secret)
        monkeypatch.setenv('ALLOWED_HOSTS', 'example.com')

        import config.settings.base as base
        importlib.reload(base)

        import config.settings.production as prod
        importlib.reload(prod)

        assert prod.DEBUG is False
        assert prod.SESSION_COOKIE_SECURE is True
        assert prod.CSRF_COOKIE_SECURE is True
        assert prod.SECURE_HSTS_SECONDS == 31536000
        assert prod.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
        assert prod.SECURE_HSTS_PRELOAD is True
