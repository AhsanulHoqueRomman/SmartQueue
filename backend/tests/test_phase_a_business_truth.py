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

        assert _get_temporal_classification(past_appt) == 'historical'
        assert _get_temporal_classification(today_appt) == 'today'
        assert _get_temporal_classification(future_appt) == 'future'

        assert _get_is_live_queue(future_appt) is False
        assert _get_is_live_queue(past_appt) is False
        assert _get_is_live_queue(today_appt) is True

        assert _get_can_check_in(future_appt) is False
        assert _get_can_check_in(past_appt) is False
        assert _get_can_check_in(today_appt) is True

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

        entry, _ = QueueEntry.objects.get_or_create(
            appointment=future_appt,
            defaults={
                'organization': setup['org'],
                'provider': setup['provider'],
                'queue_date': tomorrow,
                'serial_number': future_appt.serial_number or 99,
                'token_number': future_appt.serial_number or 99,
                'status': QueueEntry.Status.WAITING,
                'is_checked_in': True,
            }
        )

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

    def test_stale_historical_queue_reconciliation(self, business_setup):
        setup = business_setup
        today = current_business_date()
        yesterday = today - timedelta(days=5)

        past_start = timezone.make_aware(datetime.combine(yesterday, time(10, 0)), TZ)
        past_appt = Appointment.objects.create(
            organization=setup['org'],
            customer=setup['customer'],
            provider=setup['provider'],
            service=setup['service'],
            appointment_date=yesterday,
            serial_number=1,
            start_datetime=past_start,
            end_datetime=past_start + timedelta(minutes=30),
            status=Appointment.Status.CHECKED_IN,
        )

        entry = QueueEntry.objects.create(
            organization=setup['org'],
            appointment=past_appt,
            provider=setup['provider'],
            queue_date=yesterday,
            serial_number=1,
            token_number=1,
            status=QueueEntry.Status.CALLED,
            is_checked_in=True,
        )

        reconciled = QueueService.reconcile_stale_historical_queue_entries()
        assert reconciled >= 1

        entry.refresh_from_db()
        past_appt.refresh_from_db()

        assert entry.status == QueueEntry.Status.SKIPPED
        assert past_appt.status == Appointment.Status.NO_SHOW

        readiness = QueueService.calculate_readiness_and_eta(entry)
        assert readiness['readiness_state'] == 'SKIPPED'

    def test_reviews_zero_count_behavior(self, business_setup):
        client = APIClient()
        _login(client, business_setup['customer'])

        url = f"/api/v1/organizations/{business_setup['org'].id}/reviews/"
        res = client.get(url)
        assert res.status_code == status.HTTP_200_OK
        data = res.data if isinstance(res.data, list) else res.data.get('results', [])
        assert len(data) == 0
