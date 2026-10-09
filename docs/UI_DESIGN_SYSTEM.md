# QueueTurn UI Design System Reference

## A. Metadata and authority

- **Identity:** QueueTurn — Multi-Tenant Appointment & Queue Management Platform. Book a serial. Arrive smarter. Wait less.
- **Phase/date:** Project Brain Phase 4, 2026-10-10 (Asia/Dhaka).
- **Baseline:** `main` / `4a9920c3a648c2925dc30956005a1c28a015918f`. Existing five canonical documents remain untracked and preserved. No frontend/backend changes accompany this document.
- **Purpose:** Describe the implemented visual foundation and distinguish future guidance from shipped behavior. This is documentation, not a token specification to install automatically.
- **Inputs:** [Historical intent](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md), [baseline audit](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md), current source and the five canonical documents below.
- **Evidence:** S SOURCE VERIFIED; T TEST ASSERTION INSPECTED, not executed; H HISTORICAL INTENT; D DOCUMENTED, NOT VERIFIED; I INFERRED; U UNKNOWN; R RUNTIME VERIFIED reserved and unused. No screenshots, browser/assistive-technology checks, tests, builds, servers or database operations occurred.
- **Labels:** CURRENT = source implementation; APPROVED DIRECTION = owner-accepted landing foundation; OBSERVATION = source inconsistency to investigate; RECOMMENDED = future standard requiring separately authorized implementation; UNVERIFIED = visual/runtime result unknown.

| Canonical reference | Authority |
|---|---|
| [BUSINESS_RULES](BUSINESS_RULES.md) | BR-001–BR-062, contradiction index and pending D01–D20; not rewritten here |
| [QUEUE_STATE_MACHINE](QUEUE_STATE_MACHINE.md) | Exact linked lifecycle and ETA branches |
| [ROLE_PERMISSION_MATRIX](ROLE_PERMISSION_MATRIX.md) | Backend method/ownership/tenant authority |
| [PRODUCT_ARCHITECTURE](PRODUCT_ARCHITECTURE.md) | Models, clients, APIs and data flow |
| [KNOWN_ISSUES](KNOWN_ISSUES.md) | Detailed original findings/priorities and candidate qualifications |
| [UI_REDESIGN_PLAYBOOK](UI_REDESIGN_PLAYBOOK.md) | Future change process and protected behavior |
| [UI_AUDIT_PLAN](UI_AUDIT_PLAN.md) | Source inventory and future validation backlog |

Maintenance: recheck import order, selector specificity, theme overrides, component props and API consumers before updating values. Record baseline/date and evidence. CSS declarations are not computed browser styles. Preserve business/finding IDs and policy ownership; do not declare a proposed standard implemented or accessible solely from CSS.

## B. Product experience principles

**Established product invariants (H/S):** Provider/date serial identity; global customer ownership; membership-based operational roles; backend-authoritative charge; appointment price/contact snapshots; presence-gated urgent/serial calling; explicit start/complete/skip; estimates rather than guaranteed consultation starts. Color or UI role strings do not grant permission. BR-001–BR-005, BR-012–BR-015, BR-023–BR-050.

**Recommended UX:** Put serial, date and professional before speculative time. Clearly label estimates, stale/loading telemetry and unknown hours. Preserve contacts/notes while invalidating upstream booking dependencies. Use readable text plus symbols for statuses, predictable forms and recoverable errors. Present each role's immediate tasks without copying marketing spacing into dense boards. Display only entitled customer/tenant information. Never present a saved inquiry as delivered email or a button click as completed consultation.

Trust must use backend-supported approval/rating data; no fabricated customer queues/reviews/social accounts. A clearly illustrative hero is not authenticated personalization. Mobile task access and privacy matter as much as desktop visual polish. D05–D08 remain unresolved; this reference does not choose new arrival/readiness policy.

## C. Existing visual foundation

S sources: `frontend/src/styles/index.css`, `frontend/src/styles/LandingPage.css`, `LandingPhaseOne.css`, `LandingPhaseTwo.css`, `LandingPhaseThree.css`, `LandingPhaseFour.css`, `LandingPolish.css` within that styles directory, plus `frontend/src/components/HeroProductStory.css`. The current landing imports are established in `frontend/src/pages/LandingPage.jsx` and its section components.

