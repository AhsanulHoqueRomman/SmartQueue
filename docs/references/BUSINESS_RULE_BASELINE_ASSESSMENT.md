## 1. Executive Assessment

QueueTurn has a substantial, coherent business-rule implementation. Its central booking path uses a transaction, provider-first locking, server-resolved price snapshots, provider/date serial allocation and immediate `QueueEntry` creation. The queue calls eligible checked-in customers by urgent priority, then serial.

The baseline is **partially verified**: current source and selected test assertions were inspected, but no application execution, tests, browser automation, database inspection or live requests were performed.

The main concerns are:

- Public discovery serializers expose verification-document and review metadata.
- Rescheduling omits capacity and eligibility checks performed during initial booking.
- Past-date reconciliation can mutate other organizations’ records and terminate an overnight consultation.
- The frontend walk-in request does not satisfy its serializer contract.
- ETA, readiness and check-in contain policy ambiguities and inconsistencies with operational queue selection.
- Several secondary workflows have broken field references or routing contracts.
- PostgreSQL concurrency behavior remains unproven by the inspected tests.

No P0 finding is established. Source-confirmed problems and potential race conditions are distinguished below.

**Evidence terminology**

- **S — VERIFIED — SOURCE:** established from current executable source.
- **T — VERIFIED — TEST:** an existing assertion was inspected; **the test was not executed**.
- **D — DOCUMENTED — NOT VERIFIED:** documentation only.
- **I — INFERRED:** plausible consequence requiring runtime verification.
- **U — UNKNOWN:** insufficient evidence.

Existing QueueTurn rename modifications are pre-existing work, not audit findings.

## 2. Repository and Architecture Overview

**Repository state:** `D:\SmartQueue`, branch `main`; 42 modified tracked files, zero staged files and zero untracked files. The current diff contains 111 insertions and 111 deletions.

### Backend

The Django project lives under `backend/config`; business apps live under `backend/apps`.

| Area | Relevant source |
|---|---|
| API composition | [config/urls.py](D:/SmartQueue/backend/config/urls.py:38) |
| Identity, registration and password reset | [accounts/models.py](D:/SmartQueue/backend/apps/accounts/models.py:8), [accounts/views.py](D:/SmartQueue/backend/apps/accounts/views.py:126) |
| Organizations, memberships and operating hours | [organizations/models.py](D:/SmartQueue/backend/apps/organizations/models.py:133), [operating_hours.py](D:/SmartQueue/backend/apps/organizations/operating_hours.py:26) |
| Services and categories | [services/views.py](D:/SmartQueue/backend/apps/services/views.py:55) |
| Provider profiles, assignments and schedules | [providers/models.py](D:/SmartQueue/backend/apps/providers/models.py:97), [providers/services.py](D:/SmartQueue/backend/apps/providers/services.py:265) |
| Authoritative customer pricing | [providers/pricing.py](D:/SmartQueue/backend/apps/providers/pricing.py:9) |
| Appointment creation and lifecycle | [appointments/services.py](D:/SmartQueue/backend/apps/appointments/services.py:465), [appointments/models.py](D:/SmartQueue/backend/apps/appointments/models.py:14) |
| Queue, ETA and readiness | [queue/services.py](D:/SmartQueue/backend/apps/queue/services.py:128), [queue/models.py](D:/SmartQueue/backend/apps/queue/models.py:12) |
| Reviews and trust | [feedback/services.py](D:/SmartQueue/backend/apps/feedback/services.py:26), [organizations/serializers.py](D:/SmartQueue/backend/apps/organizations/serializers.py:186) |
| Notifications | [notifications/services.py](D:/SmartQueue/backend/apps/notifications/services.py:8), [notifications/views.py](D:/SmartQueue/backend/apps/notifications/views.py:17) |
| Contact and transactional email | [contact/views.py](D:/SmartQueue/backend/apps/contact/views.py:43), [contact/email_service.py](D:/SmartQueue/backend/apps/contact/email_service.py:99) |
| Analytics | [analytics/urls.py](D:/SmartQueue/backend/apps/analytics/urls.py:9), [analytics/views.py](D:/SmartQueue/backend/apps/analytics/views.py:21) |

Declared dependencies include Django, DRF, Simple JWT, PostgreSQL’s `psycopg2`, pytest and Resend. The declarations are not uniform: root and backend requirements differ, including pytest versions and Resend availability. These are **declarations**, not verified installed versions.

The inspected background behavior consists primarily of HTTP polling and request-triggered reconciliation. No separate scheduled queue-reconciliation mechanism was identified.

### Frontend

React uses route guards, authentication and tenant contexts, service modules and shared display utilities.

Important dependencies include:

- [AppRoutes.jsx](D:/SmartQueue/frontend/src/routes/AppRoutes.jsx)
- [RoleRoute.jsx](D:/SmartQueue/frontend/src/routes/RoleRoute.jsx:22)
- [AuthContext.jsx](D:/SmartQueue/frontend/src/contexts/AuthContext.jsx)
- [TenantContext.jsx](D:/SmartQueue/frontend/src/contexts/TenantContext.jsx:84)
- [BookAppointmentPage.jsx](D:/SmartQueue/frontend/src/pages/customer/BookAppointmentPage.jsx:87)
- [CustomerLiveQueuePage.jsx](D:/SmartQueue/frontend/src/pages/customer/CustomerLiveQueuePage.jsx:30)
- [ProviderQueuePage.jsx](D:/SmartQueue/frontend/src/pages/provider/ProviderQueuePage.jsx:169)
- [queueService.js](D:/SmartQueue/frontend/src/services/queueService.js:76)
- [queueDisplay.js](D:/SmartQueue/frontend/src/utils/queueDisplay.js:7)

React, React Router, Axios, Vite and Oxlint are declared. Role guards provide UX routing; backend permissions provide authorization.

Existing documentation includes `README.md`, `SMARTQUEUE_PROJECT_PLAN.md`, historical organization-profile and contact reports, and frontend documentation. Historical plans are not treated as authoritative implementation evidence.

## 3. Verified Business Rule Baseline

Paths below are repository-relative; line numbers identify the current working-tree implementation. Links to major files appear above.

