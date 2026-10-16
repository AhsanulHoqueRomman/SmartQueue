# QueueTurn — UI Redesign Master Plan & Controlled Execution Ledger

**Version:** 1.0 — 2026-10-15 (Asia/Dhaka)  
**Status:** Proposed for owner approval; **NOT** authorization to implement UI-1B  
**Repository:** `D:\SmartQueue`  
**Owner:** Human project owner; **implementing agent:** Google Antigravity  
**Purpose:** A durable, source-aware plan for bringing every operational React experience into the existing approved landing-page design language, without disturbing product behavior.

> **Read with:** `AGENTS.md`, `docs/BUSINESS_RULES.md`, `docs/PRODUCT_ARCHITECTURE.md`, `docs/ROLE_PERMISSION_MATRIX.md`, `docs/QUEUE_STATE_MACHINE.md`, `docs/KNOWN_ISSUES.md`, `docs/UI_DESIGN_SYSTEM.md`, `docs/UI_REDESIGN_PLAYBOOK.md`, and `docs/UI_AUDIT_PLAN.md`. This plan governs **UI redesign execution** only. It does not supersede owner-approved business decisions, backend authorization, or canonical finding status. Verify all path names and current implementation details against the live repository before changing code.

## 1. Source basis and confidence

This plan combines the 2026-10-15 QueueTurn Complete Project Handoff and Source File Atlas with Antigravity's UI-0 inventory, Codex's UI-1A completion report, Antigravity's UI-1A review, and Antigravity's UI-1B **read-only planning report**. The latter reported commit `d916447` (`Ui chnages preview`), clean `main`, and recommended shared operational primitives. Those are **agent-reported snapshots**, not a live check of the owner's working tree. Browser fixture passes are not proof of authenticated end-to-end behavior. Historical 47/47 frontend utility tests and build/lint passes should be rerun when relevant, not assumed forever.

**Known completed work:** UI-0 inventory COMPLETE; UI-1A operational AppShell redesign PROVISIONALLY ACCEPTED and reported committed. UI-1A still needs real authenticated multi-role browser smoke coverage; a true pre-change landing screenshot baseline is unavailable. **UI-1B is PLANNED ONLY, not approved for implementation.**

## 2. Non-negotiable product boundaries

- **Protect the approved landing page.** No edits to `LandingPage.jsx`, landing-specific components/CSS, `PublicNavbar.jsx`, global `styles/index.css` or root design tokens as part of routine operational UI batches. Avoid global selector leakage; operational styles must be explicitly scoped. If a necessary exception is found, STOP and request approval.
- **Preserve authentication and tenant isolation.** Never alter route guards, effective-role resolution, organization membership, global-admin context, private-document access, JWT flow, request-scope cancellation, or data visibility merely to support visual changes.
- **Backend remains authoritative.** Preserve serial allocation, queue state and order, checked-in gating, ETA, capacity, prices, schedule approvals, four-date booking window, Asia/Dhaka business dates, cancellation and reschedule conditions, emergency recovery/consent, and history/snapshots. Never fabricate ratings, statistics, availability, ETA, statuses, or actions.
- **Pending decisions stay pending.** D09/F-013 shared-phone identity; D11 reschedule pricing; D13/F-021 email outcome semantics. F-017 frontend date consistency is a separate focused fix; F-024 private storage production gate and F-025 schema accuracy are separate workstreams.
- **Database safety.** Do not connect to or mutate `smartqueue_db` for UI-only tasks, including seemingly harmless count queries. No migrations, seeds, reset scripts, production credentials, or business-data-writing browser flows. Ask for a disposable QA environment before any stateful E2E test.
- **Git ownership.** Antigravity may use read-only `git status`, `git diff`, `git log`. Never stage, commit, push, checkout, reset, clean, stash, rebase, or change history. Owner alone approves, commits, and pushes.
- **Small-batch approval.** An agent may independently inspect, implement, test and report **only one explicitly authorized batch**. It must STOP after reporting. It must not infer approval from this roadmap, self-mark ACCEPTED, or start the next batch.

## 3. Approved design DNA

