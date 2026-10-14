# M2 backend regression reconciliation



## Scope and baseline



Owner-authorized regression reconciliation only. Existing uncommitted M2 production/frontend/migration work is preserved.

No development migration, seeding, duplicate reconciliation or development-record mutation is authorized or performed.



Current baseline: ..\.venv\Scripts\python.exe -m pytest -q --tb=short from backend:

**671 passed, 61 failed, 10 skipped**, 1239.99 seconds.

This supersedes the previous pre-correction 639/64/10 result for this pass.

Default test configuration selects SQLite and --nomigrations; it is not PostgreSQL/migration evidence.



Primary classifications: **A = 17**, **B = 3**, **C = 41**.

A: approved-policy/contract expectations supersede the original assertion.

B: a real permission regression exposed after correcting the earlier onboarding assertion.

C: fixtures/setup prevent the original meaningful behavior from being exercised.

Several C cases use dates invalidated by the approved horizon; this is a fixture correction, not a removal of booking coverage.

No failed case is removed, skipped or xfailed to reconcile results. Two test function names are clarified while retaining their parameter cases.



## Every baseline failure



Paths below are relative to backend. Each row maps one actually failed collected case to its primary cause and correction.



| Failed node ID | Category | Root cause | Correction |

|---|---|---|---|

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_normal_working_day_slots` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_schedule_boundary_no_overflow` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_non_working_day_empty` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_no_schedule_empty` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_custom_duration_used` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_break_exclusion` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_leave_exclusion` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_existing_appointment_blocks` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_cancelled_does_not_block` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestAvailability::test_completed_does_not_block` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_successful_booking` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_outside_schedule_rejected` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_break_conflict_rejected` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_leave_conflict_rejected` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_exact_boundary_booking_accepted` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_serial_booking_allocates_sequential_serials` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestBooking::test_customer_id_not_accepted_from_payload` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |

| `apps/appointments/tests/test_appointments.py::TestCancelRescheduleCheckIn::test_valid_cancellation` | C | Lifecycle fixture | Use an approved working day and controlled pre-deadline clock; create the linked QueueEntry required for authoritative ETA. Preserve permission, transition and serial assertions. |

| `apps/appointments/tests/test_appointments.py::TestCancelRescheduleCheckIn::test_cancelled_frees_availability` | C | Lifecycle fixture | Use an approved working day and controlled pre-deadline clock; create the linked QueueEntry required for authoritative ETA. Preserve permission, transition and serial assertions. |

| `apps/appointments/tests/test_appointments.py::TestCancelRescheduleCheckIn::test_successful_reschedule` | C | Lifecycle fixture | Use an approved working day and controlled pre-deadline clock; create the linked QueueEntry required for authoritative ETA. Preserve permission, transition and serial assertions. |

| `apps/appointments/tests/test_appointments.py::TestCancelRescheduleCheckIn::test_reschedule_updates_appointment` | C | Lifecycle fixture | Use an approved working day and controlled pre-deadline clock; create the linked QueueEntry required for authoritative ETA. Preserve permission, transition and serial assertions. |

| `apps/providers/tests/test_providers.py::TestWeeklySchedule::test_manager_can_set_schedule` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestWeeklySchedule::test_schedule_upserts_existing_day` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestWeeklySchedule::test_list_schedules` | A | Schedule contract | Assert all seven weekdays, the configured working day and six closed placeholders. |

| `apps/providers/tests/test_providers.py::TestScheduleBreak::test_manager_can_add_break` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestScheduleBreak::test_delete_break` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestScheduleBreakRules::test_break_outside_working_hours_rejected` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestScheduleBreakRules::test_break_on_non_working_day_rejected` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestScheduleBreakRules::test_overlapping_breaks_rejected` | A | Schedule contract | Scope direct schedule/break mutation tests to an INCOMPLETE initial application. Retain validation/upsert/delete assertions; approved live changes remain reviewed. |

| `apps/providers/tests/test_providers.py::TestProviderSelfManagementAndDiscovery::test_provider_can_set_own_schedule` | A | Schedule contract | Retain initial-hours preparation coverage and additionally assert approved-hours writes are rejected without granting operational authority. |

| `tests/test_m1_security_onboarding.py::test_customer_safe_schedule_annotations[customer]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_customer_safe_schedule_annotations[foreign]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_operational_schedule_annotations_preserved[provider]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_operational_schedule_annotations_preserved[manager]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_operational_schedule_annotations_preserved[staff]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_operational_schedule_annotations_preserved[admin]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_operational_schedule_annotations_preserved[superuser]` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_m1_security_onboarding.py::test_customer_availability_still_uses_schedule` | C | Booking-window fixture | Query the configured current weekday within the four-date window; retain private-note exclusion. |

