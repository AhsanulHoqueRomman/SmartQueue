"""Keep verification-file test writes isolated from real user storage."""
import pytest


@pytest.fixture(autouse=True)
def private_verification_test_storage(settings, tmp_path_factory):
    settings.STORAGES = {**settings.STORAGES, 'private_documents': {
        'BACKEND': 'config.private_documents.PrivateDocumentStorage',
        'OPTIONS': {'location': str(tmp_path_factory.mktemp('verification-private'))},
    }}
