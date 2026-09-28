import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from apps.contact.email_service import (
    EmailSendResult,
    send_contact_admin_notification,
    send_contact_customer_confirmation,
)
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


@pytest.fixture(autouse=True)
def _no_real_emails(monkeypatch):
    """Safety net: the entire contact test suite must never send a real email.

    Individual wiring tests override specific functions with custom fakes; this
    fixture only guarantees that un-mocked codepaths (for example the existing
    admin tests that now exercise the reply view) cannot reach the network.
    """
    monkeypatch.setattr(
        'apps.contact.views.send_contact_admin_notification',
        lambda message: EmailSendResult(success=True, email_id='mock-admin'),
    )
    monkeypatch.setattr(
        'apps.contact.views.send_contact_customer_confirmation',
        lambda message: EmailSendResult(success=True, email_id='mock-confirm'),
    )

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


@pytest.mark.django_db
class TestContactEmailWiring:
    url = '/api/v1/contact/'

    @pytest.fixture(autouse=True)
    def mail_mock(self, monkeypatch):
        """Replace both email-service wrappers with fakes that record calls. No
        real email is ever sent and no network call is ever made."""
        self.admin_notify_called = False
        self.admin_notify_result = None
        self.customer_confirm_called = False
        self.customer_confirm_result = None

        def fake_admin(message):
            self.admin_notify_called = True
            assert isinstance(message, ContactMessage)
            return EmailSendResult(success=True, email_id='mock-admin')

        def fake_confirm(message):
            self.customer_confirm_called = True
            assert isinstance(message, ContactMessage)
            return EmailSendResult(success=True, email_id='mock-confirm')

        monkeypatch.setattr('apps.contact.views.send_contact_admin_notification', fake_admin)
        monkeypatch.setattr('apps.contact.views.send_contact_customer_confirmation', fake_confirm)

    def test_submission_dispatches_both_emails(self, api_client):
        payload = {
            'name': 'Jane Customer',
            'email': 'jane@example.com',
            'subject': 'Help needed',
            'message': 'I need help with my booking.',
        }
        response = api_client.post(self.url, payload, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert self.admin_notify_called
        assert self.customer_confirm_called

        msg = ContactMessage.objects.get(id=response.data['id'])
        assert msg.status == ContactMessage.Status.NEW

    def test_submission_succeeds_when_confirmation_email_fails(self, api_client, monkeypatch):
        """A failed customer confirmation must NOT invalidate the 201 response."""

        def failing_confirm(message):
            return EmailSendResult(success=False, error='Resend unavailable')

        monkeypatch.setattr(
            'apps.contact.views.send_contact_customer_confirmation', failing_confirm
        )

        payload = {
            'name': 'Terry',
            'email': 'terry@example.com',
            'subject': 'Service Issue',
            'message': 'Unavailable in production right now.',
        }
        response = api_client.post(self.url, payload, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        msg = ContactMessage.objects.get(id=response.data['id'])
        assert msg.status == ContactMessage.Status.NEW
        assert msg.email == 'terry@example.com'
        assert self.admin_notify_called

    def test_subscriber_email_is_still_persisted_when_notification_fails(
        self, api_client, monkeypatch
    ):
        """A failed admin notification must NOT roll back the saved message."""

        def failing_notify(message):
            return EmailSendResult(success=False, error='network failure')

        monkeypatch.setattr(
            'apps.contact.views.send_contact_admin_notification', failing_notify
        )

        payload = {
            'name': 'Vulnerable Customer',
            'email': 'vuln@example.com',
            'subject': 'Urgent',
            'message': 'Please help.',
        }
        response = api_client.post(self.url, payload, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert ContactMessage.objects.filter(
            email='vuln@example.com', status=ContactMessage.Status.NEW
        ).exists()
        assert self.customer_confirm_called