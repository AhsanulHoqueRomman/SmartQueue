/**
 * Pure display mapping for QueueTurn appointment and queue lifecycle statuses.
 * Provides deterministic tone resolution, human-readable labels, legacy class names,
 * and accessible descriptions without JSX or DOM dependencies.
 */

export const APPOINTMENT_STATUS_MAP = Object.freeze({
  PENDING: { label: 'Pending', tone: 'pending', legacyClass: 'status-pending' },
  CONFIRMED: { label: 'Confirmed', tone: 'confirmed', legacyClass: 'status-confirmed' },
  CHECKED_IN: { label: 'Checked In', tone: 'in_progress', legacyClass: 'status-in_progress' },
  IN_PROGRESS: { label: 'In Progress', tone: 'in_progress', legacyClass: 'status-in_progress' },
  COMPLETED: { label: 'Completed', tone: 'completed', legacyClass: 'status-completed' },
  CANCELLED: { label: 'Cancelled', tone: 'cancelled', legacyClass: 'status-cancelled' },
  NO_SHOW: { label: 'No Show', tone: 'no_show', legacyClass: 'status-no_show' },
  ACTIVE: { label: 'Active', tone: 'in_progress', legacyClass: 'status-in_progress' },
  INACTIVE: { label: 'Inactive', tone: 'no_show', legacyClass: 'status-no_show' },
});

export const QUEUE_STATUS_MAP = Object.freeze({
  WAITING: { label: 'Waiting', tone: 'pending', legacyClass: 'status-pending' },
  CALLED: { label: 'Called', tone: 'in_progress', legacyClass: 'status-in_progress' },
  IN_PROGRESS: { label: 'In Progress', tone: 'in_progress', legacyClass: 'status-in_progress' },
  COMPLETED: { label: 'Completed', tone: 'completed', legacyClass: 'status-completed' },
  SKIPPED: { label: 'Skipped', tone: 'cancelled', legacyClass: 'status-cancelled' },
});

export const FALLBACK_STATUS = Object.freeze({
  label: 'Unknown',
  tone: 'neutral',
  legacyClass: 'status-no_show',
});

/**
 * Resolves status presentation configuration.
 *
 * @param {string|null|undefined} status - The raw status string from backend.
 * @param {'appointment'|'queue'} [type='appointment'] - Lifecycle domain.
 * @param {string|null} [customLabel=null] - Optional override label (e.g. from queueDisplay).
 * @returns {{ label: string, tone: string, badgeClass: string, accessibleText: string }}
 */
export function getStatusPresentation(status, type = 'appointment', customLabel = null) {
  if (status == null || status === '') {
    const fallbackLabel = customLabel || FALLBACK_STATUS.label;
    return {
      label: fallbackLabel,
      tone: FALLBACK_STATUS.tone,
      badgeClass: FALLBACK_STATUS.legacyClass,
      accessibleText: `Status: ${fallbackLabel}`,
    };
  }

  const normalized = String(status).trim().toUpperCase();
  const map = type === 'queue' ? QUEUE_STATUS_MAP : APPOINTMENT_STATUS_MAP;
  const config = map[normalized];

  if (!config) {
    const rawLabel = customLabel || status;
    return {
      label: rawLabel,
      tone: FALLBACK_STATUS.tone,
      badgeClass: FALLBACK_STATUS.legacyClass,
      accessibleText: `Status: ${rawLabel}`,
    };
  }

  const label = customLabel || config.label;
  const accessiblePrefix = type === 'queue' ? 'Queue status:' : 'Status:';

  return {
    label,
    tone: config.tone,
    badgeClass: config.legacyClass,
    accessibleText: `${accessiblePrefix} ${label}`,
  };
}

export default getStatusPresentation;