| `tests/test_m1_security_onboarding.py::test_pending_owner_onboarding_without_operational_authority[INCOMPLETE]` | B | Onboarding permission leaked into operational leave mutations | Allow initial-hours preparation, but restore the active operational permission for leave POST/DELETE. Valid payload regressions assert 403, no created leave, and unchanged existing leave across all three inactive application states.

| `tests/test_m1_security_onboarding.py::test_pending_owner_onboarding_without_operational_authority[PENDING_REVIEW]` | B | Onboarding permission leaked into operational leave mutations | Allow initial-hours preparation, but restore the active operational permission for leave POST/DELETE. Valid payload regressions assert 403, no created leave, and unchanged existing leave across all three inactive application states.

| `tests/test_m1_security_onboarding.py::test_pending_owner_onboarding_without_operational_authority[REJECTED]` | B | Onboarding permission leaked into operational leave mutations | Allow initial-hours preparation, but restore the active operational permission for leave POST/DELETE. Valid payload regressions assert 403, no created leave, and unchanged existing leave across all three inactive application states.

| `tests/test_m1_security_onboarding.py::test_registration_upload_submit_review_http_flow` | A | Onboarding versus operations | Allow valid initial-hours preparation while pending/inactive; keep queue, leave, review and cross-tenant denials. HTTP onboarding flow supplies hours before manager review and rejects later direct edits. |

| `tests/test_m1_security_onboarding.py::test_manager_platform_can_review_pending_owner[manager]` | C | Initial approval fixture | Provide valid initial working hours before own-organization manager approval; assert application and membership activation. |

| `tests/test_m1_security_onboarding.py::test_manager_platform_can_review_pending_owner[admin]` | A | Initial approval authority | Assert platform admin/superuser without own-organization MANAGER membership cannot approve initial hours; retain private read access and unchanged inactive/pending state. |

| `tests/test_m1_security_onboarding.py::test_manager_platform_can_review_pending_owner[superuser]` | A | Initial approval authority | Assert platform admin/superuser without own-organization MANAGER membership cannot approve initial hours; retain private read access and unchanged inactive/pending state. |

| `tests/test_m1_security_onboarding.py::test_inactive_membership_does_not_grant_private_schedule_annotations` | C | Seven-day indexing | Select the configured weekday instead of index 0; preserve public/private annotation and inactive-membership assertions. |

| `tests/test_phase5_hardening.py::TestPhase5BusinessModelHardening::test_cancelled_appointment_cannot_enter_queue` | C | Deadline clock/actor fixture | Use controlled eligible customer cancellation time for forecast/capacity tests, or the existing authorized own-organization manager for queue/cancellation-sync tests. Preserve downstream assertions. |

| `tests/test_phase5_hardening.py::TestPhase5BusinessModelHardening::test_reschedule_allocates_new_serial_on_new_date` | C | Deadline clock fixture | Use 06:00 before the real 08:00 authoritative ETA minus 90 minutes. Preserve date, destination serial and linked-entry synchronization. |

| `tests/test_phase6_targeted_fix.py::TestPhase6MultiOrgCustomerData::test_customer_receives_bookings_from_multiple_organizations` | C | Booking-window fixture | Use tomorrow in Dhaka instead of hardcoded 2030 dates. Preserve multi-organization ownership, nested queue and serial assertions. |

| `tests/test_phase6_targeted_fix.py::TestPhase6MultiOrgCustomerData::test_customer_receives_only_own_bookings_cross_customer_isolation` | C | Booking-window fixture | Use tomorrow in Dhaka instead of hardcoded 2030 dates. Preserve multi-organization ownership, nested queue and serial assertions. |

| `tests/test_phase6_targeted_fix.py::TestPhase6MultiOrgCustomerData::test_correct_organization_provider_service_category_attached` | C | Booking-window fixture | Use tomorrow in Dhaka instead of hardcoded 2030 dates. Preserve multi-organization ownership, nested queue and serial assertions. |

