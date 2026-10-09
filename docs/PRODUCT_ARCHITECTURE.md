# QueueTurn Product Architecture

## A. Metadata, authority and maintenance

- **Identity:** QueueTurn — Multi-Tenant Appointment & Queue Management Platform. Tagline: Book a serial. Arrive smarter. Wait less.
- **Phase/date:** Project Brain Phase 3, 2026-10-09.
- **Source baseline:** `main`, HEAD `4a9920c3a648c2925dc30956005a1c28a015918f`; existing Phase 2 documentation was untracked at inspection. No application changes accompany this document.
- **Inputs:** [Historical handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md), [prior baseline assessment](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md), completed Phase 1 evidence mapping, all three Phase 2 canonical documents and current source. Historical/prior-audit claims are evidence, not automatically current behavior.
- **Evidence precedence:** executable source; model constraints/migration declarations; inspected test assertions; canonical terminology; historical intent; prior audit; explicit owner decisions for pending policy.
- **Evidence legend:** S = SOURCE VERIFIED; T = TEST ASSERTION INSPECTED, NOT EXECUTED; H = HISTORICAL INTENT; D = DOCUMENTED, NOT VERIFIED; I = INFERRED; U = UNKNOWN. R = RUNTIME VERIFIED is reserved and unused here.
- **Limits:** No application imports/execution, database inspection, migration execution, tests, build, browser, servers, external requests or email sends. Configuration is not evidence of running infrastructure. Approximate source locations must be rechecked after source changes.

### Canonical ownership

| Document | Owns |
|---|---|
| [BUSINESS_RULES](BUSINESS_RULES.md) | BR-001–BR-062, C-01–C-18 index, D01–D20 policy register and terminology |
| [QUEUE_STATE_MACHINE](QUEUE_STATE_MACHINE.md) | Exact linked lifecycle, declarations versus workflows, ETA formulas and branch precedence |
| [ROLE_PERMISSION_MATRIX](ROLE_PERMISSION_MATRIX.md) | Method/resource/actor authorization and tenant exceptions |
| PRODUCT_ARCHITECTURE | Technical structure, relationships, data flows and implementation boundaries |
| [KNOWN_ISSUES](KNOWN_ISSUES.md) | Canonical detailed F-001–F-023 records, historical crosswalk and unpromoted candidates |

Architecture/issues documents were planned at Phase 2 creation and now exist. The post-Phase-5 cleanup clarified active navigation in the Phase 2 documents while preserving that creation-time provenance. Update this architecture after a separately authorized change by inspecting affected models, services, projections, clients and tests together. Record the new source baseline and verification evidence; do not turn proposed policy or an enum into an implemented workflow.

## B. System overview

S: Django and DRF implement a modular backend under `backend/apps/`, with a configured relational database and HTTP REST boundaries. The default non-test database engine is PostgreSQL. React/React Router render the frontend; Vite builds and serves it; Axios connects to the API. JWT authenticates global accounts; organization memberships, resource ownership, permissions and scoped lookups authorize actions.

The tenant is Organization. Customer ownership is global User identity, not a mandatory organization membership. ProviderProfile belongs to a membership, and operational data relates to an organization/provider/date. Customers reserve a serial; working hours and capacity constrain availability rather than assigning a guaranteed consultation start. Queue telemetry is computed from database state and consumed through frontend polling.

Sources: `backend/config/settings/base.py`, `backend/config/urls.py`, `frontend/package.json`, `frontend/src/api/client.js`. WSGI/ASGI entry points exist, but no inspected application path establishes a Celery/Redis/WebSocket queue, payment settlement, commission system or provider-income ledger. Production topology, live DB state and deployed dependency versions are U.

## C. Repository responsibilities

