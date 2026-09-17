from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.appointments.services import AppointmentService
from apps.audit.models import AuditLog
from apps.feedback.models import Review
from apps.feedback.services import ReviewService, ReviewNotAllowedException
from apps.notifications.models import Notification
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Service
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService

TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def m6_setup(db):
    manager = User.objects.create_user(email='m6-manager@example.com', password='Password123!')
    provider_user = User.objects.create_user(email='m6-provider@example.com', password='Password123!')
    customer = User.objects.create_user(email='m6-customer@example.com', password='Password123!')
    other_customer = User.objects.create_user(email='m6-other@example.com', password='Password123!')
    org = Organization.objects.create(
        name='M6 Clinic',
        slug='m6-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    provider_membership = OrganizationMembership.objects.create(user=provider_user, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(
        membership=provider_membership,
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(organization=org, name='M6 Consult', duration_minutes=30, price='20.00')
    return locals()


def make_appointment(s, *, customer=None, status=Appointment.Status.COMPLETED, hour=10):
    start = timezone.make_aware(datetime(2030, 1, 7, hour, 0), timezone=TZ)
    return Appointment.objects.create(
        organization=s['org'], customer=customer or s['customer'], provider=s['provider'],
        service=s['service'], start_datetime=start, end_datetime=start + timedelta(minutes=30),
        status=status,
    )


def login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestReviews:
    def test_only_completed_customer_can_review_once(self, m6_setup):
        appointment = make_appointment(m6_setup)
        review = ReviewService.create_review(
            appointment=appointment, customer=m6_setup['customer'], rating=5, comment='Excellent'
        )
        assert review.provider_id == m6_setup['provider'].id
        with pytest.raises(IntegrityError):
            Review.objects.create(
                organization=m6_setup['org'], appointment=appointment,
                customer=m6_setup['customer'], provider=m6_setup['provider'], rating=4,
            )

    def test_incomplete_appointment_cannot_be_reviewed(self, m6_setup):
        appointment = make_appointment(m6_setup, status=Appointment.Status.IN_PROGRESS)
        with pytest.raises(ReviewNotAllowedException):
            ReviewService.create_review(
                appointment=appointment, customer=m6_setup['customer'], rating=5
            )

    def test_review_rating_constraint_and_wrong_customer_are_rejected(self, m6_setup):
        appointment = make_appointment(m6_setup)
        with pytest.raises(IntegrityError):
            Review.objects.create(
                organization=m6_setup['org'], appointment=appointment,
                customer=m6_setup['customer'], provider=m6_setup['provider'], rating=6,
            )
        with pytest.raises(Exception) as error:
            ReviewService.create_review(
                appointment=appointment, customer=m6_setup['other_customer'], rating=5
            )
        assert getattr(error.value, 'default_code', '') == 'REVIEW_FORBIDDEN'

    def test_review_api_is_tenant_and_owner_scoped(self, m6_setup):
        appointment = make_appointment(m6_setup)
        client = APIClient()
        login(client, m6_setup['customer'])
        url = reverse('feedback:appointment_review', kwargs={'organization_id': m6_setup['org'].id, 'appointment_id': appointment.id})
        response = client.post(url, {'rating': 4, 'comment': 'Good'}, format='json')
        assert response.status_code == 201
        assert response.data['rating'] == 4
        other_client = APIClient()
        login(other_client, m6_setup['other_customer'])
        assert other_client.post(url, {'rating': 5}, format='json').status_code == 403

    def test_manager_and_provider_can_view_appropriate_reviews(self, m6_setup):
        appointment = make_appointment(m6_setup)
        ReviewService.create_review(
            appointment=appointment, customer=m6_setup['customer'], rating=5
        )
        url = reverse('feedback:review_list', kwargs={'organization_id': m6_setup['org'].id})
        for user in (m6_setup['manager'], m6_setup['provider_user']):
            client = APIClient()
            login(client, user)
            response = client.get(url)
            assert response.status_code == 200
            assert len(response.data) == 1


@pytest.mark.django_db
class TestNotificationsAndAudit:
    def test_core_events_create_notifications_and_audit(self, m6_setup):
        appointment = make_appointment(m6_setup, status=Appointment.Status.CONFIRMED)
        Notification.objects.all().delete()
        AuditLog.objects.all().delete()
        AppointmentService.cancel_appointment(
            appointment=appointment,
            reason='test',
            actor=m6_setup['manager'],
        )
        assert Notification.objects.filter(recipient=m6_setup['customer'], kind='APPOINTMENT_CANCELLED').exists()
        assert AuditLog.objects.filter(
            action='APPOINTMENT_CANCELLED',
            organization=m6_setup['org'],
            actor=m6_setup['manager'],
        ).exists()

    def test_customer_sees_only_own_notifications_and_manager_sees_audit(self, m6_setup):
        Notification.objects.create(
            recipient=m6_setup['customer'], organization=m6_setup['org'], kind='APPOINTMENT_BOOKED',
            title='Mine', message='Mine',
        )
        Notification.objects.create(
            recipient=m6_setup['other_customer'], organization=m6_setup['org'], kind='APPOINTMENT_BOOKED',
            title='Other', message='Other',
        )
        client = APIClient()
        login(client, m6_setup['customer'])
        notification_url = reverse('notifications:notification_list', kwargs={'organization_id': m6_setup['org'].id})
        response = client.get(notification_url)
        assert response.status_code == 200
        assert len(response.data) == 1
        audit_url = reverse('audit:audit_list', kwargs={'organization_id': m6_setup['org'].id})
        assert client.get(audit_url).status_code == 403
        manager_client = APIClient()
        login(manager_client, m6_setup['manager'])
        assert manager_client.get(audit_url).status_code == 200

    def test_notification_read_is_owner_scoped(self, m6_setup):
        notification = Notification.objects.create(
            recipient=m6_setup['customer'], organization=m6_setup['org'],
            kind='APPOINTMENT_BOOKED', title='Mine', message='Mine',
        )
        url = reverse('notifications:notification_read', kwargs={
            'organization_id': m6_setup['org'].id, 'notification_id': notification.id,
        })
        other_client = APIClient()
        login(other_client, m6_setup['other_customer'])
        assert other_client.post(url).status_code == 404
        owner_client = APIClient()
        login(owner_client, m6_setup['customer'])
        response = owner_client.post(url)
        assert response.status_code == 200
        assert response.data['read_at'] is not None

    def test_queue_events_create_notifications_and_audits(self, m6_setup):
        appointment = make_appointment(m6_setup, status=Appointment.Status.CONFIRMED)
        entry = QueueService.check_in_appointment(
            appointment=appointment,
            actor=m6_setup['provider_user'],
        )
        assert Notification.objects.filter(kind='APPOINTMENT_CHECKED_IN', queue_entry=entry).exists()
        assert AuditLog.objects.filter(
            action='APPOINTMENT_CHECKED_IN',
            entity_id=str(entry.id),
            actor=m6_setup['provider_user'],
        ).exists()

        QueueService.call_next(
            organization_id=m6_setup['org'].id,
            provider_id=m6_setup['provider'].id,
            on_date=entry.queue_date,
        )
        assert Notification.objects.filter(kind='QUEUE_CALLED', queue_entry=entry).exists()
        assert AuditLog.objects.filter(action='QUEUE_CALLED', entity_id=str(entry.id)).exists()

        QueueService.start_queue_entry(
            organization_id=m6_setup['org'].id, queue_entry_id=entry.id
        )
        assert AuditLog.objects.filter(action='QUEUE_STARTED', entity_id=str(entry.id)).exists()

        QueueService.complete_queue_entry(
            organization_id=m6_setup['org'].id, queue_entry_id=entry.id
        )
        assert Notification.objects.filter(kind='SERVICE_COMPLETED', queue_entry=entry).exists()
        assert AuditLog.objects.filter(action='QUEUE_COMPLETED', entity_id=str(entry.id)).exists()

    def test_audit_logs_are_organization_scoped(self, m6_setup):
        other_org = Organization.objects.create(name='Other M6 Clinic', slug='other-m6-clinic')
        AuditLog.objects.create(
            organization=other_org, actor=m6_setup['manager'], action='OTHER',
            entity_type='Organization', entity_id=str(other_org.id),
        )
        client = APIClient()
        login(client, m6_setup['manager'])
        url = reverse('audit:audit_list', kwargs={'organization_id': m6_setup['org'].id})
        response = client.get(url)
        assert response.status_code == 200
        assert all(item['organization'] == str(m6_setup['org'].id) for item in response.data)