| Element | Light | Dark | Usage |
|---|---|---|---|
| Canvas | `#FAF8F3` | `#0B1220` | Quiet app background |
| Surface | `#FFFFFF` | `#151F2D` | Cards and workspaces |
| Primary text | `#211C19` | `#F3F6F5` | Readable, high contrast |
| Secondary text | `#57534E` | `#C7D2D0` | Explanatory text |
| Main action | `#2F2520` espresso | `#2A9D8F` teal | One clear primary CTA |
| Accent | `#5F7A70` sage | `#6F9187` sage | Supporting accents |
| Border | `#E6E1D9` | `#2A394B` | Subtle separation |

Use **existing application tokens** rather than copying these hex values into every component. Preserve Inter/system typography, restrained shadows, sensible radius, compact operational density, 150–250ms transitions and reduced-motion support. Use consistent stroke SVG iconography when feasible, but preserve backward compatibility with existing icon props. Do **not** import ambient landing hero motion into queues, status rows, or time-sensitive actions. No glassmorphism, loud gradients, fake metrics, decorative spinners that conceal loading truth, or motion that delays interaction.

### Refined Operational UI vs. Repetitive Card Boxes (Owner Approved 2026-10-17)
- **Open, Breathable Layouts:** Preserve the landing page's visual identity, typography, and warm-sand/espresso and navy/teal palette, but explicitly **avoid copying its card-heavy or box-heavy composition everywhere**.
- **Selective Framing:** Avoid wrapping every heading, metric, table, action, or informational block in its own rectangular container. Use whitespace, subtle hairline dividers (`--color-border`), and background hierarchy to structure content. Apply cards and elevated surfaces selectively where functional grouping requires it.
- **Selective & Purposeful Motion:**
  - *Permitted:* Sidebar/drawer transitions, button hover/focus rings (`:focus-visible`), modal/popover entrances, subtle initial section reveals, restrained telemetry/chart transitions, and accessible loading skeletons.
  - *Forbidden:* Excessive scroll-triggered animations, repeated entrance animations on data polling refreshes, animated operational controls that cause layout shifts or delay clicks, and decorative animations on every table row or card.
  - *Compliance:* Strict support for `@media (prefers-reduced-motion: reduce)`.
- **Role-Specific Density:**
  - *Customer:* Calm, approachable, minimal, clear booking CTA and live queue status.
  - *Staff:* Information-dense, scan-friendly lists, high-contrast presence toggles, rapid workflow triggers.
  - *Provider:* Focused consultation ergonomics, current turn visibility, next serial, operational queue actions.
  - *Organization Manager:* Executive overview, capacity oversight, staff roster, operational metrics, and future performance trend visualization.
  - *Platform Admin:* High-density audit-ready tables, organization directory, platform health metrics.
- **Organization Manager Dashboard — Dynamic Trend Graph (Pending Separate Enhancement):**
  - Graph metrics: Appointments trend and Completed services trend (no revenue/financial data).
  - Scope: UI-1E Manager Dashboard remains **completed and accepted**. This dynamic graph is a **separately scoped pending enhancement** requiring a prior backend analytics/data audit. It does **not** block or alter milestone **UI-2A (Reusable Table and List Presentation)**.

## 4. UI behavior and accessibility standards

1. **Semantic controls:** buttons for actions, links for navigation, native form labels and clear validation errors. Never replace working keyboard behavior with visual-only affordances.
2. **Statuses:** preserve exact API/state values and user-facing meaning; never rely on color alone. Static badges normally need readable text, **not** blanket `role="status"`; use live regions only for meaningful dynamic updates.
3. **Feedback:** distinguish loading, empty, error, warning, success and disabled states. Success messages must reflect actual confirmed operations, not optimistic assumptions. Do not add auto-dismiss behavior that hides critical emergency/consent information.
4. **Responsive:** check at least 390, 768, 900/1024, and 1440px, including long tenant names, zoom and dense tables. No hidden row actions or sideways page overflow; horizontal scrolling within an explicitly labeled table region may be appropriate.
5. **Keyboard and focus:** visible `:focus-visible`, meaningful focus order, Escape/focus return for modal dialogs, proper backdrop and scroll cleanup. Avoid nesting dialogs or breaking existing notification/account overlays.
6. **Themes:** light/dark parity and sufficient text/control contrast. Verify tokens exist in current source before using them.
7. **Data integrity:** preserve pagination/filter/sort semantics, stale-response cancellation, timestamps vs date-only values, and server-calculated business results.
8. **Compatibility:** inspect **all consumers** before changing a shared component's props, classes or DOM assumptions. Keep old props functioning or explicitly obtain approval for a migration.

