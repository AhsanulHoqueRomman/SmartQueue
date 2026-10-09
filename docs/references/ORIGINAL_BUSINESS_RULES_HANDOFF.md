# QueueTurn — Complete Business Rules, Queue Lifecycle & Project Handoff

**Document date:** October 8, 2026  
**Product:** QueueTurn  
**Former name:** SmartQueue  
**Category:** Multi-Tenant Appointment & Queue Management Platform  
**Tagline:** *Book a serial. Arrive smarter. Wait less.*

## 0. Instructions for the New ChatGPT Conversation

This document transfers the business logic, architectural decisions, operational workflows, and known limitations of QueueTurn.

**Important: Do not immediately redesign or rewrite the queue engine.**

The document combines:

- **ESTABLISHED:** Business rules agreed during development and supported by historical implementation reports.
- **SOURCE-AUDITED:** Behaviors identified in the October 8 Codex source-audit report.
- **KNOWN ISSUE:** Behavior currently reported as incorrect, unsafe, incomplete, or requiring verification.
- **POLICY PENDING:** A business decision that has not been conclusively finalized or implemented.

These classifications matter. Do not treat an intended business rule as proof that its implementation is correct.

The latest source-audit report was based on repository inspection, but not every endpoint, concurrency scenario, or runtime condition was tested. Inspect the latest repository and the pending **Business Rule Baseline & Fix Impact Assessment** before implementing fixes.

---

# 1. What QueueTurn Actually Does

QueueTurn is a multi-tenant service booking and queue management system.

It supports organizations such as:

- Clinics and healthcare providers
- Salons and beauty services
- Consulting firms
- Repair and maintenance centers
- Legal practices
- Service counters
- Other organizations where customers wait to receive services

An organization registers with QueueTurn, configures its services and professionals, and manages appointments and queues.

A customer discovers an organization, chooses a service and provider, books a serial for a date, receives an estimated service time, follows recommended arrival guidance, checks in, waits for their turn, receives service, and can leave a review.

**Core business principle:**

QueueTurn sells/reserves a position in a provider's daily service queue, not a guaranteed consultation start time.

The product must not be redesigned as a rigid fixed-slot booking platform.

---

# 2. How the Project Evolved

## 2.1 Original architecture — fixed appointment slots

Initially, SmartQueue used a conventional appointment-booking approach.

A customer selected an organization, service, provider, date, and available time slot.

The original system used fixed-time slot logic, including 15-minute slot-grid alignment in parts of the implementation. Some early architecture discussions also described 30-minute booking intervals.

A simplified example:

| Customer | Booked time |
|---|---|
| A | 10:00 AM |
| B | 10:15 AM |
| C | 10:30 AM |
| D | 10:45 AM |

This created several business problems.

**Problem 1 — Service durations are not equal.**

One consultation may take 8 minutes; another may take 25 minutes.

A rigid time grid cannot accurately predict real service progression.

**Problem 2 — Actual arrival order differs from booking order.**

Some customers arrive early, some late, and some do not arrive.

**Problem 3 — A provider may be delayed.**

A consultation can take longer than expected, shifting later customers' service times.

**Problem 4 — Walk-ins and phone bookings need to coexist.**

Separate queues would make operational ordering inconsistent.

**Problem 5 — Customers need realistic arrival guidance.**

A 10:30 AM reservation may not mean service will actually start at 10:30 AM.

These limitations motivated the serial-first architecture.

## 2.2 Phase 5 — serial-based redesign

The major architectural decision was:

**Replace rigid patient consultation slots with a provider-specific, date-specific serial queue.**

The new rules became:

1. Assign serials when appointments are created.
2. Do not wait until check-in to allocate serials.
3. Maintain one queue for each provider and business date.
4. Combine online, phone, front-desk, scheduled, and walk-in bookings.
5. Use provider availability and total service workload to decide whether a date can accept another booking.
6. Treat estimated consultation times as forecasts.
7. Update waiting estimates as actual queue activity changes.
8. Treat physical check-in as presence, not as permission to jump ahead.
9. Allow authorized operational urgent overrides.
10. Keep appointment and queue lifecycle states synchronized.

**The serial-first architecture is the accepted business model.**

## 2.3 Later hardening

Subsequent work added or refined:

- Database-level serial uniqueness
- Cancellation synchronization
- No-show/skip handling
- Urgent queue ordering
- Active-consultation elapsed-time deduction
- Customer live queue telemetry
- Date-aware readiness
- Future-versus-today-versus-past classification
- Multi-organization customer dashboards
- Provider-specific pricing
- Booking price/contact snapshots
- Organization approval and discovery rules
- Reviews and notifications

Some later fixes introduced new edge cases, particularly historical queue reconciliation. These are documented below.

---

# 3. Core Domain Entities

## 3.1 User

The global authenticated account.

A user can be a customer and may also hold an organization-specific operational membership.

The account itself is not equivalent to an organization role.

## 3.2 Organization

The tenant/business using QueueTurn.

Each organization owns its operational resources.

An organization has its own:

- Identity and profile
- Verification/approval state
- Services and categories
- Providers
- Members and staff
- Operating hours
- Appointments
- Queue operations
- Reviews and analytics

## 3.3 OrganizationMembership

Connects a user to an organization.

The audited model uses organization-specific roles:

- MANAGER
- STAFF
- PROVIDER

Membership activity and organization scope matter.

A membership in Organization A must not grant access to Organization B.

## 3.4 ProviderProfile

Represents a service professional operating under an organization membership.

A provider can have:

- Assigned services
- Custom service prices
- Custom service durations
- Weekly schedules
- Breaks
- Leave/unavailability
- Operational eligibility
- Appointment and queue assignments

## 3.5 Service and ProviderService

`Service` represents an organization-owned service.

`ProviderService` connects a provider with a service and can override its price or duration.

For example:

| Service | Base duration | Provider-specific duration |
|---|---:|---:|
| Consultation | 15 min | 20 min |
| Haircut | 30 min | 40 min |

**Established rule:** Provider-specific duration must be respected where applicable.

**KNOWN ISSUE F10:** The current source audit found that queue ETA calculations still use base service duration in several places, whereas booking capacity can use effective provider-specific duration.

## 3.6 Appointment

The customer's reservation and business record.

Important concepts include:

- Organization
- Customer
- Provider
- Service
- Appointment date
- Serial number
- Booking channel
- Arrival type
- Appointment status
- Contact snapshot
- Price snapshot
- Historical/scheduled/estimated timestamps

## 3.7 QueueEntry

The operational queue record associated with an appointment.

Important concepts include:

- Provider
- Queue date
- Serial number
- Status
- Presence/check-in
- Urgent priority
- Readiness
- Called/start/completion/skip timestamps

**Established relationship:** Each booked appointment has a linked QueueEntry.

QueueEntry is created during booking, not created for the first time when the customer checks in.

---

# 4. Roles and Access Control

## 4.1 Customer

A customer is a global QueueTurn user.

