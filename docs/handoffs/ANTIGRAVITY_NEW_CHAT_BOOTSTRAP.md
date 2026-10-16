# QueueTurn — Antigravity New Conversation Bootstrap Prompt

> **Purpose:** Copy and paste the block below into any new Antigravity development conversation to instantly orient the AI agent with complete context, authoritative rules, and immediate next steps.

---

```markdown
# QueueTurn — AI Agent Onboarding & Task Kickoff

You are joining an active software engineering project called **QueueTurn** (multi-tenant appointment and queue management platform).
**Tagline:** "Book a serial. Arrive smarter. Wait less."

## 1. Mandatory First Action: Live Repository Grounding

Before proposing any changes, writing code, or running mutation commands, perform this canonical startup check:
1. Inspect `AGENTS.md` in the workspace root.
2. Inspect the latest handoff documents:
   - `docs/handoffs/QUEUETURN_CURRENT_STATUS_AND_NEXT_STEPS.md`
   - `docs/handoffs/QUEUETURN_MASTER_PROJECT_HANDOFF.md`
3. Execute read-only Git inspection commands (`git status --short` and `git log -n 5 --oneline`) to inspect the LIVE Git state.
   - Do NOT assume the working tree is clean. Inspect actual output to verify whether handoff files have been committed by the owner or remain untracked.
4. Verify whether local development servers are running:
   - Backend: `http://127.0.0.1:8000` (Python 3.14.5, Django 6.1.1, DRF 3.18.1, PostgreSQL `smartqueue_db`)
   - Frontend: `http://localhost:5173` (React 19.2.8, React Router DOM 7.18.3, Vite 8.3.0)

Do NOT blindly trust historical conversation text or assume files exist without checking current source.

## 2. Verified Current State

- **Milestone Status:** UI-1G-C (Populated Customer Dashboard QA) has **PASSED**.
  - Browser QA verified populated card across 1440px, 1024px, 768px, 390px in Light theme and 1440px, 390px in Dark theme.
  - Physical arrival check-in and Live Queue calling workflows were explicitly NOT exercised.
- **Fixtures:** All temporary and unintended QA bookings have been cleanly cancelled via authorized APIs. Zero active test fixtures remain in the database.
- **Git Baseline:** Check live `git status`. Human owner manually handles staging and commits.
- **Approved Next Milestone:** **UI-2A — Reusable Table and List Presentation**.

## 3. Authoritative Core Invariants (Do Not Violate)

1. **Serial Booking, Not Guaranteed Time Slots:** Customers book a date-based serial number (`serial_number`). Consultations do not have guaranteed start times.
2. **Presence-Gated Calling:** Only checked-in (`is_checked_in = True`) WAITING customers can be called. Absent reservations are never callable.
3. **Ascending Serial Order:** Calling uses strictly ascending serial order. VIP flags, urgent overrides, and channel priority are forbidden.
4. **Readiness State Distinction:**
   - Persisted: `QueueEntry.readiness_state` is a stored model column with default `NOT_YET`.
   - Dynamic: The authoritative live readiness state returned by the API is dynamically computed on read by `apps.queue.forecast.calculate(entry)`.
   - Authoritative tokens: `NOT_YET`, `GET_READY`, `BE_READY`, `TURN_NOW`, `IN_SERVICE`. (`TURN_NOW` is the active token; `PROCEED_NOW` does not exist).
5. **Customer Self-Cancellation (BR-044):** Allowed only until at least 2 hours before the provider's scheduled shift start on the appointment date, while in `WAITING` status.
6. **Customer Self-Rescheduling (BR-005 / Lifecycle):** Allowed only while QueueEntry is `WAITING` and authoritative estimated service start is >= 90 minutes after current time.
7. **Operational Cancellation:** Authorized staff/managers/admins can cancel WAITING bookings operationally without the customer's 2-hour cutoff.
8. **Midnight Invariant (BR-045):** Midnight does not auto-cancel or auto-skip bookings. Consultations can cross midnight.
9. **Protected Branding Identifiers (BR-062):** Never rename `smartqueue_db`, `smartqueue_theme`, `sq_*` tokens, or `sq-*` CSS classes.
10. **Protected Landing Page:** Never edit `LandingPage.jsx`, landing stylesheets, or global design tokens during operational UI batches.
11. **Actual Model Classes:** Models are `accounts.User` (customer FK), `organizations.OrganizationMembership`, `providers.ProviderProfile`, `providers.ProviderService`, `providers.WeeklySchedule`, `providers.ScheduleBreak`, `appointments.Appointment`, `appointments.ProviderDateSerial`, `queue.QueueEntry`, `audit.AuditLog`.
12. **Refined Operational UI Philosophy (Owner Approved 2026-10-17):**
    - **Avoid Box/Card Overload:** Do not wrap every heading, metric, table, action, or info block in rectangular cards. Prefer open, breathable layouts, subtle hairline dividers (`--color-border`), and typographic hierarchy.
    - **Selective Framing & Purposeful Motion:** Use cards/borders selectively for semantic grouping. Restrain motion to drawers, hover/focus rings, modals, subtle reveals, and loading skeletons. No decorative row animations or polling re-animations. Respect reduced motion.
    - **Role-Specific Density:** Customer (calm/minimal), Staff (efficient scan-friendly lists), Provider (consultation/workload focus), Manager (governance/metrics/trends), Admin (dense audit-ready tables).
13. **Manager Dashboard Trend Graph Boundary:** The requested dynamic graph for the Manager Dashboard (Appointments trend & Completed services trend; no financial data) is a **SEPARATELY SCOPED PENDING ENHANCEMENT**. UI-1E is completed and accepted; the graph does NOT block or modify UI-2A.

## 4. Current Target: UI-2A (Reusable Table & List Presentation)

When authorized to begin UI-2A:
1. **Stage A (Plan):**
   - Read `docs/QueueTurn_UI_REDESIGN_MASTER_PLAN.md`.
   - Inspect existing list/table components (`frontend/src/components/`) and select **one** candidate operational surface (e.g., Staff Appointments or Manager Members list).
   - Design shared responsive table container (avoiding heavy boxed layouts), search/filter bar, pagination controls, and empty results state.
   - Present the Stage A proposal and **STOP** for human owner approval.
2. **Stage B (Implement):**
   - Edit only approved files.
   - Adhere strictly to the approved warm-sand/espresso (light) and navy/teal (dark) design system tokens.
   - Verify viewports (390px, 768px, 1024px, 1440px) and both themes.
   - Run linter (`npm run lint` / `oxlint`) and build (`npm run build`) checks.
3. **Stage C (Report):**
   - Present evidence and **STOP**. Do NOT commit Git or proceed to UI-2B automatically.

## 5. Strict Operational Constraints

- **No Git Commits:** The human owner handles all Git staging, commits, and pushes. Use only read-only Git commands.
- **No Direct DB Mutations:** Never execute direct SQL `UPDATE` or `DELETE` on `smartqueue_db`.
- **No Speculative Implementations:** The proposal in `docs/SERVICE_AWARE_ETA_FUTURE_PROPOSAL.md` is strictly **PROPOSED — NOT APPROVED FOR IMPLEMENTATION**. Do not implement it.
- **Do Not Implement Manager Graph in UI-2A:** The Manager Dashboard trend graph must be scoped and implemented in a separate dedicated batch.
- **Stop Conditions:** If backend changes, database schema alterations, or landing page modifications are required, STOP and request explicit owner guidance.
```

