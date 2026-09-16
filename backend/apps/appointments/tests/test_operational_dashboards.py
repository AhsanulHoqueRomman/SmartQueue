from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from django.conf import settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, WeeklySchedule
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService


class OperationalDashboardsTestCase(APITestCase):
    def setUp(self):
        tz = ZoneInfo(settings.TIME_ZONE)
        self.today = date.today()
        self.tomorrow = self.today + timedelta(days=1)

        # Organization A (Approved)
        self.org_a = Organization.objects.create(
            name='Alpha Medical Center',
            slug='alpha-medical',
            verification_status=Organization.VerificationStatus.APPROVED,
            is_active=True,
        )

        # Organization B (Approved)
        self.org_b = Organization.objects.create(
            name='Beta Wellness Clinic',
            slug='beta-wellness',
            verification_status=Organization.VerificationStatus.APPROVED,
            is_active=True,
        )

        # Users
        self.manager_a = User.objects.create_user(email='manager.a@alpha.com', password='password123')
        OrganizationMembership.objects.create(organization=self.org_a, user=self.manager_a, role=OrganizationMembership.Role.MANAGER, is_active=True)

        self.manager_b = User.objects.create_user(email='manager.b@beta.com', password='password123')
        OrganizationMembership.objects.create(organization=self.org_b, user=self.manager_b, role=OrganizationMembership.Role.MANAGER, is_active=True)

        self.staff_a = User.objects.create_user(email='staff.a@alpha.com', password='password123')
        OrganizationMembership.objects.create(organization=self.org_a, user=self.staff_a, role=OrganizationMembership.Role.STAFF, is_active=True)

        self.user_prov1 = User.objects.create_user(email='provider1@alpha.com', password='password123')
        self.mem_prov1 = OrganizationMembership.objects.create(organization=self.org_a, user=self.user_prov1, role=OrganizationMembership.Role.PROVIDER, is_active=True)
        self.prov1 = ProviderProfile.objects.create(membership=self.mem_prov1, application_status=ProviderProfile.ApplicationStatus.APPROVED)

        self.user_prov2 = User.objects.create_user(email='provider2@alpha.com', password='password123')
        self.mem_prov2 = OrganizationMembership.objects.create(organization=self.org_a, user=self.user_prov2, role=OrganizationMembership.Role.PROVIDER, is_active=True)
        self.prov2 = ProviderProfile.objects.create(membership=self.mem_prov2, application_status=ProviderProfile.ApplicationStatus.APPROVED)

        self.customer1 = User.objects.create_user(email='customer1@example.com', password='password123')
        self.customer2 = User.objects.create_user(email='customer2@example.com', password='password123')

        # Service
        self.svc_a = Service.objects.create(organization=self.org_a, name='General Consultation', duration_minutes=30, is_active=True)

        # Appointments today and tomorrow
        dt_today_9am = datetime.combine(self.today, datetime.min.time()).replace(hour=9, minute=0, tzinfo=tz)
        dt_today_10am = datetime.combine(self.today, datetime.min.time()).replace(hour=10, minute=0, tzinfo=tz)
        dt_tomorrow_9am = datetime.combine(self.tomorrow, datetime.min.time()).replace(hour=9, minute=0, tzinfo=tz)

        self.appt_today_p1 = Appointment.objects.create(
            organization=self.org_a, customer=self.customer1, provider=self.prov1, service=self.svc_a,
            start_datetime=dt_today_9am, end_datetime=dt_today_9am + timedelta(minutes=30), status=Appointment.Status.CONFIRMED,
        )

        self.appt_today_p2 = Appointment.objects.create(
            organization=self.org_a, customer=self.customer2, provider=self.prov2, service=self.svc_a,
            start_datetime=dt_today_10am, end_datetime=dt_today_10am + timedelta(minutes=30), status=Appointment.Status.CONFIRMED,
        )

        self.appt_tomorrow_p1 = Appointment.objects.create(
            organization=self.org_a, customer=self.customer1, provider=self.prov1, service=self.svc_a,
            start_datetime=dt_tomorrow_9am, end_datetime=dt_tomorrow_9am + timedelta(minutes=30), status=Appointment.Status.CONFIRMED,
        )

    def test_appointment_date_filtering(self):
        """Manager can filter appointments by date parameter date=YYYY-MM-DD."""
        self.client.force_authenticate(user=self.manager_a)
        url = f'/api/v1/organizations/{self.org_a.id}/appointments/?date={self.today.isoformat()}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        res_data = response.json()
        items = res_data if isinstance(res_data, list) else res_data.get('results', [])
        self.assertEqual(len(items), 2)
        appt_ids = [item['id'] for item in items]
        self.assertIn(str(self.appt_today_p1.id), appt_ids)
        self.assertIn(str(self.appt_today_p2.id), appt_ids)
        self.assertNotIn(str(self.appt_tomorrow_p1.id), appt_ids)

    def test_provider_isolation(self):
        """Provider 1 only sees their own appointments and cannot view Provider 2's appointments."""
        self.client.force_authenticate(user=self.user_prov1)
        url = f'/api/v1/organizations/{self.org_a.id}/appointments/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        res_data = response.json()
        items = res_data if isinstance(res_data, list) else res_data.get('results', [])
        p_ids = [item['provider_id'] for item in items]
        self.assertTrue(all(str(pid) == str(self.prov1.id) for pid in p_ids))
        self.assertNotIn(str(self.appt_today_p2.id), [item['id'] for item in items])

    def test_manager_cross_tenant_isolation(self):
        """Manager B cannot access Organization A's appointments roster or operational data."""
        self.client.force_authenticate(user=self.manager_b)
        url = f'/api/v1/organizations/{self.org_a.id}/appointments/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        res_data = response.json()
        items = res_data if isinstance(res_data, list) else res_data.get('results', [])
        # Tenant isolation ensures Manager B receives 0 items from Organization A
        self.assertEqual(len(items), 0)

    def test_queue_full_lifecycle_transitions(self):
        """
        Test complete queue lifecycle:
        Check-in (CONFIRMED -> CHECKED_IN, Queue WAITING)
        Call Next (WAITING -> CALLED)
        Start (CALLED -> IN_PROGRESS, Appt IN_PROGRESS)
        Complete (IN_PROGRESS -> COMPLETED, Appt COMPLETED)
        """
        # Step 1: Check-in
        q_entry = QueueService.check_in_appointment(appointment=self.appt_today_p1, actor=self.staff_a)
        self.assertEqual(q_entry.status, QueueEntry.Status.WAITING)
        self.appt_today_p1.refresh_from_db()
        self.assertEqual(self.appt_today_p1.status, Appointment.Status.CHECKED_IN)

        # Step 2: Call Next by Provider 1
        called_entry = QueueService.call_next(organization_id=self.org_a.id, provider_id=self.prov1.id, on_date=self.today, actor=self.user_prov1)
        self.assertEqual(called_entry.status, QueueEntry.Status.CALLED)
        self.assertEqual(called_entry.id, q_entry.id)

        # Step 3: Start Queue Entry
        started_entry = QueueService.start_queue_entry(organization_id=self.org_a.id, queue_entry_id=q_entry.id, actor=self.user_prov1)
        self.assertEqual(started_entry.status, QueueEntry.Status.IN_PROGRESS)
        self.appt_today_p1.refresh_from_db()
        self.assertEqual(self.appt_today_p1.status, Appointment.Status.IN_PROGRESS)

        # Step 4: Complete Queue Entry
        completed_entry = QueueService.complete_queue_entry(organization_id=self.org_a.id, queue_entry_id=q_entry.id, actor=self.user_prov1)
        self.assertEqual(completed_entry.status, QueueEntry.Status.COMPLETED)
        self.appt_today_p1.refresh_from_db()
        self.assertEqual(self.appt_today_p1.status, Appointment.Status.COMPLETED)