| Rule ID | Domain | Business Rule | Current Implementation | Evidence | Verification Status | Notes |
|---|---|---|---|---|---|---|
| BR-001 | Identity | Customers are global users | `User` has no organization-role field | `backend/apps/accounts/models.py:8–18` | S | Customer is not a stored membership role |
| BR-002 | Membership | Organization roles belong to memberships | `MANAGER`, `PROVIDER`, `STAFF`; unique user/organization membership | `organizations/models.py:133–168` | S | One user can participate in multiple organizations |
| BR-003 | Administration | Platform privileges use Django flags | Permissions recognize `is_staff` or `is_superuser` | `providers/permissions.py:18–19`; appointment/queue permissions | S | Separate from organization STAFF |
| BR-004 | Tenancy | Operational access uses target organization | URL organization and active membership determine access | `appointments/permissions.py:11–155` | S + T | Wrong-tenant assertions inspected in `test_m11_security.py` |
| BR-005 | Tenancy | Booking rejects foreign provider/service combinations | Loaders and assignment query constrain resources to organization | `appointments/services.py:492–525` | S | ORM models alone do not enforce every cross-tenant FK relationship |
| BR-006 | Organization | Public operational organization listing requires approval | Active and `APPROVED` filter | `organizations/views.py:73–77` | S | Public detail/related endpoints need consistent filtering |
| BR-007 | Hours | Organization hours are public business hours | Evaluated separately from provider booking availability | `organizations/operating_hours.py:1,26–85` | S | Not currently a booking gate |
| BR-008 | Hours | Unknown hours differ from closed hours | `is_open_now=None`, “Hours unavailable” | `operating_hours.py:46–58` | S | Frontend should retain this distinction |
| BR-009 | Hours | Overnight opening is supported | Earlier closing time implies next-day closing; explicit closed-day override applies | `operating_hours.py:10–45` | S | No holiday calendar found in this calculation |
| BR-010 | Provider | Operational eligibility requires active approved state | Profile, membership and organization conditions apply | `providers/models.py:97`; `appointments/services.py:492–507` | S | Booking additionally checks PROVIDER role |
| BR-011 | Assignment | Provider/service assignments are unique | Unique provider/service constraint | `providers/models.py:205` | S | Assignment required for booking |
| BR-012 | Price | Effective charge has one centralized rule | Non-null override, otherwise service price | `providers/pricing.py:9` | S + T | Zero override is preserved |
| BR-013 | Price | Starting price uses eligible assignments | Database minimum of effective eligible charges | `providers/pricing.py:23–44` | S | Eligibility excludes schedule/capacity considerations |
| BR-014 | Price | No eligible assignment means no starting price | Aggregate returns null | `providers/pricing.py:37–44` | S + T | Base price is not fabricated as a minimum |
| BR-015 | Price | Manager mutation follows provider-first locking | Provider lock, then assignment lock, inside transaction | `providers/services.py:265–302` | S + T | Test wraps helpers; not a concurrent PostgreSQL test |
| BR-016 | Availability | Weekly provider schedules determine working days | Missing/non-working schedule rejects availability | `appointments/services.py:349–382` | S | Individual schedule differs from organization hours |
| BR-017 | Availability | Breaks reduce daily capacity | Scheduled minutes minus sum of break minutes | `appointments/services.py:278–307` | S + T | Assumes valid, non-overlapping breaks |
| BR-018 | Availability | Full-day leave blocks date booking | A leave covering the entire window rejects booking | `appointments/services.py:384–405,605–614` | S | Partial leave is not deducted from daily capacity |
| BR-019 | Capacity | Active reservations consume workload | PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS count | `appointments/models.py:33–38`; `services.py:308–325` | S + T | COMPLETED also releases counted workload |
| BR-020 | Duration | Booking uses provider duration override when truthy | Override otherwise base service duration | `appointments/services.py:75–89,556` | S | Zero duration is not a valid useful override |
| BR-021 | Availability | Date-level result is capacity-based | `is_available=has_capacity` | `appointments/services.py:410–452` | S | Legacy fixed-slot list is still computed independently |
| BR-022 | Time | Backend uses project timezone | Project timezone date and aware schedule boundaries | `appointments/services.py:66`; `queue/services.py:68–73` | S | Default setting is Asia/Dhaka |
| BR-023 | Booking | Customer books a serial through the current UI | Date selection and capacity confirmation, no fixed-slot grid | `frontend/.../BookAppointmentPage.jsx:187–238` | S | Legacy datetime API remains supported |
| BR-024 | Booking | Creation is atomic | Provider and assignment locks precede creation | `appointments/services.py:488–704` | S | All competing writers must honor compatible locks |
| BR-025 | Snapshot | Server determines stored booking charge | Central resolver called under assignment lock | `appointments/services.py:517–525,664` | S + T | Client cannot set authoritative charge |
| BR-026 | Snapshot | Contact details are appointment-specific | Explicit values or centralized user fallback | `appointments/contacts.py:7–35`; `services.py:482,665–666` | S + T | No profile writes |
| BR-027 | Contact | Explicit phone accepts specified Bangladesh mobile forms | Trim; validate local or `+880` mobile regex | `appointments/contacts.py:16–22` | S + T | Omitted existing phone is not newly validated |
| BR-028 | Legacy | Missing snapshots stay nullable | Read name/phone fallback to user | `appointments/models.py:98–109`; migration `0004_booking_snapshots.py` | S + T | Historical prices are not fabricated |
| BR-029 | Duration | No dedicated immutable duration snapshot exists | Booking stores start/end; later calculations use current duration data | `appointments/models.py:86–100`; `services.py:314–316`; `queue/services.py:501,617` | S | Historical-duration policy unresolved |
| BR-030 | Serial | Sequence belongs to provider/date | Maximum across appointments and queue entries plus one | `appointments/services.py:631–643` | S + T | Starts at 1; canceled serials remain consumed |
| BR-031 | Serial | Serial uniqueness is constrained | Provider/date/serial constraints on both models | `appointments/models.py:144`; `queue/models.py:111` | S | Provider lock serializes normal booking path |
| BR-032 | Queue | Queue entry is created during booking | Same transaction, matching provider/date/serial | `appointments/services.py:670–680` | S + T | Not deferred until check-in |
| BR-033 | Channel | Online API fixes source semantics | ONLINE and SCHEDULED set by server | `appointments/views.py:159–168` | S | Source does not enter call-order selector |
| BR-034 | Walk-in | Shared booking service handles front desk | FRONT_DESK/WALK_IN and automatic check-in | `queue/services.py:352–393`; `appointments/services.py:645–680` | S + T | Direct-service tests do not prove UI endpoint contract |
| BR-035 | Check-in | Only current business date is accepted | Date compared with project-local today | `queue/services.py:171–175` | S + T | No enforced opening time window |
| BR-036 | Check-in | Repeated check-in is idempotent on normal path | Already checked-in entry returned | `queue/services.py:189–191` | S + T | Notification assertion inspected |
| BR-037 | Call-next | Only eligible checked-in waiting entries can be called | WAITING, checked-in, appointment CONFIRMED/CHECKED_IN | `queue/services.py:301–310` | S + T | Unchecked-in reservations excluded |
| BR-038 | Order | Urgent precedes serial order | `-is_urgent`, `serial_number` | `queue/services.py:309` | S + T | Booking channel is absent from comparator |
| BR-039 | Active service | One active entry blocks call-next for that date | CALLED/IN_PROGRESS existence check under provider lock | `queue/services.py:287–299` | S + T | Date-specific; true concurrency not tested |
| BR-040 | Urgent | Urgent changes priority, not serial | Boolean/reason mutation and audit | `queue/services.py:337–349` | S | Reason optional; no provider lock |
| BR-041 | Start | Start synchronizes appointment and queue | CALLED→IN_PROGRESS; linked appointment→IN_PROGRESS | `queue/services.py:699–735` | S | Provider→entry→appointment locking |
| BR-042 | Complete | Completion synchronizes both models | IN_PROGRESS→COMPLETED on each | `queue/services.py:740–782` | S + T | Notification and audit created |
| BR-043 | Skip | Skipping a called customer records no-show | Queue SKIPPED; appointment NO_SHOW | `queue/services.py:788–831` | S | Does not automatically call next |
| BR-044 | Cancel | Normal cancellation is pre-check-in only | PENDING/CONFIRMED→CANCELLED and linked queue cancellation | `appointments/services.py:825–883` | S | Checks occur before transaction; race risk |
| BR-045 | Reconcile | Past queue dates are reconciled on operational requests | Active old entries→SKIPPED, appointments→NO_SHOW | `queue/services.py:396–422` | S | Global scope and overnight problem |
| BR-046 | ETA | Priority comparator resembles call-next | Urgent/serial precedence reused in preceding-entry calculation | `queue/services.py:587–607` | S | Eligibility population differs |
| BR-047 | ETA | Unchecked-in reservations influence forecast | All scheduled preceding WAITING entries contribute duration | `queue/services.py:609–620` | S | Physical people-ahead counts checked-in entries plus active service |
| BR-048 | ETA | Active service uses elapsed-time subtraction | Remaining duration floored at zero | `queue/services.py:575–620` | S | Uses base service duration |
| BR-049 | Readiness | Stored concepts are NOT_YET, GET_READY, BE_READY, TURN_NOW, IN_SERVICE | Deterministic branches and terminal response labels | `queue/models.py:21–26`; `services.py:425–692` | S | Threshold precedence needs product decision |
| BR-050 | Check-in metadata | Returned window is advisory in current code | Available-at calculated, but `can_check_in` does not compare current time to it | `queue/services.py:632–638` | S | Future and same-day metadata differ |
| BR-051 | Frontend state | Upstream booking changes invalidate downstream selections | Dependency reset plus request revision/cleanup | `BookAppointmentPage.jsx:87–103,199–216` | S | Contact edits and notes survive |
| BR-052 | Frontend confirmation | Review precedes API creation | Confirmation guard, authoritative selection payload, returned snapshots | `BookAppointmentPage.jsx:219–244` | S | No server-side idempotency key found |
| BR-053 | Notification | Notifications are recipient-owned | Organization plus recipient, or customer-wide recipient filter | `notifications/views.py:23–25,62–64,88–90` | S | Read/mark-all operations remain owner-scoped |
| BR-054 | Notification | Read marking is repeat-safe | Set `read_at` only when null | `notifications/services.py:22–33` | S | Frontend polls every 20 seconds |
| BR-055 | Review | Only appointment owner may review completed service | Customer equality and COMPLETED status | `feedback/services.py:26–42` | S + T | Duplicate prevented by database relationship/constraint |
| BR-056 | Trust | Verification indicator derives from backend approval | `smartqueue_verified` reflects organization status | `organizations/serializers.py:186` | S | Identifier must remain unchanged |
| BR-057 | Contact | Successful submission means inquiry persisted | Save, attempt both emails, return 201 | `contact/views.py:43–58` | S + T | Does not prove email acceptance or delivery |
| BR-058 | Email | Admin and customer recipients have different sources | Configured support inbox versus submitted customer email | `contact/email_service.py:67–74,162–242` | S | No private values disclosed |
| BR-059 | Email | Failures are converted to results and logged | Exceptions caught; `EmailSendResult(False)` returned | `contact/email_service.py:115–158` | S + T | Callers discard results |
| BR-060 | Reset | Password-reset response avoids account enumeration | Generic response regardless of account/send outcome | `accounts/views.py:291–313` | S + T | Delivery failure should be operator-visible, not account-revealing |
| BR-061 | Admin reply | Reply status is saved before sending | REPLIED and timestamps persisted; send attempted afterward | `contact/views.py:162–177` | S | Reply body/send outcome not persisted in `ContactMessage` |
| BR-062 | Compatibility | Legacy identifiers remain intentional | Technical keys, app labels, API fields and paths retain existing identity | Current source/configuration | S | Not rename defects |

