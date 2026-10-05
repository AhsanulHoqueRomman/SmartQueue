import pytest
from datetime import date, time
from django.utils import timezone
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    OrganizationCredential,
    OrganizationOperatingHours,
)
from apps.services.models import Service, Category
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.appointments.models import Appointment
from apps.feedback.models import Review

User = get_user_model()


@pytest.fixture
def a94_setup(db):
    admin = User.objects.create_superuser(email="admin_a94@smartqueue.bd", password="password123")

    # Org 1: Legal Firm
    org_legal = Organization.objects.create(
        name="Apex Legal Advocates",
        slug="apex-legal-advocates",
        industry_type=Organization.IndustryType.LEGAL,
        tagline="Integrity & Excellence in Law",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )

    # Org 2: Healthcare Clinic
    org_health = Organization.objects.create(
        name="Apex Health Clinic",
        slug="apex-health-clinic",
        industry_type=Organization.IndustryType.HEALTHCARE,
        tagline="Compassionate Clinical Care",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )

    # Managers
    mgr_legal = User.objects.create_user(email="mgr_legal_a94@smartqueue.bd", password="password123")
    OrganizationMembership.objects.create(user=mgr_legal, organization=org_legal, role=OrganizationMembership.Role.MANAGER)

    mgr_health = User.objects.create_user(email="mgr_health_a94@smartqueue.bd", password="password123")
    OrganizationMembership.objects.create(user=mgr_health, organization=org_health, role=OrganizationMembership.Role.MANAGER)

    # Providers
    p_user = User.objects.create_user(email="advocate.rahim@smartqueue.bd", password="password123", first_name="Rahim", last_name="Chowdhury")
    m_p = OrganizationMembership.objects.create(user=p_user, organization=org_legal, role=OrganizationMembership.Role.PROVIDER)
    provider_legal = ProviderProfile.objects.create(
        membership=m_p,
        title="Head of Corporate Law",
        experience_years=14,
        is_active=True,
    )

    # Weekly schedule for provider (09:00 - 17:00)
    for day in range(7):
        WeeklySchedule.objects.create(
            provider=provider_legal,
            day_of_week=day,
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_working_day=True,
        )

    # Services
    cat_legal = Category.objects.create(organization=org_legal, name="Corporate Law", slug="corporate-law")
    service_legal = Service.objects.create(
        organization=org_legal,
        category=cat_legal,
        name="Company RJSC Registration Consultation",
        description="Comprehensive incorporation advice",
        short_description="Full legal guidance for company formation and filings.",
        detailed_description="Our corporate lawyers draft MOA/AOA, verify name clearance, and submit all filings to RJSC.",
        image="https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=80",
        service_scope=["Name Clearance Verification", "Drafting of Memorandum & Articles", "Digital RJSC Submissions"],
        process_steps=[
            {"step_number": 1, "title": "Initial Intake", "description": "Review proposed business name and shareholding."},
            {"step_number": 2, "title": "Document Drafting", "description": "Prepare MOA, AOA and statutory declarations."},
            {"step_number": 3, "title": "Filing & Clearance", "description": "Lodge documentation with RJSC registry."},
        ],
        preparation_notes=["National ID / Passport copies of all directors", "Proposed business address proof"],
        important_information=["Govt statutory fees are billed separately."],
        duration_minutes=60,
        price=15000.00,
        is_active=True,
    )
    ProviderService.objects.create(provider=provider_legal, service=service_legal)

    return {
        'admin': admin,
        'org_legal': org_legal,
        'org_health': org_health,
        'mgr_legal': mgr_legal,
        'mgr_health': mgr_health,
        'provider_legal': provider_legal,
        'service_legal': service_legal,
    }


def test_manager_can_submit_credential_for_own_org_as_pending(a94_setup):
    """Test 1 & 2: Manager can submit a credential for their own organization, strictly saved as PENDING."""
    client = APIClient()
    client.force_authenticate(user=a94_setup['mgr_legal'])
    org_id = str(a94_setup['org_legal'].id)

    res = client.post(f"/api/v1/organizations/{org_id}/credentials/", {
        "credential_type": "BUSINESS_REGISTRATION",
        "credential_name": "Dhaka City Corporation Trade License",
        "credential_number": "TRAD/DNCC/2026/084921",
        "issuing_authority": "Dhaka North City Corporation",
        "issued_date": "2026-01-01",
        "expiry_date": "2027-01-01",
        "is_public": True,
    })
    assert res.status_code == 201
    assert res.data['verification_status'] == "PENDING"
    assert res.data['masked_number'] == "•••• 4921"

    cred = OrganizationCredential.objects.get(id=res.data['id'])
    assert cred.organization == a94_setup['org_legal']
    assert cred.verification_status == OrganizationCredential.VerificationStatus.PENDING
    assert cred.verified_at is None
    assert cred.verified_by is None


def test_manager_cannot_self_verify_credential(a94_setup):
    """Test 4: Manager attempting to pass verification_status='VERIFIED' is rejected/overridden to PENDING."""
    client = APIClient()
    client.force_authenticate(user=a94_setup['mgr_legal'])
    org_id = str(a94_setup['org_legal'].id)

    res = client.post(f"/api/v1/organizations/{org_id}/credentials/", {
        "credential_type": "OPERATING_LICENSE",
        "credential_name": "High Court Chamber Permission",
        "credential_number": "HC-REG-9912",
        "verification_status": "VERIFIED",
    })
    assert res.status_code == 201
    assert res.data['verification_status'] == "PENDING"
    cred = OrganizationCredential.objects.get(id=res.data['id'])
    assert cred.verification_status == OrganizationCredential.VerificationStatus.PENDING


