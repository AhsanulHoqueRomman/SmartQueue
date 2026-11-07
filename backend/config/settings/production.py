"""Hosting-independent production configuration."""
import os
from .base import *


def _boolean(name, default):
    return os.getenv(name, str(default)).strip().lower() in {'true', '1'}


DEBUG = False

SECRET_KEY = os.getenv('SECRET_KEY', SECRET_KEY)
SIMPLE_JWT = {**SIMPLE_JWT, 'SIGNING_KEY': SECRET_KEY}

ALLOWED_HOSTS = [host.strip() for host in os.getenv('ALLOWED_HOSTS', '').split(',') if host.strip()] or ALLOWED_HOSTS

DATABASES = {
    'default': {
        'ENGINE': os.getenv('DATABASE_ENGINE', DATABASES['default']['ENGINE']),
        'NAME': os.getenv('DATABASE_NAME', DATABASES['default']['NAME']),
        'USER': os.getenv('DATABASE_USER', DATABASES['default']['USER']),
        'PASSWORD': os.getenv('DATABASE_PASSWORD', DATABASES['default']['PASSWORD']),
        'HOST': os.getenv('DATABASE_HOST', DATABASES['default']['HOST']),
        'PORT': os.getenv('DATABASE_PORT', DATABASES['default']['PORT']),
    }
}

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_SSL_REDIRECT = _boolean('SECURE_SSL_REDIRECT', True)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if _boolean('TRUST_X_FORWARDED_PROTO', False) else None

try:
    SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))
except ValueError:
    SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = _boolean('SECURE_HSTS_INCLUDE_SUBDOMAINS', False)
SECURE_HSTS_PRELOAD = _boolean('SECURE_HSTS_PRELOAD', False)

CORS_ALLOW_ALL_ORIGINS = _boolean('CORS_ALLOW_ALL_ORIGINS', False)
CORS_ALLOWED_ORIGINS = [origin.strip().rstrip('/') for origin in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if origin.strip()]
CSRF_TRUSTED_ORIGINS = [origin.strip().rstrip('/') for origin in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if origin.strip()]

FRONTEND_URL = os.getenv('FRONTEND_URL', '').strip().rstrip('/')

# Production static files via WhiteNoise compressed manifest storage
STORAGES = {
    **STORAGES,
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}