### Customer capabilities

- Register and log in
- Browse organizations
- Search services and professionals
- View customer-safe organization/provider profiles
- Book an eligible service
- View own appointments
- View own serial number
- Track own live queue
- See estimated waiting/service time
- See recommended arrival guidance
- Check in when eligible
- Cancel or reschedule where permitted
- Receive notifications
- Review completed services
- Manage own profile

### Customer restrictions

Customers must not:

- Access other customers' private appointment data
- See another customer's sensitive queue information
- Assign their own serial number
- Override their booking channel to impersonate staff
- Mark themselves urgent
- Call the next customer
- Start or complete consultations
- Modify provider schedules
- Manage another organization's resources

The backend must enforce these restrictions, not merely hide frontend buttons.

## 4.2 Provider

A provider performs services for an organization.

### Established provider responsibilities

- View assigned appointments
- View relevant daily queue
- Manage permitted own availability/schedule information
- Check operational presence
- Call the next eligible customer
- Start consultations
- Complete consultations
- Skip unavailable customers when authorized
- Register walk-ins through authorized workflows where supported
- Request or apply urgent priority through authorized workflows
- View relevant service/review information

### Restrictions

A provider must not automatically gain access to:

- Other organizations
- Unassigned providers' private operations
- Organization-wide administration
- Staff management
- Platform administration
- Arbitrary service/pricing configuration outside authorized controls

Provider permissions depend on active membership, ownership, and endpoint-specific rules.

## 4.3 Staff

Staff primarily handles front-desk and operational queue work.

### Established staff responsibilities

- View organization-scoped appointments
- Register phone/front-desk bookings through supported flows
- Register walk-ins
- Check in arriving customers
- View provider queues
- Call eligible customers through authorized controls
- Skip or mark absent customers
- Perform supported service lifecycle actions
- Assist providers with operational queue management
- View relevant customer/provider/service information

Staff access must remain organization-scoped.

**Important:** The exact provider-versus-staff authority for starting/completing a consultation must be verified per endpoint. Historical reports support provider/staff operational actions, but the complete role-action matrix should be extracted from the current permissions and service code.

## 4.4 Manager

The manager controls organization-level operations.

### Established management responsibilities

- Manage the organization profile
- Manage organization operating hours
- Manage categories and services
- Manage service pricing
- Manage provider-service assignments
- Manage staff and provider memberships
- Handle invitations
- Manage supported provider schedules
- Oversee appointments and queues
- Review operational analytics
- View organization audit logs
- Manage organization settings
- Handle organization verification/credentials as authorized

Managers also have organization-scoped queue management permissions in the audited architecture.

However, do not assume every manager can perform every provider action without checking the specific endpoint.

## 4.5 Platform Admin

Platform administration is based on privileged Django account flags and explicit admin permissions.

Responsibilities include:

- Organization approval/verification
- Platform-wide administrative oversight
- User administration
- Contact/support inbox management
- Applicable provider/organization review workflows

Do not assume platform admins automatically bypass every object-level check; inspect the actual permission implementation.

## 4.6 Permission matrix

| Action | Customer | Provider | Staff | Manager | Platform Admin |
|---|---|---|---|---|---|
| Book own appointment | Yes | As customer | Assisted flow | Subject to flow | Subject to flow |
| View own appointment | Yes | Yes | Scoped | Scoped | Authorized |
| View provider queue | Own safe telemetry | Assigned | Scoped | Scoped | Authorized |
| Check in customer | Self when eligible | Authorized | Yes | Authorized | Authorized |
| Register walk-in | No | Supported/authorized | Yes | Authorized | Authorized |
| Call next | No | Yes | Yes | Endpoint-dependent | Authorized |
| Start consultation | No | Yes | Supported/authorized | Endpoint-dependent | Authorized |
| Complete consultation | No | Yes | Supported/authorized | Endpoint-dependent | Authorized |
| Skip customer | No | Yes | Yes | Authorized where implemented | Authorized |
| Mark urgent | No | Yes | Yes | Yes | Authorized |
| Manage services/pricing | No | Limited assigned controls | Limited | Yes | Authorized |
| Manage staff/memberships | No | No | No | Yes | Authorized |
| Platform verification | No | No | No | Submission/management | Review/approval |

This is a **business-capability baseline**, not a replacement for the exact DRF permission matrix.

---

# 5. Booking Workflow — Complete Cycle

## 5.1 Customer selects organization

The organization must satisfy the appropriate operational visibility/eligibility rules.

Customer-facing discovery should not offer unavailable or unapproved organizations as if they are bookable.

**KNOWN ISSUE F14:** Public service detail currently has an approval-gate inconsistency.

## 5.2 Customer selects service

The service must:

- Belong to the selected organization
- Be active/eligible
- Have valid duration and pricing
- Be supported by the chosen provider

## 5.3 Customer selects provider

The provider must:

- Belong to the selected organization
- Have an appropriate active/eligible operational profile
- Be assigned to the selected service
- Have relevant availability

Cross-tenant provider/service mismatches must be rejected.

## 5.4 Customer selects date

The system checks provider availability and capacity.

It does not reserve a fixed consultation start time.

The customer can see provider schedule and date-level availability guidance.

## 5.5 Customer supplies contact and notes

Booking may include contact name, phone and notes.

The newer architecture stores booking-specific contact snapshots.

Changing the contact information for one booking should not silently overwrite the user's global profile.

## 5.6 Server resolves price

The client does not determine the authoritative booking price.

The backend resolves:

1. Provider-specific custom charge if defined.
2. Otherwise the service base charge.

A custom price of zero is valid and must not be confused with an unset/null override.

The effective charge is copied into the appointment's booking snapshot.

**Established invariant:** Historical booking charge must not silently change when a manager later edits the service price.

## 5.7 Atomic booking transaction

The source-audited booking service performs approximately this sequence:

1. Validate organization/contact eligibility.
2. Begin database transaction.
3. Lock provider row.
4. Validate provider/service assignment.
5. Lock the assignment where required.
6. Resolve effective charge.
7. Validate date, schedule, leave and capacity.
8. Determine next serial.
9. Create Appointment.
10. Create matching QueueEntry.
11. Create associated notification/audit records.

The provider row is the stable concurrency lock.

The documented locking order is **provider first, then assignment** where applicable.

## 5.8 Serial allocation

Serials are scoped to:

`(provider, appointment_date)`

Example:

**Provider A — October 10**

| Booking | Serial |
|---|---:|
| Customer A | 1 |
| Customer B | 2 |
| Customer C | 3 |

**Provider B — October 10**

| Booking | Serial |
|---|---:|
| Customer D | 1 |
| Customer E | 2 |

Provider B has a separate queue.

Provider A on October 11 also has a new date-specific sequence.

Database constraints protect provider/date/serial uniqueness.

Serial allocation must remain transactionally safe.

## 5.9 Booking result

The customer receives:

