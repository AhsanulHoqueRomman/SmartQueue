/**
 * Unified Customer Queue Presentation Model
 * Ensures Dashboard, Homepage Live Queue Preview, My Appointments,
 * Appointment Details, Live Telemetry, and Notifications display ONE consistent,
 * customer-friendly lifecycle truth and human vocabulary.
 */
export function getNormalizedCustomerQueueState(appointment, queueEntry = null) {
  const qEntry = queueEntry || appointment?.queue_entry;
  const isFuture = appointment?.temporal_classification === 'future';
  const rawStatus = isFuture
    ? (appointment?.status || 'CONFIRMED')
    : (qEntry?.status || appointment?.status || 'CONFIRMED');

  const isCheckedIn = Boolean(
    qEntry?.is_checked_in ||
    appointment?.is_checked_in ||
    ['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(rawStatus)
  );

  const readinessInfo = qEntry?.readiness_info || {};
  const isDelayed = Boolean(readinessInfo.is_delayed);
  const peopleAhead = qEntry
    ? (readinessInfo.people_ahead ?? 0)
    : (appointment?.queue_entry?.readiness_info?.people_ahead ?? 0);
  const nowServing = readinessInfo.now_serving_serial || null;

  let displayStatus = 'Booked';
  let statusTone = 'info'; // 'info' | 'success' | 'warning' | 'neutral' | 'danger'
  let headline = 'Scheduled Consultation';
  let guidance = 'Your appointment serial number is secured.';
  let secondaryStatus = null;
  let readinessState = isFuture ? 'NOT_YET' : (readinessInfo.readiness_state || 'NOT_YET');

  if (isFuture) {
    displayStatus = 'Booked';
    statusTone = 'info';
    headline = 'Scheduled Future Date';
    guidance = `Your serial #${appointment?.serial_number || '—'} is secured for ${appointment?.appointment_date || 'your appointment date'}.`;
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
    if (isDelayed && peopleAhead === 0) {
      displayStatus = "Provider hasn't started yet";
      statusTone = 'warning';
      secondaryStatus = 'Running behind schedule';
      headline = "Provider Hasn't Started Yet";
      guidance = "You're checked in and first in line. Stay nearby — we'll update you when service begins.";
    } else if (isDelayed) {
      displayStatus = 'Checked in';
      statusTone = 'warning';
      secondaryStatus = 'Running behind schedule';
      headline = 'Queue Running Behind Schedule';
      guidance = `You're checked in with ${peopleAhead} ${peopleAhead === 1 ? 'person' : 'people'} ahead. Please remain nearby.`;
    } else if (peopleAhead === 0) {
      displayStatus = "You're next";
      statusTone = 'warning';
      headline = 'You Are First in Line';
      guidance = "You're checked in. Please remain near the waiting room door.";
    } else if (peopleAhead <= 2) {
      displayStatus = 'Get ready';
      statusTone = 'warning';
      headline = 'Turn Approaching';
      guidance = `There ${peopleAhead === 1 ? 'is 1 person' : `are ${peopleAhead} people`} ahead of you. Get ready for your turn.`;
    } else {
      displayStatus = 'Checked in';
      statusTone = 'info';
      headline = 'Checked In at Venue';
      guidance = `You are checked in and in line. ${peopleAhead} people ahead.`;
    }
  } else {
    // Scheduled today, not checked in yet
    displayStatus = 'Booked';
    statusTone = 'info';
    headline = 'Pending Check-In';
    guidance = 'Please check in upon physical arrival at the venue to enter the live queue.';
  }

  return {
    rawStatus,
    displayStatus,
    secondaryStatus,
    statusTone,
    headline,
    guidance,
    serialNumber: appointment?.serial_number || qEntry?.token_number || '—',
    nowServing,
    peopleAhead: (rawStatus === 'CALLED' || rawStatus === 'IN_PROGRESS') ? 0 : peopleAhead,
    isDelayed,
    isCheckedIn,
    readinessState,
    isFuture,
    isTerminal: ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(rawStatus),
    estimatedStartTime: readinessInfo.estimated_start_time || appointment?.start_datetime,
    estimatedEndTime: readinessInfo.estimated_end_time || appointment?.end_datetime,
    recommendedArrivalTime: isCheckedIn ? null : readinessInfo.recommended_arrival_time,
  };
}

export default getNormalizedCustomerQueueState;
