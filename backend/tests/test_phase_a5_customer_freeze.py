import pytest
from datetime import time, timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.appointments.services import AppointmentService
from apps.queue.services import QueueService, current_business_date


@pytest.fixture
def freeze_gate_setup(db):
    user_prov = User.objects.create_user(email='doctor_a5@freeze.test', first_name='Doctor', last_name='A5')
    user_cust1 = User.objects.create_user(email='customer1_a5@freeze.test', first_name='Mahmudul', last_name='Islam')
    user_cust2 = User.objects.create_user(email='customer2_a5@freeze.test', first_name='Rahim', last_name='Uddin')

    org = Organization.objects.create(
        name='Dhaka Care Clinic',
        slug='dhaka-care-clinic-a5',
        industry_type=Organization.IndustryType.HEALTHCARE,
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )

    mem_prov = OrganizationMembership.objects.create(
        user=user_prov, organization=org, role=OrganizationMembership.Role.PROVIDER, is_active=True
    )

    prov = ProviderProfile.objects.create(
        membership=mem_prov,
        title='Dr. Tanvir Ahmed',
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )

    srv = Service.objects.create(
        organization=org,
        name='Pediatric Growth & Health Audit',
        duration_minutes=25,
        is_active=True,
    )

    ProviderService.objects.create(provider=prov, service=srv)

    for d in range(7):
        WeeklySchedule.objects.create(
            provider=prov,
            day_of_week=d,
            is_working_day=True,
            start_time=time(0, 0),
            end_time=time(23, 59, 59),
        )

    return {
        'org': org,
        'provider_user': user_prov,
        'cust1': user_cust1,
        'cust2': user_cust2,
        'provider': prov,
        'service': srv,
    }


@pytest.mark.django_db
class TestCustomerFreezeGate:

    def test_customer_direct_appointment_detail_fetch(self, freeze_gate_setup):
        s = freeze_gate_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['cust1'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            appointment_date=today,
            start_datetime=start,
        )

        client = APIClient()
        client.force_authenticate(user=s['cust1'])

        url = f"/api/v1/customer/appointments/{appt.id}/"
        res = client.get(url)

        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert str(data['id']) == str(appt.id)
        assert data['service_name'] == 'Pediatric Growth & Health Audit'
        assert data['organization_name'] == 'Dhaka Care Clinic'

    def test_customer_appointment_detail_ownership_isolation(self, freeze_gate_setup):
        s = freeze_gate_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt_cust1 = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['cust1'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            appointment_date=today,
            start_datetime=start,
        )

        client = APIClient()
        # Authenticate as Cust2 (different customer)
        client.force_authenticate(user=s['cust2'])

        url = f"/api/v1/customer/appointments/{appt_cust1.id}/"
        res = client.get(url)

        # Cust2 MUST NOT be able to retrieve Cust1's appointment details -> 404
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_customer_detail_unauthenticated(self, freeze_gate_setup):
        s = freeze_gate_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['cust1'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            appointment_date=today,
            start_datetime=start,
        )

        client = APIClient()
        url = f"/api/v1/customer/appointments/{appt.id}/"
        res = client.get(url)

        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_overdue_unstarted_queue_telemetry(self, freeze_gate_setup):
        s = freeze_gate_setup
        today = current_business_date()
        past_start = timezone.now() - timedelta(hours=2)

        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['cust1'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            appointment_date=today,
            start_datetime=past_start,
        )
        q_entry = QueueService.check_in_appointment(appointment=appt)

        eta_info = QueueService.calculate_readiness_and_eta(q_entry)

        assert eta_info['is_delayed'] is True
        assert 'estimated_start_time' in eta_info
        assert eta_info['people_ahead'] == 0
        assert eta_info['queue_status_text'] == 'Running Behind Schedule'

    def test_customer_completion_prohibition(self, freeze_gate_setup):
        s = freeze_gate_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=10)

        appt = AppointmentService.book_appointment(
            organization_id=s['org'].id,
            customer=s['cust1'],
            provider_id=s['provider'].id,
            service_id=s['service'].id,
            appointment_date=today,
            start_datetime=start,
        )
        q_entry = QueueService.check_in_appointment(appointment=appt)

        client = APIClient()
        client.force_authenticate(user=s['cust1'])

        url = f"/api/v1/organizations/{s['org'].id}/queue/{q_entry.id}/complete/"
        res = client.post(url)

        assert res.status_code == status.HTTP_403_FORBIDDEN