- Booking confirmation
- Provider/service/date
- Serial number
- Estimated service time/window
- Recommended arrival guidance
- Live queue link

**Critical:** The estimate is not a guaranteed appointment start time.

---

# 6. Provider Availability and Daily Capacity

## 6.1 Weekly working schedule

Each provider can have a different weekly schedule.

For example:

- Organization opens at 9:00 AM.
- Provider A works 10:00 AM–3:00 PM.
- Provider B works 11:00 AM–6:00 PM.

Organization opening hours and provider availability are separate concepts.

## 6.2 Breaks

Provider breaks reduce usable working time.

Example:

Provider works 10:00 AM–4:00 PM = 360 minutes.

Lunch break = 60 minutes.

Usable time = 300 minutes.

## 6.3 Leave

Provider leave/unavailability must be respected.

A provider on full-day leave should not accept ordinary bookings for that date.

Partial-day leave must reduce usable capacity appropriately.

**KNOWN ISSUE F09:** The October 8 audit found that partial leave and elapsed same-day working time are not fully reflected in the current capacity calculation.

## 6.4 Capacity is workload-based

The intended rule is based on effective service durations.

Conceptual example:

Provider usable capacity = 300 minutes.

Existing reserved workload:

- Consultation A = 20 minutes
- Consultation B = 30 minutes
- Consultation C = 40 minutes

Reserved workload = 90 minutes.

Remaining capacity = 210 minutes.

Another 30-minute booking may be accepted if all other eligibility rules pass.

This is a conceptual illustration, not the exact source implementation of every capacity edge case.

## 6.5 No fixed-slot overlap blocking

The Phase 5 redesign removed the old assumption that every appointment occupies one exclusive 15-minute grid slot.

Multiple sequential bookings can belong to the same provider/date without requiring a rigid individual start-time reservation.

## 6.6 Capacity must also apply to rescheduling

A rescheduled appointment must satisfy destination date capacity.

**KNOWN ISSUE F06:** The current audited reschedule path checks schedule/leave but does not reuse the booking capacity helper, allowing possible over-capacity destination dates.

---

# 7. Unified Booking Channels

QueueTurn supports three booking channels:

- `ONLINE`
- `PHONE`
- `FRONT_DESK`

And two arrival types:

- `SCHEDULED`
- `WALK_IN`

These are separate dimensions.

## Online scheduled booking

A customer books through the website.

Expected:

- Channel: ONLINE
- Arrival: SCHEDULED
- Serial assigned immediately
- Not automatically checked in

## Phone booking

Staff records an appointment after a phone conversation.

Expected:

- Channel: PHONE
- Arrival: SCHEDULED
- Serial assigned during creation
- Customer still needs presence/check-in

The precise supported phone-booking endpoint should be confirmed in current code.

## Front-desk walk-in

A customer arrives without an advance booking.

Expected:

- Channel: FRONT_DESK
- Arrival: WALK_IN
- Next serial allocated
- Customer checked in immediately
- Same provider queue

**A walk-in does not get a separate queue and does not automatically jump ahead of earlier serials.**

---

# 8. Queue Ordering and Fairness

## 8.1 Basic rule

Normal service order:

`serial_number ASC`

Operational urgent override:

`is_urgent DESC, serial_number ASC`

Meaning:

1. Urgent checked-in eligible entries first.
2. Within equal urgency, lower serial first.

## 8.2 Presence requirement

A customer must be checked in and in an eligible waiting state before `call_next()` selects them.

A reserved serial alone does not guarantee they can be called while absent.

## 8.3 Early arrival example

Provider has:

| Customer | Serial | Check-in |
|---|---:|---|
| A | 1 | 10:00 |
| B | 2 | 10:20 |
| C | 3 | 10:15 |

Customer C arrived before B.

But the normal order is still:

A → B → C

because serial order takes priority over check-in timestamp.

## 8.4 Absent earlier serial

Suppose:

- Serial 1 is absent.
- Serial 2 is checked in.
- Serial 3 is checked in.

The provider can call Serial 2 because Serial 1 is not currently eligible.

Serial 1 does not permanently block the queue simply because they have a lower serial.

## 8.5 Late return

Suppose Serial 1 arrives after Serial 2 has already started service.

The active consultation should not be interrupted.

If Serial 1 remains an eligible waiting appointment, their lower serial may make them next after the active consultation.

However, if Serial 1 has already been marked `SKIPPED`/`NO_SHOW`, returning to WAITING requires an explicit restoration policy.

**POLICY PENDING:** The exact late-return/requeue permission and cutoff have not been conclusively finalized.

## 8.6 Urgent customer

Suppose:

- Serial 2: normal, checked in
- Serial 3: normal, checked in
- Serial 5: urgent, checked in

Effective waiting order:

5 → 2 → 3

Urgent priority must be authorized and auditable.

It should not be available to ordinary customers.

Urgent marking must not interrupt an already active consultation unless an explicit emergency-interruption policy is separately approved.

---

# 9. Check-In Rules

Check-in is a presence event.

It does not allocate a new serial.

It does not automatically start consultation.

It does not mean the customer is being served.

Expected effects:

- `is_checked_in = True`
- `checked_in_at` recorded
- Appointment and queue state updated consistently
- Customer becomes eligible for queue operations where applicable

## 9.1 Check-in date

The established current design uses business-date-aware eligibility.

Future appointments should not be treated as today's live queue.

Historical appointments should not offer ordinary current-day check-in.

**Important implementation nuance:** The source audit found that current check-in eligibility is not universally limited by an advertised six-hour arrival threshold. Eligible same-day confirmed appointments can check in under current backend rules.

Do not invent or enforce a strict six-hour rule without explicit approval.

## 9.2 Repeated check-in

Repeated check-in should be handled idempotently or rejected safely without creating another serial/queue entry.

The source audit identified idempotent handling in the check-in service.

## 9.3 Check-in does not override urgency

A checked-in normal customer remains below checked-in urgent entries in effective ordering.

---

# 10. Operational Queue Lifecycle

The core QueueEntry lifecycle is:

`WAITING → CALLED → IN_PROGRESS → COMPLETED`

Alternative terminal paths include:

- `SKIPPED`
- `CANCELLED`
- `NO_SHOW`, where applicable

Appointment and QueueEntry statuses are separate but must remain consistent.

## 10.1 WAITING

Appointment has a queue entry and is awaiting operational service.

The customer may or may not yet be checked in.

Only eligible checked-in waiting entries can be selected by `call_next()`.

## 10.2 CALLED

An authorized operator calls the customer.

The queue records the call event/timestamp.

This means the customer's turn has been announced.

**CALLED is not the same as IN_PROGRESS.**

The provider may still be waiting for the customer to enter the service room or counter.

## 10.3 IN_PROGRESS

The service/consultation has actually started.

The queue records the start time.

Appointment and queue statuses should reflect service in progress consistently.

## 10.4 COMPLETED

The service has finished.

The system records completion and updates both appointment and queue records.

The completed entry no longer blocks the active queue.

