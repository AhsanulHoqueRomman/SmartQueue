
from django.contrib.admin.sites import AdminSite
from django.db.models import ProtectedError
from django.test import RequestFactory
from apps.appointments.models import ProviderDateSerial
from apps.feedback.models import Review

import pytest
from datetime import date, timedelta, time
from unittest.mock import patch, MagicMock
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organization, OrganizationMembership
from apps.organizations.services import OrganizationService, LastManagerProtectionException
from apps.organizations.admin import OrganizationMembershipAdmin
from apps.services.models import Service
from apps.providers.models import ProviderProfile, WeeklySchedule
from apps.providers.services import ProviderBizService
from apps.providers.admin import ProviderProfileAdmin
from apps.providers.emergencies import EmergencyService
from apps.providers.emergency_models import ProviderEmergency, EmergencyRecovery
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.audit.models import AuditLog
from config.exceptions import ApplicationError

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email, password="Password123!", **kwargs):
        return User.objects.create_user(email=email, password=password, **kwargs)
    return make_user


def _login(client, email, password="Password123!"):
    res = client.post(reverse('accounts:login'), {'email': email, 'password': password}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return client


@pytest.fixture
def setup_data(create_user):
    manager = create_user(email='manager@safety.com')
    manager2 = create_user(email='manager2@safety.com')
    provider_user = create_user(email='provider@safety.com')
    staff_user = create_user(email='staff@safety.com')
    customer_user = create_user(email='customer@safety.com')

    org = Organization.objects.create(
        name='Safety Clinic',
        slug='safety-clinic',
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )

    mgr_mem = OrganizationMembership.objects.create(
        user=manager, organization=org, role=OrganizationMembership.Role.MANAGER, is_active=True
    )
    mgr2_mem = OrganizationMembership.objects.create(
        user=manager2, organization=org, role=OrganizationMembership.Role.MANAGER, is_active=True
    )
    prov_mem = OrganizationMembership.objects.create(
        user=provider_user, organization=org, role=OrganizationMembership.Role.PROVIDER, is_active=True
    )
    staff_mem = OrganizationMembership.objects.create(
        user=staff_user, organization=org, role=OrganizationMembership.Role.STAFF, is_active=True
    )

    provider = ProviderProfile.objects.create(
        membership=prov_mem,
        bio='Safety Provider',
        title='Dr.',
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True,
    )

    service = Service.objects.create(
        organization=org,
        name='Consultation',
        duration_minutes=30,
        price=100.0,
        is_active=True,
    )

    return {
        'org': org,
        'manager': manager,
        'manager2': manager2,
        'provider_user': provider_user,
        'staff_user': staff_user,
        'customer_user': customer_user,
        'mgr_mem': mgr_mem,
        'mgr2_mem': mgr2_mem,
        'prov_mem': prov_mem,
        'staff_mem': staff_mem,
        'provider': provider,
        'service': service,
    }


@pytest.fixture
def manager_client(api_client, setup_data):
    _login(api_client, 'manager@safety.com')
    api_client.org = setup_data['org']
    return api_client


# ==============================================================================
# 1. PROVIDER PROFILE DEACTIVATION & AUDIT TESTS
# ==============================================================================

@pytest.mark.django_db
def test_provider_profile_deactivation_zero_obligations(setup_data):
    """Deactivation with zero obligations succeeds and emits PROVIDER_DEACTIVATED audit log."""
    provider = setup_data['provider']
    manager = setup_data['manager']
    assert provider.is_operationally_active is True

    updated = ProviderBizService.update_provider_profile(
        profile=provider,
        actor=manager,
        is_active=False,
    )

    assert updated.is_active is False
    assert updated.is_operationally_active is False

    audit = AuditLog.objects.filter(
        action='PROVIDER_DEACTIVATED',
        entity_type='ProviderProfile',
        entity_id=str(provider.id),
    ).first()
    assert audit is not None
    assert audit.metadata['trigger'] == 'profile_deactivation'
    assert audit.metadata['previous_operational_state'] is True
    assert audit.metadata['new_operational_state'] is False


@pytest.mark.django_db
def test_provider_profile_activation_emits_audit(setup_data):
    """Activating an inactive provider profile emits PROVIDER_ACTIVATED audit log."""
    provider = setup_data['provider']
    manager = setup_data['manager']
    provider.is_active = False
    provider.save()
    assert provider.is_operationally_active is False

    updated = ProviderBizService.update_provider_profile(
        profile=provider,
        actor=manager,
        is_active=True,
    )

    assert updated.is_active is True
    assert updated.is_operationally_active is True

    audit = AuditLog.objects.filter(
        action='PROVIDER_ACTIVATED',
        entity_type='ProviderProfile',
        entity_id=str(provider.id),
    ).first()
    assert audit is not None
    assert audit.metadata['trigger'] == 'profile_activation'
    assert audit.metadata['previous_operational_state'] is False
    assert audit.metadata['new_operational_state'] is True


@pytest.mark.django_db
def test_provider_profile_no_op_update_emits_zero_lifecycle_audits(setup_data):
    """Updating fields without changing effective operational state emits zero lifecycle audits."""
    provider = setup_data['provider']
    manager = setup_data['manager']

    initial_audit_count = AuditLog.objects.filter(
        action__in=['PROVIDER_ACTIVATED', 'PROVIDER_DEACTIVATED']
    ).count()

    ProviderBizService.update_provider_profile(
        profile=provider,
        actor=manager,
        bio='Updated bio text',
        is_active=True,  # already True
    )

    final_audit_count = AuditLog.objects.filter(
        action__in=['PROVIDER_ACTIVATED', 'PROVIDER_DEACTIVATED']
    ).count()
    assert final_audit_count == initial_audit_count


# ==============================================================================
# 2. FOUR-CATEGORY OBLIGATION BLOCKING TESTS
# ==============================================================================

@pytest.mark.django_db
def test_deactivation_blocked_by_past_pending_appointment(setup_data):
    """Past non-terminal appointment blocks deactivation with 4-part itemization."""
    provider = setup_data['provider']
    past_start = timezone.now() - timedelta(days=2)
    past_end = past_start + timedelta(minutes=30)

    Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=past_start,
        end_datetime=past_end,
        status=Appointment.Status.PENDING,
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    details = exc_info.value.details
    assert details == {
        'appointments': 1,
        'queue_entries': 0,
        'emergency_recoveries': 0,
        'active_emergencies': 0,
    }
    provider.refresh_from_db()
    assert provider.is_active is True


@pytest.mark.django_db
def test_deactivation_blocked_by_future_confirmed_appointment(setup_data):
    """Future confirmed appointment blocks deactivation."""
    provider = setup_data['provider']
    future_start = timezone.now() + timedelta(days=1)
    future_end = future_start + timedelta(minutes=30)

    Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=future_start,
        end_datetime=future_end,
        status=Appointment.Status.CONFIRMED,
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    assert exc_info.value.details['appointments'] == 1


@pytest.mark.django_db
def test_deactivation_blocked_by_active_queue_entry(setup_data):
    """Active queue entry (WAITING) blocks deactivation."""
    provider = setup_data['provider']
    start = timezone.now() + timedelta(hours=2)
    appt = Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.CANCELLED,  # appointment is terminal
    )

    QueueEntry.objects.create(
        organization=setup_data['org'],
        appointment=appt,
        provider=provider,
        queue_date=start.date(),
        status=QueueEntry.Status.WAITING,
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    assert exc_info.value.details['queue_entries'] == 1


@pytest.mark.django_db
def test_deactivation_blocked_by_skipped_queue_entry(setup_data):
    """Skipped queue entry blocks deactivation because it remains restorable."""
    provider = setup_data['provider']
    start = timezone.now() + timedelta(hours=2)
    appt = Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.CANCELLED,
    )

    QueueEntry.objects.create(
        organization=setup_data['org'],
        appointment=appt,
        provider=provider,
        queue_date=start.date(),
        status=QueueEntry.Status.SKIPPED,
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    assert exc_info.value.details['queue_entries'] == 1


@pytest.mark.django_db
def test_deactivation_blocked_by_active_emergency_hold(setup_data):
    """Active emergency hold (TEMPORARY) with zero recoveries blocks deactivation."""
    provider = setup_data['provider']
    ProviderEmergency.objects.create(
        provider=provider,
        service_date=date.today(),
        state=ProviderEmergency.State.TEMPORARY,
        declared_by=setup_data['manager'],
        declared_at=timezone.now(),
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    assert exc_info.value.details['active_emergencies'] == 1


@pytest.mark.django_db
def test_deactivation_blocked_by_unresolved_recovery_after_incident_resumed(setup_data):
    """Unresolved recovery blocks deactivation even if parent incident is RESUMED."""
    provider = setup_data['provider']
    start = timezone.now() + timedelta(hours=2)
    appt = Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.CANCELLED,
    )

    incident = ProviderEmergency.objects.create(
        provider=provider,
        service_date=date.today(),
        state=ProviderEmergency.State.RESUMED,
        declared_by=setup_data['manager'],
        declared_at=timezone.now(),
        resumed_at=timezone.now(),
    )

    EmergencyRecovery.objects.create(
        incident=incident,
        appointment=appt,
        original_date=date.today(),
        original_snapshot={},
        resolution=EmergencyRecovery.Resolution.UNRESOLVED,
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    assert exc_info.value.details['emergency_recoveries'] == 1
    assert exc_info.value.details['active_emergencies'] == 0


@pytest.mark.django_db
def test_deactivation_succeeds_with_only_terminal_historical_records(setup_data):
    """Terminal historical records (COMPLETED, CANCELLED) do not block deactivation."""
    provider = setup_data['provider']
    start = timezone.now() - timedelta(days=5)

    appt = Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.COMPLETED,
    )

    QueueEntry.objects.create(
        organization=setup_data['org'],
        appointment=appt,
        provider=provider,
        queue_date=start.date(),
        status=QueueEntry.Status.COMPLETED,
    )

    updated = ProviderBizService.update_provider_profile(
        profile=provider,
        actor=setup_data['manager'],
        is_active=False,
    )
    assert updated.is_active is False


@pytest.mark.django_db
def test_itemized_four_category_counts_accurate(setup_data):
    """Simultaneous obligations across all 4 categories return exact itemized counts."""
    provider = setup_data['provider']
    start = timezone.now() + timedelta(days=1)

    # 2 appointments
    for i in range(2):
        Appointment.objects.create(
            organization=setup_data['org'],
            customer=setup_data['customer_user'],
            provider=provider,
            service=setup_data['service'],
            start_datetime=start + timedelta(hours=i),
            end_datetime=start + timedelta(hours=i, minutes=30),
            status=Appointment.Status.CONFIRMED,
        )

    # 1 skipped queue entry
    appt_q = Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start + timedelta(hours=3),
        end_datetime=start + timedelta(hours=3, minutes=30),
        status=Appointment.Status.CANCELLED,
    )
    QueueEntry.objects.create(
        organization=setup_data['org'],
        appointment=appt_q,
        provider=provider,
        queue_date=start.date(),
        status=QueueEntry.Status.SKIPPED,
    )

    # 1 active emergency hold
    incident = ProviderEmergency.objects.create(
        provider=provider,
        service_date=date.today(),
        state=ProviderEmergency.State.TEMPORARY,
        declared_by=setup_data['manager'],
        declared_at=timezone.now(),
    )

    # 1 unresolved recovery
    EmergencyRecovery.objects.create(
        incident=incident,
        appointment=appt_q,
        original_date=date.today(),
        original_snapshot={},
        resolution=EmergencyRecovery.Resolution.UNRESOLVED,
    )

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )

    details = exc_info.value.details
    assert details == {
        'appointments': 2,
        'queue_entries': 1,
        'emergency_recoveries': 1,
        'active_emergencies': 1,
    }