| Repository-relative area | Responsibility |
|---|---|
| `backend/config/` | URL composition, settings variants, exception handling, WSGI/ASGI |
| `backend/apps/accounts/` | Global User, JWT/auth, registrations, own profile, reset |
| `backend/apps/organizations/` | Tenant/membership/invitations, verification, credentials, operating hours |
| `backend/apps/services/` | Tenant Category/Service catalog |
| `backend/apps/providers/` | Professional profiles, applications/documents, assignments/pricing, schedules/breaks/leave |
| `backend/apps/appointments/` | Reservation model, booking/availability/reschedule/cancel, snapshots, customer reads |
| `backend/apps/queue/` | Presence, selection, lifecycle, telemetry, historical reconciliation |
| `backend/apps/notifications/`, `feedback/`, `audit/` | Recipient notifications, appointment reviews, operational audit records |
| `backend/apps/contact/`, `analytics/` | Public inquiries/admin support/email wrapper; scoped operational aggregates |
| `backend/apps/*/models.py` | Persistence declarations, relationships, local constraints; not complete cross-tenant security |
| `backend/apps/*/services.py` | Domain operations where present; contact sends live in `contact/email_service.py`, hours in `organizations/operating_hours.py` |
| `backend/apps/*/serializers.py`, `views.py`, `permissions.py`, `urls.py` | Contract validation/projection, HTTP orchestration, authorization and routing where present |
| `backend/apps/*/migrations/` | Declared schema history; presence does not establish applied DB state |
| `backend/tests/`, `backend/apps/*/tests/`, `backend/pytest.ini` | Cross-domain and app-focused assertions/configuration |
| `backend/apps/accounts/management/commands/seed_demo_data.py` | Deterministic demo construction and scoped reset contract; not executed here |
| `frontend/src/routes/`, `contexts/` | Route families/UX guards; auth, tenant, theme and toast state |
| `frontend/src/pages/`, `components/` | Public discovery/auth and customer/provider/staff/manager/admin UI; shared shells/controls |
| `frontend/src/services/`, `api/client.js`, `utils/` | Resource requests, JWT persistence/refresh, presentation helpers and focused utility tests |
| `frontend/src/styles/index.css`, `frontend/src/styles/LandingPage.css` | Theme tokens and approved public-page styling; do not replace them as an architecture cleanup |
| `docs/`, `docs/references/` | Canonical brain and immutable historical/prior-audit inputs |

Wildcard rows describe a convention where files exist, not an assertion every app has every layer. No separate customer-role database model, per-tenant database, or immutable duration model is established by this map.

## D. Domain relationships and persistence

S: model declarations below; migration files declare historical changes. Neither source nor a migration file proves the current development/production database has applied them. Application validation remains necessary when related FKs belong to different tenants. Django model `clean()` is not automatically called by every ORM save.

| Model/source | Ownership and relationship | Important declared constraints, indexes and qualifications |
|---|---|---|
| `accounts/models.py::User` | Global account; memberships, appointments and notifications point to it | Email identity; `phone_number` is nonunique. Django flags differ from tenant roles. F-013 |
| `organizations/models.py::Organization` | Tenant root, approval/state, public profile/industry/contact fields | Verification state separate from active flag; related resources require requester entitlement and publication gates |
| `OrganizationMembership` | User FK + Organization FK; MANAGER/STAFF/PROVIDER and active flag | Unique user/organization; multiple tenants per User; active membership gates operations |
| `providers/models.py::ProviderProfile` | One-to-one membership; organization/user derived through it | Application state, profile-active flag, operational property; role validation in model/service. Operational eligibility is multi-field, not merely `is_active` |
| `services/models.py::Category` | Organization FK | Unique organization/slug; organization-scoped department/practice area, not a universal global category table |
| `Service` | Organization FK; nullable Category FK with PROTECT | Unique organization/name; positive duration; nonnegative Decimal(10,2) price; category tenant consistency requires application validation |
| `providers/models.py::ProviderService` | ProviderProfile FK + Service FK, assignment through model | Unique provider/service; nullable Decimal(10,2) nonnegative override including zero; nullable custom duration. Same-organization assignment is an application invariant, not enforced by FK equality |
| `appointments/models.py::Appointment` | Customer User, Organization and ProviderProfile FKs; Service FK PROTECT | Provider/date/serial unique; end > start; provider/date/serial, provider/window, provider/status, org/start and customer/start indexes. Date/serial nullable for legacy; required stored datetimes are forecast inputs, not fixed-slot promise |
| `queue/models.py::QueueEntry` | Organization/provider FKs; Appointment one-to-one | Provider/date serial/token uniqueness, positive-token constraint; provider/date/status and org/date indexes. Status, presence, urgency and readiness are different dimensions |
| `providers/models.py::WeeklySchedule` | ProviderProfile FK; actual class name (requested “ProviderWeeklySchedule” concept) | Unique provider/weekday; weekday 0–6; end > start; working-day flag. Provider overnight windows are not implied by organization overnight support |
| `ScheduleBreak` | WeeklySchedule FK | End > start constraint; within-window/overlap checks belong to services. No DB exclusion constraint for overlaps. F-018 |
| `ProviderLeave` | ProviderProfile FK; aware interval and internal reason | End > start; provider/start and provider/end indexes; leave clipping/union capacity policy unresolved |
| `organizations/models.py::OrganizationOperatingHours` | Organization FK; weekday, closed flag, nullable times | Unique org/weekday; request validation supplies weekday/time rules, no complete model check constraints for all combinations. Separate from individual schedules |
| `notifications/models.py::Notification` | Recipient User and required Organization FKs; nullable Appointment/QueueEntry SET_NULL links | Recipient/read/created and org/created indexes; recipient ownership drives reads, not org-wide manager authority |
| `feedback/models.py::Review` | Appointment one-to-one; organization/customer/provider FKs | Unique appointment and rating 1–5; org/provider created indexes. `clean()` and service require completed appointment, correct owner and matching tenant/provider |
| `organizations/models.py::OrganizationDocument`, `OrganizationCredential` | Organization FKs; nullable reviewing/verifying User links | Document org/status and credential public/status indexes; administrative document metadata differs from approved public trust fields |
| `providers/models.py::ProviderDocument` | FK named **provider_profile**, nullable reviewing User | Profile/status index; upload/review's `provider` references do not match this model (F-002) |
| `contact/models.py::ContactMessage` | Global inquiry, optional replying User; no tenant FK | NEW/IN_REVIEW/REPLIED/CLOSED; status/created index; no durable reply body/send outcome fields. Not an appointment or notification |
| `AppointmentIssueReport` | Appointment and customer FKs | PENDING/RESOLVED/DISMISSED; support workflow, not automatic lifecycle correction/refund |
| `audit/models.py::AuditLog` | Operational audit resource | Records domain action/actor/metadata; audit does not itself enforce authorization or transition correctness |
| `analytics/services.py::AnalyticsService` | Reads Appointment/QueueEntry and related operational sources | Aggregate projections, not a separate persistent analytics fact table or payment ledger |

