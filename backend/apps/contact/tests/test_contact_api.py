import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from apps.contact.models import ContactMessage

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        email='customer@example.com',
        password='Password123!',
        first_name='Test',
        last_name='Customer',
    )


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
class TestContactAPI:
    url = '/api/v1/contact/'

    def test_anonymous_submission_success(self, api_client):
        payload = {
            'name': 'John Doe',
            'email': 'john.doe@example.com',
            'phone': '+1234567890',
            'subject': 'Appointment Inquiry',
            'message': 'I would like to inquire about booking an appointment.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert 'id' in response.data
        assert response.data['name'] == 'John Doe'
        assert response.data['email'] == 'john.doe@example.com'
        assert response.data['phone'] == '+1234567890'
        assert response.data['subject'] == 'Appointment Inquiry'
        assert response.data['message'] == 'I would like to inquire about booking an appointment.'
        assert response.data['status'] == 'NEW'

        # Verify DB persistence
        contact_msg = ContactMessage.objects.get(id=response.data['id'])
        assert contact_msg.status == ContactMessage.Status.NEW
        assert contact_msg.name == 'John Doe'

    def test_authenticated_submission_success(self, api_client, test_user):
        api_client.force_authenticate(user=test_user)
        payload = {
            'name': 'Logged Customer',
            'email': test_user.email,
            'subject': 'Customer Support Request',
            'message': 'Need assistance with my current queue status.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert ContactMessage.objects.filter(email=test_user.email).exists()

    def test_missing_required_fields(self, api_client):
        # Missing name
        res1 = api_client.post(self.url, {'email': 'a@b.com', 'subject': 'Sub', 'message': 'Msg'}, format='json')
        assert res1.status_code == status.HTTP_400_BAD_REQUEST
        assert 'name' in res1.data

        # Missing email
        res2 = api_client.post(self.url, {'name': 'Name', 'subject': 'Sub', 'message': 'Msg'}, format='json')
        assert res2.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in res2.data

        # Missing subject
        res3 = api_client.post(self.url, {'name': 'Name', 'email': 'a@b.com', 'message': 'Msg'}, format='json')
        assert res3.status_code == status.HTTP_400_BAD_REQUEST
        assert 'subject' in res3.data

        # Missing message
        res4 = api_client.post(self.url, {'name': 'Name', 'email': 'a@b.com', 'subject': 'Sub'}, format='json')
        assert res4.status_code == status.HTTP_400_BAD_REQUEST
        assert 'message' in res4.data

    def test_invalid_email_format(self, api_client):
        payload = {
            'name': 'John Doe',
            'email': 'not-an-email',
            'subject': 'Invalid Email Test',
            'message': 'Testing invalid email formatting.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data

    def test_optional_phone_omitted(self, api_client):
        payload = {
            'name': 'Jane Doe',
            'email': 'jane@example.com',
            'subject': 'No Phone Provided',
            'message': 'Phone field is omitted in this test.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['phone'] == ''

    def test_lifecycle_field_protection(self, api_client):
        payload = {
            'name': 'Malicious User',
            'email': 'hacker@example.com',
            'subject': 'Bypass Test',
            'message': 'Attempting to inject lifecycle fields.',
            'status': 'REPLIED',
            'replied_at': '2026-09-24T12:00:00Z',
            'replied_by': '00000000-0000-0000-0000-000000000000',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['status'] == 'NEW'
        assert response.data['replied_at'] is None
        assert response.data['replied_by'] is None

        # Verify DB record ignores client-injected lifecycle fields
        contact_msg = ContactMessage.objects.get(id=response.data['id'])
        assert contact_msg.status == ContactMessage.Status.NEW
        assert contact_msg.replied_at is None
        assert contact_msg.replied_by is None

    def test_whitespace_trimming(self, api_client):
        payload = {
            'name': '   Padded Name   ',
            'email': '   Padded.Email@Example.COM   ',
            'phone': '   +8801700000000   ',
            'subject': '   Padded Subject   ',
            'message': '   Padded Message   ',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Padded Name'
        assert response.data['email'] == 'padded.email@example.com'
        assert response.data['phone'] == '+8801700000000'
        assert response.data['subject'] == 'Padded Subject'
        assert response.data['message'] == 'Padded Message'

    def test_empty_or_whitespace_only_values(self, api_client):
        payload = {
            'name': '   ',
            'email': '   ',
            'subject': '   ',
            'message': '   ',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'name' in response.data
        assert 'email' in response.data
        assert 'subject' in response.data
        assert 'message' in response.data

    def test_international_phone_format(self, api_client):
        payload = {
            'name': 'Global Visitor',
            'email': 'visitor@international.org',
            'phone': '+44 20 7946 0958',
            'subject': 'International Query',
            'message': 'Testing UK phone format support.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['phone'] == '+44 20 7946 0958'

    def test_public_access_no_auth_header(self, api_client):
        # Explicitly ensure credentials are blank
        api_client.credentials()
        payload = {
            'name': 'Anonymous Person',
            'email': 'anon@example.com',
            'subject': 'Public Question',
            'message': 'No authentication header passed.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

    def test_unsupported_http_methods(self, api_client):
        res_get = api_client.get(self.url)
        assert res_get.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        res_put = api_client.put(self.url, {})
        assert res_put.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        res_patch = api_client.patch(self.url, {})
        assert res_patch.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        res_delete = api_client.delete(self.url)
        assert res_delete.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_rate_throttling(self, api_client):
        payload = {
            'name': 'Rate Limit Tester',
            'email': 'ratelimit@example.com',
            'subject': 'Spam Test',
            'message': 'Sending multiple rapid requests.',
        }
        # Default throttle rate is 10/hour. First 10 requests should succeed.
        for _ in range(10):
            res = api_client.post(self.url, payload, format='json')
            assert res.status_code == status.HTTP_201_CREATED

        # 11th request should be throttled
        res_throttled = api_client.post(self.url, payload, format='json')
        assert res_throttled.status_code == status.HTTP_429_TOO_MANY_REQUESTS
