import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.queue.models import QueueEntry
from apps.services.models import Service

TZ = ZoneInfo('Asia/Dhaka')
TODAY = date(2026, 10, 15)


@pytest.fixture
def f022_setup(db, monkeypatch):
    monkeypatch.setattr(timezone, 'now', lambda: datetime(2026, 10, 15, 10, 0, tzinfo=TZ))
    monkeypatch.setattr(timezone, 'localdate', lambda: TODAY)

    # Org 1
    org1 = Organization.objects.create(name='F022 Org 1', slug='f022-org-1', verification_status='APPROVED')
    manager1 = User.objects.create_user(email='f022_mgr1@org1.test', first_name='Manager', last_name='One')
    staff1 = User.objects.create_user(email='f022_staff1@org1.test', first_name='Staff', last_name='One')
    prov_user1 = User.objects.create_user(email='f022_p1@org1.test', first_name='Doctor', last_name='One')
    cust1 = User.objects.create_user(email='f022_c1@test.test', first_name='Customer', last_name='One')

    OrganizationMembership.objects.create(organization=org1, user=manager1, role='MANAGER')
    OrganizationMembership.objects.create(organization=org1, user=staff1, role='STAFF')
    m_p1 = OrganizationMembership.objects.create(organization=org1, user=prov_user1, role='PROVIDER')

    provider1 = ProviderProfile.objects.create(membership=m_p1, application_status='APPROVED', title='Dr. One')
    service1 = Service.objects.create(organization=org1, name='General Consult', price=500, duration_minutes=30)
    ProviderService.objects.create(provider=provider1, service=service1, custom_price=500)

    for day in range(7):
        WeeklySchedule.objects.create(provider=provider1, day_of_week=day, start_time=time(9), end_time=time(17), is_working_day=True)

    # Some appointments and queue entries for analytics
    appt1 = Appointment.objects.create(
        organization=org1,
        customer=cust1,
        provider=provider1,
        service=service1,
        appointment_date=TODAY,
        serial_number=1,
        start_datetime=datetime(2026, 10, 15, 9, 0, tzinfo=TZ),
        end_datetime=datetime(2026, 10, 15, 9, 30, tzinfo=TZ),
        status=Appointment.Status.COMPLETED,
    )
    QueueEntry.objects.create(
        organization=org1,
        appointment=appt1,
        provider=provider1,
        queue_date=TODAY,
        serial_number=1,
        token_number=1,
        status=QueueEntry.Status.COMPLETED,
        is_checked_in=True,
        checked_in_at=datetime(2026, 10, 15, 8, 55, tzinfo=TZ),
        called_at=datetime(2026, 10, 15, 9, 0, tzinfo=TZ),
        started_at=datetime(2026, 10, 15, 9, 1, tzinfo=TZ),
        completed_at=datetime(2026, 10, 15, 9, 28, tzinfo=TZ),
    )

    # Org 2 (Foreign)
    org2 = Organization.objects.create(name='F022 Org 2', slug='f022-org-2', verification_status='APPROVED')
    manager2 = User.objects.create_user(email='f022_mgr2@org2.test', first_name='Manager', last_name='Two')
    prov_user2 = User.objects.create_user(email='f022_p2@org2.test', first_name='Doctor', last_name='Two')
    OrganizationMembership.objects.create(organization=org2, user=manager2, role='MANAGER')
    m_p2 = OrganizationMembership.objects.create(organization=org2, user=prov_user2, role='PROVIDER')
    provider2 = ProviderProfile.objects.create(membership=m_p2, application_status='APPROVED', title='Dr. Two')

    return {
        'org1': org1,
        'org2': org2,
        'manager1': manager1,
        'manager2': manager2,
        'staff1': staff1,
        'prov_user1': prov_user1,
        'provider1': provider1,
        'prov_user2': prov_user2,
        'provider2': provider2,
        'cust1': cust1,
        'service1': service1,
    }


