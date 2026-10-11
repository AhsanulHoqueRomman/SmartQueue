# Backend dependency and production configuration contract

Batch A Part 2 is configuration verification, not a deployment certification.
No hosting/storage provider has been selected. F-024's production storage and
external file-serving release gates remain pending.

## Dependencies and local development

The repository-root `requirements.txt` is the single pinned backend dependency
source. `backend/requirements.txt` contains only a relative include. Existing
versions are retained, including Resend 2.47.0 and pytest 8.4.2; Pillow 12.3.0 is
declared because both ImageFields and private-document validation require it.
The root file is UTF-8 so pip and review tooling can read it consistently.

From the repository root, inside an activated Python virtual environment:

```powershell
python -m pip install -r requirements.txt
Set-Location backend
python manage.py check --settings=config.settings.development
python manage.py runserver --settings=config.settings.development
```

Installing `-r requirements.txt` from `backend/` resolves the same root pins.
`manage.py` still defaults to development; pytest.ini still selects development
and isolated SQLite tests. Explicit PostgreSQL tests retain
`config.settings.test_postgresql` and its separate test database. Neither
workflow applies migrations or writes to production by default.

Local development loads `backend/.env` without overwriting process variables.
Copy `.env.example` for local setup only. Production does **not** automatically
load that file: supply variables through the eventual deployment environment.
Do not copy the development database password or example secret to production.

## Server entrypoints and administrative commands

`config.wsgi:application` and `config.asgi:application` default to
`config.settings.production`. An explicitly selected development/test module
is honored for intentional local use. Missing/unsafe production configuration
raises a configuration error; it never retries with development settings.
The existing Procfile explicitly selects production for Gunicorn.

For production administration in PowerShell, after supplying reviewed values:

```powershell
$env:DJANGO_SETTINGS_MODULE = 'config.settings.production'
Set-Location backend
python manage.py check --settings=config.settings.production
python manage.py check --deploy --settings=config.settings.production
```

On an eventual Gunicorn-supported host, run from `backend/`:

```sh
DJANGO_SETTINGS_MODULE=config.settings.production gunicorn config.wsgi:application
```

Gunicorn is not a Windows production runner. No new ASGI server dependency or
hosting platform is selected here; any future ASGI runner uses
`config.asgi:application` and explicit production settings. Do not start a
production server with `config.settings.development`.

## Required production variables

| Variable | Contract |
|---|---|
| `SECRET_KEY` | Explicit, at least 50 characters, sufficiently varied, not a known insecure/example placeholder; generate and protect a random secret |
| `ALLOWED_HOSTS` | Explicit comma-separated hostnames; no `*`, URLs or host:port values |
| `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_HOST` | Explicit PostgreSQL connection values; no empty values or known development password |
| `DATABASE_PORT` | Optional, defaults to 5432; integer 1–65535 |
| `DATABASE_ENGINE` | Optional, PostgreSQL only; production rejects SQLite even under pytest/test detection |
| `PRIVATE_DOCUMENT_ROOT` | Built-in F-024 storage: absolute persistent private root separate from media, static and frontend roots |
| `PRIVATE_DOCUMENT_STORAGE_BACKEND`, `PRIVATE_DOCUMENT_STORAGE_OPTIONS` | Alternative to the built-in root: a reviewed private Django backend plus its JSON options; no storage vendor chosen |
| `PRIVATE_DOCUMENT_STORAGE_PERSISTENT` | Must be `true` with explicitly configured private storage; operator acknowledgement does not prove persistence or serving privacy |

`DEBUG` is forced false and session/CSRF cookies remain secure. Public media and
static roots remain separate. Sensitive documents never use public storage or
permanent media URLs. F-024 permissions/download/business rules are unchanged.

## HTTPS, browser origins and proxy configuration

- `SECURE_SSL_REDIRECT` defaults true. A deliberate false override requires
  verified equivalent HTTPS enforcement by the external serving layer.
- `TRUST_X_FORWARDED_PROTO` defaults false. Enable only after verifying the
  trusted proxy strips client-supplied forwarding headers and sets
  `X-Forwarded-Proto` itself. Direct TLS requires no forwarded-header trust.
- Production CORS defaults deny-all, not the local Vite origins. Configure
  `CORS_ALLOWED_ORIGINS` with exact HTTPS origins when the frontend is on another
  origin. `CORS_ALLOW_ALL_ORIGINS=true` is rejected.
- `CSRF_TRUSTED_ORIGINS` is optional and empty by default; configure HTTPS
  origins for actual cross-origin unsafe requests. Explicit Django-supported
  `https://*.owned-domain` CSRF entries remain possible after scope review.
- HSTS defaults to zero seconds with subdomain/preload flags false. After HTTPS
  verification, deliberately configure `SECURE_HSTS_SECONDS`,
  `SECURE_HSTS_INCLUDE_SUBDOMAINS`, and `SECURE_HSTS_PRELOAD`. Preload requires at
  least one year and subdomains; do not enable until every affected host is safe.
  `check --deploy` can warn about intentionally deferred HSTS configuration.

No proxy topology, TLS termination, database TLS requirements, or public-domain
ownership is guessed by application defaults. Review them at deployment time.

## Optional Resend configuration

Email is not mandatory to start the backend. Leave both `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` empty/unset to retain the existing skipped-send result.
If either is configured, both are required and must not be example values.
Production rejects the `onboarding@resend.dev` testing sender and example domains.
`FRONTEND_URL` must then be an explicit HTTPS origin so reset emails cannot link
to localhost. `RESEND_FROM_NAME` remains optional. `SMARTQUEUE_SUPPORT_EMAIL`
remains optional for startup, but is required for contact admin notifications;
if supplied alongside enabled email it must be a valid non-example address.

A validated address/key is not proof of a verified sender, working account,
recipient authorization or delivery. Verify those later with owner-approved
delivery checks. No live email is sent by startup/configuration tests. F-021
send-state/acknowledgement behavior is explicitly unchanged.

## Remaining release verification

Before deployment: verify installed pins on the selected runtime; database
connectivity, least-privilege credentials and transport security; backups;
TLS/proxy header handling; browser origins; static collection/serving; persistent
public uploads where required; and F-024 private-storage persistence/ACLs.
Externally deny `/media/provider_docs/`, `/media/organization_docs/` and
`/media/org_credentials/`, including aliases and retained legacy copies. Never
map the private root into a public web/CDN route. Re-run authorized/unauthorized
downloads through the real serving layer. Existing-data copying/deletion requires
separate owner approval. Browser acceptance and M2 live ETA recovery remain
explicit follow-ups, not evidence supplied by these configuration tests.
