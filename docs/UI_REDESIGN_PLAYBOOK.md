# QueueTurn UI Redesign Playbook

## A. Purpose and authority

Phase 4, source review dated 2026-10-10; baseline main at 4a9920c3a648c2925dc30956005a1c28a015918f. This is a **future-work playbook**, not a redesign authorization or record of browser verification. QueueTurn — Multi-Tenant Appointment & Queue Management Platform; tagline: “Book a serial. Arrive smarter. Wait less.”

Authority: [Business Rules](BUSINESS_RULES.md), [Queue State Machine](QUEUE_STATE_MACHINE.md), [Role Permission Matrix](ROLE_PERMISSION_MATRIX.md), [Product Architecture](PRODUCT_ARCHITECTURE.md), [Known Issues](KNOWN_ISSUES.md). [UI Design System](UI_DESIGN_SYSTEM.md) records current source values separately from recommendations; [UI Audit Plan](UI_AUDIT_PLAN.md) inventories future verification. Historical intent in [original handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md) and prior evidence in [baseline assessment](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md) do not override current executable evidence.

Labels: CURRENT = source observed; PROTECTED = product/owner constraint; RECOMMENDED = future practice; UNVERIFIED = runtime evidence missing. Maintain these distinctions when updating this document. Phase 4 changed documentation only.

## B. Non-negotiable product invariants

PROTECTED: service → professional → date → review → confirmation → serial. Category/organization discovery precedes this where applicable. A reservation is a queue serial for a provider/date, not a guaranteed consultation start time. Schedules constrain availability/capacity; organization public hours are separate. Do not introduce patient time-slot grids, source-specific priority or a second booking service.

Keep Appointment/QueueEntry linkage, atomic serial allocation, explicit call/start/complete/skip actions, appointment versus queue status distinctions and backend eligibility/permissions. Arrival type, booking channel and urgent priority are different concepts. Preserve role and tenant boundaries, including documented admin exceptions; frontend route guards are not security enforcement.

Prices use backend effective_customer_charge/starting_from_price; new booking price is server resolved. Existing appointments use booked_service_charge/contact snapshots with truthful nullable legacy fallback. Contact editing must not mutate profiles. ETA/readiness are forecasts, not consultation promises or automated transitions. Do not silently decide D01–D20, introduce refunds/payments, invent grace periods or move computation into React.

Preserve one public homepage, operational dashboard routing, existing approved landing design/motion and protected technical identifiers. Legacy fixed-time/redirect code is a compatibility/audit concern, not a pattern for new UI.

## C. Change classification and approval boundaries

RECOMMENDED classification before implementation:

| Change | Typical example | Required evidence / boundary |
|---|---|---|
| Visual only | Scoped spacing, token reuse | Inspect consumers, both themes, relevant breakpoints; no contract/policy change |
| Component | Extract repeated status/control | Props, accessibility, all actual consumers and regression scope |
| Layout/navigation | Dashboard grouping, drawer | Existing routes, task order, role/tenant context; design approval where outside authorized scope |
| Workflow | New confirmation or action order | Business/state mapping, failure/retry behavior; owner decision for altered product behavior |
| API contract | New field/query/action | Backend owner, serializer/permissions, minimal affected tests, compatibility |
| Business rule | Capacity/readiness/priority | Explicit decision recorded against relevant D item; not a CSS task |
| Security/privacy | Broader data/action access | Permission/tenant review and focused negative checks; never implied by visual approval |

Existing authorization persists; do not ask repeatedly for routine implementation choices already in scope. Before requesting final approval, prepare a concrete reviewable proposal and complete authorized reversible work. Stop dependent implementation only where required information/authority is actually missing. A new library, schema change, seed mutation or infrastructure change is not automatically authorized by a UI request.

## D. Discovery before design

RECOMMENDED sequence for every future task:

1. Record status/branch/HEAD and preserve tracked/untracked owner work.
2. Define target routes, roles, primary task and observable success criteria.
3. Read relevant canonical rules, transitions, permissions, findings and pending decisions.
4. Inspect actual page, shell, styles, contexts/hooks and shared consumers.
5. Trace request/response shape, ownership/tenant filters, status calculations and snapshots.
6. Inspect loading/error/empty states, polling, cancellation and late-response behavior.
7. Record current behavior as source evidence; obtain authorized runtime baseline where needed.
8. Separate confirmed bugs, suspected problems, policy questions and design preferences.
9. Propose the smallest change using current tokens/components with protected areas listed.
10. Set proportionate verification and report limits before implementing beyond the approved scope.

