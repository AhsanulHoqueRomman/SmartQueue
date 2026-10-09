# QueueTurn Appointment and Queue State Machine

## Metadata and authority

- **Phase/date:** Project Brain Phase 2, 2026-10-09; source baseline `main` / `4a9920c`.
- **Scope:** Linked lifecycle, declared versus implemented transitions, per-operation locking and exact source-level ETA behavior.
- **Inputs:** [Handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md), [baseline](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md), Phase 1 report and unchanged current executable source. Both references were read completely.
- **Evidence:** S = SOURCE VERIFIED; T = TEST ASSERTION INSPECTED, NOT EXECUTED; H = HISTORICAL PRODUCT INTENT; D = DOCUMENTED BUT NOT VERIFIED; I = INFERRED, REQUIRES VERIFICATION; U = UNKNOWN. R = RUNTIME VERIFIED is unused.
- **Policy:** APPROVED / ESTABLISHED is explicit intent; CURRENT IMPLEMENTATION can also be a KNOWN DEFECT. POLICY PENDING is not an approved behavior. DEPRECATED / LEGACY and NOT VERIFIED qualify old paths/claims.
- **Limits:** No runtime, API, database, browser, tests or concurrency execution. Paths are repository-relative; line locations approximate. Source behavior is not a safety certification.
- **Ownership:** [Business rules](BUSINESS_RULES.md) own BR-001–BR-062 and D01–D20. [Role matrix](ROLE_PERMISSION_MATRIX.md) owns actor authorization. [Product Architecture](PRODUCT_ARCHITECTURE.md) and [Known Issues](KNOWN_ISSUES.md), planned at Phase 2 creation, now own technical architecture and detailed findings.
- **Maintenance:** Recheck service enforcement, locks, linked writes and consumers together after authorized changes; never infer a workflow from an enum alone.

## State definitions

Source: `backend/apps/appointments/models.py::Appointment` and `backend/apps/queue/models.py::QueueEntry` — S.

| Model / field | Exact values | Meaning |
|---|---|---|
| Appointment.status | PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW | Reservation/service business status |
| QueueEntry.status | WAITING, CALLED, IN_PROGRESS, COMPLETED, SKIPPED, CANCELLED, NO_SHOW | Operational status; CALLED is not started service |
| QueueEntry.readiness_state | NOT_YET, GET_READY, BE_READY, TURN_NOW, IN_SERVICE | Persisted field default NOT_YET; not operational status |
| Appointment.booking_channel | ONLINE, PHONE, FRONT_DESK | Source metadata, not selection priority |
| Appointment.arrival_type | SCHEDULED, WALK_IN | Arrival dimension independent of source |

Presence uses persisted `is_checked_in` and `checked_in_at`. Operational timestamps include `called_at`, `started_at`, `completed_at`, `skipped_at`. Priority uses `is_urgent`/`urgent_reason`; serial/token remain ordering identity. QueueEntry has an Appointment one-to-one relationship and provider/date serial constraints; Appointment has provider/date/serial uniqueness.

`QueueEntry.ACTIVE_STATUSES` is CALLED and IN_PROGRESS. Appointment workload-blocking statuses are PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS. Appointment COMPLETED/CANCELLED/NO_SHOW are terminal in declarations. QueueEntry COMPLETED/CANCELLED/NO_SHOW have no declared outgoing edges; SKIPPED has outgoing declarations but no verified complete restoration workflow.

`calculate_readiness_and_eta` returns computed readiness, counts, estimates and check-in flags. Terminal response labels COMPLETED/SKIPPED/CANCELLED/NO_SHOW are not members of the readiness enum. The calculation does not save `readiness_state`, change lifecycle status or create readiness notifications. Frontend INACTIVE is presentation, not a model enum. BR-049; C-08/C-09.

## Declared transitions

These tables transcribe `ALLOWED_TRANSITIONS`, not an endpoint guarantee.