## 4. Intended vs Implemented Comparison

| Product expectation | Assessment | Reason |
|---|---|---|
| 1. Customer books a serial, not guaranteed consultation time | **IMPLEMENTED AND VERIFIED** | Current frontend and booking flow use dates/serials. Legacy datetime support still exists. |
| 2. Availability considers working time, breaks, leave, duration and capacity | **PARTIALLY IMPLEMENTED** | Breaks and workload count; partial leave and elapsed day do not reduce capacity. Rescheduling diverges further. |
| 3. Each provider/date owns its serial sequence | **IMPLEMENTED AND VERIFIED** | Provider/date locks and uniqueness strategy in normal booking. Legacy check-in has an exception. |
| 4. Online, phone and front-desk participate in one queue | **PARTIALLY IMPLEMENTED** | Source-independent ordering and channel model exist; no separate end-to-end phone creation flow was established. |
| 5. Walk-ins receive valid serials | **PARTIALLY IMPLEMENTED** | Shared service works by source/assertions; current provider UI payload fails serializer requirements. |
| 6. Calling requires eligible checked-in presence | **IMPLEMENTED AND VERIFIED** | Explicit call-next filters. |
| 7. Urgent priority preserves serial identity | **IMPLEMENTED AND VERIFIED** | Flag changes without serial reassignment; concurrency handling is incomplete. |
| 8. ETA follows effective service order | **PRODUCT DECISION REQUIRED** | Priority comparator aligns, but ETA counts unchecked-in reservations that call-next excludes and ignores custom durations. |
| 9. Readiness is an estimate | **IMPLEMENTED AND VERIFIED** | Deterministic forecast and current UI; threshold policy needs clarification. |
| 10. Appointment/queue transitions stay consistent | **PARTIALLY IMPLEMENTED** | Normal start/complete/skip synchronize; cancellation races, reconciliation and legacy paths undermine the general claim. |
| 11. Customers are global users | **IMPLEMENTED AND VERIFIED** | No automatic staff membership requirement. |
| 12. Roles/data are tenant-isolated | **PARTIALLY IMPLEMENTED** | Core private endpoints are scoped; public document exposure and global reconciliation are exceptions. |
| 13. Reviews follow eligibility | **IMPLEMENTED AND VERIFIED** | Owner, completed status and duplicate prevention. |
| 14. Email failure does not misrepresent delivery | **PARTIALLY IMPLEMENTED** | Inquiry persistence semantics are explicit; send results are discarded and REPLIED/reset wording can overstate outcomes. |

“Verified” here means source verification and, where noted, inspected assertions—not runtime certification.

## 5. Business Workflow Maps

### Customer booking

`BookAppointmentPage` / storefront booking  
→ frontend appointment service  
→ `POST /api/v1/organizations/{organization_id}/appointments/`  
→ `AppointmentCreateSerializer`  
→ `AppointmentService.book_appointment()`  
→ atomic appointment, queue entry, notifications and audit  
→ appointment serializer  
→ snapshot-based confirmation/details.

The booking transaction validates organization/provider/service, locks the provider, locks its assignment, resolves price centrally, checks date/schedule/capacity, allocates serial and creates both records. Contact fallback is centralized and does not update profiles.

### Provider availability

Availability endpoint  
→ provider/service/assignment eligibility  
→ project-local date  
→ weekly schedule  
→ full-day leave check  
→ daily capacity calculation  
→ legacy slot calculation  
→ `is_available`, working-window and capacity response.

`is_available` follows capacity, not whether the legacy slot list is nonempty. Organization hours are separately evaluated public business hours.

### Serial allocation

Provider lock  
→ maximum appointment serial for provider/date  
→ maximum queue serial for provider/date  
→ larger maximum + 1  
→ matching appointment/queue serial and token alias.

Cancelled appointments remain in the maximum. Urgent priority changes service order without changing identity.

### Customer check-in

Appointment check-in endpoint  
→ owner/organization-role permission  
→ provider lock  
→ appointment lock/refetch  
→ same-business-date validation  
→ existing queue flag/timestamp update  
→ appointment CONFIRMED→CHECKED_IN  
→ notifications/audit.

Normal repeated check-in returns the existing checked-in entry. Legacy appointments without entries use a separate creation branch with the serial persistence problem in F-014.

### Call-next

`POST /api/v1/organizations/{organization_id}/queue/providers/{provider_id}/call-next/`  
→ operational permission  
→ global past-date reconciliation  
→ provider lock  
→ reject existing CALLED/IN_PROGRESS entry for selected date  
→ lock first eligible checked-in WAITING entry ordered urgent, serial  
→ CALLED and timestamp  
→ notification/audit.

### Urgent handling

Entry urgent endpoint  
→ operational entry permission  
→ `mark_urgent()`  
→ flag/reason update and audit.

Serial and normal eligibility are unchanged. The helper named `_lock_entry` does not actually lock the row in this path.

### ETA/readiness

Queue serialization  
→ `calculate_eta()`  
→ terminal/future/past/current-date branch  
→ current active consultation  
→ priority-preceding reservations  
→ current base service durations and active elapsed time  
→ estimated start/end, recommended arrival, check-in metadata, counts and readiness.

The backend’s `people_ahead` includes active service. Some frontend display logic substitutes another count.

### Cancellation/no-show

- Cancellation: pre-check-in appointment validation → atomic appointment/queue cancellation → notifications/audit.
- Skip: CALLED queue → SKIPPED; linked appointment → NO_SHOW.
- Reconciliation: past-date active queue records → SKIPPED; associated active appointments → NO_SHOW.

Cancellation checks are performed before locking/refetching. Reconciliation is currently global and does not preserve cross-midnight active service.

### Consultation completion

Entry start endpoint  
→ provider, queue entry and appointment locks  
→ synchronized IN_PROGRESS.

Entry completion endpoint  
→ same lock hierarchy  
→ synchronized COMPLETED  
→ notification/audit.

