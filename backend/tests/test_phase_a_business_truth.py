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
from apps.appointments.serializers import (
    _get_temporal_classification,
    _get_is_live_queue,
    _get_can_check_in,
    _get_can_cancel,
    _get_can_review,
)
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService, current_business_date
from apps.services.models import Category, Service
from apps.feedback.models import Review

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def business_setup(db):
    customer = User.objects.create_user(email='customer@phasea.test', password='Password123!')
    other_customer = User.objects.create_user(email='other@phasea.test', password='Password123!')

    org = Organization.objects.create(
        name='Phase A Dental Clinic',
        slug='phase-a-dental',
        industry_type='HEALTHCARE',
        verification_status=Organization.VerificationStatus.APPROVED,
    )

    prov_user = User.objects.create_user(email='doctor@phasea.test', password='Password123!')
    membership = OrganizationMembership.objects.create(
        user=prov_user, organization=org, role=OrganizationMembership.Role.PROVIDER
    )
    provider = ProviderProfile.objects.create(
        membership=membership,
        title='Dr. PhaseA Specialist',
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )

    category = Category.objects.create(organization=org, name='Dental')
    service = Service.objects.create(
        organization=org, category=category, name='Teeth Cleaning', duration_minutes=30, price='50.00'
    )
    ProviderService.objects.create(provider=provider, service=service)

    for day_idx in range(7):
        WeeklySchedule.objects.create(
            provider=provider,
            day_of_week=day_idx,
            start_time=time(8, 0),
            end_time=time(18, 0),
            is_working_day=True,
        )

    return {
        'customer': customer,
        'other_customer': other_customer,
        'org': org,
        'provider': provider,
        'service': service,
    }


def _login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestPhaseABusinessTruth:

    def test_date_classification_rules(self, business_setup):
        setup = business_setup
        today = current_business_date()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)

        past_start = timezone.make_aware(datetime.combine(yesterday, time(9, 0)), TZ)
        past_appt = Appointment.objects.create(
            organization=setup['org'],
            customer=setup['customer'],
            provider=setup['provider'],
            service=setup['service'],
            appointment_date=yesterday,
            serial_number=1,
            start_datetime=past_start,
            end_datetime=past_start + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )

        today_appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=today,
        )

        future_appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
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

    def test_serial_allocated_at_booking_time(self, business_setup):
        setup = business_setup
        tomorrow = current_business_date() + timedelta(days=1)

        appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=tomorrow,
        )

        assert appt.serial_number is not None
        assert appt.serial_number >= 1

        queue_entry = QueueEntry.objects.filter(appointment=appt).first()
        assert queue_entry is not None
        assert queue_entry.serial_number == appt.serial_number

    def test_dashboard_upcoming_matches_future_classification(self, business_setup):
        client = APIClient()
        setup = business_setup
        _login(client, setup['customer'])

        tomorrow = current_business_date() + timedelta(days=1)
        appt1 = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=tomorrow,
        )

        res = client.get('/api/v1/customer/dashboard/')
        assert res.status_code == status.HTTP_200_OK
        data = res.data if isinstance(res.data, list) else res.data.get('results', [])

        future_items = [item for item in data if item.get('temporal_classification') == 'future' and item.get('status') not in ('CANCELLED', 'COMPLETED', 'NO_SHOW')]
        assert len(future_items) == 1
        assert future_items[0]['id'] == str(appt1.id)

    def test_customer_dashboard_get_is_idempotent_read_only(self, business_setup):
        client = APIClient()
        setup = business_setup
        _login(client, setup['customer'])

        res1 = client.get('/api/v1/customer/dashboard/')
        res2 = client.get('/api/v1/customer/dashboard/')
        assert res1.status_code == status.HTTP_200_OK
        assert res2.status_code == status.HTTP_200_OK

    def test_review_submission_and_can_review_agreement(self, business_setup):
        client = APIClient()
        setup = business_setup
        _login(client, setup['customer'])

        today = current_business_date()
        appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=today,
        )
        entry = QueueService.check_in_appointment(appointment=appt)
        entry = QueueService.call_next(organization_id=setup['org'].id, provider_id=setup['provider'].id)
        entry = QueueService.start_queue_entry(organization_id=setup['org'].id, queue_entry_id=entry.id)
        entry = QueueService.complete_queue_entry(organization_id=setup['org'].id, queue_entry_id=entry.id)

        appt.refresh_from_db()
        assert _get_can_review(appt) is True

        review_url = f"/api/v1/organizations/{setup['org'].id}/reviews/appointments/{appt.id}/"
        res = client.post(review_url, {'rating': 5, 'comment': 'Great dental care!'})
        assert res.status_code == status.HTTP_201_CREATED

        appt.refresh_from_db()
        assert _get_can_review(appt) is False

        # Duplicate review rejected
        res_dup = client.post(review_url, {'rating': 4, 'comment': 'Duplicate review attempt'})
        assert res_dup.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT)

    def test_customer_my_reviews_global_endpoint(self, business_setup):
        client = APIClient()
        setup = business_setup
        _login(client, setup['customer'])

        today = current_business_date()
        appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=today,
        )
        entry = QueueService.check_in_appointment(appointment=appt)
        entry = QueueService.call_next(organization_id=setup['org'].id, provider_id=setup['provider'].id)
        entry = QueueService.start_queue_entry(organization_id=setup['org'].id, queue_entry_id=entry.id)
        QueueService.complete_queue_entry(organization_id=setup['org'].id, queue_entry_id=entry.id)

        review_url = f"/api/v1/organizations/{setup['org'].id}/reviews/appointments/{appt.id}/"
        client.post(review_url, {'rating': 5, 'comment': 'Excellent service!'})

        res = client.get('/api/v1/customer/reviews/')
        assert res.status_code == status.HTTP_200_OK
        list_data = res.data if isinstance(res.data, list) else res.data.get('results', [])
        assert len(list_data) == 1
        assert list_data[0]['comment'] == 'Excellent service!'

    def test_readiness_future_appointment_not_yet(self, business_setup):
        setup = business_setup
        today = current_business_date()
        tomorrow = today + timedelta(days=1)

        future_appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=tomorrow,
        )

        entry = QueueEntry.objects.filter(appointment=future_appt).first()
        readiness = QueueService.calculate_readiness_and_eta(entry)
        assert readiness['readiness_state'] == QueueEntry.ReadinessState.NOT_YET
        assert readiness['people_ahead'] == 0

    def test_check_in_future_appointment_rejected(self, business_setup):
        setup = business_setup
        today = current_business_date()
        tomorrow = today + timedelta(days=1)

        future_appt = AppointmentService.book_appointment(
            organization_id=setup['org'].id,
            customer=setup['customer'],
            provider_id=setup['provider'].id,
            service_id=setup['service'].id,
            appointment_date=tomorrow,
        )

        from apps.queue.services import InvalidCheckInException
        with pytest.raises(InvalidCheckInException):
            QueueService.check_in_appointment(appointment=future_appt, actor=setup['customer'])