| Appointment before | Declared after |
|---|---|
| PENDING | CONFIRMED, CANCELLED |
| CONFIRMED | CHECKED_IN, CANCELLED |
| CHECKED_IN | IN_PROGRESS, NO_SHOW |
| IN_PROGRESS | COMPLETED |
| COMPLETED / CANCELLED / NO_SHOW | None |

| QueueEntry before | Declared after |
|---|---|
| WAITING | CALLED, CANCELLED, NO_SHOW |
| CALLED | IN_PROGRESS, SKIPPED, CANCELLED, NO_SHOW |
| IN_PROGRESS | COMPLETED, CANCELLED |
| COMPLETED | None |
| SKIPPED | WAITING, CANCELLED, NO_SHOW |
| CANCELLED / NO_SHOW | None |

**C-14:** SKIPPED→WAITING exists only as a queue declaration. `skip_queue_entry` also sets Appointment NO_SHOW, whose declaration is terminal. No complete linked restore/requeue/recall endpoint was established. Queue IN_PROGRESS→CANCELLED also lacks an equivalent ordinary appointment cancellation workflow. Neither edge authorizes a new product policy. D16/D20.

`AppointmentService.transition_status` and legacy `check_in` can save appointment status alone. They are not proof of linked synchronization; current API check-in uses QueueService. Historical reconciliation assigns states directly, outside normal transition checks. Queue NO_SHOW is declared, while the inspected skip/cleanup workflows write SKIPPED. See legacy/cleanup qualifications below.

## Lifecycle workflows

All implemented behaviors below are **S / CURRENT IMPLEMENTATION**. Established invariants are identified in BUSINESS_RULES; defects and pending policy are not approved by this table. Authorization comes from the role matrix, not the service's optional `actor` parameter.

### Implemented action matrix

