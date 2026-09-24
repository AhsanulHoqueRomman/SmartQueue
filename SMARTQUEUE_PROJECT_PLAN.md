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

# 25. Contact Us & Support Messaging Architecture & Specification

> **Feature Note:** This section documents the architecture, database schema, API contracts, email notifications, admin workflows, and multi-phase implementation roadmap for the **Contact Us & Support Messaging** feature. It is documented as a new platform-level feature to be implemented sequentially after current work without modifying or invalidating completed milestones (M1–M9).

---

## 25.1 Public Contact Us — Product Decision & Submission Flow

SmartQueue's Contact Us page must be **publicly accessible**. Authentication is **NOT required**.

A visitor who has never registered or logged in must be able to submit a contact request.

### Intended Architectural Flow

```text
Public Website
      ↓
Contact Us Page (/contact)
      ↓
Contact Form
      ↓
POST /api/v1/contact/
      ↓
Django REST Framework Validation
      ↓
PostgreSQL ContactMessage (Source of Record)
```

### Supported User Types

1. **Logged-Out Visitor**: Anonymous submission without an account.
2. **Logged-In Customer**: Prefilled name and email for convenience, but fields remain fully editable. Authentication is NOT required for submission.

### Public Form Fields & Validation Rules

| Field Name | Type | Required | Description / Validation Rules |
| :--- | :--- | :--- | :--- |
| `name` | String | **Yes** | Full name of the sender (max 255 chars). |
| `email` | String | **Yes** | Valid email address format (`EmailField`). |
| `phone` | String | No | Optional contact phone number (max 32 chars). |
| `subject` | String | **Yes** | Subject title of the inquiry (max 255 chars). |
| `message` | String | **Yes** | Detailed support message body (`TextField`). |

> **Mandatory Rule:** Backend validation in DRF serializers is strictly mandatory even if frontend form validation exists.

---

## 25.2 ContactMessage Data Model Specification

To be implemented in Django app `apps/contact` (or `apps/support` as configured in project architecture):

```python
# Planned Data Model Specification (Do NOT implement in Phase 1)
class ContactStatus(models.TextChoices):
    NEW = 'NEW', 'New'
    IN_REVIEW = 'IN_REVIEW', 'In Review'
    REPLIED = 'REPLIED', 'Replied'
    CLOSED = 'CLOSED', 'Closed'

class ContactMessage(models.Model):
    id = models.BigAutoField(primary_key=True)  # or UUIDField matching project PK convention
    name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True, default='')
    subject = models.CharField(max_length=255)
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=ContactStatus.choices,
        default=ContactStatus.NEW,
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='replied_contact_messages'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Contact Message'
        verbose_name_plural = 'Contact Messages'
```

---

## 25.3 ContactMessage Status Lifecycle

The system enforces these four exact statuses:

* **`NEW`**: Newly submitted contact request that has not yet been reviewed by an admin.
* **`IN_REVIEW`**: System Admin has opened or started handling the request in the Admin Contact Inbox.
* **`REPLIED`**: System Admin has successfully dispatched a reply to the visitor via transactional email.
* **`CLOSED`**: Support request has been resolved/closed by an admin.

> **Rule:** Do not introduce unnecessary additional states (e.g., PENDING, ARCHIVED, SPAM) to keep the status machine clean and maintainable.

---

## 25.4 IMPORTANT — Architectural Decision: No Conversation History

> **SmartQueue v1 will NOT implement conversation history or threaded contact conversations.**

### Explicit Exclusions & Simplifications

* Do **NOT** create a `ContactMessageReply` model.
* Do **NOT** create reply threads, message threads, conversation history arrays, or multiple reply records per request.
* For v1, each inquiry consists of **One `ContactMessage` record + One admin reply action**.
* PostgreSQL stores the original contact request and metadata of the latest admin reply action:
  * `replied_at` (timestamp)
  * `replied_by` (admin user FK)
  * `status = REPLIED`
* The actual reply message body does **NOT** need to be stored as a separate conversation-history model record in v1. Keep the schema intentionally simple and portfolio-friendly.

---

