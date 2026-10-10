# QueueTurn Known Issues and Evidence Register

## Metadata and authority

- **Phase/date:** Project Brain Phase 3, 2026-10-09.
- **Source baseline:** `main` / `4a9920c3a648c2925dc30956005a1c28a015918f`; application source unchanged; Phase 2 documentation initially untracked.
- **Purpose:** Canonical independent records for F-001–F-025, retaining baseline priorities and evidence qualifications. The original Phase 3 register introduced no fixes; the M1 closure update below records separately approved resolutions and follow-ups.
- **Inputs:** [Historical handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md), [baseline assessment](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md), completed Phase 1 mapping, current source and all three Phase 2 canonical documents.
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

OPEN means the source condition remains, including policy-dependent gaps; it does not claim a live incident. UNVERIFIED means applicability/evidence remains insufficient. CLOSED means the owner accepted the implemented correction against its scoped acceptance criteria and recorded evidence; it is not universal production certification. The original 23 findings were OPEN at Phase 3. Six are now CLOSED under M1; the other 17 remain OPEN. F-024 (P1 / High) and F-025 (P3 / Low) are new OPEN follow-ups, not reclassifications of baseline findings.

## Findings index

| ID / detail | Priority | Title | Subsystem | Evidence | BR IDs | Decisions | Status |
|---|---|---|---|---|---|---|---|
| [F-001](#f-001) | P1 | Public document metadata | Discovery projections | S/T/H; historical R | BR-004,006,056 | None | CLOSED |
| [F-002](#f-002) | P2 | Incorrect document field | Onboarding docs | S/T; historical R | BR-004,010,056 | None | CLOSED |
| [F-003](#f-003) | P2 | Inactive applicant blocked | Onboarding permissions | S/T/H; historical R | BR-002,010,056 | None | CLOSED |
| [F-004](#f-004) | P2 | Partial account persists | Registration transaction | S/T; historical R | BR-001,002 | None | CLOSED |
| [F-005](#f-005) | P1 | Reschedule parity missing | Destination booking | S/H | BR-010,016–024,030,031 | D01–D03,D11 | OPEN |
| [F-006](#f-006) | P1 | Stale lifecycle mutations | Concurrency | S/I | BR-024,035,041,042,044 | D08,D11,D19,D20 | OPEN |
| [F-007](#f-007) | P1 | Global/overnight cleanup | Reconciliation | S/T/H | BR-004,039,041,045,049 | D08,D15–D20 | OPEN |
| [F-008](#f-008) | P2 | Usable capacity unclear | Availability | S/H | BR-016–019,021 | D01–D03 | OPEN |
| [F-009](#f-009) | P2 | Mutable/base ETA duration | Duration/history | S/H | BR-020,029,047,048 | D04 | OPEN |
| [F-010](#f-010) | P2 | Forecast/window/readiness | ETA/check-in | S/H | BR-035,037,046–050 | D05–D07 | OPEN |
| [F-011](#f-011) | P2 | Urgent coordination | Priority mutation | S/I | BR-038–040 | D10 | OPEN |
| [F-012](#f-012) | P1 | Walk-in body provider missing | UI/API payload | S | BR-034 | None | OPEN |
| [F-013](#f-013) | P2 | Nonunique phone identity | Walk-in accounts | S/I | BR-001,026,027,034 | D09 | OPEN |
| [F-014](#f-014) | P2 | Legacy serial not persisted | Check-in repair | S | BR-030–032,035 | None | OPEN |
| [F-015](#f-015) | P2 | Customer calls private queue | Telemetry consumer | S | BR-004,046,049 | None | OPEN |
| [F-016](#f-016) | P2 | Active person dropped | Queue display | S | BR-046,047,049 | D05 | OPEN |
| [F-017](#f-017) | P2 | Browser business-date mismatch | Temporal display | S/I | BR-022,049 | D08 context | OPEN |
| [F-018](#f-018) | P2 | Break integrity gaps | Schedule writers | S/I | BR-016,017,021 | D01,D02 | OPEN |
| [F-019](#f-019) | P2 | Internal schedule text exposed | Authenticated projections | S/T/H; historical R | BR-004,016,018 | None | CLOSED |
| [F-020](#f-020) | P2 | Detail publication differs | Service discovery | S/T; historical R | BR-004,006 | None | CLOSED |
| [F-021](#f-021) | P2 | Send outcomes discarded | Support/reset | S/T | BR-057–061 | D13 | OPEN |
| [F-022](#f-022) | P2 | Route/signature mismatch | Analytics | S | BR-004 | None | OPEN |
| [F-023](#f-023) | P2 | Obsolete polling responses | Frontend state | S/I | BR-004,049,053,054 | None | OPEN |
| [F-024](#f-024) | P1 / High | Private Verification Document Serving and Production Storage Authorization | Storage/deployment | S; production U | BR-004,056 context | Storage design approval | OPEN — Mandatory Pre-Production Security Gate |
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
6. **Current behavior:** Provider lock but no initial-booking capacity or equivalent operational/assignment checks; explicit windows weaker; any overlapping leave rejects unlike date-only booking's full-cover check.
7. **Source:** `backend/apps/appointments/services.py::AppointmentService.reschedule_appointment, book_appointment, check_provider_date_capacity`.
8. **Evidence:** S/H.
9. **Confirmed gap:** Weaker/different destination validation than initial booking.
10. **Unverified consequences:** No invalid/full destination created; partial/remaining-day algorithm pending.
11. **BR:** BR-010, BR-016–BR-024, BR-030, BR-031.
12. **Contradictions:** C-04.
13. **Decisions:** D01, D02, D03, D11.
14. **Minimum verification:** Full capacity, inactive provider/service, removed assignment, window/break/leave edges and same-day self-exclusion; snapshot retention.
15. **Acceptance:** Approved parity enforced transactionally; no fixed consultation slots, duplicate serial or silent repricing.
16. **Regression:** Both-store serial allocation; own/provider permission differences; legacy missing queue; snapshots preserved unless D11 authorizes change.
17. **Status:** OPEN — confirmed validation gap, policy gate remains.

## F-006

1. **ID / priority:** F-006 — P1, unchanged.
2. **Title:** Stale cancellation/rescheduling and lifecycle concurrency risks.
3. **Components:** Appointment mutations versus check-in/start/complete.
4. **Roles/tenants:** Owner, assigned canceling provider, staff/manager/admin for target booking.
5. **Intended behavior:** Fresh linked-state checks under compatible coordination; valid action wins, losing invalid action rejects.
6. **Current behavior:** Cancel checks passed object before atomic, no provider/fresh appointment lock. Reschedule locks provider but uses stale passed appointment. Queue lifecycle refetches locked records.
7. **Source:** `backend/apps/appointments/services.py::AppointmentService.cancel_appointment, reschedule_appointment`; `backend/apps/queue/services.py::QueueService.check_in_appointment, start_queue_entry, complete_queue_entry`.
8. **Evidence:** S/I; race outcome U.
9. **Confirmed gap:** Missing fresh-state coordination; atomic writes do not refresh objects.
10. **Unverified consequences:** Overwrite newer status or move progressed booking I; requires PostgreSQL interleavings.
11. **BR:** BR-024, BR-035, BR-041, BR-042, BR-044.
12. **Contradictions:** None directly mapped.
13. **Decisions:** D08/D11/D19/D20 context.
14. **Minimum verification:** Two PostgreSQL connections/barriers: cancel/reschedule versus check-in/start; final linked state/serial/timestamps/events. Default SQLite insufficient.
15. **Acceptance:** Compatible lock order and fresh validation; coherent committed state; losing action rejects without misleading events.
16. **Regression:** Sequential rejects plus actual races; permission distinctions; no deadlock-freedom claim from one test.
17. **Status:** OPEN — coordination gap; incident unverified.

## F-007

1. **ID / priority:** F-007 — P1, unchanged.
2. **Title:** Global historical reconciliation and overnight IN_PROGRESS risk.
3. **Components:** Queue read/call-triggered cleanup and live helper.
4. **Roles/tenants:** All tenants with past nonterminal entries; overnight consultations.
5. **Intended behavior:** Deliberately scoped correction, preserving genuine ongoing service; provider failure is not customer absence.
6. **Current behavior:** Listing/call invokes global past WAITING/CALLED/IN_PROGRESS→SKIPPED; linked CONFIRMED/CHECKED_IN/IN_PROGRESS→NO_SHOW. Appointment live helper preserves cross-midnight IN_PROGRESS.
7. **Source:** `backend/apps/queue/services.py::QueueService.list_provider_queue, call_next, reconcile_stale_historical_queue_entries`; `backend/apps/appointments/serializers.py::_get_is_live_queue`; `backend/tests/test_phase_a6_appointments_cleanup.py`.
8. **Evidence:** S/T/H; T helper assertion is not cleanup safety test.
9. **Confirmed gap:** Global side effect includes ongoing service and bypasses ordinary transition guards.
10. **Unverified consequences:** Actual tenant/overnight mutation not run; concurrent collision I.
11. **BR:** BR-004, BR-039, BR-041, BR-045, BR-049.
12. **Contradictions:** C-15.
13. **Decisions:** D08, D15–D20.
14. **Minimum verification:** Two-tenant past waiting/called/in-progress fixtures and overnight service; queue access A must not mutate B; PostgreSQL cleanup versus lifecycle.
15. **Acceptance:** Approved scope/session ownership and audited correction; no fabricated no-show/completion of protected service.
16. **Regression:** Actual cleanup plus live helper, cross-midnight guard, unrelated tenant, past terminal records; no unapproved universal exemption.
17. **Status:** OPEN — source scope/lifecycle conflict.

## F-008

1. **ID / priority:** F-008 — P2, unchanged.
2. **Title:** Partial leave and usable-capacity ambiguity.
3. **Components:** Date availability/capacity.
4. **Roles/tenants:** Customers/providers with partial leave or late-day demand.
5. **Intended behavior:** Handoff requires usable availability/reduced partial-leave capacity; exact total-versus-remaining-day budget needs decision.
6. **Current behavior:** Subtracts breaks, not partial leave/elapsed time; completed work stops blocking; date-only end can exceed closing with total-day capacity.
7. **Source:** `backend/apps/appointments/services.py::check_provider_date_capacity, AppointmentService.book_appointment`; `backend/apps/appointments/models.py::Appointment` blocking states.
8. **Evidence:** S/H.
9. **Confirmed gap:** Partial deduction absent; elapsed/completed budget not fully approved. Not every current branch is an established defect.
10. **Unverified consequences:** Misleading late-day capacity I; chosen algorithm U.
11. **BR:** BR-016–BR-019, BR-021.
12. **Contradictions:** C-04.
13. **Decisions:** D01–D03.
14. **Minimum verification:** After decisions: late-day/completed-work, partial/combined leave, overlapping breaks, today versus future.
15. **Acceptance:** Approved clipped/union interval arithmetic without double subtraction or fixed patient slots; org-hours independence retained unless D03 changes it.
16. **Regression:** Exactly one duration remaining, full leave, adjacent intervals, late-day and full-day budget boundaries.
17. **Status:** OPEN — source limitation plus pending policy.

## F-009

1. **ID / priority:** F-009 — P2, unchanged.
2. **Title:** ETA duration source and missing immutable historical duration.
3. **Components:** Booking, workload, active/waiting ETA and history.
4. **Roles/tenants:** All forecast consumers; custom-duration providers.
5. **Intended behavior:** Consistent effective provider duration; explicitly approved history basis.
6. **Current behavior:** Booking/capacity use current truthy override; existing workload recalculates assignment; ETA uses current base service; no booked-duration snapshot.
7. **Source:** `backend/apps/appointments/services.py::get_effective_duration_minutes, check_provider_date_capacity`; `backend/apps/queue/services.py::QueueService.calculate_readiness_and_eta`; `backend/apps/appointments/models.py::Appointment`.
8. **Evidence:** S/H.
9. **Confirmed gap:** ETA ignores effective custom duration; price snapshot does not freeze duration.
10. **Unverified consequences:** Later-edit history/ETA drift I; chosen historical basis pending.
11. **BR:** BR-020, BR-029, BR-047, BR-048.
12. **Contradictions:** C-05.
13. **Decisions:** D04.
14. **Minimum verification:** Override/base bookings then edit duration; compare preceding workload, own/other active remaining and legacy intervals.
15. **Acceptance:** Approved basis consistent across booking/capacity/ETA; no fabricated historical backfill or duration-triggered completion.
16. **Regression:** Truthy override/legacy fallback, overdue active state, mutable assignments, price/contact snapshot independence.
17. **Status:** OPEN — mismatch; history policy unresolved.

## F-010

1. **ID / priority:** F-010 — P2, unchanged.
2. **Title:** Forecast/check-in/readiness contract ambiguity.
3. **Components:** Arrival guidance, ETA populations and callable queue.
4. **Roles/tenants:** Waiting/checked customers and queue operators.
5. **Intended behavior:** Label reservation versus physical forecast; approve timing/precedence.
6. **Current behavior:** Unchecked reservations affect ETA, not call selection; today six-hour opening metadata not enforced; future offset differs; low count precedes some time conditions.
7. **Source:** `backend/apps/queue/services.py::QueueService.call_next, calculate_readiness_and_eta, check_in_appointment`.
8. **Evidence:** S/H.
9. **Confirmed gap:** Source differences need a single approved contract; not uniformly bugs.
10. **Unverified consequences:** Premature/contradictory guidance I; intended thresholds U.
11. **BR:** BR-035, BR-037, BR-046–BR-050.
12. **Contradictions:** C-06, C-07, C-08.
13. **Decisions:** D05–D07.
14. **Minimum verification:** Policy tables for unchecked/active predecessors, low count far from service, 15/45-minute edges, date branches and owner HTTP check-in.
15. **Acceptance:** Approved labels/population/window precedence; presence-gated calling; no claimed enforcement from advisory metadata.
16. **Regression:** Raw dictionary versus UI suppression, today/future/past, GET_READY precedence; no assumed six-hour restriction.
17. **Status:** OPEN — policy-dependent source differences.

## F-011

1. **ID / priority:** F-011 — P2, unchanged.
2. **Title:** Urgent priority mutation safeguards and locking.
3. **Components:** Urgent write versus Call Next.
4. **Roles/tenants:** Authorized operators and waiting customers.
5. **Intended behavior:** Auditable coordinated priority; approved allowed states/reason.
6. **Current behavior:** Atomic ordinary lookup, no provider/entry row lock; _lock_entry is ordinary query; reason optional; terminal entries flaggable but noncallable.
7. **Source:** `backend/apps/queue/services.py::QueueService.mark_urgent, _lock_entry, call_next`; `backend/apps/queue/serializers.py::MarkUrgentSerializer`.
8. **Evidence:** S/I.
9. **Confirmed gap:** Selection coordination absent; state/reason policy unresolved.
10. **Unverified consequences:** Selection may observe old priority I; no race/terminal recall demonstrated.
11. **BR:** BR-038–BR-040.
12. **Contradictions:** None directly mapped.
13. **Decisions:** D10.
14. **Minimum verification:** Approved state/reason tables then PostgreSQL urgent versus call-next barrier; audit/serial assertions.
15. **Acceptance:** Approved mutation order/state/reason; no serial reassignment or active-service interruption.
16. **Regression:** Urgent order, unchecked exclusion, foreign actors, terminal not called, source channels do not affect priority.
17. **Status:** OPEN — source coordination gap; race U.

## F-012

1. **ID / priority:** F-012 — P1, unchanged.
2. **Title:** Provider walk-in UI omits required request-body provider_id.
3. **Components:** Command-board form, request service, serializer/view.
4. **Roles/tenants:** Own provider/front-desk callers in target organization.
5. **Intended behavior:** Authorized URL-scoped walk-in works through shared booking/serial/snapshot path.
6. **Current behavior:** Form omits provider_id; queueService posts unchanged; serializer requires it before view uses URL ID and ignores body value.
7. **Source:** `frontend/src/pages/provider/ProviderQueuePage.jsx`; `frontend/src/services/queueService.js::registerWalkIn`; `backend/apps/queue/serializers.py::WalkInRegisterSerializer`; `backend/apps/queue/views.py::WalkInRegisterView`.
8. **Evidence:** S — exact UI/API contract.
9. **Confirmed gap:** Frontend body and required input disagree.
10. **Unverified consequences:** Source form shape fails validation; browser/API execution not performed.
11. **BR:** BR-034.
12. **Contradictions:** C-12.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Exact frontend payload; missing/valid/conflicting body provider IDs; authorized/foreign target; check returned serial, checked WAITING and snapshots.
15. **Acceptance:** UI/API agree, URL tenant/provider authoritative, conflicts safely handled, server price and shared serial retained.
16. **Regression:** Provider and staff/manager callers, contact forwarding, no independent source queue or form redesign.
17. **Status:** OPEN — confirmed contract defect, not runtime reproduced.

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
2. **Title:** Legacy serial allocation/persistence mismatch.
3. **Components:** Missing-entry check-in repair.
4. **Roles/tenants:** Legacy appointment owners/operators.
5. **Intended behavior:** Persist synchronized provider/date/serial identity through compatible allocator.
6. **Current behavior:** Allocates queue-only maximum, assigns appointment serial in memory, then save(update_fields) omits serial_number.
7. **Source:** `backend/apps/queue/services.py::QueueService.check_in_appointment`; `backend/apps/appointments/models.py::Appointment`; `backend/apps/queue/models.py::QueueEntry`.
8. **Evidence:** S.
9. **Confirmed gap:** Queue can have persisted serial while appointment does not; appointment-only history excluded from maximum.
10. **Unverified consequences:** Actual mismatch/collision not created; write-fields omission confirmed.
11. **BR:** BR-030–BR-032, BR-035.
12. **Contradictions:** C-02 context, not merely stale model comment.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Null-serial/no-entry legacy record plus higher appointment-only serial; check-in then refetch both; repeat must not allocate again.
15. **Acceptance:** One persistent matching serial/date/provider/token accounting for both stores; normal serials unchanged.
16. **Regression:** Normal existing-entry path, uniqueness, concurrent repair on PostgreSQL; preserve unknown legacy snapshot facts.
17. **Status:** OPEN — persistence gap; runtime not reproduced.

## F-015

1. **ID / priority:** F-015 — P2, unchanged.
2. **Title:** Customer live queue calls private operational endpoint.
3. **Components:** Customer telemetry consumer/private provider queue permission.
4. **Roles/tenants:** Owner customer versus operational queue readers.
5. **Intended behavior:** Owner-safe telemetry without other customers' full operational queue.
6. **Current behavior:** CustomerLiveQueuePage calls getProviderQueue then swallows denial; CanManageProviderQueue excludes ordinary customer.
7. **Source:** `frontend/src/pages/customer/CustomerLiveQueuePage.jsx`; `frontend/src/services/queueService.js::getProviderQueue`; `backend/apps/queue/permissions.py::CanManageProviderQueue`.
8. **Evidence:** S.
9. **Confirmed gap:** Consumer uses endpoint outside entitlement, discards expected error.
10. **Unverified consequences:** Repeated denied calls/context loss source-supported; no network trace captured.
11. **BR:** BR-004, BR-046, BR-049.
12. **Contradictions:** C-11 context.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Customer request inventory and owner-safe readiness fixture; retain private queue deny assertions.
15. **Acceptance:** Supported safe resource, no repeated forbidden fetch; do not widen operational permissions.
16. **Regression:** Own/other booking, foreign tenant, role switch, authorized operator full queue.
17. **Status:** OPEN — contract mismatch, runtime U.

## F-016

1. **ID / priority:** F-016 — P2, unchanged.
2. **Title:** Frontend/backend people-ahead discrepancy.
3. **Components:** Queue count presentation.
4. **Roles/tenants:** Customer dashboard/detail/live queue.
5. **Intended behavior:** Authoritative physical count or clearly labeled distinct metric.
6. **Current behavior:** Backend includes other active service; queueDisplay substitutes checked/scheduled ahead counts, dropping active contribution.
7. **Source:** `backend/apps/queue/services.py::QueueService.calculate_readiness_and_eta`; `frontend/src/utils/queueDisplay.js`.
8. **Evidence:** S; rendered consequence I.
9. **Confirmed gap:** Frontend count source differs from backend physical count.
10. **Unverified consequences:** Active plus zero waiting can display zero versus backend one; not rendered/tested here.
11. **BR:** BR-046, BR-047, BR-049.
12. **Contradictions:** C-13.
13. **Decisions:** D05.
14. **Minimum verification:** One active/zero checked predecessors/unchecked reservations fixture across utility consumers.
15. **Acceptance:** Correctly labeled count follows backend/approved D05 dual-metric contract; active contribution preserved.
16. **Regression:** Active/none, urgent, terminal/future/past suppression, null/missing metadata.
17. **Status:** OPEN — source mismatch, browser U.

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
2. **Title:** Schedule and break integrity gaps.
3. **Components:** Schedule upsert, break creation, capacity inputs.
4. **Roles/tenants:** Own providers/managers and dependent bookings.
5. **Intended behavior:** Coherent working windows/breaks under compatible writer coordination.
6. **Current behavior:** Shrink/nonworking change does not revalidate existing breaks; overlap check/create not serialized against competing writes/schedule edits.
7. **Source:** `backend/apps/providers/services.py::ProviderService_.create_or_update_schedule, add_break`; `backend/apps/providers/models.py::WeeklySchedule, ScheduleBreak`.
8. **Evidence:** S/I.
9. **Confirmed gap:** Stored-break integrity not enforced on schedule edit; no cross-row overlap constraint.
10. **Unverified consequences:** Invalid break follows shrink path; simultaneous overlapping creation I until PostgreSQL reproduction.
11. **BR:** BR-016, BR-017, BR-021.
12. **Contradictions:** C-04 context.
13. **Decisions:** D01/D02 capacity context; reject/adjust contract needs approval.
14. **Minimum verification:** Shrink/nonworking fixture with existing breaks; PostgreSQL concurrent break create/edit; capacity result.
15. **Acceptance:** Approved reject/adjust policy maintains within-window/nonoverlapping breaks under coordination.
16. **Regression:** Adjacent nonoverlap, endpoints, multiple breaks, own/foreign permissions; partial leave remains separate.
17. **Status:** OPEN — validation gap; race U.

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
6. **Current behavior:** Nested metrics/export receive extra org kwarg; global summary misses required org kwarg; dashboard nested path repeats org context. Invalid manager helper has no active caller found.
7. **Source:** `backend/config/urls.py`; `backend/apps/analytics/urls.py`; `backend/apps/analytics/views.py::ProviderMetricsView, AnalyticsExportView, AnalyticsSummaryView, OrganizationDashboardView`; `frontend/src/services/managerService.js`.
8. **Evidence:** S.
9. **Confirmed gap:** Mounts not signature-equivalent; unused helper contract separate from active dashboard.
10. **Unverified consequences:** Exact dispatch/resolver errors depend on mount; no proof active manager dashboard broken from unused helper.
11. **BR:** BR-004.
12. **Contradictions:** None directly mapped.
13. **Decisions:** None directly mapped; deliberate supported-route contract needed.
14. **Minimum verification:** Resolve/authorized dispatch each summary/metrics/dashboard/export mount; expected kwargs, permission negatives and actual client usage.
15. **Acceptance:** Explicit supported signatures and consistent target scope; intentional compatibility retained.
16. **Regression:** Global/nested routes, query-target exports, own/foreign tenant and provider, active client versus unused helper.
17. **Status:** OPEN — routing mismatch; runtime U.

## F-023

1. **ID / priority:** F-023 — P2, unchanged.
2. **Title:** Stale asynchronous polling responses.
3. **Components:** Customer/staff queue and NotificationBell state.
4. **Roles/tenants:** Recipient/customer/staff switching route/provider/tenant.
5. **Intended behavior:** Obsolete responses never replace current resource state; appropriate quiet error handling.
6. **Current behavior:** Clear intervals without consistent abort/version invalidation; old requests can finish after context changes; failures sometimes swallowed.
7. **Source:** `frontend/src/pages/customer/CustomerLiveQueuePage.jsx`; `frontend/src/pages/staff/StaffQueuePage.jsx`; `frontend/src/components/NotificationBell.jsx`.
8. **Evidence:** S/I.
9. **Confirmed gap:** Scheduling cleanup is not invalidation of pending asynchronous responses.
10. **Unverified consequences:** Old-tenant transient display I, not reproduced and not proof backend granted unauthorized access.
11. **BR:** BR-004, BR-049, BR-053, BR-054.
12. **Contradictions:** None directly mapped.
13. **Decisions:** None directly mapped.
14. **Minimum verification:** Deferred old response completes after new request; context switch/unmount/logout/overlapping polls; current state unchanged.
15. **Acceptance:** Obsolete results discarded, timers/requests cleaned; no permission widening or noisy background polling.
16. **Regression:** Recipient/tenant and queue provider changes, auth errors, mounted/unmounted ordering, count/date contract.
17. **Status:** OPEN — source synchronization gap; overwrite U.

## F-024

1. **ID / priority:** F-024 — P1 / High; new post-M1 follow-up, not a baseline severity change.
2. **Title:** Private Verification Document Serving and Production Storage Authorization.
3. **Classification:** Mandatory Pre-Production Security Gate.
4. **Components / source:** `backend/config/urls.py`; `config/settings/base.py`, `development.py`, `production.py`; `config/wsgi.py`, `asgi.py`; `backend/Procfile`; provider/organization document FileFields and serializers; `frontend/vite.config.js` media proxy.
5. **Roles/tenants:** Provider/organization document owners, entitled reviewers and unauthorized known-URL requesters.
6. **Intended behavior:** Verification documents are retrievable only by appropriately authenticated, authorized actors within the correct tenant/object scope.
7. **Current behavior / evidence:** S — DEBUG `/media/` uses Django's static media helper without document API permissions. Files reside under `MEDIA_ROOT` in `provider_docs/%Y/%m/` and `organization_docs/%Y/%m/`; API FileFields can generate media URLs for entitled readers. No confirmed authenticated private-download mechanism, private storage implementation or signed URL handling was found. Public API redaction does not revoke previously known URLs.
8. **Deployment qualification:** Production settings set DEBUG=False, which removes that Django helper but does not prove private reverse-proxy/storage ACLs. Those deployed controls are U. WSGI/ASGI default to development settings unless externally overridden; Procfile invokes WSGI. Actual deployment settings must be verified. No real private document was requested and no production exposure incident is claimed.
9. **Impact:** Known valid URLs can bypass API authorization in DEBUG serving; private identity/licence material could be disclosed. Production exploitability depends on unverified hosting configuration.
10. **BR / boundaries:** BR-004/BR-056 privacy context. F-001 API closure does not resolve this independent serving-layer root cause.
11. **Owner decision:** Separately approve authenticated downloads/private storage or equivalent access controls; this record does not implement or choose a storage design.
12. **Verification plan:** Use synthetic files and authorized isolated deployment checks for anonymous, owner, reviewer and foreign-tenant retrieval; inspect actual settings, proxy mappings and storage ACLs. Do not request real private documents merely to demonstrate exposure.
13. **Acceptance:** Unauthorized direct retrieval is prevented across the actual deployment serving paths; permitted reads enforce ownership/tenant authority; any signed URLs have reviewed scope/expiry semantics; actual production settings are confirmed before real sensitive documents are hosted.
14. **Regression:** Public logos/avatars and discovery remain functional; private access cannot be restored by knowing an old URL or substituting an object/tenant ID.
15. **Status:** OPEN — mandatory pre-production gate; no storage correction or production authorization verification completed.

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

Unconfirmed architecture/environment lead, not new finding. Root `requirements.txt` declares pytest 8.4.2/Resend; `backend/requirements.txt` declares pytest 9.1.1 and omits Resend. `backend/apps/contact/email_service.py` imports resend. Declaration discrepancy S; installed versions, authoritative deployment requirements and startup failure U. Historical F12 remains separate. Future environment/deploy inventory precedes any separately authorized adjustment; no package installation or live dependency query here.

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
