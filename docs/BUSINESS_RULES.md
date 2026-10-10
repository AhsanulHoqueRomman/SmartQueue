# QueueTurn Business Rules

## Document metadata

- **Project:** QueueTurn — Multi-Tenant Appointment & Queue Management Platform.
- **Tagline:** Book a serial. Arrive smarter. Wait less.
- **Phase/date:** Project Brain Phase 2; 2026-10-09.
- **Scope:** Canonical product behavior, preserved BR-001–BR-062 registry, historical evolution, known deviations and pending owner decisions. This document does not implement fixes.
- **Source baseline:** `main`, commit `4a9920c`; application source unchanged from Phase 1 at inspection. Locations are approximate and symbols are the durable lookup keys.
- **Inputs:** [Original handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md), read completely; [baseline assessment](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md), read completely; completed Phase 1 conversation report; targeted current source inspection.
- **Verification:** Static source and inspected assertions only. No runtime/API/browser/database execution, tests, migrations or builds. No PostgreSQL concurrency or email-delivery certification.
- **Maintenance:** Preserve IDs. Update source behavior and policy classification together when an authorized change lands. Owner approval must be explicit before changing pending policy. Never convert a finding into an approved rule because code currently behaves that way.

### Evidence and policy classifications

**M1 closure update, owner approved 2026-10-10:** F-001/F-002/F-003/F-004/F-019/F-020 are CLOSED against the final uncommitted M1 source at `main` / `28b17dfd6c8e65e7854aa0359297acecb5b599e2`. [Canonical closure evidence](KNOWN_ISSUES.md#m1-closure-and-acceptance-evidence) records earlier authorized execution (191 backend passes, five frontend helper passes, frontend build), not new tests in this documentation phase. BR IDs, baseline severity and unrelated/pending business policies are unchanged. Private-document serving remains the separate OPEN [F-024](KNOWN_ISSUES.md#f-024) pre-production gate; role-dependent API schema documentation is OPEN [F-025](KNOWN_ISSUES.md#f-025).

Evidence: **S — SOURCE VERIFIED**; **T — TEST ASSERTION INSPECTED, NOT EXECUTED**; **H — HISTORICAL PRODUCT INTENT**; **D — DOCUMENTED BUT NOT VERIFIED**; **I — INFERRED, REQUIRES VERIFICATION**; **U — UNKNOWN**. **R — RUNTIME VERIFIED** is reserved for recorded execution and is unused here. T entries include the Phase 1 inspected assertions in unchanged test sources; they are not passing results.

Policy: **APPROVED / ESTABLISHED**, **CURRENT IMPLEMENTATION**, **KNOWN DEFECT**, **POLICY PENDING**, **DEPRECATED / LEGACY**, **NOT VERIFIED**. These are independent of evidence. Established entries below refer to explicit owner/handoff invariants, not implied approval of every implementation detail.

### Ownership and navigation

This file owns BR IDs, business definitions and D01–D20. [Queue state machine](QUEUE_STATE_MACHINE.md) owns exact transitions, locking and ETA formulas. [Role matrix](ROLE_PERMISSION_MATRIX.md) owns endpoint authorization and data projections. Their contradiction sections own detailed C explanations. [Product Architecture](PRODUCT_ARCHITECTURE.md) and [Known Issues](KNOWN_ISSUES.md), planned when Phase 2 was written, now exist and own technical architecture and detailed findings respectively.

## Product and business model

QueueTurn serves multiple industries whose professionals deliver services through a queue. Customers are global User accounts. A user may also hold an organization-specific membership; customer identity is not an organization-owned record or a stored CUSTOMER membership role.

An organization owns services and operational resources. A ProviderProfile belongs to a membership; ProviderService connects a professional to a service and can carry customer-facing price and duration overrides. Organization STAFF differs from Django `is_staff`.

The customer reserves a **provider/business-date serial**, not a guaranteed consultation start. Normal booking creates Appointment and QueueEntry transactionally. Booking presence and physical presence are separate: ordinary online booking is not check-in. Call Next selects eligible checked-in WAITING entries, urgent first and then serial, regardless of channel. CALLED differs from IN_PROGRESS; authorized operational start and completion are explicit actions.

The server resolves customer service charge and stores price/contact snapshots. They are not provider income, commission, payment status or amount paid. ETA and recommended arrival are advisory forecasts; duration expiry is not a service-completion event. Public business hours are evaluated separately from provider schedules/capacity. Authorization includes current exceptions documented in the role matrix; no blanket tenant-safety claim is made.

## Historical evolution

The handoff §§2,3,5,8–22 traces: **fixed-time slots → date-based serial booking → QueueEntry at booking → check-in-gated physical queue → explicit consultation lifecycle → dynamic ETA**.

Earlier 15-minute grids (and historical 30-minute discussions) are **DEPRECATED / LEGACY** product assumptions. The current customer booking page uses date-level capacity without a fixed consultation-slot grid. Legacy datetime input and a separately calculated `slots` list remain in backend source; their presence does not redefine the current product.

Online and front-desk paths use the shared queue. PHONE exists as a channel and historical intended workflow; a complete dedicated phone-booking endpoint/UX has not been established by this inspection. Do not equate an enum choice with verified end-to-end support.

## Domain glossary

| Term | Meaning |
|---|---|
| Organization | Tenant/business owning catalog and operations. |
| Customer | Global authenticated user in the booking-owner context; may also be an operator elsewhere. |
| Membership | User/organization relationship with MANAGER, STAFF or PROVIDER role and activity state. |
| Provider | Organization professional represented by ProviderProfile, not a global account role. |
| Provider service assignment | ProviderService relationship carrying optional price/duration source values. |
| Appointment | Reservation/business record with owner, provider, service, date, serial and snapshots. |
| QueueEntry | One-to-one operational record for an appointment; status and presence are separate. |
| Serial | Provider/date ordering identity, not guaranteed service time; urgency does not rewrite it. |
| Booking channel | ONLINE, PHONE or FRONT_DESK source metadata. |
| Arrival type | SCHEDULED or WALK_IN; independent of source channel. |
| Check-in | Presence flag/timestamp and supported appointment state update; not consultation start. |
| Call Next | Authorized selection and transition of eligible WAITING entry to CALLED. |
| Active consultation | Operational IN_PROGRESS service; CALLED also blocks another call for the date. |
| Urgent priority | Authorized priority flag ordered before normal serials, without active-service interruption. |
| Estimated start | Computed forecast or stored preliminary window; neither is a fixed-time promise. |
| People ahead | Backend physical count of checked-in predecessors plus another active entry; distinct from scheduled reservations ahead. |
| Recommended arrival | Advisory lead time before estimated service; not itself a check-in cutoff. |
| Readiness state | Computed customer guidance, distinct from operational status and persisted readiness field. |
| Business date | Date in project timezone, default Asia/Dhaka; not browser-local today. |
| Booked service charge | Decimal customer charge copied at booking; not payment/income architecture. |

## Business-rule registry

Each entry preserves its baseline title/ID and distinguishes business meaning from current implementation. Detailed lifecycle and authorization references are linked per rule. None establishes R evidence. Source paths are repository-relative.

### BR-001 — Customers are global users

- **Domain / business meaning:** Identity. Customers are global users.
- **Current implementation:** `User` has no organization-role field. Customer is not a stored membership role.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/accounts/models.py:8–18 — User`.
- **Related findings:** F-004, F-013.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-002 — Organization roles belong to memberships

- **Domain / business meaning:** Membership. Organization roles belong to memberships.
- **Current implementation:** `MANAGER`, `PROVIDER`, `STAFF`; unique user/organization membership. One user can participate in multiple organizations.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/organizations/models.py:133–168 — OrganizationMembership`.
- **Related findings:** F-003, F-004.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-003 — Platform privileges use Django flags

- **Domain / business meaning:** Administration. Platform privileges use Django flags.
- **Current implementation:** Permissions recognize `is_staff` or `is_superuser`. Separate from organization STAFF.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/providers/permissions.py:18–19; backend/apps/appointments/permissions.py — _is_admin`.
- **Related findings:** F-022.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-004 — Operational access uses target organization

- **Domain / business meaning:** Tenancy. Operational access uses target organization.
- **Current implementation:** URL organization and active membership determine access. Wrong-tenant assertions inspected in `test_m11_security.py`.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/appointments/permissions.py:11–155 — object permissions/filter_appointments_for_user`.
- **Related findings:** F-001, F-007, F-019.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-005 — Booking rejects foreign provider/service combinations

- **Domain / business meaning:** Tenancy. Booking rejects foreign provider/service combinations.
- **Current implementation:** Loaders and assignment query constrain resources to organization. ORM models alone do not enforce every cross-tenant FK relationship.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:492–525 — book_appointment; backend/apps/providers/models.py — is_operationally_active`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-006 — Public operational organization listing requires approval

- **Domain / business meaning:** Organization. Public operational organization listing requires approval.
- **Current implementation:** Organization public discovery requires active and APPROVED state. M1 service list/detail consistently require active service plus active APPROVED organization for public readers; own active manager/platform operational reads remain separate.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; F-020 publication mismatch CLOSED under M1. This does not certify every other related endpoint.
- **Source:** `backend/apps/organizations/views.py:73–77 — OrganizationListCreateView.get`.
- **Related findings:** F-020.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-007 — Organization hours are public business hours

- **Domain / business meaning:** Hours. Organization hours are public business hours.
- **Current implementation:** Evaluated separately from provider booking availability. Not currently a booking gate.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/organizations/operating_hours.py:10–85 — organization_hours_status`.
- **Related findings:** None directly mapped.
- **Pending decisions:** D03.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-008 — Unknown hours differ from closed hours

- **Domain / business meaning:** Hours. Unknown hours differ from closed hours.
- **Current implementation:** `is_open_now=None`, “Hours unavailable”. Frontend should retain this distinction. Unknown is not false: preserve is_open_now=null rather than presenting Closed Now.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/organizations/operating_hours.py:10–85 — organization_hours_status`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-009 — Overnight opening is supported

- **Domain / business meaning:** Hours. Overnight opening is supported.
- **Current implementation:** Earlier closing time implies next-day closing; explicit closed-day override applies. No holiday calendar found in this calculation. Organization overnight hours do not prove provider schedules or consultations have safe overnight lifecycle handling.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/organizations/operating_hours.py:10–85 — organization_hours_status`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-010 — Operational eligibility requires active approved state

- **Domain / business meaning:** Provider. Operational eligibility requires active approved state.
- **Current implementation:** Profile, membership and organization conditions apply. Booking additionally checks PROVIDER role.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:492–525 — book_appointment; backend/apps/providers/models.py — is_operationally_active`.
- **Related findings:** F-003.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-011 — Provider/service assignments are unique

- **Domain / business meaning:** Assignment. Provider/service assignments are unique.
- **Current implementation:** Unique provider/service constraint. Assignment required for booking.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/providers/models.py:205 — ProviderService.Meta`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-012 — Effective charge has one centralized rule

- **Domain / business meaning:** Price. Effective charge has one centralized rule.
- **Current implementation:** Non-null override, otherwise service price. Zero override is preserved.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/providers/pricing.py:9–52 — effective_customer_charge, eligible_pricing_assignments, starting_from_price`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-013 — Starting price uses eligible assignments

- **Domain / business meaning:** Price. Starting price uses eligible assignments.
- **Current implementation:** Database minimum of effective eligible charges. Eligibility excludes schedule/capacity considerations. Eligible price minimum excludes schedule, leave, capacity and queue state; it is not a date-availability promise.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/providers/pricing.py:9–52 — effective_customer_charge, eligible_pricing_assignments, starting_from_price`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-014 — No eligible assignment means no starting price

- **Domain / business meaning:** Price. No eligible assignment means no starting price.
- **Current implementation:** Aggregate returns null. Base price is not fabricated as a minimum.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/providers/pricing.py:9–52 — effective_customer_charge, eligible_pricing_assignments, starting_from_price`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-015 — Manager mutation follows provider-first locking

- **Domain / business meaning:** Price. Manager mutation follows provider-first locking.
- **Current implementation:** Provider lock, then assignment lock, inside transaction. Test wraps helpers; not a concurrent PostgreSQL test. Inspected helper-wrapper assertions establish intended lock order, not simultaneous PostgreSQL behavior.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/providers/services.py:265–302 — update_service_charge, remove_service_from_provider`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-016 — Weekly provider schedules determine working days

- **Domain / business meaning:** Availability. Weekly provider schedules determine working days.
- **Current implementation:** Missing/non-working schedule rejects availability. Individual schedule differs from organization hours.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:349–452,605–614 — AppointmentAvailabilityService.get_available_slots, book_appointment`.
- **Related findings:** F-005, F-018.
- **Pending decisions:** D01, D02, D03.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-017 — Breaks reduce daily capacity

- **Domain / business meaning:** Availability. Breaks reduce daily capacity.
- **Current implementation:** Scheduled minutes minus sum of break minutes. Assumes valid, non-overlapping breaks.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/appointments/services.py:278–325 — check_provider_date_capacity; backend/apps/appointments/models.py — BLOCKING_STATUSES`.
- **Related findings:** F-018.
- **Pending decisions:** D01, D02.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-018 — Full-day leave blocks date booking

- **Domain / business meaning:** Availability. Full-day leave blocks date booking.
- **Current implementation:** A leave covering the entire window rejects booking. Partial leave is not deducted from daily capacity. Historical handoff §6 explicitly requires partial leave to reduce usable capacity. Source currently checks a single full-window leave; interval-combination policy remains pending.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below); POLICY PENDING (see decisions).
- **Source:** `backend/apps/appointments/services.py:349–452,605–614 — AppointmentAvailabilityService.get_available_slots, book_appointment`.
- **Related findings:** F-005, F-008.
- **Pending decisions:** D02.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-019 — Active reservations consume workload