def test_cross_org_manager_cannot_modify_credential(a94_setup):
    """Test 3: Cross-organization manager cannot add/modify credentials for another org."""
    client = APIClient()
    client.force_authenticate(user=a94_setup['mgr_health'])  # Health manager trying to touch Legal org
    org_id = str(a94_setup['org_legal'].id)

    res = client.post(f"/api/v1/organizations/{org_id}/credentials/", {
        "credential_type": "BUSINESS_REGISTRATION",
        "credential_name": "Unauthorized Attempt",
    })
    assert res.status_code == 403


def test_public_credential_privacy_and_verification_filter(a94_setup):
    """Test 5, 6 & 7: Only VERIFIED + is_public credentials appear publicly, with masked numbers and no private docs."""
    org = a94_setup['org_legal']

    # 1. Verified + Public credential
    cred_verified = OrganizationCredential.objects.create(
        organization=org,
        credential_type=OrganizationCredential.CredentialType.BUSINESS_REGISTRATION,
        credential_name="Certified Bar Association Chamber Registration",
        credential_number="BAR-ASSOC-998822",
        issuing_authority="Supreme Court Bar Association",
        verification_status=OrganizationCredential.VerificationStatus.VERIFIED,
        is_public=True,
        verified_at=timezone.now(),
        verified_by=a94_setup['admin'],
    )

    # 2. Pending credential
    OrganizationCredential.objects.create(
        organization=org,
        credential_type=OrganizationCredential.CredentialType.OPERATING_LICENSE,
        credential_name="Pending Internal Certificate",
        credential_number="INTERNAL-9999",
        verification_status=OrganizationCredential.VerificationStatus.PENDING,
        is_public=True,
    )

    # 3. Verified but Private credential
    OrganizationCredential.objects.create(
        organization=org,
        credential_type=OrganizationCredential.CredentialType.TAX_REGISTRATION,
        credential_name="Confidential Tax TIN",
        credential_number="TAX-TIN-8888",
        verification_status=OrganizationCredential.VerificationStatus.VERIFIED,
        is_public=False,
    )

    # Public client fetch
    client = APIClient()
    res = client.get(f"/api/v1/organizations/{org.id}/credentials/")
    assert res.status_code == 200
    assert len(res.data) == 1
    item = res.data[0]
    assert item['credential_name'] == "Certified Bar Association Chamber Registration"
    assert item['masked_number'] == "•••• 8822"
    assert "document" not in item  # Private doc never leaked publicly
    assert "credential_number" not in item  # Raw full credential number not leaked

    # Detail API fetch
    res_detail = client.get(f"/api/v1/organizations/{org.id}/")
    assert res_detail.status_code == 200
    assert len(res_detail.data['credentials']) == 1
    assert res_detail.data['smartqueue_verified'] is True


def test_organization_hours_remain_separate_from_provider_schedules(a94_setup):
    """Test 8: Organization operating hours can be set by manager, distinct from provider availability."""
    org = a94_setup['org_legal']
    client = APIClient()
    client.force_authenticate(user=a94_setup['mgr_legal'])

    # Manager sets org hours
    res = client.put(f"/api/v1/organizations/{org.id}/operating-hours/", [
        {"day_of_week": 0, "open_time": "09:00:00", "close_time": "20:00:00", "is_closed": False},
        {"day_of_week": 4, "open_time": None, "close_time": None, "is_closed": True},  # Friday closed
    ], format='json')
    assert res.status_code == 200
    assert len(res.data) == 2

    # Check detail serializer
    client_pub = APIClient()
    res_detail = client_pub.get(f"/api/v1/organizations/{org.id}/")
    assert res_detail.status_code == 200
    assert 'today_hours' in res_detail.data
    assert 'operating_hours' in res_detail.data


def test_service_rich_details_endpoint(a94_setup):
    """Test 9 & 10: Service details return structured optional information correctly."""
    svc = a94_setup['service_legal']
    org = a94_setup['org_legal']

    client = APIClient()
    res = client.get(f"/api/v1/organizations/{org.id}/services/{svc.id}/")
    assert res.status_code == 200
    assert res.data['name'] == svc.name
    assert res.data['short_description'] == svc.short_description
    assert len(res.data['service_scope']) == 3
    assert len(res.data['process_steps']) == 3
    assert len(res.data['preparation_notes']) == 2
    assert res.data['image'] == svc.image


def test_public_review_endpoint_data_provenance(a94_setup):
    """Test public reviews list uses real appointment-backed reviews without leaking emails."""
    customer = User.objects.create_user(email="client1@smartqueue.bd", password="password123", first_name="Ayman", last_name="Siddique")
    org = a94_setup['org_legal']
    provider = a94_setup['provider_legal']
    svc = a94_setup['service_legal']

    now = timezone.now()
    # Completed appointment
    appt = Appointment.objects.create(
        organization=org,
        customer=customer,
        provider=provider,
        service=svc,
        appointment_date=date.today(),
        start_datetime=now - timezone.timedelta(hours=1),
        end_datetime=now,
        serial_number=1,
        status=Appointment.Status.COMPLETED,
    )

    # Real review
    Review.objects.create(
        organization=org,
        customer=customer,
        provider=provider,
        appointment=appt,
        rating=5,
        comment="Outstanding contract review advice.",
    )

    client = APIClient()
    res = client.get(f"/api/v1/organizations/{org.id}/reviews/")
    assert res.status_code == 200
    assert len(res.data['results'] if 'results' in res.data else res.data) == 1
    items = res.data['results'] if 'results' in res.data else res.data
    item = items[0]
    assert item['customer_name'] == "Ayman S."
    assert item['rating'] == 5
    assert item['comment'] == "Outstanding contract review advice."
    assert 'customer_email' not in item  # Privacy safe