Completion does not automatically call another customer.

### Notifications/email

In-app business event  
→ `NotificationService.create()`  
→ recipient-owned storage  
→ frontend HTTP polling  
→ owner-scoped read marking.

Contact submission  
→ serializer/save  
→ admin notification attempt  
→ customer acknowledgement attempt  
→ 201 for saved inquiry.

Password reset  
→ active account lookup  
→ token/link  
→ send attempt  
→ generic 200.

Admin reply  
→ REPLIED metadata saved  
→ reply send attempt  
→ 200.

These paths distinguish persistence from delivery imperfectly. The reported stale `--noreload` server incident is **resolved operational context**, not an unresolved source finding.

### Actual state transitions

| Operation | Appointment | QueueEntry | Transaction/locking |
|---|---|---|---|
| Online booking | New CONFIRMED | New WAITING, unchecked-in | Atomic; provider then assignment |
| Walk-in/front desk | New CHECKED_IN | New WAITING, checked-in | Shared booking transaction |
| Check-in | CONFIRMED→CHECKED_IN | WAITING retained; flag/time set | Atomic; provider then appointment |
| Call-next | Remains CHECKED_IN/CONFIRMED | WAITING→CALLED | Atomic; provider then selected entry |
| Start | →IN_PROGRESS | CALLED→IN_PROGRESS | Atomic; provider→entry→appointment |
| Complete | IN_PROGRESS→COMPLETED | IN_PROGRESS→COMPLETED | Same central locking hierarchy |
| Skip called customer | CHECKED_IN→NO_SHOW | CALLED→SKIPPED | Atomic linked transition |
| Cancel | PENDING/CONFIRMED→CANCELLED | Linked entry→CANCELLED | Atomic writes; stale validation risk |
| Reconcile old date | Active appointment→NO_SHOW | Active entry→SKIPPED | Atomic writes, globally scoped, no coordinating row locks |
| Mark urgent | No status change | Priority flag/reason only | Atomic block without effective row/provider locking |

Appointment transition declarations are stricter than QueueEntry’s declarations. QueueEntry permits some transitions that are not exposed as complete linked-model operations.

## 6. Role and Tenant Isolation Matrix

Organization-role permissions below require an active membership in the resource’s organization.

| Action | Customer/owner | Provider | Staff | Manager | Platform admin |
|---|---|---|---|---|---|
| Book for authenticated self | Yes | Yes in backend | Yes in backend | Yes in backend | Yes |
| Read appointment | Own | Assigned or own | Own organization | Own organization | Yes |
| Cancel pre-check-in appointment | Own | Assigned | Own organization | Own organization | Yes |
| Reschedule appointment | Own | Not merely because assigned | Own organization | Own organization | Yes |
| Check in | Own | Assigned | Own organization | Own organization | Yes |
| Read full operational provider queue | No | Own provider | Own organization | Own organization | Yes |
| Read own queue information | Yes | As customer owner | As customer owner | As customer owner | Yes |
| Call next/start/complete/skip | No | Own provider | Own organization | Own organization | Yes |
| Mark urgent/register walk-in | No | Own provider | Own organization | Own organization | Yes |
| Manage service assignments/charges | No | No pricing-management entitlement | No | Own organization | Yes |
| Manage provider schedules | No | Own profile where permitted | No | Own organization | Yes |
| Manage services/members | No | No | No | Own organization | Yes |
| Organization analytics | No | Provider metrics only | No | Own organization | Yes |
| Submit review | Own completed appointment | If appointment owner | If appointment owner | If appointment owner | If appointment owner |
| Read/mark notifications | Own recipient records | Own | Own | Own | Own |
| Admin contact management/reply | No | No | No | No | Yes |

Additional verified boundaries:

- Customers need no organization membership to book.
- Core appointment detail and queue mutations use organization-scoped lookups and object checks.
- Booking service validates foreign provider/service combinations.
- Managers cannot remove/deactivate the last active manager through the inspected membership service.
- Adding an existing member allows STAFF/PROVIDER; updating membership accepts all membership role choices. Whether managers should promote another manager is an **owner decision**, not a demonstrated privilege-escalation defect.
- Frontend effective role comes from active selected membership, with platform administration taking precedence and CUSTOMER as fallback.

Verified exceptions/weaknesses:

- Public serializers expose private verification/review data: F-001.
- Global reconciliation mutates records outside the requested tenant: F-007.
- Any authenticated user can read provider leave reasons and schedule break titles through the inspected schedule endpoints: F-019.
- Database FKs do not independently guarantee every tenant relationship. Service-layer validation is the primary invariant.

## 7. Findings Register

### F-001 — Public discovery exposes verification and administrative metadata

**P1; high confidence; confirmed source exposure.**

Organization public GET uses `OrganizationSerializer`; `get_documents()` serializes all documents. `OrganizationDocumentSerializer` includes file URL, original filename, status, reviewer and rejection information. Public provider listing uses a serializer containing documents, user email and application reviewer email.

**Evidence:** `organizations/views.py:64–77`; `organizations/serializers.py:124–125,253–258`; `providers/views.py:80–124`; `providers/serializers.py:20–42`.

**Trigger/actual:** public organization/provider discovery includes fields intended for verification administration.  
**Expected:** public trust/profile data without private documents or reviewer metadata.  
**Affected:** organizations, providers, reviewers and public visitors.  
**Reproduction:** targeted serializer/API verification required; actual file-download accessibility was not tested.

### F-002 — Provider-document endpoints reference a nonexistent model field

**P2; high confidence; confirmed contract defect.**

Model field is `provider_profile`; list/upload/review use `provider`. Upload serialization also treats `provider_profile` as a client-required field instead of deriving it safely from the URL.

**Evidence:** `providers/models.py:124`; `providers/views.py:543,557,580`; `providers/serializers.py:12–15`; document review service’s `document.provider` access.

**Trigger/actual:** authorized document operations encounter invalid query/create/attribute references, or fail input validation first.  
**Expected:** consistent URL-scoped `provider_profile`.  
**Affected:** provider onboarding and manager review.  
**Reproduction:** focused endpoint tests required; no upload performed.

### F-003 — Newly registered inactive providers cannot submit their application

**P2; high confidence; confirmed permission mismatch.**

Registration creates inactive provider membership; own-provider permission requires active membership. Application view’s later `require_active_membership=False` cannot override the earlier permission rejection.

**Evidence:** `accounts/views.py:153–162`; `providers/permissions.py:37–43`; `providers/views.py:489–496`.

**Expected:** pending provider can manage their own application without acquiring operational privileges.  
**Affected:** newly registering providers.  
**Reproduction:** register/submit contract test required.

### F-004 — Failed provider registration can retain the newly created user

**P2; high confidence; confirmed transaction-control defect.**

User creation precedes organization lookup. Returning a 400 response inside the atomic block does not roll back the earlier user write.

**Evidence:** `accounts/views.py:131–149`.

**Trigger/actual:** syntactically valid but nonexistent/inactive organization; account remains despite registration failure.  
**Expected:** validate first or abort transaction on failure.  
**Affected:** new providers; subsequent registration retries.  
**Reproduction:** focused persistence assertion required.

### F-005 — Rescheduling bypasses booking capacity and eligibility checks

**P1; high confidence; confirmed source inconsistency.**

Rescheduling locks the provider but does not perform booking’s capacity check or equivalent operational/service-assignment revalidation. Explicit times are not bounded equivalently. Any overlapping leave blocks rescheduling, while booking accepts partial leave.

**Evidence:** `appointments/services.py:707–822`, compared with `492–616`.

**Trigger/actual:** move appointment to full-capacity date, inactive configuration or invalid working window.  
**Expected:** apply agreed date-booking invariants, excluding the appointment being moved from workload.  
**Affected:** customers and organization operators.  
**Reproduction:** focused full-capacity, leave and inactive-state tests required.

### F-006 — Cancellation/rescheduling can act on stale appointment state

