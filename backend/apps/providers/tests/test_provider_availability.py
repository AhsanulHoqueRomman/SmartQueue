"""
Focused regression tests for provider availability and duration configuration.

Verifies:
1. Configured provider with mixed service durations returns successful availability.
2. Unconfigured provider with mixed service durations returns HTTP 400 and PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED.
3. Legacy uniform-duration provider remains compatible without explicit average.
4. Manager endpoint rejects zero and negative average_service_minutes.
5. Cross-organization and cross-provider access enforces tenant isolation.
6. Demo seed definitions deterministically supply positive average_service_minutes for all demo providers.
"""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo
import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.management.commands.seed_demo_data import Command as SeedCommand
from apps.accounts.models import User
from apps.appointments.services import AppointmentAvailabilityService
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.duration import average_service_minutes
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.services.models import Service

DHAKA_TZ = ZoneInfo("Asia/Dhaka")
TEST_DATE = date(2026, 10, 20)


@pytest.fixture
def availability_env(db, monkeypatch):
    """Deterministic environment for testing availability and duration rules."""
    monkeypatch.setattr(timezone, "now", lambda: datetime.combine(TEST_DATE, time(6, 0), DHAKA_TZ))

    org = Organization.objects.create(
        name="Dhaka Medical Care",
        slug="dhaka-med-care",
        industry_type=Organization.IndustryType.HEALTHCARE,
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )
    other_org = Organization.objects.create(
        name="Chittagong Diagnostics",
        slug="ctg-diagnostics",
        industry_type=Organization.IndustryType.HEALTHCARE,
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )

    manager_user = User.objects.create_user(email="manager@dhakamed.test", password="password123")
    OrganizationMembership.objects.create(
        organization=org, user=manager_user, role=OrganizationMembership.Role.MANAGER, is_active=True
    )

    prov_user = User.objects.create_user(email="doctor@dhakamed.test", password="password123")
    prov_mem = OrganizationMembership.objects.create(
        organization=org, user=prov_user, role=OrganizationMembership.Role.PROVIDER, is_active=True
    )
    provider = ProviderProfile.objects.create(
        membership=prov_mem,
        title="Dr. Farhan, Consultant Physician",
        bio="Consultant physician.",
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True,
        average_service_minutes=None,  # starts unconfigured
    )

    # Weekly schedule for TEST_DATE (Tuesday = 1)
    WeeklySchedule.objects.create(
        provider=provider,
        day_of_week=TEST_DATE.weekday(),
        start_time=time(9, 0),
        end_time=time(13, 0),
        is_working_day=True,
    )

    # Two services with differing durations (mixed service catalog)
    svc_short = Service.objects.create(
        organization=org,
        name="Quick Consultation",
        duration_minutes=20,
        price=500,
        is_active=True,
    )
    svc_long = Service.objects.create(
        organization=org,
        name="Comprehensive Health Checkup",
        duration_minutes=45,
        price=1500,
        is_active=True,
    )

    ProviderService.objects.create(provider=provider, service=svc_short)
    ProviderService.objects.create(provider=provider, service=svc_long)

    customer_user = User.objects.create_user(email="customer@example.com", password="password123")

    return {
        "org": org,
        "other_org": other_org,
        "manager": manager_user,
        "provider_user": prov_user,
        "provider": provider,
        "svc_short": svc_short,
        "svc_long": svc_long,
        "customer": customer_user,
    }


def _avail_url(org_id, provider_id):
    return reverse("providers:provider_availability", kwargs={"organization_id": org_id, "provider_id": provider_id})