## 5. Route and surface coverage map

UI-0 found **77 route patterns**, including aliases/redirects; not 77 independent screens. Its grouping: public/discovery 9; auth/onboarding 9; customer 9; provider 6; staff 7; manager 11; admin 4; shared authenticated 1; aliases 20; fallback 1. The operational redesign covers the authenticated surfaces while **protecting** public/landing and authentication flows unless a later explicitly approved batch includes them.

| Role | Representative surfaces | UI focus | Functional danger to avoid |
|---|---|---|---|
| Customer | Dashboard, booking, appointments/detail, live queue, notifications, reviews, saved clinics | Clear next action, serial/ETA truth, arrival state, responsive appointment cards | Changing check-in, cancellation, reschedule, arrival or ETA rules |
| Provider | Dashboard, appointments, live queue, services, schedule, reviews | Workload clarity, current/next queue state, safe action hierarchy | Altering call-next/skip/restore/emergency semantics |
| Staff | Dashboard, queue, appointments, customers, providers, services, notifications | Efficient presence checks, scan-friendly lists, clear action feedback | Shared-phone identity D09, wrong-tenant customer exposure |
| Manager | Dashboard, appointments, queue, services, providers, members/staff, reviews, analytics, audit, settings | Governance, date filters, readable metrics and tables | Capacity/schedule approvals, F-017 dates, cross-org data |
| Admin | Dashboard, organizations, users, contact inbox | Platform scope clarity, audit-friendly density | Global-admin privileges and private-data visibility |
| Shared | Profile, shell, common feedback, metrics, badges, dialogs | Coherent tokens and accessibility | Breaking account/theme/notification consumers |

**Route coverage must be re-derived from `AppRoutes.jsx` when implementing**, not assumed complete from this matrix. A later batch may target `/favorites` public/auth inconsistency only with separate authorization because it affects route ownership.

## 6. Dependency-ordered roadmap (proposed, not blanket authorization)

| ID | Scope | Candidate files / surfaces | Dependency | Current state |
|---|---|---|---|---|
| UI-0 | Frontend route, shell, CSS and landing audit | Read-only | — | COMPLETE |
| UI-1A | Operational shell, SVG nav, accessible mobile drawer | `AppShell.jsx`, `styles/AppShell.css` | UI-0 | PROVISIONALLY ACCEPTED; owner commit reported `d916447` |
| UI-1B | Compatible metrics/status/feedback primitives | `StatCard.jsx`, `StatusBadge.jsx`, optional `OperationalBanner.jsx`, scoped CSS and focused tests | UI-1A | PLANNING REVIEW; NOT AUTHORIZED |
| UI-1C | **One** representative dashboard, chosen after UI-1B review | Candidate: Staff **or** Customer dashboard, not both | UI-1B | CANDIDATE |
| UI-2A | Reusable table/list presentation, one consumer first | Existing table/list components and one page | UI-1C or relevant primitives | CANDIDATE |
| UI-2B | Additional role dashboards, one role per batch | Provider / Manager / Admin / remaining Customer or Staff | UI-1B, UI-1C | CANDIDATE |
| UI-3 | Booking and appointment views, one workflow at a time | Customer booking/review/detail, then role appointments | Stable primitives | CANDIDATE; high regression risk |
| UI-4 | Live queue and operational actions, one role at a time | Customer queue, provider queue, staff queue, manager queue | QA fixtures and rule audit | CANDIDATE; high regression risk |
| UI-5 | Services, providers, schedules, membership and governance | Role-specific management pages | Prior shared patterns | CANDIDATE |
| UI-6 | Notifications, reviews, saved items, profile and remaining surfaces | Specific routed pages | Prior patterns | CANDIDATE |
| UI-7 | Cross-role visual and accessibility consolidation | Audits only initially; fixes separately scoped | Earlier batches | CANDIDATE |
| UI-8 | Final browser acceptance and release-readiness UI report | Authenticated role matrix; safe QA | All accepted batches | CANDIDATE; not production sign-off |

