import React from 'react';

export const StatusBadge = ({ status, type = 'appointment', customLabel }) => {
  if (!status) return null;

  const normalized = String(status).toUpperCase();

  let badgeClass = 'status-no_show';
  let label = customLabel || status;

  if (type === 'queue') {
    switch (normalized) {
      case 'WAITING':
        badgeClass = 'status-pending';
        label = customLabel || 'Waiting';
        break;
      case 'CALLED':
        badgeClass = 'status-in_progress';
        label = customLabel || 'Called';
        break;
      case 'IN_PROGRESS':
        badgeClass = 'status-in_progress';
        label = customLabel || 'In Progress';
        break;
      case 'COMPLETED':
        badgeClass = 'status-completed';
        label = customLabel || 'Completed';
        break;
      case 'SKIPPED':
        badgeClass = 'status-cancelled';
        label = customLabel || 'Skipped';
        break;
      default:
        badgeClass = 'status-no_show';
    }
  } else {
    switch (normalized) {
      case 'PENDING':
        badgeClass = 'status-pending';
        label = customLabel || 'Pending';
        break;
      case 'CONFIRMED':
        badgeClass = 'status-confirmed';
        label = customLabel || 'Confirmed';
        break;
      case 'CHECKED_IN':
        badgeClass = 'status-in_progress';
        label = customLabel || 'Checked In';
        break;
      case 'IN_PROGRESS':
        badgeClass = 'status-in_progress';
        label = customLabel || 'In Progress';
        break;
      case 'COMPLETED':
        badgeClass = 'status-completed';
        label = customLabel || 'Completed';
        break;
      case 'CANCELLED':
        badgeClass = 'status-cancelled';
        label = customLabel || 'Cancelled';
        break;
      case 'NO_SHOW':
        badgeClass = 'status-no_show';
        label = customLabel || 'No Show';
        break;
      case 'ACTIVE':
        badgeClass = 'status-in_progress';
        label = customLabel || 'Active';
        break;
      default:
        badgeClass = 'status-no_show';
    }
  }

  return (
    <span className={`status-badge ${badgeClass}`}>
      <span className="status-badge-dot"></span>
      {label}
    </span>
  );
};

export default StatusBadge;
