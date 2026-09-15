# SMARTQUEUE PROJECT PLAN

> **Purpose:** Single source of truth for AI agents and developers continuing the SmartQueue project.
> Read this file before changing code. Preserve completed architecture unless a real bug requires a targeted fix.

---

## 1. Project

**SmartQueue — Appointment & Queue Management Platform**

A multi-tenant appointment and queue management platform for clinics, salons, consulting offices, repair/service centers, and similar businesses.

### Core flow

Customer registers → selects organization → service → provider → available slot → books appointment → checks in → receives queue token → provider manages queue → service completed → customer reviews.

---

## 2. Current Stack

### Backend
- Python 3.12+
- Django **6.1.1**
- Django REST Framework **3.18.1**
- PostgreSQL 16+
- SimpleJWT **5.5.1**
- django-filter **26.1**
- drf-spectacular **0.30.0**
- pytest **9.1.1**
- pytest-django **4.14.0**
- Gunicorn **26.2.0**
- python-dotenv **1.2.3**
- django-cors-headers **4.9.0**
- psycopg2-binary **2.9.13**

### Frontend
- React 18+
- Vite
- React Router v6
- Axios
- Vanilla CSS / CSS variables
- React Context
- Local component state

Do **not** introduce Redux unless there is a strong project-level reason.

---

## 3. Architecture

### Django apps

```text
apps/
├── accounts/
├── organizations/
├── services/
├── providers/
├── appointments/
├── queue/
├── feedback/
├── notifications/
├── analytics/
└── audit/
```

### Roles

**Global**
- Customer = authenticated User, no organization membership required
- Admin = `is_staff` / `is_superuser`, system-wide

**Organization membership**
- PROVIDER
- STAFF
- MANAGER

ProviderProfile belongs to a PROVIDER membership.

Customer access to an organization does NOT require membership.

---

## 4. Non-Negotiable Business Rules

1. Tenant isolation must always be explicit.
2. Never trust arbitrary organization/provider/service IDs from the frontend.
3. Provider, service, appointment, and membership relationships must belong to the same organization where applicable.
4. Invalid state transitions must be rejected.
5. Only active providers/services should be bookable.
6. Only assigned providers can manage their own appointments/queue.
7. Manager/Staff access is organization-scoped.
8. Admin can operate system-wide.
9. Customers can only see/manage their own appointment and queue records.
10. Cross-organization access should normally return **404**, not leak resource existence.
11. Server controls customer, organization, appointment status, end time, queue date, and token number.
12. Never expose or accept client-controlled fields that can bypass business rules.

---

# 5. Completed Milestones

## M1 — Foundation & Authentication ✅

Implemented:
- Split settings: base/development/production
- `.env` support
- PostgreSQL configuration
- Custom email-based User
- UserManager
- Django admin
- JWT authentication
- JWT refresh/logout/blacklist
- `/auth/me/`
- Change password
- CORS
- drf-spectacular
- OpenAPI / Swagger / ReDoc

Important endpoints:

```text
POST /api/v1/auth/register/
POST /api/v1/auth/login/
POST /api/v1/auth/token/refresh/
POST /api/v1/auth/logout/
GET|PATCH /api/v1/auth/me/
POST /api/v1/auth/change-password/
```

---

## M2 — Organizations & Roles ✅

Implemented:
- Organization
- OrganizationMembership
- Organization bootstrap
- Creator becomes MANAGER
- Organization discovery
- Member management
- Manager protection
- Organization-scoped permissions
- Tenant isolation

Important rule:
- A user may bootstrap an organization.
- The creator becomes its active MANAGER.
- Last active manager cannot be removed/demoted without another active manager.

---

## M3 — Services & Providers ✅

Implemented:
- Service catalog
- ProviderProfile
- ProviderService
- WeeklySchedule
- ScheduleBreak
- ProviderLeave
- Organization consistency validation
- Provider self-management
- Manager organization-level management
- Staff/customer read-only discovery where appropriate

Important Django 6.1 rule:

```python
models.CheckConstraint(
    condition=models.Q(...),
    name="..."
)
```

Use **`condition=`**, not the old `check=` keyword.

---

## M4 — Availability & Appointment Booking ✅