**Sequence is adaptive:** after each batch, update dependency findings and pick only the smallest next safe batch. Do not interpret a roadmap row as approval to change all listed pages. Backend findings and infrastructure gates are **not** UI phases.

## 7. UI-1B detailed planning specification — awaiting approval

**Source:** Antigravity UI-1B read-only audit recommended Operational Metrics, Status & Feedback Primitives. It found `StatCard` shared across Staff, Provider, Manager and Admin dashboards; `StatusBadge` used across multiple lists; CustomerDashboard uses separate inline summary styles; feedback banners are duplicated. The audit proposed five files, but a safe implementation must avoid forcing dashboard-wide migration in the same batch.

### Proposed core scope

- **`frontend/src/components/StatCard.jsx`:** refine surface, typography, spacing and icon rendering. **Keep current `title`, `value`, `icon`, `color` and other actual consumer props working.** If introducing named SVG icons, supply a compatible fallback; do not silently drop existing emoji icons or reinterpret business values. Do not add unrequested trend calculations.
- **`frontend/src/components/StatusBadge.jsx`:** refine token-aware visual styles and contrast while preserving exact status mappings and existing consumers. Retain descriptive visible labels. Do not use a live region for every static badge.
- **Optional `frontend/src/components/OperationalBanner.jsx`:** introduce an accessible, passive feedback component only if its contract and real consumers are established. **Do not claim user-visible dashboard improvements from a component that has no consumers.** Do not mass-replace existing action banners in UI-1B; propose a later, separate adoption batch.
- **Scoped `frontend/src/styles/OperationalPrimitives.css`:** no global tag selectors, root overrides or landing selectors. Inspect existing `.stat-card*` and `.status-badge*` definitions and cascade before writing replacement rules; do not remove global legacy CSS without approval.
- **Focused tests:** verify tone mapping, compatibility, icon fallback and semantic labels. Check existing test infrastructure before choosing the test file/path; a Node test that cannot import JSX is not a valid React component test.

### UI-1B go/no-go checks

Before implementation, agent must report an **exact consumer/prop inventory**, active CSS import path, whether tests can render React components in the current stack, and any breaking change required. If these reveal a broad refactor, **STOP and propose a smaller two-component batch**. No silent scope expansion. Explicit owner approval is required before changing any files.

### UI-1B acceptance

- Existing Staff/Provider/Manager/Admin dashboard values and statuses unchanged; CustomerDashboard untouched.
- Existing `StatCard` and `StatusBadge` call sites compile and display correctly; legacy props/classes handled safely.
- Both themes, keyboard/focus where relevant, contrast, 390/768/1024/1440 responsive checks.
- No landing/public visual regression from new scoped CSS.
- Focused lint, production build, existing utility tests; report actual results and pre-existing advisories accurately.
- If browser testing is synthetic only, label it **synthetic**, not real authenticated PASS.
- Git untouched by agent; human owner reviews and accepts.

## 8. Batch protocol for Antigravity

### Stage A — PLAN (read-only)
1. Read this master plan and canonical Project Brain docs.
2. Confirm current `git status` and owner-approved last batch.
3. Trace candidate components, **every consumer**, CSS imports and API/role implications.
4. Propose one smallest batch with exact allowed files, explicit exclusions, tests, rollback notes and risk level.
5. STOP for owner approval.

### Stage B — IMPLEMENT (only after explicit approval)
1. Reconfirm clean/known working-tree baseline; preserve unrelated changes.
2. Edit only approved files. If an additional file becomes necessary, STOP for scope amendment.
3. Keep code minimal, compatible and responsive; no data fabrication or backend behavior changes.
4. Run relevant non-mutating lint/build/unit checks. Browser checks only with safe credentials and fixtures; no development DB writes.
5. Inspect `git diff --check`, `git diff` and `git status`; include new/untracked files in the review.
6. Report exactly what was done, evidence, unverified items and any defects. STOP.