## 25.5 Public Contact API Specification

### Endpoint Contract

```text
POST /api/v1/contact/
```

### Access & Security Rules

* **Permissions**: `AllowAny` (Anonymous users and authenticated customers can both submit).
* **Payload Validation**: DRF serializer enforces required fields (`name`, `email`, `subject`, `message`) and sanitizes input.
* **Write Protection**: Do **NOT** trust or accept client-controlled administrative fields (`status`, `replied_at`, `replied_by`, `id`, `created_at`). Client payloads attempting to pass status or reply fields must be stripped/ignored by the serializer.
* **Abuse & Rate Protection**: Must use Django REST Framework's built-in throttling mechanism (`AnonRateThrottle` / `UserRateThrottle`) to prevent spam/abuse.
* **Forbidden Dependencies**: Do **NOT** introduce Redis, Celery, WebSockets, Django Channels, microservices, or CAPTCHA dependencies unless a later real need explicitly arises.

### Source of Record vs Email Delivery Rule

```text
ContactMessage database save ≠ Email delivery
```

* **PostgreSQL is the source of record.** The `ContactMessage` instance MUST be saved to the PostgreSQL database independently of transactional email dispatch.
* **Brevo is only the delivery/notification layer.** If Brevo is unavailable or email sending encounters an error, the database transaction must NOT roll back. The inquiry remains safely stored in PostgreSQL with status `NEW`.

---

## 25.6 Admin Contact Inbox Specification

Add a dedicated Contact Messages inbox under system admin navigation:

```text
Admin Navigation Architecture
 ├── Dashboard
 ├── Organizations
 ├── Platform Users
 ├── Contact Messages   ← NEW (Admin Contact Inbox)
 └── Profile
```

### Functional Capabilities

The Admin Contact Inbox allows an authorized System Admin (`is_staff` / `is_superuser`) to:

1. **View List**: View incoming contact requests sorted chronologically (`-created_at`).
2. **Filter by Status**:
   * `All`
   * `New` (`NEW`)
   * `In Review` (`IN_REVIEW`)
   * `Replied` (`REPLIED`)
   * `Closed` (`CLOSED`)
3. **Open Message Detail**: View full sender information (name, email, phone), subject, submission timestamp, and full message text.
4. **Status Transitions**:
   * Mark `NEW` → `IN_REVIEW` upon viewing or taking ownership.
   * Send Admin Reply (automatically sets `status = REPLIED`, populates `replied_at` and `replied_by`).
   * Mark status as `CLOSED` when resolved.
5. **Portfolio-Friendly Scope**: Keep this a lightweight, clean admin feature. Do NOT build a full-fledged helpdesk/ticketing platform (Zendesk clone).

---

## 25.7 Admin Reply Architecture & Recipient Rules

### Intended Admin Reply Flow

```text
Admin Contact Inbox
        ↓
Open ContactMessage Detail
        ↓
Fill Admin Reply Form
        ↓
POST /api/v1/admin/contact-messages/{id}/reply/
        ↓
Django Backend Service Layer
        ↓
Brevo Transactional Email Service
        ↓
Visitor's Submitted Email Address
```

### Key Rules

1. **Recipient Address**: The email address submitted in the `ContactMessage` form (`email` field) is the recipient. The visitor does **NOT** need a SmartQueue account.
2. **Sender Address**: All outgoing emails must be sent from a verified SmartQueue support/sender email address configured on Brevo (e.g., `support@smartqueue.com` or `noreply@smartqueue.com`).
3. **No Header Spoofing**: Do **NOT** spoof the visitor's email as the `From` address.

---

## 25.8 Brevo Integration Architecture

Brevo (formerly Sendinblue) is the official transactional email provider for SmartQueue.

### Architecture Topology

```text
Django Backend (Service Layer)
      ↓
Brevo REST API (via HTTP client / official SDK)
      ↓
Customer / Visitor Email Inbox
```

### Configuration & Security Rules

* **Backend Environment Variable**:
  ```env
  BREVO_API_KEY=your_brevo_api_key_here
  ```