**P1; medium confidence in race outcome; source-confirmed missing coordination, concurrency risk.**

Cancellation checks the passed appointment before its atomic writes and does not lock/refetch it. Rescheduling locks the provider but checks the stale passed appointment. Queue start/complete use fresh locked records.

**Evidence:** `appointments/services.py:714–723,832–852`; `queue/services.py:699–769`.

**Trigger:** cancel/reschedule overlaps check-in or consultation start.  
**Expected:** one consistent transition wins; the losing action rejects after refetch.  
**Possible actual:** overwrite a newer status or move an appointment whose queue lifecycle already progressed.  
**Affected:** customer/provider/staff operations.  
**Reproduction:** real PostgreSQL concurrent transactions required.

### F-007 — Request-triggered reconciliation is global and conflicts with overnight service

**P1; high confidence in source behavior; runtime outcome untested.**

Queue listing/call-next invokes a global past-date reconciliation. It includes IN_PROGRESS and marks linked appointments NO_SHOW. The appointment live-queue helper explicitly retains cross-midnight IN_PROGRESS service.

**Evidence:** `queue/services.py:255–256,282–283,396–422`; `appointments/serializers.py:16–23`; `tests/test_phase_a6_appointments_cleanup.py:181–213`.

**Trigger/actual:** access one provider’s queue after midnight; unrelated organizations’ old active entries can change, including ongoing consultations.  
**Expected:** deliberately scoped reconciliation consistent with overnight lifecycle.  
**Affected:** all operational tenants, especially cross-midnight consultations.  
**Reproduction:** two-tenant and overnight integration tests required.

### F-008 — Capacity’s time/leave semantics are incomplete and require policy approval

**P2; high confidence; policy gap, not an automatically established booking-policy bug.**

Capacity subtracts breaks but not partial leave or elapsed working time. Completed work no longer counts. Date-only booking can compute an end beyond closing time if total-day capacity remains.

**Evidence:** `appointments/services.py:278–326,591–616`; `appointments/models.py:33–38`.

**Trigger:** late-day booking, partial leave or several completed consultations.  
**Expected:** requires decision between total-day reservation capacity and remaining usable-day capacity.  
**Affected:** customers/providers.  
**Reproduction:** deterministic boundary tests after policy decision.

### F-009 — ETA ignores provider duration overrides and uses mutable duration data

**P2; high confidence; confirmed calculation mismatch, historical policy unresolved.**

Booking/capacity use effective provider-specific duration; ETA uses current base `Service.duration_minutes`. Capacity recalculates existing reservations using current assignment values. No explicit immutable duration field exists.

**Evidence:** `appointments/services.py:75–89,314–316,556`; `queue/services.py:467,501,579,617`.

**Trigger/actual:** custom duration or later duration change; ETA/workload no longer reflect the booking’s represented duration.  
**Expected:** one approved duration basis shared by booking/capacity/ETA.  
**Affected:** all forecast consumers.  
**Reproduction:** custom-duration and later-edit tests required.

### F-010 — ETA eligibility, check-in timing and readiness lack a single approved policy

**P2; high confidence; source-confirmed differences requiring product decisions.**

ETA includes unchecked-in reservations; call-next excludes them. Returned check-in opening metadata is not enforced. Low checked-in counts can produce GET_READY long before the expected service time. Future and today branches advertise different window offsets.

**Evidence:** `queue/services.py:301–310,464–480,587–638,665–669`.

**Affected:** customer arrival guidance and provider operations.  
**Expected:** distinguish reservation forecast from callable presence; explicitly approve window/readiness precedence.  
**Reproduction:** policy-driven table tests required. These differences are not all confirmed bugs.

### F-011 — Urgent mutation is not coordinated with call-next

**P2; medium confidence; concurrency risk.**

Urgent mutation does not acquire provider/entry locks; `_lock_entry()` is an ordinary lookup. Terminal entries can also be flagged urgent, although they remain ineligible for calling.

**Evidence:** `queue/services.py:337–349,839`; `queue/serializers.py:73`.

**Trigger:** urgent update overlaps call-next.  
**Expected:** agreed priority update ordering and state restrictions.  
**Possible actual:** call selection observes old priority.  
**Affected:** operators and waiting customers.  
**Reproduction:** PostgreSQL race test; reason/state policy decision first.

### F-012 — Provider walk-in UI omits required `provider_id`

**P1; high confidence; confirmed frontend/API contract defect.**

Form payload has no provider ID. Service posts it unchanged. Serializer requires `provider_id`, while view uses URL provider ID and ignores the body value.

**Evidence:** `frontend/src/pages/provider/ProviderQueuePage.jsx:25–32,169–175`; `frontend/src/services/queueService.js:76–80`; `backend/apps/queue/serializers.py:64`; `queue/views.py:130–138`.

**Actual:** normal UI request fails serializer validation before booking.  
**Expected:** URL-scoped walk-in request accepted; conflicting body IDs rejected if supported.  
**Affected:** provider walk-in workflow.  
**Reproduction:** endpoint test using exact frontend payload required.

### F-013 — Walk-in identity lookup assumes a nonunique phone is unique

**P2; high confidence in source condition; edge-case failure.**

`get_or_create(phone_number=...)` is used although phone numbers are not unique.

**Evidence:** `queue/services.py:369–379`; `accounts/models.py:18`.

**Trigger/actual:** multiple users share the phone; lookup can raise `MultipleObjectsReturned`. Equivalent local/international formats also represent different stored strings.  
**Expected:** explicit identity policy with safe ambiguity handling.  
**Affected:** front desk and shared-phone customers.  
**Reproduction:** duplicate-phone fixture required.

### F-014 — Legacy check-in does not persist allocated appointment serial

**P2; high confidence; confirmed persistence defect.**

The missing-entry branch assigns `appointment.serial_number`, but the later `save(update_fields=...)` excludes that field. Its maximum also considers queue entries alone.

**Evidence:** `queue/services.py:194–219`.

**Actual:** new queue serial can exist while appointment serial remains null; allocation can conflict with appointment-only history.  
**Expected:** persistent synchronized serial, using the established allocator.  
**Affected:** legacy appointments.  
**Reproduction:** legacy-null-serial test required.

### F-015 — Customer live queue requests an endpoint customers cannot access

**P2; high confidence; confirmed contract mismatch.**

The customer page requests full provider queue data and silently catches the expected denial.

**Evidence:** `CustomerLiveQueuePage.jsx:76–81`; `queue/permissions.py:43–61`.

**Actual:** repeated denied requests; unavailable contextual data.  
**Expected:** use owner-safe telemetry.  
**Affected:** customer live queue.  
**Reproduction:** focused authenticated customer contract test. Do not widen private operational permissions.

### F-016 — Frontend people-ahead presentation drops active consultation

**P2; high confidence; confirmed source mismatch.**

Backend `people_ahead` includes active service, but display utility substitutes checked-in/scheduled-ahead counts.

**Evidence:** `queue/services.py:609–611`; `frontend/src/utils/queueDisplay.js:40,218`.

**Trigger/actual:** active consultation plus zero checked-in waiters ahead; UI can display zero while backend reports one.  
**Expected:** display authoritative backend count or clearly label a different count.  
**Affected:** customer dashboards/live queue/details.  
**Reproduction:** focused utility fixture required.

### F-017 — Browser-local date can override backend temporal classification

**P2; high confidence in code; timezone-boundary risk.**

Frontend compares appointment date with browser-local today in addition to backend classification.

**Evidence:** `queueDisplay.js:9–21`.

**Trigger:** browser timezone differs from project timezone near midnight.  
**Possible actual:** backend-today appointment rendered as past/terminal.  
**Expected:** backend business-date classification remains authoritative.  
**Affected:** customers outside project timezone.  
**Reproduction:** timezone-controlled utility tests.

### F-018 — Schedule edits can invalidate existing breaks

**P2; high confidence; confirmed validation gap plus concurrency risk.**

Schedule upsert does not revalidate existing breaks when hours shrink or day becomes nonworking. Break overlap checks and creation are not serialized with schedule mutation.

