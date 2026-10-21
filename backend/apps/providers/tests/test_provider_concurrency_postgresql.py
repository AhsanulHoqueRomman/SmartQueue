"""
QueueTurn Milestone BE-SAFETY-1B Real PostgreSQL Concurrency Verification Suite.
Executes against isolated disposable PostgreSQL cluster on 127.0.0.1:5433.
Tests real row-locking exclusion, lock ordering, transaction isolation, and lifecycle audits.
"""
import pytest
import threading
import time
from datetime import date, datetime, timedelta
from unittest.mock import patch

from django.db import connections, transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.organizations.services import OrganizationService, LastManagerProtectionException
from apps.providers.models import ProviderProfile, WeeklySchedule, ProviderService
from apps.providers.services import ProviderBizService
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.audit.models import AuditLog
from config.exceptions import ApplicationError


def _set_thread_lock_timeout():
    """Ensure every test thread has a bounded 5s lock timeout to fail fast on unexpected deadlocks."""
    with connections['default'].cursor() as cursor:
        cursor.execute("SET lock_timeout = '5s';")


@pytest.fixture
def pg_concurrency_setup(db):
    """Provisions base test entities on the isolated PostgreSQL test database."""
    org = Organization.objects.create(
        name="Concurrency Org",
        slug="concurrency-org",
        verification_status=Organization.VerificationStatus.APPROVED,
    )
    manager_user = User.objects.create_user(
        email="mgr_concurrency@safety.com",
        first_name="Manager",
        last_name="Concurrency",
        is_active=True,
    )
    mgr_mem = OrganizationMembership.objects.create(
        organization=org,
        user=manager_user,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    )
    customer_user = User.objects.create_user(
        email="cust_concurrency@safety.com",
        first_name="Customer",
        last_name="Concurrency",
        is_active=True,
    )
    return {
        'org': org,
        'manager': manager_user,
        'mgr_mem': mgr_mem,
        'customer': customer_user,
    }


# ==============================================================================
# 1. BOOKING VS. PROVIDER DEACTIVATION
# ==============================================================================

