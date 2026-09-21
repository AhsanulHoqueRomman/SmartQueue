import uuid
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.notifications.models import Notification
from apps.notifications.services import NotificationService


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

    def test_customer_notifications_mark_all_read(self):
        n3 = NotificationService.create(
            recipient=self.customer_a,
            organization=self.org_b,
            kind="SERVICE_COMPLETED",
            title="Service Completed at Org B",
            message="Your service was completed at Org B.",
        )
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.post("/api/v1/customer/notifications/read-all/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated_count"], 3)

        self.n1.refresh_from_db()
        self.n2.refresh_from_db()
        n3.refresh_from_db()
        self.assertIsNotNone(self.n1.read_at)
        self.assertIsNotNone(self.n2.read_at)
        self.assertIsNotNone(n3.read_at)

