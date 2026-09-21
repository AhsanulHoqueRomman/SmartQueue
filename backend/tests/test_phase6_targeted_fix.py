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
from apps.appointments.services import AppointmentService
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService
from apps.services.models import Category, Service

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def multi_org_setup(db):
    customer_a = User.objects.create_user(email='customer_a@phase6.test', password='Password123!')
    customer_b = User.objects.create_user(email='customer_b@phase6.test', password='Password123!')

    # Org 1: Clinic A (Healthcare)
    org_1 = Organization.objects.create(name='Clinic A', slug='clinic-a', industry_type='HEALTHCARE', verification_status=Organization.VerificationStatus.APPROVED)
    prov_user_1 = User.objects.create_user(email='doctor_a@phase6.test', password='Password123!')
    mem_1 = OrganizationMembership.objects.create(user=prov_user_1, organization=org_1, role='PROVIDER')
    provider_1 = ProviderProfile.objects.create(membership=mem_1, title='Dr. A', application_status=ProviderProfile.ApplicationStatus.APPROVED)
    cat_1 = Category.objects.create(organization=org_1, name='Medical')
    svc_1 = Service.objects.create(organization=org_1, category=cat_1, name='General Consult', duration_minutes=20, price='30.00')
    ProviderService.objects.create(provider=provider_1, service=svc_1)

    # Org 2: Studio B (Beauty)
    org_2 = Organization.objects.create(name='Studio B', slug='studio-b', industry_type='BEAUTY', verification_status=Organization.VerificationStatus.APPROVED)
    prov_user_2 = User.objects.create_user(email='stylist_b@phase6.test', password='Password123!')
    mem_2 = OrganizationMembership.objects.create(user=prov_user_2, organization=org_2, role='PROVIDER')
    provider_2 = ProviderProfile.objects.create(membership=mem_2, title='Stylist B', application_status=ProviderProfile.ApplicationStatus.APPROVED)
    cat_2 = Category.objects.create(organization=org_2, name='Hair')
    svc_2 = Service.objects.create(organization=org_2, category=cat_2, name='Haircut', duration_minutes=45, price='50.00')
    ProviderService.objects.create(provider=provider_2, service=svc_2)

    for p in (provider_1, provider_2):
        for day_idx in range(7):
            WeeklySchedule.objects.create(
                provider=p, day_of_week=day_idx, start_time=time(8, 0), end_time=time(18, 0), is_working_day=True
            )

    return locals()