The customer may become eligible to submit a review.

## 10.5 SKIPPED / NO_SHOW

A customer may be skipped because they are unavailable when called.

Historical Phase 5 reports confirm that `skip_queue_entry()` synchronizes the corresponding appointment to `NO_SHOW`.

**Important:** Operationally, "temporarily skipped" and "final no-show" are different business concepts. The existing implementation's skip-to-NO_SHOW behavior must not be silently interpreted as a fully designed temporary-requeue policy.

---

# 11. Call Next — Detailed Rules

When a provider/staff member presses **Call Next**:

1. Identify the organization/provider queue.
2. Check actor authorization.
3. Use the provider's business date/queue scope.
4. Check that no conflicting active consultation exists.
5. Identify eligible WAITING entries.
6. Require physical check-in.
7. Exclude cancelled/no-show/skipped/completed entries.
8. Apply urgent priority, then serial order.
9. Select the first eligible entry.
10. Update queue status to CALLED.
11. Record the call timestamp.
12. Generate relevant notification/telemetry changes.

The source audit identified provider locking and an active-consultation guard.

**Concurrency rule:** Two simultaneous Call Next requests must not claim the same customer or create conflicting active sessions.

This is a required invariant, although comprehensive PostgreSQL concurrency testing remains outstanding.

---

# 12. What Happens If a Customer Is Called but Service Does Not Start?

This is an important operational scenario.

Example:

- Serial 4 is called at 11:00 AM.
- Customer does not approach the service room.
- Provider has not pressed Start Consultation.
- The queue remains CALLED.

## Established behavior

The system distinguishes CALLED from IN_PROGRESS.

A called entry can be skipped through the operational skip path.

## Correct business distinction

The customer must not be marked COMPLETED because no service was delivered.

A failed call attempt is not a successful consultation.

The system should not fabricate a `started_at` timestamp.

## Policy requiring explicit verification

The following are not conclusively established:

- How long the provider waits after calling.
- Whether the system supports Recall.
- Whether Recall creates another timestamp/event.
- Whether staff can release a CALLED entry without marking a final NO_SHOW.
- Whether a missed customer can rejoin the queue.
- Whether an automatic timeout exists.
- Whether the provider may call another customer while one remains CALLED.

**Do not invent an automatic timeout.**

For the current implementation, inspect `call_next()`, `start_queue_entry()` and `skip_queue_entry()` to establish which transitions are actually allowed.

---

# 13. What Happens If the Provider Starts Service but Does Not Complete It?

Example:

- Serial 3 becomes IN_PROGRESS at 10:30 AM.
- Provider forgets to press Complete.
- The consultation remains IN_PROGRESS.

## Established behavior

The ETA engine uses active consultation start time and expected duration.

It deducts elapsed consultation time when forecasting the remaining workload.

## Important limitation

Elapsed time exceeding expected duration must not be interpreted as proof that service finished.

An expected duration is not a completion event.

A consultation should become COMPLETED only through an authorized, valid completion workflow.

## Consequences

If an IN_PROGRESS record remains open:

- Queue progression can be blocked.
- Customer ETA may become inaccurate.
- Operational dashboards may show a long-running consultation.
- Other customers may continue waiting.
- The system may need an explicit administrative correction workflow.

## POLICY PENDING

Determine:

- Whether there is a warning for overdue consultations.
- Whether provider/staff/manager can correct an abandoned session.
- Whether completion can be backdated.
- Whether a session can be marked interrupted.
- Whether there is a maximum active consultation duration.
- Whether a service may legitimately cross midnight.

## KNOWN ISSUE F08

The October 8 audit found that historical reconciliation currently includes `IN_PROGRESS` entries and can mark them SKIPPED/NO_SHOW when a queue read occurs after midnight.

That conflicts with legitimate overnight service.

**This is a known defect, not a desirable business rule.**

Do not document automatic termination of an active overnight consultation as correct intended behavior.

---

# 14. What Happens If a Customer Receives No Service?

Several distinct scenarios must not be confused.

## Scenario A — Customer never arrives

- Booking exists.
- Serial exists.
- No check-in.
- Customer cannot be called through the normal presence-gated path.
- Eventually a no-show/expiry policy may apply.

A future booking must not be prematurely marked NO_SHOW.

## Scenario B — Customer arrives but misses the call

- Customer checked in.
- Provider calls them.
- Customer does not respond.
- Authorized operator may skip them.

Existing skip behavior can mark the appointment NO_SHOW.

Whether the customer can later return requires explicit policy.

## Scenario C — Customer is called but consultation never starts

- CALLED exists.
- IN_PROGRESS does not.
- No service was provided.

Do not mark COMPLETED.

The operational resolution may be skip/no-show or another explicit state, depending on approved policy.

## Scenario D — Provider unavailable

- Customer may have arrived.
- Provider cannot provide service.

This is not automatically a customer NO_SHOW.

Possible future business resolutions include rescheduling, cancellation with provider-side reason, or reassignment if supported.

**POLICY PENDING:** Exact provider-unavailable workflow and reassignment rules are not fully established.

## Scenario E — Provider refuses/cannot perform service after starting

This differs from normal completion.

Possible concepts include interrupted service, incomplete service, or operator cancellation.

**POLICY PENDING:** There is no verified general-purpose partial-service lifecycle or refund policy in the baseline.

Do not label it COMPLETED without explicit business rules.

## Scenario F — Service was delivered but operator forgot to complete

This is an operational record-correction problem.

It should not automatically become a customer NO_SHOW.

A safe correction workflow needs authorization and audit history.

---

# 15. Skip, No-Show and Return-to-Queue

## 15.1 Existing implementation baseline

The historical Phase 5 implementation established:

- `skip_queue_entry()` supports skipping a customer.
- The corresponding appointment can become NO_SHOW.
- SKIPPED/NO_SHOW entries are excluded from call-next selection.
- They should not count as eligible waiting entries for ETA ordering.

## 15.2 Temporary skip versus final no-show

Conceptually:

**Temporary skip:** Customer missed one call but may still be served later.

**Final no-show:** Customer is considered absent and the appointment is closed without service.

These should not be conflated in future requirements.

The current source must be checked before claiming a temporary restoration flow exists.

## 15.3 Return after skip

Example:

- Serial 2 was called.
- Customer did not respond.
- Staff skipped Serial 2.
- Serial 3 started service.
- Serial 2 returns.

Possible policy choices:

1. Restore Serial 2 to WAITING and retain original serial priority.
2. Requeue Serial 2 behind currently waiting customers.
3. Require manager approval.
4. Require a new booking/serial.
5. Reject return after a cutoff.

**No single choice should be treated as approved without user confirmation.**

## 15.4 Important fairness constraint

A restored customer should never interrupt an IN_PROGRESS consultation.

Any restoration must update Appointment and QueueEntry consistently.

It must not duplicate the original serial or create a second active QueueEntry accidentally.

---

# 16. Cancellation Rules

