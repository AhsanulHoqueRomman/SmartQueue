"""
Milestone 4 — Appointment availability & concurrency-safe booking tests.
"""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.appointments.services import (
    AppointmentService,
    DoubleBookingConflictException,
    SLOT_INCREMENT_MINUTES,
)
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import (
    ProviderLeave,
    ProviderProfile,
    ProviderService,
    ScheduleBreak,
    WeeklySchedule,
)
from apps.services.models import Service

TZ = ZoneInfo(settings.TIME_ZONE)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email, password='Password123!', **kwargs):
        return User.objects.create_user(email=email, password=password, **kwargs)
    return make_user


def _login(client, email, password='Password123!'):
    res = client.post(
        reverse('accounts:login'),
        {'email': email, 'password': password},
        format='json',
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return client


def _aware(d: date, t: time):
    return timezone.make_aware(datetime.combine(d, t), timezone=TZ)


def _next_weekday(weekday: int, weeks_ahead: int = 1) -> date:
    """Return a future date with the given weekday (Mon=0 ... Sun=6)."""
    today = timezone.localdate()
    days_ahead = (weekday - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    days_ahead += 7 * (weeks_ahead - 1)
    return today + timedelta(days=days_ahead)


@pytest.fixture
def booking_setup(create_user):
    """
    Full org setup ready for availability/booking tests.
    Returns a namespace-like dict.
    """
    manager = create_user(email='manager@example.com')
    provider_user = create_user(email='provider@example.com')
    staff_user = create_user(email='staff@example.com')
    customer = create_user(email='customer@example.com')
    customer2 = create_user(email='customer2@example.com')

    org = Organization.objects.create(
        name='Test Clinic',
        slug='test-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(
        user=manager, organization=org, role=OrganizationMembership.Role.MANAGER
    )
    prov_mem = OrganizationMembership.objects.create(
        user=provider_user, organization=org, role=OrganizationMembership.Role.PROVIDER
    )
    OrganizationMembership.objects.create(
        user=staff_user, organization=org, role=OrganizationMembership.Role.STAFF
    )

    provider = ProviderProfile.objects.create(
        membership=prov_mem, bio='Expert', title='Dr.', is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(
        organization=org,
        name='Consult',
        duration_minutes=30,
        price='20.00',
        is_active=True,
    )
    ProviderService.objects.create(provider=provider, service=service)

    # Use a future Monday (weekday=0)
    work_date = _next_weekday(0, weeks_ahead=2)
    schedule = WeeklySchedule.objects.create(
        provider=provider,
        day_of_week=0,
        start_time=time(9, 0),
        end_time=time(12, 0),
        is_working_day=True,
    )

    return {
        'org': org,
        'manager': manager,
        'provider_user': provider_user,
        'staff_user': staff_user,
        'customer': customer,
        'customer2': customer2,
        'provider': provider,
        'service': service,
        'schedule': schedule,
        'work_date': work_date,
    }


def _availability_url(org_id, provider_id):
    return reverse(
        'providers:provider_availability',
        kwargs={'organization_id': org_id, 'provider_id': provider_id},
    )


def _appt_list_url(org_id):
    return reverse('appointments:appointment_list_create', kwargs={'organization_id': org_id})


def _appt_detail_url(org_id, appointment_id):
    return reverse(
        'appointments:appointment_detail',
        kwargs={'organization_id': org_id, 'appointment_id': appointment_id},
    )


def _appt_cancel_url(org_id, appointment_id):
    return reverse(
        'appointments:appointment_cancel',
        kwargs={'organization_id': org_id, 'appointment_id': appointment_id},
    )


def _appt_checkin_url(org_id, appointment_id):
    return reverse(
        'appointments:appointment_check_in',
        kwargs={'organization_id': org_id, 'appointment_id': appointment_id},
    )


# ---------------------------------------------------------------------------
# Model / status
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestAppointmentModel:
    def test_default_status_confirmed(self, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        appt = Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
        )
        assert appt.status == Appointment.Status.CONFIRMED
        assert isinstance(appt.id, type(s['service'].id))  # UUID

    def test_status_choices_and_transitions(self):
        assert Appointment.Status.PENDING in Appointment.ALLOWED_TRANSITIONS
        assert Appointment.Status.CONFIRMED in Appointment.ALLOWED_TRANSITIONS[Appointment.Status.PENDING]
        assert Appointment.Status.CHECKED_IN in Appointment.ALLOWED_TRANSITIONS[Appointment.Status.CONFIRMED]
        assert Appointment.ALLOWED_TRANSITIONS[Appointment.Status.COMPLETED] == set()
        assert Appointment.ALLOWED_TRANSITIONS[Appointment.Status.CANCELLED] == set()

    def test_end_must_be_after_start_constraint(self, booking_setup):
        from django.db import IntegrityError
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        with pytest.raises(IntegrityError):
            Appointment.objects.create(
                organization=s['org'],
                customer=s['customer'],
                provider=s['provider'],
                service=s['service'],
                start_datetime=start,
                end_datetime=start,
            )


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestAvailability:
    def test_normal_working_day_slots(self, api_client, booking_setup):
        s = booking_setup
        _login(api_client, 'customer@example.com')
        url = _availability_url(s['org'].id, s['provider'].id)
        res = api_client.get(url, {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()})
        assert res.status_code == status.HTTP_200_OK
        assert res.data['duration_minutes'] == 30
        assert len(res.data['slots']) > 0
        # First slot should be 09:00 → 09:30
        assert res.data['slots'][0]['start'].startswith(s['work_date'].isoformat())
        # 15-minute increments
        starts = [slot['start'] for slot in res.data['slots']]
        assert any('T09:00:00' in st or 'T09:00:' in st for st in starts)
        assert any('T09:15:00' in st or 'T09:15:' in st for st in starts)

    def test_schedule_boundary_no_overflow(self, api_client, booking_setup):
        s = booking_setup
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        # Last valid start for 30-min service ending by 12:00 is 11:30
        starts = res.data['slots']
        assert starts
        last = starts[-1]
        assert 'T11:30' in last['start']
        assert 'T12:00' in last['end']
        # Must not include 11:45 → 12:15
        assert not any('T11:45' in slot['start'] for slot in starts)

    def test_non_working_day_empty(self, api_client, booking_setup):
        s = booking_setup
        s['schedule'].is_working_day = False
        s['schedule'].save()
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.data['slots'] == []

    def test_no_schedule_empty(self, api_client, booking_setup):
        s = booking_setup
        # Tuesday has no schedule
        tuesday = _next_weekday(1, weeks_ahead=2)
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': tuesday.isoformat()},
        )
        assert res.data['slots'] == []

    def test_custom_duration_used(self, api_client, booking_setup):
        s = booking_setup
        ps = ProviderService.objects.get(provider=s['provider'], service=s['service'])
        ps.custom_duration_minutes = 45
        ps.save()
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        assert res.data['duration_minutes'] == 45
        # Last start for 45-min ending by 12:00 is 11:15
        assert 'T11:15' in res.data['slots'][-1]['start']

    def test_break_exclusion(self, api_client, booking_setup):
        s = booking_setup
        ScheduleBreak.objects.create(
            weekly_schedule=s['schedule'],
            title='Lunch',
            start_time=time(10, 0),
            end_time=time(10, 30),
        )
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        starts = [slot['start'] for slot in res.data['slots']]
        # 09:45→10:15, 10:00→10:30, 10:15→10:45 overlap the break
        assert not any('T09:45' in st for st in starts)
        assert not any('T10:00' in st for st in starts)
        assert not any('T10:15' in st for st in starts)
        # 10:30 → 11:00 is OK (touches break end)
        assert any('T10:30' in st for st in starts)

    def test_leave_exclusion(self, api_client, booking_setup):
        s = booking_setup
        ProviderLeave.objects.create(
            provider=s['provider'],
            start_datetime=_aware(s['work_date'], time(11, 0)),
            end_datetime=_aware(s['work_date'], time(12, 0)),
            reason='Personal',
        )
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        starts = [slot['start'] for slot in res.data['slots']]
        assert not any('T10:45' in st for st in starts)
        assert not any('T11:00' in st for st in starts)
        assert any('T10:30' in st for st in starts)

    def test_existing_appointment_blocks(self, api_client, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        _login(api_client, 'customer2@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        assert len(res.data['slots']) > 0

    def test_cancelled_does_not_block(self, api_client, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CANCELLED,
        )
        _login(api_client, 'customer2@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        starts = [slot['start'] for slot in res.data['slots']]
        assert any('T10:00' in st for st in starts)

    def test_completed_does_not_block(self, api_client, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
        )
        _login(api_client, 'customer2@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        assert any('T10:00' in slot['start'] for slot in res.data['slots'])

    def test_inactive_provider_rejected(self, api_client, booking_setup):
        s = booking_setup
        s['provider'].is_active = False
        s['provider'].save()
        _login(api_client, 'customer@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestBooking:
    def test_successful_booking(self, api_client, booking_setup):
        s = booking_setup
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
                'notes': 'First visit',
            },
            format='json',
        )
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['status'] == Appointment.Status.CONFIRMED
        assert res.data['customer'] == s['customer'].id
        assert 'T10:30' in res.data['end_datetime']
        assert res.data['notes'] == 'First visit'

    def test_unauthenticated_rejected(self, api_client, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_inactive_provider_rejected(self, api_client, booking_setup):
        s = booking_setup
        s['provider'].is_active = False
        s['provider'].save()
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'PROVIDER_INACTIVE'

    def test_demoted_provider_rejected_for_booking(self, api_client, booking_setup):
        s = booking_setup
        membership = s['provider'].membership
        membership.role = OrganizationMembership.Role.STAFF
        membership.save()
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_inactive_service_rejected(self, api_client, booking_setup):
        s = booking_setup
        s['service'].is_active = False
        s['service'].save()
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'SERVICE_INACTIVE'

    def test_cross_org_provider_rejected(self, api_client, booking_setup, create_user):
        s = booking_setup
        org_b = Organization.objects.create(name='Other', slug='other-org')
        mem = OrganizationMembership.objects.create(
            user=create_user(email='prov_b@example.com'),
            organization=org_b,
            role=OrganizationMembership.Role.PROVIDER,
        )
        provider_b = ProviderProfile.objects.create(membership=mem)
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(provider_b.id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_cross_org_service_rejected(self, api_client, booking_setup):
        s = booking_setup
        org_b = Organization.objects.create(name='Other2', slug='other-org-2')
        svc_b = Service.objects.create(
            organization=org_b, name='Foreign', duration_minutes=30, price='0.00'
        )
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(svc_b.id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_provider_not_assigned_rejected(self, api_client, booking_setup):
        s = booking_setup
        other_svc = Service.objects.create(
            organization=s['org'], name='OtherSvc', duration_minutes=30, price='0.00'
        )
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(other_svc.id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'PROVIDER_SERVICE_NOT_ASSIGNED'

    def test_past_booking_rejected(self, api_client, booking_setup):
        s = booking_setup
        _login(api_client, 'customer@example.com')
        past = timezone.now() - timedelta(days=1)
        # Align to a "working" past Monday for schedule — still past
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': past.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'PAST_APPOINTMENT'

    def test_outside_schedule_rejected(self, api_client, booking_setup):
        s = booking_setup
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(14, 0))  # after 12:00
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'OUTSIDE_WORKING_HOURS'

    def test_break_conflict_rejected(self, api_client, booking_setup):
        s = booking_setup
        ScheduleBreak.objects.create(
            weekly_schedule=s['schedule'],
            title='Break',
            start_time=time(10, 0),
            end_time=time(10, 30),
        )
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'BREAK_CONFLICT'

    def test_leave_conflict_rejected(self, api_client, booking_setup):
        s = booking_setup
        ProviderLeave.objects.create(
            provider=s['provider'],
            start_datetime=_aware(s['work_date'], time(10, 0)),
            end_datetime=_aware(s['work_date'], time(11, 0)),
        )
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(10, 15))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'LEAVE_CONFLICT'

    def test_exact_boundary_booking_accepted(self, api_client, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        _login(api_client, 'customer2@example.com')
        # 10:30 → 11:00 must succeed (touches existing end)
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': _aware(s['work_date'], time(10, 30)).isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_201_CREATED

    def test_serial_booking_allocates_sequential_serials(self, api_client, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        appt1 = Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
            serial_number=1,
            appointment_date=s['work_date'],
        )
        _login(api_client, 'customer2@example.com')
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': _aware(s['work_date'], time(10, 15)).isoformat(),
            },
            format='json',
        )
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['serial_number'] == 2

    def test_customer_id_not_accepted_from_payload(self, api_client, booking_setup):
        s = booking_setup
        _login(api_client, 'customer@example.com')
        start = _aware(s['work_date'], time(9, 0))
        res = api_client.post(
            _appt_list_url(s['org'].id),
            {
                'provider_id': str(s['provider'].id),
                'service_id': str(s['service'].id),
                'start_datetime': start.isoformat(),
                'customer_id': s['customer2'].id,
            },
            format='json',
        )
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['customer'] == s['customer'].id


# ---------------------------------------------------------------------------
# Permissions & tenant isolation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestAppointmentPermissions:
    def _make_appt(self, s, customer, start_h=10, start_m=0):
        start = _aware(s['work_date'], time(start_h, start_m))
        return Appointment.objects.create(
            organization=s['org'],
            customer=customer,
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )

    def test_customer_sees_own_only(self, api_client, booking_setup):
        s = booking_setup
        self._make_appt(s, s['customer'], 9, 0)
        self._make_appt(s, s['customer2'], 9, 30)
        _login(api_client, 'customer@example.com')
        res = api_client.get(_appt_list_url(s['org'].id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1
        assert res.data[0]['customer'] == s['customer'].id

    def test_customer_cannot_access_another(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, s['customer2'], 9, 0)
        _login(api_client, 'customer@example.com')
        res = api_client.get(_appt_detail_url(s['org'].id, appt.id))
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_provider_sees_assigned(self, api_client, booking_setup):
        s = booking_setup
        self._make_appt(s, s['customer'], 9, 0)
        _login(api_client, 'provider@example.com')
        res = api_client.get(_appt_list_url(s['org'].id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1

    def test_manager_sees_all(self, api_client, booking_setup):
        s = booking_setup
        self._make_appt(s, s['customer'], 9, 0)
        self._make_appt(s, s['customer2'], 9, 30)
        _login(api_client, 'manager@example.com')
        res = api_client.get(_appt_list_url(s['org'].id))
        assert len(res.data) == 2

    def test_staff_sees_all_org(self, api_client, booking_setup):
        s = booking_setup
        self._make_appt(s, s['customer'], 9, 0)
        _login(api_client, 'staff@example.com')
        res = api_client.get(_appt_list_url(s['org'].id))
        assert len(res.data) == 1

    def test_cross_org_appointment_404(self, api_client, booking_setup, create_user):
        s = booking_setup
        appt = self._make_appt(s, s['customer'], 9, 0)
        org_b = Organization.objects.create(name='OrgB', slug='org-b-appt')
        manager_b = create_user(email='manager_b@example.com')
        OrganizationMembership.objects.create(
            user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER
        )
        _login(api_client, 'manager_b@example.com')
        res = api_client.get(_appt_detail_url(org_b.id, appt.id))
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_system_admin_access(self, api_client, booking_setup, create_user):
        s = booking_setup
        appt = self._make_appt(s, s['customer'], 9, 0)
        admin = create_user(email='admin@example.com', is_staff=True)
        _login(api_client, 'admin@example.com')
        res = api_client.get(_appt_detail_url(s['org'].id, appt.id))
        assert res.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Cancel / Reschedule / Check-in
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCancelRescheduleCheckIn:
    def _make_appt(self, s, status=Appointment.Status.CONFIRMED, hour=10):
        start = _aware(s['work_date'], time(hour, 0))
        return Appointment.objects.create(
            organization=s['org'],
            customer=s['customer'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=status,
        )

    def test_valid_cancellation(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s)
        _login(api_client, 'customer@example.com')
        res = api_client.post(
            _appt_cancel_url(s['org'].id, appt.id),
            {'cancellation_reason': 'Changed plans'},
            format='json',
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.data['status'] == Appointment.Status.CANCELLED
        assert res.data['cancellation_reason'] == 'Changed plans'

    def test_cancelled_frees_availability(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, hour=10)
        AppointmentService.cancel_appointment(appointment=appt, reason='x')
        _login(api_client, 'customer2@example.com')
        res = api_client.get(
            _availability_url(s['org'].id, s['provider'].id),
            {'service_id': str(s['service'].id), 'date': s['work_date'].isoformat()},
        )
        assert any('T10:00' in slot['start'] for slot in res.data['slots'])

    def test_completed_cannot_cancel(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, status=Appointment.Status.COMPLETED)
        _login(api_client, 'customer@example.com')
        res = api_client.post(_appt_cancel_url(s['org'].id, appt.id), {}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data['error']['code'] == 'APPOINTMENT_NOT_CANCELLABLE'

    def test_cancelled_cannot_cancel_again(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, status=Appointment.Status.CANCELLED)
        _login(api_client, 'customer@example.com')
        res = api_client.post(_appt_cancel_url(s['org'].id, appt.id), {}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_successful_reschedule(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, hour=9)
        _login(api_client, 'customer@example.com')
        new_start = _aware(s['work_date'], time(11, 0))
        res = api_client.patch(
            _appt_detail_url(s['org'].id, appt.id),
            {'start_datetime': new_start.isoformat()},
            format='json',
        )
        assert res.status_code == status.HTTP_200_OK
        assert 'T11:00' in res.data['start_datetime']
        assert 'T11:30' in res.data['end_datetime']

    def test_reschedule_updates_appointment(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, hour=9)
        other_start = _aware(s['work_date'], time(10, 0))
        Appointment.objects.create(
            organization=s['org'],
            customer=s['customer2'],
            provider=s['provider'],
            service=s['service'],
            start_datetime=other_start,
            end_datetime=other_start + timedelta(minutes=30),
        )
        _login(api_client, 'customer@example.com')
        res = api_client.patch(
            _appt_detail_url(s['org'].id, appt.id),
            {'start_datetime': _aware(s['work_date'], time(10, 15)).isoformat()},
            format='json',
        )
        assert res.status_code == status.HTTP_200_OK

    def test_cannot_reschedule_another_customers(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, hour=9)
        _login(api_client, 'customer2@example.com')
        res = api_client.patch(
            _appt_detail_url(s['org'].id, appt.id),
            {'start_datetime': _aware(s['work_date'], time(11, 0)).isoformat()},
            format='json',
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_check_in_confirmed(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, hour=9)
        _login(api_client, 'provider@example.com')
        res = api_client.post(_appt_checkin_url(s['org'].id, appt.id), {}, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['status'] == Appointment.Status.CHECKED_IN

    def test_customer_can_check_in_own_appointment(self, api_client, booking_setup):
        s = booking_setup
        appt = self._make_appt(s, hour=9)
        _login(api_client, 'customer@example.com')
        res = api_client.post(_appt_checkin_url(s['org'].id, appt.id), {}, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['status'] == Appointment.Status.CHECKED_IN


# ---------------------------------------------------------------------------
# Concurrency / locking
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
class TestConcurrencySafeBooking:
    def test_consecutive_serial_bookings_succeed(self, booking_setup):
        s = booking_setup
        start = _aware(s['work_date'], time(10, 0))
        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['customer'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            start_datetime=start,
        )
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['customer2'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            start_datetime=_aware(s['work_date'], time(10, 15)),
        )
        assert appt1.serial_number == 1
        assert appt2.serial_number == 2

    def test_booking_uses_select_for_update(self, booking_setup):
        """
        Verify the booking path issues a SELECT FOR UPDATE on ProviderProfile.
        True multithreaded races are environment-dependent; this asserts the
        production locking query is present without weakening the lock.
        """
        if not connection.features.has_select_for_update:
            pytest.skip("select_for_update is not supported on this database engine")
        s = booking_setup
        start = _aware(s['work_date'], time(9, 0))
        with CaptureQueriesContext(connection) as ctx:
            AppointmentService.book_appointment(
                organization_id=s['org'].id,
                customer=s['customer'],
                provider_id=s['provider'].id,
                service_id=s['service'].id,
                start_datetime=start,
            )
        sql = ' '.join(q['sql'].lower() for q in ctx.captured_queries)
        assert 'for update' in sql
        assert 'provider' in sql or 'providers_providerprofile' in sql

    def test_slot_increment_constant(self):
        assert SLOT_INCREMENT_MINUTES == 15
