# QueueTurn Role, Authorization and Tenant Matrix

## Metadata and authority

- **Phase/date:** Project Brain Phase 2, 2026-10-09; inspected `main` / `4a9920c` source.
- **Scope:** Backend permission gates, method-specific resource lookups, ownership/queryset restrictions and current public-data exceptions. Not a promise that every endpoint ran successfully.
- **Inputs:** [Original handoff](references/ORIGINAL_BUSINESS_RULES_HANDOFF.md), [baseline assessment](references/BUSINESS_RULE_BASELINE_ASSESSMENT.md), completed Phase 1 report, targeted current source. Both references read completely.
- **Evidence:** S = SOURCE VERIFIED; T = TEST ASSERTION INSPECTED, NOT EXECUTED; H = HISTORICAL PRODUCT INTENT; D = DOCUMENTED BUT NOT VERIFIED; I = INFERRED, REQUIRES VERIFICATION; U = UNKNOWN. R is reserved for runtime evidence and unused.
- **Policy:** APPROVED / ESTABLISHED intent, CURRENT IMPLEMENTATION, KNOWN DEFECT, POLICY PENDING, DEPRECATED / LEGACY, NOT VERIFIED are separate from evidence. Current exposure is not approved disclosure policy.
- **Maintenance:** Recheck permission class, HTTP method, resource lookup, queryset/object checks and serializer projection together. Do not infer authorization from comments, React guards or class names alone.
- **Ownership:** [Business rules](BUSINESS_RULES.md) own BR and D registries; [state machine](QUEUE_STATE_MACHINE.md) owns valid state/action prerequisites. [Product Architecture](PRODUCT_ARCHITECTURE.md) and [Known Issues](KNOWN_ISSUES.md), planned at Phase 2 creation, now own technical architecture and detailed findings.

## Identity and role model

