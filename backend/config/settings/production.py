from .base import *
from django.core.exceptions import ImproperlyConfigured

DEBUG = False

if not os.getenv('SECRET_KEY'):
	raise ImproperlyConfigured('SECRET_KEY must be set when using production settings.')
if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or SECRET_KEY.startswith('django-insecure-'):
	raise ImproperlyConfigured('SECRET_KEY must be a long, random production secret.')

if not os.getenv('ALLOWED_HOSTS') or not ALLOWED_HOSTS:
	raise ImproperlyConfigured('ALLOWED_HOSTS must be explicitly configured in production.')

# Production Security Defaults
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() in ('true', '1', 't')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

csrf_origins = os.getenv('CSRF_TRUSTED_ORIGINS', '')
if csrf_origins:
    CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in csrf_origins.split(',') if origin.strip()]

