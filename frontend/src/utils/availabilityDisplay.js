export function matchesWorkingWindow(data, preference) {
  if (preference === 'ANY') return true;
  if (!data.start_time || !data.end_time) return false;
  const minutes = value => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
  const range = { MORNING: [480, 720], AFTERNOON: [720, 1020], EVENING: [1020, 1260] }[preference];
  if (!range) return false;
  return minutes(data.start_time) < range[1] && minutes(data.end_time) > range[0];
}

/**
 * Maps availability API errors to safe, user-friendly customer messages.
 * Never exposes internal stack traces or instructs customers to retry the date
 * when the issue is provider configuration or permissions.
 *
 * @param {Error|Object} error - Axios error object from availability check
 * @returns {string} Customer-facing guidance message
 */
export function formatAvailabilityError(error) {
  if (!error) {
    return 'Unable to check availability for this selection. Please try again or choose another date or professional.';
  }

  // Network / transport errors without server response
  if (!error.response) {
    if (error.code === 'ERR_NETWORK' || error.message?.toLowerCase().includes('network') || error.request) {
      return 'Network connection issue. Please check your connection and try again.';
    }
    return 'Unable to check availability for this selection. Please try again or choose another date or professional.';
  }

  const { status, data } = error.response;
  const errorCode = data?.error?.code || (typeof data?.code === 'string' ? data.code : null);

  if (errorCode === 'PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED') {
    return 'This professional is temporarily unavailable for online booking because their service duration settings are incomplete. Please choose another professional or contact the organization.';
  }
  if (errorCode === 'OUTSIDE_BOOKING_WINDOW') {
    return 'Appointments can only be booked for today or one of the next three dates.';
  }
  if (errorCode === 'PROVIDER_SERVICE_NOT_ASSIGNED') {
    return 'This professional is not assigned to the selected service. Please choose another professional.';
  }
  if (errorCode === 'PROVIDER_EMERGENCY') {
    return 'This professional is temporarily unavailable on this date due to an operational hold.';
  }
  if (errorCode === 'ORGANIZATION_NOT_FOUND' || errorCode === 'PROVIDER_NOT_FOUND' || errorCode === 'SERVICE_NOT_FOUND') {
    return 'The requested booking details could not be found. Please refresh your selections.';
  }

  // HTTP status code fallbacks
  if (status === 401 || status === 403) {
    return 'You do not have permission to check availability for this professional.';
  }
  if (status === 404) {
    return 'Availability information is not available for this selection.';
  }
  if (status >= 500) {
    return 'The service is temporarily unavailable. Please try again shortly.';
  }

  return 'Unable to check availability for this selection. Please try again or choose another date or professional.';
}