Implemented:
- Appointment model
- Dynamic availability
- 15-minute slot grid
- Provider schedule
- Breaks
- Leave
- Existing appointment conflicts
- Effective service duration
- Booking
- Rescheduling
- Cancellation
- Check-in endpoint
- Appointment state machine
- Tenant isolation
- Concurrency-safe booking

### Appointment states

```text
PENDING
CONFIRMED
CHECKED_IN
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
```

### Important transitions

```text
PENDING → CONFIRMED
PENDING → CANCELLED

CONFIRMED → CHECKED_IN
CONFIRMED → CANCELLED

CHECKED_IN → IN_PROGRESS
IN_PROGRESS → COMPLETED
```

Terminal:
- COMPLETED
- CANCELLED
- NO_SHOW

### Double-booking protection

Use:

```text
transaction.atomic()
+
ProviderProfile.select_for_update()
+
final overlap check
+
create/update appointment
```

Overlap condition:

```text
slot_start < existing_end
AND
slot_end > existing_start
```

Blocking statuses:

```text
PENDING
CONFIRMED
CHECKED_IN
IN_PROGRESS
```

Conflict response should be HTTP 409:

```json
{
  "error": {
    "code": "DOUBLE_BOOKING_CONFLICT",
    "message": "The selected time slot is no longer available.",
    "details": {}
  }
}
```

### Existing M4 limitation to remember

Project currently uses:

```text
TIME_ZONE = UTC
```

Do not silently change timezone architecture.

---

# 6. CURRENT STATUS — M6 Feedback, Notifications & Audit

M1 through M5 are complete. M6 is complete with core reviews, synchronous database notifications, and explicit audit logging.

If M5 code exists, **inspect and audit it before modifying it**.

Do not assume an AI-generated M5 implementation is correct merely because tests pass.

---

# 7. M5 — Queue Management

## QueueEntry

Expected concepts:

```text
id
organization
appointment
provider
queue_date
token_number
status
created_at
updated_at
called_at
started_at
completed_at
skipped_at
```

Optional cancellation timestamp/status only if cleanly integrated.

### Required relationships

- One appointment → at most one QueueEntry
- Provider and appointment must match
- Organization must match
- Queue date must be server-derived
- Token number must be server-generated

---

## Queue states

Required:

```text
WAITING
CALLED
IN_PROGRESS
COMPLETED
SKIPPED
```

Optional:

```text
CANCELLED
```

### Allowed transitions

```text
WAITING → CALLED
CALLED → IN_PROGRESS
CALLED → SKIPPED
IN_PROGRESS → COMPLETED
```

Optional:

```text
WAITING → CANCELLED
```

Do NOT allow:

```text
WAITING → IN_PROGRESS
WAITING → COMPLETED
WAITING → SKIPPED
CALLED → COMPLETED
COMPLETED → anything
SKIPPED → anything
```

---

## Queue token rules

Token sequence is per:

```text
(provider, queue_date)
```

Example:

```text
Provider A / Day 1 → 1, 2, 3...
Provider A / Day 2 → 1, 2, 3...
Provider B / Day 1 → 1, 2, 3...
```

Tokens are never reused.

Required DB uniqueness:

```text
(provider, queue_date, token_number)
```

Appointment → QueueEntry should also be unique.

### Concurrency

Token generation must be protected with:

```python
transaction.atomic()
ProviderProfile.objects.select_for_update()
```

Then:

```text
validate appointment
→ ensure no QueueEntry
→ calculate next token
→ create QueueEntry
→ update appointment
```

Never use a Python/global counter.

Never calculate MAX outside the protected transaction.

---

# 8. Appointment Check-In ↔ Queue Integration

Check-in must be atomic.

Desired flow:

```text
lock appointment/provider
→ validate appointment
→ verify CONFIRMED
→ verify provider/service/org
→ ensure QueueEntry does not already exist
→ derive queue_date
→ generate token
→ create WAITING QueueEntry
→ change Appointment to CHECKED_IN
→ commit
```

There must not normally be a committed state where an appointment is `CHECKED_IN` but has no QueueEntry.

Duplicate queue creation:

```text
HTTP 409
QUEUE_ENTRY_ALREADY_EXISTS
```

Invalid check-in:

```text
HTTP 400
INVALID_CHECK_IN
```

Do not allow check-in for:
- CANCELLED
- COMPLETED
- NO_SHOW
- already CHECKED_IN
- IN_PROGRESS

---

# 9. Queue Date

Queue date must be server-derived.

Do not trust:

