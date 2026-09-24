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

    def test_missing_name_returns_400(self, api_client):
        payload = {'email': 'a@b.com', 'subject': 'Sub', 'message': 'Msg'}
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'name' in response.data

    def test_missing_email_returns_400(self, api_client):
        payload = {'name': 'Name', 'subject': 'Sub', 'message': 'Msg'}
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data

    def test_missing_subject_returns_400(self, api_client):
        payload = {'name': 'Name', 'email': 'a@b.com', 'message': 'Msg'}
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'subject' in response.data

    def test_missing_message_returns_400(self, api_client):
        payload = {'name': 'Name', 'email': 'a@b.com', 'subject': 'Sub'}
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'message' in response.data

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

        # Verify DB record ignores client-injected lifecycle fields
        contact_msg = ContactMessage.objects.get(id=response.data['id'])
        assert contact_msg.status == ContactMessage.Status.NEW
        assert contact_msg.replied_at is None
        assert contact_msg.replied_by is None

    def test_public_access_no_auth_header(self, api_client):
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
        assert api_client.get(self.url).status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert api_client.put(self.url, {}).status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert api_client.patch(self.url, {}).status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert api_client.delete(self.url).status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_rate_throttling_anonymous(self, api_client):
        payload = {
            'name': 'Rate Limit Tester',
            'email': 'ratelimit@example.com',
            'subject': 'Spam Test',
            'message': 'Sending multiple rapid requests.',
        }
        # Throttle limit is 10/hour. First 10 requests succeed.
        for _ in range(10):
            res = api_client.post(self.url, payload, format='json')
            assert res.status_code == status.HTTP_201_CREATED

        # 11th request receives 429
        res_throttled = api_client.post(self.url, payload, format='json')
        assert res_throttled.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_rate_throttling_authenticated(self, api_client, test_user):
        api_client.force_authenticate(user=test_user)
        payload = {
            'name': 'Auth Rate Limit Tester',
            'email': test_user.email,
            'subject': 'Auth Spam Test',
            'message': 'Sending multiple rapid requests as auth user.',
        }
        for _ in range(10):
            res = api_client.post(self.url, payload, format='json')
            assert res.status_code == status.HTTP_201_CREATED

        res_throttled = api_client.post(self.url, payload, format='json')
        assert res_throttled.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_message_length_5000_accepted(self, api_client):
        payload = {
            'name': 'Max Length User',
            'email': 'maxlength@example.com',
            'subject': '5000 Char Test',
            'message': 'a' * 5000,
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data['message']) == 5000

    def test_message_length_5001_rejected(self, api_client):
        payload = {
            'name': 'Oversized User',
            'email': 'oversized@example.com',
            'subject': '5001 Char Test',
            'message': 'a' * 5001,
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'message' in response.data

    def test_public_response_excludes_replied_by_and_replied_at(self, api_client):
        payload = {
            'name': 'Data Leak Check',
            'email': 'dataleak@example.com',
            'subject': 'Public Exposure Audit',
            'message': 'Checking response fields for admin metadata exposure.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        # Crucial security check: internal admin fields MUST NOT be present in JSON response
        assert 'replied_by' not in response.data
        assert 'replied_at' not in response.data

    def test_initial_status_is_new(self, api_client):
        payload = {
            'name': 'Status Check User',
            'email': 'statuscheck@example.com',
            'subject': 'Initial Status Verification',
            'message': 'Verifying initial state transition.',
        }
        response = api_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['status'] == 'NEW'
        msg = ContactMessage.objects.get(id=response.data['id'])
        assert msg.status == ContactMessage.Status.NEW