**Evidence:** `providers/services.py:306–348`.

**Actual:** stored break outside working window, or concurrent overlapping breaks.  
**Expected:** coherent schedule/break validation under compatible locking.  
**Affected:** managers/providers and capacity calculation.  
**Reproduction:** shrink/nonworking fixtures and PostgreSQL write race.

### F-019 — Schedule endpoints expose internal leave/break information

**P2; high confidence; confirmed source exposure.**

Authenticated schedule/leave readers are not restricted to organizational operational roles, while serialized data includes break titles and leave reasons.

**Evidence:** `providers/views.py:319–329,435–445`; `providers/serializers.py:295,348`.

**Expected:** public/customer-safe availability projection; internal reasons restricted.  
**Affected:** providers and authenticated discovery users.  
**Reproduction:** ordinary-customer response test required.

### F-020 — Public service detail lacks listing’s approval requirement

**P2; high confidence; confirmed filter inconsistency.**

List enforces approved organization; detail lookup only requires active organization.

**Evidence:** `services/views.py:55,109`.

**Trigger:** known service ID under active unapproved organization.  
**Actual:** detail visibility differs from public operational listing.  
**Expected:** consistent approved-public policy, with authorized management access separately preserved.  
**Affected:** public discovery and pending organizations.  
**Reproduction:** pending/rejected organization detail tests.

### F-021 — Email outcomes are logged but discarded by callers

**P2; high confidence; confirmed observability limitation.**

Contact, admin reply and reset callers ignore `EmailSendResult`. Admin reply marks REPLIED before sending and does not persist reply text or send outcome. `_send()` returns success even if response lacks an ID, despite its result documentation.

**Evidence:** `contact/views.py:52–53,162–177`; `accounts/views.py:308–312`; `contact/models.py:15–35`; `contact/email_service.py:57–59,148–158`.

**Actual:** saved inquiry/reply status is not delivery proof; no stored acceptance/failure result for operators.  
**Expected:** honest persistence semantics and operator-visible failure/acceptance evidence.  
**Affected:** customers and admins.  
**Reproduction:** mocked failure/missing-ID tests; no live email needed.

### F-022 — Analytics routes and view signatures are inconsistent

**P2; high confidence; confirmed routing mismatch.**

The same URLs are mounted globally and under an organization. Some views require an organization kwarg absent globally; others do not accept the extra kwarg supplied by nested mounting. A frontend dashboard helper requests a nonexistent nested path.

**Evidence:** `config/urls.py:47–51`; `analytics/urls.py:9–14`; `analytics/views.py:28,48,63,101`; `frontend/src/services/managerService.js:80–83`.

**Actual:** affected authorized requests can fail dispatch or resolve incorrectly. The dashboard helper has no current caller found, so it is not evidence that the active manager dashboard is broken.  
**Expected:** explicit supported mounting/signatures.  
**Affected:** analytics consumers/operators.  
**Reproduction:** route resolution and permitted-request tests.

### F-023 — Some polling consumers lack stale-response protection

**P2; medium confidence; potential state synchronization defect.**

Customer live queue and staff queue polling clear intervals, but do not consistently abort/version requests. Notification polling swallows failures and can accept late results from the previous tenant.

**Evidence:** `CustomerLiveQueuePage.jsx:30–118`; staff queue fetching/polling; `NotificationBell.jsx:20–50`.

**Trigger:** slow requests overlap route/provider/tenant changes.  
**Possible actual:** stale data temporarily replaces current selection, or poll errors remain invisible.  
**Expected:** discard obsolete responses while preserving quiet normal background operation.  
**Affected:** customer/staff/notification UI.  
**Reproduction:** deferred-response frontend tests.

## 8. Fix Impact Assessment

All corrections below are **proposals only**.

### Exact existing test modules referenced

| Code | Module |
|---|---|
| T1 | `backend/tests/test_m11_security.py` |
| T2 | `backend/tests/test_phase5_hardening.py` |
| T3 | `backend/tests/test_phase_a8_organization_booking.py` |
| T4 | `backend/tests/test_phase_a952_provider_pricing.py` |
| T5 | `backend/tests/test_phase_a953_booking_snapshots.py` |
| T6 | `backend/tests/test_phase_a6_appointments_cleanup.py` |
| T7 | `backend/apps/appointments/tests/test_appointments.py` |
| T8 | `backend/apps/providers/tests/test_providers.py` |
| T9 | `backend/apps/organizations/tests/test_phase_e1_operational_guards.py` |
| T10 | `backend/apps/accounts/tests/test_password_reset.py` |
| T11 | `backend/apps/contact/tests/test_contact_api.py` |
| T12 | `backend/apps/contact/tests/test_admin_contact_api.py` |
| T13 | `backend/apps/contact/tests/test_email_service.py` |
| T14 | `backend/apps/analytics/tests/test_analytics.py` |
| T15 | `backend/tests/test_m6.py` |
| T16 | `frontend/src/utils/homeBookingDisplay.test.js` |
| T17 | `frontend/src/utils/availabilityDisplay.test.js` |

New test filenames mentioned below are proposed, not created.

### Correction scope, compatibility and database impact

| Finding | Smallest conceptual correction | Backend impact | Frontend impact | API/database impact |
|---|---|---|---|---|
| F-001 | Separate public serializers from operational verification serializers | Organization/provider views and serializers; document models unchanged | Public organization/professional pages consume safe fields | Intentional removal of private public fields; no migration |
| F-002 | Use `provider_profile` consistently; derive it from URL | Provider document views, serializer, review service | Provider/manager document upload/review service callers | Preserve URLs; remove redundant body requirement compatibly; no migration |
| F-003 | Separate own-application permission from operational eligibility | Provider permissions/application views | Provider registration/application pages | Same API; narrow pending-owner access; no migration |
| F-004 | Validate organization before user creation, or raise rollback-producing validation error | Account registration view/serializer | Provider registration error handling | Same response contract; no migration; inspect existing partial accounts before any cleanup |
| F-005 | Reuse approved eligibility/capacity checks, excluding moved appointment | Appointment service/reschedule serializer | Appointment detail reschedule UI | Existing request can remain; stricter invalid-state rejection; no migration |
| F-006 | Lock/refetch appointment and linked queue using common provider-first order | Appointment cancellation/rescheduling; queue transition services | Mutation error/refetch handling | Existing contract; possible new conflict response; no migration |
| F-007 | Tenant-scope reconciliation, coordinate locks and preserve approved overnight states | Queue service and request callers; live/temporal serializers | Queue/appointment refresh behavior | No schema change; lifecycle behavior changes require approved policy |
| F-008 | Implement approved capacity model consistently across availability/book/reschedule | Appointment capacity/schedule helpers | Availability display only | Prefer existing shape; no migration expected |
| F-009 | Centralize duration basis; use represented booking duration where trustworthy | Appointment workload and queue ETA | Forecast display consumers | No migration for custom-duration consistency; explicit duration snapshot requires separate justified migration decision |
| F-010 | Define reservation forecast versus callable queue and check-in/readiness precedence | Queue ETA/check-in; appointment action flags | Live queue and arrival guidance | Additive clarification fields preferable; no migration expected |
| F-011 | Provider-first lock, then fresh entry; validate state/reason policy | Queue urgent service/serializer | Provider/staff urgent forms | Preserve contract unless reason becomes required; no migration |
| F-012 | Make URL provider authoritative; accept omission and reject conflicting supplied ID | Walk-in serializer/view | ProviderQueuePage/queueService if needed | Backward-compatible optional redundant body ID; no migration |
| F-013 | Handle shared/ambiguous phones explicitly | Walk-in identity lookup; User usage | Walk-in identity selection/error UX if approved | No automatic unique constraint or account merge; schema need depends on owner policy |
| F-014 | Reuse allocator and save serial with linked entry | Legacy check-in branch | Legacy appointment display | No migration; existing mismatched rows may need separately approved repair |
| F-015 | Remove forbidden full-queue fetch; use owner-safe telemetry | Existing own queue serializer/view only if fields insufficient | CustomerLiveQueuePage/queueService | Prefer existing API; additive owner-safe telemetry if required; no migration |
| F-016 | Prefer backend `people_ahead` | None | queueDisplay and consumers | No API/schema change |
| F-017 | Trust backend business-date classification | None | queueDisplay and consumers | No API/schema change |
| F-018 | Validate existing breaks on schedule changes; serialize writers | Provider schedule/break services and validators | Schedule editor errors | Same API; no migration expected; inspect invalid existing records before repair |
| F-019 | Separate customer-safe schedule data from operational reasons | Provider schedule/leave views/serializers/permissions | Discovery schedule consumers | Public projection changes; operational contract preserved; no migration |
| F-020 | Apply consistent approved-public lookup with manager exception | Service views/query helpers | Public service details | Same route, intended 404/permission behavior; no migration |
| F-021 | Consume/log result coherently; distinguish saved/accepted/delivered; reject malformed acceptance response | Contact email service/views; password reset view | Admin reply feedback; generic reset wording | Public inquiry success preserved; persistence of attempt/reply history would require a separately justified schema addition |
| F-022 | Define valid global/nested routes and matching signatures; correct unused helper | Analytics URLs/views/permissions | managerService and real analytics callers | Preserve working routes; deprecated aliases if needed; no migration |
| F-023 | Abort/version obsolete requests and prevent overlapping application of results | None | CustomerLiveQueuePage, staff queue page, NotificationBell | No contract/schema change |