* **Security Constraints**:
  * `BREVO_API_KEY` must remain strictly backend-only.
  * Do **NOT** expose `BREVO_API_KEY` to React, Vite (`VITE_`), or frontend environment variables.
  * Do **NOT** commit actual API keys to Git repository or version control.

---

## 25.9 Transactional Email Flows

### Flow A: Admin Notification (Upon Visitor Submission)

When a visitor submits a Contact Us form:
1. `ContactMessage` is saved to PostgreSQL.
2. Django triggers Brevo transactional email to SmartQueue Admin / Support inbox (`support@smartqueue.com`).
3. Notification email includes sender name, email, phone, subject, message preview, and link to Admin Contact Inbox.

### Flow B: Customer / Visitor Submission Confirmation

After a visitor successfully submits a message:
1. `ContactMessage` is saved to PostgreSQL.
2. Django triggers Brevo transactional email to the visitor's submitted email.
3. Content: A simple confirmation message (e.g., *"We have received your message. Our support team will get back to you shortly."*). No account required.

### Flow C: Admin Reply Delivery

When an admin sends a reply from the Admin Contact Inbox:
1. Admin enters reply text and submits form.
2. Django invokes Brevo API to send email to visitor's submitted email address.
3. Django updates `ContactMessage` record (`status = REPLIED`, `replied_at = now()`, `replied_by = request.user`).

> **Rule:** Keep email processing simple. Do NOT add inbound email webhook parsing or automatic email-to-ticket conversion in v1.

---

## 25.10 Failure Handling & Persistence Decoupling Principle

```text
Database Persistence (PostgreSQL)  >>>  Email Delivery (Brevo)
```

* **Zero Data Loss Guarantee**: If Brevo API is down, network timeout occurs, or `BREVO_API_KEY` is misconfigured, the `ContactMessage` record in PostgreSQL **MUST NOT** be lost or rolled back.
* **Handling Strategy**: Wrap email dispatch calls in try/except blocks inside service layers. Log failures with standard Python logger.
* **No Async Queue Needed in v1**: Deliver emails synchronously within service handlers. Do not introduce Celery, Redis, or background task runners.

---

## 25.11 Security Requirements & Tenant Isolation Rules

### Public Endpoint Security

* `POST /api/v1/contact/` must sanitize all inputs.
* Stricter rate-limiting applied via DRF Throttling to prevent email/DB spamming.
* Administrative fields (`status`, `replied_at`, `replied_by`) cannot be set by public clients.

### Admin Endpoint Security & Permissions

* Admin Inbox endpoints (`/api/v1/admin/contact-messages/`) must enforce strict permission checks: `IsAdminUser` (`is_staff` or `is_superuser`).
* Organization Managers, Providers, Staff, and Customers must receive `403 Forbidden` if attempting to access contact inbox endpoints.

### Platform-Level Tenant Isolation Rule

* **Contact Us is a platform-level public support feature.**
* It is **NOT** tied to or scoped by organization membership or tenant ID.
* Any visitor can submit a general support request to SmartQueue without belonging to any organization.

---

## 25.12 Public React Contact Us UI (`/contact`) & Styling Guidelines

### Page Route

```text
/contact
```

Publicly accessible in React Router (`AppRoutes.jsx`).

### Layout & UI Elements

* Heading: **Contact SmartQueue Support**
* Subheading: Send us a message and our team will get back to you.
* Form Controls:
  * Name * (text input)
  * Email * (email input)
  * Phone (tel input, optional)
  * Subject * (text input)
  * Message * (textarea)
  * Send Message (submit button with pending/loading state)
* Feedback Banners: Dynamic success notification upon submission and accessible error alerts.
* Logged-in Customer Prefill: If user is authenticated (`useAuth()`), prefill `name` and `email` from user profile, but leave fields editable.

### Theme & Styling Integration Rules

* Future React UI implementation must strictly use existing SmartQueue design tokens (`index.css`) and global CSS variables (`--bg-primary`, `--text-primary`, `--accent-color`, etc.).
* Light/Dark theme compatibility will be automatically maintained by consuming global CSS variables.
* **Separation of Concerns**: Dark theme logic and implementation must remain completely separate from Contact Us feature logic.

