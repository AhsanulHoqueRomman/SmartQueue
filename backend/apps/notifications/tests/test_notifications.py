from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
import uuid
import pytest
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from apps.notifications.services import NotificationService
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService, current_business_date
from apps.services.models import Service

TZ = ZoneInfo(settings.TIME_ZONE)


class NotificationServiceAndApiTests(APITestCase):
    def setUp(self):
        # Create organization
        self.org = Organization.objects.create(
            name="SmartCare Hospital",
            slug="smartcare-hospital",
            is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED,
        )

        self.org_b = Organization.objects.create(
            name="Org B Clinic",
            slug="org-b-clinic",
            is_active=True,
            verification_status=Organization.VerificationStatus.APPROVED,
        )

        # Users
        self.customer_a = User.objects.create_user(
            email="customer.a@example.com",
            password="password123",
            first_name="Customer",
            last_name="A",
        )
        self.customer_b = User.objects.create_user(
            email="customer.b@example.com",
            password="password123",
            first_name="Customer",
            last_name="B",
        )

        # Memberships
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.customer_a,
            role=OrganizationMembership.Role.STAFF,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.customer_b,
            role=OrganizationMembership.Role.STAFF,
            is_active=True,
        )

        # Create notifications for customer_a
        self.n1 = NotificationService.create(
            recipient=self.customer_a,
            organization=self.org,
            kind="APPOINTMENT_BOOKED",
            title="Appointment Confirmed",
            message="Your appointment is confirmed.",
        )
        self.n2 = NotificationService.create(
            recipient=self.customer_a,
            organization=self.org,
            kind="QUEUE_CALLED",
            title="Queue Token Called",
            message="Token #1 called.",
        )

        # Create notification for customer_b
        self.n_b = NotificationService.create(
            recipient=self.customer_b,
            organization=self.org,
            kind="APPOINTMENT_BOOKED",
            title="Customer B Appointment",
            message="Customer B booking message.",
        )

    def test_list_notifications_user_isolation(self):
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.get(f"/api/v1/organizations/{self.org.id}/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 2)
        notification_ids = [n["id"] for n in results]
        self.assertIn(str(self.n1.id), notification_ids)
        self.assertIn(str(self.n2.id), notification_ids)
        self.assertNotIn(str(self.n_b.id), notification_ids)

    def test_mark_single_notification_read(self):
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.post(
            f"/api/v1/organizations/{self.org.id}/notifications/{self.n1.id}/read/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["read_at"])

        self.n1.refresh_from_db()
        self.assertIsNotNone(self.n1.read_at)

    def test_mark_all_notifications_read(self):
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.post(
            f"/api/v1/organizations/{self.org.id}/notifications/read-all/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated_count"], 2)

        self.n1.refresh_from_db()
        self.n2.refresh_from_db()
        self.assertIsNotNone(self.n1.read_at)
        self.assertIsNotNone(self.n2.read_at)

    def test_cannot_read_another_users_notification(self):
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.post(
            f"/api/v1/organizations/{self.org.id}/notifications/{self.n_b.id}/read/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_isolation_rejects_other_org_notifications(self):
        self.client.force_authenticate(user=self.customer_a)
        # Attempt to list notifications in org_b where customer_a has no notifications
        response = self.client.get(f"/api/v1/organizations/{self.org_b.id}/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 0)

    def test_customer_notifications_cross_org_aggregation(self):
        # Create a notification for customer_a in org_b as well
        n3 = NotificationService.create(
            recipient=self.customer_a,
            organization=self.org_b,
            kind="SERVICE_COMPLETED",
            title="Service Completed at Org B",
            message="Your service was completed at Org B.",
        )
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.get("/api/v1/customer/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 3)
        notif_ids = [n["id"] for n in results]
        self.assertIn(str(self.n1.id), notif_ids)
        self.assertIn(str(self.n2.id), notif_ids)
        self.assertIn(str(n3.id), notif_ids)

    def test_customer_single_mark_read_security(self):
        # Customer A can mark their own notification as read via customer endpoint
        self.client.force_authenticate(user=self.customer_a)
        res_own = self.client.post(f"/api/v1/customer/notifications/{self.n1.id}/read/")
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.n1.refresh_from_db()
        self.assertIsNotNone(self.n1.read_at)

        # Customer A CANNOT mark Customer B's notification as read via customer endpoint
        res_other = self.client.post(f"/api/v1/customer/notifications/{self.n_b.id}/read/")
        self.assertEqual(res_other.status_code, status.HTTP_404_NOT_FOUND)
        self.n_b.refresh_from_db()
        self.assertIsNone(self.n_b.read_at)

        # Customer A CANNOT mark Customer B's notification as read via org endpoint
        res_other_org = self.client.post(f"/api/v1/organizations/{self.org.id}/notifications/{self.n_b.id}/read/")
        self.assertEqual(res_other_org.status_code, status.HTTP_404_NOT_FOUND)
        self.n_b.refresh_from_db()
        self.assertIsNone(self.n_b.read_at)

    def test_repeated_polling_and_checkin_no_duplicate_notifications(self):
        self.client.force_authenticate(user=self.customer_a)

        initial_count = Notification.objects.filter(recipient=self.customer_a).count()
        self.assertEqual(initial_count, 2)

        # Repeated polling reads (GET endpoints) create zero persistent notifications
        for _ in range(5):
            res_notif = self.client.get("/api/v1/customer/notifications/")
            self.assertEqual(res_notif.status_code, status.HTTP_200_OK)
            res_dash = self.client.get("/api/v1/customer/dashboard/")
            self.assertEqual(res_dash.status_code, status.HTTP_200_OK)

        post_poll_count = Notification.objects.filter(recipient=self.customer_a).count()
        self.assertEqual(post_poll_count, initial_count)


@pytest.fixture
def m6_notif_setup(db):
    manager = User.objects.create_user(email='m6-notif-mgr@example.com', password='Password123!')
    provider_user = User.objects.create_user(email='m6-notif-prov@example.com', password='Password123!')
    customer = User.objects.create_user(email='m6-notif-cust@example.com', password='Password123!')
    other_customer = User.objects.create_user(email='m6-notif-other@example.com', password='Password123!')
    org = Organization.objects.create(
        name='M6 Notif Clinic',
        slug='m6-notif-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    provider_membership = OrganizationMembership.objects.create(user=provider_user, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(
        membership=provider_membership,
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(organization=org, name='M6 Notif Consult', duration_minutes=30, price='20.00')
    return locals()


def _make_appointment(s, *, customer=None, status=Appointment.Status.COMPLETED, hour=10):
    today = current_business_date()
    start = timezone.make_aware(datetime.combine(today, time(hour, 0)), timezone=TZ)
    return Appointment.objects.create(
        organization=s['org'], customer=customer or s['customer'], provider=s['provider'],
        service=s['service'], start_datetime=start, end_datetime=start + timedelta(minutes=30),
        appointment_date=today, serial_number=1, status=status,
    )


@pytest.mark.django_db
class TestNotificationsAndAudit:
    def test_core_events_create_notifications_and_audit(self, m6_notif_setup):
        s = m6_notif_setup
        appointment = _make_appointment(s, status=Appointment.Status.CONFIRMED)
        Notification.objects.all().delete()
        AuditLog.objects.all().delete()
        AppointmentService.cancel_appointment(
            appointment=appointment,
            reason='test',
            actor=s['manager'],
        )
        assert Notification.objects.filter(recipient=s['customer'], kind='APPOINTMENT_CANCELLED').exists()
        assert AuditLog.objects.filter(
            action='APPOINTMENT_CANCELLED',
            organization=s['org'],
            actor=s['manager'],
        ).exists()

    def test_customer_sees_only_own_notifications_and_manager_sees_audit(self, m6_notif_setup):
        s = m6_notif_setup
        Notification.objects.create(
            recipient=s['customer'], organization=s['org'], kind='APPOINTMENT_BOOKED',
            title='Mine', message='Mine',
        )
        Notification.objects.create(
            recipient=s['other_customer'], organization=s['org'], kind='APPOINTMENT_BOOKED',
            title='Other', message='Other',
        )
        client = APIClient()
        client.force_authenticate(user=s['customer'])
        notification_url = reverse('notifications:notification_list', kwargs={'organization_id': s['org'].id})
        response = client.get(notification_url)
        assert response.status_code == 200
        assert len(response.data) == 1
        audit_url = reverse('audit:audit_list', kwargs={'organization_id': s['org'].id})
        assert client.get(audit_url).status_code == 403
        manager_client = APIClient()
        manager_client.force_authenticate(user=s['manager'])
        assert manager_client.get(audit_url).status_code == 200

    def test_notification_read_is_owner_scoped(self, m6_notif_setup):
        s = m6_notif_setup
        notification = Notification.objects.create(
            recipient=s['customer'], organization=s['org'],
            kind='APPOINTMENT_BOOKED', title='Mine', message='Mine',
        )
        url = reverse('notifications:notification_read', kwargs={
            'organization_id': s['org'].id, 'notification_id': notification.id,
        })
        other_client = APIClient()
        other_client.force_authenticate(user=s['other_customer'])
        assert other_client.post(url).status_code == 404
        owner_client = APIClient()
        owner_client.force_authenticate(user=s['customer'])
        response = owner_client.post(url)
        assert response.status_code == 200
        assert response.data['read_at'] is not None

    def test_queue_events_create_notifications_and_audits(self, m6_notif_setup):
        s = m6_notif_setup
        appointment = _make_appointment(s, status=Appointment.Status.CONFIRMED)
        entry = QueueService.check_in_appointment(
            appointment=appointment,
            actor=s['provider_user'],
        )
        assert Notification.objects.filter(kind='APPOINTMENT_CHECKED_IN', queue_entry=entry).exists()
        assert AuditLog.objects.filter(
            action='APPOINTMENT_CHECKED_IN',
            entity_id=str(entry.id),
            actor=s['provider_user'],
        ).exists()

        QueueService.call_next(
            organization_id=s['org'].id,
            provider_id=s['provider'].id,
            on_date=entry.queue_date,
        )
        assert Notification.objects.filter(kind='QUEUE_CALLED', queue_entry=entry).exists()
        assert AuditLog.objects.filter(action='QUEUE_CALLED', entity_id=str(entry.id)).exists()

        QueueService.start_queue_entry(
            organization_id=s['org'].id, queue_entry_id=entry.id
        )
        assert AuditLog.objects.filter(action='QUEUE_STARTED', entity_id=str(entry.id)).exists()

        QueueService.complete_queue_entry(
            organization_id=s['org'].id, queue_entry_id=entry.id
        )
        assert Notification.objects.filter(kind='SERVICE_COMPLETED', queue_entry=entry).exists()
        assert AuditLog.objects.filter(action='QUEUE_COMPLETED', entity_id=str(entry.id)).exists()

    def test_audit_logs_are_organization_scoped(self, m6_notif_setup):
        s = m6_notif_setup
        other_org = Organization.objects.create(name='Other M6 Clinic', slug='other-m6-clinic')
        AuditLog.objects.create(
            organization=other_org, actor=s['manager'], action='OTHER',
            entity_type='Organization', entity_id=str(other_org.id),
        )
        client = APIClient()
        client.force_authenticate(user=s['manager'])
        url = reverse('audit:audit_list', kwargs={'organization_id': s['org'].id})
        response = client.get(url)
        assert response.status_code == 200
        assert all(item['organization'] == str(s['org'].id) for item in response.data)