Cancellation is not the same as skip or no-show.

## Established behavior

Cancellation updates the appointment and corresponding QueueEntry transactionally.

The queue status becomes CANCELLED where applicable.

A cancelled appointment:

- Must not be selected by Call Next.
- Must not remain an eligible waiting entry.
- Must not be treated as a completed consultation.
- Must not become review-eligible as if service was provided.

## Important details

The backend must validate:

- Actor authorization
- Appointment ownership
- Current lifecycle state
- Whether cancellation is still permitted
- Tenant boundaries

**KNOWN ISSUE F07:** The October 8 audit identified potential stale-state concurrency races in cancellation/rescheduling because some state checks may occur outside the fully locked transaction.

This requires PostgreSQL concurrency verification.

## POLICY PENDING

Cancellation cutoffs, penalties, provider-side cancellations and late-cancellation handling must be verified rather than assumed.

---

# 17. Rescheduling Rules

Rescheduling changes the date/queue reservation.

The source-audited path updates appointment and queue records together and allocates a destination serial.

A valid reschedule should:

1. Validate actor and appointment status.
2. Validate destination provider/date eligibility.
3. Respect schedule, breaks and leave.
4. Respect destination capacity.
5. Allocate a valid serial in the destination queue.
6. Update Appointment and QueueEntry consistently.
7. Preserve relevant historical booking information.
8. Avoid creating duplicate active queue reservations.

## KNOWN ISSUE F06

The current audited reschedule path lacks the same destination capacity check as ordinary booking.

This is a genuine business-rule inconsistency.

## KNOWN ISSUE F07

Concurrent cancellation/rescheduling/queue mutation may operate on stale appointment state.

The intended behavior requires fresh locked-state validation.

Do not assume the existing implementation is race-free merely because it uses transactions.

---

# 18. Dynamic ETA — What It Means

ETA is a forecast of when the customer may be served.

It is not the customer's physical travel ETA and not a fixed appointment guarantee.

QueueTurn uses actual queue progression to update the estimate.

## 18.1 Inputs

The ETA model considers concepts such as:

- Current business date/time
- Provider's working schedule
- Queue ordering
- Urgent entries
- Customer serial
- Checked-in entries ahead
- Scheduled entries ahead
- Active consultation
- Expected service durations
- Elapsed active consultation time

The October 8 audit confirms separate scheduled-ahead and checked-in-ahead information, but the exact formulas and inclusion rules should be extracted from current code.

## 18.2 Conceptual formula

For a live eligible waiting customer:

**Estimated wait ≈ Remaining active service time + expected workload of eligible customers ahead**

**Estimated service start ≈ Current time + estimated wait**

This is conceptual, not a substitute for the current `calculate_readiness_and_eta()` implementation.

## 18.3 Example

Assume:

Current time = 10:00 AM.

Provider is serving Serial 1.

Serial 1 expected duration = 20 minutes.

Serial 1 started at 9:50 AM.

Estimated remaining active time = 10 minutes.

Serial 2 expected duration = 15 minutes.

Serial 3 is waiting behind Serial 2.

For Serial 3:

Estimated wait ≈ 10 + 15 = 25 minutes.

Estimated service start ≈ 10:25 AM.

If Serial 1 finishes earlier, Serial 3's estimate should move earlier.

If Serial 2 takes longer than expected, the estimate may move later.

## 18.4 Actual service duration can differ

If a 20-minute consultation takes 35 minutes, the queue must reflect the ongoing service rather than automatically assuming completion at minute 20.

The current implementation uses elapsed time and clamps estimated remaining duration, but the exact overdue behavior needs verification.

## 18.5 ETA must match service ordering

The ETA engine and Call Next should use the same effective priority model.

Otherwise the UI could tell Serial 4 they are next while Call Next selects urgent Serial 7.

The Phase 5 hardening specifically aligned ETA with urgent-first serial ordering.

## 18.6 Known duration mismatch

**KNOWN ISSUE F10:** The current ETA calculation uses base Service duration in several locations, while availability can use ProviderService custom duration.

This can create inconsistent forecasts.

The fix should reuse the authoritative effective-duration rule, not create a second independent duration formula.

---

# 19. Scheduled Target Time vs Live ETA

These are different concepts.

## Scheduled target

A preliminary expected service time based on provider working schedule and reserved workload.

It is useful when the customer books in advance.

It is not a fixed slot.

## Live ETA

A rolling estimate based on current operational queue state.

It becomes meaningful as the appointment date arrives and service progresses.

## Future booking rule

The later business-truth implementation explicitly established:

- Future appointments show readiness `NOT_YET`.
- They do not expose a misleading live queue wait.
- Their live `estimated_wait_minutes` and ahead count may be null.
- They can still display booking-date target information where supported.

Do not mix a future booking's preliminary target time with today's live queue telemetry.

## Past booking rule

Historical appointments should not display a continuously sliding live ETA.

The later temporal fix introduced `INACTIVE` handling for past entries.

However, terminal and active-overnight exceptions require careful treatment.

---

# 20. Recommended Arrival Time

This is one of QueueTurn's main product features.

**Estimated service time** answers:

"When might my service start?"

**Recommended arrival time** answers:

"When should I arrive so I am unlikely to miss my turn?"

They must remain separate fields/concepts.

## 20.1 Conceptual formula

**Recommended arrival ≈ Estimated service start − arrival buffer**

Historical design discussions used an illustrative 15–20 minute lead buffer, often 15 minutes.

Do not hardcode 15 minutes as the current universal backend rule without inspecting the latest implementation.

## 20.2 Example

Estimated service start = 11:30 AM.

Arrival buffer = 15 minutes.

Recommended arrival = 11:15 AM.

The customer should understand:

- 11:30 is an estimate.
- 11:15 is suggested arrival guidance.
- Actual service order still depends on eligibility and queue progression.

## 20.3 Why arrival guidance changes

Suppose the provider finishes early.

Estimated service start moves from 11:30 to 11:10.

Recommended arrival may move from 11:15 to 10:55.

If the provider is delayed, both may shift later.

This is why QueueTurn has live telemetry and readiness updates.

## 20.4 Important distinction

Recommended arrival is not automatically the earliest allowed check-in time.

The source audit found that the current check-in rule permits eligible same-day appointments rather than enforcing a universal six-hour check-in window.

The UI must not imply that an arrival recommendation is a hard booking restriction.

---

# 21. Readiness States

QueueTurn historically uses:

- `NOT_YET`
- `GET_READY`
- `BE_READY`
- `TURN_NOW`

The frontend may also display `IN_SERVICE` or `INACTIVE` depending on lifecycle and temporal classification.

These are customer-facing guidance states, not replacements for QueueEntry operational status.

## 21.1 NOT_YET

Customer's turn is not close.

For future appointments, readiness should remain NOT_YET rather than showing a live today-based estimate.

## 21.2 GET_READY

The customer's turn is approaching.

The customer should prepare to travel or become ready to arrive.

## 21.3 BE_READY

