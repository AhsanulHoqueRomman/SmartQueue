"""F-005 Reschedule Parity and PostgreSQL Concurrency Verification Tests."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from threading import Barrier
from zoneinfo import ZoneInfo
import uuid

import pytest
from django.db import close_old_connections, connection
from django.utils import timezone

from apps.accounts.models import User
from apps.appointments.capacity import date_capacity
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService, AppointmentValidationException
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, ProviderLeave, WeeklySchedule
from apps.providers.services import ProviderService_ as ProviderOps
from apps.services.models import Service
from config.exceptions import ApplicationError

TZ = ZoneInfo('Asia/Dhaka')
TODAY = date(2026, 10, 12)


def at(on_date=TODAY, hour=10, minute=0):
    return datetime.combine(on_date, time(hour, minute), TZ)


@pytest.fixture
def env(db, monkeypatch):
    monkeypatch.setattr(timezone, 'now', lambda: at(hour=7))
    org = Organization.objects.create(name='F005 Org', slug='f005-org', verification_status='APPROVED')
    users = {role: User.objects.create_user(email=role+'@f005.test') for role in ['provider', 'manager', 'staff', 'customer']}
    memberships = {}
    for role in ['provider', 'manager', 'staff']:
        memberships[role] = OrganizationMembership.objects.create(organization=org, user=users[role], role=role.upper())
    provider = ProviderProfile.objects.create(membership=memberships['provider'], application_status='APPROVED', average_service_minutes=30)
    service = Service.objects.create(organization=org, name='Consultation', price=1000, duration_minutes=30)
    ps = ProviderService.objects.create(provider=provider, service=service, custom_duration_minutes=30)
    for weekday in range(7):
        WeeklySchedule.objects.create(provider=provider, day_of_week=weekday, start_time=time(10), end_time=time(17))
    return dict(org=org, users=users, provider=provider, service=service, ps=ps, memberships=memberships)


def book(env, on_date=TODAY, customer=None, **kwargs):
    customer = customer or env['users']['customer']
    return AppointmentService.book_appointment(
        organization_id=env['org'].pk, provider_id=env['provider'].pk,
        service_id=env['service'].pk, customer=customer, appointment_date=on_date, **kwargs
    )


def test_full_day_leave_reschedule_blocks_with_leave_conflict(env):
    destination = TODAY + timedelta(days=1)
    # Approved full-day leave matching working hours (10:00 - 17:00)
    ProviderLeave.objects.create(
        provider=env['provider'],
        start_datetime=at(destination, 10),
        end_datetime=at(destination, 17),
        status='APPROVED'
    )
    # Initial booking rejects with LEAVE_CONFLICT
    other_customer = User.objects.create_user(email='other@f005.test')
    with pytest.raises(AppointmentValidationException) as book_err:
        book(env, on_date=destination, customer=other_customer)
    assert book_err.value.default_code == 'LEAVE_CONFLICT'

    # Customer books on TODAY
    appt = book(env, on_date=TODAY)
    assert appt.serial_number == 1 and appt.appointment_date == TODAY

    # Rescheduling to full-day leave must also reject with LEAVE_CONFLICT (not CAPACITY_EXCEEDED)
    with pytest.raises(AppointmentValidationException) as resch_err:
        AppointmentService.reschedule_appointment(
            appointment=appt, appointment_date=destination, actor=appt.customer
        )
    assert resch_err.value.default_code == 'LEAVE_CONFLICT', (
        f"Expected LEAVE_CONFLICT, got {resch_err.value.default_code}"
    )


def test_partial_day_leave_capacity_preserved_during_reschedule(env):
    destination = TODAY + timedelta(days=1)
    # Partial leave: 14:00 - 16:00 (2 hours blocked out of 7 hours -> 5 hours = 300 mins -> capacity 10)
    ProviderLeave.objects.create(
        provider=env['provider'],
        start_datetime=at(destination, 14),
        end_datetime=at(destination, 16),
        status='APPROVED'
    )
    appt = book(env, on_date=TODAY)
    # Rescheduling succeeds because partial leave reduces available minutes rather than blocking whole date
    moved = AppointmentService.reschedule_appointment(
        appointment=appt, appointment_date=destination, actor=appt.customer
    )
    assert moved.appointment_date == destination
    assert moved.serial_number == 1
    # Check that capacity correctly reflects partial leave deduction
    cap = date_capacity(env['provider'], destination)
    assert cap['daily_capacity'] == 10
    assert cap['allocated_count'] == 1
    assert cap['remaining_capacity'] == 9


@pytest.mark.django_db(transaction=True)
def test_postgresql_reschedule_vs_manager_unassignment_concurrency(env):
    if connection.vendor != 'postgresql':
        pytest.skip('Real PostgreSQL row locks required')
    destination = TODAY + timedelta(days=1)
    appt = book(env, on_date=TODAY)
    ps = env['ps']

    barrier = Barrier(2)
    results = {}

    def run_reschedule():
        close_old_connections()
        barrier.wait()
        try:
            moved = AppointmentService.reschedule_appointment(
                appointment=appt, appointment_date=destination, actor=appt.customer
            )
            results['reschedule'] = ('ok', moved.appointment_date)
        except Exception as e:
            results['reschedule'] = ('err', getattr(e, 'default_code', type(e).__name__), str(e))
        finally:
            close_old_connections()

    def run_unassign():
        close_old_connections()
        barrier.wait()
        try:
            ProviderOps.remove_service_from_provider(
                provider=env['provider'], provider_service_id=ps.pk
            )
            results['unassign'] = ('ok', 'deleted')
        except Exception as e:
            results['unassign'] = ('err', getattr(e, 'default_code', type(e).__name__), str(e))
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(run_reschedule)
        f2 = pool.submit(run_unassign)
        f1.result()
        f2.result()

    # Both workers must terminate cleanly without deadlock
    assert 'reschedule' in results and 'unassign' in results
    resch_status = results['reschedule'][0]
    unassign_status = results['unassign'][0]

    # Because both acquire provider lock first:
    # If reschedule won the provider lock first: reschedule is 'ok', unassign is 'ok' (service removed after reschedule committed)
    # If unassign won the provider lock first: unassign is 'ok', reschedule gets 'PROVIDER_SERVICE_NOT_ASSIGNED'
    if resch_status == 'ok':
        assert unassign_status == 'ok'
        appt.refresh_from_db()
        assert appt.appointment_date == destination
    else:
        assert resch_status == 'err' and unassign_status == 'ok'
        assert results['reschedule'][1] in ['PROVIDER_SERVICE_NOT_ASSIGNED', 'PROVIDER_SERVICE_NOT_FOUND', 'APPLICATION_ERROR']