def _login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestPhase6MultiOrgCustomerData:
    def test_customer_receives_bookings_from_multiple_organizations(self, multi_org_setup):
        s = multi_org_setup
        start_time = timezone.make_aware(datetime(2030, 3, 1, 10, 0), timezone=TZ)

        # Customer A books in Org 1 and Org 2
        appt_1 = AppointmentService.book_appointment(
            organization_id=s['org_1'].id, customer=s['customer_a'],
            provider_id=s['provider_1'].id, service_id=s['svc_1'].id,
            start_datetime=start_time,
        )
        appt_2 = AppointmentService.book_appointment(
            organization_id=s['org_2'].id, customer=s['customer_a'],
            provider_id=s['provider_2'].id, service_id=s['svc_2'].id,
            start_datetime=start_time + timedelta(hours=2),
        )

        client = APIClient()
        _login(client, s['customer_a'])

        url = reverse('customer_dashboard')
        res = client.get(url)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()

        assert len(data) == 2
        org_names = {item['organization_name'] for item in data}
        assert 'Clinic A' in org_names
        assert 'Studio B' in org_names

    def test_customer_receives_only_own_bookings_cross_customer_isolation(self, multi_org_setup):
        s = multi_org_setup
        start_time = timezone.make_aware(datetime(2030, 3, 1, 10, 0), timezone=TZ)

        # Customer A books Org 1
        appt_a = AppointmentService.book_appointment(
            organization_id=s['org_1'].id, customer=s['customer_a'],
            provider_id=s['provider_1'].id, service_id=s['svc_1'].id,
            start_datetime=start_time,
        )
        # Customer B books Org 1
        appt_b = AppointmentService.book_appointment(
            organization_id=s['org_1'].id, customer=s['customer_b'],
            provider_id=s['provider_1'].id, service_id=s['svc_1'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )

        client = APIClient()
        _login(client, s['customer_a'])
        res_a = client.get(reverse('customer_dashboard'))
        data_a = res_a.json()
        assert len(data_a) == 1
        assert data_a[0]['id'] == str(appt_a.id)

        _login(client, s['customer_b'])
        res_b = client.get(reverse('customer_dashboard'))
        data_b = res_b.json()
        assert len(data_b) == 1
        assert data_b[0]['id'] == str(appt_b.id)

    def test_correct_organization_provider_service_category_attached(self, multi_org_setup):
        s = multi_org_setup
        start_time = timezone.make_aware(datetime(2030, 3, 2, 10, 0), timezone=TZ)
        appt = AppointmentService.book_appointment(
            organization_id=s['org_1'].id, customer=s['customer_a'],
            provider_id=s['provider_1'].id, service_id=s['svc_1'].id,
            start_datetime=start_time,
        )

        client = APIClient()
        _login(client, s['customer_a'])
        res = client.get(reverse('customer_dashboard'))
        data = res.json()[0]

        assert data['organization_id'] == str(s['org_1'].id)
        assert data['organization_name'] == 'Clinic A'
        assert data['organization_category'] == 'HEALTHCARE'
        assert data['service_id'] == str(s['svc_1'].id)
        assert data['service_name'] == 'General Consult'
        assert data['category_name'] == 'Medical'
        assert data['provider_id'] == str(s['provider_1'].id)
        assert data['queue_entry']['serial_number'] == appt.serial_number


@pytest.mark.django_db
class TestPhase6ETARangeAndOrdering:
    def test_eta_range_calculation_and_ordering(self, multi_org_setup):
        s = multi_org_setup
        start_time = timezone.make_aware(datetime(2030, 3, 3, 10, 0), timezone=TZ)

        appt_1 = AppointmentService.book_appointment(
            organization_id=s['org_1'].id, customer=s['customer_a'],
            provider_id=s['provider_1'].id, service_id=s['svc_1'].id,
            start_datetime=start_time,
        )
        appt_2 = AppointmentService.book_appointment(
            organization_id=s['org_1'].id, customer=s['customer_b'],
            provider_id=s['provider_1'].id, service_id=s['svc_1'].id,
            start_datetime=start_time + timedelta(minutes=30),
        )

        q1 = QueueService.check_in_appointment(appointment=appt_1)
        q2 = QueueService.check_in_appointment(appointment=appt_2)

        eta_info_1 = QueueService.calculate_readiness_and_eta(q1)
        eta_info_2 = QueueService.calculate_readiness_and_eta(q2)

        # 1. ETA range fields exist
        assert 'estimated_start_time' in eta_info_1
        assert 'estimated_end_time' in eta_info_1
        assert 'recommended_arrival_time' in eta_info_1

        # 2. Start <= End
        start_dt = datetime.fromisoformat(eta_info_1['estimated_start_time'])
        end_dt = datetime.fromisoformat(eta_info_1['estimated_end_time'])
        assert start_dt <= end_dt
        # Duration is 20 mins for svc_1
        assert (end_dt - start_dt).total_seconds() == 20 * 60

        # 3. Recommended arrival is 15 mins before estimated start time
        rec_dt = datetime.fromisoformat(eta_info_1['recommended_arrival_time'])
        assert rec_dt <= start_dt

        # 4. Ordering consistency: q2 is behind q1 (people_ahead == 1)
        assert eta_info_2['people_ahead'] == 1
        assert eta_info_2['estimated_wait_minutes'] == 20

        # 5. Mark q2 urgent -> call_next picks q2 first!
        QueueService.mark_urgent(organization_id=s['org_1'].id, queue_entry_id=q2.id, reason='Urgent triage')
        called = QueueService.call_next(organization_id=s['org_1'].id, provider_id=s['provider_1'].id, on_date=appt_1.appointment_date)
        assert called.id == q2.id