### Isolation, concurrency, tests and regression

| Finding | Tenant/concurrency assessment | Dependencies | Minimum future verification | Regression risk |
|---|---|---|---|---|
| F-001 | Tightens privacy; do not restrict legitimate manager documents | Public-field inventory | T1 plus new public serializer tests, including no documents/reviewer emails | **MEDIUM:** shared serializers |
| F-002 | Preserve URL ownership; no new lock architecture needed | F-003 for pending-owner end-to-end flow | T8 plus document list/upload/review contract tests | **LOW–MEDIUM:** onboarding |
| F-003 | Pending owner only; must not enable queue/booking operations | None | T8/T9: pending owner allowed, foreign owner denied, operations denied | **MEDIUM:** permission boundary |
| F-004 | No cross-tenant entitlement from lookup; atomic rollback | None | Registration test asserts zero partial writes after 400 | **LOW:** narrow sequence |
| F-005 | Revalidate tenant relationships; provider lock retained | Capacity/partial-leave decisions | T2/T3/T7: full target date, self-exclusion, inactive assignment, window bounds | **HIGH:** booking invariants |
| F-006 | Must coordinate with check-in/start and preserve lock order | F-005 transition design | T2/T7 plus real PostgreSQL cancel-vs-start and reschedule-vs-check-in races | **HIGH:** lifecycle/deadlock risk |
| F-007 | Restrict mutation scope; lock current rows before transition | Overnight/date-active policy | T6 + two-tenant reconciliation and midnight IN_PROGRESS tests | **HIGH:** historical lifecycle |
| F-008 | Capacity writers must share provider lock | Owner-approved capacity model | T3/T7: late-day, partial/combined leave, completion, zero remaining time | **HIGH:** capacity semantics |
| F-009 | Preserve assignment lock; avoid repricing/history fabrication | Duration historical policy | T3/T5 + custom-duration/edit-history ETA tests | **MEDIUM–HIGH:** forecasts/workload |
| F-010 | Owner-safe ETA; same ordering inputs where policy requires | F-009 and policy decisions | T2 plus focused check-in-window/readiness/unchecked-in reservation tables | **HIGH:** arrival guidance |
| F-011 | Provider→entry order consistent with call-next | Urgent reason/state policy | T2 + terminal urgency tests and PostgreSQL priority race | **MEDIUM:** queue selection |
| F-012 | Validate URL tenant/provider; never trust foreign body ID | None | T2 plus exact UI payload and conflicting-ID API tests | **LOW:** redundant input |
| F-013 | Identity reuse must not grant account access; concurrent creation needs consideration | Walk-in identity policy | T2: duplicate phone, blank phone, both accepted forms, simultaneous registration | **MEDIUM–HIGH:** customer identity |
| F-014 | Provider lock and both model maxima | Common allocator ownership | T2/T7: missing queue, null serial, occupied historical serial | **MEDIUM:** legacy data |
| F-015 | Keep operational queue private | Owner-safe telemetry inventory | T1 + customer page request contract/403 absence | **LOW–MEDIUM:** data fetching |
| F-016 | No authorization impact | Approved meaning of displayed count | New `queueDisplay.test.js`: active service plus zero waiting ahead | **LOW:** display calculation |
| F-017 | No authorization impact | Backend temporal contract | New queue display tests in multiple timezones; extend T16 where relevant | **LOW–MEDIUM:** temporal display |
| F-018 | Keep organization/profile ownership and provider-first locking | Schedule edit rejection/adjustment policy | T8: shrinking window, nonworking day, overlapping concurrent breaks | **MEDIUM:** schedule editor |
| F-019 | Tightens information boundary | Customer-safe schedule field definition | T1/T8: ordinary customer gets safe window, operators retain reasons | **MEDIUM:** discovery callers |
| F-020 | Management access must remain available for pending organization | Public operational policy | T9 + service list/detail approval tests | **LOW–MEDIUM:** visibility |
| F-021 | Admin-only failure detail; never reveal reset account existence | Meaning of REPLIED and desired audit persistence | T10–T13: missing ID, rejected send, both branches, generic reset response | **MEDIUM:** response semantics |
| F-022 | Every route must authorize its actual target org/provider | Supported route inventory | T14: each supported mount, foreign tenant denial, export scope | **MEDIUM:** route compatibility |
| F-023 | Reject old-tenant results; no permission widening | Stable API contracts | Deferred-response frontend tests; interval cleanup and terminal status coverage | **MEDIUM:** async state |

No Redis, Celery, WebSockets, payments or large state-management dependency is justified by these findings.

## 9. Recommended Fix Order

### Must fix before Project Brain

**No code fix is an absolute prerequisite for writing an honest Project Brain.** Its prerequisite is labeling current behavior, approved rules, future behavior and known limitations separately.

Before documenting disputed rules as approved guarantees, obtain decisions on capacity, duration, ETA/check-in, overnight activity and walk-in identity.

### Small independently verifiable batches

1. **Privacy boundaries:** F-001, F-019, F-020.  
   These should precede public production exposure.

2. **Broken narrow workflows:** F-002, F-003, F-004, F-012.  
   Establish correct onboarding and walk-in contracts without queue redesign.

3. **Lifecycle integrity:** F-007, then F-005/F-006 and F-014.  
   Approve overnight/reschedule policy first; establish lock/refetch behavior before frontend status cleanup.

4. **Availability and forecast policy:** decisions → F-008/F-009 → F-010.  
   Avoid making ETA “agree” by accidentally changing the booking model.

5. **Priority coordination and identity:** F-011, F-013.  
   Independent small batches after their product decisions.

6. **Frontend contract accuracy:** F-015–F-017, F-023.  
   Owner-safe telemetry and stable backend semantics precede presentation refinements.

7. **Schedule, analytics and email reliability:** F-018, F-022, F-021.  
   Keep each separately reviewable.

### Before UI redesign

Resolve or explicitly freeze the contracts affected by F-005–F-010 and F-015–F-017. Otherwise redesigned screens may encode inaccurate capacity, readiness or historical-duration assumptions.

### Can be documented/deferred

- Separate-phone booking UX not established.
- No server-side booking idempotency contract.
- Durable email attempt/reply history.
- Dedicated duration snapshot, pending owner decision.
- True concurrent PostgreSQL test coverage.

Deferring these does not mean asserting they are implemented.

## 10. Test Coverage Gaps

Coverage strength describes inspected assertion breadth, **not passing execution**.

