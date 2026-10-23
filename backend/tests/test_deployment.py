"""Startup/dependency contracts; subprocesses use synthetic config and no DB."""
import json
import subprocess
import sys
from importlib.metadata import version
from pathlib import Path

import pytest
from packaging.requirements import Requirement

BACKEND = Path(__file__).resolve().parents[1]
SNAPSHOT = """
import json, os
from django.conf import settings
print(json.dumps({
    'module': settings.SETTINGS_MODULE, 'debug': settings.DEBUG,
    'engine': settings.DATABASES['default']['ENGINE'],
    'cookies': [settings.SESSION_COOKIE_SECURE, settings.CSRF_COOKIE_SECURE],
    'proxy': settings.SECURE_PROXY_SSL_HEADER,
    'cors_all': settings.CORS_ALLOW_ALL_ORIGINS,
    'cors': settings.CORS_ALLOWED_ORIGINS,
    'csrf': settings.CSRF_TRUSTED_ORIGINS,
    'hsts': [settings.SECURE_HSTS_SECONDS, settings.SECURE_HSTS_INCLUDE_SUBDOMAINS, settings.SECURE_HSTS_PRELOAD],
    'frontend': settings.FRONTEND_URL,
    'credential_values_preserved': (settings.SECRET_KEY == os.environ['SECRET_KEY'] and
        settings.DATABASES['default'].get('PASSWORD') == os.environ['DATABASE_PASSWORD']),
}))
"""


def startup(env, entry='config.wsgi', prefix=''):
    # Fail the test if startup unexpectedly contacts PostgreSQL or loads .env.
    script = """
import psycopg2, dotenv
def no_database(*args, **kwargs):
    raise AssertionError('Configuration verification must not connect to PostgreSQL')
psycopg2.connect = no_database
""" + prefix + f'\nimport {entry}\n' + SNAPSHOT
    return subprocess.run([sys.executable, '-c', script], cwd=BACKEND,
                          env=env, capture_output=True, text=True, timeout=20)


@pytest.mark.parametrize('entry', ['config.wsgi', 'config.asgi'])
def test_entrypoints_default_to_production(production_environment, entry):
    result = startup(production_environment, entry,
                     "dotenv.load_dotenv = lambda *a, **k: (_ for _ in ()).throw(AssertionError('Production must not load .env'))")
    assert result.returncode == 0, result.stderr
    config = json.loads(result.stdout)
    assert config['module'] == 'config.settings.production'
    assert config['debug'] is False and config['engine'] == 'django.db.backends.postgresql'
    assert config['cookies'] == [True, True]
    assert config['proxy'] is None and config['cors_all'] is False
    assert config['cors'] == [] and config['csrf'] == []
    assert config['hsts'] == [0, False, False]


@pytest.mark.parametrize('entry', ['config.wsgi', 'config.asgi'])
def test_entrypoints_do_not_fall_back_when_production_config_missing(production_environment, entry):
    production_environment['SECRET_KEY'] = ''
    result = startup(production_environment, entry)
    assert result.returncode != 0 and 'SECRET_KEY must be explicitly configured' in result.stderr


@pytest.mark.parametrize('entry', ['config.wsgi', 'config.asgi'])
def test_explicit_development_remains_supported(production_environment, entry):
    production_environment.update(DJANGO_SETTINGS_MODULE='config.settings.development', USE_SQLITE='true')
    result = startup(production_environment, entry)
    assert result.returncode == 0, result.stderr
    config = json.loads(result.stdout)
    assert config['module'] == 'config.settings.development'
    assert config['debug'] is True and config['engine'] == 'django.db.backends.sqlite3'


@pytest.mark.parametrize('name,value,error', [
    ('SECRET_KEY', '', 'SECRET_KEY'),
    ('ALLOWED_HOSTS', '', 'ALLOWED_HOSTS'),
    ('DATABASE_PASSWORD', '', 'DATABASE_PASSWORD'),
    ('DATABASE_ENGINE', 'django.db.backends.sqlite3', 'PostgreSQL'),
    ('CORS_ALLOW_ALL_ORIGINS', 'true', 'CORS_ALLOW_ALL_ORIGINS'),
    ('RESEND_API_KEY', 're_your_resend_api_key_here', 'RESEND_FROM_EMAIL'),
])
def test_unsafe_production_config_fails_without_secret_exposure(production_environment, name, value, error):
    production_environment[name] = value
    result = startup(production_environment)
    assert result.returncode != 0 and error in result.stderr
    for name in ['DATABASE_PASSWORD', 'SECRET_KEY']:
        if production_environment[name]:
            assert production_environment[name] not in result.stderr
    assert 'django.db.utils.OperationalError' not in result.stderr


