"""Unit tests for the Contact Us Resend email service.

Every test mocks ``resend.Emails.send`` so that no real email is ever sent and no
network call is ever made. Tests build *unsaved* ``ContactMessage`` instances
(the service performs no DB access), so no database is required.
"""

import logging
import uuid
from unittest.mock import Mock

import pytest

from apps.contact.email_service import (
    EmailSendResult,
    send_contact_admin_notification,
    send_contact_admin_reply,
    send_contact_customer_confirmation,
)
from apps.contact.models import ContactMessage

API_KEY = 'test-api-key-not-real'
FROM_EMAIL = 'noreply@smartqueue.test'
FROM_NAME = 'QueueTurn Support'
SUPPORT_EMAIL = 'support@smartqueue.test'


def make_message(**overrides):
    """Build an unsaved ContactMessage with sane defaults."""
    fields = {
        'id': uuid.uuid4(),
        'name': 'Jane Customer',
        'email': 'jane.customer@example.com',
        'phone': '+15551234567',
        'subject': 'Appointment help',
        'message': 'I need help rescheduling my booking.',
    }
    fields.update(overrides)
    return ContactMessage(**fields)


@pytest.fixture
def email_env(monkeypatch):
    """Populate all four Resend environment variables."""
    monkeypatch.setenv('RESEND_API_KEY', API_KEY)
    monkeypatch.setenv('RESEND_FROM_EMAIL', FROM_EMAIL)
    monkeypatch.setenv('RESEND_FROM_NAME', FROM_NAME)
    monkeypatch.setenv('SMARTQUEUE_SUPPORT_EMAIL', SUPPORT_EMAIL)


@pytest.fixture
def send_mock(monkeypatch):
    """Replace the Resend SDK send call with a mock (guarantees no network)."""
    mock = Mock(return_value={'id': 'email_123', 'object': 'email'})
    monkeypatch.setattr('apps.contact.email_service.resend.Emails.send', mock)
    return mock


# ---------------------------------------------------------------------------
# Successful sends & exact parameters
# ---------------------------------------------------------------------------

class TestSendSuccess:
    def test_admin_notification_sends_expected_params(self, email_env, send_mock):
        message = make_message()

        result = send_contact_admin_notification(message)

        assert isinstance(result, EmailSendResult)
        assert result.success is True
        assert result.email_id == 'email_123'
        assert result.error is None

        send_mock.assert_called_once()
        params = send_mock.call_args.args[0]
        assert params['to'] == [SUPPORT_EMAIL]
        assert params['from'] == f'{FROM_NAME} <{FROM_EMAIL}>'
        assert params['subject'] == '[Contact Us] Appointment help'
        assert params['reply_to'] == message.email
        assert message.message in params['text']
        assert message.email in params['text']
        assert message.name in params['text']
        assert str(message.id) in params['text']
        assert message.message in params['html']

    def test_customer_confirmation_sends_expected_params(self, email_env, send_mock):
        message = make_message()

        result = send_contact_customer_confirmation(message)

        assert result.success is True
        assert result.email_id == 'email_123'

        params = send_mock.call_args.args[0]
        assert params['to'] == [message.email]
        assert params['from'] == f'{FROM_NAME} <{FROM_EMAIL}>'
        assert params['subject'] == 'We received your message - QueueTurn Support'
        assert params['reply_to'] == SUPPORT_EMAIL
        assert message.name in params['text']
        assert message.subject in params['text']
        assert message.message in params['text']
        assert SUPPORT_EMAIL in params['text']

    def test_admin_reply_sends_expected_params(self, email_env, send_mock):
        message = make_message()
        reply = 'Your booking has been moved to Friday at 10:00.'

        result = send_contact_admin_reply(message, reply, admin_name='Admin Ann')

        assert result.success is True
        assert result.email_id == 'email_123'

        params = send_mock.call_args.args[0]
        assert params['to'] == [message.email]
        assert params['from'] == f'{FROM_NAME} <{FROM_EMAIL}>'
        assert params['subject'] == f'Re: {message.subject}'
        assert params['reply_to'] == SUPPORT_EMAIL
        assert reply in params['text']
        assert 'Admin Ann' in params['text']
        assert message.message in params['text']

    def test_admin_reply_without_admin_name(self, email_env, send_mock):
        result = send_contact_admin_reply(make_message(), 'Short reply.')

        assert result.success is True
        params = send_mock.call_args.args[0]
        assert 'Short reply.' in params['text']
        assert 'None' not in params['text']

    def test_from_address_falls_back_to_bare_email(self, email_env, send_mock, monkeypatch):
        monkeypatch.setenv('RESEND_FROM_NAME', '')

        send_contact_customer_confirmation(make_message())

        params = send_mock.call_args.args[0]
        assert params['from'] == FROM_EMAIL

    def test_api_key_is_applied_to_sdk(self, email_env, send_mock):
        import resend

        send_contact_admin_notification(make_message())

        assert resend.api_key == API_KEY

    def test_configuration_is_read_per_call(self, email_env, send_mock, monkeypatch):
        monkeypatch.setenv('SMARTQUEUE_SUPPORT_EMAIL', 'other-inbox@smartqueue.test')

        send_contact_admin_notification(make_message())

        assert send_mock.call_args.args[0]['to'] == ['other-inbox@smartqueue.test']


