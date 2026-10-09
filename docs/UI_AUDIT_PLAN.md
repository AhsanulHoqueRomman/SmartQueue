# QueueTurn UI Audit Plan

## A. Metadata, scope and evidence

Project Brain Phase 4; 2026-10-10; main / 4a9920c3a648c2925dc30956005a1c28a015918f. **This is a source-grounded future audit plan, not a completed visual audit.** No browser, screenshots, application tests/build, server, database, seed or email operation occurred. Route presence/source declarations do not prove runtime correctness, accessibility or visual quality.

Canonical owners: [Business Rules](BUSINESS_RULES.md), [Queue State Machine](QUEUE_STATE_MACHINE.md), [Role Permission Matrix](ROLE_PERMISSION_MATRIX.md), [Product Architecture](PRODUCT_ARCHITECTURE.md), [Known Issues](KNOWN_ISSUES.md), [UI Design System](UI_DESIGN_SYSTEM.md), [UI Redesign Playbook](UI_REDESIGN_PLAYBOOK.md). [Historical handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md) and [prior assessment](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md) are evidence, not automatic implementation truth.

CURRENT below means source inventory; OBSERVATION means static concern; PROPOSED/FUTURE means work not executed. Every visual judgment remains UNVERIFIED. Do not promote a candidate to a confirmed finding or change existing F severity during this audit.

## B. Page and route inventory

Source authority: `frontend/src/routes/AppRoutes.jsx`, `frontend/src/routes/RoleRoute.jsx` and `frontend/src/components/AppShell.jsx`. Public pages can contain auth-dependent actions; operational routes use ProtectedRoute/RoleRoute, while backend permissions remain authoritative. Routes below are literal current patterns, not proposed destinations.

## C. Page-by-page audit matrix

Table convention: **Source** is relative to `frontend/src/pages/` (all named files exist). **Structure / reuse** describes source organization or component families to inspect, not a visual approval. **Checks/dependencies** combines source-known concerns, API/context dependencies and future accessibility/responsive checks. Audit ordering **NOW/NEXT/LATER/PROTECTED** is proposed UI work order, never a replacement for P1/P2 findings. In every row: keyboard/focus, both themes, loading/error/empty states and responsive behavior require future runtime inspection.

