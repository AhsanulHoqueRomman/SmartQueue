import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import appointmentService from '../services/appointmentService';
import StatusBadge from './StatusBadge';

export function HomepageLiveQueueWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Touch gesture tracking for swipe navigation
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getPriorityScore = (item) => {
    const qStatus = item.queue_entry?.status || item.status;
    if (qStatus === 'IN_PROGRESS') return 1;
    if (qStatus === 'CALLED') return 2;
    if (qStatus === 'CHECKED_IN') return 3;
    if (qStatus === 'WAITING') return 4;
    const isToday = new Date(item.start_datetime).toDateString() === new Date().toDateString();
    if (isToday) return 5;
    if (new Date(item.start_datetime) > new Date()) return 6;
    return 7;
  };

  useEffect(() => {
    let isMounted = true;
    appointmentService.getCustomerDashboard()
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        // Sort items by priority rank so most relevant booking is selected by default
        const sorted = [...list].sort((a, b) => getPriorityScore(a) - getPriorityScore(b));
        setItems(sorted);
      })
      .catch(() => {
        if (isMounted) setItems([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].screenX;
    handleSwipe();
  };

  const handleSwipe = () => {
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;
    if (Math.abs(diff) > minSwipeDistance && items.length > 1) {
      if (diff > 0) {
        // Swiped left -> next
        handleNext();
      } else {
        // Swiped right -> prev
        handlePrev();
      }
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '640px', margin: '1.5rem auto', padding: '0 1rem' }}>
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '16px',
            padding: '1.25rem',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>Loading your live queue...</div>
        </div>
      </div>
    );
  }

  // Logged-in customer with 0 bookings
  if (items.length === 0) {
    return (
      <div style={{ maxWidth: '640px', margin: '1.5rem auto', padding: '0 1rem' }}>
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '16px',
            padding: '1.5rem',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🗓️</div>
          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#211C19', fontWeight: 700 }}>
            You don't have any bookings yet.
          </h3>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#78716C' }}>
            Book an appointment to see your live queue status here.
          </p>
          <Link
            to="/organizations"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.25rem',
              background: '#5F7A70',
              color: '#FFFFFF',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(95, 122, 112, 0.2)',
            }}
          >
            Browse Services &amp; Clinics &rarr;
          </Link>
        </div>
      </div>
    );
  }

  const currentItem = items[currentIndex] || items[0];
  const qEntry = currentItem.queue_entry;
  const qStatus = qEntry?.status || currentItem.status;

  const estStartStr = qEntry?.readiness_info?.estimated_start_time
    ? formatTime(qEntry.readiness_info.estimated_start_time)
    : formatTime(currentItem.start_datetime);

  const estEndStr = qEntry?.readiness_info?.estimated_end_time
    ? formatTime(qEntry.readiness_info.estimated_end_time)
    : formatTime(currentItem.end_datetime);

  const recArrivalStr = qEntry?.readiness_info?.recommended_arrival_time
    ? formatTime(qEntry.readiness_info.recommended_arrival_time)
    : null;

  const readinessState = qEntry?.readiness_info?.readiness_state || 'NOT_YET';
  const peopleAhead = qEntry?.readiness_info?.people_ahead ?? 0;
  const nowServingSerial = qEntry?.readiness_info?.now_serving_serial;

  const readinessConfig = {
    TURN_NOW: { label: 'Your Turn', bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
    BE_READY: { label: 'Be Ready', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    GET_READY: { label: 'Get Ready', bg: '#FEF9C3', color: '#854D0E', border: '#FEF08A' },
    NOT_YET: { label: 'Not Yet', bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB' },
  }[readinessState] || { label: 'Waiting', bg: '#FAF8F3', color: '#5F7A70', border: '#E6E1D9' };

  const isLive = ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);

  return (
    <div style={{ maxWidth: '640px', margin: '1.75rem auto 2rem auto', padding: '0 1rem' }}>
      {/* Widget Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🟢 Your Live Queue Preview
          </span>
        </div>
        {items.length > 1 && (
          <div style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 600 }}>
            {currentIndex + 1} of {items.length}
          </div>
        )}
      </div>

      {/* Compact Telemetry Card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 18px rgba(47, 37, 32, 0.05)',
          transition: 'all 0.2s ease-out',
          userSelect: 'none',
        }}
      >
        {/* Card Header: Org & Service */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase' }}>
              {currentItem.organization_name}
            </span>
            <h4 style={{ margin: '0.1rem 0 0 0', fontSize: '1.1rem', color: '#211C19', fontWeight: 700 }}>
              {currentItem.service_name || 'Consultation'}
            </h4>
          </div>
          <StatusBadge status={qStatus} />
        </div>

        {/* Provider line */}
        <div style={{ fontSize: '0.825rem', color: '#78716C', marginBottom: '1rem' }}>
          Provider: <strong style={{ color: '#211C19' }}>{currentItem.provider_name || currentItem.provider_title || 'Specialist'}</strong>
        </div>

        {/* Status Callout Banner */}
        {qStatus === 'IN_PROGRESS' && (
          <div
            style={{
              background: '#2F2520',
              color: '#FAF8F3',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>🩺 YOU ARE BEING SERVED</span>
            <span style={{ fontSize: '0.75rem', color: '#86EFAC' }}>Active</span>
          </div>
        )}

        {qStatus === 'CALLED' && (
          <div
            style={{
              background: '#ECFDF5',
              border: '1px solid #6EE7B7',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: '#065F46',
              fontWeight: 700,
            }}
          >
            ⚡ YOUR TURN — Please proceed to service area
          </div>
        )}

        {/* Live Telemetry Block */}
        {isLive ? (
          <div
            style={{
              background: '#FAF8F3',
              border: '1px solid #E6E1D9',
              borderRadius: '12px',
              padding: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {/* Telemetry numbers: Serial | Serving | People Ahead */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', textAlign: 'center', marginBottom: '0.65rem' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '8px', padding: '0.5rem 0.25rem' }}>
                <div style={{ fontSize: '0.6rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Your Serial</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2F2520' }}>
                  #{currentItem.serial_number || qEntry?.token_number || '—'}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '8px', padding: '0.5rem 0.25rem' }}>
                <div style={{ fontSize: '0.6rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Now Serving</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#5F7A70' }}>
                  {nowServingSerial ? `#${nowServingSerial}` : 'None'}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '8px', padding: '0.5rem 0.25rem' }}>
                <div style={{ fontSize: '0.6rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Ahead</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#B06D2E' }}>
                  {qStatus === 'CALLED' || qStatus === 'IN_PROGRESS' ? '0' : peopleAhead}
                </div>
              </div>
            </div>

            {/* Estimated Service & Recommended Arrival */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#57534E' }}>
              <div>
                <span>Est. Service: </span>
                <strong style={{ color: '#211C19' }}>
                  {estStartStr && estEndStr ? `${estStartStr} - ${estEndStr}` : estStartStr || 'Scheduled'}
                </strong>
              </div>
              {recArrivalStr && (
                <div>
                  <span>Arrival: </span>
                  <strong style={{ color: '#5F7A70' }}>{recArrivalStr}</strong>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.825rem', color: '#78716C' }}>
            Scheduled for: <strong style={{ color: '#211C19' }}>{new Date(currentItem.start_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
          </div>
        )}

        {/* Readiness Badge & Action Link */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isLive ? (
            <span
              style={{
                background: readinessConfig.bg,
                color: readinessConfig.color,
                border: `1px solid ${readinessConfig.border}`,
                padding: '0.25rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {readinessConfig.label}
            </span>
          ) : (
            <span />
          )}

          <Link
            to="/customer/dashboard"
            style={{
              fontSize: '0.8rem',
              color: '#5F7A70',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Full Dashboard &rarr;
          </Link>
        </div>
      </div>

      {/* Swipe / Navigation controls when multiple bookings exist */}
      {items.length > 1 && (
        <div
          style={{
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            marginTop: '0.75rem',
            padding: '0 0.25rem',
          }}
        >
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous booking"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E6E1D9',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#57534E',
              cursor: 'pointer',
            }}
          >
            &larr; Previous
          </button>

          <span style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 500 }}>
            &larr; Swipe to navigate &rarr;
          </span>

          <button
            type="button"
            onClick={handleNext}
            aria-label="Next booking"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E6E1D9',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#57534E',
              cursor: 'pointer',
            }}
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