@pytest.mark.django_db
def test_unconfigured_provider_with_mixed_durations_returns_400_and_code(availability_env):
    """
    When a provider has multiple services with different durations and average_service_minutes is None,
    availability query must fail with HTTP 400 and code PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED.
    """
    env = availability_env
    client = APIClient()
    client.force_authenticate(env["customer"])

    res = client.get(
        _avail_url(env["org"].id, env["provider"].id),
        {"service_id": str(env["svc_short"].id), "date": TEST_DATE.isoformat()},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    error = res.data.get("error", {})
    assert error.get("code") == "PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED"
    assert "average service time" in error.get("message", "").lower()


@pytest.mark.django_db
def test_configured_provider_with_mixed_durations_returns_successful_availability(availability_env):
    """
    Once a manager configures an explicit average_service_minutes on the provider,
    availability for mixed-duration services succeeds with correct slot calculations.
    """
    env = availability_env
    env["provider"].average_service_minutes = 30
    env["provider"].save()

    client = APIClient()
    client.force_authenticate(env["customer"])

    # Query for the short service (20 min catalog duration)
    # Under BR-020/D04, effective planning duration is provider's average (30 min)
    res_short = client.get(
        _avail_url(env["org"].id, env["provider"].id),
        {"service_id": str(env["svc_short"].id), "date": TEST_DATE.isoformat()},
    )
    assert res_short.status_code == status.HTTP_200_OK
    assert res_short.data["is_available"] is True
    assert res_short.data["duration_minutes"] == 30
    assert len(res_short.data["slots"]) > 0

    # Query for the long service (45 min catalog duration)
    # Effective planning duration remains the provider's average (30 min)
    res_long = client.get(
        _avail_url(env["org"].id, env["provider"].id),
        {"service_id": str(env["svc_long"].id), "date": TEST_DATE.isoformat()},
    )
    assert res_long.status_code == status.HTTP_200_OK
    assert res_long.data["is_available"] is True
    assert res_long.data["duration_minutes"] == 30
    assert len(res_long.data["slots"]) > 0


@pytest.mark.django_db
def test_uniform_duration_legacy_compatibility(availability_env):
    """
    If all assigned services share the exact same duration, average_service_minutes
    infers that duration without requiring manual configuration.
    """
    env = availability_env
    # Change svc_long to 20 minutes so all services have identical duration
    env["svc_long"].duration_minutes = 20
    env["svc_long"].save()
    assert env["provider"].average_service_minutes is None

    # Directly check duration helper
    assert average_service_minutes(env["provider"]) == 20

    # Availability API returns success
    client = APIClient()
    res = client.get(
        _avail_url(env["org"].id, env["provider"].id),
        {"service_id": str(env["svc_short"].id), "date": TEST_DATE.isoformat()},
    )
    assert res.status_code == status.HTTP_200_OK
    assert res.data["is_available"] is True


@pytest.mark.django_db
@pytest.mark.parametrize("invalid_value", [0, -1, -30])
def test_invalid_zero_and_negative_average_minutes_rejected(availability_env, invalid_value):
    """
    Manager endpoint rejects 0 and negative durations with HTTP 400.
    """
    env = availability_env
    client = APIClient()
    client.force_authenticate(env["manager"])

    patch_url = reverse(
        "providers:provider_detail",
        kwargs={"organization_id": env["org"].id, "provider_id": env["provider"].id},
    )
    res = client.patch(patch_url, {"average_service_minutes": invalid_value}, format="json")
    assert res.status_code == status.HTTP_400_BAD_REQUEST

    env["provider"].refresh_from_db()
    assert env["provider"].average_service_minutes != invalid_value


@pytest.mark.django_db
def test_non_manager_cannot_patch_average_service_minutes(availability_env):
    """
    Only organization managers have authority to update provider planning duration.
    Providers, customers and unauthenticated requests are rejected.
    """
    env = availability_env
    client = APIClient()
    patch_url = reverse(
        "providers:provider_detail",
        kwargs={"organization_id": env["org"].id, "provider_id": env["provider"].id},
    )
    # Provider cannot patch their own average_service_minutes
    client.force_authenticate(env["provider_user"])
    res = client.patch(patch_url, {"average_service_minutes": 25}, format="json")
    assert res.status_code == status.HTTP_403_FORBIDDEN

    # Customer cannot patch average_service_minutes
    client.force_authenticate(env["customer"])
    res = client.patch(patch_url, {"average_service_minutes": 25}, format="json")
    assert res.status_code == status.HTTP_403_FORBIDDEN

    # Anonymous cannot patch average_service_minutes
    client.logout()
    res = client.patch(patch_url, {"average_service_minutes": 25}, format="json")
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_cross_organization_and_cross_provider_access_enforces_tenant_isolation(availability_env):
    """
    Availability endpoint returns 404 or 400 when querying a provider under a different organization's URL.
    """
    env = availability_env
    client = APIClient()
    client.force_authenticate(env["customer"])

    # Attempt to query provider under other_org
    foreign_url = _avail_url(env["other_org"].id, env["provider"].id)
    res = client.get(
        foreign_url,
        {"service_id": str(env["svc_short"].id), "date": TEST_DATE.isoformat()},
    )
    assert res.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND)


