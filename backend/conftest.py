"""Keep verification-file test writes isolated from real user storage."""
import pytest


@pytest.fixture
def production_environment(tmp_path):
    """Synthetic startup config; never load local credentials or connect a DB."""
    import os
    variables = {key: value for key, value in os.environ.items()
                 if not key.startswith(('DATABASE_', 'RESEND_', 'PRIVATE_DOCUMENT_',
                                        'SECURE_', 'CORS_', 'CSRF_', 'DJANGO_'))
                 and key not in {'SECRET_KEY', 'ALLOWED_HOSTS', 'USE_SQLITE',
                                 'FRONTEND_URL', 'SMARTQUEUE_SUPPORT_EMAIL',
                                 'TRUST_X_FORWARDED_PROTO'}}
    variables.update({
        'SECRET_KEY': 'configuration-only-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-!@$',
        'ALLOWED_HOSTS': 'queue.example.org',
        'DATABASE_NAME': 'configuration_only_never_connect',
        'DATABASE_USER': 'configuration_only',
        'DATABASE_PASSWORD': 'configuration-only-nondefault-password',
        'DATABASE_HOST': '127.0.0.1',
        'DATABASE_PORT': '1',
        'PRIVATE_DOCUMENT_ROOT': str(tmp_path / 'private'),
        'PRIVATE_DOCUMENT_STORAGE_PERSISTENT': 'true',
    })
    return variables


@pytest.fixture(autouse=True)
def private_verification_test_storage(settings, tmp_path_factory):
    settings.STORAGES = {**settings.STORAGES, 'private_documents': {
        'BACKEND': 'config.private_documents.PrivateDocumentStorage',
        'OPTIONS': {'location': str(tmp_path_factory.mktemp('verification-private'))},
    }}