```text
queue_date
```

from the client.

Use timezone-aware logic consistent with the existing project.

Do not silently change the project's UTC timezone.

---

# 10. Queue Operations

## Queue list

Recommended:

```text
GET /api/v1/organizations/{organization_id}/providers/{provider_id}/queue/?date=YYYY-MM-DD
```

If date is omitted, use current business date.

Order:

```text
token_number ASC
```

Response should provide enough information for queue UI:

```text
token
status
customer
service
appointment start/end
queue date
provider
```

---

## Customer queue

Recommended:

```text
GET /api/v1/organizations/{organization_id}/queue/my/
```

Customer sees only their own queue entries.

Never accept arbitrary `customer_id` to determine visibility.

---

# 11. call_next()

`call_next()` must:

```text
WAITING → CALLED
```

only.

It finds the lowest-token WAITING customer.

It sets:

```text
called_at
```

It must NOT:
- auto-complete anyone
- auto-skip anyone
- auto-start anyone
- modify another waiting customer
- create a token

### Single active customer rule

Per provider/date, there can be at most one:

```text
CALLED
OR
IN_PROGRESS
```

If one exists, return HTTP 409:

```json
{
  "error": {
    "code": "ACTIVE_QUEUE_CUSTOMER_EXISTS",
    "message": "A customer is already active in the queue.",
    "details": {}
  }
}
```

Use transaction + provider row lock.

If there is no WAITING customer:

```text
NO_WAITING_CUSTOMER
```

---

# 12. Start Queue Entry

Recommended:

```text
POST /api/v1/organizations/{organization_id}/queue/{queue_entry_id}/start/
```

Transition:

```text
CALLED → IN_PROGRESS
```

Set:

```text
started_at
```

Synchronize linked appointment:

```text
CHECKED_IN → IN_PROGRESS
```

Reject invalid queue states.

---

# 13. Complete Queue Entry

Recommended:

```text
POST /api/v1/organizations/{organization_id}/queue/{queue_entry_id}/complete/
```

Transition:

```text
IN_PROGRESS → COMPLETED
```

Set:

```text
completed_at
```

Synchronize appointment:

```text
IN_PROGRESS → COMPLETED
```

This must be atomic.

Do NOT allow:

```text
WAITING → COMPLETED
CALLED → COMPLETED
```

---

# 14. Skip Queue Entry

Recommended:

```text
POST /api/v1/organizations/{organization_id}/queue/{queue_entry_id}/skip/
```

Transition:

```text
CALLED → SKIPPED
```

Set:

```text
skipped_at
```

Do NOT:
- mark appointment completed
- automatically call the next customer
- allow WAITING → SKIPPED unless there is a strong documented reason

---

# 15. Queue Permissions

### Customer
Can:
- check in own eligible appointment
- view own queue entry

Cannot:
- call
- start
- complete
- skip

### Provider
Can:
- view own queue
- check in assigned appointments
- call next
- start
- complete
- skip

### Staff
Can manage queue inside own organization.

### Manager
Can manage queue inside own organization.

### Admin
Can manage system-wide.

### Non-member
Cannot access organization appointment/queue records.

---

# 16. M5 Error Codes

Use existing project exception handling.

Important codes:

```text
QUEUE_ENTRY_ALREADY_EXISTS
INVALID_QUEUE_STATE
ACTIVE_QUEUE_CUSTOMER_EXISTS
NO_WAITING_CUSTOMER
QUEUE_PROVIDER_MISMATCH
QUEUE_ORGANIZATION_MISMATCH
INVALID_CHECK_IN
INVALID_QUEUE_DATE
```

Do not expose raw database `IntegrityError` to API clients.

---

# 17. M5 Service Layer

Business logic belongs in:

```text
apps/queue/services.py
```

Recommended services:

```text
check_in_appointment()
get_or_create_queue_entry()
call_next()
start_queue_entry()
complete_queue_entry()
skip_queue_entry()
```

Views should remain thin.

Do not duplicate queue state/business logic across views and services.

---

# 18. M5 Testing

Must cover at minimum:

### Model
- relationships
- valid creation
- status
- unique appointment
- unique provider/date/token
- invalid data
- DB constraints

### Check-in
- confirmed appointment works
- QueueEntry created
- token = 1
- queue = WAITING
- appointment = CHECKED_IN
- duplicate rejected
- cancelled rejected
- completed rejected
- no-show rejected
- already checked-in rejected
- cross-org rejected
- unauthorized rejected

