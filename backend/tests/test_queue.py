from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.appointments.models import Appointment
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Service
from apps.queue.models import QueueEntry
from apps.queue.services import QueueService

User = get_user_model()
TZ = ZoneInfo(settings.TIME_ZONE)


@pytest.fixture
def queue_setup(db):
    manager = User.objects.create_user(email='manager@queue.test', password='Password123!')
    provider_user = User.objects.create_user(email='provider@queue.test', password='Password123!')
    customer = User.objects.create_user(email='customer@queue.test', password='Password123!')
    org = Organization.objects.create(
        name='Queue Clinic',
        slug='queue-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    membership = OrganizationMembership.objects.create(user=provider_user, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(
        membership=membership,
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )
    service = Service.objects.create(organization=org, name='Consult', duration_minutes=30, price='10.00')
    return locals()


def _appointment(s, customer=None, provider=None, start=None, status=Appointment.Status.CONFIRMED):
    start = start or timezone.make_aware(datetime(2030, 1, 7, 9, 0), timezone=TZ)
    return Appointment.objects.create(
        organization=s['org'], customer=customer or s['customer'],
        provider=provider or s['provider'], service=s['service'],
        start_datetime=start, end_datetime=start + timedelta(minutes=30), status=status,
    )


def _login(client, user):
    client.force_authenticate(user=user)


@pytest.mark.django_db
class TestQueueService:
    def test_check_in_creates_sequential_tokens_per_provider_and_date(self, queue_setup):
        s = queue_setup
        first = QueueService.check_in_appointment(appointment=_appointment(s))
        second = QueueService.check_in_appointment(
            appointment=_appointment(s, customer=User.objects.create_user(email='second@queue.test'))
        )
        assert first.token_number == 1
        assert second.token_number == 2
        assert first.queue_date == date(2030, 1, 7)
        assert first.status == QueueEntry.Status.WAITING
        assert first.appointment.status == Appointment.Status.CHECKED_IN

    def test_token_restarts_for_next_day_and_provider(self, queue_setup):
        s = queue_setup
        first = QueueService.check_in_appointment(appointment=_appointment(s))
        next_day = timezone.make_aware(datetime(2030, 1, 8, 9, 0), timezone=TZ)
        second = QueueService.check_in_appointment(
            appointment=_appointment(s, customer=User.objects.create_user(email='second@queue.test'), start=next_day)
        )
        other_user = User.objects.create_user(email='other-provider@queue.test')
        other_membership = OrganizationMembership.objects.create(user=other_user, organization=s['org'], role='PROVIDER')
        other_provider = ProviderProfile.objects.create(membership=other_membership)
        third = QueueService.check_in_appointment(
            appointment=_appointment(s, customer=User.objects.create_user(email='third@queue.test'), provider=other_provider)
        )
        assert first.token_number == second.token_number == third.token_number == 1

    def test_lifecycle_and_appointment_sync(self, queue_setup):
        s = queue_setup
        entry = QueueService.check_in_appointment(appointment=_appointment(s))
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=entry.queue_date)
        QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)
        completed = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)
        assert completed.status == QueueEntry.Status.COMPLETED
        assert completed.completed_at is not None
        assert completed.appointment.status == Appointment.Status.COMPLETED

    def test_skip_marks_appointment_no_show(self, queue_setup):
        s = queue_setup
        entry = QueueService.check_in_appointment(appointment=_appointment(s))
        QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id, on_date=entry.queue_date)
        skipped = QueueService.skip_queue_entry(organization_id=s['org'].id, queue_entry_id=entry.id)
        assert skipped.status == QueueEntry.Status.SKIPPED
        assert skipped.skipped_at is not None
        assert skipped.appointment.status == Appointment.Status.NO_SHOW

    def test_token_constraint_rejects_duplicate(self, queue_setup):
        s = queue_setup
        first = QueueService.check_in_appointment(appointment=_appointment(s))
        with pytest.raises(IntegrityError):
            QueueEntry.objects.create(
                organization=s['org'], appointment=_appointment(s, customer=User.objects.create_user(email='duplicate@queue.test')),
                provider=s['provider'], queue_date=first.queue_date, token_number=first.token_number,
            )


@pytest.mark.django_db
class TestQueueAPI:
    def test_demoted_provider_profile_is_no_longer_discoverable_or_manageable(self, queue_setup):
        s = queue_setup
        s['provider_membership'] = OrganizationMembership.objects.get(
            user=s['provider_user'], organization=s['org']
        )
        s['provider_membership'].role = OrganizationMembership.Role.STAFF
        s['provider_membership'].save(update_fields=['role'])

        client = APIClient()
        _login(client, s['manager'])
        list_url = reverse(
            'providers:provider_list_create',
            kwargs={'organization_id': s['org'].id},
        )
        assert client.get(list_url).data == []
        detail_url = reverse(
            'providers:provider_detail',
            kwargs={'organization_id': s['org'].id, 'provider_id': s['provider'].id},
        )
        assert client.get(detail_url).status_code == 404

    def test_customer_can_check_in_and_view_only_own_queue(self, queue_setup):
        s = queue_setup
        appointment = _appointment(s)
        client = APIClient()
        _login(client, s['customer'])
        checkin = client.post(reverse('appointments:appointment_check_in', kwargs={'organization_id': s['org'].id, 'appointment_id': appointment.id}))
        assert checkin.status_code == 200
        assert checkin.data['status'] == Appointment.Status.CHECKED_IN
        response = client.get(reverse('queue:my_queue', kwargs={'organization_id': s['org'].id}))
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]['token_number'] == 1

    def test_provider_can_manage_queue_but_customer_cannot_call_next(self, queue_setup):
        s = queue_setup
        entry = QueueService.check_in_appointment(appointment=_appointment(s))
        url = reverse('queue:call_next', kwargs={'organization_id': s['org'].id, 'provider_id': s['provider'].id})
        customer_client = APIClient()
        _login(customer_client, s['customer'])
        assert customer_client.post(url).status_code == 403
        provider_client = APIClient()
        _login(provider_client, s['provider_user'])
        assert provider_client.post(f'{url}?date={entry.queue_date.isoformat()}').status_code == 200
        assert QueueEntry.objects.get(id=entry.id).status == QueueEntry.Status.CALLED
