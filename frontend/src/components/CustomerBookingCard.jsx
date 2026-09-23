import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';

export function CustomerBookingCard({ item, onCheckIn, checkingInId }) {
  const navigate = useNavigate();

  if (!item) return null;

  const apptId = item.id;
  const qEntry = item.queue_entry;
  const qStatus = qEntry?.status || item.status;
  const qId = qEntry?.id;

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const estStartStr = qEntry?.readiness_info?.estimated_start_time
    ? formatTime(qEntry.readiness_info.estimated_start_time)
    : formatTime(item.start_datetime);

  const estEndStr = qEntry?.readiness_info?.estimated_end_time
    ? formatTime(qEntry.readiness_info.estimated_end_time)
    : formatTime(item.end_datetime);

  const recArrivalStr = qEntry?.readiness_info?.recommended_arrival_time
    ? formatTime(qEntry.readiness_info.recommended_arrival_time)
    : null;

  const readinessState = qEntry?.readiness_info?.readiness_state || 'NOT_YET';
  const peopleAhead = qEntry?.readiness_info?.people_ahead ?? 0;
  const nowServingSerial = qEntry?.readiness_info?.now_serving_serial;

  const readinessConfig = {
    TURN_NOW: { label: 'Your Turn', bg: '#DCFCE7', color: '#166534', border: '#86EFAC', note: 'Please proceed inside' },
    BE_READY: { label: 'Be Ready', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', note: 'You are next in line' },
    GET_READY: { label: 'Get Ready', bg: '#FEF9C3', color: '#854D0E', border: '#FEF08A', note: 'Turn approaching soon' },
    NOT_YET: { label: 'Not Yet', bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB', note: 'Relaxed waiting' },
  }[readinessState] || { label: 'Waiting', bg: '#FAF8F3', color: '#5F7A70', border: '#E6E1D9', note: '' };

  const isLive = ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);
  const isTerminal = ['COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW'].includes(qStatus);
  const isCheckingIn = checkingInId === item.id;

  return (
    <div
      className="card animate-section"
      style={{
        background: '#FFFFFF',
        border: '1px solid #E6E1D9',
        borderRadius: '16px',
        padding: '1.5rem',
        boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
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
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.organization_category || 'CLINIC'} &bull; {item.organization_name}
            </span>
            <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.2rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              {item.service_name || 'Service Consultation'}
            </h3>
          </div>
          <StatusBadge status={qStatus} />
        </div>

        {/* Subheader: Provider & Category */}
        <div style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '1.25rem' }}>
          Provider: <strong style={{ color: '#211C19' }}>{item.provider_name || item.provider_title || 'Assigned Specialist'}</strong>
          {item.category_name && <span> &bull; {item.category_name}</span>}
        </div>

        {/* State-Specific Callout Banners for Live Queue */}
        {qStatus === 'IN_PROGRESS' && (
          <div
            style={{
              background: '#2F2520',
              color: '#FAF8F3',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🩺 YOU ARE BEING SERVED</div>
            <span style={{ fontSize: '0.75rem', color: '#86EFAC', fontWeight: 600 }}>Active Service</span>
          </div>
        )}

        {qStatus === 'CALLED' && (
          <div
            style={{
              background: '#ECFDF5',
              border: '1px solid #6EE7B7',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ fontWeight: 700, color: '#065F46', fontSize: '0.95rem' }}>⚡ YOUR TURN — Please proceed to service area</div>
            <div style={{ fontSize: '0.8rem', color: '#047857', marginTop: '0.15rem' }}>
              The provider is waiting for you now.
            </div>
          </div>
        )}

        {/* Live Telemetry Box if active in queue */}
        {isLive && (
          <div
            style={{
              background: '#FAF8F3',
              border: '1px solid #E6E1D9',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            {/* Primary Telemetry Grid: Serial, Now Serving, People Ahead */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.85rem', textAlign: 'center' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.6rem 0.35rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Your Serial</span>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#2F2520', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  #{item.serial_number || qEntry?.token_number || '—'}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.6rem 0.35rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Now Serving</span>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#5F7A70', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.6rem 0.35rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>People Ahead</span>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#B06D2E', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                  {qStatus === 'CALLED' || qStatus === 'IN_PROGRESS' ? '0' : peopleAhead}
                </div>
              </div>
            </div>

            {/* Service Range & Recommended Arrival */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #E6E1D9' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#78716C', fontWeight: 600, textTransform: 'uppercase' }}>Estimated Service</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginTop: '0.1rem' }}>
                  {estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}
                </div>
              </div>

              {recArrivalStr && (
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#78716C', fontWeight: 600, textTransform: 'uppercase' }}>Recommended Arrival</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#5F7A70', marginTop: '0.1rem' }}>
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

              {qEntry && !qEntry.is_checked_in && !isTerminal && (
                <span style={{ fontSize: '0.75rem', color: '#B06D2E', fontWeight: 600 }}>
                  ⏳ Check-In Pending
                </span>
              )}
              {qEntry && qEntry.is_checked_in && (
                <span style={{ fontSize: '0.75rem', color: '#4F7A5A', fontWeight: 600 }}>
                  ✓ Checked In
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scheduled appointment info for upcoming non-active */}
        {!isLive && (
          <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', padding: '0.85rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#211C19' }}>
            📅 Date: <strong>{new Date(item.start_datetime).toLocaleDateString()}</strong> &bull; Time: <strong>{estStartStr || 'Scheduled'}</strong>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        {qEntry && !qEntry.is_checked_in && !isTerminal && onCheckIn && (
          <button
            onClick={() => onCheckIn(item.organization_id, item.id)}
            disabled={isCheckingIn}
            style={{
              flex: 1,
              minWidth: '130px',
              padding: '0.6rem 1rem',
              background: isCheckingIn ? '#78716C' : '#B06D2E',
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
              background: '#2F2520',
              color: '#FAF8F3',
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
            background: '#FAF8F3',
            color: '#5F7A70',
            border: '1px solid #E6E1D9',
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
              background: '#F5EFE6',
              color: '#B06D2E',
              border: '1px solid #E6E1D9',
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