# ---------------------------------------------------------------------------
# Failure handling (must never raise / never break the caller)
# ---------------------------------------------------------------------------

class TestSendFailure:
    def test_resend_error_is_swallowed(self, email_env, send_mock):
        from resend.exceptions import ResendError

        send_mock.side_effect = ResendError(
            code=422,
            error_type='validation_error',
            message='Invalid `to` field.',
            suggested_action='Fix the address.',
        )

        result = send_contact_admin_notification(make_message())

        assert result.success is False
        assert result.email_id is None
        assert 'Invalid `to` field.' in result.error

    def test_unexpected_exception_is_swallowed(self, email_env, send_mock):
        send_mock.side_effect = RuntimeError('socket exploded')

        result = send_contact_customer_confirmation(make_message())

        assert result.success is False
        assert 'socket exploded' in result.error

    def test_failure_does_not_propagate_for_any_function(self, email_env, send_mock):
        send_mock.side_effect = Exception('boom')

        message = make_message()
        assert send_contact_admin_notification(message).success is False
        assert send_contact_customer_confirmation(message).success is False
        assert send_contact_admin_reply(message, 'reply').success is False

    def test_missing_message_id_in_response_is_not_fatal(self, email_env, send_mock):
        send_mock.return_value = {'object': 'email'}

        result = send_contact_admin_notification(make_message())

        assert result.success is True
        assert result.email_id is None


# ---------------------------------------------------------------------------
# Missing configuration
# ---------------------------------------------------------------------------

class TestMissingConfiguration:
    def test_missing_api_key_skips_send(self, email_env, send_mock, monkeypatch):
        monkeypatch.delenv('RESEND_API_KEY', raising=False)

        message = make_message()
        for result in (
            send_contact_admin_notification(message),
            send_contact_customer_confirmation(message),
            send_contact_admin_reply(message, 'reply'),
        ):
            assert result.success is False
            assert 'RESEND_API_KEY' in result.error

        send_mock.assert_not_called()

    def test_missing_from_email_skips_send(self, email_env, send_mock, monkeypatch):
        monkeypatch.delenv('RESEND_FROM_EMAIL', raising=False)

        result = send_contact_customer_confirmation(make_message())

        assert result.success is False
        assert 'RESEND_FROM_EMAIL' in result.error
        send_mock.assert_not_called()

    def test_blank_api_key_is_treated_as_missing(self, email_env, send_mock, monkeypatch):
        monkeypatch.setenv('RESEND_API_KEY', '   ')

        result = send_contact_customer_confirmation(make_message())

        assert result.success is False
        assert 'RESEND_API_KEY' in result.error
        send_mock.assert_not_called()

    def test_missing_support_email_only_blocks_admin_notification(
        self, email_env, send_mock, monkeypatch
    ):
        monkeypatch.delenv('SMARTQUEUE_SUPPORT_EMAIL', raising=False)

        notification = send_contact_admin_notification(make_message())
        assert notification.success is False
        assert 'SMARTQUEUE_SUPPORT_EMAIL' in notification.error

        # Customer-facing flows do not need the support inbox.
        assert send_contact_customer_confirmation(make_message()).success is True
        assert send_contact_admin_reply(make_message(), 'reply').success is True
        assert send_mock.call_count == 2


# ---------------------------------------------------------------------------
# Secret safety
# ---------------------------------------------------------------------------

class TestSecretSafety:
    def test_api_key_is_redacted_from_error_and_logs(
        self, email_env, send_mock, caplog, monkeypatch
    ):
        secret = 'sk_live_super_secret_value'
        monkeypatch.setenv('RESEND_API_KEY', secret)
        # Simulate an HTTP client error that echoes the Authorization header.
        send_mock.side_effect = RuntimeError(f'auth header Bearer {secret} rejected')

        with caplog.at_level(logging.ERROR, logger='apps.contact.email_service'):
            result = send_contact_admin_notification(make_message())

        assert result.success is False
        assert secret not in (result.error or '')
        assert '***' in (result.error or '')
        assert caplog.records
        for record in caplog.records:
            assert secret not in record.getMessage()

    def test_api_key_never_appears_in_logs_on_success(
        self, email_env, send_mock, caplog, monkeypatch
    ):
        secret = 'sk_live_super_secret_value'
        monkeypatch.setenv('RESEND_API_KEY', secret)

        with caplog.at_level(logging.INFO, logger='apps.contact.email_service'):
            result = send_contact_admin_notification(make_message())

        assert result.success is True
        assert caplog.records
        for record in caplog.records:
            assert secret not in record.getMessage()
