import pytest
from datetime import time, timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.appointments.serializers import (
    CustomerDashboardItemSerializer,
    _get_temporal_classification,
    _get_is_live_queue,
)
from apps.queue.models import QueueEntry
from apps.queue.services import current_business_date, get_project_tz
from apps.contact.models import ContactMessage, AppointmentIssueReport


@pytest.mark.django_db
class TestAppointmentsLifecycleAndCleanup:
    """
    Test suite for My Appointments Lifecycle & IA Restructure.
    Guarantees state machine correctness, past-day queue exclusion, customer authority limits,
    serial number accuracy, and duplicate issue reporting protection.
    """

    def _create_setup(self):
        user_cust = User.objects.create_user(email='customer_a6@test.com', first_name='Mahmudul', last_name='Islam')
        user_prov = User.objects.create_user(email='doctor_a6@test.com', first_name='Doctor', last_name='Tanvir')

        org = Organization.objects.create(
            name='Dhaka Care Clinic',
            slug='dhaka-care-clinic-a6',
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

        service = Service.objects.create(
            organization=org,
            name='Pediatric Growth & Health Audit',
            duration_minutes=30,
            is_active=True,
        )

        return user_cust, org, prov, service

    def test_past_checked_in_appointment_is_classified_as_past_and_not_live(self):
        """Past checked-in appointment must have temporal_classification='past' and is_live_queue=False."""
        user_cust, org, prov, service = self._create_setup()
        today = current_business_date()
        yesterday = today - timedelta(days=1)
        tz = get_project_tz()
        yesterday_start = timezone.make_aware(
            timezone.datetime.combine(yesterday, time(15, 0)),
            tz
        )
        yesterday_end = yesterday_start + timedelta(minutes=30)

        appt = Appointment.objects.create(
            organization=org,
            customer=user_cust,
            provider=prov,
            service=service,
            appointment_date=yesterday,
            serial_number=1,
            start_datetime=yesterday_start,
            end_datetime=yesterday_end,
            status=Appointment.Status.CHECKED_IN,
        )

        QueueEntry.objects.create(
            organization=org,
            appointment=appt,
            provider=prov,
            queue_date=yesterday,
            serial_number=1,
            token_number=1,
            status=QueueEntry.Status.WAITING,
            is_checked_in=True,
            checked_in_at=yesterday_start - timedelta(minutes=15),
        )

        assert _get_temporal_classification(appt) == 'past'
        assert _get_is_live_queue(appt) is False

        serializer = CustomerDashboardItemSerializer(appt)
        data = serializer.data

        assert data['temporal_classification'] == 'past'
        assert data['is_live_queue'] is False
        assert data['serial_number'] == 1
        assert data['status'] == 'CHECKED_IN'
        assert data['queue_entry']['status'] == 'WAITING'

    def test_past_unchecked_in_appointment_is_past_and_not_live(self):
        """Past un-checked-in confirmed appointment must have temporal_classification='past' and is_live_queue=False."""
        user_cust, org, prov, service = self._create_setup()
        today = current_business_date()
        yesterday = today - timedelta(days=1)
        tz = get_project_tz()
        yesterday_start = timezone.make_aware(
            timezone.datetime.combine(yesterday, time(10, 0)),
            tz
        )
        yesterday_end = yesterday_start + timedelta(minutes=30)

        appt = Appointment.objects.create(
            organization=org,
            customer=user_cust,
            provider=prov,
            service=service,
            appointment_date=yesterday,
            serial_number=2,
            start_datetime=yesterday_start,
            end_datetime=yesterday_end,
            status=Appointment.Status.CONFIRMED,
        )

        assert _get_temporal_classification(appt) == 'past'
        assert _get_is_live_queue(appt) is False

        serializer = CustomerDashboardItemSerializer(appt)
        data = serializer.data

        assert data['temporal_classification'] == 'past'
        assert data['is_live_queue'] is False
        assert data['serial_number'] == 2

    def test_today_checked_in_appointment_is_classified_as_today_and_live(self):
        """Active today checked-in appointment must have temporal_classification='today' and is_live_queue=True."""
        user_cust, org, prov, service = self._create_setup()
        today = current_business_date()
        tz = get_project_tz()
        today_start = timezone.make_aware(
            timezone.datetime.combine(today, time(14, 0)),
            tz
        )
        today_end = today_start + timedelta(minutes=30)

        appt = Appointment.objects.create(
            organization=org,
            customer=user_cust,
            provider=prov,
            service=service,
            appointment_date=today,
            serial_number=1,
            start_datetime=today_start,
            end_datetime=today_end,
            status=Appointment.Status.CHECKED_IN,
        )

        QueueEntry.objects.create(
            organization=org,
            appointment=appt,
            provider=prov,
            queue_date=today,
            serial_number=1,
            token_number=1,
            status=QueueEntry.Status.WAITING,
            is_checked_in=True,
            checked_in_at=today_start - timedelta(minutes=10),
        )

        assert _get_temporal_classification(appt) == 'today'
        assert _get_is_live_queue(appt) is True

    def test_in_progress_appointment_remains_live_past_midnight(self):
        """Legitimate in-progress appointment remains active live queue even past midnight."""
        user_cust, org, prov, service = self._create_setup()
        today = current_business_date()
        yesterday = today - timedelta(days=1)
        tz = get_project_tz()
        yesterday_start = timezone.make_aware(timezone.datetime.combine(yesterday, time(23, 45)), tz)

        appt = Appointment.objects.create(
            organization=org,
            customer=user_cust,
            provider=prov,
            service=service,
            appointment_date=yesterday,
            serial_number=5,
            start_datetime=yesterday_start,
            end_datetime=yesterday_start + timedelta(minutes=30),
            status=Appointment.Status.IN_PROGRESS,
        )

        QueueEntry.objects.create(
            organization=org,
            appointment=appt,
            provider=prov,
            queue_date=yesterday,
            serial_number=5,
            token_number=5,
            status=QueueEntry.Status.IN_PROGRESS,
            is_checked_in=True,
            started_at=yesterday_start,
        )

        assert _get_is_live_queue(appt) is True

    def test_customer_cannot_mark_appointment_completed(self):
        """Customers must not be able to mark an appointment completed via API."""
        user_cust, org, prov, service = self._create_setup()
        client = APIClient()
        client.force_authenticate(user=user_cust)

        today = current_business_date()
        tz = get_project_tz()
        start = timezone.make_aware(timezone.datetime.combine(today, time(15, 0)), tz)

        appt = Appointment.objects.create(
            organization=org,
            customer=user_cust,
            provider=prov,
            service=service,
            appointment_date=today,
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CHECKED_IN,
        )

        url = f"/api/v1/organizations/{org.id}/appointments/{appt.id}/complete/"
        resp = client.post(url)
        assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

        appt.refresh_from_db()
        assert appt.status != Appointment.Status.COMPLETED

    def test_report_issue_endpoint_creates_report_and_prevents_duplicates(self):
        """Customer can submit an issue report and duplicate submissions return 200 OK without creating double records."""
        user_cust, org, prov, service = self._create_setup()
        client = APIClient()
        client.force_authenticate(user=user_cust)

        today = current_business_date()
        yesterday = today - timedelta(days=1)
        tz = get_project_tz()
        start = timezone.make_aware(timezone.datetime.combine(yesterday, time(15, 0)), tz)

        appt = Appointment.objects.create(
            organization=org,
            customer=user_cust,
            provider=prov,
            service=service,
            appointment_date=yesterday,
            serial_number=1,
            start_datetime=start,
            end_datetime=start + timedelta(minutes=30),
            status=Appointment.Status.CHECKED_IN,
        )

        url = f"/api/v1/customer/appointments/{appt.id}/report-issue/"
        payload = {
            'reason': 'CHECKED_IN_NOT_SERVED',
            'details': 'I checked in at 2:45 PM, but the clinic closed without calling my serial.',
        }

        # First report submission
        resp1 = client.post(url, payload, format='json')
        assert resp1.status_code == status.HTTP_201_CREATED
        assert resp1.data['has_issue_report'] is True

        # Appointment status MUST NOT be mutated
        appt.refresh_from_db()
        assert appt.status == Appointment.Status.CHECKED_IN

        # Verify database record
        reports = AppointmentIssueReport.objects.filter(appointment=appt)
        assert reports.count() == 1
        assert reports.first().reason == 'CHECKED_IN_NOT_SERVED'

        # Second submission (duplicate click / refresh attempt)
        resp2 = client.post(url, payload, format='json')
        assert resp2.status_code == status.HTTP_200_OK
        assert resp2.data['has_issue_report'] is True
        assert AppointmentIssueReport.objects.filter(appointment=appt).count() == 1

        # Check serializer method reflects has_issue_report = True
        serializer_data = CustomerDashboardItemSerializer(appt).data
        assert serializer_data['has_issue_report'] is True
