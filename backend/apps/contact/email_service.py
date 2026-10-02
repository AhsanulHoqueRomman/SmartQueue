"""Resend transactional email service for the Contact Us app.

This module wraps the ``resend`` SDK and is deliberately *failure-safe*: sending
an email must never raise into the request path, never roll back the
``ContactMessage`` database write that triggered it, and never leak the API key
into logs or error responses. Every public function returns an
:class:`EmailSendResult` describing what happened so that callers can decide
whether to log, retry, or ignore.

Configuration is read from the process environment, which ``config.settings.base``
populates via ``load_dotenv`` at Django startup:

    RESEND_API_KEY           - Resend API key (secret, never logged)
    RESEND_FROM_EMAIL        - verified sender address
    RESEND_FROM_NAME         - optional display name for the sender
    SMARTQUEUE_SUPPORT_EMAIL - inbox that receives admin notifications

Note: this module performs no database access; it only reads attributes off the
``ContactMessage`` instance it is handed.
"""

import logging
import os
from dataclasses import dataclass
from typing import Optional

import resend
from django.utils.html import escape

logger = logging.getLogger(__name__)

__all__ = [
    'EmailSendResult',
    'send_contact_admin_notification',
    'send_contact_customer_confirmation',
    'send_contact_admin_reply',
    'send_password_reset_email',
]

# Maximum number of characters of an upstream error message we are willing to
# persist in a log line or result object.
_MAX_ERROR_LENGTH = 500

# Maps internal config keys to the environment variable operators must set.
_CONFIG_ENV_VARS = {
    'api_key': 'RESEND_API_KEY',
    'from_email': 'RESEND_FROM_EMAIL',
    'from_name': 'RESEND_FROM_NAME',
    'support_email': 'SMARTQUEUE_SUPPORT_EMAIL',
}


@dataclass(frozen=True)
class EmailSendResult:
    """Outcome of an attempted email send.

    ``success`` is ``True`` only when Resend accepted the message and returned a
    message id. ``error`` carries a short, sanitised reason on failure and is
    ``None`` on success.
    """

    success: bool
    email_id: Optional[str] = None
    error: Optional[str] = None


def _get_config():
    """Read and normalise the Resend settings from the environment."""
    return {
        'api_key': (os.getenv('RESEND_API_KEY') or '').strip(),
        'from_email': (os.getenv('RESEND_FROM_EMAIL') or '').strip(),
        'from_name': (os.getenv('RESEND_FROM_NAME') or '').strip(),
        'support_email': (os.getenv('SMARTQUEUE_SUPPORT_EMAIL') or '').strip(),
    }


def _missing_env_vars(config, required):
    """Return the environment variable names whose config value is empty."""
    return [_CONFIG_ENV_VARS[key] for key in required if not config.get(key)]


def _format_from_address(config):
    """Build the RFC-style ``Display Name <address>`` sender value."""
    if config['from_name']:
        return f"{config['from_name']} <{config['from_email']}>"
    return config['from_email']


def _sanitise(message, api_key):
    """Redact the API key (and bound the length) of an error string."""
    text = str(message)
    if api_key and api_key in text:
        text = text.replace(api_key, '***')
    if len(text) > _MAX_ERROR_LENGTH:
        text = text[:_MAX_ERROR_LENGTH] + '...'
    return text


def _send(*, to, subject, text, html=None, reply_to=None, context=''):
    """Perform a single Resend send, swallowing every failure.

    Args:
        to: recipient email address.
        subject: subject line.
        text: plain-text body.
        html: optional HTML body.
        reply_to: optional reply-to address.
        context: short label used in logs (never includes message content).

    Returns:
        EmailSendResult: never raises.
    """
    config = _get_config()

    missing = _missing_env_vars(config, ['api_key', 'from_email'])
    if missing:
        logger.warning(
            'Contact email skipped (%s): missing configuration for %s',
            context or 'email',
            ', '.join(missing),
        )
        return EmailSendResult(
            success=False,
            error=f"Missing email configuration: {', '.join(missing)}",
        )

    params = {
        'from': _format_from_address(config),
        'to': [to] if isinstance(to, str) else list(to),
        'subject': subject,
        'text': text,
    }
    if html:
        params['html'] = html
    if reply_to:
        params['reply_to'] = reply_to

    try:
        # The SDK reads the module-level ``api_key`` when building request
        # headers, so set it explicitly rather than relying on import order.
        resend.api_key = config['api_key']
        response = resend.Emails.send(params)
    except Exception as exc:  # noqa: BLE001 - email must never break the caller
        safe_error = _sanitise(exc, config['api_key'])
        logger.error('Contact email failed (%s): %s', context or 'email', safe_error)
        return EmailSendResult(success=False, error=safe_error)

    email_id = None
    if isinstance(response, dict):
        email_id = response.get('id')

    logger.info(
        'Contact email sent (%s) to %s (id=%s)',
        context or 'email',
        ', '.join(params['to']),
        email_id or 'unknown',
    )
    return EmailSendResult(success=True, email_id=email_id)


def _text_to_html(text):
    """Render a plain-text block as a minimal, escaped HTML fragment."""
    return '<div style="font-family:Arial,sans-serif;white-space:pre-wrap;">{}</div>'.format(
        escape(text).replace('\n', '<br />')
    )


def _display(value, fallback='Not provided'):
    return value if value else fallback


