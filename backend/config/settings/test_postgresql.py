"""Explicit opt-in PostgreSQL test database; never use the development DB as TEST."""
import os
from .development import *  # noqa: F403

DATABASES = {'default': {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': os.getenv('DATABASE_NAME', 'smartqueue_db'),
    'USER': os.getenv('DATABASE_USER', 'postgres'),
    'PASSWORD': os.getenv('DATABASE_PASSWORD', 'postgres'),
    'HOST': os.getenv('DATABASE_HOST', '127.0.0.1'),
    'PORT': os.getenv('DATABASE_PORT', '5432'),
    'TEST': {'NAME': 'test_queueturn_m2'},
}}