# ==============================================================================
# 3. ORGANIZATION MEMBERSHIP DEACTIVATION & IMMUTABILITY (D-BESAFE-9)
# ==============================================================================

@pytest.mark.django_db
def test_organization_membership_deactivation_blocked_by_obligations(setup_data):
    """Deactivating membership (new_is_active=False) blocked by unresolved obligations."""
    prov_mem = setup_data['prov_mem']
    provider = setup_data['provider']
    start = timezone.now() + timedelta(days=1)

    Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.CONFIRMED,
    )

    with pytest.raises(ApplicationError) as exc_info:
        OrganizationService.update_membership(
            membership=prov_mem,
            new_is_active=False,
            actor=setup_data['manager'],
        )

    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    prov_mem.refresh_from_db()
    assert prov_mem.is_active is True


@pytest.mark.django_db
def test_organization_membership_deactivation_zero_obligations(setup_data):
    """Deactivating membership with 0 obligations succeeds and audits PROVIDER_DEACTIVATED."""
    prov_mem = setup_data['prov_mem']
    provider = setup_data['provider']

    updated = OrganizationService.update_membership(
        membership=prov_mem,
        new_is_active=False,
        actor=setup_data['manager'],
    )
    assert updated.is_active is False
    provider.refresh_from_db()
    assert provider.is_operationally_active is False

    audit = AuditLog.objects.filter(
        action='PROVIDER_DEACTIVATED',
        entity_type='ProviderProfile',
        entity_id=str(provider.id),
    ).first()
    assert audit is not None
    assert audit.metadata['trigger'] == 'membership_deactivation'