def test_authorized_manager_dashboard_canonical_route(f022_setup):
    """1. Authorized manager accesses dashboard successfully."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    url = f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/"
    resp = client.get(url)
    assert resp.status_code == 200, resp.data
    data = resp.data
    assert 'organization_id' in data
    assert 'daily_total_served' in data
    assert 'total_queue_entries' in data
    assert 'completed_entries' in data
    assert 'drop_off_rate' in data
    assert data['daily_total_served'] == 1
    assert data['completed_entries'] == 1


def test_authorized_manager_summary_canonical_route(f022_setup):
    """2. Authorized manager accesses summary successfully."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    url = f"/api/v1/organizations/{s['org1'].id}/analytics/summary/?start_date=2026-10-01&end_date=2026-10-31"
    resp = client.get(url)
    assert resp.status_code == 200, resp.data
    data = resp.data
    assert 'summary' in data
    assert 'appointment_trend' in data
    assert 'queue_summary' in data
    assert data['summary']['total_appointments'] == 1
    assert data['summary']['completed'] == 1


def test_provider_metrics_canonical_route_binds_both_ids(f022_setup):
    """3. Provider metrics route correctly binds both organization and provider IDs."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    url = f"/api/v1/organizations/{s['org1'].id}/analytics/providers/{s['provider1'].id}/metrics/"
    resp = client.get(url)
    assert resp.status_code == 200, resp.data
    data = resp.data
    assert str(data['provider_id']) == str(s['provider1'].id)
    assert 'Dr. One' in data['provider_name'] or 'Doctor One' in data['provider_name']
    assert data['total_queue_entries'] == 1
    assert data['completed_entries'] == 1


def test_authorized_manager_export_canonical_route(f022_setup):
    """4. Authorized export produces valid response and expected CSV headers."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    url = f"/api/v1/organizations/{s['org1'].id}/analytics/export/"
    resp = client.get(url)
    assert resp.status_code == 200
    assert resp['Content-Type'].startswith('text/csv')
    assert f'attachment; filename="{s["org1"].slug}-analytics.csv"' in resp['Content-Disposition']
    content = resp.content.decode('utf-8')
    assert 'queue_date,token_number,provider,customer,service,status,created_at,called_at,completed_at' in content
    assert 'f022_c1@test.test' in content


def test_wrong_organization_provider_metrics_rejected(f022_setup):
    """5. Wrong-organization provider IDs are rejected."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    # Provider 2 belongs to Org 2, not Org 1
    url = f"/api/v1/organizations/{s['org1'].id}/analytics/providers/{s['provider2'].id}/metrics/"
    resp = client.get(url)
    assert resp.status_code in [403, 404]


def test_foreign_organization_manager_rejected(f022_setup):
    """6. Foreign organization manager is rejected across all analytics endpoints."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager2'])  # Manager of Org 2 accessing Org 1

    urls = [
        f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/",
        f"/api/v1/organizations/{s['org1'].id}/analytics/summary/",
        f"/api/v1/organizations/{s['org1'].id}/analytics/export/",
        f"/api/v1/organizations/{s['org1'].id}/analytics/providers/{s['provider1'].id}/metrics/",
    ]
    for url in urls:
        resp = client.get(url)
        assert resp.status_code == 403, f"Expected 403 for {url}, got {resp.status_code}"


def test_role_permissions_staff_customer_and_provider(f022_setup):
    """7. Staff/customer/provider authorization follows existing policy."""
    s = f022_setup

    # Staff of Org 1 cannot view manager dashboard/summary/export
    staff_client = APIClient()
    staff_client.force_authenticate(s['staff1'])
    assert staff_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/").status_code == 403
    assert staff_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/summary/").status_code == 403
    assert staff_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/export/").status_code == 403

    # Customer cannot view manager dashboard or provider metrics
    cust_client = APIClient()
    cust_client.force_authenticate(s['cust1'])
    assert cust_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/").status_code == 403
    assert cust_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/providers/{s['provider1'].id}/metrics/").status_code == 403

    # Provider can view their OWN metrics
    prov_client = APIClient()
    prov_client.force_authenticate(s['prov_user1'])
    resp = prov_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/providers/{s['provider1'].id}/metrics/")
    assert resp.status_code == 200, resp.data

    # Provider cannot view manager dashboard/summary/export
    assert prov_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/").status_code == 403
    assert prov_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/summary/").status_code == 403
    assert prov_client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/export/").status_code == 403


