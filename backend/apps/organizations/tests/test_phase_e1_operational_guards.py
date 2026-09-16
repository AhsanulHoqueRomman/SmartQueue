from datetime import date, time, datetime, timedelta, timezone as dt_timezone
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from config.exceptions import ApplicationError
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService, AppointmentAvailabilityService
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService

User = get_user_model()


def _extract_list(res_data):
    if isinstance(res_data, list):
        return res_data
    if isinstance(res_data, dict):
        return res_data.get('results', [])
    return []


class PhaseE1OperationalGuardsTest(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = User.objects.create_superuser(
            email='sysadmin@smartqueue.com', password='Password123!'
        )
        self.manager_user = User.objects.create_user(
            email='manager@careclinic.com', password='Password123!', first_name='Care', last_name='Manager'
        )
        self.provider_user = User.objects.create_user(
            email='dr.smith@careclinic.com', password='Password123!', first_name='John', last_name='Smith'
        )
        self.customer_user = User.objects.create_user(
            email='patient@gmail.com', password='Password123!', first_name='Alice', last_name='Customer'
        )

        # Operational Org
        self.org = Organization.objects.create(
            name='Care Clinic',
            slug='care-clinic',
            email='info@careclinic.com',
            phone_number='+8801700000000',
            address='Dhanmondi, Dhaka',
            is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED
        )
        self.manager_membership = OrganizationMembership.objects.create(
            user=self.manager_user,
            organization=self.org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )
        self.provider_membership = OrganizationMembership.objects.create(
            user=self.provider_user,
            organization=self.org,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=True
        )

        # Operational Provider
        self.provider = ProviderProfile.objects.create(
            membership=self.provider_membership,
            title='General Physician',
            bio='Expert GP',
            application_status=ProviderProfile.ApplicationStatus.APPROVED,
            is_active=True
        )

        # Operational Service
        self.service = Service.objects.create(
            organization=self.org,
            name='General Consultation',
            description='Standard health checkup',
            duration_minutes=30,
            price=50.00,
            is_active=True
        )
        ProviderService.objects.create(provider=self.provider, service=self.service)

        # Weekly Schedule (Monday - Sunday working)
        for day in range(7):
            WeeklySchedule.objects.create(
                provider=self.provider,
                day_of_week=day,
                start_time=time(9, 0),
                end_time=time(17, 0),
                is_working_day=True
            )

        # Secondary Non-Operational Org (Suspended)
        self.other_manager = User.objects.create_user(
            email='manager@other.com', password='Password123!'
        )
        self.suspended_org = Organization.objects.create(
            name='Suspended Clinic',
            slug='suspended-clinic',
            email='info@suspended.com',
            is_active=True,
            verification_status=Organization.VerificationStatus.SUSPENDED
        )
        self.suspended_mgr_membership = OrganizationMembership.objects.create(
            user=self.other_manager,
            organization=self.suspended_org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )

    # ----------------------------------------------------
    # 1. Organization Discovery Guards
    # ----------------------------------------------------

    def test_approved_and_active_org_appears_in_public_discovery(self):
        """Approved + active org must appear in public list & detail endpoints."""
        res = self.client.get('/api/v1/organizations/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = _extract_list(res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.org.id))

        res_detail = self.client.get(f'/api/v1/organizations/{self.org.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)

    def test_non_operational_orgs_hidden_from_public_discovery(self):
        """Non-approved or inactive orgs must be hidden from public discovery."""
        statuses = [
            Organization.VerificationStatus.SETUP_INCOMPLETE,
            Organization.VerificationStatus.SUBMITTED,
            Organization.VerificationStatus.UNDER_REVIEW,
            Organization.VerificationStatus.REJECTED,
            Organization.VerificationStatus.SUSPENDED,
        ]
        for st in statuses:
            temp_org = Organization.objects.create(
                name=f'Org {st}',
                slug=f'org-{st.lower()}',
                is_active=True,
                verification_status=st
            )
            # Should not appear in public list
            res_list = self.client.get('/api/v1/organizations/')
            org_ids = [o['id'] for o in _extract_list(res_list.data)]
            self.assertNotIn(str(temp_org.id), org_ids)

            # Detail returns 404 for public user
            res_detail = self.client.get(f'/api/v1/organizations/{temp_org.id}/')
            self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_manager_can_access_their_non_operational_org(self):
        """Manager of a suspended org can still retrieve detail profile."""
        self.client.force_authenticate(user=self.other_manager)
        res = self.client.get(f'/api/v1/organizations/{self.suspended_org.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['verification_status'], 'SUSPENDED')

    # ----------------------------------------------------
    # 2. Service & Provider Discovery Guards
    # ----------------------------------------------------

    def test_services_of_non_operational_org_hidden(self):
        """Customer GET services on non-operational org returns 404."""
        res = self.client.get(f'/api/v1/organizations/{self.suspended_org.id}/services/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_providers_of_non_operational_org_hidden(self):
        """Customer GET providers on non-operational org returns 404."""
        res = self.client.get(f'/api/v1/organizations/{self.suspended_org.id}/providers/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_or_rejected_provider_hidden_from_public(self):
        """Provider with PENDING_REVIEW or REJECTED application_status is hidden from public discovery."""
        pending_user = User.objects.create_user(email='pending.doc@careclinic.com', password='Password123!')
        mem = OrganizationMembership.objects.create(
            user=pending_user, organization=self.org, role=OrganizationMembership.Role.PROVIDER, is_active=True
        )
        p_profile = ProviderProfile.objects.create(
            membership=mem, application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW, is_active=True
        )

        res = self.client.get(f'/api/v1/organizations/{self.org.id}/providers/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        prov_ids = [p['id'] for p in _extract_list(res.data)]
        self.assertNotIn(str(p_profile.id), prov_ids)

    # ----------------------------------------------------
    # 3. Availability Guards
    # ----------------------------------------------------

    def test_operational_provider_generates_availability(self):
        """Operational provider returns booking slots."""
        tomorrow = date.today() + timedelta(days=1)
        slots_data = AppointmentAvailabilityService.get_available_slots(
            organization_id=self.org.id,
            provider_id=self.provider.id,
            service_id=self.service.id,
            on_date=tomorrow
        )
        self.assertEqual(slots_data['provider_id'], str(self.provider.id))
        self.assertGreater(len(slots_data['slots']), 0)

    def test_availability_fails_for_suspended_org_or_non_operational_provider(self):
        """Availability request raises 404 if org is suspended or provider non-operational."""
        tomorrow = date.today() + timedelta(days=1)

        # Suspend org
        self.org.verification_status = Organization.VerificationStatus.SUSPENDED
        self.org.save()

        with self.assertRaises(ApplicationError) as ctx:
            AppointmentAvailabilityService.get_available_slots(
                organization_id=self.org.id,
                provider_id=self.provider.id,
                service_id=self.service.id,
                on_date=tomorrow
            )
        self.assertEqual(ctx.exception.status_code, 404)

    # ----------------------------------------------------
    # 4. Appointment Booking Guards
    # ----------------------------------------------------

    def test_operational_provider_and_org_can_be_booked(self):
        """Operational provider in approved org can be booked by customer."""
        tomorrow = date.today() + timedelta(days=1)
        dt = timezone.make_aware(datetime.combine(tomorrow, time(10, 0)))

        appt = AppointmentService.book_appointment(
            organization_id=self.org.id,
            customer=self.customer_user,
            provider_id=self.provider.id,
            service_id=self.service.id,
            start_datetime=dt
        )
        self.assertEqual(appt.status, Appointment.Status.CONFIRMED)
        self.assertEqual(appt.provider, self.provider)

    def test_booking_fails_when_org_suspended(self):
        """Booking fails with 404 if organization is SUSPENDED."""
        self.org.verification_status = Organization.VerificationStatus.SUSPENDED
        self.org.save()

        tomorrow = date.today() + timedelta(days=1)
        dt = timezone.make_aware(datetime.combine(tomorrow, time(10, 0)))

        with self.assertRaises(ApplicationError) as ctx:
            AppointmentService.book_appointment(
                organization_id=self.org.id,
                customer=self.customer_user,
                provider_id=self.provider.id,
                service_id=self.service.id,
                start_datetime=dt
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_booking_fails_when_provider_membership_deactivated(self):
        """Booking fails if provider membership is deactivated."""
        self.provider_membership.is_active = False
        self.provider_membership.save()

        tomorrow = date.today() + timedelta(days=1)
        dt = timezone.make_aware(datetime.combine(tomorrow, time(10, 0)))

        with self.assertRaises(ApplicationError) as ctx:
            AppointmentService.book_appointment(
                organization_id=self.org.id,
                customer=self.customer_user,
                provider_id=self.provider.id,
                service_id=self.service.id,
                start_datetime=dt
            )
        self.assertEqual(ctx.exception.status_code, 404)


    def test_tenant_isolation_mismatched_org_and_provider(self):
        """Attempting to book a provider from Org A under Org B fails with 404."""
        tomorrow = date.today() + timedelta(days=1)
        dt = timezone.make_aware(datetime.combine(tomorrow, time(10, 0)))

        with self.assertRaises(ApplicationError) as ctx:
            AppointmentService.book_appointment(
                organization_id=self.suspended_org.id,
                customer=self.customer_user,
                provider_id=self.provider.id,
                service_id=self.service.id,
                start_datetime=dt
            )
        self.assertEqual(ctx.exception.status_code, 404)

    # ----------------------------------------------------
    # 5. Check-in & Queue Guards
    # ----------------------------------------------------

    def test_valid_appointment_can_check_in(self):
        """Customer can check in valid confirmed appointment."""
        now = timezone.now()
        dt = now + timedelta(minutes=15)

        appt = Appointment.objects.create(
            organization=self.org,
            customer=self.customer_user,
            provider=self.provider,
            service=self.service,
            start_datetime=dt,
            end_datetime=dt + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED
        )

        entry = QueueService.check_in_appointment(appointment=appt, actor=self.customer_user)
        self.assertEqual(entry.status, QueueEntry.Status.WAITING)
        self.assertEqual(entry.token_number, 1)

    def test_check_in_fails_if_org_becomes_suspended_after_booking(self):
        """If org becomes SUSPENDED after booking, customer check-in fails."""
        dt = timezone.now() + timedelta(minutes=15)
        appt = Appointment.objects.create(
            organization=self.org,
            customer=self.customer_user,
            provider=self.provider,
            service=self.service,
            start_datetime=dt,
            end_datetime=dt + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED
        )

        # Org gets suspended before check-in
        self.org.verification_status = Organization.VerificationStatus.SUSPENDED
        self.org.save()

        with self.assertRaises(ApplicationError) as ctx:
            QueueService.check_in_appointment(appointment=appt, actor=self.customer_user)
        self.assertIn("not operational", str(ctx.exception))
