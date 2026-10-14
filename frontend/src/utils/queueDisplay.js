import { bookingWindow } from './bookingWindow.js';
/**
 * Unified Customer Queue Presentation Model
 * Ensures Dashboard, Homepage Live Queue Preview, My Appointments,
 * Appointment Details, Live Telemetry, and Notifications display ONE consistent,
 * customer-friendly lifecycle truth and human vocabulary.
 */
export function getNormalizedCustomerQueueState(appointment, queueEntry = null) {
  const qEntry = queueEntry || appointment?.queue_entry;
  const emergency = appointment?.emergency || qEntry?.readiness_info?.emergency;
  const replaced = emergency?.resolution === 'RESCHEDULED';
  const isFuture = appointment?.temporal_classification === 'future';
  const localTodayStr = bookingWindow().first;
  const isLegitInProgress = (appointment?.status === 'IN_PROGRESS' || qEntry?.status === 'IN_PROGRESS');
  const isUnfinished = ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(qEntry?.status) || ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(appointment?.status);
  const historicalDate = appointment?.temporal_classification === 'past' || (appointment?.appointment_date && appointment.appointment_date < localTodayStr);
  const isPast = historicalDate && !isUnfinished;

  const rawStatus = replaced ? 'RESCHEDULED' : isFuture
    ? (appointment?.status || 'CONFIRMED')
    : (qEntry?.status || appointment?.status || 'CONFIRMED');

  // Authoritative physical presence check.
  // CRITICAL: Raw QueueEntry status "WAITING" does NOT imply physical presence.
  const rawCheckedIn = qEntry?.is_checked_in ?? appointment?.is_checked_in ?? false;
  const isCheckedIn = (
    typeof rawCheckedIn === 'string'
      ? rawCheckedIn.toLowerCase() === 'true'
      : Boolean(rawCheckedIn)
  ) || (rawStatus === 'CHECKED_IN');

  const readinessInfo = qEntry?.readiness_info || appointment?.queue_entry?.readiness_info || {};
  const isDelayed = Boolean(readinessInfo.is_delayed);
  const scheduledAhead = readinessInfo.scheduled_ahead ?? (qEntry ? (readinessInfo.people_ahead ?? 0) : 0);
  const checkedInAhead = readinessInfo.checked_in_ahead ?? 0;
  const peopleAhead = readinessInfo.people_ahead ?? null;
  const nowServing = readinessInfo.now_serving_serial || null;
  const providerHasStarted = Boolean(
    readinessInfo.provider_has_started ??
    (nowServing != null || isLegitInProgress || rawStatus === 'CALLED')
  );

  let displayStatus = 'Booked';
  let statusTone = 'info'; // 'info' | 'success' | 'warning' | 'neutral' | 'danger' | 'accent'
  let headline = 'Scheduled Consultation';
  let guidance = 'Your appointment serial number is secured.';
  let secondaryStatus = null;
  let readinessState = (isFuture || isPast)
    ? 'NOT_YET'
    : (rawStatus === 'IN_PROGRESS' ? 'IN_SERVICE' : (readinessInfo.readiness_state || 'NOT_YET'));
  let isUnresolved = false;
  let isMissed = false;
  if (rawStatus === 'CALLED') readinessState = 'TURN_NOW';
  else if (readinessState === 'TURN_NOW') readinessState = 'NOT_YET';

  const serialNum = appointment?.serial_number || qEntry?.serial_number || qEntry?.token_number || '—';

  const formatTimeStr = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const canCheckIn = !replaced && Boolean(qEntry?.can_check_in ?? readinessInfo.can_check_in ?? appointment?.can_check_in ?? false);
  const checkInAvailableAt = qEntry?.check_in_available_at || readinessInfo.check_in_available_at || appointment?.check_in_available_at;

  if (isFuture) {
    displayStatus = 'Booked';
    statusTone = 'info';
    headline = 'Scheduled Future Date';
    guidance = `Your serial #${serialNum} is secured for ${appointment?.appointment_date || 'your appointment date'}.`;
  } else if (historicalDate && isUnfinished && !['CALLED', 'IN_PROGRESS'].includes(rawStatus)) {
    displayStatus = 'Waiting';
    statusTone = 'info';
    headline = 'Unfinished Earlier Queue';
    guidance = 'Your original booking and serial remain valid. Please contact your organization for assistance; the calendar change does not mark you absent.';
  } else if (isPast) {
    if (rawStatus === 'COMPLETED') {
      displayStatus = 'Completed';
      statusTone = 'success';
      headline = 'Consultation Completed';
      guidance = 'Thank you for visiting. You can leave a review to share your feedback.';
    } else if (rawStatus === 'CANCELLED') {
      displayStatus = 'Cancelled';
      statusTone = 'danger';
      headline = 'Appointment Cancelled';
      guidance = appointment?.cancellation_reason || 'This appointment was cancelled.';
    } else if (rawStatus === 'NO_SHOW') {
      displayStatus = 'Missed';
      statusTone = 'danger';
      headline = 'Appointment Missed';
      guidance = 'You were absent when called. Please contact support or schedule a new consultation.';
      isMissed = true;
    } else if (rawStatus === 'SKIPPED') {
      displayStatus = 'Skipped';
      statusTone = 'warning';
      headline = 'Serial Skipped';
      guidance = 'Your turn was skipped during the queue session.';
    } else if (isCheckedIn) {
      displayStatus = 'Service outcome not recorded';
      statusTone = 'warning';
      headline = 'Service Outcome Not Recorded';
      guidance = 'You checked in, but QueueTurn does not have a final service outcome recorded for this appointment.';
      isUnresolved = true;
    } else {
      displayStatus = 'Missed';
      statusTone = 'danger';
      headline = 'Appointment Missed';
      guidance = 'You were not checked in before the attendance window closed for this past appointment.';
      isMissed = true;
    }
  } else if (rawStatus === 'COMPLETED') {
    displayStatus = 'Completed';
    statusTone = 'success';
    headline = 'Consultation Completed';
    guidance = 'Thank you for visiting. You can leave a review to share your feedback.';
  } else if (rawStatus === 'CANCELLED') {
    displayStatus = 'Cancelled';
    statusTone = 'danger';
    headline = 'Appointment Cancelled';
    guidance = appointment?.cancellation_reason || 'This appointment was cancelled.';
  } else if (rawStatus === 'NO_SHOW') {
    displayStatus = 'Missed';
    statusTone = 'danger';
    headline = 'Appointment Missed';
    guidance = 'You were absent when called. Please contact support or schedule a new consultation.';
    isMissed = true;
  } else if (rawStatus === 'SKIPPED') {
    displayStatus = 'Skipped';
    statusTone = 'warning';
    headline = 'Serial Skipped';
    guidance = 'Your turn was skipped. Please speak with clinic staff to reactivate your place in line.';
  } else if (rawStatus === 'IN_PROGRESS') {
    displayStatus = 'In consultation';
    statusTone = 'accent';
    headline = 'Currently in Consultation';
    guidance = 'Your service is currently underway with the specialist.';
  } else if (rawStatus === 'CALLED') {
    displayStatus = "It's your turn";
    statusTone = 'success';
    headline = 'You Have Been Called!';
    guidance = 'Please proceed directly to the provider consultation room now.';
  } else if (isCheckedIn) {
    if (!providerHasStarted && isDelayed && checkedInAhead === 0) {
      displayStatus = "Provider hasn't started yet";
      statusTone = 'warning';
      secondaryStatus = 'Running behind schedule';
      headline = "Provider Hasn't Started Yet";
      guidance = "You're checked in and first in line. Stay nearby — we'll update you when service begins.";
    } else if (isDelayed && (readinessState === 'BE_READY')) {
      displayStatus = 'Be ready';
      statusTone = 'warning';
      secondaryStatus = 'Running behind schedule';
      headline = 'Turn Approaching';
      guidance = "You're checked in. Service is running behind schedule; please remain nearby and follow queue updates.";
    } else if (isDelayed) {
      displayStatus = 'Checked in';
      statusTone = 'warning';
      secondaryStatus = 'Running behind schedule';
      headline = 'Queue Running Behind Schedule';
      guidance = `You're checked in with ${checkedInAhead} ${checkedInAhead === 1 ? 'person' : 'people'} checked in ahead of you. Please remain nearby.`;
    } else if (readinessState === 'BE_READY') {
      displayStatus = 'Be ready';
      statusTone = 'warning';
      headline = 'Turn Approaching';
      guidance = "You're checked in. Please remain near the waiting room door.";
    } else if (readinessState === 'GET_READY') {
      displayStatus = 'Get ready';
      statusTone = 'warning';
      headline = 'Turn Approaching';
      guidance = `There ${checkedInAhead === 1 ? 'is 1 checked-in person' : `are ${checkedInAhead} checked-in people`} ahead of you. Get ready for your turn.`;
    } else {
      displayStatus = 'Checked in';
      statusTone = 'info';
      headline = 'Checked In at Venue';
      guidance = `You are checked in and in line. ${checkedInAhead} ${checkedInAhead === 1 ? 'person' : 'people'} checked in ahead of you.`;
    }
  } else {
    // Scheduled today, not checked in yet (Awaiting Physical Arrival)
    const checkInTimeFormatted = formatTimeStr(checkInAvailableAt);
    const checkInNotice = checkInTimeFormatted ? ` Check-in opens around ${checkInTimeFormatted}.` : '';

    if (canCheckIn) {
      displayStatus = 'Check-in Available';
      statusTone = 'warning';
      headline = 'Check-In Available at Venue';
      guidance = 'Check in when you have physically arrived at the organization.';
    } else {
      displayStatus = 'Scheduled Today';
      statusTone = 'info';
      const isFirstSerial = Number(serialNum) === 1 || scheduledAhead === 0;
      headline = isFirstSerial ? 'First Scheduled Serial Today' : 'Scheduled Today (Awaiting Arrival)';
      guidance = isFirstSerial
        ? `Your serial #${serialNum} is reserved for today. Provider queue has not started yet.${checkInNotice}`
        : `Your serial #${serialNum} is reserved for today. Live queue forecast telemetry is active.${checkInNotice}`;
    }
  }

  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'RESCHEDULED'].includes(rawStatus) || isPast;
  const canOpenTelemetry = !isPast && !isUnresolved && !isFuture && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'RESCHEDULED'].includes(rawStatus);

  const timingReliable = emergency?.hold || replaced ? false : (readinessInfo.eta_reliable ?? Boolean(readinessInfo.estimated_start_time));
  const estimatedStartTime = rawStatus === 'IN_PROGRESS' || !timingReliable
    ? null : (readinessInfo.estimated_start_time ?? null);
  const estimatedEndTime = rawStatus === 'IN_PROGRESS'
    ? (readinessInfo.estimated_completion_at ?? readinessInfo.estimated_end_time ?? null)
    : (timingReliable ? (readinessInfo.estimated_end_time ?? null) : null);
  if (!isTerminal && !isFuture && !['CALLED', 'IN_PROGRESS'].includes(rawStatus) &&
      readinessInfo.queue_status_message) {
    headline = readinessInfo.queue_status_text || headline;
    guidance = readinessInfo.queue_status_message;
    if (isDelayed) { displayStatus = 'Running Behind Schedule'; statusTone = 'warning'; }
  }

  if (replaced) { displayStatus = 'Rescheduled after emergency'; headline = 'Replacement Booking Recorded'; guidance = 'Your original booking is preserved. View the linked replacement appointment.'; statusTone = 'info'; }
  else if (emergency?.hold) { displayStatus = 'Service interrupted'; headline = emergency.status_label; guidance = emergency.message; statusTone = 'warning'; }

  return {
    emergency,
    emergencyHold: Boolean(emergency?.hold),
    rawStatus,
    displayStatus,
    secondaryStatus,
    statusTone,
    headline,
    guidance,
    serialNumber: serialNum,
    serial_number: serialNum,
    nowServing,
    providerHasStarted,
    peopleAhead: (rawStatus === 'CALLED' || rawStatus === 'IN_PROGRESS') ? 0 : peopleAhead,
    scheduledAhead: (rawStatus === 'CALLED' || rawStatus === 'IN_PROGRESS') ? 0 : scheduledAhead,
    checkedInAhead: (rawStatus === 'CALLED' || rawStatus === 'IN_PROGRESS') ? 0 : checkedInAhead,
    canCheckIn,
    can_check_in: canCheckIn,
    checkInAvailableAt,
    isDelayed,
    isCheckedIn,
    readinessState,
    isFuture,
    isPast,
    isUnresolved,
    isMissed,
    isTerminal,
    can_open_telemetry: canOpenTelemetry,
    timingReliable,
    timingPlaceholder: readinessInfo.provider_activity_state === 'UNFINISHED_PREVIOUS_DATE'
      ? 'Updating after earlier queue is resolved'
      : (!providerHasStarted ? 'Updating after provider starts' : 'Timing is updating'),
    estimatedStartTime,
    estimatedEndTime,
    actualStartedAt: readinessInfo.actual_started_at || qEntry?.started_at || null,
    estimatedCompletionAt: readinessInfo.estimated_completion_at || null,
    remainingServiceMinutes: readinessInfo.remaining_service_minutes ?? null,
    recommendedArrivalTime: (isCheckedIn || rawStatus === 'IN_PROGRESS' || rawStatus === 'CALLED') ? null : (timingReliable ? readinessInfo.recommended_arrival_time : null),
  };
}

export default getNormalizedCustomerQueueState;