| `tests/test_phase_a2_runtime_stability.py::TestPhaseA2RuntimeStability::test_appointment_detail_access_and_permissions` | A | Cancellation capability | Assert can_cancel=False when this legacy fixture has no approved scheduled start. Preserve owner/foreign-customer detail permissions and check-in capability. |

| `tests/test_phase_a7_authoritative_forecast.py::test_scenario_g_h_i_j_forecast_updates` | C | Deadline clock/actor fixture | Use controlled eligible customer cancellation time for forecast/capacity tests, or the existing authorized own-organization manager for queue/cancellation-sync tests. Preserve downstream assertions. |

| `tests/test_phase_a8_organization_booking.py::test_terminal_cancelled_booking_frees_capacity` | C | Deadline clock/actor fixture | Use controlled eligible customer cancellation time for forecast/capacity tests, or the existing authorized own-organization manager for queue/cancellation-sync tests. Preserve downstream assertions. |

| `tests/test_phase_a953_booking_snapshots.py::test_historical_price_immutable_new_booking_uses_new_price` | A | Duplicate active booking | Use another customer on the same date for price history, or the same customer on another allowed date for missing-profile fallback. Keep snapshot and serial assertions. |

| `tests/test_phase_a953_booking_snapshots.py::test_omitted_contact_fallback_and_missing_profile_data` | A | Duplicate active booking | Use another customer on the same date for price history, or the same customer on another allowed date for missing-profile fallback. Keep snapshot and serial assertions. |

| `tests/test_phase_a953_booking_snapshots.py::test_walk_in_preserves_entered_name_and_snapshots_charge[01712345678]` | A | Phone identity | Explicitly confirm the existing customer_id for the known phone; retain contact/charge snapshots and unchanged user assertions. |

| `tests/test_phase_a9_booking_storefront.py::test_past_date_availability_and_booking_rejection` | A | Past-date contract | Assert OUTSIDE_BOOKING_WINDOW from both API and service availability; retain rejected past-date booking and no persisted appointment. |

| `tests/test_queue.py::TestQueueAPI::test_phase5_serial_allocation_and_auto_queue_creation` | C | Booking-window fixture | Use tomorrow in Dhaka instead of hardcoded 2030 dates. Preserve multi-organization ownership, nested queue and serial assertions. |

| `tests/test_queue.py::TestQueueAPI::test_phase5_cancellation_sync` | C | Deadline clock/actor fixture | Use controlled eligible customer cancellation time for forecast/capacity tests, or the existing authorized own-organization manager for queue/cancellation-sync tests. Preserve downstream assertions. |

| `apps/appointments/tests/test_appointments.py::TestConcurrencySafeBooking::test_consecutive_serial_bookings_succeed` | C | Booking-window fixture | Replace the two-weeks-ahead Monday fixture with a valid Dhaka date, matching weekday and controlled morning clock. Keep legacy slot, break, leave, duration and serial compatibility assertions. |



## Coverage and implementation boundary



- Legacy slot response/break/leave/duration assertions remain compatibility coverage; they do not introduce fixed-slot booking UI or rigid serial semantics.

- Initial schedule edits do not activate pending providers. Approved direct edits are rejected; manager review authority remains tenant-scoped.

- Public schedule tests still exclude private break titles/leave reasons; authorized operational reads retain them.

- Historical snapshot tests retain immutable prices/contact details and authoritative new prices; identities/dates now respect duplicate guards.

- Existing M2 cutoff, ETA unavailable/recovered, identity confirmation, race and duplicate tests remain unchanged.

- The already-corrected null appointment-date/Dhaka historical fallback passes the current baseline; no historical records are modified here.

- Production correction: ProviderLeaveListCreateView POST and ProviderLeaveDetailView DELETE now use IsOrganizationManagerOrOwnProvider, restoring the existing active operational boundary instead of IsProviderOnboardingParticipant. Initial schedules/breaks keep their intentional onboarding exception.

- Valid leave POST requests reproduced the defect for INCOMPLETE/PENDING_REVIEW/REJECTED inactive owners: 201 instead of 403 in all three cases. The regression assertions also protect existing leaves from DELETE. The earlier empty request only exposed a 400 and could mask the authorization defect.

- New assertion implementation correction during reconciliation: ApplicationError exposes default_code, not a code attribute. No exception API changed.



## Final verification