### Token
- first token = 1
- second = 2
- next day = 1
- different provider same day = 1
- token never reused
- duplicates prevented

### Queue list
- token order
- date filtering
- provider isolation
- organization isolation
- customer only sees own

### call_next
- lowest WAITING is called
- status becomes CALLED
- called_at set
- active customer blocks
- no auto-start
- no auto-complete
- no auto-skip

### Start/Complete/Skip
- valid transitions
- invalid transitions
- timestamps
- appointment synchronization
- permissions
- atomic behavior

### Concurrency
Production locking must be correct.

True parallel tests are desirable, but if test infrastructure cannot reliably perform them, do not weaken production locking merely to make tests pass. Document the limitation.

---

# 20. Remaining Work — COMPACT ROADMAP

After M5, complete the project in these phases.

## Phase A — Backend Completion

### M6 — Feedback + Notifications + Audit ✅

Implement only core versions.

#### Reviews
- Only completed appointments can be reviewed.
- One review per appointment.
- Customer can create/view own review.
- Provider/manager can view appropriate reviews.
- Tenant isolation.

#### Notifications
Use synchronous/in-database notifications only.

Examples:
- appointment booked
- appointment cancelled
- appointment checked in
- queue called
- service completed

Do NOT add Celery, Redis, WebSockets, SMS, or email workers.

#### Audit
Implement explicit `AuditLog` + service.

Audit important actions:
- appointment changes
- queue state changes
- member/role changes
- important organization changes

Do not build a huge event system.

---

## M7 — Manager Tools + API Polish ✅

Implement:

### Analytics
Simple read-only aggregates:
- total appointments
- completed
- cancelled
- no-show
- queue counts
- provider/service summaries

Avoid advanced BI/revenue analytics.

### Filtering
Use django-filter where useful.

### Search
Use DRF SearchFilter where useful.

### Ordering
Use DRF OrderingFilter where useful.

### Pagination
Use DRF pagination for appropriate list endpoints.

### OpenAPI
Ensure important endpoints have:
- sensible schemas
- request/response documentation
- correct auth information
- useful status responses

---

## M8 — Testing + Security + Backend Final Audit

Run the complete backend test suite.

Verify:
- authentication
- permissions
- tenant isolation
- appointment concurrency
- queue concurrency
- state machines
- validation
- error responses
- API documentation
- migrations
- no accidental M6+ scope creep