def test_anonymous_access_denied(f022_setup):
    """8. Anonymous access is denied across all endpoints."""
    s = f022_setup
    anon = APIClient()

    urls = [
        f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/",
        f"/api/v1/organizations/{s['org1'].id}/analytics/summary/",
        f"/api/v1/organizations/{s['org1'].id}/analytics/export/",
        f"/api/v1/organizations/{s['org1'].id}/analytics/providers/{s['provider1'].id}/metrics/",
        "/api/v1/analytics/summary/",
        "/api/v1/analytics/dashboard/",
        "/api/v1/analytics/export/",
        f"/api/v1/analytics/providers/{s['provider1'].id}/metrics/",
    ]
    for url in urls:
        resp = anon.get(url)
        assert resp.status_code == 401, f"Expected 401 for {url}, got {resp.status_code}"


def test_global_analytics_routes_handling(f022_setup):
    """9. Global analytics routes return documented responses or controlled 400 client errors (never TypeError)."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    # Global summary without organization_id returns 400 Bad Request
    resp = client.get("/api/v1/analytics/summary/")
    assert resp.status_code == 400
    assert resp.data['detail'] == 'organization_id is required.'

    # Global summary with organization_id in query param returns 200
    resp = client.get(f"/api/v1/analytics/summary/?organization_id={s['org1'].id}")
    assert resp.status_code == 200

    # Global dashboard without organization_id returns 400 Bad Request
    resp = client.get("/api/v1/analytics/dashboard/")
    assert resp.status_code == 400
    assert resp.data['detail'] == 'organization_id is required.'

    # Global dashboard with organization_id in query param returns 200
    resp = client.get(f"/api/v1/analytics/dashboard/?organization_id={s['org1'].id}")
    assert resp.status_code == 200

    # Global export without organization_id returns 400 Bad Request
    resp = client.get("/api/v1/analytics/export/")
    assert resp.status_code == 400
    assert resp.data['detail'] == 'organization_id is required.'

    # Global export with organization_id in query param returns 200 CSV
    resp = client.get(f"/api/v1/analytics/export/?organization_id={s['org1'].id}")
    assert resp.status_code == 200
    assert resp['Content-Type'].startswith('text/csv')

    # Legacy test route: /api/v1/analytics/organizations/<id>/dashboard/ returns 200
    resp = client.get(f"/api/v1/analytics/organizations/{s['org1'].id}/dashboard/")
    assert resp.status_code == 200

    # Global provider metrics: /api/v1/analytics/providers/<id>/metrics/ returns 200
    resp = client.get(f"/api/v1/analytics/providers/{s['provider1'].id}/metrics/")
    assert resp.status_code == 200


def test_frontend_used_endpoint_paths_remain_functional(f022_setup):
    """10. Existing frontend-used endpoint paths in managerService.js remain functional."""
    s = f022_setup
    client = APIClient()
    client.force_authenticate(s['manager1'])

    # Path used in managerService.getAnalyticsSummary: /organizations/${orgId}/analytics/summary/
    resp_sum = client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/summary/")
    assert resp_sum.status_code == 200

    # Path used in managerService.getOrgDashboardMetrics: /organizations/${orgId}/analytics/dashboard/
    resp_dash = client.get(f"/api/v1/organizations/{s['org1'].id}/analytics/dashboard/")
    assert resp_dash.status_code == 200