Final full backend command: ..\.venv\Scripts\python.exe -m pytest -q -ra --tb=short
from backend: **732 passed, 0 failed, 10 skipped** (1276.58s).
All 742 collected cases remain represented (baseline: 671 + 61 + 10).
No deselection, new skip or xfail was used to reconcile failures.

The ten skips are engine/workflow gates: one original booking SELECT FOR UPDATE assertion and nine M2 PostgreSQL/concurrency/migration cases.
All nine M2 skips passed in the 83-case PostgreSQL module.
The remaining legacy assertion was separately executed with:
..\.venv\Scripts\python.exe -m pytest apps/appointments/tests/test_appointments.py::TestConcurrencySafeBooking::test_booking_uses_select_for_update --ds=config.settings.test_postgresql --migrations -q --tb=short
Result: **1 passed, 0 failed, 0 skipped** (10.68s). Only the isolated test database was migrated.




Completed checks:

- Previously failing 61-case selection after initial fixture reconciliation: 57 passed / 4 failed (196.35s). Three remaining cases exposed the real leave permission regression; the fourth was corrected to assert the exception's existing default_code.

- Valid-payload leave defect reproduction, before production correction: 3 failed / 80 deselected. Each inactive application state incorrectly received 201.

- After correction, pending-owner and past-date selection: 7 passed / 204 deselected (6.01s).

- ..\.venv\Scripts\python.exe -m pytest tests/test_m2_lifecycle.py --ds=config.settings.test_postgresql --migrations -q --tb=short: **83 passed, 0 failed, 0 skipped** (22.54s). Includes expanded valid leave-create/delete regressions within the existing three pending-owner cases, concurrency tests and migration coverage. Isolated test_queueturn_m2 only.

