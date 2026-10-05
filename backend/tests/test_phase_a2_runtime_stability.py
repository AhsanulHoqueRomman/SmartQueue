import pytest
from datetime import date, timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Category, Service
from apps.providers.models import ProviderProfile
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.feedback.models import Review


@pytest.mark.django_db
class TestPhaseA2RuntimeStability:

    @pytest.fixture(autouse=True)
    def setup_data(self):
        self.client = APIClient()
        # Create Customer
        self.customer = User.objects.create_user(
            email='customer_a2@example.com',
            password='Password123!',
            first_name='A2Customer',
            last_name='User'
        )

        # Create Org 1
        self.org1 = Organization.objects.create(
            name='Clinic Alpha',
            slug='clinic-alpha',
            is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED
        )
        self.category1 = Category.objects.create(
            organization=self.org1,
            name='General Health'
        )
        self.service1 = Service.objects.create(
            organization=self.org1,
            category=self.category1,
            name='General Consultation',
            duration_minutes=30
        )
        self.prov_user1 = User.objects.create_user(
            email='doctor1@alpha.com',
            password='Password123!',
            first_name='Dr',
            last_name='Alpha'
        )
        self.mem1 = OrganizationMembership.objects.create(
            user=self.prov_user1,
            organization=self.org1,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=True
        )
        self.provider1 = ProviderProfile.objects.create(
            membership=self.mem1,
            is_active=True,
            application_status=ProviderProfile.ApplicationStatus.APPROVED
        )

        # Create Org 2
        self.org2 = Organization.objects.create(
            name='Dental Care Clinic',
            slug='dental-care',
            is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED
        )
        self.category2 = Category.objects.create(
            organization=self.org2,
            name='Dentistry'
        )
        self.service2 = Service.objects.create(
            organization=self.org2,
            category=self.category2,
            name='Teeth Cleaning',
            duration_minutes=45
        )
        self.prov_user2 = User.objects.create_user(
            email='dentist@dental.com',
            password='Password123!',
            first_name='Dr',
            last_name='Dentist'
        )
        self.mem2 = OrganizationMembership.objects.create(
            user=self.prov_user2,
            organization=self.org2,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=True
        )
        self.provider2 = ProviderProfile.objects.create(
            membership=self.mem2,
            is_active=True,
            application_status=ProviderProfile.ApplicationStatus.APPROVED
        )

    def test_appointment_detail_access_and_permissions(self):
        """Customer can retrieve their own appointment detail; another customer is denied (403)."""
        from apps.queue.services import current_business_date
        today = current_business_date()
        appt = Appointment.objects.create(
            organization=self.org1,
            customer=self.customer,
            provider=self.provider1,
            service=self.service1,
            appointment_date=today,
            serial_number=1,
            status=Appointment.Status.CONFIRMED,
            start_datetime=timezone.now(),
            end_datetime=timezone.now() + timedelta(minutes=30)
        )

        # Customer A2 login
        self.client.force_authenticate(user=self.customer)
        res = self.client.get(f'/api/v1/organizations/{self.org1.id}/appointments/{appt.id}/')
        assert res.status_code == status.HTTP_200_OK
        assert str(res.data['id']) == str(appt.id)
        assert res.data['serial_number'] == 1
        assert res.data['can_check_in'] is True
        assert res.data['can_cancel'] is True

        # Other customer login -> 403
        other_customer = User.objects.create_user(email='other_a2@example.com', password='Password123!')
        self.client.force_authenticate(user=other_customer)
        res_other = self.client.get(f'/api/v1/organizations/{self.org1.id}/appointments/{appt.id}/')
        assert res_other.status_code == status.HTTP_403_FORBIDDEN

    def test_future_appointment_can_check_in_is_false(self):
        """Future appointment must have can_check_in=False."""
        from apps.queue.services import current_business_date
        tomorrow = current_business_date() + timedelta(days=1)
        appt = Appointment.objects.create(
            organization=self.org1,
            customer=self.customer,
            provider=self.provider1,
            service=self.service1,
            appointment_date=tomorrow,
            serial_number=1,
            status=Appointment.Status.CONFIRMED,
            start_datetime=timezone.now() + timedelta(days=1),
            end_datetime=timezone.now() + timedelta(days=1, minutes=30)
        )
        self.client.force_authenticate(user=self.customer)
        res = self.client.get(f'/api/v1/organizations/{self.org1.id}/appointments/{appt.id}/')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['temporal_classification'] == 'future'
        assert res.data['can_check_in'] is False

    def test_customer_dashboard_multi_org_appointments(self):
        """Customer dashboard returns all customer appointments across Org 1 & Org 2 with serials."""
        from apps.queue.services import current_business_date
        today = current_business_date()
        appt1 = Appointment.objects.create(
            organization=self.org1,
            customer=self.customer,
            provider=self.provider1,
            service=self.service1,
            appointment_date=today,
            serial_number=1,
            status=Appointment.Status.CONFIRMED,
            start_datetime=timezone.now(),
            end_datetime=timezone.now() + timedelta(minutes=30)
        )
        appt2 = Appointment.objects.create(
            organization=self.org2,
            customer=self.customer,
            provider=self.provider2,
            service=self.service2,
            appointment_date=today + timedelta(days=2),
            serial_number=1,
            status=Appointment.Status.CONFIRMED,
            start_datetime=timezone.now() + timedelta(days=2),
            end_datetime=timezone.now() + timedelta(days=2, minutes=45)
        )

        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/v1/customer/dashboard/')
        assert res.status_code == status.HTTP_200_OK
        appt_ids = [a['id'] for a in res.data]
        assert str(appt1.id) in appt_ids
        assert str(appt2.id) in appt_ids

    def test_global_customer_reviews_endpoint(self):
        """Customer can fetch reviews across multiple organizations."""
        past_date = timezone.now().date() - timedelta(days=1)
        appt = Appointment.objects.create(
            organization=self.org1,
            customer=self.customer,
            provider=self.provider1,
            service=self.service1,
            appointment_date=past_date,
            serial_number=1,
            status=Appointment.Status.COMPLETED,
            start_datetime=timezone.now() - timedelta(days=1),
            end_datetime=timezone.now() - timedelta(days=1, minutes=-30)
        )
        review = Review.objects.create(
            organization=self.org1,
            appointment=appt,
            customer=self.customer,
            provider=self.provider1,
            rating=5,
            comment='Excellent care!'
        )

        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/v1/customer/reviews/')
        assert res.status_code == status.HTTP_200_OK
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        assert len(results) == 1
        assert results[0]['comment'] == 'Excellent care!'
        assert results[0]['rating'] == 5

    def test_profile_me_get_and_patch_without_avatar(self):
        """User profile GET & PATCH work seamlessly without requiring an avatar."""
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/v1/auth/me/')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['email'] == 'customer_a2@example.com'
        assert res.data['first_name'] == 'A2Customer'

        # Patch name
        patch_res = self.client.patch('/api/v1/auth/me/', {'first_name': 'UpdatedName'})
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.data['first_name'] == 'UpdatedName'

    def test_notifications_endpoint(self):
        """Customer notifications list endpoint responds correctly."""
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/v1/customer/notifications/')
        assert res.status_code == status.HTTP_200_OK
