# QueueTurn agent operating guide

## A. Project identity and repository scope

QueueTurn (formerly SmartQueue) is a multi-tenant appointment and queue management platform.
Tagline: **Book a serial. Arrive smarter. Wait less.**
The source architecture is Django/DRF, React/Vite and PostgreSQL; test configuration can select SQLite.
This describes repository configuration, not verified deployed infrastructure.

- `backend/config/`: Django settings, root URLs and ASGI/WSGI entry points.
- `backend/apps/`: accounts, organizations, providers, services, appointments, queue and supporting domains.
- `backend/tests/` and app-local tests: asserted behavior; app migrations declare persistence history.
- `frontend/src/`: routes, contexts, API/resource services, pages, components, utilities and styles.
- `docs/`: canonical Project Brain; `docs/references/`: protected historical evidence.

This root file applies repository-wide. Read any applicable nested instruction file before work in its directory.
Reconcile narrower instructions with current user authorization and higher-priority constraints; do not silently override conflicts.
Preserve existing owner work. This guide does not authorize a new phase, unrelated fixes or database operations.

## B. Project Brain index

| Canonical document | Responsibility | Read when |
|---|---|---|
| [Business Rules](docs/BUSINESS_RULES.md) | BR register, policy decisions and contradictions | Business behavior, booking, pricing or policy changes |
| [Queue State Machine](docs/QUEUE_STATE_MACHINE.md) | Lifecycle, presence, ordering and forecast distinctions | Queue, check-in, ETA or transitions |
| [Role Permission Matrix](docs/ROLE_PERMISSION_MATRIX.md) | Identity, memberships, method/ownership/tenant authority | Auth, roles, APIs or data exposure |
| [Product Architecture](docs/PRODUCT_ARCHITECTURE.md) | Source map, contracts, models, locks and configuration | Architecture or affected subsystem work |
| [Known Issues](docs/KNOWN_ISSUES.md) | Finding owner, severity, evidence and acceptance criteria | Every potentially affected known defect |
| [UI Design System](docs/UI_DESIGN_SYSTEM.md) | Current visual foundation, tokens and protected behavior | UI/component/style work |
| [UI Redesign Playbook](docs/UI_REDESIGN_PLAYBOOK.md) | Safe UI change process and design boundaries | UI implementation or redesign |
| [UI Audit Plan](docs/UI_AUDIT_PLAN.md) | Route coverage, audit priorities and verification plan | UI audits and affected page validation |

Supporting references: [Original Business Rules Handoff](docs/references/ORIGINAL_BUSINESS_RULES_HANDOFF.md)
and [Business Rule Baseline Assessment](docs/references/BUSINESS_RULE_BASELINE_ASSESSMENT.md).
Treat these as historical intent/prior audit evidence, not proof of current implementation or runtime behavior.
Do not rewrite, rename or reformat historical references to make them match a new implementation.

## C. Mandatory startup procedure

1. Read this file and applicable repository instructions.
2. Inspect branch, HEAD and Git status; identify and preserve tracked, staged and untracked work.
3. Define the user-authorized task scope and affected subsystems.
4. Read the relevant canonical owners using the matrix below.
5. Inspect current executable source and API consumers before making assumptions.
6. Identify applicable BR, F, D, C and candidate identifiers; keep namespaces distinct.
7. Identify backend permissions, tenant boundaries, ownership and public/operational projections.
8. Determine whether an unresolved policy needs owner approval; existing explicit authorization remains relevant.
9. Define the smallest safe implementation and documentation scope.
10. Choose focused verification and state any unavailable evidence.

Do not read all eight documents for every trivial task.
Read all eight for cross-system architecture, documentation governance or major product changes.

## D. Task-to-document reading matrix

Names below refer to the linked canonical documents in section B.

| Task | Required reading |
|---|---|
| Booking, availability, pricing | Business Rules, Product Architecture, Known Issues |
| Queue, check-in, ETA, lifecycle | Business Rules, Queue State Machine, Product Architecture, Known Issues |
| Roles, authentication, tenant access | Role Permission Matrix, Product Architecture, Known Issues |
| Django model/API/service changes | Product Architecture, relevant Business Rules, Role Permission Matrix, Known Issues |
| React page/component changes | UI Design System, UI Redesign Playbook, UI Audit Plan, relevant Product Architecture |
| Booking/queue UI changes | All three UI documents, Business Rules, Queue State Machine, Known Issues and relevant architecture/permissions |
| Landing-page changes | UI Design System, UI Redesign Playbook, UI Audit Plan |
| Security/privacy changes | Role Permission Matrix, Product Architecture, Known Issues, relevant Business Rules |
| Documentation updates | Affected canonical owner documents and related references |
| Cross-system refactor | All eight canonical documents |