### Palette and token layers — CURRENT, aligned with APPROVED DIRECTION

Exact declaration values below; hex case retained. Light is root default, dark uses data-theme overrides. These are not a new palette.

| Token | Light | Dark | Context / reuse |
|---|---|---|---|
| `--color-bg` | #FAF8F3 | #0B1220 | App background; reuse in operational pages |
| `--color-bg-subtle` | #F3F0EA | #101927 | Quiet sections/secondary surfaces |
| `--color-surface` | #FFFFFF | #151F2D | Cards/forms/shell |
| `--color-surface-hover` | #F7F5F0 | #1C2939 | Restrained interactive surfaces |
| `--color-surface-active` | #EFECE6 | #202F40 | Selected surfaces |
| `--color-border` | #E6E1D9 | #2A394B | Standard border |
| `--color-border-hover` | #D6CFB9 | #35485E | Hover border |
| `--color-primary` | #2F2520 | #2A9D8F | Espresso/teal primary action |
| `--color-primary-hover` | #1C1917 | #35B3A4 | Primary hover |
| `--color-primary-text` | #FFFFFF | #081512 | Text on primary |
| `--color-secondary-accent` | #5F7A70 | #6F9187 | App sage accent, distinct from dark public sage |
| `--color-text-main` | #211C19 | #F3F6F5 | Main text |
| `--color-text-secondary` | #57534E | #C7D2D0 | Secondary readable content |
| `--color-text-muted` | #78716C | #91A09D | Helpers, not a default for all navigation |
| `--color-text-tertiary` | #A8A29E | #6E7E7B | Lowest emphasis; contrast UNVERIFIED |
| `--color-focus` | #2F2520 | #2A9D8F | Existing focus outline |
| `--color-overlay` | rgba(47, 37, 32, 0.4) | rgba(5, 9, 16, 0.75) | Modal overlay; actual composition requires browser checks |
| `--lp-bg`, `--lp-surface`, `--lp-text`, `--lp-text-sec`, `--lp-muted` | #FAF8F3; #FFFFFF; #211C19; #57534E; #78716C | #0B1220; #151F2D; #F3F6F5; #C7D2D0; #91A09D | Public layer, similar purpose but separate namespace |
| `--lp-sage` | #5F7A70 | #2A9D8F | Public accent; do not equate to dark app secondary accent |
| `--lp-btn-primary-bg`, `--lp-btn-primary-text` | #2F2520; #FFFFFF | #2A9D8F; #081512 | Primary public buttons |

`LandingPage.css` introductory palette comments contain older values; declarations above are authoritative. RECOMMENDED: reuse the layer appropriate to the consumer, not a blind merge of app/public variables.

### Public surface hierarchy — CURRENT / APPROVED DIRECTION

`LandingPhaseFour.css::.lp-landing-shell` scopes homepage boundary surfaces:

| Variable | Current declaration | Context / recommendation |
|---|---|---|
| `--lp-shell-nav-surface` light | color-mix(in srgb, var(--lp-surface) 70%, var(--lp-bg)) | Homepage navbar; keep isolated |
| `--lp-shell-nav-surface` dark | color-mix(in srgb, var(--lp-bg), rgb(from var(--color-overlay) r g b / 1) 30%) | Dark homepage navbar; browser support/appearance U |
| `--lp-shell-cta-surface` | color-mix(in srgb, var(--lp-sage) 8%, var(--lp-surface)) | Compact closing strip |
| `--lp-shell-footer-surface` light | color-mix(in srgb, var(--lp-bg-subtle) 55%, var(--lp-bg-deeper)) | Footer boundary |
| `--lp-shell-footer-surface` dark | color-mix(in srgb, var(--lp-bg), rgb(from var(--color-overlay) r g b / 1) 55%) | Dark footer boundary |