**M1 update, owner approved 2026-10-10:** F-001/F-002/F-003/F-004/F-019/F-020 are CLOSED against the final source at `main` / `28b17dfd6c8e65e7854aa0359297acecb5b599e2` plus uncommitted M1 work. Their affected rows and qualifications below reflect the corrections. [M1 acceptance evidence](KNOWN_ISSUES.md#m1-closure-and-acceptance-evidence) records the historical 191-pass isolated SQLite selection and frontend verification; no tests or browser checks were newly run for documentation closure. Private downloads remain a separate [F-024](KNOWN_ISSUES.md#f-024) pre-production gate; schema variants remain [F-025](KNOWN_ISSUES.md#f-025). Unrelated permissions and policy decisions are unchanged.

Source: `backend/apps/accounts/models.py::User`; `backend/apps/organizations/models.py::OrganizationMembership`; `backend/apps/providers/models.py::ProviderProfile` — S. BR-001–BR-003/BR-010.

| Concept | Actual meaning |
|---|---|
| Global User / Customer | User has no stored tenant-role field. Customer is the account acting as appointment owner; no organization membership needed for ordinary booking. |
| OrganizationMembership | Unique user/organization relationship; role MANAGER, STAFF or PROVIDER; `is_active` gates operational permission. A user can have memberships in different tenants. |
| PROVIDER | Membership role linked to ProviderProfile. Own-provider/assigned-record permission is not organization-wide management. |
| Organization STAFF | Active tenant role for front-desk/queue actions. It does not set Django `is_staff` or grant platform administration. |
| MANAGER | Active tenant role for catalog, memberships, pricing and supported operations. Does not automatically grant contact/platform admin access. |
| Django `is_staff` / `is_superuser` | Inspected custom admin helpers accept either flag. Do not assume every Django admin feature or arbitrary endpoint shares that rule. |
| Inactive membership | Fails ordinary operational role gates; may still be a global customer/owner. Pending-provider application currently conflicts with this restriction. |
| Provider eligibility | Active profile, APPROVED application, active membership and active APPROVED organization; booking additionally requires PROVIDER role and service assignment. |

Provider application enum: INCOMPLETE, PENDING_REVIEW, APPROVED, REJECTED. Organization approval is separate. A profile may have `is_active=True` while its membership is inactive and its application incomplete. Never reduce these gates to one UI role string. Pending onboarding behavior is documented below.

## Backend permission model

| Permission/helper | Source / actual gate |
|---|---|
| IsSystemAdmin | `backend/apps/organizations/permissions.py`: authenticated `is_staff` or `is_superuser`. |
| IsOrganizationManager | Same file: active MANAGER in URL organization (or pk), or platform admin. |
| IsOrganizationMember | Same file: any active membership in target organization, or admin; not inherently manager-only. |
| IsOrganizationManagerOrOwnProvider | `backend/apps/providers/permissions.py`: admin, target active manager, or URL provider profile belonging to requester with active PROVIDER membership in target organization. |
| CanCreateAppointment | `backend/apps/appointments/permissions.py`: authenticated; creation view forces customer=request.user. |
| CanAccessOrganizationAppointments | Same file: auth gate; object permits admin, target manager/staff, customer owner, or assigned active provider. List filter is separate. |
| filter_appointments_for_user | Same file: organization-wide manager/staff/admin; provider assigned OR own customer records; otherwise customer=request.user. View first scopes to organization. |
| CanCancelOrRescheduleAppointment | Same file: owner, target manager/staff/admin; assigned provider only on cancel path. Reschedule view separately excludes assigned-only providers. |
| CanCheckInAppointment | Same file: owner, assigned active provider, target staff/manager/admin. Service date/eligibility gates still apply. |
| CanManageProviderQueue | `backend/apps/queue/permissions.py`: admin, active manager/staff in URL organization, or own active provider matching URL provider_id. |
| CanActOnQueueEntry | Same file: authenticated gate plus object check for target manager/staff/admin or assigned provider. Customer ownership alone does not authorize operational actions. |
| CanViewOwnQueue | Same file: authenticated only; view restricts appointment customer=request.user and organization. |
| CanViewNotifications | `backend/apps/notifications/permissions.py`: authenticated only; recipient filters supply data isolation, not membership alone. |
| CanViewAnalytics | `backend/apps/analytics/permissions.py`: admin or active manager for organization kwarg. |
| CanViewProviderMetrics | Same file: admin, active provider profile owner, or active manager of profile's organization. |
| CanExportAnalytics | Same file: admin or active manager of query-parameter organization_id. |

Object-checking views use explicit `has_object_permission` calls; a broad authenticated class-level gate alone does not grant all objects. Service methods are not a substitute for actor permission checks and optional `actor` mostly supplies audit/notification context. Foreign-key constraints alone do not enforce every cross-tenant relationship; loaders and service validation remain necessary.

## Detailed permission matrix

All rows describe **S / CURRENT IMPLEMENTATION** unless a qualification says otherwise. They include method, actual view, scope, ownership and known exceptions. State validation can reject an otherwise authorized action; see state machine.

### Endpoint notation and evidence keys

Actual routing: `backend/config/urls.py`, app `urls.py`, organization `category_urls.py` for categories, contact `admin_urls.py` for admin contact. `/api/v1/organizations/{org}/` is **O/** below. **P** is `{provider_id}` and **E** `{queue_entry_id}`; these are explanatory placeholders, not literal URLs.

Evidence keys expand to repository-relative files:

- **AV/APerm:** `backend/apps/appointments/views.py` / `permissions.py`.
- **QV/QPerm:** `backend/apps/queue/views.py` / `permissions.py`.
- **PV/PPerm:** `backend/apps/providers/views.py` / `permissions.py`.
- **OV/OPerm:** `backend/apps/organizations/views.py` / `permissions.py`.
- **SV:** `backend/apps/services/views.py`.
- **NV:** `backend/apps/notifications/views.py`; **FV:** `backend/apps/feedback/views.py`.
- **AnV/AnPerm:** `backend/apps/analytics/views.py` / `permissions.py`.
- **CV:** `backend/apps/contact/views.py`.

No row's admin allowance waives the resource lookup, active organization filter or business-state validation used by its view/service.

### Identity, public discovery and organization controls

| Action / endpoint or view | Method | Allowed role / membership | Scope / ownership / exceptions | Evidence |
|---|---|---|---|---|
| `/api/v1/auth/register/`, `register/customer/` — RegisterView | POST | AllowAny; no membership | Global user creation; serializer validation | `backend/apps/accounts/views.py:32–54`, `accounts/urls.py` |
| `auth/register/manager/` — RegisterManagerView | POST | AllowAny | New user + new organization/manager bootstrap, not manager authority over an arbitrary existing tenant | `accounts/views.py:57–112` |
| `auth/register/provider/` — RegisterProviderView | POST | AllowAny | Validate optional active organization before writes; atomic User/inactive PROVIDER membership/profile creation; additive provider_profile_id; F-004 CLOSED | `accounts/views.py::RegisterProviderView` |
| `auth/login/`, token refresh | POST | Login AllowAny; credentials/token validated, not organization membership | Global authentication; active membership considered by later operational gates | `accounts/views.py::LoginView`, `accounts/urls.py` |
| `auth/me/` — CurrentUserView | GET / PATCH | Authenticated | Requester's own User; no arbitrary tenant-user update implied | `accounts/views.py:229–255` |
| Password reset request/confirm | POST | Public token/email flow | Generic request result; reset proof validated separately; no recipient existence leakage | `accounts/views.py:277–328`, F-021 |
| O collection — OrganizationListCreateView | GET | AllowAny | Active APPROVED public list; OrganizationPublicSerializer excludes verification administration | OV::OrganizationListCreateView; F-001 CLOSED |
| O collection — OrganizationListCreateView | POST | Authenticated | New organization bootstrap for requester; not permission to manage foreign existing org | OV:64–112; OrganizationService.create_organization |
| O detail — OrganizationDetailView | GET | AllowAny | Public safe projection only for active APPROVED org; own active manager/admin retain private operational projection and nonoperational reads | OV::OrganizationDetailView; F-001 CLOSED |
| O detail | PATCH / PUT | Active target MANAGER or admin | URL organization; not STAFF/provider privilege | OV:174–190; OPerm |
| O services — ServiceListCreateView | GET | AllowAny | Public active services in active APPROVED organization; target manager/admin see management list. Starting price backend-derived | SV:44–81 |
| O services/{service}/ — ServiceDetailView | GET | AllowAny | Public active service in active APPROVED org; own active manager/admin may read unpublished/inactive records; mutation gates unchanged | SV::ServiceDetailView; F-020 CLOSED |
| O providers collection/detail | GET | AllowAny | Public discovery requires operational provider; manager/admin use privileged projection; detail also admits entitled owner/onboarding applicant, never another applicant | PV::ProviderProfileListCreateView, ProviderProfileDetailView; F-001/F-003 CLOSED |
| O providers/P/profile/ — ProviderPublicProfileView | GET | AllowAny | Public profile projection; operational check for nonmanager; provider_name uses trimmed name, public title, then Service Provider, never account email | PV::ProviderPublicProfileView; ProviderPublicProfileSerializer |
| O providers/P/availability/ — ProviderAvailabilityView | GET | CanQueryAvailability / public | Tenant/provider/service eligibility; customer-safe date capacity response; no guaranteed fixed slot | AV::ProviderAvailabilityView; appointments/services.py::get_available_slots |
| O operating-hours/ | GET | AllowAny | Active URL organization; this endpoint does not independently check approval. Separate from provider capacity | OV:828–854 |
| O operating-hours/ | POST / PUT | Active target MANAGER or admin | Active URL organization; validated weekly rows | OV::OrganizationOperatingHoursView |
| O services / categories creation and detail mutations | POST / PATCH / DELETE | Active target MANAGER or admin | Tenant resource lookups; no provider charge-management entitlement | SV::ServiceListCreateView, ServiceDetailView, CategoryListCreateView, CategoryDetailView |
| O providers collection creation / detail mutation | POST / PATCH / DELETE | POST/DELETE target manager/admin; PATCH manager/admin or own active provider | Membership/profile must belong to URL tenant; service validation; own provider does not gain other profiles | PV::ProviderProfileListCreateView, ProviderProfileDetailView; PPerm |

### Appointment and queue operations

| Action / endpoint or view | Method | Allowed role / membership | Organization / object boundary and exceptions | Evidence |
|---|---|---|---|---|
| O appointments/ — AppointmentListCreateView | POST | Any authenticated self; no customer membership needed | request.user is customer; provider/service constrained to org; ONLINE/SCHEDULED forced; authoritative price/serial | AV:97–175; APerm::CanCreateAppointment |
| O appointments/ | GET | Authenticated | First tenant queryset; manager/staff/admin org-wide; active provider assigned OR own; others own | AV:108–143; APerm::filter_appointments_for_user |
| O appointments/{appointment}/ | GET | Owner, assigned active provider, target active staff/manager, admin | `_get_appointment` scopes org; explicit object check | AV::AppointmentDetailView; APerm::CanAccessOrganizationAppointments |
| O appointments/{appointment}/ | PATCH | Owner, target active staff/manager, admin | Assigned provider alone denied; approved operational authority not capacity correctness. F-005/F-006 | AV:224–258; APerm::CanCancelOrRescheduleAppointment |
| O appointments/{appointment}/cancel/ | POST | Owner, assigned active provider, target active staff/manager, admin | Tenant/object + current cancellable status; stale checks F-006 | AV::AppointmentCancelView; APerm |
| O appointments/{appointment}/check-in/ | POST | Owner, assigned active provider, target active staff/manager, admin | Object permission then QueueService date/provider/state checks. Owner-actor repeat qualification BR-036 applies even to dual-role owner | AV::AppointmentCheckInView; APerm::CanCheckInAppointment |
| `/api/v1/customer/dashboard/` and customer appointment detail | GET | Authenticated | customer=request.user across organizations; operational role alone grants no other customer's records | AV::CustomerDashboardView, CustomerAppointmentItemDetailView |
| O queue/my/ — MyQueueListView | GET | Authenticated; no active membership required | URL active org AND appointment customer=request.user; optional date filter | QV:56–78; QPerm::CanViewOwnQueue |
| O queue/providers/P/ — ProviderQueueListView | GET | Own active provider, target active STAFF/MANAGER, admin | URL/provider permission then operational provider loader. Global cleanup exception F-007; customer call mismatch F-015 | QV:39–53; QPerm::CanManageProviderQueue |
| O queue/providers/P/call-next/ | POST | Same provider-queue operators | Scoped provider; no active entry for requested date; checked-in eligibility. Global cleanup happens before selection | QV:81–92; QPerm; QS::call_next |
| O queue/E/start/ and complete/ | POST | Assigned active provider, target active STAFF/MANAGER, admin | `_entry_for_org` + explicit object check; fresh service status checks. Customer owner alone denied | QV:95–119; QPerm::CanActOnQueueEntry |
| O queue/E/skip/ | POST | Same entry operators | CALLED entry and linked Appointment NO_SHOW transition; no assumed grace/return policy | QV::SkipQueueEntryView; QS::skip_queue_entry |
| O queue/E/urgent/ | POST | Same entry operators | Scoped entry; customer owner denied; reason/state/lock limitations F-011 | QV:149–170; QPerm; QS::mark_urgent |
| O queue/providers/P/walk-in/ | POST | Own active provider, target active STAFF/MANAGER, admin | URL provider authoritative in view; serializer still requires body provider_id; shared identity risk F-013; price server-resolved | QV:125–147; queue/serializers.py::WalkInRegisterSerializer; F-012 |

### Provider availability, assignments and onboarding

| Action / view | Method | Allowed role / membership | Scope, ownership and exceptions | Evidence |
|---|---|---|---|---|
| O providers/P/services/ — ProviderServiceListCreateView | GET | Any authenticated user | Tenant/profile lookup; inactive profile hidden from nonmanager; not necessarily full operational approval projection | PV:237–262 |
| Same assignment collection | POST | Active target MANAGER or admin | Provider/service same org validation; unique assignment | PV:264–275; providers/services.py::assign_service_to_provider |
| O providers/P/services/{assignment}/ — ProviderServiceDetailView | PATCH / DELETE | Active target MANAGER or admin | URL profile then assignment ownership; provider→assignment lock; customer-facing override, not income | PV:278–305; providers/services.py:265–302 |
| O providers/P/schedules/ | GET | Authenticated safe discovery; entitled operational readers | Safe projection for operational providers omits break titles; active owner/target manager/staff/admin retain annotations | PV::WeeklyScheduleListCreateView; F-019 CLOSED |
| Same schedules — WeeklyScheduleListCreateView | POST | Own active provider, active target manager, admin | Upsert own/target weekday; stored break validation gap F-018 | PV:342–354; PPerm |
| O providers/P/schedules/{schedule}/breaks/ | GET | Authenticated safe discovery; entitled operational readers | Nested provider/schedule lookup; safe projection omits title, operational readers retain it | PV::ScheduleBreakListCreateView; _can_read_operational_schedule |
| Break collection/detail | POST / DELETE | Own active provider, active target manager, admin | Nested schedule/break ownership; create overlap validation lacks writer coordination F-018 | PV:397–422; PPerm |
| O providers/P/leaves/ | GET | Authenticated safe discovery; entitled operational readers | Safe projection for operational providers omits reason; active owner/target manager/staff/admin retain it | PV::ProviderLeaveListCreateView; _can_read_operational_schedule |
| Leave collection/detail | POST / DELETE | Own active provider, active target manager, admin | URL provider/leave ownership; input validity | PV:457–481; PPerm |
| O providers/P/documents/ | GET / POST | Own active provider or own eligible onboarding applicant; active target manager/admin | Scoped provider_profile ownership; omitted owner accepted, conflicting owner rejected; review fields read-only; no operational membership grant | PV::ProviderDocumentUploadView; IsProviderOnboardingParticipant; F-002/F-003 CLOSED |
| O providers/P/documents/{document}/review/ | POST | Active target MANAGER or admin | Document constrained to URL provider_profile/tenant; correct review audit relationship; applicant/staff cannot review | PV::ManagerProviderDocumentReviewView; providers/services.py::review_provider_document |
| O providers/P/submit-application/ | POST | Own eligible onboarding applicant or existing authorized owner/manager/admin | Own INCOMPLETE/PENDING_REVIEW/REJECTED exception supports inactive membership; foreign applicants denied; submission does not activate membership | PV::ProviderApplicationSubmitView; IsProviderOnboardingParticipant |
| O providers/P/review-application/ | POST | Active target MANAGER or admin | Loader allows pending membership; service application-state validation; approval activates membership | PV:501–527; providers/services.py::approve_application, reject_application |

### Memberships, verification, notifications, reviews and support

| Action / endpoint or view | Method | Allowed role / membership | Scope / ownership / exceptions | Evidence |
|---|---|---|---|---|
| O members collection/detail | GET / POST / PATCH | Active target MANAGER or admin | Tenant membership IDs; last-active-manager guard in service; manager promotion is an unresolved policy detail | OV::OrganizationMemberListAddView, OrganizationMemberDetailUpdateView; organizations/services.py |
| O invitations and staff invitations | GET / POST; cancel POST | Active target MANAGER or admin | Tenant invitation lookups and service checks | OV::OrganizationInvitationListCreateView, OrganizationInvitationCancelView, staff equivalents |
| `/api/v1/invitations/provider/{token}/` and staff equivalent; accept | GET / POST | AllowAny token flow | Token-specific validation, not blanket guest access to membership management | config/urls.py; OV::PublicInvitationDetailsView, PublicAcceptInvitationView, staff equivalents |
| O staff list/activate/deactivate | GET / POST | Active target MANAGER or admin | URL tenant and staff membership; not platform user-admin authority | OV::OrganizationStaffListView, OrganizationStaffActivateView, OrganizationStaffDeactivateView |
| O documents/ — OrganizationDocumentListUploadView | GET | Any active target organization member or admin | Existing IsOrganizationMember gate retained, despite manager-oriented comment; nonmembers excluded; public discovery no longer embeds documents | OV::OrganizationDocumentListUploadView; OPerm |
| O documents/; document detail | POST / DELETE | Active target MANAGER or admin | POST adds explicit manager check; document lookup tenant-scoped; service verification-state restrictions apply | OV:321–362; organizations/services.py::upload_document, delete_document |
| O verification/submit/ | POST | Active target MANAGER or admin | URL organization and submission-state requirements | OV::ManagerVerificationSubmitView; OPerm |
| Organization admin verification queue/start/approve/reject/suspend/unsuspend | GET / POST as routed | Django is_staff or is_superuser | IsSystemAdmin; targeted org/state validation. Tenant MANAGER alone cannot approve platform verification | OV::AdminOrganizationVerificationQueueView and AdminOrganization* views |
| O notifications collection/read-all/single read | GET / POST | Any authenticated recipient | Target active org plus recipient filter; single ID also recipient-owned. No org-wide reading merely from manager/admin | NV:17–64; notifications/permissions.py |
| `/api/v1/customer/notifications/` and read routes | GET / POST | Any authenticated recipient | Own recipient records across orgs; own single notification; repeat-safe read marking | NV::CustomerNotificationListView, CustomerNotificationReadView, CustomerNotificationMarkAllReadView |
| O reviews/appointments/{appointment}/ — AppointmentReviewView | POST | Authenticated appointment owner (including dual-role user) | Tenant appointment; COMPLETED enforced by service, rating/duplicate guards; no admin substitute owner | FV:17–45; feedback/services.py::create_review |
| AppointmentReviewView | GET | Owner, active target MANAGER/STAFF, assigned active PROVIDER, or admin | Tenant appointment and existing review lookup; explicit CanReviewAppointment object check. Read authority does not grant another customer's review creation | FV::AppointmentReviewView; backend/apps/feedback/permissions.py::CanReviewAppointment |
| O reviews/ — OrganizationReviewListView | GET | AllowAny | Active tenant; public serializer for guest/customer; own active provider gets assigned reviews/internal serializer; staff/manager/admin internal view | FV:48–89 |
| `/api/v1/customer/reviews/` | GET | Authenticated | customer=request.user, across organizations | FV::CustomerMyReviewsView |
| `/api/v1/contact/` | POST | AllowAny | Input validated; saves inquiry and attempts both emails; 201 not delivery evidence | CV::ContactMessageCreateView; F-021 |
| `/api/v1/admin/contact/` list/detail/status/reply | GET / PATCH / POST per view | Authenticated Django is_staff or is_superuser | IsSystemAdmin; organization STAFF/MANAGER not sufficient; F-021 outcome semantics | CV::AdminContactListView, AdminContactDetailView, AdminContactReplyView |

### Analytics routing qualification — F-022

Routing mounts the same analytics URL set at global `/api/v1/analytics/` and O analytics/. This table separates declared authority from working dispatch; it does not certify any live request.

| View / method | Permission target | Signature / scope | Current route exception |
|---|---|---|---|
| ProviderMetricsView GET | Admin, own active provider, or active manager of provider's organization | get(request, provider_id); active URL provider | Nested mount supplies unexpected organization_id. Global shape has matching signature. |
| OrganizationDashboardView GET | Admin or active manager for organization kwarg | get(request, organization_id); active org | Global route already includes organization UUID; nesting repeats organization kwarg/path concerns. Verify each mount rather than assume equivalent dispatch. |
| AnalyticsExportView GET | Admin or active manager for query organization_id | get(request); export scoped to query target | Nested mount supplies unexpected organization_id; query target drives permission/filter. |
| AnalyticsSummaryView GET | Admin or active manager for organization kwarg | get(request, organization_id); active org | Global summary lacks organization_id; nested summary supplies it. |

Evidence: AnV:21–101; AnPerm; `backend/apps/analytics/urls.py:9–14`; `backend/config/urls.py:47–51`. `frontend/src/services/managerService.js:80–83` has an invalid nested dashboard helper but no active caller was found. Do not claim the active dashboard is broken from this unused helper alone. Focused future resolution/authorized dispatch tests are required.

## Public versus operational data

**Established privacy intent (H/S):** Public organization/profile/service names, professional titles, safe availability windows, backend effective/starting charges, approval-derived trust and public review metrics are discovery data. Booking contacts, other customers' records, verification files/original filenames, administrative reviewers/rejection details, leave reasons and internal break titles are not automatically public just because a shared serializer contains them.

**M1 resolutions and remaining exceptions:**

- **F-001 CLOSED:** Explicit public organization/provider projections omit document/reviewer/rejection administration and provider account email. The separate public profile no longer falls back to email. Entitled private reads remain available. Original exposure/root cause is retained in [the finding](KNOWN_ISSUES.md#f-001); direct media authorization remains F-024.
- **F-019 CLOSED:** Customers/foreign readers receive safe windows/intervals; only entitled operational readers receive break titles/leave reasons. GET remains authenticated and nested resources stay scoped. Original exposure is retained in [the finding](KNOWN_ISSUES.md#f-019).
- **F-020 CLOSED:** Public service list/detail both enforce active service plus active APPROVED org; own active manager/platform unpublished reads remain separate. Original mismatch is retained in [the finding](KNOWN_ISSUES.md#f-020).
- **F-007:** A tenant-authorized queue read/call invokes global historical mutation. A scoped URL does not make this side effect tenant-scoped. State-machine cleanup section owns detail.

The operating-hours endpoint checks active org rather than the public list's full approval gate. This is additional source detail, not a silently accepted new finding or a reason to expand this phase into fixes.

## Provider onboarding qualifications

1. `RegisterProviderView` creates a global user, then optionally an inactive PROVIDER membership and INCOMPLETE profile under an active organization. Without organization_id it creates a global account without tenant entitlement. Source `accounts/views.py:126–172` — S.
2. **F-004 CLOSED:** Active organization prerequisites are checked before persistent creation. Atomic writes roll back on profile-creation exceptions; invalid/bound/unbound outcomes have endpoint assertions. Server controls PROVIDER role; additive provider_profile_id preserves response compatibility.
3. **F-003 CLOSED:** Onboarding-specific permission admits the scoped owner of INCOMPLETE/PENDING_REVIEW/REJECTED applications, including inactive membership. It does not weaken global active-provider operational gates or permit applicant approval/membership activation.
4. **F-002 CLOSED:** Model/query/create/review/audit consistently use provider_profile. Owner is server-derived from the authorized URL; conflicting client owner is rejected. Endpoint tests cover omitted owner, stored relationship and foreign denial.
5. Manager/platform approval/rejection authority is unchanged. Historical JWT HTTP tests cover own onboarding through authorized approval, with pending/rejected operational and foreign access denied. This is not browser onboarding certification.

Sources: `ProviderDocument`, `ProviderDocumentSerializer`, provider document/application views, `ProviderService_.review_provider_document`, `IsProviderOnboardingParticipant`. Original defects remain in Known Issues history; M1 execution/closure evidence is linked above.

## Frontend and backend authorization

`frontend/src/routes/RoleRoute.jsx`, `AppRoutes.jsx`, `AuthContext.jsx` and `TenantContext.jsx` supply UX routing/effective role. Platform administration takes precedence; an active selected membership can set operational role, otherwise CUSTOMER fallback. This does not add a global Customer model role or authorize backend resources.

API requests must independently satisfy method, target org/provider, ownership and serializer contract. Frontend-selected tenant is convenience state, not authority. Permission checks do not alone certify safe public projections or unscoped service side effects.

- **F-015:** CustomerLiveQueuePage requests full provider queue then swallows denial. Own queue/dashboard telemetry is the proper privacy boundary. Do not widen CanManageProviderQueue for ordinary customers.
- **F-012 / C-12:** ProviderQueuePage walk-in form omits required provider_id, queueService posts unchanged, serializer rejects before view uses URL ID. Authorized UI action can still fail its contract. Price must remain server resolved.
- **PF-002 — candidate only:** Legacy Routes aliases use literal placeholders. This is not a new F ID or proof canonical routes fail; see business-rule candidate section.
- **D12:** Backend authenticated self-booking includes operational users; React role access can differ. Do not silently choose a new dual-role policy.

## Contradictions and security exceptions

| ID | Competing claims and evidence | Classification / related IDs | Required documentation/future action |
|---|---|---|---|
| C-11 | Historical H §§4,26 privacy intent versus pre-M1 public document/schedule exposure | Baseline S/H exposure; F-001/F-019 CLOSED after M1; BR-004,006,016,018,056 | Projection contradiction corrected with focused endpoint evidence; private-file serving remains F-024. No production download/exploitation certification. |
| C-12 | Frontend provider walk-in request lacks provider_id vs required serializer body field despite URL provider | S contract defect; BR-034; F-012 | Exact frontend-shaped future API test; no business redesign. |
| C-16 | Successful inquiry/reply/reset language vs saved inquiry, discarded results and pre-send REPLIED | S/D outcome gap; BR-057–061; F-021/D13 | Keep saved/attempted/accepted/delivered separate; generic reset response preserved. |

These do not block honest Phase 2 documentation; owner policy may block an approved guarantee/fix. Remaining C IDs are indexed in business rules and detailed in state machine. Historical finding namespaces/severities (C-17) remain separate.

The following table preserves the original pre-M1 audit plan. For F-001/F-002/F-003/F-004/F-019/F-020 its defect statements are historical; current corrections and accepted execution evidence are linked above. Other entries remain unresolved.

| Finding | Baseline source-confirmed fact vs inferred/unverified impact | Original minimum verification |
|---|---|---|
| F-001 P1 | Projection includes private metadata; file retrieval/exploitation untested | Anonymous/public serializer/API absence assertions |
| F-002 P2 | Incorrect model field/attribute and input derivation | Actual document list/upload/review tests |
| F-003 P2 | Pending owner blocked by active-membership permission | Pending self allowed only under approved narrow policy; foreign/operations denied |
| F-004 P2 | Response return does not roll back earlier user creation | Invalid-org persistence assertion |
| F-015 P2 | Private queue requested by customer; denied request swallowed | Customer request inventory and safe telemetry contract |
| F-019 P2 | Authenticated nonmember gets reasons/titles by source | Customer/foreign reader projection vs operator projection tests |
| F-020 P2 | Service detail approval differs from list | Unapproved tenant detail/list tests; manager access preserved |
| F-022 P2 | Mount/signature mismatch; unused bad helper | Resolve/dispatch each supported mount with own/foreign target permissions |

F-007 side-effect scope belongs to state machine; F-021 email results remain documented, not fixed. No baseline severity is escalated. These checks were not executed in original Phase 2; M1's separately executed subset is recorded in Known Issues, with remaining verification limits.

## Authorization acceptance checklist

- [x] Global owner, membership roles and Django flags kept distinct.
- [x] Active/inactive provider onboarding gates documented without inventing entitlement.
- [x] Required identity/public/booking/queue/schedule/catalog/doc/member/notification/review/analytics/contact actions mapped to methods/views.
- [x] URL scope, queryset scope, object ownership and serializer projection considered separately.
- [x] Assigned-provider cancellation is not incorrectly generalized to rescheduling.
- [x] Organization document GET actual member gate is not replaced by its manager-oriented comment.
- [x] Recipient/owner endpoints do not grant org-wide data to managers/admins by implication.
- [x] Public projection, schedule reasons, publication, global cleanup and route contract exceptions preserved.
- [x] Frontend guards not treated as backend authority; F-015 not resolved through widened access.
- [x] No runtime, exploitation, email-delivery or universal tenant-safety certification.

Checkmarks mean documentation coverage only. Source-based matrices require focused verification before application changes; Phase 3 does not begin automatically.