The customer's turn is close.

The customer should be near or at the service location.

## 21.4 TURN_NOW

The customer's turn has been called or the current queue conditions meet the actual TURN_NOW rule.

Do not assume merely being Serial 1 always means a call occurred.

## 21.5 IN_SERVICE

The customer's service is actively in progress.

Where exposed by the UI, this must correspond to actual consultation state.

## 21.6 INACTIVE

Historical/terminal queue telemetry should not pretend to be a current active queue.

## Historical threshold example

A later Phase A report described position-based readiness as:

- Called position 1 → TURN_NOW
- Position 1–2 → BE_READY
- Position 3–4 → GET_READY
- Position 5+ → NOT_YET

Earlier planning documents used different minute-based and position-based bands.

**Therefore:** Treat the exact thresholds as implementation details requiring verification, not immutable business policy.

The important established requirement is that readiness is mutually exclusive, deterministic, date-aware and consistent with the live queue.

---

# 22. Notifications and Polling

QueueTurn uses ordinary HTTP polling rather than WebSockets.

Historical intervals include approximately 10–15 seconds for live queue updates.

The customer live queue page has used a 10-second polling interval.

Notification updates may use a different interval.

## Notifications can cover

- Booking confirmation
- Queue readiness changes
- Turn called
- Other relevant lifecycle events

The Phase 5 implementation included state-transition checks to avoid repeatedly generating the same readiness notification during polling.

## Critical distinction

Polling is a read/update mechanism.

It should not create repeated business events merely because a page refreshes.

Notifications should correspond to meaningful changes.

## Known technical considerations

- Avoid overlapping requests.
- Handle stale responses.
- Clean up polling when components unmount.
- Do not assume clearing an interval cancels an already-running HTTP request.
- Avoid unnecessary server work on every poll.

No Redis, Celery, WebSockets, SMS or AI forecasting should be introduced automatically.

---

# 23. Customer-Facing Experience

## 23.1 Before appointment date

Customer sees:

- Organization
- Service
- Provider
- Date
- Serial
- Booking status
- Preliminary service/arrival guidance

They should not see an inaccurate live today-based queue status for a future booking.

## 23.2 On appointment date

Customer sees:

- Serial number
- Queue status
- Current service progress where available
- People ahead
- Estimated wait
- Estimated service window
- Recommended arrival
- Readiness
- Check-in eligibility

## 23.3 After check-in

The customer is physically present and eligible for queue selection according to status and ordering.

## 23.4 When called

The UI should indicate the customer's turn.

## 23.5 During service

The UI should not continue describing the customer as waiting.

## 23.6 After completion

The customer should see a completed state and any review eligibility.

## 23.7 If cancelled, skipped or no-show

The customer should see the correct terminal outcome rather than a live ETA.

## 23.8 Multiple organizations

A customer can have bookings at multiple organizations.

Customer-facing schedule/dashboard views should aggregate their own appointments across organizations, not depend solely on one selected tenant.

This was a major later frontend architecture improvement.

---

# 24. Reviews and Feedback

A completed service may become review-eligible.

Established rules include:

- Review belongs to an appointment.
- Customer must own the appointment.
- Appointment must be completed.
- One review per appointment.
- Rating is constrained to 1–5.
- Reviews are organization/provider related.
- Public representations must protect private information.

An appointment marked NO_SHOW, SKIPPED or CANCELLED must not be treated as successfully serviced merely to enable a review.

A separate issue-reporting mechanism may be used for service complaints; do not conflate it with an ordinary completed-service review.

The later business-truth work also established that organizations with zero reviews must not display fabricated ratings.

Zero reviews should display an appropriate empty rating such as `—` and `0 reviews`.

---

# 25. End-to-End Operational Scenarios

## Scenario 1 — Normal online booking

1. Customer selects service/provider/date.
2. Backend validates eligibility and capacity.
3. Appointment is created.
4. Serial is assigned.
5. QueueEntry is created in WAITING.
6. Customer receives confirmation and estimate.
7. On appointment date, customer checks in.
8. Provider calls customer.
9. Provider starts service.
10. Provider completes service.
11. Customer may review.

**Expected result:** COMPLETED appointment and queue, no duplicate serial.

## Scenario 2 — Customer books tomorrow

1. Customer books tomorrow.
2. Serial is assigned now.
3. QueueEntry exists now.
4. Customer sees NOT_YET readiness.
5. Live wait is not falsely calculated from today's queue.
6. Customer cannot use ordinary today-only check-in before the eligible date.

**Expected result:** Future booking remains valid without appearing in today's active queue.

## Scenario 3 — Customer arrives early

1. Serial 5 arrives before Serial 3.
2. Serial 5 checks in.
3. Serial 3 later checks in.
4. Normal order remains Serial 3 before Serial 5.

**Expected result:** Presence does not override serial fairness.

## Scenario 4 — Earlier serial absent

1. Serial 1 is absent.
2. Serial 2 is checked in.
3. Provider presses Call Next.
4. Serial 2 is selected.

**Expected result:** Absent serial does not block operational progress.

## Scenario 5 — Late customer arrives during another consultation

1. Serial 1 was absent.
2. Serial 2 entered IN_PROGRESS.
3. Serial 1 arrives.
4. Serial 2's active service continues.
5. Serial 1's subsequent eligibility depends on whether they remain WAITING or were finalized as NO_SHOW.

**Expected result:** No interruption of active service; restoration policy must be explicit.

## Scenario 6 — Walk-in arrives

1. Staff registers walk-in.
2. Backend allocates next serial.
3. Walk-in is checked in.
4. Entry joins same provider queue.

**Expected result:** No separate walk-in priority.

## Scenario 7 — Urgent customer

1. Authorized actor marks checked-in Serial 8 urgent.
2. Audit information is recorded.
3. Effective waiting order prioritizes urgent Serial 8.
4. Active consultation remains protected.

**Expected result:** Controlled priority override, no arbitrary customer self-prioritization.

## Scenario 8 — Customer called but absent

1. Entry becomes CALLED.
2. Customer does not respond.
3. Authorized operator uses supported skip action.
4. Entry becomes SKIPPED.
5. Appointment may become NO_SHOW under current implementation.

**Expected result:** Not COMPLETED; no service falsely recorded.

## Scenario 9 — Provider calls but forgets Start

1. Entry remains CALLED.
2. No actual consultation start timestamp exists.
3. Queue may remain blocked until resolved.

**Expected result:** Explicit operator resolution; no fabricated service start.

**POLICY PENDING:** Recall, timeout, and correction workflow.

## Scenario 10 — Provider starts but forgets Complete

1. Entry remains IN_PROGRESS.
2. ETA uses active consultation information.
3. Other customers may remain delayed.
4. System must not assume completion based only on expected duration.

**POLICY PENDING:** Overdue-session alerts and correction authority.

## Scenario 11 — Customer cancels before service

1. Authorized cancellation occurs.
2. Appointment and QueueEntry become cancelled consistently.
3. Entry is excluded from Call Next.