### Stage C — OWNER ACCEPTANCE
- **HOLD:** blocker/regression or unsafe scope; only a targeted fix can be approved.
- **PROVISIONALLY ACCEPTED:** implementation looks correct but explicitly named browser/regression checks remain open.
- **ACCEPTED:** agreed evidence complete and owner approves.
- Only owner commits/pushes. Record commit ID **after** confirmation; agent must not assume the commit occurred.
- Next batch is not authorized until owner explicitly says so.

### Mandatory agent completion report

1. Baseline branch/commit/status.
2. Exact modified/new files; any unexpected files.
3. Changes and preserved props/contracts.
4. Functional/security/tenant impact assessment.
5. Theme, viewport, keyboard and accessibility results.
6. Actual test commands and results; distinguish fixture, static and authenticated E2E.
7. Landing CSS/visual regression evidence and limitations.
8. Unverified risks and proposed targeted follow-up.
9. `git status` and explicit no stage/commit/push confirmation.
10. STOP and request owner acceptance.

## 9. Stop conditions and escalation

Immediately STOP and request owner direction if: a change requires backend/API/database modification; a landing/global stylesheet must be touched; route/role/tenant guards must change; existing props cannot remain compatible; an undocumented state is discovered; D09/D11/D13 must be decided; F-017 date logic is implicated; safe test credentials/fixtures are missing for a stateful check; private documents or secrets would be exposed; Git contains unrelated user changes; or a batch exceeds approved files. **Never silently 'fix' business behavior during visual redesign.**

## 10. Progress ledger — update after each owner decision

| Batch | Planning | Implementation | Verification | Owner acceptance | Commit | Open follow-up |
|---|---|---|---|---|---|---|
| UI-0 | Complete | N/A | Source inventory | Reviewed | N/A | Route/CSS inventory may age |
| UI-1A | Complete | Reported complete | Build/lint/synthetic; Antigravity source review | **Provisionally accepted** | `d916447` reported | Real authenticated role smoke; no true pre-change landing screenshot |
| UI-1B | Report received | **Not started** | Not started | **Awaiting owner approval** | — | Finalize compatibility/test scope |
| UI-1C onward | Candidate only | Not started | Not started | Not approved | — | Re-evaluate after preceding batch |

**Ledger update rule:** agent may propose a ledger update in its report, but may not mark a batch accepted. The owner or an explicitly authorized documentation-only follow-up updates this file after reviewing evidence. Do not rewrite historical PASS evidence as fresh verification.

## 11. Reusable short prompts (not standing authorization)

**Planning:** “Read `docs/UI_REDESIGN_MASTER_PLAN.md` and canonical Project Brain documents. Perform Stage A for the next candidate batch only. No edits, database access or Git mutations. Report exact scope and STOP.”

**Implementation (only after owner approval):** “UI-[ID] is explicitly approved with these exact files and acceptance criteria: [DETAILS]. Follow Stage B of `docs/UI_REDESIGN_MASTER_PLAN.md`. Preserve all contracts. Do not commit/push. Report and STOP.”

**Review:** “Perform read-only Stage C evidence review for UI-[ID]. Check actual diff, regression risks and test evidence; distinguish verified from unverified. Recommend ACCEPT / PROVISIONALLY ACCEPT / HOLD. No edits and STOP.”

## 12. Placement and maintenance

Recommended repository path: **`docs/UI_REDESIGN_MASTER_PLAN.md`**. This delivered Markdown file is an external draft until the owner places it there. Antigravity should not overwrite existing docs or create this file in the repository without explicit authorization. The existing `UI_DESIGN_SYSTEM.md`, `UI_REDESIGN_PLAYBOOK.md` and `UI_AUDIT_PLAN.md` remain valuable; cross-link them instead of deleting or wholesale replacing them. Reconcile any contradictions against current code and approved decisions, then record the resolution with owner approval.

---

**Final operating principle:** One master plan for continuity; **one authorized implementation batch at a time**; actual source and QA evidence over agent assertions; landing page protected; human owner controls approvals and Git.
