from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService, InvalidAppointmentTransitionException, AppointmentValidationException
from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from apps.organizations.models import Organization, OrganizationMembership
from apps.organizations.services import OrganizationService
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService, InvalidCheckInException, ActiveQueueCustomerException, NoWaitingCustomerException, current_business_date
from apps.services.models import Service

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def p5_setup(db):
    manager = User.objects.create_user(email='p5-manager@smartqueue.test', password='Password123!')
    provider_user = User.objects.create_user(email='p5-provider@smartqueue.test', password='Password123!')
    staff_user = User.objects.create_user(email='p5-staff@smartqueue.test', password='Password123!')
    customer = User.objects.create_user(email='p5-customer@smartqueue.test', password='Password123!')
    customer2 = User.objects.create_user(email='p5-customer2@smartqueue.test', password='Password123!')

    org = Organization.objects.create(
        name='SmartQueue Hardened Clinic',
        slug='smartqueue-hardened-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    prov_mem = OrganizationMembership.objects.create(user=provider_user, organization=org, role='PROVIDER')
    OrganizationMembership.objects.create(user=staff_user, organization=org, role='STAFF')

    provider = ProviderProfile.objects.create(
        membership=prov_mem, title='Dr. Hardened', application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(organization=org, name='General Consultation', duration_minutes=15, price='50.00')
    ProviderService.objects.create(provider=provider, service=service)

    for day in range(7):
        WeeklySchedule.objects.create(
            provider=provider, day_of_week=day, start_time=time(8, 0), end_time=time(18, 0), is_working_day=True
        )

    return locals()


def _login(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestPhase5BusinessModelHardening:

    # ------------------------------------------------------------------
    # 1 - 7: Booking & Channel Security & Serial Allocation
    # ------------------------------------------------------------------

    def test_customer_booking_succeeds_without_start_datetime(self, p5_setup):
        s = p5_setup
        client = APIClient()
        _login(client, s['customer'])
        today = current_business_date()
        url = reverse('appointments:appointment_list_create', kwargs={'organization_id': s['org'].id})

        res = client.post(url, {
            'provider_id': str(s['provider'].id),
            'service_id': str(s['service'].id),
            'appointment_date': today.isoformat(),
            'notes': 'Checking serial booking flow',
        }, format='json')

        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['appointment_date'] == today.isoformat()
        assert res.data['serial_number'] == 1
        assert res.data['booking_channel'] == Appointment.BookingChannel.ONLINE
        assert res.data['arrival_type'] == Appointment.ArrivalType.SCHEDULED

    def test_customer_cannot_spoof_front_desk_or_walk_in(self, p5_setup):
        s = p5_setup
        client = APIClient()
        _login(client, s['customer'])
        today = current_business_date()
        url = reverse('appointments:appointment_list_create', kwargs={'organization_id': s['org'].id})

        # Malicious client sends FRONT_DESK + WALK_IN
        res = client.post(url, {
            'provider_id': str(s['provider'].id),
            'service_id': str(s['service'].id),
            'appointment_date': today.isoformat(),
            'booking_channel': 'FRONT_DESK',
            'arrival_type': 'WALK_IN',
        }, format='json')

        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['booking_channel'] == Appointment.BookingChannel.ONLINE
        assert res.data['arrival_type'] == Appointment.ArrivalType.SCHEDULED
        assert res.data['status'] == Appointment.Status.CONFIRMED

    def test_serial_assignment_and_uniqueness(self, p5_setup):
        s = p5_setup
        today = current_business_date()

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer2'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )

        assert appt1.serial_number == 1
        assert appt2.serial_number == 2
        assert appt1.queue_entry.serial_number == 1
        assert appt2.queue_entry.serial_number == 2

    # ------------------------------------------------------------------
    # 8 - 13: Queue Check-In & State Lifecycle
    # ------------------------------------------------------------------

    def test_check_in_date_validation(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        future_date = today + timedelta(days=2)

        future_appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=future_date,
        )

        # Checking in today for an appointment 2 days in future must fail
        with pytest.raises(InvalidCheckInException):
            QueueService.check_in_appointment(appointment=future_appt)

    def test_check_in_idempotent(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )

        entry1 = QueueService.check_in_appointment(appointment=appt)
        entry2 = QueueService.check_in_appointment(appointment=appt)
        assert entry1.id == entry2.id
        assert entry1.is_checked_in is True

    def test_cancelled_appointment_cannot_enter_queue(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )
        AppointmentService.cancel_appointment(appointment=appt, reason='User cancelled')
        with pytest.raises(InvalidCheckInException):
            QueueService.check_in_appointment(appointment=appt)

    def test_skipped_patient_becomes_no_show_and_cannot_be_called(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )
        entry = QueueService.check_in_appointment(appointment=appt)
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=today)
        skipped = QueueService.skip_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)

        assert skipped.status == QueueEntry.Status.SKIPPED
        assert skipped.appointment.status == Appointment.Status.NO_SHOW

        # Calling next when no other waiting customer exists raises NoWaitingCustomerException
        with pytest.raises(NoWaitingCustomerException):
            QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=today)

    # ------------------------------------------------------------------
    # 14 - 17: Call Next & Urgent Concurrency
    # ------------------------------------------------------------------

    def test_urgent_ordering_overrides_serial_order(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        appt1 = AppointmentService.book_appointment(organization_id=s['org'].id, customer=s['customer'], provider_id=s['provider'].id, service_id=s['service'].id, appointment_date=today)
        appt2 = AppointmentService.book_appointment(organization_id=s['org'].id, customer=s['customer2'], provider_id=s['provider'].id, service_id=s['service'].id, appointment_date=today)

        q1 = QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        # Mark second patient urgent
        QueueService.mark_urgent(organization_id=s['org'].id, queue_entry_id=q2.id, reason='Emergency chest pain')

        # call_next picks q2 first!
        called = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=today)
        assert called.id == q2.id

    def test_only_one_active_consultation_per_provider(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        appt1 = AppointmentService.book_appointment(organization_id=s['org'].id, customer=s['customer'], provider_id=s['provider'].id, service_id=s['service'].id, appointment_date=today)
        appt2 = AppointmentService.book_appointment(organization_id=s['org'].id, customer=s['customer2'], provider_id=s['provider'].id, service_id=s['service'].id, appointment_date=today)

        q1 = QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        # Call q1
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=today)

        # Attempting call_next while q1 is CALLED raises ActiveQueueCustomerException
        with pytest.raises(ActiveQueueCustomerException):
            QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=today)

    # ------------------------------------------------------------------
    # 18 - 20: Walk-In State Synchronization
    # ------------------------------------------------------------------

    def test_staff_walk_in_state_synchronization(self, p5_setup):
        s = p5_setup
        appt = QueueService.register_walk_in(
            organization_id=s['org'].id,
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            first_name='Jamal',
            last_name='Uddin',
            phone_number='01700000000',
        )

        assert appt.status == Appointment.Status.CHECKED_IN
        assert appt.booking_channel == Appointment.BookingChannel.FRONT_DESK
        assert appt.arrival_type == Appointment.ArrivalType.WALK_IN

        entry = appt.queue_entry
        assert entry.is_checked_in is True
        assert entry.checked_in_at is not None
        assert entry.status == QueueEntry.Status.WAITING

    # ------------------------------------------------------------------
    # 21 - 26: Reschedule Safety & Serial Reallocation
    # ------------------------------------------------------------------

    def test_reschedule_allocates_new_serial_on_new_date(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        target_date = today + timedelta(days=3)

        # Existing booking on target date
        existing_appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer2'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=target_date,
        )
        assert existing_appt.serial_number == 1

        # Customer appt on today
        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )
        assert appt.serial_number == 1

        # Reschedule to target_date
        rescheduled = AppointmentService.reschedule_appointment(
            appointment=appt,
            appointment_date=target_date,
        )

        assert rescheduled.appointment_date == target_date
        assert rescheduled.serial_number == 2
        assert rescheduled.queue_entry.queue_date == target_date
        assert rescheduled.queue_entry.serial_number == 2

    # ------------------------------------------------------------------
    # 27 - 32: ETA Engine & Readiness
    # ------------------------------------------------------------------

    def test_eta_deducts_active_consultation_elapsed_time(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        appt1 = AppointmentService.book_appointment(organization_id=s['org'].id, customer=s['customer'], provider_id=s['provider'].id, service_id=s['service'].id, appointment_date=today)
        appt2 = AppointmentService.book_appointment(organization_id=s['org'].id, customer=s['customer2'], provider_id=s['provider'].id, service_id=s['service'].id, appointment_date=today)

        q1 = QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=today)
        QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)

        eta2 = QueueService.calculate_readiness_and_eta(q2)
        assert eta2['people_ahead'] == 1
        assert eta2['estimated_wait_minutes'] <= 15
        assert eta2['readiness_state'] in (QueueEntry.ReadinessState.GET_READY, QueueEntry.ReadinessState.BE_READY)

    # ------------------------------------------------------------------
    # 33 - 38: Multi-Tenant & Token Security
    # ------------------------------------------------------------------

    def test_invitation_raw_token_absent_from_audit_log(self, p5_setup):
        s = p5_setup
        AuditLog.objects.all().delete()

        invitation = OrganizationService.create_provider_invitation(
            organization=s['org'],
            email='invited-doctor@smartqueue.test',
            actor=s['manager'],
        )

        audit_entry = AuditLog.objects.filter(action='PROVIDER_INVITATION_CREATED').first()
        assert audit_entry is not None
        # Raw invitation token must NOT be in metadata
        assert 'invitation_token' not in audit_entry.metadata
        assert 'token' not in audit_entry.metadata

    # ------------------------------------------------------------------
    # 39 - 43: Notifications
    # ------------------------------------------------------------------

    def test_booking_and_check_in_notifications_created_once(self, p5_setup):
        s = p5_setup
        today = current_business_date()
        Notification.objects.all().delete()

        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['customer'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today,
        )

        assert Notification.objects.filter(recipient=s['customer'], kind='APPOINTMENT_BOOKED').count() == 1

        # Check in twice (idempotent)
        QueueService.check_in_appointment(appointment=appt)
        QueueService.check_in_appointment(appointment=appt)

        assert Notification.objects.filter(recipient=s['customer'], kind='APPOINTMENT_CHECKED_IN').count() == 1