No gradients are declared in the inspected phase-one/two/three/four styles or HeroProductStory.css. Legacy `LandingPage.css` includes radial background/mask treatments and linear gradient text selectors such as `.lp-hero-accent`. Their presence does not prove the current product hero uses them; current hero uses `.lp-product-hero`. Base navbar blur is overridden with none by `.lp-phase-one-nav`. App modal/backdrop styles still contain blur. OBSERVATION: distinguish legacy/scoped rules from the approved flat public composition; do not remove them or copy them into dashboards during documentation work. RECOMMENDED: no new gradients/glow/glassmorphism without explicit design approval.

### Radii, elevation and interaction — CURRENT

| Source / token or class | Existing value | Context / recommendation |
|---|---|---|
| index.css `--radius-xs/sm/md/lg/xl/full` | 4px / 6px / 10px / 14px / 18px / 9999px | Buttons/forms/cards/badges; reuse appropriate existing radius |
| `--shadow-xs` | light 0 1px 2px 0 rgba(47, 37, 32, 0.04); dark 0 1px 2px 0 rgba(0, 0, 0, 0.4) | Small separation |
| `--shadow-md` | light 0 4px 18px 0 rgba(47, 37, 32, 0.05); dark 0 4px 18px 0 rgba(0, 0, 0, 0.5) | Default app card |
| `--shadow-lg` | light 0 8px 24px 0 rgba(47, 37, 32, 0.08); dark 0 8px 24px 0 rgba(0, 0, 0, 0.55) | Hover/device/dialog context |
| `--duration-fast/normal/slow` | 0.15s / 0.2s / 0.25s | App microinteraction |
| `--ease-out` | cubic-bezier(0.16, 1, 0.3, 1) | Existing easing, not new library |
| Landing `--motion-fast/normal/slow` | 160ms / 220ms / 380ms | Separate public motion tokens |
| `--lp-public-link-duration/easing` | 0.15s / ease | Navbar/footer vocabulary; dimensions differ |
| `.card`, `.card-hover` | surface/border, radius-lg; hover translateY(-2px), shadow-lg | Use elevation for actionable cards only where appropriate |
| `.discovery-category`, `.discovery-org-card` | 16px / 20px radii | Landing-specific presentation, not mandatory dashboard radii |

Inline SVGs appear in PublicNavbar, CategoryIcon, OrganizationArtwork and landing sections. AppShell mixes emoji icons; StatusBadge adds a text label and dot. `frontend/src/assets/` includes hero.png and starter react.svg/vite.svg; current React hero is not automatically that bitmap. ImageWithFallback and organization artwork provide controlled fallbacks. No installed icon/component library is declared in frontend/package.json. RECOMMENDED: reuse existing semantic SVG vocabulary incrementally, not install a library or mechanically change every icon.

## D. Semantic color and status

CURRENT index.css status foreground tokens are `--color-success` #4F7A5A, `--color-warning` #B77932, `--color-error` #B4534B and `--color-info` #52718A in both themes. Corresponding -bg alpha is 0.1 light and 0.16 dark; -border alpha 0.25 light and 0.3 dark. Completed foreground is #78716C light / #91A09D dark. Actual contrast on combined surfaces is UNVERIFIED, not assumed from theme naming.

| Meaning | Existing implementation | RECOMMENDED future use |
|---|---|---|
| Primary/secondary/disabled | `.btn-primary`, secondary/outline/ghost; `.btn:disabled` opacity .45 | One clear main action, native disabled plus explanation when needed |
| Success/warning/error/info | `.banner`, `.badge-*`, toast type and semantic variables | Text + icon + appropriate tone; never color alone |
| Appointment | StatusBadge maps PENDING warning, CONFIRMED info, CHECKED_IN/IN_PROGRESS success, COMPLETED completed, CANCELLED/NO_SHOW error-family | Preserve exact lifecycle distinction in label, even if tones share color |
| Queue | WAITING pending tone; CALLED/IN_PROGRESS same success class; SKIPPED cancellation tone; fallback no-show class | Do not imply CALLED already started or WAITING physically present; audit unknown/CANCELLED mappings |
| Readiness | queueDisplay normalized labels; backend NOT_YET/GET_READY/BE_READY/TURN_NOW/IN_SERVICE | Explicit guidance text; readiness is not Appointment.status or a persisted transition |
| Check-in | Presence flag plus status text/actions | Confirm actual server presence; no local assumption from WAITING |
| Urgent | Operator priority flag/reason and queue UI | Label priority; not emergency interruption, serial change or channel priority |
| Verification | Backend approval/trust fields and page-local badges | Trust wording must derive from authority, not superficial styling |
| Unknown/neutral | Muted text/empty states and hours unavailable | Unknown is not closed, zero capacity, failed or completed |