**Expected result:** No ghost queue entry.

## Scenario 12 — Customer reschedules

1. Validate destination date/provider eligibility.
2. Validate capacity.
3. Allocate destination serial.
4. Update appointment and queue atomically.

**KNOWN ISSUE:** Destination capacity check is missing in the current audited implementation.

## Scenario 13 — Provider unavailable

1. Customer has valid booking.
2. Provider cannot serve.
3. Customer should not automatically become NO_SHOW.

**POLICY PENDING:** Provider cancellation, reassignment, notification and reschedule handling.

## Scenario 14 — Consultation crosses midnight

1. Consultation starts before midnight.
2. It remains legitimately IN_PROGRESS after midnight.
3. Historical cleanup must not silently mark it NO_SHOW.

**KNOWN ISSUE F08:** Current reconciliation may incorrectly terminate such sessions.

## Scenario 15 — Service completed

1. Authorized completion action succeeds.
2. Appointment and QueueEntry synchronize.
3. Customer exits live queue.
4. Review eligibility is evaluated.

**Expected result:** Completed service is recorded exactly once.

## Scenario 16 — Customer has two bookings at different organizations

1. Customer books Organization A.
2. Customer books Organization B.
3. Each organization/provider/date maintains independent serials.
4. Customer dashboard displays both own bookings.
5. Customer cannot see other customers' private information.

**Expected result:** Global customer account, tenant-isolated operations.

## Scenario 17 — Two customers book concurrently

1. Two booking requests target the same provider/date.
2. Provider lock serializes allocation.
3. Database uniqueness protects duplicate serials.
4. Both successful bookings receive distinct serials.

**Expected result:** No duplicate provider/date/serial.

PostgreSQL concurrency testing should confirm this under realistic simultaneous requests.

## Scenario 18 — Customer is skipped and later returns

1. Customer is SKIPPED/NO_SHOW.
2. Customer requests to rejoin.
3. Existing code must be inspected for a supported restore transition.

**POLICY PENDING:** Do not invent restoration behavior or create a new serial automatically.

## Scenario 19 — Appointment date passes without service

A historical unserved entry must no longer appear as an ordinary active waiting appointment.

However, the reconciliation policy must distinguish:

- Truly abandoned/unserved appointments
- Already completed/cancelled records
- Legitimate overnight IN_PROGRESS sessions
- Records requiring operator review

**KNOWN ISSUE:** Current broad read-triggered reconciliation does not safely handle every distinction.

## Scenario 20 — Provider custom duration differs from service default

1. Service base duration is 15 minutes.
2. Provider assignment duration is 25 minutes.
3. Capacity uses the effective 25-minute workload.
4. ETA should also use 25 minutes.

**KNOWN ISSUE F10:** Current ETA may use 15 minutes in some calculations.

---

# 26. Critical Business Invariants

These are the principles future changes must preserve.

1. QueueTurn is serial-first, not fixed-slot-first.
2. Serial belongs to provider + business date.
3. Booking allocates serial; check-in does not allocate a new one.
4. Appointment and QueueEntry are created consistently.
5. One provider/date/serial combination must be unique.
6. One appointment must not have multiple active QueueEntries.
7. Booking channels share the same provider queue.
8. Walk-ins receive the next valid serial.
9. Early check-in does not overtake lower eligible serials.
10. Urgent priority requires authorization.
11. Call Next selects eligible checked-in waiting entries.
12. ETA and Call Next must use compatible effective ordering.
13. An active consultation is not automatically complete after its expected duration.
14. CALLED is distinct from IN_PROGRESS.
15. IN_PROGRESS is distinct from COMPLETED.
16. SKIPPED/NO_SHOW is not COMPLETED.
17. Cancellation must synchronize appointment and queue state.
18. Rescheduling must enforce destination eligibility and capacity.
19. Future appointments must not show today's live readiness.
20. Past appointments must not show sliding current-time ETA.
21. Legitimate overnight consultations must not be prematurely terminated.
22. Customer data must remain private.
23. Tenant management operations must remain organization-scoped.
24. Booking prices and contact snapshots must preserve booking-time truth.
25. Customer-facing estimated times are forecasts, not guarantees.
26. Recommended arrival is separate from estimated service start.
27. A read/poll operation should not silently cause unsafe cross-tenant business-state mutations.
28. Backend permissions are authoritative.
29. No arbitrary frontend-supplied price, serial, urgency or role may override server-side rules.
30. Do not introduce unnecessary infrastructure to solve ordinary domain-logic problems.

---

# 27. Known Source-Audit Findings — October 8, 2026

These findings must be included in the Project Brain as **known issues**, not documented as resolved.

| ID | Finding | Priority |
|---|---|---|
| F01 | Public serializers expose private verification-document information | P0 |
| F02 | ProviderDocument endpoints use an incorrect relationship name | P1 |
| F03 | Provider leave reasons are readable outside intended tenant roles | P1 |
| F04 | Inactive provider-applicant permission conflicts with application submission | P1 |
| F05 | Analytics URL/handler signatures mismatch | P1 |
| F06 | Rescheduling bypasses destination date capacity | P1 |
| F07 | Potential stale-state race during cancellation/rescheduling | P1 |
| F08 | Historical queue reconciliation can terminate overnight IN_PROGRESS work | P1 |
| F09 | Same-day and partial-leave capacity can be overstated | P2 |
| F10 | ETA uses base duration instead of provider-specific effective duration | P2 |
| F11 | Email callers ignore send-result failures | P2 |
| F12 | Dependency declarations omit or disagree on required packages | P1 |
| F13 | Legacy dynamic redirects retain literal route placeholders | P2 |
| F14 | Public service detail lacks the same organization approval gate | P1 |
| F15 | Invalid provider registration may persist a partial user account | P2 |

These findings came from source analysis. Not every risk was reproduced under live PostgreSQL concurrency or browser QA.

The earlier email incident was resolved by stopping a stale Django server process; that incident does not invalidate F11's separate observability concern.

---

# 28. Policies That Must Be Finalized Before Further Lifecycle Changes

The following questions must be answered explicitly before introducing new queue states or automatic transitions.

## Customer absence

- When is an absent customer considered a final NO_SHOW?
- Is there a grace period?
- Can staff recall a customer?
- Can a skipped customer rejoin?
- Does rejoining retain the original serial priority?
- Is manager approval required?

## Provider delay

- What happens when a provider starts late?
- Is the queue paused?
- Can staff update the expected delay?
- What if the provider becomes unavailable for the whole day?

## Called but not started

- Can CALLED remain indefinitely?
- Can another customer be called?
- Does the system need Recall or Release Call?
- Should the customer receive another notification?

## Service interruption

- Can IN_PROGRESS be paused?
- Can it be cancelled after service starts?
- Is partial service recorded?
- Can an operator correct mistaken completion?

## Overnight service

