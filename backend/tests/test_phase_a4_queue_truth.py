import pytest
from datetime import date, datetime, time, timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.appointments.services import AppointmentService
from apps.queue.services import QueueService, current_business_date, get_project_tz


@pytest.fixture
def queue_truth_setup(db):
    user_mgr = User.objects.create_user(email='mgr_a4@queue.test', first_name='Manager', last_name='A4')
    user_prov = User.objects.create_user(email='prov_a4@queue.test', first_name='Doctor', last_name='A4')
    user_staff = User.objects.create_user(email='staff_a4@queue.test', first_name='Staff', last_name='A4')
    user_cust1 = User.objects.create_user(email='cust1_a4@queue.test', first_name='Cust1', last_name='A4')
    user_cust2 = User.objects.create_user(email='cust2_a4@queue.test', first_name='Cust2', last_name='A4')
    user_cust3 = User.objects.create_user(email='cust3_a4@queue.test', first_name='Cust3', last_name='A4')

    org = Organization.objects.create(
        name='A4 Truth Clinic',
        slug='a4-truth-clinic',
        industry_type=Organization.IndustryType.HEALTHCARE,
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )

    OrganizationMembership.objects.create(
        user=user_mgr, organization=org, role=OrganizationMembership.Role.MANAGER, is_active=True
    )
    mem_prov = OrganizationMembership.objects.create(
        user=user_prov, organization=org, role=OrganizationMembership.Role.PROVIDER, is_active=True
    )
    OrganizationMembership.objects.create(
        user=user_staff, organization=org, role=OrganizationMembership.Role.STAFF, is_active=True
    )

    prov = ProviderProfile.objects.create(
        membership=mem_prov,
        title='Dr. A4 Truth',
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )

    srv = Service.objects.create(
        organization=org,
        name='A4 General Service',
        duration_minutes=15,
        is_active=True,
    )

    from apps.providers.models import ProviderService
    ProviderService.objects.create(provider=prov, service=srv)

    # Weekly schedule for provider
    from apps.providers.models import WeeklySchedule
    WeeklySchedule.objects.create(
        provider=prov,
        day_of_week=current_business_date().weekday(),
        is_working_day=True,
        start_time=time(0, 0),
        end_time=time(23, 59),
    )

    return {
        'org': org,
        'manager': user_mgr,
        'provider_user': user_prov,
        'staff_user': user_staff,
        'cust1': user_cust1,
        'cust2': user_cust2,
        'cust3': user_cust3,
        'provider': prov,
        'service': srv,
    }


@pytest.mark.django_db
class TestQueueLifecycleAndETATruth:
    def test_scenario1_before_expected_time_checked_in(self, queue_truth_setup):
        s = queue_truth_setup
        today = current_business_date()
        future_start = timezone.now() + timedelta(minutes=20)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust1'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=future_start,
        )
        q1 = QueueService.check_in_appointment(appointment=appt1)

        eta = QueueService.calculate_readiness_and_eta(q1)
        assert eta['readiness_state'] == QueueEntry.ReadinessState.BE_READY
        assert eta['people_ahead'] == 0
        assert eta['recommended_arrival_time'] is None  # Suppressed because already checked in

    def test_scenario2_overdue_unstarted_queue(self, queue_truth_setup):
        s = queue_truth_setup
        today = current_business_date()
        past_start = timezone.now() - timedelta(hours=3)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust1'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=past_start,
        )
        q1 = QueueService.check_in_appointment(appointment=appt1)

        eta = QueueService.calculate_readiness_and_eta(q1)
        assert eta['is_delayed'] is True
        assert eta['estimated_start_time'] is None  # No fake continuously sliding window
        assert eta['estimated_wait_minutes'] is None
        assert eta['people_ahead'] == 0

    def test_scenario3_two_people_ahead(self, queue_truth_setup):
        s = queue_truth_setup
        today = current_business_date()
        now_time = timezone.now() + timedelta(minutes=10)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust1'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=now_time,
        )
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust2'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=now_time + timedelta(minutes=15),
        )
        appt3 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust3'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=now_time + timedelta(minutes=30),
        )

        QueueService.check_in_appointment(appointment=appt1)
        QueueService.check_in_appointment(appointment=appt2)
        q3 = QueueService.check_in_appointment(appointment=appt3)

        eta3 = QueueService.calculate_readiness_and_eta(q3)
        assert eta3['people_ahead'] == 2
        assert eta3['readiness_state'] == QueueEntry.ReadinessState.GET_READY

    def test_scenario6_unchecked_in_lower_serial_excluded_from_ahead_count(self, queue_truth_setup):
        s = queue_truth_setup
        today = current_business_date()
        now_time = timezone.now() + timedelta(minutes=10)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust1'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=now_time,
        )
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust2'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=now_time + timedelta(minutes=15),
        )

        # Cust1 does NOT check in. Cust2 checks in.
        q2 = QueueService.check_in_appointment(appointment=appt2)

        eta2 = QueueService.calculate_readiness_and_eta(q2)
        # Cust1 is NOT checked in, so people_ahead for Cust2 is 0!
        assert eta2['people_ahead'] == 0

    def test_scenario9_customer_completion_rejected(self, queue_truth_setup):
        s = queue_truth_setup
        today = current_business_date()
        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust1'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=timezone.now() + timedelta(minutes=10),
        )
        q1 = QueueService.check_in_appointment(appointment=appt1)

        client = APIClient()
        client.force_authenticate(user=s['cust1'])

        # Customer attempts to complete queue entry
        url = f"/api/v1/organizations/{s['org'].id}/queue/{q1.id}/complete/"
        res = client.post(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_scenario10_authorized_staff_completion_succeeds(self, queue_truth_setup):
        s = queue_truth_setup
        today = current_business_date()
        appt1 = AppointmentService.book_appointment(
            organization_id=s['org'].id, customer=s['cust1'],
            provider_id=s['provider'].id, service_id=s['service'].id,
            appointment_date=today, start_datetime=timezone.now() + timedelta(minutes=10),
        )
        q1 = QueueService.check_in_appointment(appointment=appt1)
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, actor=s['staff_user'])
        QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id, actor=s['staff_user'])

        client = APIClient()
        client.force_authenticate(user=s['staff_user'])

        url = f"/api/v1/organizations/{s['org'].id}/queue/{q1.id}/complete/"
        res = client.post(url)
        assert res.status_code == status.HTTP_200_OK

        q1.refresh_from_db()
        appt1.refresh_from_db()
        assert q1.status == QueueEntry.Status.COMPLETED
        assert appt1.status == Appointment.Status.COMPLETED
