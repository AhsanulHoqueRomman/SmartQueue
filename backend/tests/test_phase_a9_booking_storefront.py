import pytest
from datetime import date, time, datetime, timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService, AppointmentAvailabilityService, get_project_tz
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService, current_business_date

User = get_user_model()


@pytest.fixture
def a9_setup(db):
    # System Admin
    admin = User.objects.create_superuser(email="admin_a9@smartqueue.bd", password="password123")

    # Org 1: Healthcare Clinic
    org_health = Organization.objects.create(
        name="Apex Care Health Clinic",
        slug="apex-care-health",
        industry_type=Organization.IndustryType.HEALTHCARE,
        tagline="Compassionate Care & Fast Recovery",
        cover_image="https://example.com/banner-health.jpg",
        logo="https://example.com/logo-health.jpg",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )

    # Org 2: Legal Firm
    org_legal = Organization.objects.create(
        name="Apex Legal Advocates",
        slug="apex-legal-advocates",
        industry_type=Organization.IndustryType.LEGAL,
        tagline="Integrity & Excellence in Law",
        cover_image="https://example.com/banner-legal.jpg",
        logo="https://example.com/logo-legal.jpg",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )

    # Managers
    mgr_health = User.objects.create_user(email="mgr_health@smartqueue.bd", password="password123")
    OrganizationMembership.objects.create(user=mgr_health, organization=org_health, role=OrganizationMembership.Role.MANAGER)

    mgr_legal = User.objects.create_user(email="mgr_legal@smartqueue.bd", password="password123")
    OrganizationMembership.objects.create(user=mgr_legal, organization=org_legal, role=OrganizationMembership.Role.MANAGER)

    # Providers
    p_user1 = User.objects.create_user(email="dr.tanvir@smartqueue.bd", password="password123", first_name="Tanvir", last_name="Ahmed")
    m_p1 = OrganizationMembership.objects.create(user=p_user1, organization=org_health, role=OrganizationMembership.Role.PROVIDER)
    provider1 = ProviderProfile.objects.create(
        membership=m_p1,
        title="Senior Dermatologist",
        experience_years=10,
        education=[{"degree": "MBBS"}, {"degree": "FCPS"}],
        specialties=["Dermatology", "Laser Therapy"],
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True,
    )

    p_user2 = User.objects.create_user(email="adv.rahim@smartqueue.bd", password="password123", first_name="Rahim", last_name="Chowdhury")
    m_p2 = OrganizationMembership.objects.create(user=p_user2, organization=org_legal, role=OrganizationMembership.Role.PROVIDER)
    provider2 = ProviderProfile.objects.create(
        membership=m_p2,
        title="Head of Corporate Law",
        experience_years=14,
        education=[{"degree": "LL.B"}, {"degree": "Bar-at-Law"}],
        specialties=["Corporate Governance", "FDI"],
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True,
    )

    # Services
    service_derm = Service.objects.create(
        organization=org_health,
        name="Skin & Laser Consultation",
        description="Comprehensive dermatological assessment",
        duration_minutes=30,
        price=1200.00,
        is_active=True,
    )
    ProviderService.objects.create(provider=provider1, service=service_derm)

    service_corp = Service.objects.create(
        organization=org_legal,
        name="Company RJSC Registration",
        description="Legal vetting and RJSC filing",
        duration_minutes=45,
        price=5000.00,
        is_active=True,
    )
    ProviderService.objects.create(provider=provider2, service=service_corp)

    # Working Schedules (09:00 - 17:00 All week)
    for day in range(7):
        WeeklySchedule.objects.create(provider=provider1, day_of_week=day, start_time=time(9, 0), end_time=time(17, 0), is_working_day=True)
        WeeklySchedule.objects.create(provider=provider2, day_of_week=day, start_time=time(9, 0), end_time=time(17, 0), is_working_day=True)

    # Customer
    customer = User.objects.create_user(email="customer_a9@smartqueue.bd", password="password123", first_name="Customer", last_name="User")

    return {
        'admin': admin,
        'org_health': org_health,
        'org_legal': org_legal,
        'mgr_health': mgr_health,
        'mgr_legal': mgr_legal,
        'provider1': provider1,
        'provider2': provider2,
        'service_derm': service_derm,
        'service_corp': service_corp,
        'customer': customer,
    }


@pytest.mark.django_db
def test_category_filtering_organizations(a9_setup):
    """Part 1: GET /api/v1/organizations/categories/ and category filtering."""
    client = APIClient()

    # 1. Categories Endpoint
    res_cat = client.get("/api/v1/organizations/categories/")
    assert res_cat.status_code == 200
    cat_ids = [c['id'] for c in res_cat.data]
    assert "HEALTHCARE" in cat_ids
    assert "LEGAL" in cat_ids

    # 2. Filter Organizations by category=HEALTHCARE
    res_health = client.get("/api/v1/organizations/?category=HEALTHCARE")
    assert res_health.status_code == 200
    results_health = res_health.data.get('results') if isinstance(res_health.data, dict) else res_health.data
    assert len(results_health) == 1
    assert results_health[0]['name'] == "Apex Care Health Clinic"
    assert results_health[0]['tagline'] == "Compassionate Care & Fast Recovery"


