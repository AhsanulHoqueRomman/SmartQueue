"""Hosting-independent production configuration; fail before accepting requests."""
from urllib.parse import urlsplit
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.core.validators import validate_email
from .base import *


def _required(name):
    value = os.getenv(name) or ''
    if not value.strip():
        raise ImproperlyConfigured(f'{name} must be explicitly configured in production.')
    return value


def _boolean(name, default):
    value = os.getenv(name, str(default)).strip().lower()
    if value not in {'true', 'false', '1', '0'}:
        raise ImproperlyConfigured(f'{name} must be true or false.')
    return value in {'true', '1'}


def _https_origin(value, name, allow_subdomains=False):
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == 'https' and parsed.hostname and
                 not parsed.username and not parsed.password and
                 parsed.path in {'', '/'} and not parsed.query and not parsed.fragment)
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            valid = False
        if '*' in (parsed.hostname or ''):
            valid = valid and allow_subdomains and parsed.hostname.startswith('*.') and parsed.hostname.count('*') == 1
    except ValueError:
        valid = False
    if not valid:
        raise ImproperlyConfigured(f'{name} must contain HTTPS origins without credentials, paths or query strings.')
    return value.rstrip('/')


def _origins(name, allow_subdomains=False):
    return [_https_origin(origin.strip(), name, allow_subdomains)
            for origin in os.getenv(name, '').split(',') if origin.strip()]


DEBUG = False
SECRET_KEY = _required('SECRET_KEY')
if (len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or
        SECRET_KEY.startswith('django-insecure-') or
        any(marker in SECRET_KEY.lower() for marker in
            ['change-me', 'changeme', 'replace-me', 'your-secret', 'default-unsecure', 'placeholder'])):
    raise ImproperlyConfigured('SECRET_KEY must be a long, random, non-placeholder production secret.')
SIMPLE_JWT = {**SIMPLE_JWT, 'SIGNING_KEY': SECRET_KEY}

ALLOWED_HOSTS = [host.strip() for host in _required('ALLOWED_HOSTS').split(',') if host.strip()]
if not ALLOWED_HOSTS or any(
        not host.strip('.') or any(character in host for character in '*/@?#') or
        any(character.isspace() for character in host) or
        (':' in host and not (host.startswith('[') and host.endswith(']')))
        for host in ALLOWED_HOSTS):
    raise ImproperlyConfigured('ALLOWED_HOSTS must contain explicit hostnames, not wildcard, URL or host:port values.')

# No SQLite/test auto-selection or local PostgreSQL credential defaults here.
if _boolean('USE_SQLITE', False) or os.getenv('DATABASE_ENGINE', 'django.db.backends.postgresql') != 'django.db.backends.postgresql':
    raise ImproperlyConfigured('Production requires the PostgreSQL database backend.')
DATABASES = {'default': {
    'ENGINE': 'django.db.backends.postgresql',
    **{key: _required('DATABASE_' + key) for key in ['NAME', 'USER', 'PASSWORD', 'HOST']},
    'PORT': os.getenv('DATABASE_PORT', '5432').strip(),
}}
if DATABASES['default']['PASSWORD'].strip().lower() in {'postgres', 'password', 'change-me', 'changeme', 'placeholder'}:
    raise ImproperlyConfigured('DATABASE_PASSWORD must not use a known development/placeholder value.')
try:
    if not 1 <= int(DATABASES['default']['PORT']) <= 65535:
        raise ValueError
except ValueError:
    raise ImproperlyConfigured('DATABASE_PORT must be an integer between 1 and 65535.') from None

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_SSL_REDIRECT = _boolean('SECURE_SSL_REDIRECT', True)
# Opt in only after the chosen proxy's strip/rewrite behavior is verified.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if _boolean('TRUST_X_FORWARDED_PROTO', False) else None
try:
    SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))
    if SECURE_HSTS_SECONDS < 0:
        raise ValueError
except ValueError:
    raise ImproperlyConfigured('SECURE_HSTS_SECONDS must be a nonnegative integer.') from None
SECURE_HSTS_INCLUDE_SUBDOMAINS = _boolean('SECURE_HSTS_INCLUDE_SUBDOMAINS', False)
SECURE_HSTS_PRELOAD = _boolean('SECURE_HSTS_PRELOAD', False)
if SECURE_HSTS_PRELOAD and (SECURE_HSTS_SECONDS < 31536000 or not SECURE_HSTS_INCLUDE_SUBDOMAINS):
    raise ImproperlyConfigured('HSTS preload requires at least one year and include-subdomains; verify every affected host first.')

if _boolean('CORS_ALLOW_ALL_ORIGINS', False):
    raise ImproperlyConfigured('CORS_ALLOW_ALL_ORIGINS must be false in production.')
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = _origins('CORS_ALLOWED_ORIGINS')
CSRF_TRUSTED_ORIGINS = _origins('CSRF_TRUSTED_ORIGINS', allow_subdomains=True)

# Entirely missing email credentials retain existing failure-safe send results.
# Explicitly configured email cannot use example credentials or localhost links.
_email_key = (os.getenv('RESEND_API_KEY') or '').strip()
_email_sender = (os.getenv('RESEND_FROM_EMAIL') or '').strip()
if _email_key or _email_sender:
    _required('RESEND_API_KEY')
    _required('RESEND_FROM_EMAIL')
    if any(marker in _email_key.lower() for marker in ['your_resend', 'placeholder', 'change-me']):
        raise ImproperlyConfigured('RESEND_API_KEY must not be a placeholder.')
    for name in ['RESEND_FROM_EMAIL', 'SMARTQUEUE_SUPPORT_EMAIL']:
        value = (os.getenv(name) or '').strip()
        if value:
            try:
                validate_email(value)
            except ValidationError:
                raise ImproperlyConfigured(f'{name} must be a valid email address.') from None
            domain = value.rsplit('@', 1)[-1].lower()
            if domain in {'example.com', 'example.org', 'example.net', 'resend.dev'} or domain.endswith(('.example', '.invalid', '.test')):
                raise ImproperlyConfigured(f'{name} must not use an example or testing domain in production.')
    FRONTEND_URL = _https_origin(_required('FRONTEND_URL'), 'FRONTEND_URL')
elif os.getenv('FRONTEND_URL'):
    FRONTEND_URL = _https_origin(os.environ['FRONTEND_URL'].strip(), 'FRONTEND_URL')

if os.path.realpath(MEDIA_ROOT) == os.path.realpath(STATIC_ROOT):
    raise ImproperlyConfigured('Public MEDIA_ROOT and STATIC_ROOT must remain separate.')

# Production static files via WhiteNoise compressed manifest storage
STORAGES = {
    **STORAGES,
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Preserve F-024's explicit, persistent, private storage startup gate.
PRIVATE_DOCUMENT_PRODUCTION = True
from config.private_documents import validate_private_storage_configuration
validate_private_storage_configuration()
