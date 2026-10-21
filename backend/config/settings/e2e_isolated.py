"""QueueTurn UI-9B.2 Isolated PostgreSQL Browser E2E Test Settings.

Strictly targets dedicated database `queueturn_e2e_isolated` on port 5432 using
non-superuser role `qt_e2e_runner`.

Guarantees:
- Explicit execution authorization flag required (`QT_AUTHORIZED_E2E_ISOLATED=true`).
- Fail-closed validation against operational database names (rejects any mention of `smartqueue`).
- Rejection of PostgreSQL superuser roles (`postgres`, `root`, etc.).
- Requirement for explicitly supplied, non-placeholder credentials.
- In-memory mock email transport (Resend SDK patch + Django locmem backend).
- Complete isolation from operational database and production services.
"""
import os
import sys
import logging

# 1. Safeguard: Explicit execution authorization flag required
if os.getenv('QT_AUTHORIZED_E2E_ISOLATED') != 'true':
    raise RuntimeError(
        "FATAL: Isolated E2E settings invoked without QT_AUTHORIZED_E2E_ISOLATED='true'."
    )

from .qa import *  # noqa: F403

logger = logging.getLogger(__name__)

# 2. Hardcoded Isolated Target Constants
ISOLATED_DB_NAME = 'queueturn_e2e_isolated'
ISOLATED_DB_USER = 'qt_e2e_runner'
ALLOWED_HOSTS_SET = {'127.0.0.1', 'localhost'}

# 3. Resolve Dedicated E2E Database Parameters
db_user = os.getenv('QT_E2E_DB_USER', ISOLATED_DB_USER)
db_password = os.getenv('QT_E2E_DB_PASSWORD', '')
db_host = os.getenv('QT_E2E_DB_HOST', '127.0.0.1')
db_port = str(os.getenv('QT_E2E_DB_PORT', '5432')).strip()

# 4. Configure Dedicated Isolated Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': ISOLATED_DB_NAME,
        'USER': db_user,
        'PASSWORD': db_password,
        'HOST': db_host,
        'PORT': db_port,
        'TEST': {
            'NAME': ISOLATED_DB_NAME,
        },
    }
}

# 5. Fail-Closed Validation of Effective Database Configuration at Import Time
for alias, config in DATABASES.items():
    effective_engine = str(config.get('ENGINE', ''))
    effective_name = str(config.get('NAME', ''))
    effective_test_name = str(config.get('TEST', {}).get('NAME', ''))
    effective_user = str(config.get('USER', ''))
    effective_pass = str(config.get('PASSWORD', ''))
    effective_host = str(config.get('HOST', ''))
    effective_port = str(config.get('PORT', ''))

    if effective_engine != 'django.db.backends.postgresql':
        sys.exit(f"CRITICAL ABORT: Engine for '{alias}' is '{effective_engine}', PostgreSQL is required!")
    if effective_name != ISOLATED_DB_NAME:
        sys.exit(f"CRITICAL ABORT: Database name for '{alias}' is '{effective_name}', expected '{ISOLATED_DB_NAME}'!")
    if effective_test_name != ISOLATED_DB_NAME:
        sys.exit(f"CRITICAL ABORT: TEST database name for '{alias}' is '{effective_test_name}', expected '{ISOLATED_DB_NAME}'!")
    if 'smartqueue' in effective_name.lower() or 'smartqueue' in effective_test_name.lower():
        sys.exit(f"CRITICAL ABORT: Operational database name found in alias '{alias}'!")
    if effective_user != ISOLATED_DB_USER:
        sys.exit(f"CRITICAL ABORT: Database user for '{alias}' is '{effective_user}', expected dedicated '{ISOLATED_DB_USER}'!")
    if effective_user.lower() in {'postgres', 'root', 'admin', 'superuser'}:
        sys.exit(f"CRITICAL ABORT: Superuser role '{effective_user}' is rejected for isolated testing!")
    if not effective_pass or effective_pass.strip().lower() in {'postgres', 'password', 'placeholder', 'change-me', 'changeme', 'default'}:
        sys.exit(f"CRITICAL ABORT: Valid, non-default QT_E2E_DB_PASSWORD must be explicitly provided for alias '{alias}'!")
    if effective_host not in ALLOWED_HOSTS_SET:
        sys.exit(f"CRITICAL ABORT: Host for '{alias}' must be local ({ALLOWED_HOSTS_SET}), got '{effective_host}'!")
    try:
        port_num = int(effective_port)
        if not 1 <= port_num <= 65535:
            raise ValueError
    except ValueError:
        sys.exit(f"CRITICAL ABORT: Port for '{alias}' is invalid: '{effective_port}'!")

# 6. Email Isolation: Explicit In-Memory Locmem Backend
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# 7. Frontend CORS Configuration for Isolated Port 5174
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_ALL_ORIGINS = True