- **Domain / business meaning:** Capacity. Active reservations consume workload.
- **Current implementation:** PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS count. COMPLETED also releases counted workload. Completed appointments release counted workload. Total-day versus remaining usable-day semantics remain undecided.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/appointments/services.py:278–325 — check_provider_date_capacity; backend/apps/appointments/models.py — BLOCKING_STATUSES`.
- **Related findings:** F-005, F-008, F-009.
- **Pending decisions:** D01, D04.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-020 — Booking uses provider duration override when truthy

- **Domain / business meaning:** Duration. Booking uses provider duration override when truthy.
- **Current implementation:** Override otherwise base service duration. Zero duration is not a valid useful override.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/appointments/services.py:75–89,556 — get_effective_duration_minutes`.
- **Related findings:** F-009.
- **Pending decisions:** D04.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-021 — Date-level result is capacity-based

- **Domain / business meaning:** Availability. Date-level result is capacity-based.
- **Current implementation:** `is_available=has_capacity`. Legacy fixed-slot list is still computed independently. An empty legacy slots list does not by itself make the serial-date response unavailable.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below); DEPRECATED / LEGACY (legacy path/data only).
- **Source:** `backend/apps/appointments/services.py:349–452,605–614 — AppointmentAvailabilityService.get_available_slots, book_appointment`.
- **Related findings:** F-005, F-008.
- **Pending decisions:** D01, D02.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-022 — Backend uses project timezone