def test_production_cannot_be_switched_to_sqlite_by_test_detection(production_environment):
    result = startup(production_environment, prefix="import sys; sys.modules['pytest'] = object(); sys.argv.append('test')")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['engine'] == 'django.db.backends.postgresql'


def test_significant_credential_whitespace_is_preserved(production_environment):
    production_environment['SECRET_KEY'] = ' ' + production_environment['SECRET_KEY'] + ' '
    production_environment['DATABASE_PASSWORD'] = ' ' + production_environment['DATABASE_PASSWORD'] + ' '
    result = startup(production_environment)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['credential_values_preserved'] is True


def test_explicit_proxy_origins_and_hsts_options(production_environment):
    production_environment.update(TRUST_X_FORWARDED_PROTO='true',
        CORS_ALLOWED_ORIGINS='https://queue.example.org', CSRF_TRUSTED_ORIGINS='https://*.queue.example.org',
        SECURE_HSTS_SECONDS='31536000', SECURE_HSTS_INCLUDE_SUBDOMAINS='true', SECURE_HSTS_PRELOAD='true')
    result = startup(production_environment)
    assert result.returncode == 0, result.stderr
    config = json.loads(result.stdout)
    assert config['proxy'] == ['HTTP_X_FORWARDED_PROTO', 'https']
    assert config['cors'] == ['https://queue.example.org']
    assert config['csrf'] == ['https://*.queue.example.org']
    assert config['hsts'] == [31536000, True, True]


@pytest.mark.parametrize('override,error', [
    ({'RESEND_API_KEY': ''}, 'RESEND_API_KEY'),
    ({'RESEND_API_KEY': 're_your_resend_api_key_here'}, 'placeholder'),
    ({'RESEND_FROM_EMAIL': 'onboarding@resend.dev'}, 'testing domain'),
    ({'RESEND_FROM_EMAIL': 'invalid-address'}, 'valid email'),
    ({'SMARTQUEUE_SUPPORT_EMAIL': 'support@example.com'}, 'example'),
    ({'FRONTEND_URL': ''}, 'FRONTEND_URL'),
])
def test_configured_email_rejects_incomplete_or_example_config(production_environment, override, error):
    production_environment.update(RESEND_API_KEY='synthetic-not-live-credential',
        RESEND_FROM_EMAIL='noreply@queue.example.edu', FRONTEND_URL='https://queue.example.edu')
    production_environment.update(override)
    result = startup(production_environment)
    assert result.returncode != 0 and error in result.stderr
    assert 'synthetic-not-live-credential' not in result.stderr


def test_configured_email_imports_without_network_and_support_is_optional(production_environment):
    production_environment.update(RESEND_API_KEY='synthetic-not-live-credential',
        RESEND_FROM_EMAIL='noreply@queue.example.edu', FRONTEND_URL='https://queue.example.edu/')
    result = startup(production_environment)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['frontend'] == 'https://queue.example.edu'


def test_manage_py_development_default_and_explicit_production(production_environment):
    development = {**production_environment, 'USE_SQLITE': 'true'}
    result = subprocess.run([sys.executable, 'manage.py', 'check'], env=development,
                            cwd=BACKEND, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    production = {**production_environment, 'SECRET_KEY': ''}
    result = subprocess.run([sys.executable, 'manage.py', 'check', '--settings=config.settings.production'],
                            env=production, cwd=BACKEND, capture_output=True, text=True, timeout=20)
    assert result.returncode != 0 and 'SECRET_KEY' in result.stderr


def test_single_utf8_dependency_source_and_required_runtime_imports():
    assert (BACKEND / 'requirements.txt').read_text(encoding='utf-8').splitlines() == [
        '# The repository-root file is the single pinned backend dependency source.', '-r ../requirements.txt']
    declarations = [Requirement(line) for line in (BACKEND.parent / 'requirements.txt').read_text(encoding='utf-8').splitlines()
                    if line and not line.startswith('#')]
    pins = {requirement.name.lower(): requirement for requirement in declarations}
    for name in ['Django', 'djangorestframework', 'django-cors-headers', 'django-filter', 'python-dotenv',
                 'drf-spectacular', 'djangorestframework_simplejwt', 'psycopg2-binary', 'Pillow', 'resend', 'gunicorn']:
        assert name.lower() in pins
        assert version(name) in pins[name.lower()].specifier
    import resend
    from PIL import Image
    from apps.contact.email_service import EmailSendResult
    assert callable(resend.Emails.send) and callable(Image.open)
    assert EmailSendResult(success=False).success is False
