from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Service
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def queue_setup(db):
    manager = User.objects.create_user(email='manager@queue.test', password='Password123!')
    provider_user = User.objects.create_user(email='provider@queue.test', password='Password123!')
    customer = User.objects.create_user(email='customer@queue.test', password='Password123!')
    org = Organization.objects.create(
        name='Queue Clinic',
        slug='queue-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    membership = OrganizationMembership.objects.create(user=provider_user, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(
        membership=membership,
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(organization=org, name='Consult', duration_minutes=30, price='10.00')
    from apps.providers.models import ProviderService, WeeklySchedule
    from datetime import time
    ProviderService.objects.create(provider=provider, service=service)
    for day_idx in range(7):
        WeeklySchedule.objects.create(
            provider=provider,
            day_of_week=day_idx,
            start_time=time(8, 0),
            end_time=time(18, 0),
            is_working_day=True,
        )
    return locals()


def _appointment(s, customer=None, provider=None, start=None, status=Appointment.Status.CONFIRMED):
    start = start or timezone.make_aware(datetime(2030, 1, 7, 9, 0), timezone=TZ)
    return Appointment.objects.create(
        organization=s['org'], customer=customer or s['customer'],
        provider=provider or s['provider'], service=s['service'],
        start_datetime=start, end_datetime=start + timedelta(minutes=30), status=status,
    )


def _login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestQueueService:
    def test_check_in_creates_sequential_tokens_per_provider_and_date(self, queue_setup):
        s = queue_setup
        first = QueueService.check_in_appointment(appointment=_appointment(s))
        second = QueueService.check_in_appointment(
            appointment=_appointment(s, customer=User.objects.create_user(email='second@queue.test'))
        )
        assert first.token_number == 1
        assert second.token_number == 2
        assert first.queue_date == date(2030, 1, 7)
        assert first.status == QueueEntry.Status.WAITING
        assert first.appointment.status == Appointment.Status.CHECKED_IN

    def test_token_restarts_for_next_day_and_provider(self, queue_setup):
        s = queue_setup
        first = QueueService.check_in_appointment(appointment=_appointment(s))
        next_day = timezone.make_aware(datetime(2030, 1, 8, 9, 0), timezone=TZ)
        second = QueueService.check_in_appointment(
            appointment=_appointment(s, customer=User.objects.create_user(email='second@queue.test'), start=next_day)
        )
        other_user = User.objects.create_user(email='other-provider@queue.test')
        other_membership = OrganizationMembership.objects.create(user=other_user, organization=s['org'], role='PROVIDER')
        other_provider = ProviderProfile.objects.create(
            membership=other_membership,
            application_status=ProviderProfile.ApplicationStatus.APPROVED
        )
        third = QueueService.check_in_appointment(
            appointment=_appointment(s, customer=User.objects.create_user(email='third@queue.test'), provider=other_provider)
        )
        assert first.token_number == second.token_number == third.token_number == 1

    def test_lifecycle_and_appointment_sync(self, queue_setup):
        s = queue_setup
        entry = QueueService.check_in_appointment(appointment=_appointment(s))
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=entry.queue_date)
        QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)
        completed = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)
        assert completed.status == QueueEntry.Status.COMPLETED
        assert completed.completed_at is not None
        assert completed.appointment.status == Appointment.Status.COMPLETED

    def test_skip_marks_appointment_no_show(self, queue_setup):
        s = queue_setup
        entry = QueueService.check_in_appointment(appointment=_appointment(s))
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=entry.queue_date)
        skipped = QueueService.skip_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)
        assert skipped.status == QueueEntry.Status.SKIPPED
        assert skipped.skipped_at is not None
        assert skipped.appointment.status == Appointment.Status.NO_SHOW

    def test_token_constraint_rejects_duplicate(self, queue_setup):
        s = queue_setup
        first = QueueService.check_in_appointment(appointment=_appointment(s))
        with pytest.raises(IntegrityError):
            QueueEntry.objects.create(
                organization=s['org'], appointment=_appointment(s, customer=User.objects.create_user(email='duplicate@queue.test')),
                provider=s['provider'], queue_date=first.queue_date, token_number=first.token_number,
            )