@pytest.mark.django_db(transaction=True)
def test_concurrency_booking_vs_provider_deactivation(pg_concurrency_setup):
    """
    Scenario 1: Concurrent booking holds ProviderProfile lock.
    Provider deactivation blocks in PostgreSQL, unblocks after booking commits,
    detects the newly created appointment, and raises PROVIDER_HAS_UNRESOLVED_OBLIGATIONS.
    """
    setup = pg_concurrency_setup
    org = setup['org']
    manager = setup['manager']
    customer = setup['customer']

    # Create active provider with schedule and service
    prov_user = User.objects.create_user(email="prov1_concurrency@safety.com")
    prov_mem = OrganizationMembership.objects.create(
        organization=org,
        user=prov_user,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    provider = ProviderProfile.objects.create(
        membership=prov_mem,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
        is_active=True,
    )
    # Weekly schedule for tomorrow
    target_date = (timezone.now() + timedelta(days=1)).date()
    WeeklySchedule.objects.create(
        provider=provider,
        day_of_week=target_date.weekday(),
        start_time="08:00:00",
        end_time="18:00:00",
        is_working_day=True,
    )
    service = Service.objects.create(
        organization=org,
        name="General Consultation",
        duration_minutes=30,
        price=100.0,
        is_active=True,
    )
    ProviderService.objects.create(
        provider=provider,
        service=service,
        custom_price=100.0,
    )

    assert provider.is_operationally_active is True

    event_booking_locked = threading.Event()
    t1_result = {}
    t2_result = {}

    from apps.appointments.serials import allocate_serial
    orig_allocate_serial = allocate_serial

    def sync_allocate_serial(p, on_date):
        # Called inside create_appointment under transaction.atomic() after ProviderProfile lock
        event_booking_locked.set()
        # Brief pause to ensure Thread 2 has reached and blocked on select_for_update()
        time.sleep(0.3)
        return orig_allocate_serial(p, on_date)

    def thread1_booking():
        _set_thread_lock_timeout()
        try:
            with patch('apps.appointments.services.allocate_serial', side_effect=sync_allocate_serial):
                start_dt = timezone.make_aware(datetime.combine(target_date, datetime.min.time().replace(hour=10)))
                appt = AppointmentService.book_appointment(
                    organization_id=org.id,
                    customer=customer,
                    provider_id=provider.id,
                    service_id=service.id,
                    start_datetime=start_dt,
                    booking_channel=Appointment.BookingChannel.ONLINE,
                )
                t1_result['appointment_id'] = appt.id
                t1_result['status'] = appt.status
        except Exception as e:
            t1_result['error'] = e
        finally:
            connections.close_all()

    def thread2_deactivation():
        _set_thread_lock_timeout()
        try:
            assert event_booking_locked.wait(timeout=5.0)
            ProviderBizService.update_provider_profile(
                profile=provider,
                actor=manager,
                is_active=False,
            )
            t2_result['success'] = True
        except ApplicationError as e:
            t2_result['error_code'] = e.default_code
            t2_result['status_code'] = e.status_code
        except Exception as e:
            t2_result['unexpected_error'] = e
        finally:
            connections.close_all()

    t1 = threading.Thread(target=thread1_booking)
    t2 = threading.Thread(target=thread2_deactivation)

    t1.start()
    t2.start()

    t1.join(timeout=10.0)
    t2.join(timeout=10.0)

    # Assertions
    assert 'error' not in t1_result, f"Thread 1 booking failed: {t1_result.get('error')}"
    assert t1_result.get('status') == Appointment.Status.CONFIRMED

    assert t2_result.get('error_code') == 'PROVIDER_HAS_UNRESOLVED_OBLIGATIONS'
    assert t2_result.get('status_code') == 400

    # Persisted state verification
    provider.refresh_from_db()
    assert provider.is_active is True
    assert provider.is_operationally_active is True
    assert Appointment.objects.filter(id=t1_result['appointment_id']).exists()
    assert AuditLog.objects.filter(entity_id=str(provider.id), action='PROVIDER_DEACTIVATED').count() == 0


# ==============================================================================
# 2. ONBOARDING VS. MEMBERSHIP ROLE CHANGE
# ==============================================================================

@pytest.mark.django_db(transaction=True)
def test_concurrency_onboarding_vs_membership_role_change(pg_concurrency_setup):
    """
    Scenario 2: Concurrent onboarding creates ProviderProfile while manager attempts
    to change role to STAFF. Governance branch re-probes under lock, discovers profile,
    and returns HTTP 409 conflict.
    """
    setup = pg_concurrency_setup
    org = setup['org']
    manager = setup['manager']

    # Initial member with role PROVIDER, active, no profile yet
    new_user = User.objects.create_user(email="onboard_role_change@safety.com")
    mem = OrganizationMembership.objects.create(
        organization=org,
        user=new_user,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    assert not ProviderProfile.objects.filter(membership=mem).exists()

    event_onboard_locked = threading.Event()
    t1_result = {}
    t2_result = {}

    def thread1_onboarding():
        _set_thread_lock_timeout()
        try:
            with transaction.atomic():
                # Acquire membership lock explicitly (as in create_provider_profile)
                locked_mem = OrganizationMembership.objects.select_for_update().get(id=mem.id)
                event_onboard_locked.set()
                time.sleep(0.3)  # Allow Thread 2 to enter update_membership and block on locked_mem
                prof = ProviderProfile.objects.create(
                    membership=locked_mem,
                    application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
                    is_active=True,
                )
                t1_result['profile_id'] = prof.id
        except Exception as e:
            t1_result['error'] = e
        finally:
            connections.close_all()

    def thread2_role_change():
        _set_thread_lock_timeout()
        try:
            assert event_onboard_locked.wait(timeout=5.0)
            OrganizationService.update_membership(
                membership=mem,
                new_role=OrganizationMembership.Role.STAFF,
                actor=manager,
            )
            t2_result['success'] = True
        except ApplicationError as e:
            t2_result['error_code'] = e.default_code
            t2_result['status_code'] = e.status_code
        except Exception as e:
            t2_result['unexpected_error'] = e
        finally:
            connections.close_all()

    t1 = threading.Thread(target=thread1_onboarding)
    t2 = threading.Thread(target=thread2_role_change)

    t1.start()
    t2.start()

    t1.join(timeout=10.0)
    t2.join(timeout=10.0)

    # Assertions
    assert 'error' not in t1_result, f"Thread 1 onboarding failed: {t1_result.get('error')}"
    assert t2_result.get('error_code') == 'CONCURRENT_PROVIDER_CREATION_CONFLICT'
    assert t2_result.get('status_code') == 409

    # In DB: Membership role remains PROVIDER (never changed to STAFF)
    mem.refresh_from_db()
    assert mem.role == OrganizationMembership.Role.PROVIDER
    assert ProviderProfile.objects.filter(id=t1_result['profile_id']).exists()


# ==============================================================================
# 3. CONCURRENT MANAGER DEACTIVATION
# ==============================================================================

@pytest.mark.django_db(transaction=True)
def test_concurrency_dual_manager_deactivation(pg_concurrency_setup):
    """
    Scenario 3: Two managers attempt simultaneous deactivation.
    PostgreSQL row lock on Organization serializes the requests. Exactly one succeeds;
    the other raises LastManagerProtectionException.
    """
    setup = pg_concurrency_setup
    org = setup['org']
    mgr1_mem = setup['mgr_mem']

    # Create manager 2
    mgr2_user = User.objects.create_user(email="mgr2_concurrency@safety.com")
    mgr2_mem = OrganizationMembership.objects.create(
        organization=org,
        user=mgr2_user,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    )

    t1_result = {}
    t2_result = {}
    barrier = threading.Barrier(2)

    def deactivate_mgr(mgr_mem, result_dict):
        _set_thread_lock_timeout()
        try:
            barrier.wait(timeout=5.0)
            OrganizationService.update_membership(
                membership=mgr_mem,
                new_is_active=False,
                actor=mgr_mem.user,
            )
            result_dict['success'] = True
        except LastManagerProtectionException:
            result_dict['last_manager_blocked'] = True
        except Exception as e:
            result_dict['error'] = e
        finally:
            connections.close_all()

    t1 = threading.Thread(target=deactivate_mgr, args=(mgr1_mem, t1_result))
    t2 = threading.Thread(target=deactivate_mgr, args=(mgr2_mem, t2_result))

    t1.start()
    t2.start()

    t1.join(timeout=10.0)
    t2.join(timeout=10.0)

    # Exactly one succeeded and one was blocked by last manager protection
    results = [t1_result, t2_result]
    successes = [r for r in results if r.get('success') is True]
    blocked = [r for r in results if r.get('last_manager_blocked') is True]

    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}"
    assert len(blocked) == 1, f"Expected exactly 1 blocked by last manager, got {len(blocked)}"

    # In DB: Exactly 1 active manager remains
    active_managers = OrganizationMembership.objects.filter(
        organization=org,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    ).count()
    assert active_managers == 1


# ==============================================================================
# 4. CONCURRENT ONBOARDING CONFLICT (HTTP 409) AND FRESH RETRY
# ==============================================================================

@pytest.mark.django_db(transaction=True)
def test_concurrency_onboarding_conflict_and_clean_retry(pg_concurrency_setup):
    """
    Scenario 4: Deactivation probes ProviderProfile (finds none). Concurrent onboarding
    creates ProviderProfile. Deactivation resumes, discovers profile at Line 186,
    raises HTTP 409. Fresh retry takes Branch 1.
    Preserves D-BESAFE rule: PENDING_REVIEW provider emits 0 PROVIDER_DEACTIVATED events.
    """
    setup = pg_concurrency_setup
    org = setup['org']
    manager = setup['manager']

    new_user = User.objects.create_user(email="onboard_409_retry@safety.com")
    prov_mem = OrganizationMembership.objects.create(
        organization=org,
        user=new_user,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )

    event_probe_done = threading.Event()
    event_profile_created = threading.Event()
    t1_result = {}
    t2_result = {}

    orig_org_sfu = Organization.objects.select_for_update

    def sync_org_sfu(*args, **kwargs):
        if not event_probe_done.is_set():
            event_probe_done.set()
            assert event_profile_created.wait(timeout=5.0)
        return orig_org_sfu(*args, **kwargs)

    def thread1_deactivation():
        _set_thread_lock_timeout()
        try:
            with patch('apps.organizations.models.Organization.objects.select_for_update', side_effect=sync_org_sfu):
                OrganizationService.update_membership(
                    membership=prov_mem,
                    new_is_active=False,
                    actor=manager,
                )
            t1_result['success'] = True
        except ApplicationError as e:
            t1_result['error_code'] = e.default_code
            t1_result['status_code'] = e.status_code
        except Exception as e:
            t1_result['unexpected_error'] = e
        finally:
            connections.close_all()

    def thread2_onboarding():
        _set_thread_lock_timeout()
        try:
            assert event_probe_done.wait(timeout=5.0)
            prof = ProviderBizService.create_provider_profile(
                organization=org,
                membership_id=prov_mem.id,
                bio="Concurrency test profile",
            )
            t2_result['profile_id'] = prof.id
            event_profile_created.set()
        except Exception as e:
            t2_result['error'] = e
            event_profile_created.set()
        finally:
            connections.close_all()

    t1 = threading.Thread(target=thread1_deactivation)
    t2 = threading.Thread(target=thread2_onboarding)

    t1.start()
    t2.start()

    t1.join(timeout=10.0)
    t2.join(timeout=10.0)

    assert 'error' not in t2_result, f"Thread 2 onboarding failed: {t2_result.get('error')}"

    # Call 1 Assertion: Conflicted with 409
    assert t1_result.get('error_code') == 'CONCURRENT_PROVIDER_CREATION_CONFLICT'
    assert t1_result.get('status_code') == 409

    # Profile exists in INCOMPLETE status (non-operational)
    prov_mem.refresh_from_db()
    assert prov_mem.is_active is True
    profile = ProviderProfile.objects.get(id=t2_result['profile_id'])
    assert profile.application_status == ProviderProfile.ApplicationStatus.INCOMPLETE
    assert profile.is_operationally_active is False

    # Call 2: Fresh retry takes Branch 1 cleanly
    updated_mem = OrganizationService.update_membership(
        membership=prov_mem,
        new_is_active=False,
        actor=manager,
    )
    assert updated_mem.is_active is False
    profile.refresh_from_db()
    assert profile.is_operationally_active is False

    # Lifecycle Audit Assertions (D-BESAFE compliance):
    # MEMBERSHIP_UPDATED is emitted for membership deactivation
    assert AuditLog.objects.filter(
        entity_id=str(prov_mem.id),
        action='MEMBERSHIP_UPDATED'
    ).count() == 1

    # Exactly 0 PROVIDER_DEACTIVATED events because provider was never operationally active
    assert AuditLog.objects.filter(
        entity_id=str(profile.id),
        action='PROVIDER_DEACTIVATED'
    ).count() == 0
