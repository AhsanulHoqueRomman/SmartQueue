from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from apps.accounts.models import User
from apps.feedback.serializers import PublicReviewSerializer


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