LandingPolish.css also declares seven industry-art accents (`--sq-medical`, rose, cyan, blue, gold, violet, orange) with dark variants. These are source-existing semantic illustration details, not a replacement brand palette or readiness colors. Preserve scoped use and both themes.

## E. Typography

CURRENT: index.css imports Inter weights 300/400/500/600/700/800 from Google Fonts; `--font-family` includes system fallbacks. No external font retrieval was performed; load/fallback rendering U. Base html 16px; body line-height 1.5. Headings line-height 1.25/letter-spacing -0.02em; h1/h2 700, h3/h4 600.

| Existing class/element | Declaration | Context / future recommendation |
|---|---|---|
| h1/h2/h3/h4 | 1.875rem / 1.375rem / 1.125rem / .9375rem | App baseline; later mobile/booking overrides exist |
| p / `.subtitle` | .9375rem / .875rem | Body/helper; maintain readable wrapping |
| `.text-xs/sm/base/lg` | .75rem / .84rem / .9375rem / 1.125rem | Existing utilities, not a newly finalized type scale |
| `.font-normal/medium/semibold/bold` | 400 / 500 / 600 / 700 | Avoid hover weight changes causing reflow |
| `.form-label` | .8125rem / 600, .4rem bottom margin | Compact operational form label |
| `.table` / th | .875rem body; .75rem / 600 header | Check dense data/zoom before normalization |
| `.stat-card-value` | 1.75rem / 800 / line-height 1 | Numeric emphasis; don't reuse as every serial label automatically |
| `.lp-product-hero h1` | clamp(3rem, 4.5vw, 4.75rem), 800, 1.06, -.055em | Protected marketing headline; not dashboard page-title scale |
| `.phase-two-section h2` | clamp(1.7rem, 3vw, 2.2rem), line-height 1.2 | Discovery headings |
| Public nav `.lp-nav-link` | 500; phase-one .78rem desktop | Readable resting navigation with emphasis hover/current |

RECOMMENDED normalization is an approved role-specific hierarchy, not new token values: page task title → section/task group → card title → body/table → helper. Serial should remain visually identifiable with its date/provider scope; wait numbers must retain units and estimate qualification. Long names/taka amounts need wrapping/zoom tests, not smaller type by default.

## F. Spacing, containers and density

CURRENT source measurements below are declared values, affected by cascade/media. They do not form a finalized universal spacing scale.

| Source / class | Existing measurement | Usage / recommendation |
|---|---|---|
| index.css `.gap-xs/sm/md/lg` | .375rem / .75rem / 1.25rem / 1.75rem | Existing layout utility family |
| `.app-container` base | max-width 1200px; padding 2rem 1.5rem | App container, overridden by later breakpoints |
| `.app-workspace` base | max-width 1440px; padding 1.5rem 1.75rem; min-width 0 | Shell main; do not force public max-width globally |
| `.app-navbar` | 64px, sticky top 0 | Small-screen rule allows height auto/min-height 64px |
| `.app-sidebar` | 260px fixed mobile; 240px sticky at min-width 768px | Drawer versus desktop rail; test expanded header offset |
| `.lp-phase-one-nav .lp-nav-inner` | max-width 1360px | Public header frame |
| `.lp-product-hero-inner`, `.phase-two-section`, `.phase-four-inner` | max-width 1240px | Protected landing content rail |
| `.card` base | 1.5rem padding; responsive 1rem/1.25rem | App density; public cards differ intentionally |
| `.table th` / td | .875rem 1.25rem / 1rem 1.25rem | Wide operational table; horizontal scrolling wrapper |
| `.modal-container` | max-width 520px; backdrop padding 1.5rem | CSS convention, not universal modal component |
| CancelAppointmentModal | inline max-width 480px; overlay padding 1rem | Existing divergence from common convention |
| `.availability-finder` | max-width 1240px; margin 64px auto; padding 32px; radius 24px | Protected discovery tool; not dense dashboard template |
| `.discovery-category` / org card | width 224px / 340px; category min-height 178px | Preserve approved rail card sizing |
| `.closing-panel` | padding 28px 32px; three-column icon/content/action | Compact closing strip; not another hero |

