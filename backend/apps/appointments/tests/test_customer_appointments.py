"""Customer Appointments Domain Tests — Multi-Org Booking Visibility & Ownership Isolation."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService, current_business_date
from apps.services.models import Category, Service
from apps.appointments.serializers import (
    _get_temporal_classification,
    _get_is_live_queue,
    _get_can_check_in,
)

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def customer_appt_setup(db):
    user_prov = User.objects.create_user(email='doctor_cust_appts@test.com', first_name='Doctor', last_name='A')
    user_cust1 = User.objects.create_user(email='customer1_appts@test.com', first_name='Mahmudul', last_name='Islam')
    user_cust2 = User.objects.create_user(email='customer2_appts@test.com', first_name='Rahim', last_name='Uddin')

    # Org 1: Clinic A (Healthcare)
    org_1 = Organization.objects.create(
        name='Clinic A',
        slug='clinic-a',
        industry_type=Organization.IndustryType.HEALTHCARE,
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )
    mem_1 = OrganizationMembership.objects.create(
        user=user_prov, organization=org_1, role=OrganizationMembership.Role.PROVIDER, is_active=True
    )
    provider_1 = ProviderProfile.objects.create(
        membership=mem_1, title='Dr. Tanvir Ahmed', application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    cat_1 = Category.objects.create(organization=org_1, name='Medical')
    svc_1 = Service.objects.create(
        organization=org_1, category=cat_1, name='General Consult', duration_minutes=25, price='30.00', is_active=True
    )
    ProviderService.objects.create(provider=provider_1, service=svc_1)

    # Org 2: Studio B (Beauty)
    org_2 = Organization.objects.create(
        name='Studio B',
        slug='studio-b',
        industry_type=Organization.IndustryType.BEAUTY,
        verification_status=Organization.VerificationStatus.APPROVED,
        is_active=True,
    )
    prov_user_2 = User.objects.create_user(email='stylist_cust_appts@test.com', password='Password123!')
    mem_2 = OrganizationMembership.objects.create(
        user=prov_user_2, organization=org_2, role=OrganizationMembership.Role.PROVIDER, is_active=True
    )
    provider_2 = ProviderProfile.objects.create(
        membership=mem_2, title='Stylist B', application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    cat_2 = Category.objects.create(organization=org_2, name='Hair')
    svc_2 = Service.objects.create(
        organization=org_2, category=cat_2, name='Haircut', duration_minutes=45, price='50.00', is_active=True
    )
    ProviderService.objects.create(provider=provider_2, service=svc_2)

    for p in (provider_1, provider_2):
        for day_idx in range(7):
            WeeklySchedule.objects.create(
                provider=p, day_of_week=day_idx, start_time=time(0, 0), end_time=time(23, 59, 59), is_working_day=True
            )

    return {
        'org1': org_1,
        'org2': org_2,
        'cust1': user_cust1,
        'cust2': user_cust2,
        'provider1': provider_1,
        'provider2': provider_2,
        'svc1': svc_1,
        'svc2': svc_2,
    }


@pytest.mark.django_db
class TestCustomerAppointments:

    def test_customer_receives_bookings_from_multiple_organizations(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=10)

        AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=start,
        )
        AppointmentService.book_appointment(
            organization_id=s['org2'].id, customer=s['cust1'],
            provider_id=s['provider2'].id, service_id=s['svc2'].id,
            appointment_date=today, start_datetime=start + timedelta(hours=2),
        )

        client = APIClient()
        client.force_authenticate(user=s['cust1'])
        res = client.get('/api/v1/customer/dashboard/')
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        org_names = {item['organization_name'] for item in data}
        assert 'Clinic A' in org_names
        assert 'Studio B' in org_names

    def test_customer_receives_only_own_bookings_cross_customer_isolation(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt_cust1 = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=start,
        )

        client = APIClient()
        client.force_authenticate(user=s['cust2'])
        res = client.get('/api/v1/customer/dashboard/')
        assert res.status_code == status.HTTP_200_OK
        ids = [item['id'] for item in res.json()]
        assert str(appt_cust1.id) not in ids

    def test_customer_direct_appointment_detail_fetch(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=start,
        )

        client = APIClient()
        client.force_authenticate(user=s['cust1'])
        url = f"/api/v1/customer/appointments/{appt.id}/"
        res = client.get(url)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert str(data['id']) == str(appt.id)
        assert data['service_name'] == 'General Consult'
        assert data['organization_name'] == 'Clinic A'

    def test_customer_appointment_detail_ownership_isolation(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=start,
        )

        client = APIClient()
        client.force_authenticate(user=s['cust2'])
        url = f"/api/v1/customer/appointments/{appt.id}/"
        res = client.get(url)
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_customer_detail_unauthenticated(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        start = timezone.now() + timedelta(minutes=15)

        appt = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=start,
        )

        client = APIClient()
        url = f"/api/v1/customer/appointments/{appt.id}/"
        res = client.get(url)
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_eta_range_calculation_and_ordering(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        base_time = timezone.now() + timedelta(minutes=20)

        appt1 = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=base_time,
        )
        appt2 = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust2'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today, start_datetime=base_time + timedelta(minutes=25),
        )

        q1 = QueueService.check_in_appointment(appointment=appt1)
        q2 = QueueService.check_in_appointment(appointment=appt2)

        eta1 = QueueService.calculate_readiness_and_eta(q1)
        eta2 = QueueService.calculate_readiness_and_eta(q2)

        assert eta1['people_ahead'] == 0
        assert eta2['people_ahead'] == 1

    def test_temporal_classification_and_flags(self, customer_appt_setup):
        s = customer_appt_setup
        today = current_business_date()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)

        past_start = timezone.make_aware(datetime.combine(yesterday, time(9, 0)), TZ)
        past_appt = Appointment.objects.create(
            organization=s['org1'],
            customer=s['cust1'],
            provider=s['provider1'],
            service=s['svc1'],
            appointment_date=yesterday,
            serial_number=1,
            start_datetime=past_start,
            end_datetime=past_start + timedelta(minutes=25),
            status=Appointment.Status.CONFIRMED,
        )

        today_appt = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=today,
        )

        future_appt = AppointmentService.book_appointment(
            organization_id=s['org1'].id, customer=s['cust1'],
            provider_id=s['provider1'].id, service_id=s['svc1'].id,
            appointment_date=tomorrow,
        )

        assert _get_temporal_classification(past_appt) == 'past'
        assert _get_temporal_classification(today_appt) == 'today'
        assert _get_temporal_classification(future_appt) == 'future'

        assert _get_is_live_queue(future_appt) is False
        assert _get_is_live_queue(past_appt) is False
        assert _get_is_live_queue(today_appt) is True

        assert _get_can_check_in(future_appt) is False
        assert _get_can_check_in(past_appt) is False
        assert _get_can_check_in(today_appt) is True