Do not mistake historical screenshots, comments, earlier requested timing or audit assertions for current implementation. Current DiscoveryRail source implies 37.5px/sec; old requested 30px/sec is not a reason to alter it.

## E. Protected landing-page policy

PROTECTED: public navbar, hero typography/spacing/composition, stable foreground product UI and ambient animation; category rail; real customer Your Next Visit/live queue; Instant Availability Lookup; Recently Viewed Clinics & Organizations; organization card sizing/rail/motion; How/Why sections and replay; For Organizations; testimonial paged carousel; closing CTA/footer hierarchy, interaction and legitimate destinations.

Do not redesign these during operational-page work. The landing page uses scoped tokens in addition to application tokens; no global max-width, palette or blanket selector change. Preserve light warm-sand/espresso and dark navy/teal, reduced-motion static fallbacks, hover/focus/manual pause behavior, mobile scrolling and real-data/role/empty-state rules. Never manufacture recent views, customer appointments, queue data, social URLs or contact details.

A genuine integration bug may justify a smallest scoped correction after evidence and scope explanation. Do not treat that exception as permission to tune unrelated animations or later phases.

## F. Component-first implementation

CURRENT inventory and missing primitives are in [design system](UI_DESIGN_SYSTEM.md#g-component-inventory-and-reuse). Reuse StatusBadge, BookingContactFields/BookingSummary, BookingReviewModal, LoadingState, EmptyState, existing shell and feedback infrastructure where suitable; investigate their documented limitations rather than assuming accessibility certification.

RECOMMENDED: define data/interaction props and ownership first; preserve page-specific meaning. Extract repeated markup only when consumers genuinely share behavior. Check whether an existing CSS class solves the need before adding a component. Avoid a large generic table/form/modal framework in one redesign task. A reusable modal should handle focus/return/Escape/scroll/async state consistently; adding it requires explicit scoped work, not a documentation claim that it exists.

Scope styles to actual components. Native global input/headings/card rules already affect many routes; inspect cascade and inline overrides. Do not duplicate backend pricing, authorization or queue transitions inside presentation helpers.

## G. Role-specific workflow priorities

RECOMMENDED priorities below do not grant capabilities beyond [role matrix](ROLE_PERMISSION_MATRIX.md):

| Audience | Primary task / presentation priority | Preserve |
|---|---|---|
| Public | Find organization/service/professional; understand serial booking | Public-safe data, actual profile routes, authoritative prices/hours |
| Customer | Discover/book; review appointment; check in/track own queue | Contact edits, snapshots, explicit confirmation, own-record access |
| Provider | Run own queue; explicit consultation actions; schedules/services | Provider ownership, correct current patient/serial and active-call guard |
| Staff | Front-desk intake/check-in and organization queue tasks | Walk-in identity contract, shared booking service, organization scope |
| Manager | Configure own services/providers/charges/members/hours; inspect operations | Tenant/role context, clear override versus base charge, consequential-action review |
| Admin | Platform organization/user/enquiry oversight | Explicit global context, privileged action accountability and truthful send outcomes |

One AppShell supports operational roles; organization switching can change effective role. Do not substitute a client-only role dropdown for memberships. Keep dual-role booking policy D12 unresolved until owner decision; do not infer backend permission solely from visible customer navigation.

## H. Queue and booking redesign checklist

RECOMMENDED before changing booking/queue screens:

- Validate upstream dependencies and invalidate downstream IDs, charge, working window and availability; preserve edited contact/notes. Retained date must revalidate for the new provider.
- Show backend selected-provider charge and immutable appointment snapshot separately from service starting price. Null means unknown/unavailable, not zero or today's reconstructed history.
- Review modal must match current valid selections; Back preserves edits; Confirm prevents accidental repeat submission. Request retry is not proof of server idempotency (D14).
- Show serial/date/provider/organization identity together where necessary; avoid a date-time label that implies a promised consultation time.
- Distinguish scheduled, physically checked-in, CALLED/IN_PROGRESS, urgent and readiness. Do not silently subtract active consultations from backend people-ahead (F-016) or use browser-local date as business timezone (F-017).
- Use authorized customer telemetry; do not widen a private staff/provider endpoint to silence F-015.
- Match available actions to backend transitions, ownership and busy state; refresh authoritative result after success. No UI auto-complete, auto-no-show or urgent inference.
- Treat cancellation/reschedule races and capacity deficiencies (F-005/F-006) as backend dependencies, not solved by hiding buttons.

## I. Asynchronous state and error handling

CURRENT architecture uses service modules/Axios/auth context, polling and page-local state. F-023 documents late-response risks; not every page has cancellation/revision guards.

RECOMMENDED: key requests by tenant, role, record and selected dependencies; abort or ignore stale requests; stop old polling on unmount/context change. Distinguish initial loading, background refresh, empty results, denied access, expired session, validation, network failure and stale last-known data. Do not retain old-tenant content as if current. Avoid optimistic queue state transitions or optimistic historical prices.

Disable duplicate action while pending, retain user edits after error, associate server errors with fields when possible, and offer safe retry only under the actual API contract. Do not treat a 2xx enquiry response as proof of email delivery (F-021); generic reset response must retain enumeration protection. Notification display/polling is not evidence of automatic readiness notification generation.

## J. Styling and theme discipline

RECOMMENDED: reuse exact current application/public tokens documented in [visual foundation](UI_DESIGN_SYSTEM.md#c-existing-visual-foundation); choose the correct scope. No new palette, gradients, glow, glassmorphism or random chart/status colors. Contextual category/art colors do not redefine queue semantics.

Check both themes, rest/hover/focus/active/disabled states and absence of layout shift. Keep footer/navigation interaction vocabulary without copying navbar dimensions. Numeric serial/ETA emphasis must not obscure labels/units. Prefer existing spacing/radius values; a proposed normalization must be labeled and approved rather than described as implemented. No heavyweight motion/icon dependency for a small refinement.

## K. Accessibility and responsive verification

RECOMMENDED future target: WCAG 2.2 AA; this is not a present compliance declaration. Verify keyboard order, native semantics/labels, visible focus, modal/drawer containment and return, errors/live announcements, contrast beyond color, zoom/reflow, touch targets and screen-reader status updates. Avoid announcing every queue poll. Reduced motion disables unnecessary transforms/autoplay/tracers while preserving information/manual navigation.

Test actual changed breakpoints and representative mobile/intermediate/desktop sizes, both themes, long Bangladeshi/international names, large serials/prices, empty/many rows and virtual keyboard. Keep table overflow inside its region; sticky elements must not cover actions. Operational pages need usable density, not marketing animation. Use [audit plan](UI_AUDIT_PLAN.md#h-responsive-audit-plan) for future cases; none was executed in Phase 4.

## L. Incremental delivery workflow

RECOMMENDED: scope/baseline → acceptance criteria → source/API mapping → small design proposal → required approval → one implementation slice → focused checks → authorized manual/browser review → regressions proportional to shared consumers → documentation/report.

Choose tests from changed paths and actual risk. Branding/spacing alone does not justify all backend tests; a business/API change does require affected behavior and permission checks. Build once after changes stabilize; repeat only after relevant failure/new edits. Never reseed merely for screenshots or create many QA appointments. Database/test-account mutation requires task authorization and safe scoped workflow. Record exact commands/results and untested limitations, not “all good.”

## M. Future Definition of Done

RECOMMENDED gate: approved scope complete; invariants and permissions preserved; source/contracts mapped; correct snapshots/status/ETA semantics; loading/error/empty states; keyboard/reduced-motion/both-theme/responsive evidence; no unintended shared/global regressions; focused relevant tests/lint/build where authorized; no unsupported links/fake data; scope/diff/status reviewed; documentation updated only where authorized; unresolved policy/finding dependencies reported.

This checklist is prospective. Phase 4 executes static documentation checks only and does not satisfy runtime UI gates. Do not mark baseline findings fixed or D decisions resolved without separate evidence/authorization.

## N. Reusable future task template

RECOMMENDED template (fill with real evidence; not an executable instruction for this phase):

```text
Target route/component/role:
Primary task and current source evidence:
Desired approved behavior and acceptance criteria:
Allowed files/actions; forbidden/protected areas:
Relevant BR/transition/permission/F/D references:
Current API fields, tenant/record identity and async dependencies:
Existing tokens/components to reuse; proposed differences:
Failure, empty, loading, legacy-null and accessibility cases:
Responsive/theme/reduced-motion verification scope:
Focused commands/manual checks authorized; test data safety:
Required owner decisions and independent work possible:
Deliverables: exact changes, evidence/results, limitations, final Git status:
Stop boundary; no automatic next phase/commit/push:
```

Maintain this playbook when an approved workflow changes. Preserve current/proposed/unverified labels and link to the canonical owner rather than copying full rule/finding registers.