@pytest.mark.django_db
def test_immutable_provider_membership_role_d_besafe_9(setup_data):
    """D-BESAFE-9: Changing role of a provider-linked membership is strictly rejected."""
    prov_mem = setup_data['prov_mem']

    for target_role in [OrganizationMembership.Role.STAFF, OrganizationMembership.Role.MANAGER]:
        with pytest.raises(ApplicationError) as exc_info:
            OrganizationService.update_membership(
                membership=prov_mem,
                new_role=target_role,
                actor=setup_data['manager'],
            )
        assert exc_info.value.default_code == 'CANNOT_CHANGE_PROVIDER_ROLE'

    prov_mem.refresh_from_db()
    assert prov_mem.role == OrganizationMembership.Role.PROVIDER


@pytest.mark.django_db
def test_permitted_role_changes_before_provider_profile_creation(setup_data):
    """Membership without a ProviderProfile can change role freely."""
    staff_mem = setup_data['staff_mem']
    assert not hasattr(staff_mem, 'provider_profile')

    # Change STAFF -> MANAGER
    updated = OrganizationService.update_membership(
        membership=staff_mem,
        new_role=OrganizationMembership.Role.MANAGER,
        actor=setup_data['manager'],
    )
    assert updated.role == OrganizationMembership.Role.MANAGER