Source breakpoints alter grids/padding: app <480, 480–767, >=768, >=1024, >=1280, >=1536; additional header/booking rules at 639/640. Public families use 540/600/1000/1100/1240 and wide rail 1400. DirectBooking.css uses 991/480. These intentional scopes are not one interchangeable global breakpoint set. Mobile gutters include 16px app small mobile and 20px public closing/discovery contexts. RECOMMENDED: measure target page's actual containing block before unifying any spacing.

## G. Component inventory and reuse

All paths in this table are under `frontend/src/`; categories without a reusable primitive are identified rather than invented. Reuse recommendations are future proposals.

| Category | CURRENT source / usage | OBSERVATION and RECOMMENDED standard |
|---|---|---|
| Buttons | styles/index.css `.btn` variants; LandingPage.css `.lp-btn-*`; native page buttons | No universal Button.jsx; reuse class appropriate to shell; preserve props/type/disabled/links |
| Inputs/selects/textarea | `.form-control` and global native selectors; BookingContact.jsx; registration and management forms | Shared styling, page-local behavior; audit global selector collisions before new variants |
| Checkbox/radio/date | Native controls in booking/registration/manager pages; date-level input in BookAppointmentPage | No shared checkbox/date-picker primitive; preserve serial/date availability, not slot grid |
| Validation | hooks/useBookingContact.js; ContactPage field errors; registration fieldErrors | Mixed native/local/server patterns; recommended linked error IDs, no duplicate contradictory phone rules |
| Cards/metrics | StatCard.jsx; `.card`; CustomerBookingCard.jsx; page-local public cards | Task cards versus marketing cards intentionally differ; avoid universal abstraction from appearance alone |
| Tables | `.table-container`, `.table-responsive`, `.table`; operational page-native tables | No shared DataTable primitive found; preserve semantics/row actions and entitled fields |
| Badges/status | StatusBadge.jsx; CSS `.badge-*`; inline role/verification badges | Central status component not exhaustive; audit mappings before widening behavior |
| Alerts/toasts | CSS `.banner`; contexts/ToastContext.jsx; page-local messages | Toast auto-dismiss 4000ms, no live-region role in source; recommend persistent actionable errors and announcements |
| Modals/confirmations | BookingReviewModal.jsx, CancelAppointmentModal.jsx, LeaveReviewModal.jsx, ReportIssueModal.jsx; local manager/admin overlays | No generic modal behavior primitive; booking modal has focus handling others do not uniformly share |
| Drawer | AppShell.jsx mobile sidebar/backdrop; PublicNavbar.jsx menu | Shell-local patterns, no shared Drawer.jsx; future semantics/focus lifecycle audit |
| Tabs | CustomerAppointmentsPage, ProviderSchedulePage, ManagerProvidersPage, AdminContactPage local activeTab | No shared Tabs primitive; verify semantics/keyboard before extracting |
| Navigation | PublicNavbar.jsx, AppShell.jsx, Navbar.jsx, UserAccountMenu.jsx, OrgSelector.jsx, ThemeToggle.jsx | Active-route UX differs by shell; never invent role grants or routes |
| Breadcrumbs | Page-local back/profile navigation; no shared Breadcrumbs component in inventory | Proposed when hierarchy needs it, not mandatory new chrome |
| Search/filter/pagination | InstantAvailabilityFinder.jsx; ProfessionalsPage filters/Previous–Next nav; page-local lists | No global search/pagination primitive; result counts/empty/errors and filter reset must be explicit |
| Loading | LoadingState.jsx exports LoadingSpinner, SkeletonCard, SkeletonTable; route spinner and inline states | Shared loading visual lacks busy/status semantics in source; recommend named task feedback without duplicate announcements |
| Empty/error | EmptyState.jsx, ErrorBoundary.jsx; page-local failures/retry | Distinguish genuine zero results from unauthorized/failing API; boundary isn't async error handling |
| Notifications | NotificationBell.jsx, customer NotificationsPage.jsx | Recipient-scoped, role-aware actions; F-023 pending requests need future verification |
| Rails/media | DiscoveryRail.jsx, ProfessionalCarousel.jsx, TestimonialPages.jsx, ImageWithFallback.jsx, OrganizationArtwork.jsx | Separate continuous, manual and paged behavior; do not merge merely because all slide horizontally |
| Booking progress/summary | BookingStepper.jsx, BookingContact.jsx, BookingReviewModal.jsx | Preserve contacts, backend charges and current dependency state across standalone/storefront consumers |