- node --test src/utils/*.test.js: **23 passed, 0 failed, 0 skipped**.

- npm run build: **passed**, 212 modules; existing 987.90 kB minified-chunk warning remains.
- git diff --check: **passed**, exit 0; existing CRLF conversion warnings are informational.

- ..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run: **No changes detected**.

- Read-only showmigrations appointments providers queue confirms development appointments/0005_providerdateserial, providers/0007_schedulechangerequest and queue/0006_remove_queueentry_is_urgent_and_more remain unapplied. No development migration executed.



## Files changed by this reconciliation



Production:

- backend/apps/providers/views.py — only two operational leave permission references restored; prior M2 schedule/request/read changes preserved.



Tests:

- backend/apps/appointments/tests/test_appointments.py

- backend/apps/providers/tests/test_providers.py

- backend/tests/test_m1_security_onboarding.py

- backend/tests/test_m2_lifecycle.py (existing untracked M2 module; three cases strengthened, not replaced)

- backend/tests/test_phase5_hardening.py

- backend/tests/test_phase6_targeted_fix.py

- backend/tests/test_phase_a2_runtime_stability.py

- backend/tests/test_phase_a7_authoritative_forecast.py

- backend/tests/test_phase_a8_organization_booking.py

- backend/tests/test_phase_a953_booking_snapshots.py

- backend/tests/test_phase_a9_booking_storefront.py

- backend/tests/test_queue.py



Evidence:

- docs/M2_REGRESSION_RECONCILIATION.md (this new ledger)



All other pre-existing uncommitted M2 changes are preserved. No frontend source, settings, migrations, business policies, serial allocator or development records changed in this pass.




## Final repository and remaining boundaries

Branch: main. HEAD unchanged: 0d97e89975f6f465d336989219a1f54fb756bfe5.
Initial Git state: 45 modified tracked files / 16 untracked.
Final Git state: 52 modified tracked files / 17 untracked; no staged files.
Existing M2 work was preserved. No stage, commit, push, reset or history rewrite.

Regression verification has no remaining failed tests or infrastructure blocker.
Development activation still requires separately approved application of the three pending M2 migrations.
The historical duplicate booking group remains untouched, awaiting the owner's reconciliation decision.
The existing frontend bundle-size warning remains; no unrelated optimization was attempted.
No Project Brain finding closure/status was changed by this reconciliation.

Final Git status:
```
 M AGENTS.md
 M backend/apps/accounts/serializers.py
 M backend/apps/accounts/views.py
 M backend/apps/appointments/models.py
 M backend/apps/appointments/serializers.py
 M backend/apps/appointments/services.py
 M backend/apps/appointments/tests/test_appointments.py
 M backend/apps/appointments/views.py
 M backend/apps/organizations/serializers.py
 M backend/apps/organizations/services.py
 M backend/apps/organizations/views.py
 M backend/apps/providers/models.py
 M backend/apps/providers/services.py
 M backend/apps/providers/tests/test_phase_c_onboarding.py
 M backend/apps/providers/tests/test_providers.py
 M backend/apps/providers/urls.py
 M backend/apps/providers/views.py
 M backend/apps/queue/models.py
 M backend/apps/queue/serializers.py
 M backend/apps/queue/services.py
 M backend/apps/queue/urls.py
 M backend/apps/queue/views.py
 M backend/tests/test_m1_security_onboarding.py
 M backend/tests/test_phase5_hardening.py
 M backend/tests/test_phase6_targeted_fix.py
 M backend/tests/test_phase_a2_runtime_stability.py
 M backend/tests/test_phase_a72_multi_patient_audit.py
 M backend/tests/test_phase_a7_authoritative_forecast.py
 M backend/tests/test_phase_a8_organization_booking.py
 M backend/tests/test_phase_a953_booking_snapshots.py
 M backend/tests/test_phase_a9_booking_storefront.py
 M backend/tests/test_queue.py
 M docs/BUSINESS_RULES.md
 M docs/KNOWN_ISSUES.md
 M docs/PRODUCT_ARCHITECTURE.md
 M docs/QUEUE_STATE_MACHINE.md
 M docs/ROLE_PERMISSION_MATRIX.md
 M docs/UI_DESIGN_SYSTEM.md
 M frontend/src/components/InstantAvailabilityFinder.jsx
 M frontend/src/pages/AcceptInvitationPage.jsx
 M frontend/src/pages/customer/BookAppointmentPage.jsx
 M frontend/src/pages/customer/CustomerAppointmentDetailPage.jsx
 M frontend/src/pages/customer/OrganizationProfilePage.jsx
 M frontend/src/pages/customer/ProviderPublicProfilePage.jsx
 M frontend/src/pages/manager/ManagerProvidersPage.jsx
 M frontend/src/pages/manager/ManagerQueuePage.jsx
 M frontend/src/pages/provider/ProviderQueuePage.jsx
 M frontend/src/pages/provider/ProviderRegisterPage.jsx
 M frontend/src/pages/provider/ProviderSchedulePage.jsx
 M frontend/src/pages/staff/StaffQueuePage.jsx
 M frontend/src/services/queueService.js
 M frontend/src/utils/queueDisplay.js
?? backend/apps/appointments/booking_policy.py
?? backend/apps/appointments/migrations/0005_providerdateserial.py
?? backend/apps/appointments/serials.py
?? backend/apps/providers/migrations/0007_schedulechangerequest.py
?? backend/apps/providers/schedule_changes.py
?? backend/apps/providers/schedule_views.py
?? backend/apps/queue/migrations/0006_remove_queueentry_is_urgent_and_more.py
?? backend/config/settings/test_postgresql.py
?? backend/tests/test_m2_lifecycle.py
?? docs/M2_REGRESSION_RECONCILIATION.md
?? frontend/src/components/ScheduleEditor.jsx
?? frontend/src/components/ScheduleRequestsPanel.jsx
?? frontend/src/components/StaffBookingForm.jsx
?? frontend/src/hooks/useBookingWindow.js
?? frontend/src/utils/bookingWindow.js
?? frontend/src/utils/m2Policy.test.js
?? frontend/src/utils/scheduleDraft.js
```


## Batch B regression amendment — 2026-10-12

This records separately authorized Batch B work; it does not restart M2, overwrite its historical evidence or claim another full backend suite run. M2 horizon/cutoffs, provider-wide active exclusion, original dates/serial ledger, snapshots, schedule approval and private attachments remain protected.

### Exact final isolated integration launcher

From `D:\SmartQueue\backend` in PowerShell (temporary fast hashing applies only to synthetic test fixtures):

```powershell
@'
import os, pytest
os.environ['DJANGO_SETTINGS_MODULE']='config.settings.development'
import django; django.setup()
from django.conf import settings
from django.test import override_settings
assert settings.DATABASES['default']['ENGINE']=='django.db.backends.sqlite3'
modules = [
    'tests/test_batch_b.py', 'tests/test_m2_lifecycle.py',
    'apps/appointments/tests/test_appointments.py', 'apps/providers/tests/test_providers.py',
    'tests/test_phase_a7_authoritative_forecast.py', 'tests/test_phase_a8_organization_booking.py',
    'tests/test_queue.py', 'apps/services/tests/test_services.py',
    'tests/test_m1_security_onboarding.py', 'tests/test_phase5_hardening.py',
]
with override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']):
    raise SystemExit(pytest.main(modules + ['-q','--tb=short','--show-capture=no']))
'@ | & ..\.venv\Scripts\python.exe -
```

Result: **415 passed, 0 failed, 14 skipped**. Skips require PostgreSQL concurrency/migration behavior; SQLite is not lock/migration proof. The launcher initially failed before test startup because Django settings had not been initialized; corrected bootstrap produced the result above. No persistent settings were changed.

The normal-hasher earlier expanded integration returned **405 passed, 4 failed, 14 skipped**. Those four failures were already-superseded F-024/M1 assertions: scoped foreign document route is 404, and own document reads remain allowed for an inactive provider while uploads/profile writes/operations remain denied. Corrections retained the security assertions and passed on PostgreSQL and final integration. An earlier smaller checkpoint returned seven obsolete fixture/clock/readiness failures; explicit approved synthetic leave fixtures, four-day planned notice and deterministic in-horizon dates/clock assertions corrected them. No production permission was relaxed.

### PostgreSQL verification

```powershell
& ..\.venv\Scripts\python.exe -m pytest tests/test_batch_b.py tests/test_m2_lifecycle.py tests/test_m1_security_onboarding.py::test_pending_owner_onboarding_without_operational_authority tests/test_m1_security_onboarding.py::test_inactive_approved_owner_does_not_gain_onboarding_access --ds=config.settings.test_postgresql --migrations -q --tb=short --show-capture=no
```

**157 passed** at the final core checkpoint, including all 83 M2 cases. After the final schedule null-date protection and three additional cases:

```powershell
& ..\.venv\Scripts\python.exe -m pytest tests/test_batch_b.py tests/test_m2_lifecycle.py -k 'batch_b or schedule or approval or notice' --ds=config.settings.test_postgresql --migrations -q --tb=short --show-capture=no
```

**119 passed, 37 deselected, 0 failed**. Includes all 73 final Batch B cases and 46 affected M2 cases. Four Batch B cases specifically exercise three real row-lock races and a legacy-field migration; migration keeps existing effective leave NULL/unknown, provider averages NULL and organization buffer default 15 without rewriting original records. Private schedule attachments remain covered by M2. No emergency workflow exists to test; owner policy required.

Using the same fast isolated launcher with modules `tests/test_phase_a72_multi_patient_audit.py` and `tests/test_phase_a2_runtime_stability.py`: initial **11 passed, 1 failed** (obsolete count-first BE_READY expectation); final **12 passed** after valid hours and a controlled NOT_YET→BE_READY→actual CALLED/IN_PROGRESS sequence. No production source changed for that assertion.

### Frontend and migration verification

- From frontend: `node --test --test-reporter=spec src/utils/*.test.js`: **42 passed**. Includes stale/slow polling, scope/unmount/mutation guards, explicit arrival acknowledgement, no stored live-timing fallback, physical active count and actual-state presentation; preserved M2/privacy/date/price helpers also pass.
- Installed `node node_modules/oxlint/bin/oxlint <19 touched JS/JSX files>`: **0 errors, 48 warnings** (18 unused variables, 16 effect-state, 14 effect-dependency advisories). New helpers/component clean; no rule suppression. An initial relative-path invocation accidentally selected broader existing frontend warnings; the final result is the corrected touched-file selection.
- Final `npm run build`: passed with existing large-chunk advisory. Earlier checkpoint build passed before subsequent genuine polling/display corrections. No redesign or dependency changes.
- `manage.py makemigrations --check --dry-run --settings=config.settings.development`: no changes. `manage.py check --settings=config.settings.development`: no issues (0 silenced). `migrate --plan` and `sqlmigrate organizations 0011` / `sqlmigrate providers 0009`: only expected additive columns/constraints; no destructive data SQL. No development migration applied.

Owner rollout must back up/stop writers, apply organizations 0011 then providers 0009, explicitly configure the 16 mixed/one missing legacy averages and perform browser/live-ETA acceptance. Existing 102 appointments/102 QueueEntries and one historical duplicate group remain unchanged. Emergency leave/recovery notice/approval/staff authority is an unresolved specific policy question; no fabricated workflow, automatic cancellation or unrestricted staff recovery was implemented. No staging, commit or push.

Final `git diff --check` passed. Branch/HEAD remains `main` / `5f160e9`; no staged changes, commit or push.

## Emergency interruption verification — 2026-10-13

This is a separately authorized focused extension, not a restart of M2 or a new full-suite claim. Original M2/Batch B execution evidence above remains historical.

### Backend integration

From `backend`, the existing isolated fast-fixture launcher (`import pytest` before Django bootstrap, assert SQLite, temporary MD5 password hasher override inside test execution only) ran these modules:

```python
modules = [
    'tests/test_provider_emergency.py', 'tests/test_batch_b.py', 'tests/test_m2_lifecycle.py',
    'apps/appointments/tests/test_appointments.py', 'apps/providers/tests/test_providers.py',
    'tests/test_phase_a7_authoritative_forecast.py', 'tests/test_phase_a8_organization_booking.py',
    'tests/test_queue.py', 'apps/services/tests/test_services.py',
    'tests/test_m1_security_onboarding.py', 'tests/test_phase5_hardening.py',
    'tests/test_phase_a72_multi_patient_audit.py', 'tests/test_phase_a2_runtime_stability.py',
    'apps/contact/tests/test_email_service.py',
]
pytest.main(modules + ['-q', '--tb=short', '--show-capture=no'])
```

Result: **485 passed, 0 failed, 18 skipped**. Skips require PostgreSQL locking/migration behavior. No persistent hasher or database setting was changed. An initial command used nonexistent app-local `tests.py` paths and collected no tests; corrected directory/module paths produced the result. The email transport unit assertion verifies escaped HTML and stable SDK idempotency options without network access.

PostgreSQL, isolated `test_queueturn_m2` with real migrations:

```powershell
& ..\.venv\Scripts\python.exe -m pytest tests/test_provider_emergency.py tests/test_batch_b.py tests/test_m2_lifecycle.py --ds=config.settings.test_postgresql --migrations -q --tb=short --show-capture=no
```

Final integrated checkpoint: **200 passed, 0 failed, 0 skipped** (44 then-current emergency cases, all 73 Batch B and 83 M2 cases). Earlier run: **183 passed, 1 failed**; M2's historical migration test restored only the older M2 schema before invoking current booking code, leaving the new dependent emergency tables absent. The narrow fixture correction now restores the graph's current leaf migrations before current-service assertions and in cleanup; historical archive/serial assertions are retained. No production missing-table bypass was introduced.

After additional meaningful race assertions and six new cases, only the changed emergency module was rerun:

```powershell
& ..\.venv\Scripts\python.exe -m pytest tests/test_provider_emergency.py --ds=config.settings.test_postgresql --migrations -q --tb=short --show-capture=no
```

**50 passed, 0 failed, 0 skipped**. Six real concurrency cases cover booking/declaration, Call Next/declaration, approval/final closure, reschedule/cancel, duplicate declarations and duplicate rescheduling. Assertions include hold coverage, original serial/status preservation, one replacement, idempotent events and no reconciliation of synthetic historical duplicate records. Other coverage includes roles/tenant nesting, consent/direction, target horizon/capacity/holds, cross-provider current charge/fair serial, actual interruption/completion, no restart/skip of interrupted work, manager-after-end closure, original ordering after approved resume and failed/uncertain/superseded email behavior. A final scope guard rejects an invented past-date incident when only current-date active work exists; managers cannot use backdating to bypass the scheduled-end finalization guard. That new test initially returned **49 passed, 1 failed** because it asserted a cached reverse queue relation; replacing the assertion with a fresh database read verified the persisted CALLED state without changing production behavior.

### Frontend and configuration

- `node --test --test-reporter=spec src/utils/*.test.js`: **47 passed, 0 failed** (five new emergency payload/presentation cases). No browser claim.
- Focused installed Oxlint on 14 changed JS/JSX files: **0 errors, 39 warnings** (13 unused-variable, 14 effect-state and 12 dependency advisories). Includes one asynchronous-load effect advisory in the new panel; existing page advisories remain, no suppressions added. New panel's load callback dependencies are explicit.
- `npm run build`: initial attempt failed on the new panel's wrong client import. Corrected to existing `../api/client`; final build passed, with the existing chunk-size advisory. No dependency installation or UI redesign.
- `manage.py check --settings=config.settings.development`: no issues (0 silenced).
- `manage.py makemigrations --check --dry-run --settings=config.settings.development`: no changes detected.
- `migrate --plan` shows only existing Batch B organizations 0011/providers 0009 plus emergency notifications 0003/providers 0010/0011. Inspected emergency SQL creates new tables/constraints, adds nullable interruption metadata and no-ops notification choices; no destructive/data migration. No migration applied to development.

Read-only development PostgreSQL count checks confirm **103 users, 9 organizations, 51 providers, 102 appointments, 102 QueueEntries and one historical active duplicate group**, unchanged from task entry. No development booking, file mutation, seed, reconciliation or live email occurred. Protected reference files are untouched. Browser emergency workflow, actual email delivery and M2 live ETA recovery remain explicit rollout acceptance tasks. No owner policy blocker remains in the implemented emergency scope; owner approval is still required to migrate development.

## Targeted emergency corrections — 2026-10-13

The inspection-only review found two paths not covered by the earlier green assertions: reusing a resolved recovery after ordinary same-Appointment rescheduling away/back, and SDK timeouts caught by the real adapter becoming retryable failures. Those defects and the legacy NULL-date duplicate predicate are now narrowly corrected; earlier results above remain historical evidence.

Changed implementation files in this correction:

- `backend/apps/providers/emergency_models.py`, `emergencies.py`, `emergency_views.py`.
- `backend/apps/contact/email_service.py`, `backend/apps/contact/tests/test_email_service.py`.
- `backend/apps/appointments/capacity.py`, `backend/apps/appointments/services.py`, `backend/apps/queue/services.py`.
- `backend/tests/test_provider_emergency.py`.
- New `backend/apps/providers/migrations/0012_remove_provideremergency_emergency_provider_date_unique_and_more.py`.
- Directly relevant Business Rules, Queue State Machine, Product Architecture, Known Issues and this verification document. No frontend file changed.

### Exact verification

From backend:

```powershell
& ..\.venv\Scripts\python.exe -B -m pytest tests/test_provider_emergency.py apps/contact/tests/test_email_service.py -q --tb=short --show-capture=no
```

Initial focused SQLite checkpoint: **77 passed, 0 failed, 9 skipped**, before adding the final database-constraint assertion. PostgreSQL-only cases were skipped; SQLite is not concurrency/migration proof.

```powershell
& ..\.venv\Scripts\python.exe -B -m pytest tests/test_provider_emergency.py tests/test_m2_lifecycle.py tests/test_batch_b.py apps/contact/tests/test_email_service.py apps/contact/tests/test_contact_api.py apps/accounts/tests/test_password_reset.py --ds=config.settings.test_postgresql --migrations -q --tb=short --show-capture=no
```

Final integration: **279 passed, 0 failed, 0 skipped** in isolated `test_queueturn_m2`, with real migrations. Includes **67 emergency cases, 83 M2, 73 Batch B and 56 email/contact/password-reset cases**. Nine emergency concurrency cases now include duplicate new-incident declaration and genuine completion versus consent-based cancellation/replacement. All outbound email boundaries in tests are mocked; no live emails were sent. No broad backend suite was run and no ordinary policy was relaxed.

```powershell
& ..\.venv\Scripts\python.exe -B manage.py check --settings=config.settings.development
& ..\.venv\Scripts\python.exe -B manage.py makemigrations --check --dry-run --settings=config.settings.development
& ..\.venv\Scripts\python.exe -B manage.py sqlmigrate providers 0012 --settings=config.settings.development
```

Django: **no issues (0 silenced)**. Migration consistency: **no changes detected**. Inspected providers 0012 SQL drops only the old provider/date uniqueness constraint and creates a conditional unique index for TEMPORARY/UNAVAILABLE; no record deletion, data migration or existing-field rewrite. Existing migrations remain untouched. New application behavior requires all pending Batch B/emergency migrations before development/browser acceptance. No development migration was applied.

Frontend source unchanged: tests/build not repeated. `git diff --check` passed. Development appointments, QueueEntries and the historical duplicate group remain untouched; no reset, seed, reconciliation, staging, commit, push or deployment. Actual browser acceptance and live email delivery remain pending. Email ACCEPTED is never presented as delivered; uncertainty and already in-flight ordering remain explicitly qualified.