| Page / current route | Audience / primary task | Source | Current structure / reuse | Checks, dependencies and future audit emphasis | Order |
|---|---|---|---|---|---|
| Landing `/` | Public; discovery, customer context | `LandingPage.jsx` | PublicNavbar; hero, discovery, personalization, phase-three/four components | Actual discovery/appointment/queue data, role/empty states; protected motion/overflow/anchors | PROTECTED |
| Search `/search` | Public; find services/organizations | `public/GlobalSearchPage.jsx` | Search/results, public shell/styles | Discovery contract, stale query responses, meaningful result links; keyboard and mobile filters | NEXT |
| Professionals `/professionals` | Public; compare professionals | `ProfessionalsPage.jsx` | Directory/filter/cards | Provider discovery pricing/safe schedule fields, approved eligibility; image fallback, long names | NEXT |
| Organizations `/organizations` | Public; browse organizations | `customer/OrganizationsPage.jsx` | Filter/cards and profile actions | Organization/category data; F-020 eligibility consistency, readable pricing/null states | NEXT |
| Organization `/organizations/:organizationId` | Public; assess organization and book | `customer/OrganizationProfilePage.jsx` | Profile/banner/services, ProfessionalCarousel, embedded booking/modal | Hours/current_status, service/provider prices, snapshots; F-001/F-020 public data; modal/overflow | NEXT |
| Service detail `/organizations/:organizationId/services/:serviceId` | Public; compare eligible providers | `customer/OrganizationProfilePage.jsx` | Existing profile service-detail experience | Backend starting/effective charges; no React minimum; dialog focus and route state | NEXT |
| Professional `/organizations/:organizationId/providers/:providerId` | Public; view professional | `customer/ProviderPublicProfilePage.jsx` | Profile/services/schedule presentation | F-001/F-002/F-019 documents/customer-safe schedules; no private credential/contact leakage | NOW |
| Contact `/contact` | Public; send enquiry | `public/ContactPage.jsx` | Form, field/live feedback | F-021 API success versus email delivery; existing aria associations; failure preservation | NEXT |
| Favorites `/favorites` | Auth-dependent saved discovery | `customer/CustomerFavoritesPage.jsx` | Saved organization cards/empty state | Real persisted choices, guest behavior, route navigation; do not fabricate content | LATER |
| Login `/login` | Guest; authenticate | `LoginPage.jsx` | Auth form and role destination | AuthContext/client refresh, clear generic errors, password keyboard/autofill | NOW |
| Forgot password `/forgot-password` | Guest; request recovery | `ForgotPasswordPage.jsx` | Auth form/result | Enumeration-safe response, delivery not guaranteed; announcement/focus | NEXT |
| Reset `/reset-password/:uid/:token` | Token holder; reset password | `ResetPasswordPage.jsx` | Token/password form | Invalid/expired token and validation, no private information exposure; mobile keyboard | NEXT |
| Register chooser `/register` | Guest; choose supported registration | `RegisterPage.jsx` | Role/path choices | Actual registration routes; distinguish global customer and organization roles | NEXT |
| Customer register `/register/customer` | Guest; create customer | `customer/CustomerRegisterPage.jsx` | Registration form | User identity/validation, predictable errors and password inputs | NEXT |
| Manager register `/register/manager` | Guest; create organization/manager | `manager/ManagerRegisterPage.jsx` | Organization/account registration | Role/organization validation; progress and retained inputs | NOW |
| Provider register `/register/provider` | Guest; request provider onboarding | `provider/ProviderRegisterPage.jsx` | Registration/progress | F-004 provider registration/orphan-user persistence; membership/approval semantics, file validation if applicable; no premature operational access | NEXT |
| Provider invitation `/invitations/provider/:token` | Invitee; accept invitation | `AcceptInvitationPage.jsx` | Token acceptance/account form | Valid/expired/used token, role/state result; no token exposure in feedback | NEXT |
| Staff invitation `/invitations/staff/:token` | Invitee; accept staff invitation | `AcceptStaffInvitationPage.jsx` | Token acceptance/account form | Same token/role checks with staff scope; keyboard/error recovery | NEXT |
| Shared profile `/profile` | Authenticated; edit own profile | `ProfilePage.jsx` | Profile/account form | Auth/user update contract; appointment contacts remain independent; save/error announcements | NEXT |
| Not found `*` | Any; recover navigation | `NotFoundPage.jsx` | Error/recovery page | Real safe destination; no invented routes; focus and theme | LATER |
| Customer dashboard `/customer/dashboard` | Customer; next visit and actions | `portals/CustomerDashboard.jsx` | AppShell; dashboard cards | Real appointments/telemetry, snapshot/date/readiness; F-016/F-017/F-023 async display | NOW |
| Direct booking `/customer/book` | Customer; reserve serial | `customer/BookAppointmentPage.jsx` | Stepper, dependency-reset cards, contact, review modal | Eligibility/availability API, stale suppression, preserved edits, server price; no slots | NOW |
| Customer appointments `/customer/appointments` | Customer; list own bookings | `customer/CustomerAppointmentsPage.jsx` | Lists/filters/status/actions | Own-record API, snapshots, cancellation/modal states; F-005/F-006/F-023 | NOW |
| Appointment `/customer/appointments/:id` | Customer; manage own booking | `customer/CustomerAppointmentDetailPage.jsx` | Detail/status/action/modals | F-005/F-006 reschedule races/capacity, contacts/charge legacy null; accessible action errors | NOW |
| Live queue `/customer/queue/:queueEntryId` | Customer; own queue/readiness | `customer/CustomerLiveQueuePage.jsx` | Polling telemetry/status | F-015 private endpoint failure, F-016/F-017 transformation, F-023 late response; stale/denied state | NOW |
| Notifications `/customer/notifications` | Customer; read own notifications | `customer/NotificationsPage.jsx` | List/read controls | Notification ownership, read/unread feedback, empty/loading; F-023 family | NEXT |
| Reviews `/customer/reviews` | Customer; own reviews | `customer/CustomerReviewsPage.jsx` | Review list/actions | Review eligibility/API and public identity exposure F-001; dialog/error accessibility | NEXT |
| Favorites `/customer/favorites`, `/customer/saved-clinics` | Customer; saved organizations | `customer/CustomerFavoritesPage.jsx` | Shared saved cards | Storage/auth context and aliases; correct empty states, no fake recent data | LATER |
| Provider dashboard `/provider/dashboard` | Provider; own operational overview | `portals/ProviderDashboard.jsx` | AppShell; operational cards | Provider/membership context, active work and correct actions; role-switch stale data | NOW |
| Provider appointments `/provider/appointments` | Provider; own appointment workload | `provider/ProviderAppointmentsPage.jsx` | List/filter/status | Provider ownership, historical snapshot/contact scope; table/row action identity | NEXT |
| Provider queue `/provider/queue` | Provider; own command board | `provider/ProviderQueuePage.jsx` | Queue/control board; walk-in interaction | F-012 payload mismatch; call/start/complete/skip, F-013 walk-in identity; pending actions | NOW |
| Provider services `/provider/services` | Provider; own service information | `provider/ProviderServicesPage.jsx` | Service list/config presentation | F-003 membership/approval, charge versus income terminology; exact write permissions | NEXT |
| Provider schedule `/provider/schedule` | Provider; manage availability | `provider/ProviderSchedulePage.jsx` | Schedule/break/leave controls | F-018 validation/integrity and F-019 safe exposure; date/time labels, mobile form density | NOW |
| Provider reviews `/provider/reviews` | Provider; inspect reviews | `provider/ProviderReviewsPage.jsx` | Reviews/results | Scope, customer-safe display, empty/error and long text | LATER |
| Staff dashboard `/staff/dashboard` | Staff; front-desk workload | `portals/StaffDashboard.jsx` | AppShell; operational cards | Membership/organization context, primary intake/check-in actions and stale switching | NOW |
| Staff queue `/staff/queue` | Staff; organization queue/intake | `staff/StaffQueuePage.jsx` | Queue board/polling and operations | F-023 polling, F-013 walk-in identity, explicit actions and provider/date context | NOW |
| Staff appointments `/staff/appointments` | Staff; check in/manage bookings | `staff/StaffAppointmentsPage.jsx` | Search/status/check-in list; StatusBadge/LoadingState/EmptyState | Organization filter/check-in contract, correct row identity and action feedback | NOW |
| Staff customers `/staff/customers` | Staff; organization customer lookup | `staff/StaffCustomersPage.jsx` | Customer results/search | Minimum necessary contact data, tenant scope, no unrestricted global identity browsing | NOW |
| Staff providers `/staff/providers` | Staff; provider lookup | `staff/StaffProvidersPage.jsx` | Provider results | Membership/approval/schedule scope; no inferred manager write privileges | NEXT |
| Staff services `/staff/services` | Staff; service lookup | `staff/StaffServicesPage.jsx` | Service results | Organization scope, customer charge terminology; readable mobile details | NEXT |
| Staff notifications `/staff/notifications` | Staff; own notifications | `customer/NotificationsPage.jsx` | Shared notification page in staff shell | Actual notification ownership, no customer-only assumption; focus/read state | NEXT |
| Manager dashboard `/manager/dashboard` | Manager; organization overview | `portals/ManagerDashboard.jsx` | AppShell; metrics/cards | Organization context, F-022 analytics scope/shape; dashboard versus valid API evidence | NOW |
| Manager appointments `/manager/appointments` | Manager; organization bookings | `manager/ManagerAppointmentsPage.jsx` | Provider/service/status filters; shared status/loading/empty | Tenant filter, stale context, contact/snapshot privacy and row actions | NOW |
| Manager queue `/manager/queue` | Manager; multi-provider operations | `manager/ManagerQueuePage.jsx` | Own multi-provider queueMap/board | Not a staff-page wrapper; correct provider/date identity, private endpoint scope | NOW |
| Manager services `/manager/services` | Manager; manage service catalog | `manager/ManagerServicesPage.jsx` | List/create/edit controls | Price/duration source fields, assignments/booking impacts; validation and destructive clarity | NEXT |
| Manager providers `/manager/providers` | Manager; manage providers/charges | `manager/ManagerProvidersPage.jsx` | Provider and assignment controls | Provider-first mutation lock contract, nullable override/zero; current versus historical price | NOW |
| Manager members `/manager/members` | Manager; organization membership | `manager/ManagerMembersPage.jsx` | Member management | Membership role/state, consequential action/tenant checks; route versus nav discoverability | NOW |
| Manager staff `/manager/staff` | Manager; staff/invitations | `manager/ManagerStaffPage.jsx` | Staff/invitation controls | Role/state/token privacy and error recovery; no cross-organization changes | NEXT |
| Manager reviews `/manager/reviews` | Manager; organization reviews | `manager/ManagerReviewsPage.jsx` | Review list | Scope/customer display F-001; long text and empty results | LATER |
| Manager analytics `/manager/analytics` | Manager; interpret metrics | `manager/ManagerAnalyticsPage.jsx` | Analytics/filter presentation | F-022 global/nested parameter/helper concerns; verify response before redesigning charts | NOW |
| Manager audit `/manager/audit` | Manager; inspect organization activity | `manager/ManagerAuditPage.jsx` | Audit results | Actor/data privacy, tenant scope and meaningful action labels; table density | NEXT |
| Manager settings `/manager/settings` | Manager; organization settings/hours | `manager/ManagerSettingsPage.jsx` | Settings/forms | Hours versus provider schedule, unknown current_status; timezone and validation | NEXT |
| Admin dashboard `/admin/dashboard` | Admin; platform overview | `portals/AdminDashboard.jsx` | AppShell; platform metrics | Explicit global scope, privileged data; no tenant-like presentation that hides scope | NOW |
| Admin organizations `/admin/organizations` | Admin; platform organization oversight | `admin/AdminOrganizationsPage.jsx` | Organization/admin actions | Verification/state changes, confirmation and audit feedback; focus/row identity | NOW |
| Admin users `/admin/users` | Admin; platform user oversight | `admin/AdminUsersPage.jsx` | User/admin actions | Global versus membership roles, private data minimization and privileged controls | NOW |
| Admin enquiries `/admin/contact` | Admin; inspect/respond to enquiries | `admin/AdminContactPage.jsx` | Enquiry/reply controls | F-021 status before send and ignored outcomes; D13 truthful reply/delivery semantics | NOW |