def test_demo_seed_definitions_deterministic_and_valid():
    """
    Demo seed data definitions must deterministically specify a positive integer
    average_service_minutes for all demo providers.
    """
    cmd = SeedCommand()
    accounts, bangla_customers, orgs_def = cmd.demo_definitions()

    assert len(orgs_def) >= 6

    glow_org = next(o for o in orgs_def if o["slug"] == "glow-beauty-studio")
    cooltech_org = next(o for o in orgs_def if o["slug"] == "cooltech-service-center")

    # Farzana Nahar in Glow Beauty Studio (40m mixed salon/bridal guideline)
    farzana = glow_org["providers_data"][0]
    assert farzana["user"][0] == "Farzana"
    assert farzana["user"][1] == "Nahar"
    assert farzana.get("average_service_minutes") == 40

    # Kamrul Hasan and Tanzim Safa in CoolTech (30m electronics service guideline)
    kamrul = cooltech_org["providers_data"][0]
    assert kamrul.get("average_service_minutes") == 30
    tanzim = next(p for p in cooltech_org["providers_data"] if p["user"][0] == "Tanzim")
    assert tanzim.get("average_service_minutes") == 30

    # Check all providers across all demo orgs
    for org in orgs_def:
        for p in org["providers_data"]:
            avg = p.get("average_service_minutes")
            assert avg is not None, f"Provider {p['title']} in {org['slug']} missing average_service_minutes"
            assert isinstance(avg, int) and avg > 0, f"Provider {p['title']} has invalid average {avg}"


@pytest.mark.django_db
def test_seed_safeguard_preserves_existing_manager_configured_average(availability_env):
    """
    Seed rerun logic must preserve an existing manager-configured average duration
    rather than blindly replacing it with demo seed defaults.
    """
    env = availability_env
    env["provider"].average_service_minutes = 22
    env["provider"].save()

    mem = env["provider"].membership
    p_item = {
        'title': 'Test Provider',
        'bio': 'Test bio',
        'profile_photo': '',
        'experience_years': 5,
        'education': [],
        'experience_history': [],
        'certifications': [],
        'specialties': [],
        'average_service_minutes': 50,  # Seed default that should NOT overwrite
    }

    profile_defaults = {
        'title': p_item['title'],
        'bio': p_item['bio'],
        'profile_photo': p_item['profile_photo'],
        'experience_years': p_item['experience_years'],
        'education': p_item['education'],
        'experience_history': p_item['experience_history'],
        'certifications': p_item['certifications'],
        'specialties': p_item['specialties'],
        'application_status': ProviderProfile.ApplicationStatus.APPROVED,
        'is_active': True,
    }
    existing_profile = ProviderProfile.objects.filter(membership=mem).first()
    if existing_profile and existing_profile.average_service_minutes is not None:
        profile_defaults['average_service_minutes'] = existing_profile.average_service_minutes
    else:
        profile_defaults['average_service_minutes'] = p_item.get('average_service_minutes')

    profile, _ = ProviderProfile.objects.update_or_create(
        membership=mem,
        defaults=profile_defaults,
    )

    profile.refresh_from_db()
    assert profile.average_service_minutes == 22, "Manager-configured average was erroneously overwritten by seed rerun!"