- **Domain / business meaning:** Time. Backend uses project timezone.
- **Current implementation:** Project timezone date and aware schedule boundaries. Default setting is Asia/Dhaka.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:66 — get_project_tz; backend/apps/queue/services.py:68–73 — current_business_date`.
- **Related findings:** F-017.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-023 — Customer books a serial through the current UI

- **Domain / business meaning:** Booking. Customer books a serial through the current UI.
- **Current implementation:** Date selection and capacity confirmation, no fixed-slot grid. Legacy datetime API remains supported.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; DEPRECATED / LEGACY (legacy path/data only).
- **Source:** `frontend/src/pages/customer/BookAppointmentPage.jsx:87–103,187–244 — dependency reset/review/submission`.
- **Related findings:** None directly mapped.
- **Pending decisions:** D12.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-024 — Creation is atomic

- **Domain / business meaning:** Booking. Creation is atomic.
- **Current implementation:** Provider and assignment locks precede creation. All competing writers must honor compatible locks.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:488–704 — AppointmentService.book_appointment`.
- **Related findings:** F-006, F-007 (other writers).
- **Pending decisions:** D14.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-025 — Server determines stored booking charge

- **Domain / business meaning:** Snapshot. Server determines stored booking charge.
- **Current implementation:** Central resolver called under assignment lock. Client cannot set authoritative charge. booked_service_charge is DecimalField(max_digits=10, decimal_places=2), nullable for legacy data. Do not substitute today's charge for an old missing snapshot.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:488–704 — AppointmentService.book_appointment`.
- **Related findings:** None directly mapped.
- **Pending decisions:** D11.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-026 — Contact details are appointment-specific

- **Domain / business meaning:** Snapshot. Contact details are appointment-specific.
- **Current implementation:** Explicit values or centralized user fallback. No profile writes. Explicit name is trimmed, nonempty and bounded to 300 characters. Omitted name uses trimmed full name or email, capped to 300; omitted phone uses trimmed existing phone unless absent/email-like, then null. No User/profile write.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/contacts.py:7–35 — normalize_contact_name, normalize_contact_phone, resolve_booking_contact`.
- **Related findings:** F-013.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-027 — Explicit phone accepts specified Bangladesh mobile forms

- **Domain / business meaning:** Contact. Explicit phone accepts specified Bangladesh mobile forms.
- **Current implementation:** Trim; validate local or `+880` mobile regex. Omitted existing phone is not newly validated. Explicit regex is (?:01[3-9][0-9]{8}|\+8801[3-9][0-9]{8}); no conversion between accepted forms. Omitted legacy/profile phone is not revalidated.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/contacts.py:7–35 — normalize_contact_name, normalize_contact_phone, resolve_booking_contact`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-028 — Missing snapshots stay nullable

- **Domain / business meaning:** Legacy. Missing snapshots stay nullable.
- **Current implementation:** Read name/phone fallback to user. Historical prices are not fabricated. Name/phone fallback applies when snapshot is null; it remains mutable legacy fallback, not proof of historical contact. Missing historical price remains unknown.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; DEPRECATED / LEGACY (legacy path/data only).
- **Source:** `backend/apps/appointments/models.py:98–109; backend/apps/appointments/migrations/0004_booking_snapshots.py — nullable snapshots/display properties`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-029 — No dedicated immutable duration snapshot exists

