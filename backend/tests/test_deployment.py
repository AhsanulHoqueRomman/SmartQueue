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
                 'drf-spectacular', 'djangorestframework_simplejwt', 'psycopg2-binary', 'Pillow', 'resend', 'gunicorn', 'whitenoise']:
        assert name.lower() in pins
        assert version(name) in pins[name.lower()].specifier
    import resend
    from PIL import Image
    from whitenoise.middleware import WhiteNoiseMiddleware
    from apps.contact.email_service import EmailSendResult
    assert callable(resend.Emails.send) and callable(Image.open) and callable(WhiteNoiseMiddleware)
    assert EmailSendResult(success=False).success is False


def test_health_check_endpoint(client):
    response = client.get('/api/health/')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'app': 'QueueTurn'}


def test_production_whitenoise_and_static_configuration(production_environment):
    script = """
import psycopg2, dotenv, json
psycopg2.connect = lambda *a, **k: (_ for _ in ()).throw(AssertionError('No DB'))
import config.wsgi
from django.conf import settings
mw = list(settings.MIDDLEWARE)
sec_idx = mw.index('django.middleware.security.SecurityMiddleware')
wn_idx = mw.index('whitenoise.middleware.WhiteNoiseMiddleware')
print(json.dumps({
    'middleware_order': wn_idx == sec_idx + 1,
    'staticfiles_storage': settings.STORAGES['staticfiles']['BACKEND'],
    'default_storage': settings.STORAGES['default']['BACKEND'],
    'private_storage': settings.STORAGES['private_documents']['BACKEND'],
    'media_static_separate': str(settings.MEDIA_ROOT) != str(settings.STATIC_ROOT),
}))
"""
    result = subprocess.run([sys.executable, '-c', script], cwd=BACKEND,
                            env=production_environment, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['middleware_order'] is True
    assert data['staticfiles_storage'] == 'whitenoise.storage.CompressedManifestStaticFilesStorage'
    assert data['default_storage'] == 'django.core.files.storage.FileSystemStorage'
    assert data['private_storage'] == 'config.private_documents.PrivateDocumentStorage'
    assert data['media_static_separate'] is True


def test_collectstatic_compressed_manifest_in_temporary_directory(tmp_path):
    from django.core.management import call_command
    from django.conf import settings
    orig_root = settings.STATIC_ROOT
    orig_storage = settings.STORAGES.copy()
    try:
        settings.STATIC_ROOT = str(tmp_path / 'collected_static')
        settings.STORAGES['staticfiles'] = {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'
        }
        call_command('collectstatic', interactive=False, verbosity=0)
        target = tmp_path / 'collected_static'
        assert (target / 'staticfiles.json').exists()
        assert (target / 'admin').is_dir()
        assert (target / 'rest_framework').is_dir()
        assert any(p.suffix == '.gz' for p in target.rglob('*'))
        assert not (target / 'provider_docs').exists()
        assert not (target / 'organization_docs').exists()
        assert not (target / 'org_credentials').exists()
    finally:
        settings.STATIC_ROOT = orig_root
        settings.STORAGES = orig_storage


DB_SNAPSHOT = """
import hashlib, json, os
from django.conf import settings
db = settings.DATABASES['default']
pwd = db.get('PASSWORD')
print(json.dumps({
    'engine': db.get('ENGINE'),
    'name': db.get('NAME'),
    'user': db.get('USER'),
    'password_hash': hashlib.sha256(pwd.encode('utf-8')).hexdigest() if pwd is not None else None,
    'host': db.get('HOST'),
    'port': db.get('PORT'),
    'options': db.get('OPTIONS', {}),
}))
"""


def startup_db(env):
    script = """
import psycopg2, dotenv
def no_database(*args, **kwargs):
    raise AssertionError('Configuration verification must not connect to PostgreSQL')
psycopg2.connect = no_database
dotenv.load_dotenv = lambda *a, **k: (_ for _ in ()).throw(AssertionError('Production must not load .env'))
import config.wsgi
""" + DB_SNAPSHOT
    return subprocess.run([sys.executable, '-c', script], cwd=BACKEND,
                          env=env, capture_output=True, text=True, timeout=20)


@pytest.mark.parametrize('scheme', ['postgres://', 'postgresql://'])
def test_database_url_parsing_both_schemes(production_environment, scheme):
    import hashlib
    url = f"{scheme}test_user:test_secret_pass_123@db.example.org:5432/queueturn_prod"
    env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env['DATABASE_URL'] = url
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['engine'] == 'django.db.backends.postgresql'
    assert data['user'] == 'test_user'
    assert data['password_hash'] == hashlib.sha256('test_secret_pass_123'.encode('utf-8')).hexdigest()
    assert data['host'] == 'db.example.org'
    assert data['port'] == '5432'
    assert data['name'] == 'queueturn_prod'
    assert data['options'] == {'sslmode': 'require'}


def test_database_url_percent_encoded_credentials_and_name(production_environment):
    import hashlib
    url = "postgresql://user%40example.com:p%23ss%20w%21rd%2599@db.example.org:5433/queue%2Fdb%231"
    env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env['DATABASE_URL'] = url
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['user'] == 'user@example.com'
    assert data['password_hash'] == hashlib.sha256('p#ss w!rd%99'.encode('utf-8')).hexdigest()
    assert data['name'] == 'queue/db#1'
    assert data['port'] == '5433'


def test_database_url_port_default_and_parsing(production_environment):
    url_no_port = "postgresql://usr:secr_pass_abc@db.example.org/my_prod_db"
    env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env['DATABASE_URL'] = url_no_port
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['port'] == '5432'

    env['DATABASE_URL'] = "postgresql://usr:secr_pass_abc@db.example.org:6543/my_prod_db"
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['port'] == '6543'


@pytest.mark.parametrize('valid_host', [
    'localhost',
    'db.example.org',
    'ec2-54-1-2-3.compute-1.amazonaws.com',
    'my_postgres_service',
    '127.0.0.1',
    '[::1]',
    '[2001:db8::1]',
])
def test_database_url_valid_hosts(production_environment, valid_host):
    url = f"postgresql://usr:secr_pass_abc@{valid_host}:5432/my_prod_db"
    env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env['DATABASE_URL'] = url
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    expected_host = valid_host.strip('[]')
    assert json.loads(result.stdout)['host'] == expected_host


def test_database_url_sslmode_default_and_overrides(production_environment):
    base_url = "postgresql://usr:secr_pass_abc@db.example.org:5432/my_prod_db"
    clean_env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}

    # Default for Heroku: sslmode=require
    env = {**clean_env, 'DATABASE_URL': base_url}
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['options'] == {'sslmode': 'require'}

    # Query param in URL: ?sslmode=disable
    env = {**clean_env, 'DATABASE_URL': f"{base_url}?sslmode=disable"}
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['options'] == {'sslmode': 'disable'}

    # Query param in URL: ?sslmode=verify-full
    env = {**clean_env, 'DATABASE_URL': f"{base_url}?sslmode=verify-full"}
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['options'] == {'sslmode': 'verify-full'}

    # Explicit DATABASE_SSLMODE env var overrides URL query parameter
    env = {**clean_env, 'DATABASE_URL': f"{base_url}?sslmode=disable", 'DATABASE_SSLMODE': 'verify-ca'}
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['options'] == {'sslmode': 'verify-ca'}