- Can a consultation legitimately cross midnight?
- Which queue date owns it?
- How should next-day reconciliation handle it?
- Should active overnight sessions be excluded from ordinary stale cleanup?

## Booking/capacity

- What is the exact same-day remaining-capacity policy?
- How should partial leave affect capacity?
- What is the latest allowed booking time?
- Can an appointment be reassigned to another provider?

## Arrival guidance

- What is the authoritative lead buffer?
- Are readiness thresholds position-based, minute-based, or combined?
- What is the policy when ETA moves earlier than a customer's travel time?
- Should recommended arrival ever be presented as a hard check-in restriction?

These are business decisions, not merely coding decisions.

---

# 29. Current Architecture and Technical Boundaries

Historical/current audited stack:

- Django + Django REST Framework
- PostgreSQL
- React + Vite
- JWT authentication
- Organization membership-based tenancy
- Resend transactional email
- HTTP polling for queue updates

The application currently favors a straightforward backend service architecture.

Do not introduce without explicit justification:

- Redis
- Celery
- WebSockets
- Docker
- Kubernetes
- Microservices
- AI-based ETA
- SMS
- Payment gateways
- New global frontend state libraries

Current local project directory remains:

`D:\SmartQueue`

The product is named QueueTurn, but some legacy technical identifiers intentionally remain.

Do not rename:

- `smartqueue_db`
- `smartqueue_theme`
- `SMARTQUEUE_SUPPORT_EMAIL`
- `smartqueue_verified`
- `get_smartqueue_verified`
- `isSmartQueueVerified`
- `HowSmartQueueWorks`
- `WhySmartQueue`
- `why-smartqueue`
- Existing `sq_*` storage keys
- Existing `sq-*` CSS identifiers
- `SMARTQUEUE_PROJECT_PLAN.md` filename

The SmartQueue → QueueTurn visible-brand rename is complete and independently verified.

---

# 30. Important Code Areas to Inspect

The following files are important starting points, based on the October 8 source audit.

## Backend

- `backend/apps/appointments/models.py`
- `backend/apps/appointments/services.py`
- `backend/apps/appointments/serializers.py`
- `backend/apps/appointments/views.py`
- `backend/apps/queue/models.py`
- `backend/apps/queue/services.py`
- `backend/apps/queue/views.py`
- `backend/apps/providers/models.py`
- `backend/apps/providers/services.py`
- `backend/apps/providers/permissions.py`
- `backend/apps/providers/views.py`
- `backend/apps/services/models.py`
- `backend/apps/organizations/models.py`
- `backend/apps/organizations/permissions.py`
- `backend/apps/notifications/`
- `backend/apps/analytics/`
- `backend/apps/audit/`
- `backend/apps/feedback/`

## Frontend

- `frontend/src/routes/AppRoutes.jsx`
- `frontend/src/pages/customer/BookAppointmentPage.jsx`
- `frontend/src/pages/customer/CustomerLiveQueuePage.jsx`
- `frontend/src/pages/customer/CustomerAppointmentsPage.jsx`
- `frontend/src/pages/customer/CustomerAppointmentDetailPage.jsx`
- `frontend/src/pages/portals/CustomerDashboard.jsx`
- `frontend/src/pages/portals/ProviderDashboard.jsx`
- `frontend/src/pages/portals/StaffDashboard.jsx`
- `frontend/src/pages/portals/ManagerDashboard.jsx`
- `frontend/src/pages/provider/`
- `frontend/src/pages/staff/`
- `frontend/src/pages/manager/`
- `frontend/src/services/`
- `frontend/src/utils/queueDisplay.js`

File names/paths should be checked against the actual latest repository.

---

# 31. Recommended Next Development Sequence

The next step is **not** an immediate queue rewrite.

A Codex task titled:

**QueueTurn — Business Rule Baseline & Fix Impact Assessment**

has already been submitted by the user.

When its report becomes available:

1. Compare the report with this handoff.
2. Identify current implementation truth.
3. Identify conflicts between intended policy and code.
4. Separate confirmed bugs from undecided business rules.
5. Establish the final permission/action matrix.
6. Establish the final appointment/queue state-transition matrix.
7. Establish the ETA and arrival-guidance formulas.
8. Establish late/skip/no-show/provider-unavailable policies.
9. Prioritize security and lifecycle fixes.
10. Prepare the QueueTurn Project Brain from verified information.

Suggested Project Brain:

```text
AGENTS.md
docs/
  PRODUCT_ARCHITECTURE.md
  BUSINESS_RULES.md
  QUEUE_STATE_MACHINE.md
  ROLE_PERMISSION_MATRIX.md
  UI_DESIGN_SYSTEM.md
  UI_REDESIGN_PLAYBOOK.md
  UI_AUDIT_PLAN.md
  KNOWN_ISSUES.md
```

The exact file structure may be adjusted after reviewing the current repository, but the business-rule baseline must not be lost.

---

# 32. Rules for Future Codex Implementation

Before changing lifecycle code:

- Inspect the current implementation.
- State the business invariant being preserved.
- Identify all affected models/services/serializers/views/frontend consumers.
- Identify role and tenant boundaries.
- Identify status transition effects.
- Identify ETA/readiness effects.
- Identify cancellation/reschedule/no-show consequences.
- Identify historical-data and overnight-session consequences.
- Add focused tests for changed behavior.
- Avoid unrelated refactoring.
- Do not run broad suites without a justified need.
- Do not alter migrations unless schema changes are necessary and approved.
- Do not use destructive Git commands.
- Do not commit/push unless explicitly requested.

**Most important instruction:**

QueueTurn's business truth must be defined by the intended serial-based operational model, checked against actual source behavior, and corrected carefully where the source violates that model.

Never silently convert a known bug into a documented business rule.

---

# 33. Final Summary for the New Assistant

QueueTurn is a multi-tenant, serial-based appointment and live queue platform.

The central idea is:

**A customer books a provider/date serial, not a fixed consultation slot.**

The backend manages provider availability, workload capacity, atomic serial allocation, unified booking channels, physical check-in, urgent-aware service ordering, operational lifecycle transitions, dynamic ETA, recommended arrival guidance, and role-based tenant operations.

The accepted operational flow is:

**Discover → Select Service/Provider/Date → Book Serial → Receive Forecast → Arrive/Check In → Wait → Called → Service Started → Completed → Review**

Alternative outcomes include cancellation, skipped/no-show and rescheduling.

However, several critical edge cases remain unresolved or incorrectly implemented, particularly:

- Late and skipped customers returning
- Called-but-not-started sessions
- Provider absence or service interruption
- Overnight IN_PROGRESS sessions
- Reschedule capacity
- Concurrent lifecycle changes
- Provider-specific ETA duration
- Partial-day availability

The next assistant must preserve the serial-first architecture, distinguish intended policy from implemented behavior, and use the pending Codex Business Rule Baseline & Fix Impact Assessment to establish a verified foundation before further fixes or Project Brain documentation.

**End of QueueTurn Business Rules Handoff.**