Paths in this table are under `backend/apps/`. Invitations also belong to Organization, with token, creator and optional accepting User links; they are token-scoped onboarding, not a new operational role. Schema examples: `appointments/migrations/0003_appointment_unique_provider_date_serial.py`, `0004_booking_snapshots.py`; `queue/migrations/0004_queueentry_unique_provider_queue_date_serial.py`; `providers/migrations/0003_milestone3_constraints.py`; `organizations/migrations/0009_organizationcredential_organizationoperatinghours.py`. All relative migration examples are within their app's directory.

Snapshot declarations: `booked_service_charge` Decimal(10,2), `contact_name` CharField(300), `contact_phone` CharField(30), all nullable/blank for legacy. Migration 0004 adds only these fields, without fabricating historical values. No immutable booked-duration field exists. BR-025–BR-029.

## E. Authentication and tenant context

S: `accounts/urls.py` maps register/customer, manager/provider registration, login, token refresh, logout, me, change-password and password-reset/confirm. DRF defaults to JWTAuthentication and IsAuthenticated; public endpoints override permissions. SimpleJWT settings declare 60-minute access, one-day refresh, rotation and blacklisting. Installed-app declarations and logout implementation must be considered with those settings; these are not live token-lifecycle results.

`frontend/src/contexts/AuthContext.jsx` loads current User and owns login/logout/refresh. `TenantContext.jsx` filters active memberships, persists selected org and resolves effective role: platform flags first, selected active membership next, CUSTOMER fallback. A customer may select a public org without acquiring membership. `ThemeContext.jsx` persists theme independently. `api/client.js` attaches Bearer access, deduplicates refresh through a shared promise, retries once and dispatches `sq:auth:unauthorized` on failed refresh.

