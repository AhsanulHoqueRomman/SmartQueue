# QueueTurn — Development and Testing Guide

This guide describes local development, architectural conventions, and testing practices for QueueTurn.

---

## 1. Environment Setup

### Prerequisites
- **Python:** 3.12+ (tested up to 3.14)
- **Node.js:** 18+ (tested with Node 20/22) & npm
- **Database:** PostgreSQL 16+ (development can fallback to SQLite via `USE_SQLITE=true`)
- **Authoritative Business Timezone:** `Asia/Dhaka` (`UTC+06:00`)

### Backend Setup
```bash
# Navigate to backend
cd backend

# Create & activate virtual environment
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install backend dependencies (uses repository root requirements.txt)
python -m pip install -r requirements.txt

# Configure environment variables
# Copy .env.example to .env and configure local values
copy .env.example .env

# Run database migrations
python manage.py migrate

# Seed deterministic multi-industry demo data
python manage.py seed_demo_data

# Start development server on http://127.0.0.1:8000
python manage.py runserver
```

### Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install npm dependencies
npm install

# Start Vite development server on http://localhost:5173
npm run dev

# Run code linter
npm run lint

# Build production bundle
npm run build
```

---

## 2. Architecture & Code Conventions for Developers

QueueTurn is engineered to be clean, readable, and maintainable by any developer familiar with standard Django and React patterns.

### Backend Design Patterns
1. **Models (`models.py`):**
   - Define database schema, relationships, indexes, and declarative database constraints (e.g., `unique_provider_date_serial`).
   - Keep business logic that spans multiple models out of `models.py`.
2. **Serializers (`serializers.py`):**
   - Handle input validation, representation formatting, and nested data parsing.
   - Do not perform row locking or heavy cross-entity transactions in serializers.
3. **Domain Services (`services.py`):**
   - Contain transactional business workflows (e.g., `AppointmentService.create_booking`, `QueueService.call_next`).
   - Coordinate row locking (`select_for_update()`) and ensure atomic transitions inside `transaction.atomic()`.
   - Maintain the invariant that `ProviderDateSerial` is incremented monotonically and never reused.
4. **Views & APIs (`views.py`):**
   - Standard Django REST Framework `APIView`, generic views, and ViewSets.
   - Authorize requests via explicit permission classes (`permissions.py`).
   - Translate service exceptions (`ApplicationError`) into standard HTTP error responses.
5. **Anti-Fragmentation Rule:**
   - Avoid creating micro-helper files for single 10-line functions. Consolidate domain logic into the standard `models.py`, `serializers.py`, `services.py`, and `views.py` of each respective app.

### Frontend Design Patterns
1. **Route Hierarchy (`routes/AppRoutes.jsx`):**
   - Protected routes wrapped with `ProtectedRoute` and `RoleRoute`.
   - `AppShell` handles responsive navigation and tenant selection.
2. **State & Telemetry:**
   - Global auth via `AuthContext`, active organization scoping via `TenantContext`.
   - Live telemetry uses structured HTTP polling loops (`10s` for customer live queue, `20s` for notifications); avoid unnecessary polling on unmounted views.
3. **Design System & Styling:**
   - Pure Vanilla CSS with design tokens defined in `frontend/src/styles/index.css`.
   - Support for Warm Sand/Espresso (`:root`) and Navy/Teal (`:root[data-theme="dark"]`).
   - Use CSS variables (`var(--color-primary)`, `var(--color-surface)`, `var(--color-text-main)`) rather than hardcoded hex colors or `@media (prefers-color-scheme: dark)` overrides.

---

## 3. Testing Principles & Execution

QueueTurn maintains lean, high-signal automated tests. Tests must verify business invariants and security boundaries without redundant test suites.

### Test Categories
1. **Configuration & Startup Tests (`tests/test_deployment_configuration.py`):**
   - Non-database tests verifying settings, environment isolation, WSGI/ASGI entrypoints, security headers, and cookie flags.
   - Executable without any database server:
     ```bash
     cd backend
     pytest tests/test_deployment_configuration.py
     ```
2. **App-Local Domain Tests (`apps/<app>/tests/`):**
   - Fast, focused unit and API tests for accounts, organizations, services, providers, appointments, and contact:
     ```bash
     cd backend
     pytest apps/accounts/
     pytest apps/appointments/
     pytest apps/organizations/
     ```
3. **State Machine & Lifecycle Tests (`tests/test_m2_lifecycle.py`):**
   - Verifies the queue state machine, presence gating, monotonicity of serial numbers, and midnight rollover.
4. **PostgreSQL Concurrency & Locking Tests (`test_provider_concurrency_postgresql.py`):**
   - Explicitly tests row locks (`select_for_update`) under real PostgreSQL multi-threading to ensure atomic serial allocation under high concurrent load.
   - **SAFETY RULE:** Must run ONLY in an isolated test database (e.g., `queueturn_e2e_isolated` via `config.settings.test_postgresql_isolated`). NEVER run concurrency tests against the operational `smartqueue_db`.

### Critical Testing Rules
- **No Operational DB Mutations:** Automated tests must never write to, truncate, or migrate the production/operational `smartqueue_db`.
- **No Migrations in Fast Unit Tests:** Fast unit tests use `--nomigrations` on SQLite in-memory databases (defaulted in `pytest.ini`).
- **Meaningful Coverage:** Preserve tests that assert permissions, tenant boundaries, atomic serial allocations, and transition guards. Eliminate duplicate milestone-specific test suites that merely re-assert the same behavior with different test fixtures.

---

## 4. Protected Compatibility Identifiers

Do not rename the following identifiers during cleanup or refactoring:
- `smartqueue_db`: Default database name contract.
- `smartqueue_theme`: Stored UI theme preference.
- `SMARTQUEUE_SUPPORT_EMAIL`: Support recipient configuration key.
- `smartqueue_verified`, `isSmartQueueVerified`: Verification attributes and helper functions.
- `sq_access_token`, `sq_refresh_token`: LocalStorage authentication keys.
- `sq_selected_org_id`: Selected tenant storage key.
- `sq_recently_viewed_orgs`, `sq_favorite_orgs`, `sq_pending_booking`: Client storage keys.
- `sq:auth:unauthorized`: Client context unauthorized event.
- `sq-*`: CSS component class prefix compatibility.
