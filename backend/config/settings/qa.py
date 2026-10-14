"""QA Settings for isolated browser acceptance testing on port 8001.

Strictly connects to `queueturn_qa_browser_20261013_acceptance`.
Neutralizes all email credentials and installs a QA-only mock transport
on `resend.Emails.send` that guarantees zero outbound network traffic.
"""
import os
import sys
import uuid
import logging
from .development import *  # noqa: F403

logger = logging.getLogger(__name__)

# 1. Enforce QA Database Isolation
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'queueturn_qa_browser_20261013_acceptance',
        'USER': os.getenv('DATABASE_USER', 'postgres'),
        'PASSWORD': os.getenv('DATABASE_PASSWORD', 'postgres'),
        'HOST': os.getenv('DATABASE_HOST', '127.0.0.1'),
        'PORT': os.getenv('DATABASE_PORT', '5432'),
    }
}

# 2. CORS configuration for QA frontend on port 5174
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_ALL_ORIGINS = True

# 3. Neutralize real email credentials
os.environ['RESEND_API_KEY'] = 'qa_mock_never_network_resend_api_key'
os.environ['RESEND_FROM_EMAIL'] = 'qa-noreply@qa.invalid'
os.environ['RESEND_FROM_NAME'] = 'QueueTurn QA'
os.environ['SMARTQUEUE_SUPPORT_EMAIL'] = 'qa-support@qa.invalid'

# 4. In-Memory QA Mock Email Transport
class QAMockEmailTransport:
    history = []
    mode = 'ACCEPTED'  # 'ACCEPTED', 'FAILED', or 'UNKNOWN'

    @classmethod
    def reset(cls):
        cls.history.clear()
        cls.mode = 'ACCEPTED'

    @classmethod
    def mock_send(cls, params, options=None):
        import resend.exceptions
        record = {
            'params': params,
            'options': options,
            'id': f'resend_mock_{uuid.uuid4().hex[:16]}',
            'simulated_mode': cls.mode,
        }
        cls.history.append(record)
        logger.info(f"[QA MOCK EMAIL] Intercepted send to {params.get('to')} (mode={cls.mode}). Zero network traffic.")

        if cls.mode == 'ACCEPTED':
            return {'id': record['id']}
        elif cls.mode == 'FAILED':
            # Definitive 4xx error (outcome_uncertain = False)
            raise resend.exceptions.ResendError(
                422, "validation_error", "QA Simulated 422 Unprocessable Entity", "Check payload"
            )
        elif cls.mode == 'UNKNOWN':
            # Upstream 5xx / timeout (outcome_uncertain = True)
            raise resend.exceptions.ResendError(
                504, "gateway_timeout", "QA Simulated 504 Gateway Timeout", "Retry later"
            )
        else:
            raise ValueError(f"Unknown QA email simulation mode: {cls.mode}")

# 5. Install the mock transport onto the Resend SDK
try:
    import resend
    resend.Emails.send = staticmethod(QAMockEmailTransport.mock_send)
    logger.info("[QA Settings] Successfully patched resend.Emails.send with QAMockEmailTransport.")
except ImportError:
    pass