def send_contact_admin_notification(contact_message):
    """Notify the support inbox that a new Contact Us inquiry arrived."""
    config = _get_config()
    missing = _missing_env_vars(config, ['api_key', 'from_email', 'support_email'])
    if missing:
        logger.warning(
            'Contact email skipped (admin notification): missing configuration for %s',
            ', '.join(missing),
        )
        return EmailSendResult(
            success=False,
            error=f"Missing email configuration: {', '.join(missing)}",
        )

    submitted = getattr(contact_message, 'created_at', None)
    reference = str(getattr(contact_message, 'id', '') or '')

    subject = f"[Contact Us] {contact_message.subject}"
    text = (
        'A new Contact Us inquiry has been submitted.\n\n'
        f'Reference: {_display(reference)}\n'
        f'Name: {contact_message.name}\n'
        f'Email: {contact_message.email}\n'
        f'Phone: {_display(getattr(contact_message, "phone", ""))}\n'
        f'Subject: {contact_message.subject}\n'
    )
    if submitted:
        text += f'Submitted: {submitted}\n'
    text += f'\nMessage:\n{contact_message.message}\n'

    return _send(
        to=config['support_email'],
        subject=subject,
        text=text,
        html=_text_to_html(text),
        reply_to=contact_message.email,
        context='admin notification',
    )


def send_contact_customer_confirmation(contact_message):
    """Acknowledge receipt of an inquiry to the customer."""
    config = _get_config()
    missing = _missing_env_vars(config, ['api_key', 'from_email'])
    if missing:
        logger.warning(
            'Contact email skipped (customer confirmation): missing configuration for %s',
            ', '.join(missing),
        )
        return EmailSendResult(
            success=False,
            error=f"Missing email configuration: {', '.join(missing)}",
        )

    reference = str(getattr(contact_message, 'id', '') or '')

    subject = 'We received your message - SmartQueue Support'
    text = (
        f'Hello {contact_message.name},\n\n'
        'Thank you for contacting SmartQueue. We have received your message and '
        'our support team will get back to you as soon as possible.\n\n'
    )
    if reference:
        text += f'Your reference number: {reference}\n\n'
    text += (
        f'Your subject: {contact_message.subject}\n\n'
        'Your message:\n'
        f'{contact_message.message}\n\n'
    )
    if config['support_email']:
        text += f'If you need to follow up, reach us at {config["support_email"]}.\n\n'
    text += 'Thank you,\nSmartQueue Support Team'

    return _send(
        to=contact_message.email,
        subject=subject,
        text=text,
        html=_text_to_html(text),
        reply_to=config['support_email'] or None,
        context='customer confirmation',
    )


def send_contact_admin_reply(contact_message, reply_text, admin_name=None):
    """Deliver an admin's reply to the customer who submitted the inquiry."""
    config = _get_config()
    missing = _missing_env_vars(config, ['api_key', 'from_email'])
    if missing:
        logger.warning(
            'Contact email skipped (admin reply): missing configuration for %s',
            ', '.join(missing),
        )
        return EmailSendResult(
            success=False,
            error=f"Missing email configuration: {', '.join(missing)}",
        )

    signature = f'{admin_name}\n' if admin_name else ''
    body = (
        f'Hello {contact_message.name},\n\n'
        'Our support team has replied to your inquiry.\n\n'
        f'{reply_text}\n\n'
        'For reference, your original message was:\n'
        f'{contact_message.message}\n\n'
        f'Best regards,\n{signature}SmartQueue Support Team'
    )

    return _send(
        to=contact_message.email,
        subject=f'Re: {contact_message.subject}',
        text=body,
        html=_text_to_html(body),
        reply_to=config['support_email'] or None,
        context='admin reply',
    )


def send_password_reset_email(user, reset_url):
    """Deliver a password reset link email to the specified user."""
    config = _get_config()
    missing = _missing_env_vars(config, ['api_key', 'from_email'])
    if missing:
        logger.warning(
            'Password reset email skipped: missing configuration for %s',
            ', '.join(missing),
        )
        return EmailSendResult(
            success=False,
            error=f"Missing email configuration: {', '.join(missing)}",
        )

    name_greeting = f" {user.get_short_name()}" if hasattr(user, 'get_short_name') and user.get_short_name() else ""
    text = (
        f'Hello{name_greeting},\n\n'
        'We received a request to reset your SmartQueue password.\n\n'
        'Reset your password:\n'
        f'{reset_url}\n\n'
        'This link is valid for a limited time.\n\n'
        'If you did not request a password reset, you can safely ignore this email.\n\n'
        'Regards,\n'
        'SmartQueue Support'
    )

    html = (
        f'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #211C19;">'
        f'<h2 style="color: #2F2520;">Reset your SmartQueue password</h2>'
        f'<p>Hello{name_greeting},</p>'
        f'<p>We received a request to reset your SmartQueue password.</p>'
        f'<p style="margin: 25px 0;">'
        f'<a href="{escape(reset_url)}" style="background-color: #2F2520; color: #FAF8F3; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>'
        f'</p>'
        f'<p style="font-size: 0.875rem; color: #78716C;">Or copy and paste this URL into your browser:<br /><a href="{escape(reset_url)}" style="color: #5F7A70;">{escape(reset_url)}</a></p>'
        f'<p style="font-size: 0.875rem; color: #78716C;">This link is valid for a limited time.</p>'
        f'<p style="font-size: 0.875rem; color: #78716C;">If you did not request a password reset, you can safely ignore this email.</p>'
        f'<hr style="border: none; border-top: 1px solid #E6E1D9; margin: 20px 0;" />'
        f'<p style="font-size: 0.8125rem; color: #A8A29E;">Regards,<br />SmartQueue Support</p>'
        f'</div>'
    )

    return _send(
        to=user.email,
        subject='Reset your SmartQueue password',
        text=text,
        html=html,
        reply_to=config['support_email'] or None,
        context='password reset',
    )
