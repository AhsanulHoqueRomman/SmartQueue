import React from 'react';
import { getStatusPresentation } from '../utils/statusDisplay';
import '../styles/OperationalPrimitives.css';

/**
 * StatusBadge component.
 * Renders an accessible, token-aware status indicator pill for appointment,
 * queue, and role states with a colored indicator dot and readable text.
 *
 * @param {Object} props
 * @param {string} [props.status] - Raw status string (e.g. 'CONFIRMED', 'WAITING').
 * @param {'appointment'|'queue'} [props.type='appointment'] - Lifecycle domain.
 * @param {string} [props.customLabel] - Optional custom display label.
 */
export const StatusBadge = ({ status, type = 'appointment', customLabel }) => {
  if (!status && !customLabel) return null;

  const { label, tone, badgeClass, accessibleText } = getStatusPresentation(status, type, customLabel);

  return (
    <span
      className={`status-badge ${badgeClass} qt-status-badge qt-status-badge--${tone}`}
      aria-label={accessibleText}
      title={label}
    >
      <span className="status-badge-dot qt-status-badge__dot" aria-hidden="true" />
      <span className="qt-status-badge__label">{label}</span>
    </span>
  );
};

export default StatusBadge;
