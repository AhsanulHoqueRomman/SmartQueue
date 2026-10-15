import { EmergencyNotice } from './EmergencyNotice';
import { formatBookingDate } from '../utils/homeBookingDisplay.js';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { getNormalizedCustomerQueueState } from '../utils/queueDisplay';
import '../styles/CustomerBookingCard.css';

export function CustomerBookingCard({ item, onCheckIn, checkingInId }) {
  const navigate = useNavigate();

  if (!item) return null;

  const apptId = item.id;
  const qEntry = item.queue_entry;
  const qId = qEntry?.id;
  const qState = getNormalizedCustomerQueueState(item, qEntry);
  const qStatus = qState.rawStatus;

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const estStartStr = formatTime(qState.estimatedStartTime);
  const estEndStr = formatTime(qState.estimatedEndTime);
  const recArrivalStr = formatTime(qState.recommendedArrivalTime);
  const nowServingSerial = qState.nowServing;

  const readinessConfig = {
    TURN_NOW: { label: 'Your Turn', bg: 'var(--color-success-light)', color: 'var(--color-success)', border: 'var(--color-success)', note: 'Please proceed inside' },
    BE_READY: { label: 'Be Ready', bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)', note: 'You are next in line' },
    GET_READY: { label: 'Get Ready', bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)', note: 'Turn approaching soon' },
    NOT_YET: { label: 'Not Yet', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-text-subtle)', border: 'var(--lp-border)', note: 'Relaxed waiting' },
  }[qState.readinessState] || { label: 'Scheduled', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: 'var(--lp-border)', note: '' };

  const isLive = qState.can_open_telemetry;
  const isTerminal = qState.isTerminal;
  const canCheckIn = qState.canCheckIn;
  const isCheckingIn = checkingInId === item.id;

  return (
    <div className="qt-booking-card animate-section">
      <div className="qt-booking-card__content">
        {/* Header: Organization & Category Badge */}
        <div className="qt-booking-card__header">
          <div className="qt-booking-card__identity">
            <span className="qt-booking-card__org-meta">
              {item.organization_category || 'CLINIC'} &bull; {item.organization_name}
            </span>
            <h3 className="qt-booking-card__service-title">
              {item.service_name || 'Service Consultation'}
            </h3>
          </div>
          <div className="qt-booking-card__badge-wrapper">
            <StatusBadge status={qState.rawStatus} customLabel={qState.displayStatus} />
          </div>
        </div>

        {/* Subheader: Provider & Category */}
        <div className="qt-booking-card__provider-meta">
          <span className="qt-booking-card__provider-label">Provider:</span>{' '}
          <strong className="qt-booking-card__provider-name">
            {item.provider_name || item.provider_title || 'Assigned Specialist'}
          </strong>
          {item.category_name && (
            <span className="qt-booking-card__category-tag"> &bull; {item.category_name}</span>
          )}
        </div>

        <EmergencyNotice appointment={item} />

        {/* State-Specific Callout Banners for Live Queue */}
        {qStatus === 'IN_PROGRESS' && !qState.emergencyHold && (
          <div className="qt-booking-card__banner qt-booking-card__banner--in-progress">
            <div className="qt-booking-card__banner-title">🩺 YOU ARE BEING SERVED</div>
            <span className="qt-booking-card__banner-tag">Active Service</span>
          </div>
        )}

        {qStatus === 'CALLED' && !qState.emergencyHold && (
          <div className="qt-booking-card__banner qt-booking-card__banner--called">
            <div className="qt-booking-card__banner-title">⚡ YOUR TURN — Please proceed to service area</div>
            <div className="qt-booking-card__banner-desc">
              The provider is waiting for you now.
            </div>
          </div>
        )}

        {/* Live Telemetry Box if active in queue */}
        {isLive && (
          <div className="qt-booking-card__telemetry">
            {/* Dual Counter Grid: Serial, Now Serving, Scheduled Ahead, Checked-In Ahead */}
            <div className="qt-booking-card__counters-grid">
              <div className="qt-booking-card__counter-tile">
                <span className="qt-booking-card__counter-label">Your Serial</span>
                <div className="qt-booking-card__counter-value">
                  #{qState.serialNumber}
                </div>
              </div>

              <div className="qt-booking-card__counter-tile">
                <span className="qt-booking-card__counter-label">Now Serving</span>
                <div className="qt-booking-card__counter-value qt-booking-card__counter-value--accent">
                  {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
                </div>
              </div>

              <div className="qt-booking-card__counter-tile">
                <span className="qt-booking-card__counter-label">Scheduled Ahead</span>
                <div className="qt-booking-card__counter-value qt-booking-card__counter-value--warning">
                  {qState.scheduledAhead}
                </div>
              </div>

              <div className="qt-booking-card__counter-tile">
                <span className="qt-booking-card__counter-label">Checked-In Ahead</span>
                <div className="qt-booking-card__counter-value">
                  {qState.checkedInAhead}
                </div>
              </div>
            </div>

            {/* Service Range & Recommended Arrival */}
            <div className="qt-booking-card__timing-grid">
              <div className="qt-booking-card__timing-col">
                <div className="qt-booking-card__timing-label">
                  {qStatus === 'IN_PROGRESS' ? 'Consultation Status' : 'Estimated Service'}
                </div>
                <div className="qt-booking-card__timing-value">
                  {qStatus === 'IN_PROGRESS'
                    ? (qState.remainingServiceMinutes != null ? `In Consultation (~${qState.remainingServiceMinutes}m rem.)` : 'In Consultation')
                    : (!qState.providerHasStarted && qState.isDelayed
                        ? qState.timingPlaceholder
                        : (estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || qState.timingPlaceholder))}
                </div>
              </div>

              {recArrivalStr && qStatus !== 'IN_PROGRESS' && qStatus !== 'CALLED' && !qState.isCheckedIn && (
                <div className="qt-booking-card__timing-col">
                  <div className="qt-booking-card__timing-label">Recommended Arrival</div>
                  <div className="qt-booking-card__timing-value qt-booking-card__timing-value--accent">
                    {recArrivalStr}
                  </div>
                </div>
              )}
            </div>

            {/* Readiness Pill Row */}
            <div className="qt-booking-card__readiness-row">
              <div
                className="qt-booking-card__readiness-badge"
                style={{
                  background: readinessConfig.bg,
                  color: readinessConfig.color,
                  border: `1px solid ${readinessConfig.border}`,
                }}
              >
                <span
                  className="qt-booking-card__readiness-dot"
                  style={{ background: readinessConfig.color }}
                />
                {qState.emergencyHold ? 'Service interrupted' : readinessConfig.label}
              </div>

              {!qState.isCheckedIn && !isTerminal && (
                <span className="qt-booking-card__arrival-status qt-booking-card__arrival-status--warning">
                  {canCheckIn ? '📍 Check-In Available' : (qState.checkInAvailableAt ? `Check-in opens around ${formatTime(qState.checkInAvailableAt)}` : 'Awaiting Arrival')}
                </span>
              )}
              {qState.isCheckedIn && (
                <span className="qt-booking-card__arrival-status qt-booking-card__arrival-status--success">
                  ✓ Checked In
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scheduled appointment info for upcoming non-active */}
        {!isLive && (
          <div className="qt-booking-card__scheduled-info">
            <div className="qt-booking-card__scheduled-row">
              <span className="qt-booking-card__scheduled-date">
                📅 Date: <strong>{formatBookingDate(item.appointment_date || (item.start_datetime ? new Date(item.start_datetime).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) : null))}</strong>
              </span>
              <span className="qt-booking-card__scheduled-time">
                ⏰ <strong>{estStartStr || qState.timingPlaceholder}</strong>
              </span>
            </div>
            {item.serial_number && (
              <div className="qt-booking-card__scheduled-serial-row">
                <span className="qt-booking-card__scheduled-serial-label">Allocated Serial</span>
                <span className="qt-booking-card__scheduled-serial-val">Your Serial: #{item.serial_number}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="qt-booking-card__actions">
        {canCheckIn && !isTerminal && onCheckIn && (
          <button
            type="button"
            className="qt-booking-card__btn qt-booking-card__btn--check-in"
            onClick={() => onCheckIn(item.organization_id, item.id)}
            disabled={isCheckingIn}
          >
            {isCheckingIn ? 'Checking In...' : '✓ Check In Now'}
          </button>
        )}

        {isLive && qId && (
          <button
            type="button"
            className="qt-booking-card__btn qt-booking-card__btn--telemetry"
            onClick={() => navigate(`/customer/queue/${qId}`)}
          >
            Open Telemetry →
          </button>
        )}

        <button
          type="button"
          className="qt-booking-card__btn qt-booking-card__btn--secondary"
          onClick={() => navigate(`/customer/appointments/${apptId}`)}
        >
          Details
        </button>

        {qStatus === 'COMPLETED' && (
          <button
            type="button"
            className="qt-booking-card__btn qt-booking-card__btn--review"
            onClick={() => navigate('/customer/reviews')}
          >
            ★ Review
          </button>
        )}
      </div>
    </div>
  );
}

export default CustomerBookingCard;