@pytest.mark.django_db
def test_last_active_manager_protection_preserved(setup_data):
    """Last active manager cannot be deactivated."""
    mgr_mem = setup_data['mgr_mem']
    mgr2_mem = setup_data['mgr2_mem']

    # Deactivate manager 2 (succeeds because manager 1 remains)
    OrganizationService.update_membership(
        membership=mgr2_mem,
        new_is_active=False,
        actor=setup_data['manager'],
    )

    # Deactivate manager 1 (fails: last active manager)
    with pytest.raises(LastManagerProtectionException):
        OrganizationService.update_membership(
            membership=mgr_mem,
            new_is_active=False,
            actor=setup_data['manager'],
        )


# ==============================================================================
# 4. ONBOARDING & APPLICATION WORKFLOW PROTECTIONS
# ==============================================================================

@pytest.mark.django_db
def test_reject_approved_provider_application_blocked(setup_data):
    """Decision 2-A: An already APPROVED application cannot be rejected."""
    provider = setup_data['provider']
    assert provider.application_status == ProviderProfile.ApplicationStatus.APPROVED

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.reject_application(
            provider_profile=provider,
            manager_user=setup_data['manager'],
            reason='Violates policy',
        )

    assert exc_info.value.default_code == 'CANNOT_REJECT_APPROVED_PROVIDER'
    provider.refresh_from_db()
    assert provider.application_status == ProviderProfile.ApplicationStatus.APPROVED