Backend authority is a combination of method-specific permission, URL-scoped resource lookup, queryset filters, object ownership and safe projection. Organization STAFF is not Django `is_staff`. Custom platform admin helpers accept `is_staff` or `is_superuser`; do not generalize that to every Django feature. Frontend RoleRoute/role-aware nav provides UX, never security. See [authorization matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

Public discovery and operational projections currently overlap unsafely (F-001/F-019/F-020). Pending provider self-onboarding is blocked by the active-member gate (F-003); its relaxed resource loader runs too late. These are documented exceptions, not legitimate entitlement rules.

Source-name qualification (Phase 5 recheck, S): `backend/apps/providers/views.py` and `backend/apps/providers/urls.py` declare/map `ProviderProfileListCreateView`, `ProviderProfileDetailView` and `ProviderDocumentUploadView`. The role matrix correctly identifies the first two classes; its other related references are descriptive endpoint labels, not mismatched Python class names. The earlier naming-mismatch concern is not substantiated by the inspected source; permissions and projection findings remain unchanged.

## F. API composition and representative flows

S: `backend/config/urls.py` is the composition root. Below, **O** means `/api/v1/organizations/{organization_id}/`; UUID resources are tenant-scoped by views/services, not merely by URL appearance.

| Family | Declared composition and boundary |
|---|---|
| Authentication | `/api/v1/auth/` → `accounts/urls.py`; global credentials/token and own identity |
| Organization | `/api/v1/organizations/` → organizations URLs; public approved list/profile, member/catalog settings, verification/invitations/hours and admin organization actions |
| Catalog/providers | O categories/services/providers → corresponding app URLs; public discovery, assignment management, availability, profile, schedule/leave/application/docs |
| Appointments | O appointments collection/detail, cancel/check-in/resolve-issue; global customer dashboard/detail/report-issue routes in config root; owner/operator projections |
| Queue | O queue/my/, providers/{provider_id}/, call-next/, walk-in/, entry start/complete/skip/urgent; full queue is private operational data |
| Notifications/reviews/audit | O notifications/reviews/audit; global customer notifications/reviews; recipient, appointment-owner and operational boundaries differ |
| Analytics | O analytics/ and `/api/v1/analytics/` include the same analytics URLs; dispatch exceptions below |
| Contact/platform | `/api/v1/contact/` public inquiry; `/api/v1/admin/contact/` platform flags; `/admin/` Django admin. Organization STAFF is not platform support admin |
| Documentation | `/api/schema/`, `/api/docs/`, `/api/redoc/` declared schema/UI endpoints; schema title QueueTurn API |

### Booking flow

`BookAppointmentPage.jsx` → `appointmentService.getAvailability` → O providers/{provider_id}/availability/ → `ProviderAvailabilityView` / `AvailabilityQuerySerializer` and permission → `AppointmentService.get_available_slots` → tenant/provider/service/schedule/workload queries → date/capacity response → current selection/date availability state. This preview is advisory; booking repeats server validation.

Review modal → `appointmentService.bookAppointment` → O appointments/ POST → `AppointmentListCreateView` / `AppointmentCreateSerializer` / `CanCreateAppointment` → `AppointmentService.book_appointment` → Appointment + QueueEntry + notifications/audit → appointment serializer → returned snapshots/serial shown by UI. View forces authenticated customer and online/scheduled semantics; client charge is not authoritative.

### Operational queue flow

`ProviderQueuePage.jsx` or `StaffQueuePage.jsx` → `queueService.callNext` → O queue/providers/{provider_id}/call-next/ → `CallNextQueueView` / operator permission → `QueueService.call_next` → scoped eligible selection and linked queue write → `QueueEntrySerializer` / computed readiness → refreshed command board. Start/complete/skip follow entry URLs and explicit service methods. Provider walk-in request fails its body contract before shared booking unless corrected separately (F-012).

### Public pricing, manager override and inquiry

Public organization/service UI → `organizationService`/discovery resource requests → organization/service/provider views → serializers → `providers/pricing.py` annotations/helpers → backend `starting_from_price` / `effective_customer_charge` → UI formatting only. Manager assignment PATCH → `ProviderServiceDetailView` → `ProviderService_.update_service_charge` → provider then assignment locks → custom_price source field → response/refetch. The service class is literally named `ProviderService_`; it is not a payment service.

`ContactPage.jsx` → `contactService.submit` / Axios → `/api/v1/contact/` POST → `ContactMessageCreateView` / `ContactMessageSerializer` and throttle → saved ContactMessage → two email wrapper calls → 201 response → submitted UI. No independent contact domain service mediates that write. Saving and response success do not certify email acceptance/delivery (F-021).

### Analytics dispatch exceptions — F-022

`analytics/urls.py`: summary/, providers/{provider_id}/metrics/, organizations/{organization_id}/dashboard/, export/. `ProviderMetricsView.get(request, provider_id)` and `AnalyticsExportView.get(request)` do not accept the nested mount's extra organization kwarg. Global `AnalyticsSummaryView.get(request, organization_id)` lacks that kwarg in its global summary route; nested summary provides it. Dashboard already contains its organization path, making nested composition redundant/ambiguous; test actual resolution rather than assume all mounts equivalent. Permissions still separately require owner/manager/admin scope. `managerService.js` contains an invalid nested dashboard helper with no current caller found; this alone does not prove the active manager dashboard fails.

## G. Booking implementation

S: `backend/apps/appointments/services.py::AppointmentService.book_appointment` (approximately 465–704), helpers `get_effective_duration_minutes`, `check_provider_date_capacity`, `validate_slot_against_schedule_and_blocks`; serializers/views own HTTP contract.

1. Public discovery narrows organization/service/professional; frontend cascades invalidation, preserves edited contact/notes and requires current date availability before review.
2. Organization eligibility and centralized `contacts.py::resolve_booking_contact` are resolved before the creation atomic block.
3. Inside atomic: lock/refetch **ProviderProfile first**; validate tenant, active PROVIDER membership/profile/application/org operational state; validate active same-tenant Service; lock/refetch **ProviderService assignment second** (`of=('self',)`, related Service).
4. Resolve authoritative Decimal with `pricing.py::effective_customer_charge` from the locked assignment. Null uses base price; zero remains zero. Copy it to booked_service_charge. Price is not determined by the caller.
5. Resolve effective custom duration using current assignment (truthy override) or base duration; validate project-local date/working schedule and leave. Legacy explicit datetime path additionally checks bounds, breaks/leave/overlap. Date-only path rejects a single full-cover leave but does not subtract partial leave from usable capacity.
6. Capacity is whole scheduled minutes minus breaks, less blocking appointment workload using current effective assignment durations. PENDING/CONFIRMED/CHECKED_IN/IN_PROGRESS block; COMPLETED/CANCELLED/NO_SHOW do not. D01/D02 and F-008 qualify late-day/leave semantics.
7. Stored date-only start is future schedule start or today's max(now, schedule start), not accumulated serial workload; end is start + effective duration. Customer books a serial, not this as a fixed consultation time.
8. Inside the same transaction calculate `max(Appointment serial, QueueEntry serial) + 1` for provider/date. Unique constraints support identity; canceled serials remain consumed.
9. Create Appointment with price/contact snapshots and QueueEntry WAITING with identical provider/date/serial/token. WALK_IN or FRONT_DESK marks checked-in and Appointment CHECKED_IN; ordinary online/scheduled is unchecked CONFIRMED. Channel does not determine ordering.
10. Create booking notifications/customer/provider and audit through services before returning. Rescheduling does not use this entire path; preserve that warning (F-005/F-006), and legacy check-in allocation differs (F-014).

Scope references: BR-016–BR-034; [capacity/duration decisions](BUSINESS_RULES.md#pending-business-policy-register) D01–D04. No payment, commission, amount-paid or settlement writes exist in this flow. Serial uniqueness is declared, but concurrent PostgreSQL safety was not tested here.

## H. Queue engine and lifecycle boundaries

S: `queue/services.py::QueueService` owns check_in_appointment, list_provider_queue, call_next, mark_urgent, register_walk_in, reconcile_stale_historical_queue_entries, calculate_readiness_and_eta, start_queue_entry, complete_queue_entry and skip_queue_entry.

Booking creates the QueueEntry; presence is separate. Check-in validates business date/operational resources, locks provider then fresh appointment, updates flag/time and linked status. Customer actor ETA eligibility occurs before already-checked return; actorless repeat tests do not prove owner HTTP idempotency (PF-001). Call Next picks checked WAITING entries whose appointments are CONFIRMED/CHECKED_IN, urgent first then serial; CALLED/IN_PROGRESS for the requested provider/date prevent another call. Calling is not starting service.

Explicit Start moves linked CHECKED_IN/CALLED to IN_PROGRESS; Complete moves both IN_PROGRESS to COMPLETED; Skip moves CALLED/CHECKED_IN to SKIPPED/NO_SHOW. No implicit auto-next/completion. Cancel is pre-check-in; reschedule changes date/window/serial and existing linked entry while retaining snapshots. SKIPPED→WAITING in the queue enum does not establish a complete restoration of terminal Appointment NO_SHOW.

Past-date reconciliation is invoked by queue listing/call-next, is global, includes IN_PROGRESS and writes SKIPPED/NO_SHOW without normal transition guards (F-007). This conflicts with overnight live-helper intent. No grace/recall/late-return/provider interruption policy is invented.

`calculate_readiness_and_eta` is read computation, not persisted readiness or notification generation. Terminal→future→past branches precede today's active/waiting logic; future/past NOT_YET and zero counts differ from historical nullable/INACTIVE examples. Forecast includes unchecked reservations; callable selection does not. Physical people_ahead includes another active service. ETA uses mutable base durations (F-009); opening metadata is advisory, not an enforced time gate (F-010). See [exact lifecycle and ETA](QUEUE_STATE_MACHINE.md), especially C-02/C-03/C-05–C-10/C-14/C-15/C-18.

## I. Transaction and concurrency map

S for control flow/locks; I for race consequences; U for actual concurrent outcomes. Paths abbreviated AP = appointments/services.py, QS = queue/services.py, PS = providers/services.py, under backend/apps.

| Operation | Transaction and row-lock order | Writes | Coordination qualification / finding |
|---|---|---|---|
| Booking | AP atomic; provider → assignment; serial query/creation within it | Appointment, linked queue, notification/audit | Ordinary org/service state not universally locked; all competing writers must coordinate; no PostgreSQL race evidence |
| Charge PATCH/delete | PS update_service_charge/remove_service_from_provider atomic; provider → assignment | Assignment override/delete | Same order as booking; helper assertion is not a concurrent mutation test |
| Check-in | QS atomic; provider → fresh appointment; existing queue ordinary read | Presence, appointment status, notifications/audit; legacy queue creation | Actor repeat qualification; legacy serial not saved F-014 |
| Call Next | Global cleanup before QS call atomic; provider → selected queue row | CALLED/timestamp, notification/audit | Active guard provider/date; uncoordinated cleanup F-007 |
| Start | Ordinary discovery, then QS atomic provider → fresh queue → appointment | Linked IN_PROGRESS/start timestamp, audit | State checked inside transaction; not entry-before-provider order |
| Complete | Same coordinating locks as Start | Linked COMPLETED/completed timestamp, notification/audit | Explicit operation; no auto-next |
| Skip | Same coordinating locks as Start | SKIPPED/NO_SHOW, skipped timestamp, notification/audit | Linked validation failure rolls back; return policy pending |
| Cancel | AP prechecks passed object; atomic writes, no provider/fresh appointment locks | Appointment/queue CANCELLED, reason, notification/audit | Stale mutation risk F-006 |
| Reschedule | AP atomic provider lock; passed appointment not refreshed/locked; ordinary queue query | Date/window/serial on appointment and existing queue | No full eligibility/capacity parity F-005; stale lifecycle F-006 |
| Urgent marking | QS atomic; `_lock_entry` is ordinary lookup, no row lock | Urgent flag/reason and audit | Race vs call selection; terminal flag/reason policy F-011/D10 |
| Reconciliation | QS atomic global direct writes, no row locks | Old queue SKIPPED, matching appointment NO_SHOW | Tenant/overnight/lifecycle coordination F-007 |

Atomic rollback, row locking, uniqueness and application validation are different safeguards. An atomic block does not refresh a stale Python object. A misleading helper name does not prove a lock. Sequential SQLite assertions cannot establish PostgreSQL mutual exclusion, deadlock freedom or correctness across legacy/uncoordinated writers. Concurrency verification must use a deliberately configured real PostgreSQL test database, not assume the default pytest path does so.

## J. Frontend ownership and routes

S: `frontend/src/routes/AppRoutes.jsx`, `RoleRoute.jsx`; `contexts/AuthContext.jsx`, `TenantContext.jsx`, `ThemeContext.jsx`; `api/client.js` and resource services.

| Route family | Existing responsibility |
|---|---|
| `/`, `/search`, `/professionals`, `/organizations` and organization service/provider detail paths, `/contact` | Marketing/discovery, public profiles and inquiry; approved landing UI is the visual benchmark |
| `/login`, `/register` and customer/manager/provider variants, `/forgot-password`, `/reset-password/:uid/:token`, invitation routes | Authentication/bootstrap/token onboarding |
| `/customer/dashboard`, `/customer/book`, appointments/detail, queue/:queueEntryId, notifications/reviews/favorites/saved-clinics | Owner bookings, snapshots, telemetry and personal discovery |
| `/provider/dashboard`, appointments/queue/services/schedule/reviews | Assigned operations and professional profile/service context |
| `/staff/dashboard`, queue/appointments/customers/providers/services/notifications | Front-desk operational views |
| `/manager/dashboard`, appointments/queue/services/providers/members/staff/reviews/analytics/audit/settings | Tenant management and assignment charges |
| `/admin/dashboard`, organizations/users/contact | Platform administration; `/profile` global own profile |

Role-aware dashboard aliases retain operational destinations. Legacy detail redirects contain literal placeholders (PF-002); canonical routes are separate. Standalone BookAppointmentPage uses guided Category→Organization→Service→Professional→Date→Review/confirm, explicit dependency reset and request consistency guards. Embedded storefront booking is a separate UI consumer of the same authoritative booking service. Contact fields are editable per-appointment and do not call profile updates.

CustomerLiveQueuePage polls owner resources but also tries a private full-provider queue and catches denial (F-015). ProviderQueuePage command/walk-in payload mismatch is F-012. StaffQueuePage and shared NotificationBell poll; clearing intervals alone does not invalidate late responses (F-023). `utils/queueDisplay.js` can substitute ahead counts (F-016) and browser-local date (F-017). These are source-qualified risks, not browser reproduction here. Theme tokens/styles and approved navbar/hero/rails/landing animations are unchanged; this document authorizes no visual refactor.

## K. Pricing, contact and history

S: `providers/pricing.py` is the centralized charge abstraction. `effective_customer_charge` and SQL Coalesce counterpart preserve zero and use base Service.price only for a null override. `eligible_pricing_assignments` requires approved/active org, provider/profile/application/membership, PROVIDER role, active service and same tenant; **pricing eligibility does not inspect date schedules/leave/capacity**. `with_starting_from_price`/`starting_from_price` take the eligible minimum, null if none. Frontend formatting must not recreate fallback/minimum logic.

Manager override updates change current assignment; booking snapshots freeze the resolved Decimal at creation. Later price edits do not rewrite an old Appointment. Authorized read serializers expose booked_service_charge/contact fields; customer-name/phone display properties prefer snapshots, falling back to mutable User for null legacy values. Null legacy price stays historically unknown rather than today's price posing as a past charge. Rescheduling currently retains snapshots; repricing policy is D11.

`appointments/contacts.py` trims explicit names, rejects blank/nonstring or >300; explicit phones accept `01[3-9]` plus eight digits or `+8801[3-9]` plus eight digits. Omitted name uses trimmed User full name or email, bounded to 300. Omitted phone copies trimmed nonempty profile phone unless it resembles the walk-in email placeholder; otherwise null. Fallback does not impose new profile phone validation. Explicit input does not mutate User/profile. Price/contact migration is nullable; no duration snapshot exists. Current effective duration in booking/capacity and base duration in ETA diverge (F-009/D04). Charge means customer-facing service charge, not provider income, settlement, payment status or amount paid.

## L. Availability, hours and business date

S: provider WeeklySchedule/Break/Leave and AP helpers define date capacity. Working schedules require end > start; breaks remove schedule minutes; current single full-cover leave rejects date booking. Partial/combined leave, elapsed-day and completed-work semantics require D01/D02. Schedule mutation can invalidate existing breaks (F-018). Historical fixed-slot helpers remain executable legacy paths, not the customer UI model.

Organization hours are independent public business hours. `organizations/operating_hours.py::organization_hours_status` uses project timezone, loaded weekday rows, previous-day overnight periods and closed-day override. Equal times or missing/invalid row do not imply 24-hour opening; `is_open_now: null` means Hours unavailable, not Closed. An overnight interval can extend into next day; explicitly closed next day truncates at midnight and overrides carryover. `update_organization_hours` atomically locks Organization before validated weekday upserts. This does not alter provider booking capacity. Coupling policy remains D03.

`TIME_ZONE` defaults Asia/Dhaka, USE_TZ true; queue helpers `current_business_date`/`business_date_for_appointment` and appointment timezone helpers govern backend dates. Serial scope is provider/date. Browser-local comparison in queueDisplay can disagree near midnight (F-017). Overnight organization display is not certification of overnight consultation handling (F-007/D08).

## M. Notifications, reviews, support and email

S: notifications belong to a recipient and organization, optionally an appointment/queue entry. Booking/check-in/call/complete/skip/cancel create supported notifications via services; readiness computation does not itself emit readiness-change events. Own-recipient filtering applies to tenant and global customer reads. Frontend NotificationBell polls; historical universal ten-second/readiness-event statements are not current guarantees.

Review creation in `feedback/services.py::create_review` requires completed owned appointment, matching tenant/provider and valid rating; one per appointment is declared. Public versus internal review projections and assigned-provider scopes differ, as documented in the role matrix. No fabricated testimonial/aggregate data is implied by this model.

ContactMessageCreateView validates/throttles, persists inquiry, then invokes admin notification and customer acknowledgement; return results are ignored. Admin recipient comes from `SMARTQUEUE_SUPPORT_EMAIL`; customer recipient from submitted inquiry email; sender from RESEND_FROM_EMAIL/NAME. Actual values/secrets are not inspected or published. Email wrapper skips missing config or catches/logs exceptions and returns EmailSendResult. `_send` nevertheless returns success without an ID, contrary to its docstring. Admin reply saves REPLIED/reply actor/time before sending and has no persisted reply body/outcome. PasswordResetRequestView retains generic response regardless of existence/send result; do not fix observability by account enumeration. Inquiry saved → attempt → provider acceptance → confirmed delivery are different facts (F-021/D13); none was live-verified here.

## N. Configuration, dependencies and deployment evidence

| Area | Source-configured / documented | Verification limit |
|---|---|---|
| Django settings | base + development/production; dotenv; PostgreSQL env fields/default; SQLite when USE_SQLITE, pytest module or test argv detected | No `.env` secrets/live connection queried; actual engine/schema/applied migrations U |
| Security | Development DEBUG/CORS-all; production secret/hosts validation, secure cookies/SSL/HSTS/CSRF origins | Not a deployed security certification; don't reuse development allowances as production policy |
| Auth/API | DRF JWT/filter/schema/exception config; contact/reset throttle rates; FRONTEND_URL | No HTTP/refresh/throttle execution |
| Static/media | STATIC_ROOT/MEDIA_ROOT; DEBUG media URL helper; local Vite /media and /api proxy | Production file hosting/access controls U; public document URL serialization not download proof |
| Frontend | Vite React config; Axios VITE_API_BASE_URL with local fallback; VITE_API_DOCS_URL or derived docs URL | Build not run; installed browser/dependency behavior U |
| Dependencies | Root requirements includes Resend and pytest 8.4.2; backend requirements declares pytest 9.1.1 and omits Resend; package.json + lockfile define frontend | Declaration discrepancy is an unconfirmed environment lead, not an installed-version diagnosis or new F ID |
| Email/logging | Resend SDK wrapper uses process env; module logger reports skipped/failed/sent context; configured from display name | No live send, private inbox, provider logs or production logging destination inspected |
| Deployment | WSGI/ASGI entry points and gunicorn dependency; production settings exist | No verified production host, reverse proxy, container topology, worker fleet or scheduler inferred |

Sources: `backend/config/settings/base.py`, development.py/production.py, `requirements.txt`, `backend/requirements.txt`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/src/api/client.js`, `backend/apps/contact/email_service.py`. Installed versions, secrets and live environment are intentionally outside this phase.

## O. Test and verification architecture

T: backend app test modules and `backend/tests/` contain API/domain assertions. `backend/pytest.ini` selects development settings, `--nomigrations` and importlib mode. Base settings detect pytest/test argv and select in-memory SQLite. Ordinary execution therefore does not prove migration application or PostgreSQL lock semantics; feature-dependent row-lock assertions can skip. No tests were executed in Phase 3.

| Inspected assertion area | Existing source / limitation |
|---|---|
| Booking/queue/serial | `backend/tests/test_phase5_hardening.py`; sequential guards; repeated check-in assertion omits actor |
| Booking hours/breaks/ETA | `backend/tests/test_phase_a8_organization_booking.py`; deterministic scenarios, not broad concurrency proof |
| Pricing/snapshots/hours | `backend/tests/test_phase_a952_provider_pricing.py`, `test_phase_a953_booking_snapshots.py`, `test_phase_a954_organization_hours.py`; centralized resolution and API assertions inspected, not rerun |
| Overnight helper | `backend/tests/test_phase_a6_appointments_cleanup.py`; live-helper assertion does not verify global reconciliation safety |
| Isolation/reviews/notifications | `backend/tests/test_m11_security.py`, `test_m6.py`; examples, not universal tenant certification |
| App tests | `backend/apps/appointments/tests/`, providers/accounts/contact/analytics tests; contract cases and email mocks exist |
| Frontend utility tests | `frontend/src/utils/recentAndFavorites.test.js`, `homeBookingDisplay.test.js`, `availabilityDisplay.test.js`; Node utility assertions, not a complete UI/polling/queueDisplay suite |
| Tooling | package scripts dev/build/lint/preview; no broad frontend test script declared |

Earlier reported build/browser/test success is D prior evidence, not R Phase 3 evidence. Future changes should run only affected tests, including authorized resolver/API projection tests, deferred-response UI tests and explicitly configured PostgreSQL race tests when locks matter. Documentation checks here validate consistency/paths/diffs, not runtime application correctness.

## P. Protected technical identifiers

Keep these stable unless a separate compatibility/infrastructure decision authorizes migration:

| Identifier | Purpose / compatibility boundary |
|---|---|
| `smartqueue_db` | Default DB name; renaming affects connectivity/data access |
| `smartqueue_theme` | Persisted theme preference |
| `SMARTQUEUE_SUPPORT_EMAIL` | Existing process configuration contract |
| `smartqueue_verified`, `get_smartqueue_verified`, `isSmartQueueVerified` | Backend trust response/helper and frontend consumer identifiers |
| `sq_access_token`, `sq_refresh_token` | Persisted auth tokens |
| `sq_selected_org_id` | Persisted selected-tenant convenience state |
| `sq_recently_viewed_orgs`, `sq_favorite_orgs`, `sq_pending_booking` | Existing discovery/booking browser-state keys |
| `sq:auth:unauthorized` | Client/context auth event |
| Existing `sq-*` CSS names | Styling/component compatibility, not visible product identity |
| Migration app labels/names/dependencies, established API paths | Persistence and client integration history |

BR-062 owns the protection rule. QueueTurn branding does not authorize a DB, key, import, migration or API rename. Internal legacy names are intentionally retained; this architecture phase changes none.

## Q. Risks and future verification

See [KNOWN_ISSUES](KNOWN_ISSUES.md#findings-index) for all baseline findings and evidence-qualified acceptance plans. Highest baseline priorities remain F-001/F-005/F-006/F-007/F-012; no P0 established. Main boundaries are public projection privacy, onboarding contracts, reschedule/capacity parity, stale lifecycle writes, global overnight cleanup, frontend payload/count/date/polling and support outcome visibility.

All D01–D20 remain [POLICY PENDING](BUSINESS_RULES.md#pending-business-policy-register); documentation does not choose remaining-day capacity, duration history, enforced arrival windows, skipped-return, provider-interruption or payment policy. PF-001/PF-002 remain candidates. Existing source gaps are not a claim of exploitation, actual stale UI overwrite, delivered email, applied migrations or universal race safety. UI Design Brain Phase 4 can document the approved visual baseline separately; it must not silently fix these issues or infer missing policy.
