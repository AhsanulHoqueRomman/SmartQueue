"""
QueueTurn Milestone BE-SAFETY-1B Isolated PostgreSQL Test Settings.
Strictly hardcoded to dedicated ephemeral cluster on 127.0.0.1:5433.
Validates the effective final isolated configuration at import time.
"""
import os
import sys

# Safeguard 1: Explicit execution authorization flag required
if os.getenv('QT_AUTHORIZED_PG_TEST') != 'true':
    raise RuntimeError("FATAL: Isolated PostgreSQL test settings invoked without QT_AUTHORIZED_PG_TEST='true'.")

from .development import *  # noqa: F403

# Safeguard 2: Hardcode exact ephemeral database parameters
ISOLATED_HOST = '127.0.0.1'
ISOLATED_PORT = '5433'
ISOLATED_DB_NAME = 'qt_test_besafety1b_concurrency'
ISOLATED_USER = 'qt_test_user'

# Safeguard 3: Configure DATABASES explicitly to ephemeral cluster
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': ISOLATED_DB_NAME,
        'USER': os.getenv('QT_TEST_DB_USER', ISOLATED_USER),
        'PASSWORD': os.getenv('QT_TEST_DB_PASSWORD', ''),
        'HOST': ISOLATED_HOST,
        'PORT': ISOLATED_PORT,
        'TEST': {
            'NAME': ISOLATED_DB_NAME,
        },
    }
}

# Safeguard 4: Validate effective final configuration (fail-closed if any deviation)
for alias, config in DATABASES.items():
    effective_host = str(config.get('HOST'))
    effective_port = str(config.get('PORT'))
    effective_name = str(config.get('NAME'))
    effective_test_name = str(config.get('TEST', {}).get('NAME'))
    effective_user = str(config.get('USER'))

    if effective_host != '127.0.0.1':
        sys.exit(f"CRITICAL ABORT: Host for '{alias}' is '{effective_host}', expected 127.0.0.1!")
    if effective_port != '5433':
        sys.exit(f"CRITICAL ABORT: Port for '{alias}' is '{effective_port}', expected 5433!")
    if effective_name != ISOLATED_DB_NAME:
        sys.exit(f"CRITICAL ABORT: DB name for '{alias}' is '{effective_name}', expected {ISOLATED_DB_NAME}!")
    if effective_test_name != ISOLATED_DB_NAME:
        sys.exit(f"CRITICAL ABORT: TEST.NAME for '{alias}' is '{effective_test_name}', expected {ISOLATED_DB_NAME}!")
    if effective_user != ISOLATED_USER:
        sys.exit(f"CRITICAL ABORT: User for '{alias}' is '{effective_user}', expected {ISOLATED_USER}!")
    if 'smartqueue' in effective_name.lower() or 'smartqueue' in effective_test_name.lower():
        sys.exit(f"CRITICAL ABORT: Operational database name found in alias '{alias}'!")