- **Domain / business meaning:** Duration. No dedicated immutable duration snapshot exists.
- **Current implementation:** Booking stores start/end; later calculations use current duration data. Historical-duration policy unresolved. Stored start/end are not a dedicated immutable effective-duration snapshot; do not imply they establish all historical duration calculations.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/appointments/models.py:86–100; backend/apps/appointments/services.py:314–316; backend/apps/queue/services.py:501,617 — mutable duration inputs`.
- **Related findings:** F-009.
- **Pending decisions:** D04.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-030 — Sequence belongs to provider/date

- **Domain / business meaning:** Serial. Sequence belongs to provider/date.
- **Current implementation:** Maximum across appointments and queue entries plus one. Starts at 1; canceled serials remain consumed. Maximum includes canceled records. Rescheduling to another date allocates a destination serial; same-date behavior preserves serial or uses its fallback.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/appointments/services.py:488–704 — AppointmentService.book_appointment`.
- **Related findings:** F-014.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-031 — Serial uniqueness is constrained

- **Domain / business meaning:** Serial. Serial uniqueness is constrained.
- **Current implementation:** Provider/date/serial constraints on both models. Provider lock serializes normal booking path.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/models.py:144; backend/apps/queue/models.py:111 — provider/date/serial constraints`.
- **Related findings:** F-014.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-032 — Queue entry is created during booking

- **Domain / business meaning:** Queue. Queue entry is created during booking.
- **Current implementation:** Same transaction, matching provider/date/serial. Not deferred until check-in.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/services.py:488–704 — AppointmentService.book_appointment`.
- **Related findings:** F-014.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-033 — Online API fixes source semantics

- **Domain / business meaning:** Channel. Online API fixes source semantics.
- **Current implementation:** ONLINE and SCHEDULED set by server. Source does not enter call-order selector.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/appointments/views.py:159–168 — AppointmentListCreateView.post`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-034 — Shared booking service handles front desk

- **Domain / business meaning:** Walk-in. Shared booking service handles front desk.
- **Current implementation:** FRONT_DESK/WALK_IN and automatic check-in. Direct-service tests do not prove UI endpoint contract. Shared service forwards entered contact snapshots; phone identity can be ambiguous. Source auto-checks when WALK_IN or FRONT_DESK, not only when both are set.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/queue/services.py:352–393 — register_walk_in; backend/apps/appointments/services.py:645–680`.
- **Related findings:** F-012, F-013.
- **Pending decisions:** D09.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-035 — Only current business date is accepted

- **Domain / business meaning:** Check-in. Only current business date is accepted.
- **Current implementation:** Date compared with project-local today. No enforced opening time window.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:128–219 — check_in_appointment; backend/apps/appointments/views.py:311 — actor forwarding`.
- **Related findings:** F-010.
- **Pending decisions:** D06.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-036 — Repeat check-in has actor-dependent return or rejection

- **Domain / business meaning:** Check-in. Repeated presence must not duplicate the queue entry or serial; current actor-aware rejection differs from an actorless idempotent return. This qualifies the baseline title without changing its ID.
- **Current implementation:** Qualification: customer actor validation calls calculate_readiness_and_eta BEFORE the already-checked return. can_check_in is false for checked-in entries, so the customer API can reject a repeat. The inspected test calls twice WITHOUT actor and asserts one notification. Safe rejection is allowed by handoff §9; unconditional customer API idempotency is not verified. PF-001 is only a candidate.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/queue/services.py:128–219 — check_in_appointment; backend/apps/appointments/views.py:311 — actor forwarding`.
- **Related findings:** PF-001 (candidate only).
- **Pending decisions:** D06.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-037 — Only eligible checked-in waiting entries can be called

- **Domain / business meaning:** Call-next. Only eligible checked-in waiting entries can be called.
- **Current implementation:** WAITING, checked-in, appointment CONFIRMED/CHECKED_IN. Unchecked-in reservations excluded.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/queue/services.py:287–310 — call_next`.
- **Related findings:** F-010.
- **Pending decisions:** D05.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-038 — Urgent precedes serial order

- **Domain / business meaning:** Order. Urgent precedes serial order.
- **Current implementation:** `-is_urgent`, `serial_number`. Booking channel is absent from comparator.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/queue/services.py:287–310 — call_next`.
- **Related findings:** F-011.
- **Pending decisions:** D10.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-039 — One active entry blocks call-next for that date

- **Domain / business meaning:** Active service. One active entry blocks call-next for that date.
- **Current implementation:** CALLED/IN_PROGRESS existence check under provider lock. Date-specific; true concurrency not tested. Active guard is provider/date-specific, not a proven cross-date one-active invariant. Global cleanup conflicts with overnight activity.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:287–310 — call_next`.
- **Related findings:** F-007.
- **Pending decisions:** D08, D18.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-040 — Urgent changes priority, not serial

- **Domain / business meaning:** Urgent. Urgent changes priority, not serial.
- **Current implementation:** Boolean/reason mutation and audit. Reason optional; no provider lock. Default reason is substituted when omitted. _lock_entry is an ordinary query here, not select_for_update.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:337–349,839 — mark_urgent, _lock_entry`.
- **Related findings:** F-011.
- **Pending decisions:** D10.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-041 — Start synchronizes appointment and queue

- **Domain / business meaning:** Start. Start synchronizes appointment and queue.
- **Current implementation:** CALLED→IN_PROGRESS; linked appointment→IN_PROGRESS. Provider→entry→appointment locking.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/queue/services.py:699–835 — start_queue_entry, complete_queue_entry, skip_queue_entry`.
- **Related findings:** F-006, F-007.
- **Pending decisions:** D20.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-042 — Completion synchronizes both models

- **Domain / business meaning:** Complete. Completion synchronizes both models.
- **Current implementation:** IN_PROGRESS→COMPLETED on each. Notification and audit created.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/queue/services.py:699–835 — start_queue_entry, complete_queue_entry, skip_queue_entry`.
- **Related findings:** F-007.
- **Pending decisions:** D19, D20.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-043 — Skipping a called customer records no-show