@pytest.mark.django_db
class TestQueueAPI:
    def test_demoted_provider_profile_is_no_longer_discoverable_or_manageable(self, queue_setup):
        s = queue_setup
        s['provider_membership'] = OrganizationMembership.objects.get(
            user=s['provider_user'], organization=s['org']
        )
        s['provider_membership'].role = OrganizationMembership.Role.STAFF
        s['provider_membership'].save(update_fields=['role'])

        client = APIClient()
        _login(client, s['manager'])
        list_url = reverse(
            'providers:provider_list_create',
            kwargs={'organization_id': s['org'].id},
        )
        assert client.get(list_url).data == []
        detail_url = reverse(
            'providers:provider_detail',
            kwargs={'organization_id': s['org'].id, 'provider_id': s['provider'].id},
        )
        assert client.get(detail_url).status_code == 404

    def test_customer_can_check_in_and_view_only_own_queue(self, queue_setup):
        s = queue_setup
        appointment = _appointment(s)
        client = APIClient()
        _login(client, s['customer'])
        checkin = client.post(reverse('appointments:appointment_check_in', kwargs={'organization_id': s['org'].id, 'appointment_id': appointment.id}))
        assert checkin.status_code == 200
        assert checkin.data['status'] == Appointment.Status.CHECKED_IN
        response = client.get(reverse('queue:my_queue', kwargs={'organization_id': s['org'].id}))
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]['token_number'] == 1

    def test_provider_can_manage_queue_but_customer_cannot_call_next(self, queue_setup):
        s = queue_setup
        entry = QueueService.check_in_appointment(appointment=_appointment(s))
        url = reverse('queue:call_next', kwargs={'organization_id': s['org'].id, 'provider_id': s['provider'].id})
        customer_client = APIClient()
        _login(customer_client, s['customer'])
        assert customer_client.post(url).status_code == 403
        provider_client = APIClient()
        _login(provider_client, s['provider_user'])
        assert provider_client.post(f'{url}?date={entry.queue_date.isoformat()}').status_code == 200
        assert QueueEntry.objects.get(id=entry.id).status == QueueEntry.Status.SKIPPED or QueueEntry.objects.get(id=entry.id).status == QueueEntry.Status.CALLED

    def test_phase5_serial_allocation_and_auto_queue_creation(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 1, 10, 0), timezone=TZ)
        
        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        assert appt1.serial_number == 1
        assert hasattr(appt1, 'queue_entry') or QueueEntry.objects.filter(appointment=appt1).exists()
        q1 = QueueEntry.objects.get(appointment=appt1)
        assert q1.serial_number == 1
        assert q1.is_checked_in is False

        user2 = User.objects.create_user(email='user2@queue.test')
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=user2,
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )
        assert appt2.serial_number == 2
        q2 = QueueEntry.objects.get(appointment=appt2)
        assert q2.serial_number == 2

    def test_phase5_call_next_requires_checked_in_patient(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 2, 10, 0), timezone=TZ)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        user2 = User.objects.create_user(email='user2@queue.test')
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=user2,
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )

        # Neither is checked in yet -> call_next fails
        from apps.queue.services import NoWaitingCustomerException
        with pytest.raises(NoWaitingCustomerException):
            QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=appt1.appointment_date)

        # Check in Appt 2 (Serial #2) first
        QueueService.check_in_appointment(appointment=appt2)
        called = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=appt2.appointment_date)
        assert called.serial_number == 2

    def test_phase5_urgent_bump_prioritizes_queue(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 3, 10, 0), timezone=TZ)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        user2 = User.objects.create_user(email='user2@queue.test')
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=user2,
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )

        QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        # Mark Appt 2 as urgent
        QueueService.mark_urgent(organization_id=s['org'].id, queue_entry_id=q2.id, reason='Emergency Triage')

        # call_next should pick Serial #2 due to urgent flag!
        called = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=appt1.appointment_date)
        assert called.serial_number == 2
        assert called.is_urgent is True

    def test_phase5_front_desk_walk_in_registration(self, queue_setup):
        s = queue_setup
        walk_in_appt = QueueService.register_walk_in(
            organization_id=s['org'].id,
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            first_name='Rahim',
            last_name='Uddin',
            phone_number='+8801799887766',
        )
        assert walk_in_appt.booking_channel == Appointment.BookingChannel.FRONT_DESK
        assert walk_in_appt.arrival_type == Appointment.ArrivalType.WALK_IN
        q_entry = QueueEntry.objects.get(appointment=walk_in_appt)
        assert q_entry.is_checked_in is True

    def test_phase5_readiness_state_and_eta_calculation(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 4, 10, 0), timezone=TZ)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        q1 = QueueService.check_in_appointment(appointment=appt1)

        eta_info = QueueService.calculate_readiness_and_eta(q1)
        assert eta_info['readiness_state'] == QueueEntry.ReadinessState.BE_READY
        assert eta_info['people_ahead'] == 0

    def test_phase5_cancellation_sync(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 5, 10, 0), timezone=TZ)
        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        entry = QueueService.check_in_appointment(appointment=appt)
        assert entry.status == QueueEntry.Status.WAITING

        AppointmentService.cancel_appointment(appointment=appt, reason='Customer changed mind')
        appt.refresh_from_db()
        entry.refresh_from_db()
        assert appt.status == Appointment.Status.CANCELLED
        assert entry.status == QueueEntry.Status.CANCELLED

        from apps.queue.services import NoWaitingCustomerException
        with pytest.raises(NoWaitingCustomerException):
            QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=appt.appointment_date)

    def test_phase5_urgent_eta_calculation(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 6, 10, 0), timezone=TZ)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        user2 = User.objects.create_user(email='user2_eta@queue.test')
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=user2,
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )

        q1 = QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        # Mark appt2 (Serial #2) urgent
        QueueService.mark_urgent(organization_id=s['org'].id, queue_entry_id=q2.id, reason='Urgent case')

        # ETA for q1 (Serial #1, normal) must include q2 (urgent) ahead of it
        eta_q1 = QueueService.calculate_readiness_and_eta(q1)
        assert eta_q1['people_ahead'] == 1
        assert eta_q1['estimated_wait_minutes'] == 30

    def test_phase5_active_consultation_elapsed_time_deduction(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 7, 10, 0), timezone=TZ)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        user2 = User.objects.create_user(email='user2_elapsed@queue.test')
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=user2,
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )

        q1 = QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=appt1.appointment_date)
        # Start q1 10 minutes ago (duration = 30 mins -> remaining = 20 mins)
        q1.status = QueueEntry.Status.IN_PROGRESS
        q1.started_at = timezone.now() - timedelta(minutes=10)
        q1.save()

        eta_q2 = QueueService.calculate_readiness_and_eta(q2)
        assert eta_q2['people_ahead'] == 1
        assert eta_q2['estimated_wait_minutes'] == 20

    def test_phase5_db_unique_constraint_provider_date_serial(self, queue_setup):
        s = queue_setup
        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 8, 10, 0), timezone=TZ)
        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )

        user2 = User.objects.create_user(email='dup_serial@queue.test')
        with pytest.raises(IntegrityError):
            Appointment.objects.create(
                organization=s['org'], customer=user2, provider=s['provider'],
                service=s['service'], appointment_date=appt1.appointment_date,
                serial_number=appt1.serial_number, start_datetime=start_time,
                end_datetime=start_time + timedelta(minutes=30),
            )

    def test_phase5_walk_in_analytics_metrics(self, queue_setup):
        s = queue_setup
        from apps.analytics.services import AnalyticsService
        walk_in_appt = QueueService.register_walk_in(
            organization_id=s['org'].id,
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            first_name='Anis',
            last_name='Rahman',
        )
        summary = AnalyticsService.organization_summary(organization=s['org'], start_date=date(2020, 1, 1), end_date=date(2040, 1, 1))
        assert summary['queue_summary']['walk_in_volume'] >= 1
        assert summary['queue_summary']['booking_channels']['front_desk'] >= 1
        assert summary['queue_summary']['arrival_types']['walk_in'] >= 1

    def test_staff_permissions_for_start_complete_and_cross_org_isolation(self, queue_setup):
        s = queue_setup
        staff_user = User.objects.create_user(email='staff@queue.test', password='Password123!')
        OrganizationMembership.objects.create(user=staff_user, organization=s['org'], role='STAFF')

        other_org = Organization.objects.create(name='Other Clinic', slug='other-clinic', verification_status=Organization.VerificationStatus.APPROVED)
        other_staff = User.objects.create_user(email='otherstaff@queue.test', password='Password123!')
        OrganizationMembership.objects.create(user=other_staff, organization=other_org, role='STAFF')

        from apps.appointments.services import AppointmentService
        start_time = timezone.make_aware(datetime(2030, 2, 9, 10, 0), timezone=TZ)
        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            start_datetime=start_time,
        )
        entry = QueueService.check_in_appointment(appointment=appt)

        start_url = reverse('queue:queue_start', kwargs={'organization_id': s['org'].id, 'queue_entry_id': entry.id})
        complete_url = reverse('queue:queue_complete', kwargs={'organization_id': s['org'].id, 'queue_entry_id': entry.id})

        # 1. Customer cannot start or complete
        client = APIClient()
        _login(client, s['customer'])
        assert client.post(start_url).status_code == 403
        assert client.post(complete_url).status_code == 403

        # 2. Staff from another org cannot start or complete
        _login(client, other_staff)
        assert client.post(start_url).status_code == 403
        assert client.post(complete_url).status_code == 403

        # 3. Staff from same org CAN start and complete
        _login(client, staff_user)
        # First call_next to transition to CALLED
        call_url = reverse('queue:call_next', kwargs={'organization_id': s['org'].id, 'provider_id': s['provider'].id})
        call_res = client.post(f'{call_url}?date={entry.queue_date.isoformat()}')
        assert call_res.status_code == 200
        assert call_res.data['status'] == QueueEntry.Status.CALLED

        # Staff starts service
        start_res = client.post(start_url)
        assert start_res.status_code == 200
        assert start_res.data['status'] == QueueEntry.Status.IN_PROGRESS

        # Staff completes service
        complete_res = client.post(complete_url)
        assert complete_res.status_code == 200
        assert complete_res.data['status'] == QueueEntry.Status.COMPLETED

