from datetime import datetime, timedelta, time
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.feedback.models import Review
from apps.feedback.serializers import PublicReviewSerializer
from apps.feedback.services import ReviewService, ReviewNotAllowedException
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.queue.services import current_business_date
from apps.services.models import Service

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
    today = current_business_date()
    start = timezone.make_aware(datetime.combine(today, time(hour, 0)), timezone=TZ)
    return Appointment.objects.create(
        organization=s['org'], customer=customer or s['customer'], provider=s['provider'],
        service=s['service'], start_datetime=start, end_datetime=start + timedelta(minutes=30),
        appointment_date=today, serial_number=1, status=status,
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


# Serializer & Media Tests

def review_with_avatar(avatar):
    return SimpleNamespace(
        id=uuid4(), rating=5, comment='Helpful service.', created_at=timezone.now(),
        customer=User(id=21, first_name='Rahima', last_name='Begum',
                      email='private@example.com', phone_number='01712345678', avatar=avatar),
        appointment=SimpleNamespace(service=SimpleNamespace(name='Consultation')),
        provider=None,
    )


@pytest.mark.parametrize('avatar', ['avatars/reviewer.webp', None, ''])
def test_public_avatar_uses_media_url_without_private_customer_fields(avatar, settings):
    settings.ALLOWED_HOSTS = ['testserver']
    request = APIRequestFactory().get('/api/v1/organizations/example/reviews/')
    data = PublicReviewSerializer(review_with_avatar(avatar), context={'request': request}).data
    expected = request.build_absolute_uri('/media/avatars/reviewer.webp') if avatar else None
    assert data['customer_avatar_url'] == expected
    assert data['customer_name'] == 'Rahima B.'
    assert not {'customer', 'customer_email', 'phone_number', 'avatar'} & data.keys()


def test_avatar_without_request_retains_storage_media_url():
    data = PublicReviewSerializer(review_with_avatar('avatars/reviewer.webp')).data
    assert data['customer_avatar_url'] == '/media/avatars/reviewer.webp'


def test_public_review_avatar_is_read_only():
    serializer = PublicReviewSerializer(data={'customer_avatar_url': 'https://example.com/forged.jpg'})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {}