## E. Evidence hierarchy and conflicts

Use this evidence order, subject to applicable safety constraints:

1. Explicit current user instructions and task authorization define scope.
2. Current executable source describes implemented behavior.
3. Schema and migrations describe declared persistence and constraints.
4. Inspected tests describe assertions, not evidence of execution.
5. Canonical documents describe intended business behavior and documented policy.
6. Historical references describe earlier intent and assessments.
7. Clearly labeled inference fills only explicitly acknowledged gaps.

This hierarchy is not permission to override approved business rules.
When source conflicts with an approved rule, report implementation versus intent; check whether the task authorizes a fix.
Do not silently redefine policy or blindly rewrite source. Seek owner input for unresolved policy, not routine authorized choices.
When canonical documents conflict, identify the subject owner, inspect source/evidence and record the contradiction.
Do not silently edit unrelated documents or accept known defects as approved behavior.

Use `S` source verified, `T` test assertion inspected, `H` historical intent, `D` documented but unverified,
`I` inferred, `U` unknown and `R` runtime verified only with actual runtime evidence.

- Frontend visual approval does not authorize backend changes.
- A role guard is not a backend security boundary.
- A documented route does not prove a working runtime endpoint.
- A transaction declaration does not prove race safety.
- A configured email backend does not prove delivery.
- A documented token does not prove browser appearance.
- A test assertion does not prove a test ran.
- A previous completion report does not prove current runtime behavior.
- Pending decisions do not grant implementation permission.

## F. Non-negotiable product invariants

Business Rules and Queue State Machine own the detailed rules; preserve these boundaries:

1. Booking reserves a provider/date serial, not a guaranteed consultation start-time slot.
2. Preserve atomic serial allocation and linked QueueEntry creation through the booking service.
3. Keep online, front-desk and walk-in callers on the shared booking domain service.
4. Resolve customer charges on the backend through the centralized pricing abstraction; preserve valid zero overrides.
5. Preserve booking price/contact snapshots where implemented; never silently update the customer profile.
6. Never fabricate historical charge or duration facts; nullable legacy snapshots remain unknown.
7. Call Next is presence-gated among eligible checked-in waiting entries.
8. Preserve urgent-first, then serial ordering; booking channel does not set priority.
9. Preserve explicit call/start/complete/skip transitions and Appointment versus QueueEntry status distinctions.
10. Do not auto-complete or auto-call based on ETA or elapsed duration.
11. Forecast reservations and physically callable customers are different populations.
12. Readiness is computed advice, not a persisted queue state or proof of a notification event.
13. Organization public hours are separate from provider schedules, leave and date capacity.
14. Global customer identity is separate from organization membership and operational role.
15. Organization STAFF is not Django `is_staff` or platform administration.
16. Backend permissions, tenant scoping and ownership are authoritative.
17. Frontend guards provide UX, not security; selected tenant state does not grant entitlement.
18. Known defects stay open until evidence supports a separately authorized resolution.

Do not turn advisory check-in windows into enforced policy or invent recall, overnight, repricing or payment behavior.
The active-service guard is provider/date-specific; do not claim universal concurrency safety.

## G. Registers, findings and pending decisions

- BR-001–BR-062: canonical business-rule register.
- F-001–F-023: baseline known findings; consult Known Issues before affected implementation.
- D01–D20: unresolved policy decisions; do not resolve them incidentally in UI/backend changes.
- C-01–C-18: documented contradictions; preserve identifiers and evidence qualifications.
- PF-001/PF-002: candidates, not permanent findings or authorization for fixes.
- Historical F01–F15: separate namespace; use the documented crosswalk, not numeric equivalence.

Baseline P1 findings are F-001, F-005, F-006, F-007 and F-012.
All other baseline findings are P2; no baseline P0 is established.
UI audit ordering is separate from baseline finding severity.
Do not mark a finding fixed from a plan, documentation correction, passing unrelated test or static inspection alone.

## H. Backend and database guardrails

- Reuse existing domain services, serializers and API contracts; trace every affected caller.
- Validate provider/organization/service relationships, active membership, ownership and appropriate approval gates.
- Keep public discovery projections distinct from operational/private data; a scoped URL alone is insufficient.
- Keep effective and starting customer charges server-authoritative; charge is not income, commission or payment status.
- Review transactions and all competing writers before changing lock-sensitive behavior.
- Booking and assignment mutation coordinate provider first, then ProviderService assignment.
- Start/complete/skip coordinate provider, then queue entry, then appointment; verify actual source for the changed path.
- Do not infer row locks from helper names or assume an atomic block refreshes passed model objects.
- SQLite/sequential assertions do not prove PostgreSQL mutual exclusion, deadlock freedom or migration application.
- Preserve historical migrations, app labels, declared constraints and schema/client compatibility.
- Do not run migrations, reset/seed or mutate database state without task authorization.
- Use focused behavior and permission tests; use explicitly configured PostgreSQL concurrency verification when locks change.