- **Domain / business meaning:** Skip. Skipping a called customer records no-show.
- **Current implementation:** Queue SKIPPED; appointment NO_SHOW. Does not automatically call next. NO_SHOW is terminal in Appointment declarations. A SKIPPED→WAITING QueueEntry declaration does not establish a complete restoration workflow.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:699–835 — start_queue_entry, complete_queue_entry, skip_queue_entry`.
- **Related findings:** None directly mapped.
- **Pending decisions:** D15, D16, D17.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-044 — Normal cancellation is pre-check-in only

- **Domain / business meaning:** Cancel. Normal cancellation is pre-check-in only.
- **Current implementation:** PENDING/CONFIRMED→CANCELLED and linked queue cancellation. Checks occur before transaction; race risk.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below); POLICY PENDING (see decisions).
- **Source:** `backend/apps/appointments/services.py:825–883 — cancel_appointment`.
- **Related findings:** F-006.
- **Pending decisions:** D20.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-045 — Past queue dates are reconciled on operational requests

- **Domain / business meaning:** Reconcile. Past queue dates are reconciled on operational requests.
- **Current implementation:** Active old entries→SKIPPED, appointments→NO_SHOW. Global scope and overnight problem. This is CURRENT IMPLEMENTATION and KNOWN DEFECT, not approved cleanup policy: global mutation includes past IN_PROGRESS and lacks coordinating row locks.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/queue/services.py:396–422 — reconcile_stale_historical_queue_entries`.
- **Related findings:** F-007.
- **Pending decisions:** D08, D17, D19.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-046 — Priority comparator resembles call-next

- **Domain / business meaning:** ETA. Priority comparator resembles call-next.
- **Current implementation:** Urgent/serial precedence reused in preceding-entry calculation. Eligibility population differs. Same priority comparator does not mean identical appointment-status or check-in eligibility population.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:425–692 — calculate_readiness_and_eta; backend/apps/queue/models.py:21–26 — ReadinessState`.
- **Related findings:** F-010.
- **Pending decisions:** D05.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-047 — Unchecked-in reservations influence forecast

- **Domain / business meaning:** ETA. Unchecked-in reservations influence forecast.
- **Current implementation:** All scheduled preceding WAITING entries contribute duration. Physical people-ahead counts checked-in entries plus active service.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:425–692 — calculate_readiness_and_eta; backend/apps/queue/models.py:21–26 — ReadinessState`.
- **Related findings:** F-010, F-016.
- **Pending decisions:** D05.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-048 — Active service uses elapsed-time subtraction

- **Domain / business meaning:** ETA. Active service uses elapsed-time subtraction.
- **Current implementation:** Remaining duration floored at zero. Uses base service duration. A zero remaining estimate neither changes status nor performs completion.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:425–692 — calculate_readiness_and_eta; backend/apps/queue/models.py:21–26 — ReadinessState`.
- **Related findings:** F-009.
- **Pending decisions:** D04, D19.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-049 — Stored concepts are NOT_YET, GET_READY, BE_READY, TURN_NOW, IN_SERVICE

- **Domain / business meaning:** Readiness. Stored concepts are NOT_YET, GET_READY, BE_READY, TURN_NOW, IN_SERVICE.
- **Current implementation:** Deterministic branches and terminal response labels. Threshold precedence needs product decision. Computed readiness is response data: this calculation does not save readiness_state or create readiness-change notifications. Raw past response is NOT_YET, while UI can derive inactive presentation.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:425–692 — calculate_readiness_and_eta; backend/apps/queue/models.py:21–26 — ReadinessState`.
- **Related findings:** F-010.
- **Pending decisions:** D07.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-050 — Returned window is advisory in current code

- **Domain / business meaning:** Check-in metadata. Returned window is advisory in current code.
- **Current implementation:** Available-at calculated, but `can_check_in` does not compare current time to it. Future and same-day metadata differ. Today metadata uses estimated start minus six hours; future metadata uses target start minus 45 minutes. Neither establishes an approved universal arrival window.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/queue/services.py:425–692 — calculate_readiness_and_eta; backend/apps/queue/models.py:21–26 — ReadinessState`.
- **Related findings:** F-010.
- **Pending decisions:** D06.
- **Lifecycle / authority:** [ETA and readiness](QUEUE_STATE_MACHINE.md#eta-and-readiness).

### BR-051 — Upstream booking changes invalidate downstream selections

- **Domain / business meaning:** Frontend state. Upstream booking changes invalidate downstream selections.
- **Current implementation:** Dependency reset plus request revision/cleanup. Contact edits and notes survive. Contact edits and notes survive upstream resets. Other polling consumers have separate stale-response risks.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `frontend/src/pages/customer/BookAppointmentPage.jsx:87–103,187–244 — dependency reset/review/submission`.
- **Related findings:** F-023 (adjacent polling risk, not this guarded reset).
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-052 — Review precedes API creation

- **Domain / business meaning:** Frontend confirmation. Review precedes API creation.
- **Current implementation:** Confirmation guard, authoritative selection payload, returned snapshots. No server-side idempotency key found. The UI double-submit guard does not prove retry idempotency across network retries or tabs.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `frontend/src/pages/customer/BookAppointmentPage.jsx:87–103,187–244 — dependency reset/review/submission`.
- **Related findings:** None directly mapped.
- **Pending decisions:** D14.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-053 — Notifications are recipient-owned

- **Domain / business meaning:** Notification. Notifications are recipient-owned.
- **Current implementation:** Organization plus recipient, or customer-wide recipient filter. Read/mark-all operations remain owner-scoped.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/notifications/views.py:23–25,62–64,88–90 — recipient filters`.
- **Related findings:** F-023.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-054 — Read marking is repeat-safe

- **Domain / business meaning:** Notification. Read marking is repeat-safe.
- **Current implementation:** Set `read_at` only when null. Frontend polls every 20 seconds.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/notifications/services.py:22–33 — mark_read; frontend/src/components/NotificationBell.jsx — polling`.
- **Related findings:** F-023.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### BR-055 — Only appointment owner may review completed service

- **Domain / business meaning:** Review. Only appointment owner may review completed service.
- **Current implementation:** Customer equality and COMPLETED status. Duplicate prevented by database relationship/constraint.
- **Evidence:** S / T / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/feedback/services.py:26–42; backend/apps/feedback/models.py — owner/completion/duplicate guards`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-056 — Verification indicator derives from backend approval

- **Domain / business meaning:** Trust. Verification indicator derives from backend approval.
- **Current implementation:** `smartqueue_verified` reflects organization status. Identifier must remain unchanged.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/organizations/serializers.py:186–194 — get_smartqueue_verified`.
- **Related findings:** F-001.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-057 — Successful submission means inquiry persisted

- **Domain / business meaning:** Contact. Successful submission means inquiry persisted.
- **Current implementation:** Save, attempt both emails, return 201. Does not prove email acceptance or delivery. 201 proves saved inquiry in source, not Resend acceptance/delivery. Both send functions are invoked sequentially; their results are discarded.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/contact/views.py:43–58,162–177 — ContactMessageCreateView, AdminContactReplyView; backend/apps/contact/models.py`.
- **Related findings:** F-021.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-058 — Admin and customer recipients have different sources

