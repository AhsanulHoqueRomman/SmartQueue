# QueueTurn Known Issues and Evidence Register

## Metadata and authority

- **Phase/date:** Project Brain Phase 3, 2026-10-09.
- **Source baseline:** `main` / `4a9920c3a648c2925dc30956005a1c28a015918f`; application source unchanged; Phase 2 documentation initially untracked.
- **Purpose:** Canonical independent records for F-001–F-025, retaining baseline priorities and evidence qualifications. The original Phase 3 register introduced no fixes; the M1 closure update below records separately approved resolutions and follow-ups.
- **Inputs:** Historical product handoff, baseline assessment registers, completed Phase 1 mapping, canonical documents, and current source.
- **Ownership:** [BUSINESS_RULES](BUSINESS_RULES.md) owns BR-001–BR-062, C-01–C-18 index and D01–D20; [QUEUE_STATE_MACHINE](QUEUE_STATE_MACHINE.md) owns lifecycle/ETA; [ROLE_PERMISSION_MATRIX](ROLE_PERMISSION_MATRIX.md) owns authorization; [PRODUCT_ARCHITECTURE](PRODUCT_ARCHITECTURE.md) owns structure/data flow. This register owns detailed findings.
- **Limits:** Original Phase 3 evidence was static only. This documentation closure phase runs no tests, builds, servers, migrations or seeds; it records earlier authorized execution separately from current source/test inspection. No production, browser or PostgreSQL concurrency certification is implied.
- **M1 closure update:** 2026-10-10; owner explicitly approved formal closure and documentation updates. Current review baseline: `main` / `28b17dfd6c8e65e7854aa0359297acecb5b599e2` plus uncommitted M1 implementation and tests. No staging, commit or push authorized.
- **Maintenance:** Reverify source and applicability before a separately authorized fix; record new baseline and appropriate evidence. Phase 2 metadata describing these documents as planned reflects creation-time history and was not rewritten.

## Evidence and severity legend

| Code | Meaning |
|---|---|
| S | SOURCE VERIFIED: inspected executable control flow/declaration; not an exercised runtime result |
| T | TEST ASSERTION INSPECTED: describes assertion, not execution or sufficient coverage |
| H | HISTORICAL INTENT: distinguish protected intent from superseded evolution |
| D | DOCUMENTED, NOT VERIFIED: prior report, not automatically current fact |
| I | INFERRED: consequence/race/opportunity requires verification |
| U | UNKNOWN: live state, exact incident, deployed DB/dependency/delivery not established |
| R | RUNTIME VERIFIED: reserved for actual recorded execution; unused in Phase 3 |

P0 means critical/blocking; P1 high priority; P2 normal priority; P3 lower-priority refinement. Definitions do not reclassify the baseline. **P1: F-001, F-005, F-006, F-007, F-012. All other F-001–F-023 are P2. No baseline P0 is established; no baseline P3 record exists.**

OPEN means the source condition remains, including policy-dependent gaps; it does not claim a live incident. UNVERIFIED means applicability/evidence remains insufficient. CLOSED means the owner accepted the implemented correction against its scoped acceptance criteria and recorded evidence; it is not universal production certification. The original 23 findings were OPEN at Phase 3. Ten are now CLOSED (F-001–F-007, F-012, F-019, F-020); the other 13 remain OPEN. F-024 (P1 / High) is implemented pending production/cutover verification; F-025 (P3 / Low) remains OPEN. They are new follow-ups, not baseline reclassifications.

## Findings index

