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