Source abbreviations in this table: **AP** = `backend/apps/appointments/services.py`; **QS** = `backend/apps/queue/services.py`. Exact methods and approximate ranges are given. Every operational HTTP action also passes authentication, target-resource lookup and permission checks described in [the matrix](ROLE_PERMISSION_MATRIX.md#detailed-permission-matrix).

| Trigger / actor | Preconditions and failures | Appointment before → after | QueueEntry before → after | Transaction / locks | Side effects / qualifications |
|---|---|---|---|---|---|
| Online POST; authenticated self | Approved active organization, operational provider in tenant, active service/assignment, valid contacts/date/schedule/leave/capacity; invalid combination/date/capacity rejects | New → CONFIRMED | New → WAITING, unchecked | AP `book_appointment`:488–704; atomic; provider→assignment | Price/contact snapshots, shared serial, matching token, booking notifications/audit. No fixed start promise. |
| Walk-in POST; own provider, tenant staff/manager or admin | Authorized URL provider and valid input; shared booking checks; phone lookup can fail on ambiguous identity | New → CHECKED_IN | New → WAITING, checked | QS `register_walk_in`:352–393 outer atomic; nested booking provider→assignment | Entered name/phone forwarded as snapshots; same queue/next serial. F-012/F-013. |
| Check-in POST; owner/assigned provider/tenant staff/manager/admin | Provider and org operational; nonterminal appointment; current business date; customer actor additionally checks computed eligibility | CONFIRMED → CHECKED_IN; other permitted input status not blindly advanced | Existing entry retains status; flag/time updated; legacy absent entry created WAITING | QS `check_in_appointment`:128–249; atomic; provider→appointment; existing queue query not separately row-locked | Customer/provider notifications and audit on successful first check-in; repeated return occurs before these. F-014/PF-001. |
| Call Next POST; queue operator | Reconciliation first; no CALLED/IN_PROGRESS for provider/date; checked WAITING with Appointment CONFIRMED/CHECKED_IN; no active/no eligible returns conflict | Unchanged | WAITING → CALLED | QS `call_next`:281–334; atomic; provider→selected entry | Urgent then serial; called timestamp, notification/audit. No consultation start. Global cleanup exception F-007. |
| Start POST; entry operator | Entry permits IN_PROGRESS (normal CALLED); linked appointment can become IN_PROGRESS (normal CHECKED_IN); invalid state rejects | CHECKED_IN → IN_PROGRESS | CALLED → IN_PROGRESS | QS `start_queue_entry`:699–737; atomic; ordinary discovery then provider→fresh entry→appointment locks | started_at and audit; no fabricated start from CALLED timestamp. |
| Complete POST; entry operator | Entry permits COMPLETED; linked appointment must be IN_PROGRESS | IN_PROGRESS → COMPLETED | IN_PROGRESS → COMPLETED | QS `complete_queue_entry`:740–785; atomic; provider→fresh entry→appointment | completed_at, customer notification/audit. No automatic Call Next. |
| Skip POST; entry operator | Entry permits SKIPPED (CALLED); linked appointment must permit NO_SHOW, normally CHECKED_IN; otherwise atomic rollback | CHECKED_IN → NO_SHOW | CALLED → SKIPPED | QS `skip_queue_entry`:788–835; atomic; provider→fresh entry→appointment | skipped_at, notification/audit. No next call/temporary-return guarantee. D15–D17. |
| Cancel POST; owner/assigned provider/tenant staff/manager/admin | Passed appointment must be nonterminal and permit CANCELLED (PENDING/CONFIRMED); checks before atomic block | PENDING/CONFIRMED → CANCELLED | Linked entry → CANCELLED by assignment if present | AP `cancel_appointment`:825–883; atomic writes, no coordinating provider/fresh appointment locks | Reason, notifications/audit; F-006 stale-state race risk. No cancellation after check-in or refund guarantee. |
| Reschedule PATCH; owner/tenant staff/manager/admin | Passed status excludes checked/in-progress/terminal; destination not past, working schedule, no overlapping leave; capacity/eligibility parity absent | Status unchanged; date/window/serial updated | If present, date/serial/token updated; status unchanged | AP `reschedule_appointment`:707–822; atomic; provider lock only; passed appointment not refreshed/locked | New-date max from both models; same-date serial retained or fallback 1. Snapshots unchanged. No linked entry creation if legacy missing. F-005/F-006. |
| Urgent POST; entry operator | Approved org and scoped entry lookup; no terminal-state prohibition in this method; optional reason | Unchanged | Unchanged status; urgent flag/reason updated | QS `mark_urgent`:337–349; atomic; no effective provider/entry row lock | Default reason if omitted, audit. Serial unchanged. F-011; D10. |
| Past cleanup invoked by provider list/Call Next | queue_date < today and WAITING/CALLED/IN_PROGRESS; global scope | CONFIRMED/CHECKED_IN/IN_PROGRESS → NO_SHOW where matched | Selected active old entry → SKIPPED | QS `reconcile_stale_historical_queue_entries`:396–422; atomic writes without row locks | skipped_at; no notification/audit call in helper; can affect other tenants and overnight service. F-007. |

Booking resolves organization/contact before entering atomic creation. Within it provider lock precedes the assignment lock/refetch and centralized price resolution. `serial = max(max Appointment serial, max QueueEntry serial) + 1`; canceled serials remain consumed. The same serial/date/provider are copied to both records. Database uniqueness supports normal allocation but all competing writers must coordinate; no concurrent PostgreSQL verification occurred.

Date-only initial booking stores schedule start for a future day, or `max(now, schedule_start)` today, plus effective duration. It does not advance each stored start by cumulative serial workload. **C-18:** historical scheduled-target descriptions are conceptual, not a guarantee of those stored timestamps. Legacy explicit datetime booking has additional schedule/break/leave checks. D01/D02 govern usable-day differences.

### Repeat check-in qualification — BR-036 / PF-001

In `QS::check_in_appointment`, customer actor validation at approximately 179–185 calls the ETA function **before** the `entry.is_checked_in` return at 189–190. ETA sets `can_check_in=False` once checked in. `AppointmentCheckInView.post` passes `request.user`, so a repeat by the owner can be rejected before the idempotent return—even if the owner also holds an operational membership.

The inspected T assertion in `backend/tests/test_phase5_hardening.py:335–352` calls twice **without actor** and expects one check-in notification. It does not assert a repeated customer HTTP response. Operational/actorless/bypass paths can return the existing entry; terminal/date/provider checks still occur first. No second normal QueueEntry or serial is created by that return. Handoff §9 permits idempotency **or safe rejection**. **PF-001 remains a candidate**, not a newly accepted finding or proof of runtime duplicate creation. C-03.

### Legacy paths

- When check-in finds no queue entry, it can allocate using queue-only maximum and assign an appointment serial in memory. The later appointment `save(update_fields=...)` excludes that serial. **F-014 / KNOWN DEFECT**: normal booking's both-model allocator/persistence is not reused.
- Legacy status-only `AppointmentService.check_in` delegates to `transition_status`, not full presence/linked queue handling.
- No supported general PENDING→CONFIRMED HTTP workflow is inferred merely from declarations.

### Presence and exceptional operational cases

| Case | Implemented / intended / pending distinction |
|---|---|
| Late arrival | Same-day nonterminal check-in can make a lower serial eligible next; active service is not interrupted by Call Next. If already NO_SHOW/SKIPPED, no complete restore exists. H §§8,15; D16/D17. |
| Absent customer | Unchecked WAITING is excluded from calling, but included in reservation forecast. No verified grace/recall timer. D05/D15/D17. |
| Urgent customer | Flag changes waiting priority, not serial or presence; active guard prevents normal next call while service active. No emergency interruption policy. D10/D20. |
| Provider delay | Current forecast branches below can label/suppress estimates. No general queue pause/reassignment/interruption workflow established. D20. |
| Overlong consultation | Remaining estimate floors at zero; status remains IN_PROGRESS until valid explicit completion, subject to the defective past cleanup. No maximum duration or auto-complete rule. D19. |
| Overnight consultation | Active guard scopes to requested date; ETA past branch precedes active IN_PROGRESS branch; global cleanup can force NO_SHOW. Appointment live helper preserves IN_PROGRESS across midnight, so implementation conflicts. F-007/D08; no correction policy invented. |
| Skipped return | SKIPPED→WAITING enum does not restore linked terminal appointment. D16 options remain neutral. |
| Provider unavailable / interrupted | No complete reassignment, pause or partial-service lifecycle verified; pre-check-in cancellation/reschedule do not cover all cases. Provider failure is not automatically customer NO_SHOW. D20. |
| Historical reconciliation | Current implementation is a defect, not intended automatic customer-fault policy. It ignores tenant/session distinctions and bypasses normal transition declarations. |

Issue reporting records a complaint/report through the existing appointment issue workflow; it is not evidence of automatic completion, no-show correction or refund. See proposed additions in business rules.

## Concurrency and locking

Source-level lock order is distinct from proven concurrent outcomes. `_lock_entry` is misleadingly named: it performs ordinary `select_related(...).get(...)`, without `select_for_update` (QS:839 onward).

| Operation | Actual coordination | Confirmed gap vs inferred consequence |
|---|---|---|
| Booking | Provider `select_for_update`, then ProviderService `select_for_update(of=('self',))`; serial maxima and linked creation inside atomic | Normal allocation source established. Simultaneous successful/distinct serial behavior not executed here. |
| Manager charge update/delete | Provider then assignment within atomic; `providers/services.py:265–302` | Compatible with booking price snapshot order. Wrapped-helper T evidence is not a race test. |
| Check-in | Provider then fresh Appointment row; existing QueueEntry fetched ordinarily | Customer repeat and legacy persistence qualifications above; compatible writers are required. |
| Call Next | Cleanup before call transaction; provider then selected WAITING entry | Date-specific active check; cleanup uncoordinated/global. |
| Start/complete/skip | Ordinary discovery, then provider, refetched QueueEntry, Appointment locks | Do not misdescribe discovery as an entry lock before provider. Linked state validation occurs inside transaction. |
| Reschedule | Provider lock; passed appointment checks/writes; existing QueueEntry ordinary query | Fresh appointment/queue validation missing; race effect inferred F-006. Capacity omitted F-005. |
| Cancel | Passed appointment checks before atomic; ordinary linked query/writes | No coordinating lock/refetch; possible overwrite requires PostgreSQL reproduction F-006. |
| Urgent | Atomic writes after ordinary scoped lookup | No provider/entry lock; selection can observe old priority, inferred F-011. |
| Reconciliation | Global queryset, atomic direct status writes, no row locks | Cross-tenant/overnight source behavior confirmed; competing mutation outcomes unexecuted F-007. |

No statement here certifies deadlock freedom, universal atomic lifecycle safety or serial correctness for legacy writers. Inspected sequential tests and SQL lock assertions (some skipped on unsupported databases) cannot substitute for real concurrent PostgreSQL transactions. Standard pytest configuration uses SQLite/`--nomigrations`; do not infer migration or production lock verification.

## ETA and readiness

Authoritative current implementation: `backend/apps/queue/services.py::QueueService.calculate_readiness_and_eta` (approximately 425–692), invoked by queue serialization. All formulas below are **S / CURRENT IMPLEMENTATION**, with policy choices still pending. It is read computation, not a lifecycle transition or readiness-notification writer.

### Inputs and branch order

Inputs: queue provider/date/status/urgency/serial/check-in/timestamps, linked appointment status/start/service, current aware time, project-local current business date, current related queue entries and mutable base durations.

Order: terminal status → future date → past date → current-date active lookup → own IN_PROGRESS → own CALLED → waiting forecast. This ordering matters: a past-date ongoing consultation returns the past branch before own IN_PROGRESS handling. Org operating hours and provider capacity are not added to this function's formulas; schedules influenced the stored booking window upstream.

### Terminal, future and past responses

| Branch | Actual response semantics |
|---|---|
| COMPLETED / SKIPPED / CANCELLED / NO_SHOW | Readiness label equals terminal status; scheduled/checked/people ahead and wait all 0; now serving null; can_check_in false; opening metadata null. Estimated-time keys are omitted in these dictionaries, not promised uniformly null. |
| Future | NOT_YET; ahead/wait 0, not null; estimated start = appointment start or now; end = start + current base duration (fallback 15); arrival = appointment start −15 minutes when present, otherwise estimated start; opening = arrival −30 minutes; no now serving/check-in. |
| Past nonterminal | NOT_YET; ahead/wait 0; now serving null; can_check_in false; opening null; estimated-time keys omitted. INACTIVE is not this raw readiness value. |

Future target metadata is not today's live queue. Historical handoff nullable/inactive examples and frontend suppression must not be substituted for raw API dictionaries. C-08; BR-049.

### Active entry and own-service branches

For today's provider, select most recently started IN_PROGRESS; otherwise most recently called CALLED. `provider_has_started` is true when an active entry exists **or** a same-day COMPLETED/IN_PROGRESS/CALLED record exists.

Let `d` be current `Service.duration_minutes or 15`, not the effective ProviderService duration.

- Own IN_PROGRESS: `start = started_at or now`; `elapsed = max(0, minutes(now-start))`; `remaining = max(0, round(d-elapsed))` as integer. Estimated completion is `start+d` and can be in the past. Readiness IN_SERVICE, wait/ahead 0, estimated start suppressed, actual start and completion estimate returned, now serving own serial, no arrival/check-in. **No completion write occurs.**
- Own CALLED: readiness TURN_NOW; estimated start `called_at or now`, end `start+d`; actual start/completion/remaining null; now serving own serial; no arrival/check-in. CALLED does not fabricate a started_at.
- Another active entry: duration uses its current base service or 15. If started_at exists, remaining is `max(0, int(round(duration - elapsed_minutes)))`; otherwise full duration. This other-entry branch does not explicitly clamp negative elapsed before subtraction.

F-009: provider-specific booking duration is ignored here. D04 distinguishes fixing this mismatch from adding historical duration architecture.

### Preceding populations and formulas

Base predecessors: today's same-provider WAITING entries, excluding linked Appointment COMPLETED/CANCELLED/NO_SHOW. The query does not apply Call Next's identical appointment-status or check-in filters.

- For urgent subject: earlier serials that are urgent.
- For normal subject: urgent WAITING entries plus normal entries with earlier serial.
- `scheduled_ahead = count(preceding)` includes unchecked reservations.
- `checked_in_ahead = count(preceding where is_checked_in)`.
- `people_ahead = checked_in_ahead + 1` if another active entry exists, otherwise `checked_in_ahead`.
- `scheduled_work = sum(each preceding current base Service duration or 15)`.
- `total_wait = active_remaining + scheduled_work`.
- `dynamic_start = now + total_wait minutes`.
- If appointment start is in future today: `estimated_start = max(appointment_start, dynamic_start)`; otherwise `dynamic_start`.
- `estimated_end = estimated_start + subject current base duration`.
- `recommended_arrival = estimated_start - 15 minutes`; returned as null once checked in.
- `check_in_available_at = estimated_start - 6 hours` for today's waiting branch.
- `can_check_in = not checked_in and linked appointment status in {CONFIRMED, CHECKED_IN}` (or true eligibility assumption if appointment missing). It does **not** compare now to available-at.

This separates physical people from reservation workload. F-010/D05 require an explicit forecast population policy; comparator similarity alone is insufficient. The physical count includes active service, even with zero waiting people ahead. BR-046–BR-050.

### Delay and readiness precedence

When provider_has_started, delayed means estimated start > stored appointment start +20 minutes. Normal computed start/wait remain returned. Without provider activity, delayed means now > stored start +20 minutes: status text is Running Behind Schedule, returned estimated start and wait are null. Estimated end/arrival were still computed and can remain returned. Otherwise the text distinguishes later-today scheduling from normal pace.

Readiness uses the internally computed start even when returned start/wait are suppressed. In this exact order:

1. Checked in and `checked_in_ahead == 0` → BE_READY.
2. `checked_in_ahead <= 2` **or** `15 < minutes_until_start <= 45` → GET_READY.
3. `minutes_until_start <= 15` → BE_READY.
4. Otherwise → NOT_YET.

Thus low count can take precedence over short/long time, and delay suppression does not choose another readiness branch. These are current branches, not approved threshold policy (D07/F-010). TURN_NOW comes from own CALLED branch, not simply first serial.

### Frontend transformations and notification distinctions

`frontend/src/utils/queueDisplay.js:9–21,40,218` additionally classifies using browser-local dates and substitutes count sources. F-017: a different browser timezone can disagree with backend business date; outcome requires controlled verification. F-016: displayed ahead count can omit active service represented in backend people_ahead. C-13. UI inactive/future labels and hidden metrics do not change raw backend values.

`frontend/src/pages/customer/CustomerLiveQueuePage.jsx:76–81` requests a private provider queue and swallows denial (F-015); full operational access must not be widened to resolve it. Polling cleanup does not necessarily cancel pending responses (F-023). Historical notification interval/automatic-readiness-event claims are not universal current guarantees. The calculated response does not itself persist readiness or emit events (C-09).

## Contradictions and pending-policy links

Each row preserves both claims. Documentation is not blocked; an approved guarantee/fix is blocked where a pending decision applies.

| ID | Historical/baseline claim vs current source | Type / evidence / related IDs | Required action |
|---|---|---|---|
| C-01 | H §2 fixed slots vs current Book date/serial plus AP legacy slots | Historical difference H/S; BR-021,023 | Keep legacy separate from current customer model. |
| C-02 | QM docstring says entry at check-in vs AP book_appointment creates at booking | Stale comment S/H; BR-032 | Describe executable booking; do not fix comment here. |
| C-03 | Baseline BR-036/test suggests repeat return vs actor check before return | Qualification S/T/H; BR-036, PF-001 | Narrow customer API claim; future actor-aware test. |
| C-04 | H §6 demands partial leave and destination capacity vs AP helper/reschedule gaps | Defect plus policy S/H; F-005,F-008; D01,D02 | Preserve invariant and unresolved algorithm separately. |
| C-05 | H effective duration and AP custom duration vs QS current base duration | Mismatch S/H; F-009; D04 | Record calculation inputs; approve history policy separately. |
| C-06 | H compatible effective order vs checked selector/unchecked forecast population | Policy S/H; F-010; D05 | Distinguish forecasts from callable queue. |
| C-07 | Opening metadata appears window-like vs can_check_in has no time comparison | Policy S/H; F-010; D06 | Label advisory; no invented six-hour enforcement. |
| C-08 | H §19 nullable future metrics/past INACTIVE vs QS zero/NOT_YET and UI presentation | Historical/API difference H/S; BR-049 | Preserve raw shapes and display separately. |
| C-09 | H §22 readiness-change notifications vs pure QS calculation | Historical claim not currently implemented by this function H/S | Do not promise readiness notification generation. |
| C-10 | Baseline workflow says calculate_eta vs actual calculate_readiness_and_eta | Naming discrepancy D/S | Cite actual symbol; not an application bug fix. |
| C-13 | Backend physical count/business date vs QDisplay alternative count/local date | Contract mismatch S/I; F-016,F-017 | Document authority and future display verification. |
| C-14 | QM SKIPPED→WAITING vs Appointment NO_SHOW terminal and no linked restore | Declaration/workflow gap S/H; D16 | Do not invent requeue endpoint/policy. |
| C-15 | H protects overnight; serializer _get_is_live_queue keeps IN_PROGRESS vs global cleanup/past ETA | Known defect S/T/H; F-007; D08 | Explicit overnight warning and future scoped tests. |
| C-18 | H §19 preliminary target includes reserved workload vs date-only stored AP start at schedule/now | Historical conceptual difference H/S; BR-023,029,047 | Do not promise cumulative target or fixed slot. |

C-11/C-12/C-16 belong to [role-matrix contradictions](ROLE_PERMISSION_MATRIX.md#contradictions-and-security-exceptions); C-17 belongs to [business-rule historical crosswalk](BUSINESS_RULES.md#historical-findings-and-candidates). All 18 IDs are retained across the three documents.

Relevant findings: F-005 reschedule eligibility/capacity; F-006 stale lifecycle state; F-007 global/overnight cleanup; F-008 usable capacity; F-009 duration; F-010 forecast/windows/readiness; F-011 urgency; F-012/F-013 walk-in; F-014 legacy serial; F-015 private fetch; F-016/F-017 display; F-018 invalid breaks; F-023 obsolete polling. Baseline priorities remain unchanged; [Known Issues](KNOWN_ISSUES.md) now owns the full finding register, as planned when Phase 2 was written.

See [D01–D20](BUSINESS_RULES.md#pending-business-policy-register), especially D04–D08,D10,D15–D20. No grace timer, recall, requeue, refund, auto-next, auto-completion or overnight correction policy is supplied here.

## State-machine acceptance checklist

- [x] Exact Appointment, QueueEntry and readiness values distinguished.
- [x] Declared edges separated from implemented linked workflows and legacy helpers.
- [x] All 17 requested lifecycle workflows and skipped return documented.
- [x] Actors, preconditions, before/after, transaction/locks, side effects and failures recorded.
- [x] BR-036 and candidate PF-001 qualified; actorless T assertion is not HTTP certification.
- [x] Per-operation locking includes missing safeguards; race outcomes are I, not R.
- [x] Base/custom/mutable duration, forecast/physical counts, date branches and check-in metadata explicit.
- [x] Readiness calculation not described as persisted or notification-triggering.
- [x] Unsupported workflows and relevant C/F/D IDs preserved.
- [x] No runtime/test/concurrency/browser/email verification claimed.

These checkmarks indicate documentation coverage, not passing application tests. Future fix verification must target affected paths, with real PostgreSQL concurrency where required.
