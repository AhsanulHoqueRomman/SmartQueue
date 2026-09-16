/**
 * Utility to extract user-friendly error messages from API responses.
 * Safely handles:
 * - SmartQueue custom exception format: { error: { code, message, details } }
 * - Standard DRF detail format: { detail: "..." }
 * - Field error object: { field_name: ["error message"] }
 * - Plain string responses
 * 
 * Never returns "[object Object]".
 * 
 * @param {Error|Object} err - Axios error object or API response
 * @param {string} fallback - Default fallback message
 * @returns {string} Human-readable error message
 */
export function formatApiError(err, fallback = 'An error occurred. Please try again.') {
  if (!err) return fallback;

  const data = err.response?.data;
  if (!data) {
    return err.message || fallback;
  }

  // If response is a plain string
  if (typeof data === 'string') {
    return data;
  }

  // SmartQueue custom exception handler shape: { error: { code, message, details } }
  if (data.error && typeof data.error === 'object') {
    const { message, details } = data.error;

    // Check if details contain specific field validation errors
    if (details && typeof details === 'object' && Object.keys(details).length > 0) {
      const fieldMsgs = Object.entries(details)
        .map(([field, msgs]) => {
          const formattedField = field.replace(/_/g, ' ');
          const valStr = Array.isArray(msgs)
            ? msgs.join(' ')
            : typeof msgs === 'object'
            ? JSON.stringify(msgs)
            : String(msgs);
          return `${formattedField}: ${valStr}`;
        })
        .join(' | ');
      if (fieldMsgs) return fieldMsgs;
    }

    if (message && typeof message === 'string') {
      return message;
    }
  }

  // Standard DRF detail string
  if (data.detail && typeof data.detail === 'string') {
    return data.detail;
  }

  // Standard DRF error string
  if (data.error && typeof data.error === 'string') {
    return data.error;
  }

  // General field error dict shape: { email: ["Already exists"], slug: ["Required"] }
  if (typeof data === 'object') {
    const entries = Object.entries(data).filter(([_, v]) => v !== undefined && v !== null);
    if (entries.length > 0) {
      const msgs = entries
        .map(([field, value]) => {
          if (field === 'error' && typeof value === 'object') {
            return formatApiError({ response: { data: { error: value } } }, fallback);
          }
          const formattedField = field.replace(/_/g, ' ');
          const valStr = Array.isArray(value)
            ? value.join(' ')
            : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
          return `${formattedField}: ${valStr}`;
        })
        .join(' | ');

      if (msgs && msgs !== '[object Object]') {
        return msgs;
      }
    }
  }

  return fallback;
}

export default formatApiError;