CURRENT aliases: `/dashboard`, `/app/dashboard` resolve role destinations; `/customer`, `/provider`, `/staff`, `/manager`, `/admin`, `/app` redirect. Legacy `/book`, `/appointments`, `/appointments/:id`, `/queue/:queueEntryId`, `/notifications`, `/reviews`, `/queue`, `/schedule`, `/services`, `/providers`, `/analytics`, `/audit` also exist. Parameterized legacy redirects use literal placeholder targets in source: PF-002 remains a candidate, requiring future navigation evidence. Do not invent extra help/privacy/terms routes.

Shared inventory includes PublicNavbar/AppShell/OrgSelector/UserAccountMenu/ThemeToggle/NotificationBell; StatusBadge/StatCard/LoadingState/EmptyState/ErrorBoundary; BookingContact/BookingReviewModal/BookingStepper and cancellation/review/report dialogs. Contexts Auth/Tenant/Theme/Toast and service modules own shared data/feedback. [Design system inventory](UI_DESIGN_SYSTEM.md#g-component-inventory-and-reuse) records absent generic primitives instead of pretending a component library exists.

## D. Audit dimensions

PROPOSED checklist for each row: visual hierarchy; navigation/active location; information density; form labels/validation; loading; empty/error/retry; responsive overflow; keyboard/screen-reader/focus; light/dark contrast; API contract/async correctness; tenant/role identity; appointment/queue/readiness vocabulary; historical price/contact snapshots; destructive/privileged confirmations; feedback and motion/reduced-motion.

Record each observation with source or runtime evidence, affected audience/task, expected canonical behavior, reproducible condition, consequence, recommendation and verification gap. A screenshot alone cannot certify permissions, serial fairness, snapshot immutability or race safety. Source markup alone cannot certify usable focus, announcements or contrast.

## E. Known issue dependencies and source observations

Existing IDs/severities remain owned by [Known Issues](KNOWN_ISSUES.md). Key UI-facing dependencies:

| Existing finding | Audit relevance / future evidence |
|---|---|
| F-012 P1 | Provider walk-in body lacks required provider_id; trace actual request before visual work |
| F-015 P2 | Customer live queue calls private operational endpoint; use safe telemetry, never widen permission casually |
| F-016 P2 | Display people-ahead transformation drops active work; compare backend and displayed fields |
| F-017 P2 | Browser-local date affects queue display; compare business timezone/date semantics |
| F-022 P2 | Analytics scope/shape and helper defects; distinguish active runtime paths from unused helper |
| F-023 P2 | Polling/late-response risks across customer/staff/notification paths; audit tenant/record switching |

Other material dependencies: F-001 public privacy (P1); F-002/F-003 provider document/membership behavior; F-004 partial provider registration; F-005/F-006 reschedule capacity/race (P1); F-007 global cleanup/overnight (P1); F-008–F-011 availability/ETA/priority; F-013 walk-in identity; F-014 legacy serial; F-018/F-019 schedule integrity/disclosure; F-020 eligibility inconsistency; F-021 email outcome handling. Do not copy full finding register or mark any fixed from this documentation.

OBSERVATIONS from inspected source, **not newly confirmed runtime defects**: BookingReviewModal focus loop covers enabled buttons, not a general dialog primitive; other dialogs lack equivalent lifecycle hooks; AppShell mobile drawer lacks the public menu's expanded/controls pattern; ToastContext/LoadingState do not expose live/status roles in inspected markup; StatusBadge unknown fallback and queue mappings need semantic review; cancellation date-time text may imply fixed-time consultation. ContactPage has existing field/live associations. These require future task-specific evidence; no F IDs/severities assigned.

## F. Landing protection and regression boundary

PROTECTED structure/content: navbar, hero/network, category rail, Your Next Visit, Instant Availability Lookup, Recently Viewed, organization cards/rail, How/Why replay, For Organizations, testimonials, closing CTA/footer. Keep actual-data/role behavior, surfaces, spacing and legitimate destinations; no redesign through an audit.

CURRENT declarations: scoped app/public token layers; DiscoveryRail .0375 px/ms (37.5px/sec), 2000ms genuine-interaction delay and immediate visibility resume reset; separate paged TestimonialPages; replay-capable useScrollPresence; reduced-motion fallbacks. These are source facts, not successful motion QA. FUTURE regression checks should cover entry from both directions, boundary jitter, hover/focus/manual pause, responsive controls and static reduced-motion content only if later changed paths warrant them. Do not rerun every approved landing check for an unrelated dashboard edit.

## G. Accessibility audit plan

PROPOSED target WCAG 2.2 AA; unverified today. By family: public navigation/rails require named controls, current location, clone tab order and native scrolling; auth/forms need programmatic labels, password/autofill, errors and preserved inputs; booking/dialogs need focus entry/containment/return, Escape/backdrop rules and pending action protection; boards/tables need row identity, sensible keyboard order and text beyond color; notifications/toasts need proportionate live announcements; mobile shells need drawer visibility/focus and reachable controls.

Across families, inspect contrast in both themes, disabled state clarity, zoom/reflow, touch target spacing, browser-native date/tel behavior and reduced motion. Keep headings/paragraphs noninteractive. Tests should distinguish aria declarations from actual assistive-technology behavior. No compliance claim or fabricated browser result is permitted.

## H. Responsive audit plan

### Responsive and theme source baseline

CURRENT `frontend/src/styles/index.css` has app breakpoints 480/768/1024/1280/1536 with workspace/header/sidebar overrides; public phase styles add 1240 menu, 1100 hero, 1000/600 discovery/footer, 1400 external rail arrows and 540 hero rules. Direct booking has 991 summary and 480 compact rules. These differ by scope; do not standardize blindly. Refer to [layout measurements](UI_DESIGN_SYSTEM.md#f-spacing-containers-and-density).

Light warm-sand/espresso and dark navy/teal declarations exist; scoped public surfaces and app tokens are not always identical. Audit theme rest/hover/focus/disabled/errors, not only page background. Current contrast and real overflow remain unverified.

### Future viewport checks

PROPOSED future representative targets: 390px phone, 900px intermediate, 1440px desktop, light/dark. Add breakpoint-adjacent cases only for changed shared rules (e.g. 767/768 shell, 991/992 booking, 1240/1241 public menu, 1399/1400 rail arrows). Include zoom, virtual keyboard, long names/address/email, large monetary/serial values, many rows/providers and null/empty states.

Check no page-level horizontal overflow, local table scroll without losing actions, visible modal buttons and focus, sticky offset, mobile drawer return and no layout shift on interaction. These are future acceptance cases, not checks executed in Phase 4.

## I. Prioritization framework

PROPOSED UI ordering: **NOW** privacy, misleading queue/price state, broken primary action or frequently used operational task; **NEXT** important form/navigation/accessibility/component consistency; **LATER** lower-frequency presentation improvements; **PROTECTED** approved areas needing narrow regression only. Consider user impact, task frequency, canonical correctness, accessibility/responsiveness, shared reuse, effort and unresolved policy dependency.

Do not equate this order with defect severity or automatically treat a cosmetic issue as security-critical. Existing P1/P2 remains unchanged. Policy-gated items await owner decision while independent audit can continue.

## J. Proposed incremental redesign sequence

FUTURE, separately authorized: establish runtime/source baseline → resolve or explicitly gate privacy/contract blockers → audit shared shell/feedback/dialog primitives → customer booking/appointment/live queue → provider command/schedule → staff intake/queue → manager configuration/analytics → auth/onboarding → admin oversight → optional public discovery refinement → scoped final accessibility/theme/responsive verification and documentation.

Use small slices and [playbook](UI_REDESIGN_PLAYBOOK.md#l-incremental-delivery-workflow), not a portal-wide rewrite. Stable approved landing content remains protected. A business/API defect requires its own scoped correction; UI modernization must not decide grace periods, queue fairness or price history.

## K. Future verification backlog and evidence recording

FUTURE manual/browser tasks: navigate actual role routes, change tenant/role while requests pending, exercise keyboard/dialogs, compare real authorized telemetry with displayed fields, verify contact edits/snapshot legacy null, validate queue action busy/error states, and inspect real contrast/reflow/motion. Source/API inspection precedes mutation; use existing safe authorized data. No broad tests/reseed/email/QA appointment creation without explicit task scope.

For each future check record route/role/theme/viewport, precise steps, actual result, command/log or screenshot reference if legitimately obtained, data safety, limitations and affected finding/decision. Focus tests/lint/build on changed code. Keep historical passing reports labeled historical, not rerun or current proof.

## L. Audit exit criteria

PROPOSED completed audit requires significant routed pages accounted for; primary tasks and reusable dependencies mapped; known issue/policy gates linked; repeatable evidence for claimed runtime defects; theme/accessibility/responsive gaps explicit; prioritized small proposals; protected invariants and no invented permissions; exact authorized diff/status reviewed. Implementation completion additionally requires its scoped checks, not merely an audit document.

Phase 4 satisfies documentation/static inventory only. No runtime audit completed, no finding closed, no policy resolved, no UI changed. Preserve the references and five preceding canonical documents.

## M. Open questions, contradictions and limitations

- D01–D20 remain unresolved in [Business Rules](BUSINESS_RULES.md): capacity/leave/hours coupling, duration history, forecast/check-in/readiness/overnight, walk-in identity/urgent/reschedule pricing/dual roles/reply outcomes/retry and missed-call/no-show/interruption policies. UI must not select policy implicitly.
- Source class names in `backend/apps/providers/views.py` are ProviderProfileListCreateView, ProviderProfileDetailView, ProviderDocumentUploadView. Current role matrix already uses the correct first two; other references are descriptive endpoint labels. Phase 5 rechecked the classes and URL mappings and corrected the unsupported naming-mismatch claim in [Product Architecture](PRODUCT_ARCHITECTURE.md#e-authentication-and-tenant-context). No role-matrix correction, permission change or finding closure was required.
- Visual screenshots, computed styles, contrast measurements, browser/device/assistive-technology behavior and runtime permission/error paths are missing. Approved landing direction is an owner constraint, not a fresh visual certification.
- A normalized spacing scale, generic accessible dialog/table/input system and dashboard-specific design refinements are recommendations, not shipped architecture. Confirm desired density, audit priorities and actual consumer requirements before creation.
- PF-001/PF-002 remain qualified candidates; inspected test assertions and redirect source do not certify HTTP/runtime outcomes. Protected legacy identifiers and API/database/migration structures remain unchanged.

Maintain this plan by replacing unknowns with dated evidence after authorized work. Link decisions to their canonical owner; never rewrite historical references or duplicate the full business/finding register.