---

## 25.13 Contact Us Implementation Roadmap

```text
Contact Us Implementation Roadmap

Phase 1 — Architecture & Project Plan (COMPLETED - Documentation Only)
    ↓
Phase 2 — Backend ContactMessage System
    ↓
Phase 3 — Admin Contact Inbox & Reply API
    ↓
Phase 4 — Brevo Transactional Email Integration
    ↓
Phase 5 — Public React Contact Us UI
    ↓
Final — End-to-End Verification
```

### Phase Descriptions

* **Phase 1 — Architecture & Project Plan**: (Documentation/Architecture Only) Update `SMARTQUEUE_PROJECT_PLAN.md` with complete specifications and workflow guidelines. Zero code/database changes.
* **Phase 2 — Backend ContactMessage System**: Implement `ContactMessage` model, migration, serializer, public `POST /api/v1/contact/` API, validation, throttling/abuse protection, and backend tests (`test_contact_api.py`).
* **Phase 3 — Admin Contact Inbox & Reply API**: Implement admin inbox endpoints, permissions (`IsAdminUser`), status management (`NEW` → `IN_REVIEW` → `REPLIED` → `CLOSED`), admin reply API, and frontend admin UI.
* **Phase 4 — Brevo Transactional Email Integration**: Integrate Brevo API for admin notification, visitor confirmation, and admin reply delivery. Ensure DB persistence is decoupled from Brevo availability.
* **Phase 5 — Public React Contact Us UI**: Build public `/contact` React page, navbar link, prefill support for logged-in users, submission state management, and API integration.
* **Final — End-to-End Verification**: Execute full end-to-end verification checklist:
  * Run `pytest` backend test suite
  * Run `manage.py check` & check migrations
  * Run `npm run build` frontend build verification
  * Run browser smoke tests for anonymous submission & logged-in submission
  * Run admin inbox review & admin reply email dispatch verification
  * Verify security permission checks (`403 Forbidden` for non-admin users)

---

# 26. Agent Execution Strategy

Agents should work in **small phases**, not attempt the entire remaining project blindly.

### Recommended Execution Strategy for Contact Us Phases

For every Contact Us implementation phase:

```text
1. Read SMARTQUEUE_PROJECT_PLAN.md
2. Inspect existing implementation
3. Make only the requested changes for the phase
4. Run relevant tests
5. Run regression tests where appropriate
6. Inspect changed files
7. Report PASS / PARTIAL / FAIL / NOT VERIFIED
8. Update SMARTQUEUE_PROJECT_PLAN.md
```

Do not mark a phase COMPLETE simply because code was generated. Tests, migrations, permissions, tenant isolation, and business rules must also be verified.

---

# 27. CURRENT STATUS

Update this section after every milestone/phase.

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
Contact Us Phase 1: COMPLETE (Architecture & Project Plan Updated)
Contact Us Phase 2: NOT STARTED (Backend System)
Contact Us Phase 3: NOT STARTED (Admin Inbox)
Contact Us Phase 4: NOT STARTED (Brevo Email Integration)
Contact Us Phase 5: NOT STARTED (Public React UI)
Contact Us Final: NOT STARTED (End-to-End Verification)
```

---

# 28. Important Final Instruction to AI Agents

**Do not redesign SmartQueue. Continue the existing architecture.**

When uncertain:

```text
Prefer the simplest implementation
that satisfies the existing business rules,
preserves tenant isolation,
preserves security,
and can be explained clearly in an interview.
```

### Strictly Forbidden Technologies for Contact Us Feature

Do **NOT** introduce any of the following for this feature:

* Redis
* Celery
* WebSockets / Django Channels
* Docker / Kubernetes
* Microservices / Message Queues / Background Workers
* Conversation Threading / `ContactMessageReply` model
* Inbound Email Processing / Email-to-Ticket Conversion
* External CAPTCHA dependencies

The goal is:

> **A complete, stable, professional, interview-explainable full-stack project — not a project overloaded with unnecessary technologies.**