## I. Frontend and UI guardrails

- Preserve the approved landing foundation, navbar, hero, rails, animation lifecycle and existing surface hierarchy.
- Reuse existing application/public token scopes and components; preserve warm-sand/espresso light and navy/teal dark themes.
- Keep visual changes within scope; do not introduce an incidental redesign, palette or animation system.
- Use real data; never fabricate live queues, ratings, reviews, recently viewed records or production social/contact links.
- Preserve backend effective/starting pricing and appointment snapshots; do not reconstruct pricing fallback/minimum rules in React.
- Preserve authoritative current-status/readiness semantics, including unknown values; avoid guaranteed-time language.
- Keep booking dependency invalidation, editable contact/notes preservation and stale availability protection.
- Handle loading, errors, empty states and late responses explicitly.
- Prevent stale tenant/role/record requests from overwriting the current selection or account state.
- Do not widen backend permissions to work around a frontend payload or telemetry defect.
- Preserve accessible labels, keyboard/focus behavior, responsive framing and reduced-motion fallbacks.
- Do not install a UI library or dependency without authorization.

## J. Protected compatibility identifiers

Do not rename these solely because visible branding changed to QueueTurn:

- `smartqueue_db`: database connectivity/default-name contract.
- `smartqueue_theme`: persisted theme preference.
- `SMARTQUEUE_SUPPORT_EMAIL`: existing support-recipient configuration contract.
- `smartqueue_verified`, `get_smartqueue_verified`, `isSmartQueueVerified`: trust field/helpers and consumers.
- `sq_access_token`, `sq_refresh_token`: persisted authentication keys.
- `sq_selected_org_id`: selected-tenant convenience key.
- `sq_recently_viewed_orgs`, `sq_favorite_orgs`, `sq_pending_booking`: persisted discovery/booking keys.
- `sq:auth:unauthorized`: client/context authentication event.
- `sq-*` CSS identifiers: existing component/style compatibility.
- Existing migrations, app labels/import paths and established API routes: persistence/integration history.

A separate explicit compatibility decision and migration/fallback plan are required for technical renames.

## K. Verification and repository discipline

- Select focused checks proportional to changed behavior; do not run broad unrelated suites by default.
- Include relevant permission, tenant-isolation and ownership assertions for API/security changes.
- Inspect the test engine and migration options; never present SQLite or `--nomigrations` as PostgreSQL/migration proof.
- Run relevant frontend lint/build and browser/accessibility checks only when authorized and applicable.
- Report exact commands/results and skipped checks; never claim unsupported “all tests passed” or runtime verification.
- Do not automatically seed, mutate data, send email, contact external systems or expose secrets/private values.
- Do not add unrelated changes, opportunistic fixes or dependencies.
- Do not reset, restore, clean, stash, rebase, switch branches, stage, commit or push without explicit task authorization.
- Never discard existing owner work; distinguish initial changes from your own final diff.

These verification instructions apply to future separately authorized work, not a documentation-only phase that forbids execution.

## L. Documentation maintenance and ownership

- Update the canonical subject owner when an approved behavior change authorizes documentation updates.
- Update related cross-references only within scope; request clarification if required changes are outside authorization.
- Preserve BR/F/D/C identifiers and namespaces; do not duplicate entire registers in this file.
- Record policy decisions only after explicit approval, including decision scope, date and supporting evidence.
- Keep finding status, priority and acceptance evidence accurate; distinguish current, intended and proposed behavior.
- Keep relative links, heading anchors, source paths and important symbols valid.
- Document uncertainty and unavailable runtime evidence; source citations are not production certification.
- Preserve historical references and unrelated canonical documents.
- Report stale phase-specific wording rather than opportunistically rewriting it.

Post-Phase-5 cleanup corrected the UI Audit Plan's F-004 attribution to provider registration and updated stale navigation.
The provider-view naming concern was rechecked against source and the unsupported architecture claim corrected in Phase 5.
PublicNavbar is composed by public/auth pages; AppRoutes directly composes AppShell for protected routes.
These are documentation corrections only: no finding was fixed or policy resolved; recheck current source before implementation.

## M. Completion report

Report scope/files changed; relevant rules/findings/decisions; implementation or documentation summary;
exact verification commands/results; unverified limitations; pending owner decisions; and final Git status.
Distinguish preserved prior work from newly changed files and source/test inspection from runtime evidence.
Stop at the authorized phase boundary. Do not automatically commit, push or start another phase.