Run:

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py makemigrations --check
python manage.py check
pytest
```

Fix regressions before frontend work.

---

# Phase B — React Frontend

## M9 — React Foundation

Use:

```text
React
Vite
React Router
Axios
React Context
Vanilla CSS
```

Implement:
- project structure
- API client
- JWT access/refresh handling
- auth context
- login
- registration
- logout
- protected routes
- role-aware navigation
- organization context
- basic responsive layout
- light/dark theme support

Keep state management simple.

---

# M10 — Frontend Role Portals

## Customer
- dashboard
- organization discovery
- service/provider selection
- availability
- appointment booking
- appointment list/detail
- cancel/reschedule where supported
- check-in
- queue status
- review after completion
- notifications

## Provider
- dashboard
- today's queue
- call next
- start
- complete
- skip
- own appointments
- schedule management

## Staff
- appointment management
- queue management
- organization services/providers where permitted

## Manager
- organization dashboard
- services
- providers
- staff
- appointments
- queue
- reviews
- notifications
- basic analytics

## Admin
Use Django admin/API capabilities; do not build a massive custom admin panel unless needed.

### Queue UI

Use polling, not WebSockets:

```text
10–15 second polling
```

Keep the UI clear:
- current token
- called customer
- waiting count
- next tokens
- provider status

---

# Phase C — Finalization

## M11 — Production Readiness

Verify:
- environment variables
- production settings
- DEBUG disabled in production
- allowed hosts
- CORS
- secure cookie/security settings where applicable
- PostgreSQL
- static files
- Gunicorn
- deployment
- API documentation
- README
- setup instructions
- sample/demo data if useful
- final test suite
- final migration check

Final verification:

```bash
python manage.py check
python manage.py makemigrations --check
pytest
```

---

# 21. Explicitly DO NOT Add

These are intentionally postponed/out of scope for SmartQueue v1:

```text
Redis
Celery
Django Channels
WebSockets
Docker
Kubernetes
Microservices
Payment gateways
SMS integrations
AI predictions
Complex caching
Background workers
Advanced revenue analytics
Complex event sourcing
PostgreSQL ExclusionConstraint
```

Do not add a technology just to make the portfolio look more advanced.

The project must remain understandable and explainable by the developer.

---

# 22. Coding Rules for AI Agents

Before editing code:

1. Read this file.
2. Inspect the existing implementation.
3. Identify what is already complete.
4. Reuse existing patterns.
5. Do not rewrite working architecture unnecessarily.
6. Do not introduce new dependencies without a strong reason.
7. Keep business logic in service layers where the project already uses them.
8. Keep views/controllers thin.
9. Preserve tenant isolation.
10. Preserve existing permissions.
11. Preserve existing state machines.
12. Use Django 6.1-compatible APIs.
13. Use `condition=` for `CheckConstraint`.
14. Run tests after meaningful changes.
15. Fix regressions before moving on.
16. Update this file when a milestone is genuinely completed.

---

# 23. Definition of Done

SmartQueue is complete only when:

```text
[x] M1 Authentication stable
[x] M2 Organizations/roles stable
[x] M3 Services/providers stable
[x] M4 Availability/booking stable
[x] M5 Queue stable
[x] M6 Feedback/notifications/audit stable
[x] M7 Analytics/filtering/pagination/OpenAPI stable
[x] M8 Full backend audit/tests passed
[x] M9 React foundation complete
[ ] M10 Role portals complete
[ ] M11 Production configuration complete
[ ] Full regression tests pass
[ ] Tenant isolation verified
[ ] Permissions verified
[ ] State machines verified
[ ] No critical security issues
[ ] README/setup documentation complete
[ ] API documentation available
[ ] Project can be demonstrated end-to-end
```

---

# 24. End-to-End Demo Scenario

The final project should support this complete demonstration:

```text
1. User registers
2. User creates an organization
3. Creator becomes Manager
4. Manager creates services
5. Manager adds Provider
6. Provider gets profile
7. Provider offers services
8. Provider configures weekly schedule
9. Customer discovers organization
10. Customer selects service/provider
11. Customer sees dynamic availability
12. Customer books appointment
13. Customer checks in
14. Queue token is generated
15. Provider sees queue
16. Provider calls next
17. Customer becomes CALLED
18. Provider starts service
19. Appointment becomes IN_PROGRESS
20. Provider completes service
21. Appointment becomes COMPLETED
22. Queue entry becomes COMPLETED
23. Customer submits review
24. Notification/audit records exist
25. Manager sees basic analytics
26. Full workflow is visible through React UI
```

---

# 25. Agent Execution Strategy

Agents should work in **small phases**, not attempt the entire remaining project blindly.

Recommended order:

```text
CURRENT → Finish/Audit M5
↓
M6
↓
M7
↓
M8
↓
M9
↓
M10
↓
M11
```

At the end of each phase:

```text
1. Run relevant tests
2. Run full regression tests
3. Run manage.py check
4. Check migrations
5. Inspect changed files
6. Report implementation
7. Update CURRENT STATUS in this document
```

Never start the next major phase while the current phase has known critical failures.

---

# 25. CURRENT STATUS

Update this section after every milestone.

```text
M1: COMPLETE
M2: COMPLETE
M3: COMPLETE
M4: COMPLETE
M5: COMPLETE
M6: COMPLETE
M7: COMPLETE
M8: COMPLETE
M9: COMPLETE
M10: IN PROGRESS
M11: NOT STARTED
```

### Current objective

**Complete the M8 backend testing, security, and final audit without breaking M1–M7.**

After M5 is genuinely verified, update:

```text
M8: COMPLETE
M9: IN PROGRESS
```

Do not mark a milestone complete only because code was generated. Tests, migrations, permissions, tenant isolation, and business rules must also be verified.

---

# 26. Important Final Instruction to AI Agents

**Do not redesign SmartQueue. Continue the existing architecture.**

When uncertain:

```text
Prefer the simplest implementation
that satisfies the existing business rules,
preserves tenant isolation,
preserves security,
and can be explained clearly in an interview.
```

The goal is:

> **A complete, stable, professional, interview-explainable full-stack project — not a project overloaded with technologies.**