def test_legacy_individual_variable_fallback_and_sslmode(production_environment):
    import hashlib
    env = production_environment.copy()
    env.pop('DATABASE_URL', None)
    env.pop('DATABASE_SSLMODE', None)
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['name'] == 'configuration_only_never_connect'
    assert data['user'] == 'configuration_only'
    assert data['password_hash'] == hashlib.sha256('configuration-only-nondefault-password'.encode('utf-8')).hexdigest()
    assert data['host'] == '127.0.0.1'
    assert data['port'] == '1'
    assert 'sslmode' not in data['options']

    env['DATABASE_SSLMODE'] = 'require'
    result = startup_db(env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['options'] == {'sslmode': 'require'}


@pytest.mark.parametrize('bad_url,expected_err', [
    ('mysql://user:pass123@host:5432/db', 'postgres:// or postgresql://'),
    ('sqlite:///path/to/db.sqlite3', 'postgres:// or postgresql://'),
    ('postgresql://:pass123@host:5432/db', 'username'),
    ('postgresql://user:@host:5432/db', 'password'),
    ('postgresql://user@host:5432/db', 'password'),
    ('postgresql://user:pass123@/db', 'valid host'),
    ('postgresql://user:pass123@host name/db', 'valid host'),
    ('postgresql://user:pass123@host\tname/db', 'valid host'),
    ('postgresql://user:pass123@.example.com/db', 'valid host'),
    ('postgresql://user:pass123@example..com/db', 'valid host'),
    ('postgresql://user:pass123@-badlabel.com/db', 'valid host'),
    ('postgresql://user:pass123@badlabel-.com/db', 'valid host'),
    ('postgresql://user:pass123@db*host/db', 'valid host'),
    ('postgresql://user:pass123@999.999.999.999:5432/db', 'valid host'),
    ('postgresql://user:pass123@127.0.0.999:5432/db', 'valid host'),
    ('postgresql://user:pass123@256.0.0.1:5432/db', 'valid host'),
    ('postgresql://user:pass123@1.2.3.4.5:5432/db', 'valid host'),
    ('postgresql://user:pass123@[localhost]:5432/db', 'valid host'),
    ('postgresql://user:pass123@[127.0.0.1]:5432/db', 'valid host'),
    ('postgresql://user:pass123@[bad::ipv6:::1]:5432/db', 'valid host'),
    ('postgresql://user:pass123@host[1]:5432/db', 'valid host'),
    ('postgresql://user:pass123@[::1]trailing:5432/db', 'valid host'),
    ('postgresql://user:pass123@host:5432', 'database name'),
    ('postgresql://user:pass123@host:5432/', 'database name'),
    ('postgresql://user:pass123@host:70000/db', 'DATABASE_URL port'),
    ('postgresql://user:pass123@host:0/db', 'DATABASE_URL port'),
    ('postgresql://user:pass123@host:invalid_port/db', 'DATABASE_URL port'),
    ('postgresql://user:password@host:5432/db', 'DATABASE_PASSWORD'),
    ('postgresql://user:placeholder@host:5432/db', 'DATABASE_PASSWORD'),
    ('postgresql://user:pass123@host:5432/db?sslmode=', 'sslmode parameter must not be empty'),
    ('postgresql://user:pass123@host:5432/db?sslmode=require&sslmode=disable', 'duplicate sslmode query parameters'),
    ('postgresql://user:pass123@host:5432/db?sslmode=bogus', 'DATABASE_URL sslmode must be a valid PostgreSQL SSL mode'),
    ('postgresql://user:pass123@host:5432/db?sslmode=invalid', 'DATABASE_URL sslmode must be a valid PostgreSQL SSL mode'),
])
def test_malformed_database_url_rejected_safely(production_environment, bad_url, expected_err):
    env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env['DATABASE_URL'] = bad_url
    result = startup_db(env)
    assert result.returncode != 0
    assert expected_err in result.stderr
    assert 'django.db.utils.OperationalError' not in result.stderr


def test_invalid_database_sslmode_env_rejected(production_environment):
    base_url = "postgresql://usr:secr_pass_abc@db.example.org:5432/my_prod_db"
    clean_env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env = {**clean_env, 'DATABASE_URL': base_url, 'DATABASE_SSLMODE': 'bogus_ssl'}
    result = startup_db(env)
    assert result.returncode != 0
    assert 'DATABASE_SSLMODE must be a valid PostgreSQL SSL mode' in result.stderr

    # Test legacy individual variables with invalid DATABASE_SSLMODE
    legacy_env = production_environment.copy()
    legacy_env.pop('DATABASE_URL', None)
    legacy_env['DATABASE_SSLMODE'] = 'invalid_legacy_ssl'
    result = startup_db(legacy_env)
    assert result.returncode != 0
    assert 'DATABASE_SSLMODE must be a valid PostgreSQL SSL mode' in result.stderr


def test_database_url_sslmode_empty_and_duplicate_rejected(production_environment):
    base_url = "postgresql://usr:secr_pass_abc@db.example.org:5432/my_prod_db"
    clean_env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}

    # Empty sslmode in query parameter
    env_empty = {**clean_env, 'DATABASE_URL': f"{base_url}?sslmode="}
    res = startup_db(env_empty)
    assert res.returncode != 0
    assert 'DATABASE_URL sslmode parameter must not be empty' in res.stderr

    # Duplicate sslmode query parameters
    env_dup = {**clean_env, 'DATABASE_URL': f"{base_url}?sslmode=require&sslmode=disable"}
    res = startup_db(env_dup)
    assert res.returncode != 0
    assert 'DATABASE_URL must not contain duplicate sslmode query parameters' in res.stderr


def test_database_credentials_not_disclosed_in_errors(production_environment):
    secret_pass = 'super_secret_unique_pwd_xyz987'
    secret_user = 'secret_unique_usr_abc123'
    env = {k: v for k, v in production_environment.items() if not k.startswith('DATABASE_')}
    env['DATABASE_URL'] = f"postgresql://{secret_user}:{secret_pass}@host.example.org:99999/testdb"
    result = startup_db(env)
    assert result.returncode != 0
    assert 'DATABASE_URL port' in result.stderr
    assert secret_pass not in result.stderr
    assert secret_user not in result.stderr
    assert secret_pass not in result.stdout
    assert secret_user not in result.stdout

    env['DATABASE_URL'] = f"postgresql://{secret_user}:{secret_pass}@/testdb"
    result = startup_db(env)
    assert result.returncode != 0
    assert secret_pass not in result.stderr
    assert secret_user not in result.stderr