| Domain | Assessment | Evidence and gap |
|---|---|---|
| Tenant-private appointment/queue access | **STRONG** | `test_m11_security.py` asserts foreign customer/org denials. Public serializer privacy remains uncovered by those assertions. |
| Pricing and price snapshots | **STRONG** | A.9.5.2/A.9.5.3 assert override/fallback, historical preservation and forged charge rejection. Lock-order test uses wrapped helpers, not concurrent transactions. |
| Contact snapshots | **STRONG** | Explicit contacts, trimming, profile unchanged, mutable-user fallback behavior inspected. |
| Normal serial/QueueEntry creation | **STRONG** for sequential behavior | `test_phase5_hardening.py:110–128` asserts matching serials 1/2. |
| Real concurrency | **NOT FOUND** for simultaneous PostgreSQL execution | Inspected tests check sequence or SQL locking, not competing transactions. Some lock assertions skip when unsupported. |
| Availability/capacity | **PARTIAL** | A.8 asserts working time minus break capacity; partial leave, late-day and reschedule full-date cases missing. |
| Rescheduling | **PARTIAL** | Hardening test asserts new-date serial allocation; no capacity/eligibility parity proof. |
| Call-next/lifecycle | **PARTIAL** | Sequential “one active” and normal transition tests; cancellation/start races missing. |
| Overnight service | **WEAK** | Existing assertion checks `_get_is_live_queue`; does not invoke reconciliation or past-date ETA. |
| Urgent | **PARTIAL** | Normal ordering assertions; concurrent priority change and terminal-state policy gaps. |
| Walk-in | **PARTIAL** | Direct service success asserted; frontend-shaped API request not covered. |
| Legacy check-in | **WEAK** | Missing-entry/null-serial persistence gap needs a dedicated assertion. |
| ETA/readiness/check-in windows | **PARTIAL** | Near-time/future tests exist; custom duration, unchecked-in forecast and window boundary policy not comprehensively asserted. |
| Schedule mutations | **PARTIAL** | Break overlap creation tested; shrinking an existing schedule and concurrent writers not covered. |
| Provider application/documents | **WEAK** for problematic paths | Need pending-owner and actual document upload/review contracts. |
| Reviews | **STRONG** for core eligibility | Completed ownership and duplicate prevention inspected in `test_m6.py`; no live execution. |
| Notifications | **PARTIAL** | Repeated check-in notification assertion; tenant-switch polling races missing. |
| Email | **STRONG** for mocked caller/failure behavior | Contact tests assert 201 after mocked send failure; reset test asserts generic 200. These do not prove Resend delivery. |
| Analytics mounting | **PARTIAL** | Existing analytics module does not establish all root/nested signature combinations. |
| Frontend booking state | **PARTIAL** | Source has revision/cleanup guards; scenario-level automated coverage not established. |
| Frontend queue display | **WEAK** | No `queueDisplay.test.js` found; existing availability/home display tests cover different helpers. |

The pytest configuration uses `--nomigrations`, and settings select SQLite for pytest. Consequently, ordinary test execution would not establish migration application or PostgreSQL row-lock behavior. Future verification must explicitly select the appropriate database/workflow for concurrency cases.

## 11. Project Brain Readiness

| Proposed document | Verified information available | Missing decisions/evidence | Rules safe to document | Inaccuracies to avoid |
|---|---|---|---|---|
| `AGENTS.md` | Repository layout, frontend/backend boundaries, protected identifiers, targeted-test approach | Durable owner-approved workflow/approval policy | Preserve serial architecture, central pricing and tenant permissions; inspect current working tree | Treating historical prompts as permanent universal repository policy |
| `docs/PRODUCT_ARCHITECTURE.md` | BR matrix, call chains, models, constraints, lock orders, channels, snapshots | Capacity/ETA/duration/overnight/identity decisions; runtime concurrency proof | Current source behavior plus explicit findings | “All transitions atomic and race-safe,” “all endpoints tenant-isolated,” “duration snapshotted” |
| `docs/UI_DESIGN_SYSTEM.md` | Theme tokens, public navigation, components, responsive CSS | Comprehensive app-wide component/visual inventory | Existing dark navy/teal and light warm-sand/espresso foundations | Declaring every operational dashboard visually verified |
| `docs/UI_REDESIGN_PLAYBOOK.md` | Shared route/service/context ownership and existing responsive/reduced-motion patterns | Approved priorities and acceptance standards | Reuse contracts; backend owns price/time/capacity; preserve operational destinations | UI redesign as a substitute for backend rule correction |
| `docs/UI_AUDIT_PLAN.md` | Existing routes and role surfaces; findings affecting UI contracts | Future role-specific browser evidence and runtime fixtures | Scoped audit matrix including loading/error/empty/permission states | Invented routes, fake customer data, claimed browser verification |

### Product-owner decisions required

1. Total-day reservation capacity versus remaining usable-day capacity.
2. Partial/combined leave treatment and reschedule parity.
3. Whether organization public hours should ever constrain provider booking.
4. Historical duration semantics and whether an explicit snapshot is needed.
5. Reservation forecast versus checked-in service-order ETA.
6. Same-day check-in eligibility versus an enforced arrival window.
7. Readiness precedence: time, physical queue counts and provider delay.
8. Whether yesterday’s active consultation blocks today’s call-next.
9. Walk-in identity when phones are shared, duplicated or differently formatted.
10. Urgent reason requirements and permitted states.
11. Rescheduling’s price policy—currently the existing snapshot is preserved.
12. Whether non-customer operational users may book for themselves through the public flow.
13. Whether REPLIED means recorded reply attempt, provider acceptance or delivery.
14. Whether repeated booking submissions need an idempotency contract.

Project Brain should retain these as unresolved decisions rather than resolve them silently.

## 12. Proposed Next Development Stages

1. **Accept this baseline and findings register.**  
   Separate confirmed defects, risks and policy questions.

2. **Approve critical fix plans and disputed business rules.**  
   Start with privacy and narrow broken contracts; plan lifecycle changes with focused PostgreSQL verification.

3. **Create Project Brain with documented limitations.**  
   It can begin before every fix is complete. Update it as approved corrections land.

4. **Perform app-wide UI audit against stable contracts.**  
   Inspect actual role routes, data ownership, loading/error states, responsiveness and accessibility.

5. **Undertake controlled UI redesign in small batches.**  
   Preserve backend serial, pricing, snapshot and tenant boundaries; verify only affected areas.

This sequence does not require new infrastructure, repository renaming or a broad refactor.

## 13. Repository Safety Confirmation

This task was read-only.

- No source, configuration, environment or documentation files modified.
- No Project Brain files created.
- No database reads through application execution, writes, reset or seeding.
- No migrations created or run.
- No tests, builds, browser automation, live API requests or email sends.
- No packages installed or updated.
- No commit, push or prohibited Git commands.
- No secrets or private email addresses exposed.
- Existing QueueTurn rename work preserved.

Final state remains:

- Branch: `main`
- Modified tracked files: **42**
- Staged files: **0**
- Untracked files: **0**
- Diff: **111 insertions, 111 deletions**

The tracked working-tree SHA-256 remained:

`3e87cb0d024e18b96bd070fd05990d8c592a5543bbb0c843769ecae4b73a0875`

Protected technical identifiers—including `smartqueue_db`, `smartqueue_theme`, `SMARTQUEUE_SUPPORT_EMAIL`, `smartqueue_verified`, existing app labels, migrations, API paths and `sq_*`/`sq-*` identifiers—require no rename.

## 14. Final Verdict

The source provides enough evidence to document the current architecture and core business rules. It does not justify claiming complete runtime correctness, universal tenant isolation or proven concurrency safety.

There is no blocking condition for an explicitly qualified Project Brain. Public privacy and lifecycle defects should be prioritized before production exposure; unresolved policies must remain clearly labeled.

**BUSINESS RULE BASELINE: PARTIALLY VERIFIED**

**READY FOR PROJECT BRAIN: YES WITH DOCUMENTED LIMITATIONS**