@pytest.mark.django_db
def test_manager_branding_management_permissions(a9_setup):
    """Part 17: Manager can update own organization branding (tagline, cover_image), blocked for another org."""
    mgr_health = a9_setup['mgr_health']
    org_health = a9_setup['org_health']
    org_legal = a9_setup['org_legal']

    client = APIClient()
    client.force_authenticate(user=mgr_health)

    # 1. Manager updates OWN organization branding
    res_own = client.patch(f"/api/v1/organizations/{org_health.id}/", {
        "tagline": "Updated Health Motto",
        "cover_image": "https://example.com/new-banner.jpg",
    }, format="json")
    assert res_own.status_code == 200
    assert res_own.data['tagline'] == "Updated Health Motto"
    assert res_own.data['cover_image'] == "https://example.com/new-banner.jpg"

    # 2. Manager attempts to update ANOTHER organization -> Rejected 403 Forbidden
    res_other = client.patch(f"/api/v1/organizations/{org_legal.id}/", {
        "tagline": "Hacked Motto",
    }, format="json")
    assert res_other.status_code == 403


@pytest.mark.django_db
def test_service_filtering_providers(a9_setup):
    """Part 4 & 22: GET /api/v1/organizations/{org_id}/providers/?service_id=... filters eligible providers."""
    org_health = a9_setup['org_health']
    provider1 = a9_setup['provider1']
    service_derm = a9_setup['service_derm']

    client = APIClient()
    res = client.get(f"/api/v1/organizations/{org_health.id}/providers/?service_id={service_derm.id}")
    assert res.status_code == 200
    results = res.data.get('results') if isinstance(res.data, dict) else res.data
    assert len(results) == 1
    assert results[0]['id'] == str(provider1.id)
    assert results[0]['title'] == "Senior Dermatologist"


@pytest.mark.django_db
def test_serial_queue_booking_flow_a9(a9_setup):
    """Part 10 & 34: Global & Storefront booking allocates sequential serial numbers without fixed slot pickers."""
    org_health = a9_setup['org_health']
    provider1 = a9_setup['provider1']
    service_derm = a9_setup['service_derm']
    cust = a9_setup['customer']
    today = current_business_date()

    # Book via AppointmentService
    appt = AppointmentService.book_appointment(
        organization_id=org_health.id,
        customer=cust,
        provider_id=provider1.id,
        service_id=service_derm.id,
        appointment_date=today,
    )
    assert appt.serial_number == 1
    assert QueueEntry.objects.filter(appointment=appt, serial_number=1, status=QueueEntry.Status.WAITING).exists()


@pytest.mark.django_db
def test_past_date_availability_and_booking_rejection(a9_setup):
    """Part 12 & 13: Past date availability MUST return is_available=False and booking POST MUST reject past dates."""
    org_health = a9_setup['org_health']
    provider1 = a9_setup['provider1']
    service_derm = a9_setup['service_derm']
    cust = a9_setup['customer']

    today = current_business_date()
    yesterday = today - timedelta(days=1)

    # 1. Query Availability for Yesterday -> returns is_available: False, reason: 'PAST_DATE'
    client = APIClient()
    res_avail = client.get(
        f"/api/v1/organizations/{org_health.id}/providers/{provider1.id}/availability/"
        f"?service_id={service_derm.id}&date={yesterday.isoformat()}"
    )
    assert res_avail.status_code == 200
    assert res_avail.data['is_available'] is False
    assert res_avail.data['reason'] == 'PAST_DATE'

    # 2. Direct Service Call for Yesterday -> is_available: False
    avail_data = AppointmentAvailabilityService.get_available_slots(
        organization_id=org_health.id,
        provider_id=provider1.id,
        service_id=service_derm.id,
        on_date=yesterday,
    )
    assert avail_data['is_available'] is False
    assert avail_data['reason'] == 'PAST_DATE'

    # 3. Post Booking for Yesterday -> Rejected 400 Bad Request
    client.force_authenticate(user=cust)
    res_book = client.post(
        f"/api/v1/organizations/{org_health.id}/appointments/",
        {
            "provider_id": str(provider1.id),
            "service_id": str(service_derm.id),
            "appointment_date": yesterday.isoformat(),
        },
        format="json",
    )
    assert res_book.status_code == 400
    assert "past date" in str(res_book.data).lower()