No installed UI component library is established. Inline page styles and parallel public/app classes are source-observable duplication, not automatic defects. Create a new primitive only after an actual repeated behavioral contract and consumer inventory justify it.

## H. Navigation and shells

CURRENT public/auth page components render PublicNavbar themselves: LandingPage, ProfessionalsPage, GlobalSearchPage, ContactPage, OrganizationsPage, OrganizationProfilePage, ProviderPublicProfilePage, LoginPage, ForgotPasswordPage, ResetPasswordPage, RegisterPage, CustomerRegisterPage, ManagerRegisterPage, ProviderRegisterPage, AcceptInvitationPage and AcceptStaffInvitationPage. `frontend/src/routes/AppRoutes.jsx` selects these pages and directly composes AppShell on role-protected operational/customer routes; it does not compose PublicNavbar. `RoleRoute.jsx`/ProtectedRoute control UX; backend permissions remain authoritative. AppShell uses header, responsive sidebar, tenant picker, theme toggle, NotificationBell, role badge and UserAccountMenu; nav destinations depend on TenantContext.effectiveRole.

| Family | Existing destinations / emphasis |
|---|---|
| Public | `/organizations`, `/professionals`, `/search`, `/contact`; landing anchors for how/why/business |
| Customer | `/customer/dashboard`, `/customer/book`, appointments/detail, queue/detail, notifications/reviews/saved-clinics; global profile |
| Provider | `/provider/dashboard`, appointments/queue/services/schedule/reviews; assigned provider tasks |
| Staff | `/staff/dashboard`, queue/appointments/customers/providers/services/notifications |
| Manager | `/manager/dashboard`, appointments/queue/services/providers/members/staff/reviews/analytics/audit/settings |
| Platform admin | `/admin/dashboard`, organizations/users/contact; global rather than selected-tenant scope |

PublicNavbar carries aria-expanded/controls and Escape/outside-click handling; menu replaces link row at <=1240px. Current-location emphasis is explicitly set for Professionals/Contact via activePage, not universally for every anchor. AppShell NavLink sets selected foreground/background; mobile toggle currently has an accessible label but no aria-expanded/controls in source. OrgSelector hides for customer, shows global scope for admin and selects membership for operational roles. Changing tenant can change effective role; there is no invented independent five-role switcher. UserAccountMenu/account routing should be verified as implemented, not assumed to grant roles.

ThemeProvider reads smartqueue_theme, falls back to OS preference then light, updates root data-theme/colorScheme and persists the key. Preserve all browser keys and sq-* selectors (BR-062). Legacy aliases using literal route placeholders are PF-002, not proof canonical detail routes fail.

## I. Forms and interaction

CURRENT booking uses native required contact fields, centralized lightweight hook validation, backend authoritative normalization and final review modal. useBookingContact retains edited values via nullish fallback, so profile refetch does not overwrite edits. BookAppointmentPage resets downstream selections/availability while preserving contact/notes; request revisions suppress old availability results. Submit state prevents repeated UI confirmation, not server request idempotency (D14).

ContactPage has aria-invalid/describedby and live feedback; registration tracks page-local fieldErrors and loading/step state. Provider registration UI cannot bypass F-002/F-003/F-004 backend defects. Provider walk-in shape conflicts with required provider_id (F-012); shared-phone identity is D09/F-013. Schedule mutation integrity F-018 cannot be repaired by cosmetic labels. ManagerProvider assignment charge controls call backend override endpoint and explain clearing to base; no client-side authoritative pricing rule.