| ID / detail | Priority | Title | Subsystem | Evidence | BR IDs | Decisions | Status |
|---|---|---|---|---|---|---|---|
| [F-001](#f-001) | P1 | Public document metadata | Discovery projections | S/T/H; historical R | BR-004,006,056 | None | CLOSED |
| [F-002](#f-002) | P2 | Incorrect document field | Onboarding docs | S/T; historical R | BR-004,010,056 | None | CLOSED |
| [F-003](#f-003) | P2 | Inactive applicant blocked | Onboarding permissions | S/T/H; historical R | BR-002,010,056 | None | CLOSED |
| [F-004](#f-004) | P2 | Partial account persists | Registration transaction | S/T; historical R | BR-001,002 | None | CLOSED |
| [F-005](#f-005) | P1 | Reschedule parity missing | Destination booking | S/H | BR-010,016–024,030,031 | D01–D03,D11 | CLOSED |
| [F-006](#f-006) | P1 | Stale lifecycle mutations | Concurrency | S/I | BR-024,035,041,042,044 | D08,D11,D19,D20 | CLOSED |
| [F-007](#f-007) | P1 | Global/overnight cleanup | Reconciliation | S/T/H | BR-004,039,041,045,049 | D08,D15–D20 | CLOSED |
| [F-008](#f-008) | P2 | Usable capacity unclear | Availability | S/H | BR-016–019,021 | D01–D03 | CLOSED |
| [F-009](#f-009) | P2 | Mutable/base ETA duration | Duration/history | S/H | BR-020,029,047,048 | D04 | CLOSED |
| [F-010](#f-010) | P2 | Forecast/window/readiness | ETA/check-in | S/H | BR-035,037,046–050 | D05–D07 | CLOSED |
| [F-011](#f-011) | P2 | Urgent coordination | Priority mutation | S/I | BR-038–040 | D10 | CLOSED |
| [F-012](#f-012) | P1 | Walk-in body provider missing | UI/API payload | S | BR-034 | None | CLOSED |
| [F-013](#f-013) | P2 | Nonunique phone identity | Walk-in accounts | S/I | BR-001,026,027,034 | D09 | OPEN |
| [F-014](#f-014) | P2 | Legacy serial not persisted | Check-in repair | S | BR-030–032,035 | None | CLOSED |
| [F-015](#f-015) | P2 | Customer calls private queue | Telemetry consumer | S | BR-004,046,049 | None | CLOSED |
| [F-016](#f-016) | P2 | Active person dropped | Queue display | S | BR-046,047,049 | D05 | CLOSED |
| [F-017](#f-017) | P2 | Browser business-date mismatch | Temporal display | S/I | BR-022,049 | D08 context | OPEN |
| [F-018](#f-018) | P2 | Break integrity gaps | Schedule writers | S/I | BR-016,017,021 | D01,D02 | CLOSED |
| [F-019](#f-019) | P2 | Internal schedule text exposed | Authenticated projections | S/T/H; historical R | BR-004,016,018 | None | CLOSED |
| [F-020](#f-020) | P2 | Detail publication differs | Service discovery | S/T; historical R | BR-004,006 | None | CLOSED |
| [F-021](#f-021) | P2 | Send outcomes discarded | Support/reset | S/T | BR-057–061 | D13 | OPEN |
| [F-022](#f-022) | P2 | Route/signature mismatch | Analytics | S/R | BR-004 | None | CLOSED |
| [F-023](#f-023) | P2 | Obsolete polling responses | Frontend state | S/I | BR-004,049,053,054 | None | CLOSED |
| [F-024](#f-024) | P1 / High | Private Verification Document Serving and Production Storage Authorization | Storage/deployment | S; production U | BR-004,056 context | Batch A owner-approved policy | IMPLEMENTED — production serving/cutover verification pending |
| [F-025](#f-025) | P3 / Low | Role-Dependent OpenAPI Response Schema Mismatch | API documentation | S | Contract context | None | OPEN |

## M1 closure and acceptance evidence

**Milestone M1 — Security, Privacy & Onboarding Correctness: CLOSED, owner authorized 2026-10-10.** This closes F-001/F-002/F-003/F-004/F-019/F-020 only. No M2, capacity, emergency-recovery, storage implementation or policy change is authorized by closure.

The final source and assertions were rechecked during this documentation phase. Evidence below is **historical execution from earlier authorized implementation/correction phases**, not newly executed tests:

| Verification | Recorded result | Scope and limitation |
|---|---|---|
| Final integrated backend selection after the public-name correction | **191 passed, 0 failed, 0 skipped**, no deselections; 189.44 seconds | 123 M1 regression cases (original 98 + final 25) and 68 existing cases; supersedes the earlier 166-case integration run |
| Earlier final registration/onboarding selection | 15 passed, 89 deselected | Historical intermediate verification after additive `provider_profile_id`; the final 191 selection includes registration/onboarding again |
| Frontend display-name tests | **5 passed, 0 failed, 0 skipped** | Node helper tests; not mounted-page or browser QA |
| Frontend production build | Passed | Existing dependencies; large-chunk advisory; focused lint had no errors and five warnings in unchanged queue code |
| Python syntax and `git diff --check` | Passed in final correction | Documentation phase repeats only read-only diff/static documentation validation; no tests or build rerun |

Final backend command, from `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest tests/test_m1_security_onboarding.py apps/providers/tests/test_providers.py apps/providers/tests/test_provider_profile_api.py apps/providers/tests/test_phase_c_onboarding.py apps/accounts/tests/test_auth.py::TestRegistration apps/services/tests/test_services.py apps/organizations/tests/test_organizations.py::TestOrganizationBootstrapAndDiscovery tests/test_m11_security.py::TestTenantIsolationBOLA::test_cross_tenant_service_update_rejected tests/test_m11_security.py::TestTenantIsolationBOLA::test_cross_tenant_provider_profile_access_rejected -q
```

Frontend commands, from `frontend`: `node --test src/utils/providerDisplay.test.js`, `.\node_modules\.bin\oxlint.cmd src/pages/staff/StaffQueuePage.jsx src/utils/providerDisplay.test.js`, and `npm.cmd run build`.

`backend/pytest.ini` selects development test settings and `--nomigrations`; `config/settings/base.py` selects **isolated in-memory SQLite** under pytest. The suite did not operate on the development/production database. It proves neither PostgreSQL concurrency nor migration application.

The staff provider-label regression is corrected using the existing `deriveProfessionalDisplay` helper without changing IDs, tenant scope, polling or queue actions. The public professional-profile email fallback is corrected to trimmed first/last name → public title → `Service Provider`, preserving `provider_name` and routes. Tests recursively reject account-email values in public endpoint payloads and preserve entitled private reads.

**Remaining verification:** Staff Queue browser-level provider switching is not verified; PostgreSQL concurrency is not verified by this SQLite selection; migration application is not covered by `--nomigrations`; production private-file authorization is not verified. Storage/deployment work is owned by F-024, schema corrections by F-025. These are not duplicate M1 reopenings or a production-ready certificate.

## Canonical finding records

Baseline defect descriptions and verification plans are retained as history. For the six M1 findings, the CLOSED status and resolution entries supersede their baseline behavior; other findings remain unchanged. Source paths below are repository-relative; important symbols must be rechecked after edits.

## F-001

1. **ID / priority:** F-001 — P1, unchanged.
2. **Title:** Public verification/document metadata exposure.
3. **Components:** Organization/provider discovery views and shared serializers.
4. **Roles/tenants:** Guests/customers; public organizations/providers and reviewers.
5. **Intended behavior:** Approved trust/profile information without private files, original filenames, reviewer emails or rejection administration.
6. **Baseline behavior (pre-M1):** Public org GET uses OrganizationSerializer.get_documents; provider list/detail use ProviderProfileSerializer with documents, user email and application-reviewer email. Separate safer public-profile route does not repair other routes.
7. **Source:** `backend/apps/organizations/views.py::OrganizationListCreateView, OrganizationDetailView`; `backend/apps/organizations/serializers.py::OrganizationSerializer.get_documents, OrganizationDocumentSerializer`; `backend/apps/providers/views.py::ProviderProfileListCreateView, ProviderProfileDetailView`; `backend/apps/providers/serializers.py::ProviderProfileSerializer`.
8. **Evidence:** S/H — source projection versus historical privacy intent.
9. **Baseline confirmed gap:** Private administrative metadata included in public projections.
10. **Baseline unverified consequences:** Live payload/file-download/exploitation U; disclosure opportunity I, not a demonstrated incident.
11. **BR:** BR-004, BR-006, BR-056.
12. **Contradictions:** C-11.
13. **Decisions:** None directly mapped; public safe-field inventory needed.
14. **Minimum verification:** Fixtures with private metadata; anonymous public list/detail/profile absence assertions and own-manager positive reads; no real document disclosure.
15. **Acceptance:** Public private fields absent; approved trust/pricing preserved; authorized verification data remains available.
16. **Regression:** Guest/customer/foreign tenant versus manager projections; all shared serializer consumers; download access tested separately if authorized.
17. **Status:** CLOSED — owner-approved M1 acceptance, 2026-10-10; baseline status was OPEN, with no fix/runtime incident verified then.
18. **M1 resolution / acceptance:** `OrganizationPublicSerializer` and `ProviderDiscoverySerializer` explicitly omit verification files, document metadata, reviewer identities and rejection administration. Entitled operational projections remain available; approved trust, credentials and effective prices are retained. `ProviderPublicProfileSerializer.get_provider_name` no longer uses account email and handles whitespace-only names. Recursive public-field/value absence and authorized-positive endpoint assertions are in `tests/test_m1_security_onboarding.py`, included in the historical final 191-pass run. Staff labels use safe public names; five helper tests and the frontend build passed. Private file-serving protection is separately OPEN under F-024; closure covers API projections, not storage authorization.

## F-002

1. **ID / priority:** F-002 — P2, unchanged.
2. **Title:** ProviderDocument incorrect field reference.
3. **Components:** Document list/upload/review model, serializer, view and service.
4. **Roles/tenants:** Own providers/managers and their document ownership boundaries.
5. **Intended behavior:** Derive consistent provider_profile ownership from scoped URL, not arbitrary client owner.
6. **Baseline behavior (pre-M1):** Model FK is provider_profile; query/create uses provider; review accesses document.provider. Upload serializer requires provider_profile input.
7. **Source:** `backend/apps/providers/models.py::ProviderDocument`; `backend/apps/providers/views.py::ProviderDocumentUploadView, ManagerProviderDocumentReviewView`; `backend/apps/providers/serializers.py::ProviderDocumentSerializer`; `backend/apps/providers/services.py::ProviderService_.review_provider_document`.
8. **Evidence:** S — field/attribute/input contract inspected.
9. **Baseline confirmed gap:** Inconsistent model ownership reference and input derivation.
10. **Baseline unverified consequences:** First failure depends on permissions/input/operation; no upload performed.
11. **BR:** BR-004, BR-010, BR-056.
12. **Contradictions:** C-11 context.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Authorized list/upload/review; distinguish serializer error from ORM/attribute failure; foreign document ID and conflicting owner input.
15. **Acceptance:** All branches use provider_profile and safe URL ownership; no tenant substitution.
16. **Regression:** Own/manager positive paths, foreign negatives, owner omitted/conflicting; F-003 remains independent.
17. **Status:** CLOSED — owner-approved M1 acceptance, 2026-10-10; baseline status was OPEN, defect not exercised then.
18. **M1 resolution / acceptance:** Document list/upload/review and review audit references consistently use `provider_profile`. Upload ownership is derived from the authorized URL profile; omitted owner works, conflicting owner rejects, and review fields are read-only. Nested document/tenant lookups prevent substitution. Endpoint tests assert stored ownership, review state and denied foreign access; included in the historical final 191-pass run. Storage architecture and verification policy were not changed.

## F-003

1. **ID / priority:** F-003 — P2, unchanged.
2. **Title:** Pending-provider application blocked by active-membership permission.
3. **Components:** Registration, own-provider permission, application/document gate.
4. **Roles/tenants:** Newly registered inactive applicant and own organization manager.
5. **Intended behavior:** Narrow own-application access without operational entitlement.
6. **Baseline behavior (pre-M1):** Registration creates inactive PROVIDER membership. Permission requires active own membership before loader's require_active_membership=False can apply.
7. **Source:** `backend/apps/accounts/views.py::RegisterProviderView`; `backend/apps/providers/permissions.py::IsOrganizationManagerOrOwnProvider`; `backend/apps/providers/views.py::ProviderApplicationSubmitView`.
8. **Evidence:** S/H.
9. **Baseline confirmed gap:** Earlier gate conflicts with later pending-owner loader intent.
10. **Baseline unverified consequences:** Complete HTTP registration/submit not run; broad relaxation would introduce entitlement risk I.
11. **BR:** BR-002, BR-010, BR-056.
12. **Contradictions:** C-11 context.
13. **Decisions:** None directly mapped; narrow onboarding contract required.
14. **Minimum verification:** Pending registration→own submit; manager and foreign pending actor; queue/catalog actions remain denied.
15. **Acceptance:** Own pending application access works without active operational permissions or access to another applicant.
16. **Regression:** Pending/active/rejected states; own/foreign/manager; F-002 document field issue separate.
17. **Status:** CLOSED — owner-approved M1 acceptance, 2026-10-10; baseline status was OPEN for the permission mismatch.
18. **M1 resolution / acceptance:** `IsProviderOnboardingParticipant` adds own INCOMPLETE/PENDING_REVIEW/REJECTED application access without weakening `IsOrganizationManagerOrOwnProvider`. Profile/document/submission views load the scoped inactive applicant. Approval/membership fields remain non-writable by applicants; manager/platform review remains separate. Tests cover JWT registration→upload→submission→authorized approval, rejected resubmission, foreign denial and queue/schedule/review denial while membership remains inactive; included in the historical final 191-pass run.

## F-004

1. **ID / priority:** F-004 — P2, unchanged.
2. **Title:** Provider registration can persist orphan User after invalid organization.
3. **Components:** Account/bootstrap transaction.
4. **Roles/tenants:** New provider/global User and requested organization.
5. **Intended behavior:** Failed bound registration leaves no unintended partial account; optional unbound registration is distinct.
6. **Baseline behavior (pre-M1):** User created before invalid/inactive organization lookup; return 400 within atomic does not abort prior writes.
7. **Source:** `backend/apps/accounts/views.py::RegisterProviderView.post`.
8. **Evidence:** S — transaction control flow.
9. **Baseline confirmed gap:** Failure return leaves earlier creation eligible to commit.
10. **Baseline unverified consequences:** Live orphan record/blocked retry not created; persistence effect follows transaction semantics.
11. **BR:** BR-001, BR-002.
12. **Contradictions:** None directly mapped.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** User/membership/profile counts after nonexistent/inactive org request; retry and optional no-org registration.
15. **Acceptance:** Invalid bound registration persists no unintended partial records; valid/unbound contracts retained.
16. **Regression:** Email retries, rollback, customer/manager bootstrap unaffected.
17. **Status:** CLOSED — owner-approved M1 acceptance, 2026-10-10; baseline status was OPEN for the control-flow defect.
18. **M1 resolution / acceptance:** `RegisterProviderView` validates the requested active organization before creating a User; User/membership/profile creation stays inside `transaction.atomic()`. Invalid prerequisites leave no partial records and an injected profile-creation exception rolls back preceding writes. Valid bound/unbound registration and server-controlled PROVIDER role are retained. Additive `provider_profile_id` preserves existing response fields and enables the tested own-application HTTP path. Included in the historical final 191-pass run; no migration or new onboarding policy.

## F-005

1. **ID / priority:** F-005 — P1, unchanged.
2. **Title:** Rescheduling bypasses booking capacity/eligibility parity.
3. **Components:** Destination appointment validation and linked serial/date writes.
4. **Roles/tenants:** Owners, tenant staff/managers; destination provider workload.
5. **Intended behavior:** Approved eligibility/capacity at destination, excluding moved workload, preserving date-and-serial model.
6. **Current behavior (resolved):** Full parity enforced in AppointmentService.reschedule_appointment: checks operational status, schedule, date bounds, emergency holds, duplicate bookings, break/leave conflicts, and capacity with moved-workload exclusion. ProviderService locked with select_for_update. Approved full-day leave returns LEAVE_CONFLICT consistently with initial booking. Non-reuse of serials is backed by persistent ProviderDateSerial counter. Existing price/contact snapshots and D11 status quo preserved.
7. **Source:** `backend/apps/appointments/services.py::AppointmentService.reschedule_appointment, book_appointment, check_provider_date_capacity`; `backend/apps/appointments/serials.py::allocate_serial`.
8. **Evidence:** S/R — Verified under dedicated PostgreSQL test suite `test_f005_reschedule_parity.py` (leave conflict, capacity deduction, and concurrency serialization) and `test_m2_lifecycle.py` (serial non-reuse).
9. **Confirmed gap:** Corrected; destination parity and concurrency synchronization established.
10. **Unverified consequences:** Browser manual rescheduling interaction remains tracked in Phase 2 manual scenarios; universal deadlock freedom across arbitrary unconfigured engines not asserted.
11. **BR:** BR-010, BR-016–BR-024, BR-030, BR-031.
12. **Contradictions:** C-04.
13. **Decisions:** D01, D02, D03, D11 (D11 repricing remains POLICY PENDING; snapshot preserved).
14. **Minimum verification:** Full capacity, inactive provider/service, removed assignment, window/break/leave edges and same-day self-exclusion; snapshot retention.
15. **Acceptance:** Approved parity enforced transactionally; no fixed consultation slots, duplicate serial or silent repricing.
16. **Regression:** Both-store serial allocation; own/provider permission differences; legacy missing queue; snapshots preserved unless D11 authorizes change.
17. **Status:** CLOSED — owner authorized 2026-10-14; verified by automated tests and PostgreSQL concurrency suite.

## F-006

1. **ID / priority:** F-006 — P1, unchanged.
2. **Title:** Fresh lifecycle coordination
3. **Components:** Appointment mutations versus check-in/start/complete.
4. **Roles/tenants:** Owner, assigned canceling provider, staff/manager/admin for target booking.
5. **Intended behavior:** Fresh linked-state checks under compatible coordination; valid action wins, losing invalid action rejects.
6. **Current behavior (resolved):** Cancel/reschedule coordinate provider → existing queue entry → fresh Appointment; state, cutoff, latest ETA and destination eligibility rechecked inside atomic writes. Cancellation rejects if entry is CALLED or IN_PROGRESS. Queue actions (call_next, start, complete, skip) acquire provider lock first.
7. **Source:** `backend/apps/appointments/services.py::AppointmentService.cancel_appointment, reschedule_appointment`; `backend/apps/queue/services.py::QueueService.check_in_appointment, start_queue_entry, complete_queue_entry`.
8. **Evidence:** S/R — M2 focused PostgreSQL execution, 54 distinct passing M2 cases across targeted runs; six revised queue/forecast cases passed. Cancel-vs-call, cancel-vs-start, and concurrent reschedule races passed in `test_m2_lifecycle.py`.
9. **Confirmed gap:** Corrected for approved M2 workflows; compatible lock order and fresh validation verified under PostgreSQL.
10. **Unverified consequences:** Universal deadlock freedom across arbitrary engines and manual UI acceptance remain unverified.
11. **BR:** BR-024, BR-035, BR-041, BR-042, BR-044.
12. **Contradictions:** None directly mapped.
13. **Decisions:** Explicit consolidated M2 decisions 2026-10-11; ETA-unavailable Option A explicitly approved. Unrelated D policies remain pending.
14. **Minimum verification:** PostgreSQL cancel-vs-call/check-in/start and concurrent reschedule regressions; exact boundaries and stale final ETA requests.
15. **Acceptance:** Compatible lock order and fresh validation; coherent committed state; losing action rejects without misleading events.
16. **Regression:** Sequential rejects plus actual races; permission distinctions; no deadlock-freedom claim from one test.
17. **Status:** CLOSED — owner authorized 2026-10-14; verified by automated tests and PostgreSQL concurrency suite.

## F-007

1. **ID / priority:** F-007 — P1, unchanged.
2. **Title:** Unfinished queues and midnight preservation
3. **Components:** Queue read/call-triggered cleanup and live helper.
4. **Roles/tenants:** All tenants with past nonterminal entries; overnight consultations.
5. **Intended behavior:** Deliberately scoped correction, preserving genuine ongoing service; provider failure is not customer absence.
6. **Current behavior (resolved):** Queue list/call do not invoke global historical cleanup; compatibility helper is a strict no-op. Provider-wide active exclusion; original date/serial retained on overnight completion. Next-date call_next is blocked while an active consultation is in progress.
7. **Source:** `backend/apps/queue/services.py::QueueService.list_provider_queue, call_next, reconcile_stale_historical_queue_entries`; `backend/apps/appointments/serializers.py::_get_is_live_queue`; `backend/tests/test_phase_a6_appointments_cleanup.py`.
8. **Evidence:** S/R — M2 focused PostgreSQL execution, 54 distinct passing M2 cases across targeted runs; six revised queue/forecast cases passed. Midnight completion, past-date read no-op, and active cross-date exclusion verified in `test_m2_lifecycle.py`.
9. **Confirmed gap:** Corrected for approved M2 workflows; midnight boundary preserved without automated cancellation.
10. **Unverified consequences:** Deployment behavior and manual UI acceptance remain unverified.
11. **BR:** BR-004, BR-039, BR-041, BR-045, BR-049.
12. **Contradictions:** C-15.
13. **Decisions:** Explicit consolidated M2 decisions 2026-10-11; ETA-unavailable Option A explicitly approved. Unrelated D policies remain pending.
14. **Minimum verification:** Cross-tenant past read leaves booking untouched; midnight completion + next-date guard, previous-day ETA unavailable tests.
15. **Acceptance:** Approved scope/session ownership and audited correction; no fabricated no-show/completion of protected service.
16. **Regression:** Actual cleanup plus live helper, cross-midnight guard, unrelated tenant, past terminal records; no unapproved universal exemption.
17. **Status:** CLOSED — owner authorized 2026-10-14; verified by automated tests and PostgreSQL lifecycle suite.

## F-008

1. **ID / priority:** F-008 — P2, unchanged.
2. **Title:** Partial leave and usable-capacity ambiguity.
3. **Components:** Date availability/capacity.
4. **Roles/tenants:** Customers/providers with partial leave or late-day demand.
5. **Intended behavior:** Fixed provider/date capacity; clipped union of working minutes minus breaks and approved leave divided by average duration; no double subtraction; uncancelled allocations (including completed and no-show) consume capacity; cancellations release allocation without serial reuse.
6. **Current behavior (resolved):** `backend/apps/appointments/capacity.py::date_capacity` and `effective_minutes` enforce fixed provider/date capacity using interval union arithmetic. Approved partial leave and breaks are merged into disjoint intervals; completed and no-show visits continue consuming allocation; valid cancellations release allocation without decrementing or reusing `ProviderDateSerial.last_allocated_serial`.
7. **Source:** `backend/apps/appointments/capacity.py`; `backend/apps/appointments/services.py::check_provider_date_capacity, AppointmentService.book_appointment, cancel_appointment, reschedule_appointment`; `backend/apps/appointments/models.py::ProviderDateSerial`.
8. **Evidence:** S/R — Verified by 18 dedicated tests in `backend/tests/test_batch_b.py` on PostgreSQL (`test_queueturn_m2`).
9. **Confirmed gap:** Corrected; fixed capacity, interval union arithmetic, allocation consumption, and serial non-reuse verified under PostgreSQL.
10. **Unverified consequences:** None.
11. **BR:** BR-016–BR-019, BR-021.
12. **Contradictions:** C-04 resolved.
13. **Decisions:** D01, D02, D03 approved (Batch B, 2026-10-12).
14. **Minimum verification:** Interval arithmetic, overlapping breaks/leave, uncancelled allocation states, cancellation serial non-reuse, late booking.
15. **Acceptance:** Approved clipped/union interval arithmetic without double subtraction or fixed patient slots; org-hours independence retained.
16. **Regression:** Parametrized interval unions, all uncancelled appointment statuses, serial allocation monotonicity, concurrent capacity writers under provider lock.
17. **Status:** CLOSED — owner authorized Batch B implementation verified under PostgreSQL by `tests/test_batch_b.py`.

## F-009

1. **ID / priority:** F-009 — P2, unchanged.
2. **Title:** ETA duration source and missing immutable historical duration.
3. **Components:** Booking, workload, active/waiting ETA and history.
4. **Roles/tenants:** All forecast consumers; custom-duration providers.
5. **Intended behavior:** One authoritative provider-level average duration for capacity and ETA; no silent recalculation from consultation speed; uniform legacy fallback; missing duration blocks booking with `PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED`; only active same-organization managers can edit average duration; snapshots preserved.
6. **Current behavior (resolved):** `backend/apps/providers/duration.py::get_authoritative_provider_average_duration` resolves authoritative provider duration used across capacity and ETA. Field permission guard `require_provider_average_manager` restricts edits strictly to active managers of the provider's organization (denying provider self-editing, staff, cross-tenant managers, and admins without local membership). Unsafe duration increases that conflict with existing bookings are rejected with 409 `DURATION_BOOKING_CONFLICT`. Ambiguous/missing legacy averages return `None` without ETA fabrication and block booking while keeping queue progression functional.
7. **Source:** `backend/apps/providers/duration.py`; `backend/apps/providers/permissions.py::require_provider_average_manager`; `backend/apps/appointments/capacity.py`; `backend/apps/queue/forecast.py`; `backend/apps/appointments/services.py::AppointmentService.book_appointment, reschedule_appointment`.
8. **Evidence:** S/R — Verified by 68 tests in `backend/tests/test_provider_average_permissions.py` and 12 tests in `backend/tests/test_batch_b.py` on PostgreSQL (`test_queueturn_m2`).
9. **Confirmed gap:** Corrected; single authoritative duration, manager-only permissions, and conflict protections verified under PostgreSQL.
10. **Unverified consequences:** None.
11. **BR:** BR-020, BR-029, BR-047, BR-048.
12. **Contradictions:** C-05 resolved.
13. **Decisions:** D04 approved (Batch B, 2026-10-12).
14. **Minimum verification:** Authoritative provider average resolution, uniform fallback, ambiguous rejection, permission matrix, conflict rejection, historical snapshot preservation.
15. **Acceptance:** Approved basis consistent across booking/capacity/ETA; no fabricated historical backfill or duration-triggered completion.
16. **Regression:** Role/tenant permission boundaries, invalid average validation, unsafe duration increase conflict rejection, registration atomicity.
17. **Status:** CLOSED — owner authorized Batch B implementation verified under PostgreSQL by `tests/test_provider_average_permissions.py` and `tests/test_batch_b.py`.

## F-010

1. **ID / priority:** F-010 — P2, unchanged.
2. **Title:** Forecast/check-in/readiness contract ambiguity.
3. **Components:** Arrival guidance, ETA populations and callable queue.
4. **Roles/tenants:** Waiting/checked customers and queue operators.
5. **Intended behavior:** Clear separation between forecast reservations (`scheduled_ahead`) and physical presence (`people_ahead`); presence-gated calling in ascending serial order; TURN_NOW only on actual Call Next; arrival buffer 15–30 min (default 15); first serial start-minus-5-min arrival; ETA unreliability on >20 min delay or previous-day unfinished queue blocking self-rescheduling; Asia/Dhaka timezone; midnight preservation.
6. **Current behavior (resolved):** `backend/apps/queue/forecast.py::calculate_readiness_and_eta` distinguishes `scheduled_ahead` (all confirmed/checked-in waiting bookings) from `people_ahead` (checked-in waiting + active consultation). `call_next` strictly selects checked-in waiting entries in ascending serial order. Readiness thresholds follow time-first rules; `TURN_NOW` triggers only on transition to `CALLED`. `Organization.arrival_buffer_minutes` allows only `[15, 20, 25, 30]`, defaulting to 15. The first serial arrives at start minus 5 minutes. >20 min provider delay without starting or previous-day unfinished entries flags ETA as unreliable and blocks customer self-rescheduling. Midnight preserves original serials and appointments.
7. **Source:** `backend/apps/queue/forecast.py`; `backend/apps/queue/services.py::QueueService.call_next, check_in_appointment`; `backend/apps/organizations/models.py::Organization.arrival_buffer_minutes`; `backend/apps/appointments/services.py::AppointmentService.reschedule_appointment`.
8. **Evidence:** S/R — Verified by 23 tests in `backend/tests/test_batch_b.py` on PostgreSQL (`test_queueturn_m2`).
9. **Confirmed gap:** Corrected; forecast vs presence contracts, presence-gated calling, arrival buffers, delay unreliability, and cross-midnight preservation verified under PostgreSQL.
10. **Unverified consequences:** None.
11. **BR:** BR-035, BR-037, BR-046–BR-050.
12. **Contradictions:** C-06, C-07, C-08 resolved.
13. **Decisions:** D05, D06, D07 approved (Batch B, 2026-10-12).
14. **Minimum verification:** Forecast vs physical populations, arrival buffer values and tenant permissions, time-first readiness thresholds, delay unreliability, previous-day unfinished preservation.
15. **Acceptance:** Approved labels/population/window precedence; presence-gated calling; no assumed six-hour restriction.
16. **Regression:** Arrival buffer boundaries, readiness states, early check-in idempotency, delayed ETA recovery, cross-midnight retention.
17. **Status:** CLOSED — owner authorized Batch B implementation verified under PostgreSQL by `tests/test_batch_b.py`.

## F-011

1. **ID / priority:** F-011 — P2, unchanged.
2. **Title:** Serial-only call-next coordination without urgent/priority overrides.
3. **Components:** Queue call selection, priority removal, and restoration.
4. **Roles/tenants:** Authorized operators and waiting customers.
5. **Intended behavior:** Call Next strictly presence-gated in ascending serial order; un-checked-in entries not called; no urgent/priority/VIP overrides; active consultations not interrupted; skipped/absent entries retain original booking and serial; restoration returns to WAITING without auto-calling; transitions protected under provider lock.
6. **Current behavior (resolved):** `backend/apps/queue/services.py::call_next` selects checked-in WAITING entries ordered strictly by `serial_number`. Urgent functionality was permanently removed in `queue.0006`, with historical data archived to `AuditLog`. Active consultations raise `ActiveQueueCustomerException` and cannot be interrupted. `skip_queue_entry` sets appointment to `NO_SHOW` while preserving serial. `restore_queue_entry` (manager/staff only) resets status to `WAITING` and `CHECKED_IN` without auto-calling. All transitions coordinated under `ProviderProfile` row lock.
7. **Source:** `backend/apps/queue/services.py::QueueService.call_next, skip_queue_entry, restore_queue_entry`; `backend/apps/queue/migrations/0006_remove_queueentry_is_urgent_and_more.py`.
8. **Evidence:** S/R — Verified by 83 tests in `backend/tests/test_m2_lifecycle.py` on PostgreSQL (`test_queueturn_m2`).
9. **Confirmed gap:** Corrected; serial-only calling, urgent removal, restoration, and active consultation exclusion verified under PostgreSQL.
10. **Unverified consequences:** Universal deadlock freedom and manual UI acceptance remain unverified.
11. **BR:** BR-038–BR-040.
12. **Contradictions:** None directly mapped.
13. **Decisions:** Explicit consolidated M2 decisions 2026-10-11 approved.
14. **Minimum verification:** Concurrent PostgreSQL call-next exclusion, restored lower serial after active completion, legacy serial/forecast tests, archive migration regression.
15. **Acceptance:** No live priority API/model/UI; checked-in ascending serial; provider-wide active exclusion; archive retained.
16. **Regression:** Concurrent calls, serial ordering, restoration, removed-route 404, and historical archive preservation.
17. **Status:** CLOSED — owner authorized M2 implementation verified under PostgreSQL by `tests/test_m2_lifecycle.py`.

## F-012

1. **ID / priority:** F-012 — P1, unchanged.
2. **Title:** Provider walk-in UI omits required request-body provider_id.
3. **Components:** Command-board form, request service, serializer/view.
4. **Roles/tenants:** Own provider/front-desk callers in target organization.
5. **Intended behavior:** Authorized URL-scoped walk-in works through shared booking/serial/snapshot path.
6. **Current behavior (resolved):** Contract aligned between frontend and backend: `queueService.registerWalkIn` attaches `provider_id: providerId` to request body; `WalkInRegisterSerializer` treats `provider_id` as optional UUID (`required=False, allow_null=True`). Authoritative URL validation in `WalkInRegisterView` rejects conflicting client body input with HTTP 400. `CanManageProviderQueue` enforces that unauthorized providers or foreign organization staff are rejected with HTTP 403. Monotonic serial allocation, capacity checks, and immediate physical check-in for FRONT_DESK walk-ins are preserved.
7. **Source:** `frontend/src/pages/provider/ProviderQueuePage.jsx`; `frontend/src/services/queueService.js::registerWalkIn`; `backend/apps/queue/serializers.py::WalkInRegisterSerializer`; `backend/apps/queue/views.py::WalkInRegisterView`.
8. **Evidence:** S/R — Verified by 8 dedicated tests in `backend/tests/test_f012_walk_in_contract.py` on PostgreSQL covering provider/staff flows, missing/conflicting body provider ID, authorization rejection, foreign-org rejection, serial allocation, and leave blocking.
9. **Confirmed gap:** Contract alignment complete and security checks enforced.
10. **Unverified consequences:** Full browser manual walk-in execution remains tracked in manual acceptance scenarios.
11. **BR:** BR-034.
12. **Contradictions:** C-12.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Exact frontend payload; missing/valid/conflicting body provider IDs; authorized/foreign target; check returned serial, checked WAITING and snapshots.
15. **Acceptance:** UI/API agree, URL tenant/provider authoritative, conflicts safely handled, server price and shared serial retained.
16. **Regression:** Provider and staff/manager callers, contact forwarding, no independent source queue or form redesign.
17. **Status:** CLOSED — owner authorized 2026-10-14; verified by automated tests.

## F-013

1. **ID / priority:** F-013 — P2, unchanged.
2. **Title:** Walk-in identity lookup using nonunique phone.
3. **Components:** Front-desk account resolution.
4. **Roles/tenants:** Shared-phone customers, operators and global User records.
5. **Intended behavior:** Contact phone is not unique proof of account ownership; ambiguity requires explicit policy.
6. **Current behavior:** get_or_create(phone_number=...) despite nonunique User phone; local/international formats are distinct strings.
7. **Source:** `backend/apps/queue/services.py::QueueService.register_walk_in`; `backend/apps/accounts/models.py::User.phone_number`.
8. **Evidence:** S/I.
9. **Confirmed gap:** Lookup assumes uniqueness schema does not provide.
10. **Unverified consequences:** MultipleObjectsReturned/shared identity conflation conditional I; live duplicate distribution U.
11. **BR:** BR-001, BR-026, BR-027, BR-034.
12. **Contradictions:** None directly mapped.
13. **Decisions:** D09.
14. **Minimum verification:** Two users with same phone, no-phone/placeholder, accepted equivalent forms; assert chosen identity versus editable snapshot.
15. **Acceptance:** Approved ambiguity handling; no silent account substitution/profile rewrite/authentication grant.
16. **Regression:** Shared family phone, existing/new customers, deterministic retries; no global unique-phone constraint without decision.
17. **Status:** OPEN — source identity assumption, live failure U.

## F-014

1. **ID / priority:** F-014 — P2, unchanged.
2. **Title:** Unified atomic serial allocation and legacy repair.
3. **Components:** Serial allocation, rescheduling, and missing-entry repair.
4. **Roles/tenants:** Booking callers, legacy appointment owners, and operators.
5. **Intended behavior:** Unified authoritative serial allocator for online, phone, and front-desk bookings; monotonic per-provider/date high-water mark via `ProviderDateSerial`; cancelled/vacated serials never reused; same-date reschedule preserves serial; different-date reschedule allocates destination serial; check-in never allocates replacement serial; Appointment and QueueEntry references consistent; historical duplicate data preserved.
6. **Current behavior (resolved):** `backend/apps/appointments/serials.py::allocate_serial` provides the single authoritative monotonic allocator across online booking, phone walk-in, and front-desk walk-in under `ProviderProfile` lock. Cancelled, rescheduled, or deleted serials are never reused. Same-date reschedule preserves serial, check-in, and snapshots; different-date reschedule allocates a fresh serial on the target date. Check-in is idempotent and never reallocates serials; legacy appointments without QueueEntry or serial are repaired without disturbing existing allocations. Historical duplicates are preserved untouched in `smartqueue_db`.
7. **Source:** `backend/apps/appointments/serials.py::allocate_serial`; `backend/apps/appointments/services.py::AppointmentService.book_appointment, reschedule_appointment`; `backend/apps/queue/services.py::QueueService.check_in_appointment, register_walk_in`; `backend/apps/appointments/models.py::ProviderDateSerial`.
8. **Evidence:** S/R — Verified by concurrency and lifecycle tests in `backend/tests/test_m2_lifecycle.py` on PostgreSQL (`test_queueturn_m2`).
9. **Confirmed gap:** Corrected; unified atomic allocation, serial monotonicity, and legacy repair verified under PostgreSQL.
10. **Unverified consequences:** Universal deadlock freedom and manual UI acceptance remain unverified.
11. **BR:** BR-030–BR-032, BR-035.
12. **Contradictions:** C-02 context resolved.
13. **Decisions:** Explicit consolidated M2 decisions 2026-10-11 approved.
14. **Minimum verification:** Concurrent distinct/duplicate bookings and reschedules, legacy repair persistence, cancellation/deletion/move no-reuse, migration initialization test.
15. **Acceptance:** One persistent matching serial/date/provider/token accounting for both stores; normal serials unchanged.
16. **Regression:** Normal existing-entry path, uniqueness, concurrent repair on PostgreSQL; preserve unknown legacy snapshot facts.
17. **Status:** CLOSED — owner authorized M2 implementation verified under PostgreSQL by `tests/test_m2_lifecycle.py`.

## F-015

1. **ID / priority:** F-015 — P2, unchanged.
2. **Title:** Customer live queue calls private operational endpoint.
3. **Components:** Customer telemetry consumer and customer-facing endpoint contracts.
4. **Roles/tenants:** Authenticated customers viewing their own queue status.
5. **Intended behavior:** Customer live queue uses only customer-facing authenticated endpoints (`/api/v1/appointments/dashboard/`, `/api/v1/customer/appointments/{id}/`); does not call operational manager/staff/provider queue endpoints (`/queue/providers/{id}/`); access strictly scoped to authenticated customer; no spurious 403 authorization errors.
6. **Current behavior (resolved):** `CustomerLiveQueuePage.jsx` calls `appointmentService.getCustomerDashboard()`, fetching only customer-owned appointments and queue telemetry. It never calls the private provider queue endpoint `getProviderQueue`. Backend endpoint `CanManageProviderQueue` remains strictly enforced against unauthorized customers (HTTP 403), while customer-owned endpoints return HTTP 200 with queue telemetry. Spurious 403 errors and unauthorized operational data exposures are eliminated.
7. **Source:** `frontend/src/pages/customer/CustomerLiveQueuePage.jsx`; `frontend/src/services/appointmentService.js`; `backend/apps/queue/permissions.py::CanManageProviderQueue`; `backend/tests/test_batch_b.py::test_customer_early_checkin_is_idempotent_and_operator_endpoint_stays_private`.
8. **Evidence:** S/R — Verified by automated tests in `backend/tests/test_batch_b.py` on PostgreSQL (`test_queueturn_m2`) and frontend source review.
9. **Confirmed gap:** Corrected; customer calls only customer-scoped endpoints, private operational endpoint remains protected.
10. **Unverified consequences:** None.
11. **BR:** BR-004, BR-046, BR-049.
12. **Contradictions:** C-11 context resolved.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Customer request inventory and owner-safe readiness fixture; retain private queue deny assertions.
15. **Acceptance:** Supported safe resource, no repeated forbidden fetch; operational permissions uncompromised.
16. **Regression:** Own/other booking, foreign tenant, role switch, authorized operator full queue.
17. **Status:** CLOSED — customer-scoped endpoint contract and telemetry isolation verified by automated tests.

## F-016

1. **ID / priority:** F-016 — P2, unchanged.
2. **Title:** Frontend/backend people-ahead discrepancy.
3. **Components:** Queue count presentation (`queueDisplay.js`).
4. **Roles/tenants:** Customer dashboard, appointment detail, and live queue views.
5. **Intended behavior:** Frontend `people_ahead` displays the authoritative backend physical-queue metric; includes checked-in earlier WAITING customers plus active in-progress consultation; unchecked-in bookings are not presented as physically present; `scheduled_ahead` remains distinct; display utilities do not override the backend metric with inconsistent local calculations.
6. **Current behavior (resolved):** `frontend/src/utils/queueDisplay.js` directly preserves `readinessInfo.people_ahead` as the authoritative physical queue metric (checked-in waiting + active service). `readinessInfo.scheduled_ahead` is returned separately for overall reservations ahead. When a customer is `CALLED` or `IN_PROGRESS`, ahead counts cleanly resolve to 0. Missing telemetry preserves `null` without fabricating counts.
7. **Source:** `frontend/src/utils/queueDisplay.js`; `backend/apps/queue/forecast.py::calculate`; `frontend/src/utils/batchB.test.js`; `backend/tests/test_batch_b.py::test_forecast_reservations_and_actual_presence_are_distinct`.
8. **Evidence:** S/R — Verified by 47 passing tests in `frontend/src/utils/*.test.js` (including `batchB.test.js`) and PostgreSQL tests in `backend/tests/test_batch_b.py`.
9. **Confirmed gap:** Corrected; authoritative physical count preserved, active contribution included, dual-metric contract enforced.
10. **Unverified consequences:** None.
11. **BR:** BR-046, BR-047, BR-049.
12. **Contradictions:** C-13 resolved.
13. **Decisions:** D05 approved (Batch B, 2026-10-12).
14. **Minimum verification:** One active/zero checked predecessors/unchecked reservations fixture across utility consumers.
15. **Acceptance:** Correctly labeled count follows backend/approved D05 dual-metric contract; active contribution preserved.
16. **Regression:** Active/none, urgent, terminal/future/past suppression, null/missing metadata.
17. **Status:** CLOSED — authoritative people_ahead metric and active contribution verified by automated tests.

## F-017

1. **ID / priority:** F-017 — P2, unchanged.
2. **Title:** Browser-local versus backend business-date discrepancy.
3. **Components:** Temporal queue display.
4. **Roles/tenants:** Customers with browser timezone different from project.
5. **Intended behavior:** Backend business date/classification authoritative; local formatting does not change eligibility.
6. **Current behavior:** queueDisplay compares date to browser-local today as well as backend classification.
7. **Source:** `frontend/src/utils/queueDisplay.js`; `backend/apps/queue/services.py::current_business_date, business_date_for_appointment`; `backend/apps/appointments/serializers.py::_get_temporal_classification`.
8. **Evidence:** S/I.
9. **Confirmed gap:** Local date can override project-local interpretation.
10. **Unverified consequences:** Today shown past/future near midnight I; actual zone case U.
11. **BR:** BR-022, BR-049.
12. **Contradictions:** C-13.
13. **Decisions:** D08 context; no new timezone policy chosen.
14. **Minimum verification:** Controlled distant browser zones around Asia/Dhaka midnight, backend date classifications and overnight active data.
15. **Acceptance:** Backend classification respected; customer formatting never marks ongoing session terminal.
16. **Regression:** Date-only parsing, UTC timestamps, DST browser zones, missing metadata, cross-date service.
17. **Status:** OPEN — source date mismatch; runtime U.

## F-018

1. **ID / priority:** F-018 — P2, unchanged.
2. **Title:** Initial and approved schedule integrity.
3. **Components:** Schedule registration, change requests, break validation, and review gates.
4. **Roles/tenants:** Own providers, managers, and dependent bookings.
5. **Intended behavior:** Initial provider schedules require manager approval; date-specific changes require >=4 calendar days notice; permanent changes require >=10 calendar days notice; provider cannot directly modify approved live schedule; manager approval enforces active same-organization authorization; invalid or overlapping breaks rejected; schedule end time <=22:00 (10:00 PM); schedule/leave changes safely reconciled against confirmed bookings (HTTP 409 conflict); in-progress consultations continue past midnight without cancellation.
6. **Current behavior (resolved):** `backend/apps/providers/schedule_changes.py` enforces 4-day notice for `SPECIFIC_DATE` and 10-day notice for `PERMANENT` schedule change requests. Live approved schedules reject direct provider mutation. Initial schedules are validated on registration/invitation and require approval by an active manager of the provider's organization via `ProviderService_.approve_application`. Breaks must be strictly inside working hours and non-overlapping. Working hours cannot exceed 22:00. Manager review rechecks and blocks conflicts with existing bookings (HTTP 409 `SCHEDULE_BOOKING_CONFLICT`). Consultations in progress continue past midnight without cancellation and block next-date calling until completed.
7. **Source:** `backend/apps/providers/schedule_changes.py`; `backend/apps/providers/services.py::ProviderService_.create_or_update_schedule, add_break, approve_application, reject_application`; `backend/apps/queue/services.py::list_provider_queue, complete_queue_entry`.
8. **Evidence:** S/R — Verified by dedicated lifecycle, role matrix, and concurrency tests in `backend/tests/test_m2_lifecycle.py` on PostgreSQL (`test_queueturn_m2`).
9. **Confirmed gap:** Corrected; schedule integrity, notice enforcement, manager approval gates, break validation, and booking reconciliation verified under PostgreSQL.
10. **Unverified consequences:** Universal deadlock freedom and manual UI acceptance remain unverified.
11. **BR:** BR-016, BR-017, BR-021.
12. **Contradictions:** C-04 context resolved.
13. **Decisions:** Explicit consolidated M2 decisions 2026-10-11 approved.
14. **Minimum verification:** PostgreSQL initial break-vs-hours and approval-vs-booking races; 4/10-day bounds, <=22:00, overlap/retained-break checks, multipart request and private/cross-tenant authorization tests.
15. **Acceptance:** Approved reject/adjust policy maintains within-window/nonoverlapping breaks under coordination.
16. **Regression:** Adjacent nonoverlap, endpoints, multiple breaks, own/foreign permissions, cross-midnight continuation.
17. **Status:** CLOSED — owner authorized M2 implementation verified under PostgreSQL by `tests/test_m2_lifecycle.py`.

## F-019

1. **ID / priority:** F-019 — P2, unchanged.
2. **Title:** Authenticated operational schedule/leave exposure.
3. **Components:** Schedule/break/leave GET projections.
4. **Roles/tenants:** Ordinary authenticated customers/nonmembers and provider tenant.
5. **Intended behavior:** Customer-safe working windows; internal titles/reasons restricted.
6. **Baseline behavior (pre-M1):** Authenticated scoped-provider GET without membership requirement includes break titles/leave reasons.
7. **Source:** `backend/apps/providers/views.py` schedule/break/leave GETs; `backend/apps/providers/serializers.py::WeeklyScheduleSerializer, ProviderLeaveSerializer`.
8. **Evidence:** S/H.
9. **Baseline confirmed gap:** Authentication/resource scope alone permits internal operational text.
10. **Baseline unverified consequences:** Actual sensitive content/live read U; projection exposure S.
11. **BR:** BR-004, BR-016, BR-018.
12. **Contradictions:** C-11.
13. **Decisions:** None directly mapped; safe-field inventory needed.
14. **Minimum verification:** Customer/foreign-member fixtures with private text; compare own-provider/manager operational versus safe projections.
15. **Acceptance:** Discovery safe schedule only; entitled operational reads retain internal information.
16. **Regression:** Anonymous/authenticated/own/foreign/operator matrix; customer schedule display and break capacity functional.
17. **Status:** CLOSED — owner-approved M1 acceptance, 2026-10-10; baseline status was OPEN, actual disclosure incident unverified.
18. **M1 resolution / acceptance:** Safe weekly schedule/break/leave serializers omit break titles and leave reasons. `_can_read_operational_schedule` retains annotations for the active owner, active target manager/staff and platform flags; unauthorized readers receive safe fields only for operational providers. GET remains authenticated. Endpoint tests assert redaction, retained working windows, operational visibility and tenant scoping; included in the historical final 191-pass run. Capacity/schedule arithmetic and mutation permissions were not changed; schema mismatch is F-025.

## F-020

1. **ID / priority:** F-020 — P2, unchanged.
2. **Title:** Public service detail approval-filter mismatch.
3. **Components:** Catalog publication gates.
4. **Roles/tenants:** Guests/customers and pending/unapproved tenant manager.
5. **Intended behavior:** Consistent approved-public list/detail, separate authorized management access.
6. **Baseline behavior (pre-M1):** List checks active APPROVED org; detail checks active org/active service for nonmanager without same approval gate.
7. **Source:** `backend/apps/services/views.py::ServiceListCreateView, ServiceDetailView`.
8. **Evidence:** S.
9. **Baseline confirmed gap:** Detail publication differs from listing.
10. **Baseline unverified consequences:** Known UUID source-visible under unapproved tenant; live API not requested.
11. **BR:** BR-004, BR-006.
12. **Contradictions:** C-11 context.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Pending/rejected/suspended/approved org service list/detail; own/foreign manager.
15. **Acceptance:** Public gates agree; legitimate own-manager records remain manageable.
16. **Regression:** Inactive service/org, price minimum/null semantics, foreign management denial.
17. **Status:** CLOSED — owner-approved M1 acceptance, 2026-10-10; baseline status was OPEN for the filter inconsistency.
18. **M1 resolution / acceptance:** `ServiceDetailView.get` matches public listing: active service plus active APPROVED organization. Own active manager/platform GET can inspect unpublished records, including inactive organizations, matching existing operational listing. Default active-organization checks for mutations and manager permissions remain unchanged. State/role tests assert list/detail parity, inactive-service handling, pricing behavior and foreign mutation denial; included in the historical final 191-pass run.

## F-021

1. **ID / priority:** F-021 — P2, unchanged.
2. **Title:** Email outcome and admin REPLIED-state observability.
3. **Components:** Contact submission/reply, Resend wrapper, reset, message model.
4. **Roles/tenants:** Inquirer/reset requester and platform support admin, not tenant STAFF.
5. **Intended behavior:** Saved/attempted/accepted/delivered distinguished; reset remains generic/nonenumerating.
6. **Current behavior:** Callers discard EmailSendResult; REPLIED saved before send; no reply body/outcome stored; _send success without ID contradicts its documentation. Admin uses configured support inbox; acknowledgement submitted email.
7. **Source:** `backend/apps/contact/views.py::ContactMessageCreateView, AdminContactReplyView`; `backend/apps/contact/email_service.py::EmailSendResult, _send`; `backend/apps/contact/models.py::ContactMessage`; `backend/apps/accounts/views.py::PasswordResetRequestView`.
8. **Evidence:** S/T — mocks inspected, not run.
9. **Confirmed gap:** Outcome discarded/not durable; reply state not acceptance/delivery proof; wrapper success not ID-dependent.
10. **Unverified consequences:** Particular missing-mail cause U; no provider logs/live recipient/send inspected. Branch failures can differ.
11. **BR:** BR-057–BR-061.
12. **Contradictions:** C-16.
13. **Decisions:** D13.
14. **Minimum verification:** Mock missing config/exception/missing ID/accepted ID for each branch; stored reply semantics and generic reset; no live email required.
15. **Acceptance:** Approved durable operator-visible attempt/acceptance/outcome semantics; no false delivery claim, private data or account enumeration.
16. **Regression:** Existing contact/email/reset mocks, 201 failure-safe persistence, platform permission, no private addresses/secrets in report.
17. **Status:** OPEN — observability gap; actual delivery U.

## F-022

1. **ID / priority:** F-022 — P2, unchanged.
2. **Title:** Analytics URL/view-signature mismatch.
3. **Components:** Shared global/nested routing and manager helper.
4. **Roles/tenants:** Authorized managers/own providers/platform admins.
5. **Intended behavior:** Supported routes resolve with matching arguments and scoped authority.
6. **Current behavior (resolved):** Canonical organization routes (`/summary/`, `/dashboard/`, `/providers/<id>/metrics/`, `/export/`) resolve cleanly without repeated path prefixes. Views accept `organization_id=None` as URL kwargs or query parameters; missing organization context on global endpoints returns controlled HTTP 400 (`organization_id is required.`) rather than unhandled `TypeError`. `ProviderMetricsView` validates that `provider_id` belongs to `organization_id`, returning 404 for wrong-organization providers. Permissions `CanViewAnalytics`, `CanViewProviderMetrics`, and `CanExportAnalytics` consistently enforce tenant isolation, rejecting foreign managers, staff, customers, and anonymous callers with 401/403. Legacy global routes and frontend `managerService.js` routes are preserved and functional.
7. **Source:** `backend/config/urls.py`; `backend/apps/analytics/urls.py`; `backend/apps/analytics/views.py::ProviderMetricsView, AnalyticsExportView, AnalyticsSummaryView, OrganizationDashboardView`; `backend/apps/analytics/permissions.py::CanViewAnalytics, CanViewProviderMetrics, CanExportAnalytics`; `frontend/src/services/managerService.js`.
8. **Evidence:** S/R — Verified by 10 dedicated regression tests in `backend/tests/test_f022_analytics_contract.py` on PostgreSQL and 8 existing tests in `backend/apps/analytics/tests/test_analytics.py`.
9. **Confirmed gap:** Corrected; route resolution, argument binding, and tenant-boundary enforcement established.
10. **Unverified consequences:** None.
11. **BR:** BR-004.
12. **Contradictions:** None directly mapped.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Authorized dispatch for all 4 canonical and global mounts; argument binding; tenant isolation; foreign/unauthorized/anonymous rejection; frontend `managerService.js` routes.
15. **Acceptance:** Supported signatures match route arguments, tenant isolation enforced, frontend calls functional, controlled errors on missing query context.
16. **Regression:** Canonical organization routes, global routes, provider tenant scoping, manager dashboard/export, foreign tenant rejection.
17. **Status:** CLOSED — verified by automated PostgreSQL test suite `tests/test_f022_analytics_contract.py` and existing analytics suite.

## F-023

1. **ID / priority:** F-023 — P2, unchanged.
2. **Title:** Stale asynchronous polling responses.
3. **Components:** Request-scope isolation across customer/staff/provider queues and NotificationBell.
4. **Roles/tenants:** Users switching routes, providers, dates, or organizations.
5. **Intended behavior:** Older asynchronous polling responses cannot overwrite data belonging to a newly selected organization, provider, appointment, or queue; polling cleanup occurs on component unmount or context change; request-scope protection works for both successful and failed requests; latest active request can update component state; no cross-tenant information displayed due to stale responses.
6. **Current behavior (resolved):** Centralized `createRequestScope` and `useRequestScope` hook manage ticket revisions and scope keys. Inflight requests check `scope.isCurrent(ticket)` before state updates in both resolve and reject handlers. Route, provider, date, or tenant changes increment `revision`, immediately invalidating stale responses. Component unmount invokes `scope.deactivate()`, clearing timers and discarding pending results. Background polling does not starve slower requests or overwrite newer results.
7. **Source:** `frontend/src/utils/requestScope.js`; `frontend/src/hooks/useRequestScope.js`; `frontend/src/pages/customer/CustomerLiveQueuePage.jsx`; `frontend/src/pages/staff/StaffQueuePage.jsx`; `frontend/src/pages/provider/ProviderQueuePage.jsx`; `frontend/src/components/NotificationBell.jsx`; `frontend/src/utils/batchB.test.js`.
8. **Evidence:** S/R — Verified by 7 dedicated request-scope unit tests in `frontend/src/utils/batchB.test.js` and integration review across 9 component consumers.
9. **Confirmed gap:** Corrected; latest-started request wins, context switching invalidates inflight responses, unmount cleanly deactivates scope.
10. **Unverified consequences:** None.
11. **BR:** BR-004, BR-049, BR-053, BR-054.
12. **Contradictions:** None directly mapped.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Deferred old response completes after new request; context switch/unmount/logout/overlapping polls; current state unchanged.
15. **Acceptance:** Obsolete results discarded, timers/requests cleaned; no permission widening or noisy background polling.
16. **Regression:** Recipient/tenant and queue provider changes, auth errors, mounted/unmounted ordering, count/date contract.
17. **Status:** CLOSED — request-scope context isolation and stale polling invalidation verified by automated tests.

## F-024

1. **ID / priority:** F-024 — P1 / High; mandatory pre-production security gate.
2. **Title:** Private Verification Document Serving and Production Storage Authorization.
3. **Owner approval:** Batch A, 2026-10-12: own provider documents; active same-organization managers; existing IsSystemAdmin platform reviewers. Organization STAFF/customer/anonymous access denied. Document reads do not grant provider operations.
4. **Original exposure (S):** ProviderDocument.file, OrganizationDocument.file and OrganizationCredential.document used public MEDIA_ROOT; raw media URLs bypassed API authorization. Organization document GET also admitted ordinary active members.
5. **Implementation (S):** Private storage alias and UUID upload names; authenticated nested attachment endpoints with object/tenant query scoping; existing platform-verification permission reused; successful downloads audited. API file/document fields now contain authorized API paths, never storage URLs. Public projections remain redacted. Development media blocks conventional sensitive prefixes, nonstandard referenced paths and escaping symlinks; production Django media serving denies requests.
6. **Uploads:** PDF/JPG/JPEG/PNG, nonempty, at most 5 MiB; bounded PDF header/end-marker and image-content inspection, MIME/extension consistency. This validates format/signature, not malware safety or comprehensive PDF semantics. Existing M2 schedule attachments keep their separate unchanged database-byte/3 MiB contract.
7. **Downloads:** Attachment disposition, bounded safe basename/format extension, no-store/nosniff on success and denial; unsupported legacy formats download as opaque .bin attachments. Missing files return a safe 404; metadata/status are not silently repaired.
8. **Development inventory (R, read only):** No database verification file references in any of the three models. MEDIA_ROOT retains 106 provider PDFs and 792 organization PDF/JPG files (898 unreferenced files); no credential files. Files were not moved, overwritten or deleted. Guarded Django serving denies these legacy paths.
9. **Cutover helper:** `copy_private_verification_documents` defaults to dry-run; `--apply` requires separate owner authorization with application writers stopped. Copies referenced files using the private storage interface, verifies SHA-256, preserves database references/ownership/status, is repeat-safe, reports missing/conflicting files and never deletes public originals. Synthetic tests exercise apply; no existing-data apply was executed.
10. **Production prerequisites:** Explicit production settings, persistent private storage configuration, private filesystem/bucket access rules, no proxy/CDN/static mapping to private roots or legacy verification paths. Production startup rejects missing/nonpersistent configuration and public filesystem storage. An acknowledgement flag is not proof of hosting persistence or ACL correctness.
11. **Migration:** organizations.0010 and providers.0008 alter FileField configuration only; no data migration. Generated and exercised in isolated migrated PostgreSQL tests; not applied to development by this task.
12. **Evidence:** Focused tests cover ownership/roles/tenants, JWT, safe headers, uploads, direct-media denial/public-avatar compatibility, production startup and synthetic legacy-copy idempotency. Exact final counts appear in the Batch A execution report below. Browser and deployed proxy/storage verification remain unperformed.
13. **Status:** IMPLEMENTED — pending owner-approved deployment/serving verification and legacy cutover wherever referenced public files exist. Not fully CLOSED or production-certified. This development database has no referenced-file cutover to execute; retained unreferenced copies still require deployment serving exclusion and owner-controlled cleanup decisions.

## F-025

1. **ID / priority:** F-025 — P3 / Low; new post-M1 documentation/client-contract follow-up.
2. **Title:** Role-Dependent OpenAPI Response Schema Mismatch.
3. **Components / source:** `backend/apps/organizations/views.py` and `backend/apps/providers/views.py` GET `extend_schema` annotations; actual public/operational serializers.
4. **Current behavior / evidence:** S — organization list advertises `OrganizationSerializer` but returns `OrganizationPublicSerializer`. Organization detail and provider list/detail advertise privileged serializers while runtime selects public/operational variants. Schedule, break and leave GET advertise `WeeklyScheduleSerializer`, `ScheduleBreakSerializer`, `ProviderLeaveSerializer` despite safe/operational variants.
5. **Affected routes:** `/api/v1/organizations/`; organization detail; nested providers list/detail; provider schedules, nested schedule breaks and provider leaves GET. Dedicated entitled document/review endpoints are not this mismatch.
6. **Impact / limits:** Documentation may imply private fields are present or required in safe responses and mislead clients. An annotation does not bypass runtime authorization or prove private-data disclosure. No generated-client dependency was found in the inspected handwritten React API consumers; generated schema/client behavior is not runtime verified.
7. **Recommended remediation:** Scoped annotation correction: public serializer for public-only responses; explicit role-dependent variants/descriptions for mixed responses, preserving list/pagination forms where supported. Do not broaden serializers or permissions to match inaccurate documentation.
8. **Verification / acceptance:** Inspect generated schema under separately authorized checks; declared field sets and role variants match runtime projections, public schemas do not promise operational-only fields, and existing entitled responses/routes remain compatible.
9. **Status:** OPEN — separately trackable post-M1 correction; no schema annotations or runtime permissions changed during closure.

## Historical findings crosswalk

C-17: handoff §27's **F01–F15** is a separate historical namespace. Historical priorities, including historical P0 labels, are not baseline severity upgrades. Associations preserve Phase 1 mapping without asserting every historical claim equals today's exact scope.

| Historical | Baseline association / treatment |
|---|---|
| F01 | F-001 |
| F02 | F-002 |
| F03 | F-019 |
| F04 | F-003 |
| F05 | F-022 |
| F06 | F-005 |
| F07 | F-006 |
| F08 | F-007 |
| F09 | F-008 |
| F10 | F-009 |
| F11 | F-021 |
| F12 | Dependency-declaration lead; no exact permanent F mapping |
| F13 | Redirect lead/PF-002; no exact permanent F mapping |
| F14 | F-020 |
| F15 | F-004 |

## Proposed candidates and dependency lead

### PF-001 — Customer repeat-check-in behavior

Candidate only; no permanent ID/severity. QueueService.check_in_appointment validates owner actor can_check_in before already-checked return; once checked the computed flag is false. AppointmentCheckInView passes request.user. Actorless repeat assertion in `backend/tests/test_phase5_hardening.py` expects one notification, not repeated customer HTTP success. Handoff §9 permits idempotency **or safe rejection**. [State-machine qualification](QUEUE_STATE_MACHINE.md#repeat-check-in-qualification--br-036--pf-001) owns BR-036/C-03. Future owner-actor HTTP evidence must establish safe response/no duplicated entry/serial/notification before promotion. No fix inferred.

### PF-002 — Legacy literal route redirects

Candidate only; no permanent ID/severity. `frontend/src/routes/AppRoutes.jsx` aliases `/appointments/:id` and `/queue/:queueEntryId` use literal Navigate placeholders; canonical customer detail routes exist separately. Future concrete-ID route test should inspect actual redirect/resolution. Do not claim all profile/detail navigation broken or introduce duplicate architecture.

### Dependency-declaration discrepancy

Batch A Part 2 resolves the confirmed declaration discrepancy: root `requirements.txt` is now the UTF-8 authoritative pinned source and `backend/requirements.txt` includes it. Resend 2.47.0 remains pinned; Pillow 12.3.0 is added for existing runtime image/document validation. Existing installed pytest 8.4.2 is retained instead of the divergent backend declaration. Historical F12 remains separate; no new F ID or F-021 closure is implied. WSGI/ASGI now default to fail-safe production settings, while intentional development commands/tests retain their selection. See [deployment requirements and pending hosting verification](DEPLOYMENT.md).

### Batch A Part 2 verification — 2026-10-12

- Initial repository: clean `main`, HEAD `f186ac9` (owner's F-024 commit).
- Final focused command from `backend/`: `..\.venv\Scripts\python.exe -m pytest tests/test_deployment_configuration.py tests/test_f024_private_documents.py::test_production_module_refuses_missing_storage_configuration tests/test_f024_private_documents.py::test_production_module_accepts_explicit_private_persistent_configuration tests/test_m11_security.py::TestProductionSettingsSecurity -q --tb=short --show-capture=no`: **50 passed, 0 failed**. Synthetic subprocess configuration checks avoid real database connections/secrets; existing startup fixtures now supply the required explicit database configuration.
- Related regression command: `..\.venv\Scripts\python.exe -m pytest apps/contact/tests/test_email_service.py apps/accounts/tests/test_password_reset.py tests/test_f024_private_documents.py -q --tb=short --show-capture=no`: **108 passed, 0 failed** on isolated SQLite/test storage. Email sends are mocked. These command counts overlap at the two F-024 startup tests and are not a unique-case total.
- Fresh root-requirements installation in a temporary separate virtual environment succeeded; Django/Resend/Pillow/database/API imports and email-module startup succeeded; isolated `pip check` reported no broken requirements. The existing project virtual environment was not modified. All former root pins are retained; Pillow is the only added pin.
- Development `manage.py check`, `makemigrations --check --dry-run`, and `migrate --check` using explicit development settings passed. No migration/data operation was performed. Synthetic production `check` passed without issues; `check --deploy` exited successfully with 73 warnings from API-schema generation and intentionally disabled-until-reviewed HSTS. Unchanged schema annotations remain separate from this batch/F-025.
- Fail-safe settings validation is verified, not actual hosting, database transport, TLS/proxy trust, sender-domain verification, email delivery, private-storage persistence/ACLs or external media exclusion. F-024 production prerequisites and F-021 delivery-state work remain pending. No production deployment or owner closure is implied.

## Finding-to-policy decision matrix

All decisions remain **POLICY PENDING**, owned by [BUSINESS_RULES](BUSINESS_RULES.md#pending-business-policy-register). Associations are fix dependencies/context, not new registry assignments or answers. Pending policy can block a guarantee/fix, not honest documentation.

| Decision | Findings / context | Required owner boundary |
|---|---|---|
| D01 | F-005/F-008/F-018 | Total versus remaining-day budget and completed work |
| D02 | F-005/F-008/F-018 | Clipped union of partial/combined leave and breaks |
| D03 | F-005/F-008 | Org-hours/provider independence versus explicit coupling |
| D04 | F-009 | Immutable/represented/current duration history basis |
| D05 | F-010/F-016 | Reservation versus physical or labeled dual forecasts |
| D06 | F-010/PF-001 context | Enforced date/window and exceptions; no assumed six-hour restriction |
| D07 | F-010 | Time/count readiness precedence |
| D08 | F-006/F-007/F-017 context | Overnight session ownership/guard/correction |
| D09 | F-013 | Shared-phone identity and ambiguity handling |
| D10 | F-011 | Urgent reason/state/audit rules |
| D11 | F-005/F-006 | Snapshot preservation versus approved repricing |
| D12 | No direct baseline F | Dual-purpose operator/customer routing |
| D13 | F-021 | Attempted/accepted/delivered REPLIED and durable history |
| D14 | No direct baseline F | Server retry identity; UI guard is not idempotency |
| D15 | F-007 context | Missed-call grace; no verified auto-timer |
| D16 | F-007/C-14 context | Linked skipped return/fairness policy |
| D17 | F-007 context | Late/no-show cutoff, avoid provider fault blamed on customer |
| D18 | F-007 context | CALLED timeout/recall/release |
| D19 | F-006/F-007 context | Audited abandoned-service correction, no duration auto-completion |
| D20 | F-006/F-007 context | Unavailability/interruption/reassignment rules |

Cancellation penalties/cutoffs and membership promotion authority are additional unresolved reference details, not new D IDs. No payment/refund/settlement policy is invented.

## Future focused verification

None of these checks ran in Phase 3.

| Area | Minimum evidence |
|---|---|
| Public/private projections | Serializer fixtures + anonymous/customer/own-manager/foreign tenant absence/positive endpoint assertions; metadata and download access separate |
| Onboarding | Pending own application/docs, operational denial, invalid-org rollback; F-002/F-003 independently verified |
| Booking/rescheduling | Full date/self-exclusion/inactive assignment/leave/window after D01/D02; snapshots and both-store serials |
| PostgreSQL coordination | Two connections/barriers for booking-price, cancel/reschedule-lifecycle, urgent-call, schedule-break and cleanup; explicit test DB since default selects SQLite |
| ETA/readiness | Present/absent/urgent/active, edits, date branches, 15/45-minute edges; raw response versus presentation |
| Frontend contracts | Exact walk-in payload, private request inventory, count/date utilities |
| Stale responses | Deferred out-of-order results across tenant/provider/route/logout and overlapping polls |
| Tenant boundaries | Permissions plus projections/side effects, not scoped URL alone |
| Email | Mock both branches/config/exception/missing ID; durable semantics after D13 and generic reset; no live send required |
| Analytics | Resolve/permitted-dispatch supported mounts and permission negatives/current client paths |

[Architecture test map](PRODUCT_ARCHITECTURE.md#o-test-and-verification-architecture) identifies inspected assertions. SQLite/sequential tests and --nomigrations do not establish applied migration or PostgreSQL coordination. Earlier reported passes are prior evidence, not new R.

## Fix prioritization guidance

Keep original severity separate from execution order, security/privacy exposure, operational correctness, customer impact, policy dependency and verification effort. Privacy F-001/F-019/F-020, operational P1 F-005/F-006/F-007, blocked contracts F-002/F-003/F-012/F-022, arrival/history F-008–F-010/F-014–F-017 and observability/state F-021/F-023 require different evidence. A small contract fix can be cheap; a P1 race fix needs PostgreSQL proof. Neither effort nor inferred impact changes priority.

Policy gates precede behavior decisions; pure projection/field/payload corrections usually need contract review and focused assertions, not new business architecture. Split independent fixes; preserve queue fairness/serial/snapshots, protected identifiers and approved visual baseline. This guidance authorizes no implementation or broad test suite.

## Maintenance workflow

1. Reinspect exact current source, permission/projection and consumer; record branch/HEAD/date.
2. Determine evidence still applies; separate S/T/H/D/I/U, add R only with recorded actual verification.
3. Obtain owner decisions for relevant D IDs; today's gap is not automatically product policy.
4. Implement only a separately authorized scoped fix with tenant/privacy/linked-state invariants.
5. Run appropriate focused checks, including real PostgreSQL races when claimed; record results/limits.
6. Update status only with evidence. Intended fix, unrelated passing test or absence of complaint does not justify FIXED.
7. Update affected canonical ownership documents; preserve IDs/priorities/history/candidates without secrets/private data.

No application behavior, severity, policy answers or technical identifiers changed in this phase.

## M2 implementation evidence — 2026-10-11

Initial worktree was clean on main at `0d97e89975f6f465d336989219a1f54fb756bfe5`. This milestone is uncommitted.

- `..\.venv\Scripts\python.exe -m pytest tests/test_m2_lifecycle.py --ds=config.settings.test_postgresql --migrations -q`: **48 passed**, isolated PostgreSQL test database, all three new migrations and archival/high-water migration regression exercised.
- Six directly revised existing queue/forecast cases: **6 passed, 46 deselected**; no full suite run.
- `node --test src/utils/m2Policy.test.js`: **5 passed**.
- `manage.py makemigrations --check --dry-run`: **No changes detected**.
- No development migrations/seeds; one historical active duplicate group is preserved. No DB uniqueness backfill is attempted without a cleanup decision. Supported service paths serialize new duplicate guards on the provider row.

F-006/F-007/F-011/F-014/F-018 are ready for owner closure review against the approved M2 scope. Existing F-005/F-012/F-013 dependencies have narrow corrections, but those findings are not incidentally declared closed. F-024 private verification-file production authorization and F-025 schema annotations remain OPEN. Capacity/duration/forecast policy findings remain OPEN; no new formula or emergency recovery was implemented. Manual workflow, responsive/accessibility acceptance and production storage remain unverified.

### Final M2 verification additions

After the initial 48-case PostgreSQL run, focused additions verified:

- `-k real_delayed_provider_eta_recovers`: **1 passed, 48 deselected** (real calculator, no ETA mock).
- `-k initial_schedule_registration_atomic_api`: **3 passed, 49 deselected** (valid schedule + pending operational denial, invalid hours, transactional write-failure rollback).
- `-k 'schedule_request_multipart or disk_backed_upload'`: **2 passed, 51 deselected** (one earlier case rechecked plus one new disk-backed upload case). QueryDict deep-copy was avoided so TemporaryUploadedFile uploads remain supported.

Thus **54 distinct M2 cases** were verified on PostgreSQL across these targeted runs, plus **6** revised existing serial/forecast cases. No claim of a single final 53-case run or full-suite pass is made.

Frontend focused lint on affected files: zero errors, 49 nonfatal warnings in existing page patterns (unused variables and hook/effect advisories, including affected effects); no broad cleanup. Five Node policy tests passed. One `npm run build` succeeded with the existing large-chunk advisory. `git diff --check` passed after removing one whitespace-only line. No browser QA/production certification is claimed.

Read-only development migration inspection confirmed the three M2 migrations remain unapplied; apply them in the normal maintenance workflow before operational UI acceptance. Project Brain references and unrelated findings were preserved.

Final same-date safeguard: date-only rescheduling to the existing date is a no-op after current eligibility validation, preserving physical presence and snapshots. `-k 'same_date_reschedule or reschedule_90_minute_boundary or eta_recovered_and_final_request'`: **4 passed, 50 deselected** (one new case, three directly affected cases rechecked). Final M2 module contains 54 distinct PostgreSQL-verified cases across targeted runs.


### M2 final acceptance verification — 2026-10-11

Acceptance remains pending; the earlier focused readiness statements are not a full-regression or browser acceptance claim.

- The established full backend command `..\.venv\Scripts\python.exe -m pytest -q` completed: **639 passed, 64 failed, 10 skipped** (SQLite, repository `--nomigrations`). It ran against the implementation at acceptance startup, before the corrections below. No clean final full-suite result is claimed.
- Failures include legacy slot/long-horizon assertions, direct approved-schedule editing, cancellation/rescheduling cutoffs, duplicate customer bookings, confirmed phone identity, seven-day schedule projection assumptions, and initial review without configured hours. Failures must be aligned individually with approved policies, not suppressed by relaxing rules. A complete remaining-test baseline reconciliation is still required.
- Corrected invitation acceptance bypass of initial schedule review: new invitees supply validated initial hours and remain inactive pending manager approval; omitted legacy payloads remain INCOMPLETE. Existing approved schedules cannot be replaced through invitation acceptance. Only an active manager of the same organization may approve/reject initial review, under the provider lock. Staff invitation contracts are unchanged.
- Corrected appointment date filtering for legacy null booking dates with a read-only Dhaka datetime-range fallback; populated booking dates remain authoritative even if operational datetimes differ.
- Corrected one erroneous prior M2 test edit expecting serial 1 when only serial 2 was physically checked in.
- Final PostgreSQL command `..\.venv\Scripts\python.exe -m pytest tests/test_m2_lifecycle.py --ds=config.settings.test_postgresql --migrations -q`: **83 passed, 0 failed, 0 skipped**. Includes the nine concurrent/migration cases, invitation transactional rollback and role checks, private attachment download role/tenant matrix, effective-schedule annotation privacy and pending-owner initial preparation without operational access. Isolated `test_queueturn_m2` only.
- Existing onboarding module: **2 passed**. Date-filter/check-in serial regression selection: **2 passed, 21 deselected**. These subsequent passes do not replace the full-suite failure count above.
- All frontend utility tests: **23 passed, 0 failed, 0 skipped**. Final frontend production build passed (existing large-chunk advisory). Focused installed oxlint on invitation page: zero errors, one existing effect warning. An unsuitable initial ESLint invocation failed; project package/lockfiles were not changed.
- `makemigrations --check --dry-run`: no changes detected. Development migrations appointments/0005, providers/0007 and queue/0006 remain unapplied; no development migration, seed or historical reconciliation was executed.
- Historical development duplicate group remains unchanged: two CONFIRMED / WAITING unchecked-in online appointments, serials 1/2, booked 2026-10-06 for 2026-11-06. Both have APPOINTMENT_BOOKED audit events. New provider-locked guards prevent recurrence through supported service writers; owner-approved audited cancellation/reconciliation is separate.
- New schedule attachments are bounded BinaryField data, never public media files, with authenticated scoped attachment downloads (`nosniff`, `no-store`). F-024 remains OPEN for legacy verification FileField media and unverified production storage configuration.
- Browser tooling failed to initialize; no browser acceptance is claimed. Development migrations, manual critical-role workflows, full regression reconciliation and owner closure review remain outstanding. No staged changes, commit or push.


## Batch A / F-024 execution evidence — 2026-10-12

Authorized isolated checks; no existing verification files or development records were moved/edited/deleted and no development migrations were applied.

- `..\.venv\Scripts\python.exe -m pytest tests/test_f024_private_documents.py tests/test_m1_security_onboarding.py apps/organizations/tests/test_verification_workflow.py apps/providers/tests/test_phase_c_onboarding.py -q --tb=short --show-capture=no`: **204 passed** (SQLite; earlier focused implementation checkpoint). Only affected synthetic PDF fixtures and the superseded ordinary-member organization-document assertion were changed.
- Final `..\.venv\Scripts\python.exe -m pytest tests/test_f024_private_documents.py tests/test_m2_lifecycle.py -k 'f024 or attachment' --ds=config.settings.test_postgresql --migrations -q --tb=short --show-capture=no`: **86 passed, 75 deselected, 0 failed** on isolated `test_queueturn_m2`. This includes 78 F-024 cases and 8 unchanged M2 private-attachment cases; the rest of M2 was intentionally not rerun.
- `..\.venv\Scripts\python.exe -m pytest tests/test_m1_security_onboarding.py -k document -q --tb=short --show-capture=no`: **28 passed, 95 deselected**. The final PostgreSQL selection additionally covers the final private-file serializer/media guard changes.
- Intermediate targeted final Windows-alias/media check: **6 passed, 72 deselected** PostgreSQL. Folded into the final 86-pass selection; not an additional independent-case count.
- Frontend `node --test src/utils/privateDocuments.test.js`: **4 passed**. Focused oxlint: no errors; 16 unchanged warnings in existing page code. New helpers/component/tests lint clean after explicitly documenting intentional control-character stripping.
- One `npm run build`: passed (existing large-chunk advisory). No browser acceptance or deployed file-serving verification claimed.
- `makemigrations --check --dry-run`: no changes. `manage.py check`: no issues. `sqlmigrate organizations 0010` and `sqlmigrate providers 0008`: all operations SQL no-ops. Development showmigrations keeps both new migrations unapplied.
- Development `copy_private_verification_documents` dry-run: `apply=False ready=0 pending=0 copied=0 missing=0 legacy_files_retained=898`. No apply/copy/removal performed.

F-024 is **implemented pending secure production/cutover verification**, not owner-closed. Current development references need no copy. Retained unreferenced files are blocked by Django's media guard; actual external serving paths and persistent private storage remain deployment prerequisites. Existing M2 browser acceptance/live ETA recovery follow-ups remain untouched.


## Batch B scoped implementation and acceptance — 2026-10-12

| Finding | Verified implementation scope | Remaining acceptance |
|---|---|---|
| F-008 | Fixed provider/date allocation capacity shared by booking/rescheduling; clipped union of breaks/effective partial leave; completed/no-show still consume allocation; coordinated provider locks. | Development migration and owner workflow acceptance; historical duplicate reconciliation remains separate. |
| F-009 | Single configured provider average for capacity/ETA, guarded unsafe changes; no speculative duration snapshots. Null legacy averages remain unknown; mixed configuration requires explicit owner/manager configuration. | Review flagged legacy configuration before rollout; no fabricated backfill. |
| F-010 | Approved reservation/physical separation, time-first thresholds, 15/20/25/30 own-manager buffer, first allocation exception, date-only idempotent presence and reliable/unavailable/recovered ETA. | Browser/live workflow acceptance; emergency recovery policy gap described below. |
| F-015 | Customer live page no longer requests private operator queue or fabricates a QueueEntry after denied requests; owned dashboard/detail telemetry only. | Browser acceptance after migration. |
| F-016 | Frontend preserves backend physical people_ahead, including active service, and no missing-telemetry count invention. | Browser count presentation acceptance. |
| F-023 | Scoped latest-started and account/tenant/provider/date guards on customer live/detail/dashboard/list, provider/staff queues and notification bell; mutations invalidate old polling results; unmount closes request scope. | Scoped regression verified; broader unrelated polling consumers are not incidentally declared fixed. No production/browser race certification. |

M1/M2 rules are preserved. F-005 destination capacity now shares the fixed budget; unrelated F-005/D11 repricing questions are not closed incidentally. F-024 production storage/serving remains separately qualified. Findings retain original priority and owner closure requirements.

**Specific blocker:** the presumed emergency leave/recovery workflow and its notifications do not exist in inspected source. Emergency notice/approval exceptions and staff authority are unspecified; owner clarification was requested. No alternative emergency policy implemented. This does not block independent fixed capacity, planned leave, duration, readiness or customer-safe polling changes.

Two minimal additive migrations were created; none applied to development. Legacy leave keeps NULL review status (effective block, approval unknown); provider average remains NULL without fabricated historical values. No real users, appointments, queues, historical duplicates or sensitive files were modified, copied or deleted. No seed/reset or deployment operation.

### Batch B final verification evidence

- Final affected integration: **415 passed, 0 failed, 14 skipped** on isolated SQLite, repository `--nomigrations`, with a temporary test-only MD5PasswordHasher override for synthetic fixture performance. Production hashers/configuration are unchanged. Exact launcher and modules are recorded in Batch B historical regression checkpoints.
- Final PostgreSQL core checkpoint: **157 passed, 0 failed, 0 skipped**: then-current Batch B cases, all 83 M2 cases and four corrected M1/F-024 assertions. After the final legacy-date schedule correction, **119 passed, 37 deselected, 0 failed**: all 73 final Batch B cases plus 46 affected M2 schedule/approval/notice cases; untouched M2 cases retain their earlier execution evidence. Real migration and concurrent booking/leave/average tests use isolated `test_queueturn_m2`, never the development database.
- Additional multi-customer/runtime regressions: **12 passed** with test-only fast fixture hashing. The obsolete count-first check-in assertion was replaced by controlled-clock early-presence NOT_YET, later BE_READY and actual CALLED/IN_PROGRESS assertions; four-customer serial/lifecycle coverage remains.
- Frontend `node --test --test-reporter=spec src/utils/*.test.js`: **42 passed, 0 failed, 0 skipped**. Focused installed oxlint: **19 changed files, 0 errors, 48 nonfatal warnings** (18 unused-variable, 16 effect-state, 14 effect-dependency advisories); new helper/component files lint clean. No suppression/dependency installation.
- Final `npm run build` passed (existing >500 kB chunk advisory). One earlier build checkpoint also passed, before the slow-poll/stale-time corrections warranted the final build. No browser acceptance claimed.
- Django check: no issues, none silenced. `makemigrations --check --dry-run`: no changes. Planned/inspected SQL contains only the two additive Batch B migrations, nullable legacy fields and positive/allowed-value constraints. Not applied to development.
- Read-only development inventory: **103 users, 9 organizations, 51 providers, 102 appointments, 102 QueueEntries, zero verification-document references and zero leave records**. One historical active duplicate group remains. Existing provider configuration yields 34 uniform compatibility averages; **16 mixed and one missing** require explicit provider-average configuration before booking/ETA. No automatic backfill or historical reconciliation performed.

Independent approved Batch B contracts are implemented and regression-verified. Full Batch B closure remains pending the emergency-policy clarification, owner-approved development migration/configuration and browser/live workflow acceptance. No claim of a full backend suite rerun, production certification or emergency-notification verification.

## Approved emergency interruption implementation — 2026-10-13

The Batch B emergency-policy blocker above is historical and is now superseded by the owner's explicit emergency specification. The focused implementation supplies provider/date hold, guarded resumption/final closure, scoped notifications/email attempts, actual interrupted-work association and staff consent-based recovery. It grants no unrestricted staff self-service override and does not mark unrelated findings/decisions closed.

**Implementation status:** source and isolated regression verified, pending owner-approved development migrations and browser/live operational acceptance. Not a deployment or delivery certification. See `BUSINESS_RULES.md`, `QUEUE_STATE_MACHINE.md`, `ROLE_PERMISSION_MATRIX.md` and `PRODUCT_ARCHITECTURE.md` amendments for the authoritative contract.

Remaining rollout/acceptance items:

1. Back up and stop writers before explicitly approved migration of Batch B dependencies and the three emergency migrations. No development migration was authorized/performed during this task.
2. Verify provider declaration, manager resume/finalization, staff actual contact/consent/replacement and customer details in a real browser after rollout; live reliable/recovered ETA acceptance from M2 remains pending.
3. Verify actual emergency email delivery with approved recipients and production sender configuration. Ledger acceptance is not delivery; ambiguous SENDING/UNKNOWN require manual reconciliation. External in-flight messages cannot be recalled. No live emails were sent during tests.
4. Preserve the one historical duplicate group. Reconciliation remains owner-directed; this implementation does not alter it.
5. Preserve manager-confirmed average-duration rollout for 16 mixed and one missing legacy provider, plus existing F-024 production/private-storage and F-025 schema annotation follow-ups.

No unresolved emergency business-policy decision remains within this authorized scope. Existing infrastructure/browser follow-ups remain explicit rather than being treated as source defects.

### Emergency inspection corrections — 2026-10-13

The independent source review identified a repeat-incident association defect and a real-adapter uncertainty classification defect despite the prior green tests. Both are corrected within the approved workflow. Genuine new incidents preserve the previous incident and recovery history; real uncertain transport results reach UNKNOWN rather than retryable FAILED. The legacy NULL-date duplicate-check gap is also corrected with the existing capacity predicate, without data cleanup.

Added focused assertions cover the exact away-and-back sequence, repeated/concurrent declarations, old resumption retry suppression, positive resumed customer notices/email attempts, staff ATTENDING without fabricated check-in, next-day owned dashboard/API recovery, actual completion versus cancellation/replacement races, and NULL-date/timezone/explicit-date booking consistency. No new policy, role authority or feature phase was introduced.

Current correction PostgreSQL verification: **279 passed, 0 failed, 0 skipped**. Includes all M2/Batch B cases and related email/contact/password-reset behavior. The new forward providers 0012 migration has no data operation; six development migrations are pending in total. Browser/live delivery, M2 live ETA recovery, manager-confirmed legacy averages and owner-directed historical duplicate reconciliation remain rollout tasks. No development migration, seed or existing-record mutation was performed. Frontend source is unchanged in this correction; no frontend build/test rerun was needed.
