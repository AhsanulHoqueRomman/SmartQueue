import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { getNormalizedCustomerQueueState } from '../utils/queueDisplay';

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
    <div
      className="card animate-section"
      style={{
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border)',
        borderRadius: '16px',
        padding: '1.5rem',
        boxShadow: 'var(--card-shadow)',
        display: 'flex',
        flexDirection: 'column',
        justify: 'space-between',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div>
        {/* Header: Organization & Category Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.organization_category || 'CLINIC'} &bull; {item.organization_name}
            </span>
            <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.2rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              {item.service_name || 'Service Consultation'}
            </h3>
          </div>
          <StatusBadge status={qState.rawStatus} customLabel={qState.displayStatus} />
        </div>

        {/* Subheader: Provider & Category */}
        <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginBottom: '1.25rem' }}>
          Provider: <strong style={{ color: 'var(--lp-text)' }}>{item.provider_name || item.provider_title || 'Assigned Specialist'}</strong>
          {item.category_name && <span> &bull; {item.category_name}</span>}
        </div>

        {/* State-Specific Callout Banners for Live Queue */}
        {qStatus === 'IN_PROGRESS' && (
          <div
            style={{
              background: 'var(--lp-btn-bg, #2F2520)',
              color: 'var(--lp-btn-text, #FAF8F3)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🩺 YOU ARE BEING SERVED</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>Active Service</span>
          </div>
        )}

        {qStatus === 'CALLED' && (
          <div
            style={{
              background: 'var(--color-success-bg, rgba(79, 122, 90, 0.12))',
              border: '1px solid var(--color-success-border, rgba(79, 122, 90, 0.25))',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '0.95rem' }}>⚡ YOUR TURN — Please proceed to service area</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-success)', marginTop: '0.15rem' }}>
              The provider is waiting for you now.
            </div>
          </div>
        )}

        {/* Live Telemetry Box if active in queue */}
        {isLive && (
          <div
            style={{
              background: 'var(--lp-bg-subtle)',
              border: '1px solid var(--lp-border)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            {/* Dual Counter Grid: Serial, Now Serving, Scheduled Ahead, Checked-In Ahead */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.85rem', textAlign: 'center' }}>
              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.6rem 0.25rem' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Your Serial</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  #{qState.serialNumber}
                </div>
              </div>

              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.6rem 0.25rem' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Now Serving</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
                </div>
              </div>

              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.6rem 0.25rem' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Scheduled Ahead</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  {qState.scheduledAhead}
                </div>
              </div>

              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.6rem 0.25rem' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Checked-In Ahead</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  {qState.checkedInAhead}
                </div>
              </div>
            </div>

            {/* Service Range & Recommended Arrival */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--lp-text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {qStatus === 'IN_PROGRESS' ? 'Consultation Status' : 'Estimated Service'}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.1rem' }}>
                  {qStatus === 'IN_PROGRESS'
                    ? (qState.remainingServiceMinutes != null ? `In Consultation (~${qState.remainingServiceMinutes}m rem.)` : 'In Consultation')
                    : (!qState.providerHasStarted && qState.isDelayed
                        ? 'Awaiting Provider Start'
                        : (estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'))}
                </div>
              </div>

              {recArrivalStr && qStatus !== 'IN_PROGRESS' && qStatus !== 'CALLED' && !qState.isCheckedIn && (
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--lp-text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Recommended Arrival</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-accent)', marginTop: '0.1rem' }}>
                    {recArrivalStr}
                  </div>
                </div>
              )}
            </div>

            {/* Readiness Pill Row */}
            <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: readinessConfig.bg,
                  color: readinessConfig.color,
                  border: `1px solid ${readinessConfig.border}`,
                  padding: '0.3rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: readinessConfig.color }} />
                {readinessConfig.label}
              </div>

              {!qState.isCheckedIn && !isTerminal && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                  {canCheckIn ? '📍 Check-In Available' : (qState.checkInAvailableAt ? `Check-in opens around ${formatTime(qState.checkInAvailableAt)}` : 'Awaiting Arrival')}
                </span>
              )}
              {qState.isCheckedIn && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>
                  ✓ Checked In
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scheduled appointment info for upcoming non-active */}
        {!isLive && (
          <div style={{ background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--lp-text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📅 Date: <strong>{new Date(item.start_datetime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong></span>
              <span>⏰ <strong>{estStartStr || 'Scheduled'}</strong></span>
            </div>
            {item.serial_number && (
              <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--lp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Allocated Serial</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif' }}>Your Serial: #{item.serial_number}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        {canCheckIn && !isTerminal && onCheckIn && (
          <button
            onClick={() => onCheckIn(item.organization_id, item.id)}
            disabled={isCheckingIn}
            style={{
              flex: 1,
              minWidth: '130px',
              padding: '0.6rem 1rem',
              background: isCheckingIn ? 'var(--lp-text-subtle)' : 'var(--color-warning)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: isCheckingIn ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            {isCheckingIn ? 'Checking In...' : '✓ Check In Now'}
          </button>
        )}

        {isLive && qId && (
          <button
            onClick={() => navigate(`/customer/queue/${qId}`)}
            style={{
              flex: 1,
              minWidth: '130px',
              padding: '0.6rem 1rem',
              background: 'var(--lp-btn-bg, #2F2520)',
              color: 'var(--lp-btn-text, #FAF8F3)',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Open Telemetry →
          </button>
        )}

        <button
          onClick={() => navigate(`/customer/appointments/${apptId}`)}
          style={{
            padding: '0.6rem 0.9rem',
            background: 'var(--lp-bg-subtle)',
            color: 'var(--lp-accent)',
            border: '1px solid var(--lp-border)',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Details
        </button>

        {qStatus === 'COMPLETED' && (
          <button
            onClick={() => navigate('/customer/reviews')}
            style={{
              padding: '0.6rem 0.9rem',
              background: 'var(--lp-bg-subtle)',
              color: 'var(--color-warning)',
              border: '1px solid var(--lp-border)',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            ★ Review
          </button>
        )}
      </div>
    </div>
  );
}

export default CustomerBookingCard;