RECOMMENDED: associated label, required/optional text, bounded input, field-linked server error and form-level recovery; preserve input after failures. Native disabled during submit plus informative status; destructive confirmation names target/action and consequences. window.confirm is used in several manager deletes/invitation actions; custom overlays differ. Do not optimistically announce cancellation/completion before response or allow backdrop-close to imply request cancellation. Retry network failures must not silently double-book; D14 must precede server idempotency assumptions. Audit tenant changes and pending edits before introducing reset/persistence policy.

## J. Queue and appointment presentation

Canonical algorithm remains [state machine](QUEUE_STATE_MACHINE.md#eta-and-readiness), not these recommended labels. Backend values, display transformations and unresolved policy must remain distinct.

| Information/action | CURRENT boundary and recommended presentation |
|---|---|
| Booking confirmation | Show returned serial/date/service/professional/org; confirm reservation, not payment or fixed consultation start |
| Service charge/contact | Prefer booked_service_charge/contact_name/contact_phone snapshots; null legacy price is unknown, not today's effective price; contact fallback only where contract supplies it |
| Selected-provider charge | Backend effective_customer_charge; starting_from_price is minimum discovery information, not selected price |
| Date/serial | Provider/date-scoped identity; keep date visible, not a globally unique bare token |
| Queue position/people ahead | Raw scheduled_ahead, checked_in_ahead, people_ahead differ; F-016 UI can omit active service; D05 remains pending |
| ETA/arrival | Estimated wait/window/arrival, with units and fresh-data context; no guaranteed slot; F-009 duration basis and F-010 readiness policy pending |
| Check-in | Server can_check_in, same-business-date and actor gates; opening metadata does not currently enforce its implied time window (D06) |
| Readiness | NOT_YET/GET_READY/BE_READY/TURN_NOW/IN_SERVICE as computed advice, not lifecycle transition or promised notification |
| Urgent | Flag changes eligible ordering, not serial/channel/presence; D10 safeguards unresolved |
| CALLED versus IN_PROGRESS | Called is invitation; explicit Start records actual service start; separate text even when badge color same |
| COMPLETED | Explicit service completion; expiry of estimated duration does not complete |
| SKIPPED/NO_SHOW | Skip links queue SKIPPED to appointment NO_SHOW; no general restoration inferred from enum (D16) |
| Cancel/reschedule | Show backend permitted actions/errors, preserve snapshots; F-005/F-006 backend gaps cannot be hidden by frontend guarantees |
| Delay/empty/closed | Distinguish no checked callers, no bookings, unavailable provider, failed read and delayed estimate; public org closed does not alone close provider capacity |

Source consumers: `frontend/src/utils/queueDisplay.js`, `bookingDisplay.js` within utils; `frontend/src/components/BookingContact.jsx`, CustomerBookingCard.jsx and HomepageLiveQueueWidget.jsx; customer detail/live pages. queueDisplay transforms backend counts/business dates (F-016/F-017) and suppresses/renames future/past metadata. CustomerLiveQueuePage tries a private full queue (F-015); never widen permission as workaround. F-023 can leave stale async data. D05–D08 remain pending; any changed labels/algorithm require contract/policy review. Avoid certainty about overnight ongoing service while F-007 remains.

## K. Accessibility evidence and proposed target

**RECOMMENDED future acceptance target: WCAG 2.2 AA. Current compliance is not established.** No external standards request, contrast/browser/AT execution occurred. Source observations are not a whole-app accessibility verdict.

| Area | CURRENT source evidence / remaining verification |
|---|---|
| Semantics/names | Public header/nav/search landmarks, labelled rail buttons, dialog labels, BookingContact wrapping labels; tables use native markup. Audit heading order, scopes, repeated icons and landmarks per actual page |
| Keyboard/focus | Global :focus-visible 2px var(--color-focus), offset 2px; public controls have scoped rings. Rail ArrowLeft/Right/manual buttons; menu Escape. Keyboard reachability/clipping and touch gestures U |
| Modal behavior | BookingReviewModal portals to body, restores focus/overflow, autoFocus Back, traps enabled buttons and handles Escape unless submitting. Other modals do not consistently implement these hooks; current trap only covers buttons |
| Announcements/errors | ContactPage has live/field associations; ToastContext/LoadingState lack live/status roles in inspected source. Error visibility and announcement delivery U |
| Contrast | Theme declarations exist; no contrast certification, particularly muted text, status fills, disabled opacity and dark semantic colors |
| Motion | Global reduction plus scoped static fallbacks and JS matchMedia in rails; transforms/repeated animation and offscreen behavior need future live checks |
| Zoom/touch | Responsive and overflow rules exist; 36px public arrow/menu controls declared. Actual target spacing, zoom/reflow, virtual keyboard and modal reachability U |

RECOMMENDED: labels/errors programmatically associated, named close controls, predictable focus entry/trap/return for all dialogs/drawers, meaningful live status changes without every poll announcement, text/icon beyond color and reachable mobile actions. Do not infer AT behavior from an aria attribute alone. No new defect severity is assigned to these audit observations.

## L. Responsive guidance

CURRENT app grids go one column at <=479, two at 480–767/768+, three at 1024+ for grid-cols-3/4, four at 1280+ for grid-cols-4. Workspace grows to 1480px at 1536+. Public hero stacks at <=1100; menu switches at <=1240; discovery/professional/footer grids adjust at 1000/600; hero/device has 540 rule. Direct booking switches desktop summary to in-flow details at <=991; 480 adjusts cards/success summary. Scoped overrides and inline grids require per-page inspection.

RECOMMENDED future checks: mobile touch/long names, intermediate collapsed navigation, desktop operational density; table region scroll rather than page overflow, clear row action identity, dialogs fitting viewport/zoom/keyboard, date inputs usable on devices. Do not force overlapping hero artwork or a desktop sidebar into a phone. Future targets and exact breakpoint-boundary cases are in [audit plan](UI_AUDIT_PLAN.md#h-responsive-audit-plan); none is visually verified here.

## M. Motion and feedback

CURRENT public motion is protected, not a dashboard default. Hero copy entrance uses .6s stagger; phone/cards use 550ms delayed entrances. Hero network loops use 13/16s dash paths, 3.8/4.8/3.4s node pulses and 11.5/8.5/13s tracers; .is-motion-paused and reduced-motion static fallbacks exist. Foreground does not continuously float in current declarations.

`frontend/src/hooks/useScrollPresence.js` separates enter threshold from .01 visibility exit, adapts for tall sections and supports replay. LandingPhaseThree has .65s entry/.9s journey activation/.26s connector rules; page-local delays define sequence. DiscoveryRail current movement multiplier .0375 px/ms implies **37.5px/sec** source speed, not the older requested 30px/sec. It pauses on hidden document/offscreen/hover/focus/drag; real manual navigation uses 2000ms resumeAt. Category is manual; TestimonialPages uses separate paged interaction. Do not tune these during dashboard work.

App buttons use restrained -1px hover/scale .98 press, cards -2px hover and CSS spinner/skeleton motion. Toast is .3s entrance and 4000ms removal; queue/notification polling is data refresh, not permission to fabricate status changes or announce every tick. Global reduced motion shortens duration/iteration; scoped public styles expose static content/remove tracers and JS disables rail autoplay. RECOMMENDED: operational feedback is task/status oriented, no ambient marketing network in dense boards; preserve errors long enough to act and show stale data truthfully.

## N. Governance

Existing source tokens/classes remain implementation truth; this document records values and proposed standards, not authorization. Shared behavior belongs to the component/context/hook that owns it. Reuse a tested existing control before creating a variant; inspect all consumers and avoid premature large abstraction. Proposed new tokens require reason, existing alternative analysis, light/dark values, affected scopes and owner approval when scope/design changes.

Prefer scoped public/app/component selectors; existing global native form and typography selectors make broad changes risky. Preserve landing max-width, shell surfaces, hero/rails/reveal behavior and responsive framing. Test component refactors against actual props/contracts, not screenshots alone. Record approved decisions and actual verification without inventing screenshots or passing checks. No palette/token/code changes, dependencies or AGENTS.md were created in Phase 4.