- **Domain / business meaning:** Email. Admin and customer recipients have different sources.
- **Current implementation:** Configured support inbox versus submitted customer email. No private values disclosed. Configured admin source is SMARTQUEUE_SUPPORT_EMAIL; acknowledgement recipient is submitted email. No address values are documented here.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/contact/email_service.py:67–74,115–158,172–242 — recipients, _send, send branches`.
- **Related findings:** F-021.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-059 — Failures are converted to results and logged

- **Domain / business meaning:** Email. Failures are converted to results and logged.
- **Current implementation:** Exceptions caught; `EmailSendResult(False)` returned. Callers discard results. Failure results are not consumed by callers; _send also reports success for a response without ID. Acceptance and delivery are different.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; KNOWN DEFECT (qualified below).
- **Source:** `backend/apps/contact/email_service.py:67–74,115–158,172–242 — recipients, _send, send branches`.
- **Related findings:** F-021.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-060 — Password-reset response avoids account enumeration

- **Domain / business meaning:** Reset. Password-reset response avoids account enumeration.
- **Current implementation:** Generic response regardless of account/send outcome. Delivery failure should be operator-visible, not account-revealing. Preserve generic outward response to avoid account enumeration; operator visibility is a separate requirement.
- **Evidence:** S / T; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION.
- **Source:** `backend/apps/accounts/views.py:291–313 — PasswordResetRequestView`.
- **Related findings:** F-021.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-061 — Reply status is saved before sending

- **Domain / business meaning:** Admin reply. Reply status is saved before sending.
- **Current implementation:** REPLIED and timestamps persisted; send attempted afterward. Reply body/send outcome not persisted in `ContactMessage`. REPLIED currently means saved reply metadata before send attempt. Reply body/send outcome are not persisted on ContactMessage; delivered is not established.
- **Evidence:** S; source qualification controls over an older report's wording.
- **Policy status:** CURRENT IMPLEMENTATION; POLICY PENDING (see decisions).
- **Source:** `backend/apps/contact/views.py:43–58,162–177 — ContactMessageCreateView, AdminContactReplyView; backend/apps/contact/models.py`.
- **Related findings:** F-021.
- **Pending decisions:** D13.
- **Lifecycle / authority:** [Backend permission matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

### BR-062 — Legacy identifiers remain intentional

- **Domain / business meaning:** Compatibility. Legacy identifiers remain intentional.
- **Current implementation:** Technical keys, app labels, API fields and paths retain existing identity. Not rename defects. All protected storage/config/API names listed below remain intentional compatibility details, not branding defects.
- **Evidence:** S / H; source qualification controls over an older report's wording.
- **Policy status:** APPROVED / ESTABLISHED (invariant); CURRENT IMPLEMENTATION.
- **Source:** `frontend/src/contexts/ThemeContext.jsx; frontend/src/contexts/TenantContext.jsx; frontend/src/services/tokenService.js; frontend/src/utils/recentAndFavorites.js — persisted identifiers`.
- **Related findings:** None directly mapped.
- **Pending decisions:** None directly mapped.
- **Lifecycle / authority:** [Lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

## Core business domains

### Identity, discovery and eligibility

BR-001–BR-011 separate global customer identity, active tenant membership, public publication and operational eligibility. Public listing approval does not establish private-field safety. Provider application status and membership activity are distinct gates. See [authorization](ROLE_PERMISSION_MATRIX.md#identity-and-role-model) and its current exceptions.

### Pricing, duration and capacity

BR-012–BR-021 and BR-029 distinguish two rules: **price fallback tests null**, preserving zero; **effective duration uses a truthy override**. `providers/pricing.py::effective_customer_charge` and its SQL expression are the authoritative charge abstraction. Starting price is an eligible-assignment minimum, not a provider/date-capacity calculation.

`appointments/services.py::check_provider_date_capacity` currently computes:

```text
usable_minutes = max(0, schedule_minutes - sum(break_minutes))
reserved_workload = sum(max(1, current_effective_duration) for blocking appointments)
has_capacity = usable_minutes - reserved_workload >= requested_effective_duration
```

Blocking statuses are PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS. Provider-specific duration is recalculated for existing workload; an exception falls back to stored start/end minutes, then 15 minutes. A single full-window leave blocks ordinary date booking; partial/combined leave and elapsed-day subtraction are not implemented in this capacity helper. Schedule edits can invalidate its break assumptions (F-018). Organization public hours are independent, not an implicit booking gate. Rescheduling does not apply this capacity helper (F-005). D01–D04 remain pending.

### Booking, serial and snapshots

BR-023–BR-034: contacts resolve before the booking transaction; provider lock then assignment lock coordinate eligibility and authoritative charge. The transaction checks date/schedule/capacity, takes the maximum across both serial stores plus one, creates both linked records, and creates booking notification/audit records. Cancellation does not reclaim serials. Database constraints and normal locking support the invariant but do not certify all competing writers.

`booked_service_charge` is nullable Decimal(10,2); `contact_name` is nullable max length 300; `contact_phone` nullable max length 30. They are appointment-specific. A subsequent provider price edit must not change an existing snapshot. Explicit contact differs from User without profile writes. Legacy missing price stays unknown; legacy contact display can use mutable User fallback. No dedicated immutable duration field exists. Current rescheduling preserves price/contact snapshots; D11 must precede any repricing change.

Channel and arrival type are separate dimensions. Online endpoint forces ONLINE/SCHEDULED; shared service auto-checks FRONT_DESK or WALK_IN. Walk-ins receive the next shared serial, not source priority. Shared-phone identity and frontend payload defects remain F-012/F-013; channel PHONE is not a verified dedicated creation experience.

### Presence, priority and operational lifecycle

BR-035–BR-045: same-business-date check-in does not assign a new serial for normal bookings, jump priority or start service. Actor-aware repeat behavior is qualified. Call Next excludes absent reservations, orders urgent then serial and rejects another active entry for that provider/date. Explicit start/complete synchronize records. Skip records NO_SHOW rather than a complete temporary-return policy. Cancellation, rescheduling, legacy serial repair and global historical cleanup have documented gaps. See [lifecycle workflows](QUEUE_STATE_MACHINE.md#lifecycle-workflows).

### Forecast and customer presentation

BR-046–BR-052: comparator agreement is not population agreement. Backend `people_ahead` differs from forecast reservation count. Booking durations and ETA base durations differ. Arrival/window metadata is advisory in current code; readiness thresholds are current implementation, not an approved universal rule. Review-confirm and dependency reset protect the current UI, not server retry idempotency. See [exact algorithm](QUEUE_STATE_MACHINE.md#eta-and-readiness) for branch-specific responses and frontend differences.

### Notifications, reviews, verification and email

BR-053–BR-061: notification records are recipient-owned; read marking is repeat-safe. Actual booking/call/check-in/completion/skip/cancel events create notifications in inspected services; the ETA calculation does not create readiness-change notifications. Reviews require owner plus COMPLETED and duplicate constraints. Verification derives from approval, but public document/reviewer exposure remains a defect.

Contact submission saves an inquiry, calls admin notification using configured support inbox and acknowledgement using submitted customer email, then returns 201 regardless of EmailSendResult. Password reset keeps a generic response. REPLIED is saved before its send attempt; no delivery guarantee or durable reply/send-outcome record is established. F-021 and D13 remain. Do not disclose secrets/private recipient values in documentation.

### Technical compatibility

BR-062 protects `smartqueue_db`, `smartqueue_theme`, `SMARTQUEUE_SUPPORT_EMAIL`, `smartqueue_verified`, `get_smartqueue_verified`, `isSmartQueueVerified`, `sq_access_token`, `sq_refresh_token`, `sq_selected_org_id`, `sq_recently_viewed_orgs`, `sq_favorite_orgs`, `sq_pending_booking`, `sq:auth:unauthorized`, existing `sq-*` CSS, Django app labels, migration identifiers, API paths and historical filenames. These are not automatic rename defects. The approved landing-page foundation is unchanged by this documentation.

## Established invariants and current deviations

| Established invariant | Current deviation / qualification | Registry |
|---|---|---|
| Serial-first booking; no promised fixed start | Legacy datetime/slots still exist; stored preliminary starts need not include cumulative reserved workload | BR-021,023; C-01,C-18 |
| QueueEntry at booking | Stale model docstring says check-in | BR-032; C-02 |
| Repeated presence must not duplicate queue/serial | Customer repeat can reject; inspected idempotency assertion omits actor | BR-036; C-03; PF-001 |
| Tenant/object privacy | M1 API projection/schedule redaction CLOSED; direct private-file serving remains pre-production gate; global cleanup exception remains open | BR-004; F-001/F-019 CLOSED, F-024/F-007 OPEN |
| Usable availability and valid rescheduling | Partial leave/reschedule capacity gaps; same-day budget pending | F-005,F-008,F-018; D01,D02 |
| Effective provider duration respected | ETA base duration/current historical workload; no dedicated duration snapshot | F-009; D04 |
| Check-in-gated urgent/serial calling | Reservation ETA population differs; urgent coordination incomplete | F-010,F-011; D05,D10 |
| Active service requires explicit valid completion | Global past-date cleanup can end legitimate overnight service | F-007; D08,D19 |
| Price/contact preserve booking truth | Legacy nulls are unknown; reschedule repricing undecided | BR-025–029; D04,D11 |
| Honest saved/attempted/accepted/delivered distinctions | Caller ignores email results; REPLIED saved before send | F-021; D13 |

## Pending business-policy register

Every row has status **POLICY PENDING**. None blocks honest documentation; each blocks choosing its affected policy during a fix without owner approval. Historical intent is explicitly labelled H and is not approval of a new algorithm.

| ID / topic | Current behavior | Historical intent | Neutral options | Risk | Decision gate |
|---|---|---|---|---|---|
| D01 — Capacity basis | Total scheduled time less breaks/active workload; no elapsed-day deduction | H §6 workload budget; exact same-day model unresolved | Total-day budget or remaining usable-day budget | Overbooking or unnecessary rejection | Before capacity fix/production |
| D02 — Partial/combined leave | Single full-window leave blocks; partial intervals not deducted | H §6 requires reduced usable time for partial leave | Define clipped union of leave/break intervals and overlap handling | Double subtraction or missing unavailable time | Before leave-capacity fix |
| D03 — Public hours/provider availability | Separate; public hours not booking gate | H §6 explicitly separate | Preserve independence or explicitly approve coupling | Valid provider bookings rejected silently | Before any coupling |
| D04 — Duration history | Booking custom duration; ETA current base; no dedicated snapshot | H provider duration respected; historical basis unresolved | Snapshot effective duration, represented interval, or approved current basis | Mutable history/forecast drift | Before duration architecture fix |
| D05 — Forecast population | Unchecked reservations affect ETA; only checked entries called | H forecast/order compatibility, not exact population | Reservation forecast, physical queue, or labelled dual metrics | Misleading arrival/counts | Before ETA contract change |
| D06 — Check-in timing | Same-day enforced; returned opening time advisory | H §9 warns against assumed six-hour restriction | Date-only, configured window, explicit exceptions | Rejecting valid arrivals | Before enforcement change |
| D07 — Readiness precedence | Count/time branches can prioritize low count over time | H §21 threshold examples differ | Time-first, count-first, combined policy | Premature/contradictory guidance | Before readiness fix |
| D08 — Overnight activity | Date guard; global cleanup includes past IN_PROGRESS | H §§13,26 protect legitimate ongoing service | Session-date ownership and deliberate cross-date guard/correction | False no-show or competing active service | Before cleanup fix/production |
| D09 — Walk-in identity | Nonunique phone get-or-create; entered contacts forwarded | H global identity; no approved matching policy | Explicit customer selection, contact-only identity, careful matching | Shared-phone account conflation | Before identity fix |
| D10 — Urgent reason/states | Optional reason; broad mutation; no provider lock | H authorized/auditable priority, no interruption | Required reason, permitted states, explicit overrides | Unaccountable priority/races | Before urgent safeguards |
| D11 — Reschedule price | Existing snapshots preserved | H preserve historical information | Preserve booked price or explicitly accepted repricing | Silent charge/history changes | Before repricing |
| D12 — Operator booking as customer | Backend allows authenticated self; frontend role routes differ | H global users may also hold membership | Support dual-purpose accounts or explicit restriction | Role/identity confusion | Before routing/access change |
| D13 — REPLIED semantics | Saved before send; no reply body/outcome persistence | H email context; no approved delivery equivalence | Attempted, accepted, delivered, separate states | False success/operator blind spot | Before email-state fix |
| D14 — Booking retry idempotency | UI guard only; no server key found | H uniqueness does not specify retry identity | Distinct requests or scoped idempotency | Duplicate bookings or false deduplication | Before retry protection |
| D15 — Missed-call grace | Manual skip; no verified timer | H §12 explicitly pending | Operator discretion or configured grace | Unsupported automatic no-show | Before missed-call automation |
| D16 — Return after skip | No linked restore; Appointment terminal | H §15 multiple options pending | Retain serial, later queue, new booking, manager restoration | Fairness/duplicate identity | Before re-entry feature |
| D17 — Late no-show cutoff | Same-date check-in; past cleanup | H §§14,28 explicit unresolved absence policy | Manual action or defined cutoff/closing reconciliation | Customer blamed for provider delay | Before no-show policy |
| D18 — CALLED timeout/recall | CALLED blocks another call; start/skip only | H §12 no established timeout | Manual resolution, recall or authorized release | Multiple active claims/false completion | Before timeout/recall |
| D19 — Abandoned IN_PROGRESS | Explicit completion; zero estimate does not complete | H §13 protects ongoing service; correction unresolved | Audited authorized correction/interruption/escalation | Fabricated completion or no-show | Before correction workflow |
| D20 — Provider unavailable/interrupted | Pre-check-in cancel/reschedule; no complete reassignment/interruption path | H §14 not automatically customer fault | Reschedule, reassignment, pause/interruption under explicit rules | Wrong customer fault/false completed service | Before feature/production |

Cancellation cutoffs/penalties and membership promotion authority are additional unresolved details from the references; they are not silently approved or assigned new decision IDs. No payments/refunds policy exists in this document.

## Contradiction index

All Phase 1 contradiction IDs are preserved. Detailed evidence is owned by the linked document; this index is not a replacement for those qualifications.

| ID | Topic | Canonical location |
|---|---|---|
| C-01 | Fixed slots vs serial architecture | This file, Historical evolution; state-machine contradictions |
| C-02 | Queue model comment vs booking creation | State-machine contradictions |
| C-03 | Repeat-check-in baseline overstatement | State-machine repeat check-in and contradictions |
| C-04 | Capacity/leave/reschedule divergence | This file, capacity; state-machine contradictions |
| C-05 | Booking vs ETA duration | State-machine ETA and contradictions |
| C-06 | Forecast vs callable population | State-machine ETA and contradictions |
| C-07 | Advisory vs enforced check-in window | State-machine ETA and contradictions |
| C-08 | Future/past raw API vs historical/UI labels | State-machine ETA and contradictions |
| C-09 | Historical readiness notifications vs pure calculation | State-machine contradictions |
| C-10 | Baseline calculate_eta name vs actual method | State-machine contradictions |
| C-11 | Intended privacy vs serializer/GET exposure | Role-matrix contradictions |
| C-12 | Walk-in UI vs required provider body field | Role-matrix exceptions; state-machine walk-in |
| C-13 | Frontend count/date vs backend telemetry | State-machine frontend transformations |
| C-14 | SKIPPED restoration enum vs linked terminal appointment | State-machine declared transitions |
| C-15 | Overnight active protection vs global cleanup | State-machine reconciliation |
| C-16 | Saved/replied/reset success vs delivery | This file, email semantics; role-matrix contradictions |
| C-17 | Historical finding namespace/severity vs baseline | This file, crosswalk |
| C-18 | Conceptual scheduled target vs stored booking window | State-machine booking and contradictions |

## Historical findings and candidates

C-17: Handoff §27 uses a historical 15-finding namespace and older severities. Baseline IDs/priorities control this documentation; no source finding is upgraded to P0. The mappings are F01→F-001, F02→F-002, F03→F-019, F04→F-003, F05→F-022, F06→F-005, F07→F-006, F08→F-007, F09→F-008, F10→F-009, F11→F-021, F14→F-020, F15→F-004. Historical F12 (dependency declarations) and F13 (literal redirects) have no exact baseline counterpart.

- **PF-001 — candidate, not accepted baseline finding:** actor-aware repeat check-in qualification. Source supports safe rejection; unconditional customer endpoint idempotency is not proven. See state machine.
- **PF-002 — candidate, not accepted baseline finding:** `frontend/src/routes/AppRoutes.jsx:158–159` contains legacy redirects with literal placeholders. Parameter preservation needs future verification; do not claim canonical routes are broken.

F-001, F-005, F-006, F-007, and F-012 are P1. All other findings in F-001–F-023 are P2. No P0 findings are established by the baseline. Risks are not reproduced runtime incidents.

## Proposed rule additions

These six proposals have **no permanent BR IDs** and are not approved new policies:

1. Explicit destination eligibility/capacity invariant for rescheduling.
2. Estimated duration expiry must not itself complete or interrupt consultation.
3. Model transition declaration is not proof of an implemented linked workflow.
4. Computed readiness, persisted readiness and notification events are distinct.
5. Appointment issue reporting is not an automatic lifecycle correction.
6. Pending-provider onboarding needs an explicit narrow authorization rule.

## Evidence and maintenance limitations

Source evidence does not certify endpoint execution, current database contents, PostgreSQL row-lock behavior, Resend acceptance/delivery, browser behavior or accessibility. Prior tests are assertion evidence only. Baseline pytest configuration uses `--nomigrations` and SQLite selection, so even ordinary later pytest runs cannot alone prove development migrations or PostgreSQL concurrency.

Relevant unexecuted assertion sources: `backend/tests/test_phase5_hardening.py` (sequential serials, active guard, actorless repeat check-in); `backend/tests/test_phase_a8_organization_booking.py` (break capacity); `backend/tests/test_phase_a952_provider_pricing.py` (charge/minimum, wrapped lock helpers); `backend/tests/test_phase_a953_booking_snapshots.py` (price/contact history); `backend/tests/test_phase_a954_organization_hours.py` (hours boundaries); `backend/tests/test_m11_security.py` (private tenant denial); `backend/tests/test_m6.py` (reviews/notifications); contact and account-reset app tests (mock outcomes).

Before changing any rule: inspect its current source, identify its owner decision and impacted states/roles/history, update these three documents consistently, and authorize implementation separately. Phase 2 originally deferred architecture/issues documentation to Phase 3; [Product Architecture](PRODUCT_ARCHITECTURE.md) and [Known Issues](KNOWN_ISSUES.md) now exist. This documentation does not fix findings.