@pytest.mark.django_db
def test_reject_pending_provider_application_succeeds(create_user, setup_data):
    """Rejecting a PENDING_REVIEW provider application succeeds and updates status."""
    new_user = create_user(email='pending_provider@safety.com')
    mem = OrganizationMembership.objects.create(
        user=new_user,
        organization=setup_data['org'],
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    pending_profile = ProviderProfile.objects.create(
        membership=mem,
        application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
    )

    rejected = ProviderBizService.reject_application(
        provider_profile=pending_profile,
        manager_user=setup_data['manager'],
        reason='Incomplete documentation',
    )
    assert rejected.application_status == ProviderProfile.ApplicationStatus.REJECTED
    mem.refresh_from_db()
    assert mem.is_active is False


# ==============================================================================
# 5. EMERGENCY ELIGIBILITY GUARD
# ==============================================================================

@pytest.mark.django_db
def test_emergency_declare_rejected_for_inactive_provider(setup_data):
    """Emergency declaration rejected with HTTP 400 PROVIDER_INACTIVE if provider is inactive."""
    provider = setup_data['provider']
    provider.is_active = False
    provider.save()

    with pytest.raises(ApplicationError) as exc_info:
        EmergencyService.declare(
            provider=provider,
            actor=setup_data['manager'],
            service_date=date.today(),
            private_reason='Illness',
        )

    assert exc_info.value.default_code == 'PROVIDER_INACTIVE'
    assert ProviderEmergency.objects.filter(provider=provider).count() == 0


# ==============================================================================
# 6. ADMIN READ-ONLY CONFIGURATION
# ==============================================================================

@pytest.mark.django_db
def test_admin_readonly_fields_configured():
    """Verify that lifecycle fields are declared in readonly_fields in Admin."""
    prov_admin = ProviderProfileAdmin(ProviderProfile, None)
    assert 'is_active' in prov_admin.readonly_fields
    assert 'application_status' in prov_admin.readonly_fields
    assert prov_admin.has_delete_permission(None) is False

    mem_admin = OrganizationMembershipAdmin(OrganizationMembership, None)
    assert 'is_active' in mem_admin.readonly_fields


# ==============================================================================
# 7. TENANT ISOLATION TESTS
# ==============================================================================

@pytest.mark.django_db
def test_tenant_isolation_in_obligation_counts(create_user, setup_data):
    """Obligations in Org B do not block deactivation of Provider in Org A."""
    provider_a = setup_data['provider']

    # Create Org B with its own provider and appointment
    org_b = Organization.objects.create(
        name='Org B', slug='org-b',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    user_b = create_user(email='user_b@safety.com')
    mem_b = OrganizationMembership.objects.create(
        user=user_b, organization=org_b, role=OrganizationMembership.Role.PROVIDER
    )
    provider_b = ProviderProfile.objects.create(
        membership=mem_b, application_status=ProviderProfile.ApplicationStatus.APPROVED
    )

    start = timezone.now() + timedelta(days=1)
    Appointment.objects.create(
        organization=org_b,
        customer=setup_data['customer_user'],
        provider=provider_b,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.CONFIRMED,
    )

    # Provider A has zero obligations in Org A
    updated_a = ProviderBizService.update_provider_profile(
        profile=provider_a,
        actor=setup_data['manager'],
        is_active=False,
    )
    assert updated_a.is_active is False


# ==============================================================================
# 8. TARGETED P1-1 & P1-2 REGRESSION TESTS
# ==============================================================================

@pytest.mark.django_db
def test_initial_approval_lifecycle_audit(create_user, setup_data):
    """Initial approval of a pending application emits both APPROVED and ACTIVATED audits."""
    new_user = create_user(email='onboard_prov@safety.com')
    mem = OrganizationMembership.objects.create(
        user=new_user,
        organization=setup_data['org'],
        role=OrganizationMembership.Role.PROVIDER,
        is_active=False,
    )
    profile = ProviderProfile.objects.create(
        membership=mem,
        application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
        is_active=True,
    )
    WeeklySchedule.objects.create(
        provider=profile,
        day_of_week=0,
        start_time=time(9, 0),
        end_time=time(17, 0),
        is_working_day=True,
    )

    assert profile.is_operationally_active is False

    approved = ProviderBizService.approve_application(
        provider_profile=profile,
        manager_user=setup_data['manager'],
    )
    assert approved.application_status == ProviderProfile.ApplicationStatus.APPROVED
    mem.refresh_from_db()
    assert mem.is_active is True
    profile.refresh_from_db()
    assert profile.is_operationally_active is True

    appr_audit = AuditLog.objects.filter(
        entity_id=str(profile.id), action='PROVIDER_APPLICATION_APPROVED'
    ).first()
    assert appr_audit is not None

    act_audit = AuditLog.objects.filter(
        entity_id=str(profile.id), action='PROVIDER_ACTIVATED'
    ).first()
    assert act_audit is not None
    assert act_audit.metadata['trigger'] == 'application_approved'
    assert act_audit.metadata['previous_operational_state'] is False
    assert act_audit.metadata['new_operational_state'] is True


@pytest.mark.django_db
def test_repeated_approval_emits_no_duplicate_activation_audit(create_user, setup_data):
    """Repeated approval of an already active provider emits no duplicate PROVIDER_ACTIVATED event."""
    new_user = create_user(email='repeat_prov@safety.com')
    mem = OrganizationMembership.objects.create(
        user=new_user,
        organization=setup_data['org'],
        role=OrganizationMembership.Role.PROVIDER,
        is_active=False,
    )
    profile = ProviderProfile.objects.create(
        membership=mem,
        application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
        is_active=True,
    )
    WeeklySchedule.objects.create(
        provider=profile,
        day_of_week=0,
        start_time=time(9, 0),
        end_time=time(17, 0),
        is_working_day=True,
    )

    # First approval
    ProviderBizService.approve_application(
        provider_profile=profile,
        manager_user=setup_data['manager'],
    )
    assert AuditLog.objects.filter(entity_id=str(profile.id), action='PROVIDER_ACTIVATED').count() == 1

    # Repeated approval (e.g. network retry or duplicate action)
    profile.refresh_from_db()
    ProviderBizService.approve_application(
        provider_profile=profile,
        manager_user=setup_data['manager'],
    )
    profile.refresh_from_db()
    assert profile.application_status == ProviderProfile.ApplicationStatus.APPROVED
    # Must remain exactly 1 PROVIDER_ACTIVATED record (no duplicate)
    assert AuditLog.objects.filter(entity_id=str(profile.id), action='PROVIDER_ACTIVATED').count() == 1
    # PROVIDER_APPLICATION_APPROVED is recorded on both calls
    assert AuditLog.objects.filter(entity_id=str(profile.id), action='PROVIDER_APPLICATION_APPROVED').count() == 2


@pytest.mark.django_db
def test_failed_approval_rollback_creates_zero_audit(create_user, setup_data):
    """Failed approval due to missing initial schedule rolls back and emits zero audit logs."""
    new_user = create_user(email='fail_appr_prov@safety.com')
    mem = OrganizationMembership.objects.create(
        user=new_user,
        organization=setup_data['org'],
        role=OrganizationMembership.Role.PROVIDER,
        is_active=False,
    )
    profile = ProviderProfile.objects.create(
        membership=mem,
        application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
        is_active=True,
    )
    # No weekly schedule configured

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.approve_application(
            provider_profile=profile,
            manager_user=setup_data['manager'],
        )
    assert exc_info.value.default_code == 'INITIAL_SCHEDULE_REQUIRED'

    profile.refresh_from_db()
    assert profile.application_status == ProviderProfile.ApplicationStatus.PENDING_REVIEW
    assert AuditLog.objects.filter(entity_id=str(profile.id)).count() == 0


@pytest.mark.django_db
def test_failed_deactivation_creates_zero_durable_audit(setup_data):
    """Failed provider deactivation blocked by obligations creates zero durable audit."""
    provider = setup_data['provider']
    start = timezone.now() + timedelta(days=1)
    Appointment.objects.create(
        organization=setup_data['org'],
        customer=setup_data['customer_user'],
        provider=provider,
        service=setup_data['service'],
        start_datetime=start,
        end_datetime=start + timedelta(minutes=30),
        status=Appointment.Status.CONFIRMED,
    )

    initial_audit_count = AuditLog.objects.filter(
        entity_id=str(provider.id), action='PROVIDER_DEACTIVATED'
    ).count()

    with pytest.raises(ApplicationError) as exc_info:
        ProviderBizService.update_provider_profile(
            profile=provider,
            actor=setup_data['manager'],
            is_active=False,
        )
    assert exc_info.value.default_code == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'

    final_audit_count = AuditLog.objects.filter(
        entity_id=str(provider.id), action='PROVIDER_DEACTIVATED'
    ).count()
    assert final_audit_count == initial_audit_count


@pytest.mark.django_db
def test_concurrently_discovered_provider_profile_returns_409_and_no_mutation(setup_data):
    """When Branch 2 discovers a newly created ProviderProfile under lock, returns HTTP 409 conflict and does not mutate."""
    prov_mem = setup_data['prov_mem']
    provider = setup_data['provider']
    assert ProviderProfile.objects.filter(membership_id=prov_mem.id).exists()

    # Simulate the probe returning None (as if profile was not yet committed during probe)
    # while the subsequent Branch 2 check finds it under lock
    with patch('apps.providers.models.ProviderProfile.objects.select_for_update') as mock_sfu:
        mock_qs = MagicMock()
        mock_qs.filter.return_value.first.return_value = None
        mock_sfu.return_value = mock_qs

        with pytest.raises(ApplicationError) as exc_info:
            OrganizationService.update_membership(
                membership=prov_mem,
                new_is_active=False,
                actor=setup_data['manager'],
            )

    assert exc_info.value.default_code == 'CONCURRENT_PROVIDER_CREATION_CONFLICT'
    assert exc_info.value.status_code == 409
    prov_mem.refresh_from_db()
    assert prov_mem.is_active is True
    assert AuditLog.objects.filter(entity_id=str(provider.id), action='PROVIDER_DEACTIVATED').count() == 0


@pytest.mark.django_db
def test_fresh_retry_after_concurrent_creation_takes_branch_1(setup_data):
    """Following a 409 conflict, a fresh retry takes Branch 1 with provider-first locking."""
    prov_mem = setup_data['prov_mem']
    provider = setup_data['provider']

    # Calling update_membership fresh without the probe mock takes Branch 1
    updated = OrganizationService.update_membership(
        membership=prov_mem,
        new_is_active=False,
        actor=setup_data['manager'],
    )
    assert updated.is_active is False
    provider.refresh_from_db()
    assert provider.is_operationally_active is False

    audit = AuditLog.objects.filter(
        entity_id=str(provider.id), action='PROVIDER_DEACTIVATED'
    ).first()
    assert audit is not None
    assert audit.metadata['trigger'] == 'membership_deactivation'


# ---------------- DELETION SAFETY TESTS ----------------
@pytest.fixture
def setup_org(create_user):
    manager = create_user(email='manager@safety.com')
    provider_user = create_user(email='provider@safety.com')
    staff_user = create_user(email='staff@safety.com')
    customer_user = create_user(email='customer@safety.com')
    org = Organization.objects.create(
        name='Safety Clinic', slug='safety-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    mgr_mem = OrganizationMembership.objects.create(
        user=manager, organization=org, role=OrganizationMembership.Role.MANAGER
    )
    prov_mem = OrganizationMembership.objects.create(
        user=provider_user, organization=org, role=OrganizationMembership.Role.PROVIDER
    )
    staff_mem = OrganizationMembership.objects.create(
        user=staff_user, organization=org, role=OrganizationMembership.Role.STAFF
    )
    return org, manager, provider_user, staff_user, customer_user, prov_mem


@pytest.fixture
def manager_client(api_client, setup_org):
    org, manager, *_ = setup_org
    _login(api_client, 'manager@safety.com')
    api_client.org = org
    return api_client


@pytest.fixture
def provider_profile(setup_org):
    org, manager, provider_user, staff_user, customer_user, prov_mem = setup_org
    return ProviderProfile.objects.create(
        membership=prov_mem, bio='Safety Provider', title='Dr.',
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )


@pytest.fixture
def service(setup_org):
    org, *_ = setup_org
    return Service.objects.create(
        organization=org, name='Consultation', duration_minutes=30, price='50.00'
    )


def _provider_detail_url(org_id, prov_id):
    return reverse('providers:provider_detail', kwargs={'organization_id': org_id, 'provider_id': prov_id})



# ===========================================================================
# 1. API Protection Tests
# ===========================================================================

@pytest.mark.django_db
class TestProviderDeletionAPIProtection:

    def test_manager_delete_provider_returns_405(self, manager_client, provider_profile):
        """Authorized manager DELETE is rejected with 405 Method Not Allowed and correct Allow header."""
        url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert res.data['error']['code'] == 'PROVIDER_DELETION_DISABLED'
        assert 'deactivation' in res.data['error']['message'].lower()
        assert 'Allow' in res.headers
        allowed_methods = {
            method.strip()
            for method in res.headers['Allow'].split(',')
        }
        assert 'DELETE' not in allowed_methods
        assert 'GET' in allowed_methods
        assert 'PATCH' in allowed_methods
        assert 'OPTIONS' in allowed_methods

    def test_delete_rejection_preserves_provider_record(self, manager_client, provider_profile):
        """ProviderProfile remains untouched after rejected DELETE attempt."""
        url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        manager_client.delete(url)
        provider_profile.refresh_from_db()
        assert provider_profile.is_active is True
        assert provider_profile.title == 'Dr.'
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_anonymous_delete_returns_401(self, api_client, setup_org, provider_profile):
        """Anonymous caller receives 401 Unauthorized."""
        org, *_ = setup_org
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_customer_delete_returns_403(self, api_client, setup_org, provider_profile):
        """Customer caller receives 403 Forbidden."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        _login(api_client, 'customer@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_staff_delete_returns_403(self, api_client, setup_org, provider_profile):
        """Staff caller receives 403 Forbidden."""
        org, manager, provider_user, staff_user, *_ = setup_org
        _login(api_client, 'staff@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_provider_cannot_delete_own_profile(self, api_client, setup_org, provider_profile):
        """Provider cannot delete their own profile (403 Forbidden)."""
        org, manager, provider_user, *_ = setup_org
        _login(api_client, 'provider@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_cross_org_manager_delete_returns_403(self, api_client, create_user, setup_org, provider_profile):
        """Manager of Org B cannot delete Org A's provider."""
        org_a, *_ = setup_org
        manager_b = create_user(email='manager_b@other.com')
        org_b = Organization.objects.create(name='Other Clinic', slug='other-clinic')
        OrganizationMembership.objects.create(
            user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER
        )
        _login(api_client, 'manager_b@other.com')
        # Attempt via Org B URL targeting Org A's provider (manager_b is manager of Org B, so reaches delete handler which returns 405)
        url_b = _provider_detail_url(org_b.id, provider_profile.id)
        res_b = api_client.delete(url_b)
        assert res_b.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert res_b.json()['error']['code'] == 'PROVIDER_DELETION_DISABLED'
        assert 'DELETE' not in {m.strip() for m in res_b.headers['Allow'].split(',')}

        # Attempt via Org A URL with Org B manager credentials (manager_b is not a manager of Org A, so blocked by permission with 403)
        url_a = _provider_detail_url(org_a.id, provider_profile.id)
        res_a = api_client.delete(url_a)
        assert res_a.status_code == status.HTTP_403_FORBIDDEN

    def test_inactive_manager_delete_returns_403(self, api_client, setup_org, provider_profile):
        """Manager with inactive membership receives 403 Forbidden."""
        org, manager, *_ = setup_org
        mem = OrganizationMembership.objects.get(user=manager, organization=org)
        mem.is_active = False
        mem.save()
        _login(api_client, 'manager@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN


# ===========================================================================
# 2. ORM Protection Tests (models.PROTECT)
# ===========================================================================

@pytest.mark.django_db
class TestProviderDeletionORMProtection:

    def test_orm_delete_blocked_by_appointment_protect(self, setup_org, provider_profile, service):
        """Direct ORM delete on ProviderProfile raises ProtectedError if an Appointment exists."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert Appointment.objects.filter(id=appt.id).exists()

    def test_orm_delete_blocked_by_queue_entry_protect(self, setup_org, provider_profile, service):
        """Direct ORM delete on ProviderProfile raises ProtectedError if a QueueEntry exists."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        entry = QueueEntry.objects.create(
            organization=org, appointment=appt, provider=provider_profile,
            queue_date=date.today(), status=QueueEntry.Status.WAITING,
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert QueueEntry.objects.filter(id=entry.id).exists()

    def test_orm_delete_blocked_by_review_protect(self, setup_org, provider_profile, service):
        """Direct ORM delete on ProviderProfile raises ProtectedError if a Review exists."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
        )
        review = Review.objects.create(
            organization=org, appointment=appt, customer=customer_user,
            provider=provider_profile, rating=5, comment='Excellent service',
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert Review.objects.filter(id=review.id).exists()

    def test_orm_delete_blocked_by_serial_counter_protect(self, provider_profile):
        """Direct ORM delete on ProviderProfile raises ProtectedError if ProviderDateSerial exists."""
        counter = ProviderDateSerial.objects.create(
            provider=provider_profile, booking_date=date.today(), last_serial=5
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert ProviderDateSerial.objects.filter(id=counter.id).exists()

    def test_orm_delete_membership_blocked_by_provider_profile_protect(self, provider_profile):
        """Deleting OrganizationMembership linked to a ProviderProfile raises ProtectedError."""
        mem = provider_profile.membership
        with pytest.raises(ProtectedError):
            mem.delete()
        assert OrganizationMembership.objects.filter(id=mem.id).exists()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_orm_delete_organization_blocked_by_protected_relationships(self, setup_org, provider_profile, service):
        """Deleting Organization raises ProtectedError and cannot silently delete ProviderProfile."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        with pytest.raises(ProtectedError):
            org.delete()
        assert Organization.objects.filter(id=org.id).exists()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_historical_records_remain_present_after_rejected_deletion_attempts(
        self, manager_client, setup_org, provider_profile, service
    ):
        """Historical appointments, queue entries, and reviews survive rejected DELETE requests."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
        )
        entry = QueueEntry.objects.create(
            organization=org, appointment=appt, provider=provider_profile,
            queue_date=date.today(), status=QueueEntry.Status.COMPLETED,
        )
        review = Review.objects.create(
            organization=org, appointment=appt, customer=customer_user,
            provider=provider_profile, rating=4, comment='Good experience',
        )

        url = _provider_detail_url(org.id, provider_profile.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        assert Appointment.objects.filter(id=appt.id).exists()
        assert QueueEntry.objects.filter(id=entry.id).exists()
        assert Review.objects.filter(id=review.id).exists()


# ===========================================================================
# 3. Django Admin Protection Tests
# ===========================================================================

@pytest.mark.django_db
class TestProviderDeletionAdminProtection:

    def test_admin_has_delete_permission_is_false(self, setup_org, provider_profile):
        """ProviderProfileAdmin.has_delete_permission() returns False."""
        _, manager, *_ = setup_org
        site = AdminSite()
        model_admin = ProviderProfileAdmin(ProviderProfile, site)
        rf = RequestFactory()
        req = rf.get('/')
        req.user = manager

        assert model_admin.has_delete_permission(req) is False
        assert model_admin.has_delete_permission(req, obj=provider_profile) is False

    def test_admin_delete_selected_action_removed(self, setup_org):
        """ProviderProfileAdmin get_actions excludes 'delete_selected' action."""
        _, manager, *_ = setup_org
        site = AdminSite()
        model_admin = ProviderProfileAdmin(ProviderProfile, site)
        rf = RequestFactory()
        req = rf.get('/')
        req.user = manager

        actions = model_admin.get_actions(req)
        assert 'delete_selected' not in actions


# ===========================================================================
# 4. Compatibility Tests (Reads and PATCH remain fully functional)
# ===========================================================================

@pytest.mark.django_db
class TestProviderOperationsCompatibility:

    def test_provider_get_list_and_detail_still_work(self, manager_client, provider_profile):
        """GET on provider list and detail endpoints returns HTTP 200."""
        list_url = reverse('providers:provider_list_create', kwargs={'organization_id': manager_client.org.id})
        res_list = manager_client.get(list_url)
        assert res_list.status_code == status.HTTP_200_OK

        detail_url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        res_detail = manager_client.get(detail_url)
        assert res_detail.status_code == status.HTTP_200_OK
        assert res_detail.json()['title'] == 'Dr.'

    def test_existing_provider_patch_functionality_unchanged(self, manager_client, provider_profile):
        """Manager can still PATCH provider profile attributes (title, bio)."""
        url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        res = manager_client.patch(url, {'title': 'Prof.', 'bio': 'Updated bio'}, format='json')
        assert res.status_code == status.HTTP_200_OK
        provider_profile.refresh_from_db()
        assert provider_profile.title == 'Prof.'
        assert provider_profile.bio == 'Updated bio'
