import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import appointmentService from '../services/appointmentService';
import StatusBadge from './StatusBadge';

function LiveQueuePreviewCard({ item, formatTime }) {
  const qEntry = item.queue_entry;
  const qStatus = qEntry?.status || item.status;

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
    TURN_NOW: { label: 'Your Turn', bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
    BE_READY: { label: 'Be Ready', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    GET_READY: { label: 'Get Ready', bg: '#FEF9C3', color: '#854D0E', border: '#FEF08A' },
    NOT_YET: { label: 'Not Yet', bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB' },
  }[readinessState] || { label: 'Waiting', bg: '#FAF8F3', color: '#5F7A70', border: '#E6E1D9' };

  const isLive = ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);

  return (
    <div
      style={{
        flex: '0 0 100%',
        width: '100%',
        boxSizing: 'border-box',
        padding: '0 2px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '20px',
          padding: '1.5rem 1.75rem',
          boxShadow: '0 6px 24px rgba(47, 37, 32, 0.05)',
          minHeight: '380px',
          display: 'flex',
          flexDirection: 'column',
          justify: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        <div>
          {/* Header: Organization & Service */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem', height: '2.5rem' }}>
            <div style={{ flex: 1, paddingRight: '0.75rem', overflow: 'hidden' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#5F7A70',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.organization_name}
              </span>
              <h4
                style={{
                  margin: '0.1rem 0 0 0',
                  fontSize: '1.2rem',
                  color: '#211C19',
                  fontWeight: 700,
                  fontFamily: 'Cinzel, serif',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.service_name || 'Consultation Service'}
              </h4>
            </div>
            <StatusBadge status={qStatus} />
          </div>

          {/* Provider Subheader */}
          <div
            style={{
              fontSize: '0.85rem',
              color: '#78716C',
              marginBottom: '1rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Provider: <strong style={{ color: '#211C19' }}>{item.provider_name || item.provider_title || 'Assigned Specialist'}</strong>
          </div>

          {/* Status Callout Banner */}
          <div style={{ minHeight: '44px', marginBottom: '1rem' }}>
            {qStatus === 'IN_PROGRESS' && (
              <div
                style={{
                  background: '#2F2520',
                  color: '#FAF8F3',
                  borderRadius: '10px',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>🩺 YOU ARE BEING SERVED</span>
                <span style={{ fontSize: '0.75rem', color: '#86EFAC', fontWeight: 600 }}>Active</span>
              </div>
            )}

            {qStatus === 'CALLED' && (
              <div
                style={{
                  background: '#ECFDF5',
                  border: '1px solid #6EE7B7',
                  borderRadius: '10px',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  color: '#065F46',
                  fontWeight: 700,
                }}
              >
                ⚡ YOUR TURN — Please proceed to service area
              </div>
            )}
          </div>

          {/* Live Telemetry Block */}
          {isLive ? (
            <div
              style={{
                background: '#FAF8F3',
                border: '1px solid #E6E1D9',
                borderRadius: '14px',
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
              }}
            >
              {/* 3 Telemetry Columns: Your Serial | Now Serving | People Ahead */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.6rem',
                  textAlign: 'center',
                  marginBottom: '0.85rem',
                }}
              >
                <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.6rem 0.35rem' }}>
                  <div style={{ fontSize: '0.65rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Your Serial</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#2F2520', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                    #{item.serial_number || qEntry?.token_number || '—'}
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.6rem 0.35rem' }}>
                  <div style={{ fontSize: '0.65rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Now Serving</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#5F7A70', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                    {nowServingSerial ? `#${nowServingSerial}` : 'None'}
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.6rem 0.35rem' }}>
                  <div style={{ fontSize: '0.65rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>People Ahead</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#B06D2E', fontFamily: 'Outfit, sans-serif', marginTop: '0.1rem' }}>
                    {qStatus === 'CALLED' || qStatus === 'IN_PROGRESS' ? '0' : peopleAhead}
                  </div>
                </div>
              </div>

              {/* Estimated Service & Recommended Arrival Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem', color: '#57534E', paddingTop: '0.4rem' }}>
                <div>
                  <span>Est. Service: </span>
                  <strong style={{ color: '#211C19' }}>
                    {estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}
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
            <div
              style={{
                background: '#FAF8F3',
                border: '1px solid #E6E1D9',
                borderRadius: '14px',
                padding: '1rem',
                marginBottom: '1rem',
                fontSize: '0.85rem',
                color: '#78716C',
                minHeight: '120px',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
              }}
            >
              Scheduled for: &nbsp;<strong style={{ color: '#211C19' }}>{new Date(item.start_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3' }}>
          {isLive ? (
            <span
              style={{
                background: readinessConfig.bg,
                color: readinessConfig.color,
                border: `1px solid ${readinessConfig.border}`,
                padding: '0.3rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: readinessConfig.color }} />
              {readinessConfig.label}
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#78716C' }}>Status: {qStatus}</span>
          )}

          <Link
            to="/customer/dashboard"
            style={{
              fontSize: '0.85rem',
              color: '#5F7A70',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            Full Customer Dashboard &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

export function HomepageLiveQueueWidget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Swipe & Drag gesture state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const isScrollingRef = useRef(null); // null: undecided, true: vertical scroll, false: horizontal drag
  const cardContainerRef = useRef(null);

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

  // Gesture handling (Touch + Mouse Pointer)
  const handleDragStart = (clientX, clientY) => {
    if (items.length <= 1) return;
    startXRef.current = clientX;
    startYRef.current = clientY;
    currentXRef.current = clientX;
    isScrollingRef.current = null;
    setIsDragging(true);
  };

  const handleDragMove = (clientX, clientY) => {
    if (!isDragging) return;
    const deltaX = clientX - startXRef.current;
    const deltaY = clientY - startYRef.current;

    // Determine scroll direction intent (vertical scroll vs horizontal drag)
    if (isScrollingRef.current === null) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) {
        isScrollingRef.current = true; // Vertical scroll -> cancel horizontal drag
        setIsDragging(false);
        setDragOffset(0);
        return;
      } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
        isScrollingRef.current = false; // Horizontal drag -> proceed
      }
    }

    if (isScrollingRef.current === false) {
      currentXRef.current = clientX;
      setDragOffset(deltaX);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const containerWidth = cardContainerRef.current?.offsetWidth || 600;
    const threshold = Math.min(120, Math.max(50, containerWidth * 0.16));
    const finalOffset = currentXRef.current - startXRef.current;

    if (finalOffset <= -threshold && currentIndex < items.length - 1) {
      // Swiped left -> advance to next card
      setCurrentIndex((prev) => prev + 1);
    } else if (finalOffset >= threshold && currentIndex > 0) {
      // Swiped right -> go back to previous card
      setCurrentIndex((prev) => prev - 1);
    }

    // Reset offset so smooth CSS track transition slides to exact target card
    setDragOffset(0);
    isScrollingRef.current = null;
  };

  // Touch Event Listeners
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Mouse Pointer Event Listeners
  const handleMouseDown = (e) => {
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      handleDragMove(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      handleDragEnd();
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      handleDragEnd();
    }
  };

  const goToIndex = (idx) => {
    if (idx === currentIndex) return;
    setCurrentIndex(idx);
    setDragOffset(0);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '768px', width: '100%', margin: '2rem auto', padding: '0 1.5rem' }}>
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '20px',
            padding: '1.5rem',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(47, 37, 32, 0.04)',
            minHeight: '380px',
            display: 'flex',
            flexDirection: 'column',
            justify: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#78716C', fontWeight: 600 }}>Loading your live queue status...</div>
        </div>
      </div>
    );
  }

  // Logged-in customer with 0 bookings
  if (items.length === 0) {
    return (
      <div style={{ maxWidth: '768px', width: '100%', margin: '2rem auto', padding: '0 1.5rem' }}>
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '20px',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(47, 37, 32, 0.04)',
            minHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
            justify: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗓️</div>
          <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
            You don't have any bookings yet.
          </h3>
          <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.9rem', color: '#78716C', maxWidth: '420px', lineHeight: 1.4 }}>
            Book an appointment with a clinic or specialist to track your real-time queue position here.
          </p>
          <Link
            to="/organizations"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.7rem 1.5rem',
              background: '#5F7A70',
              color: '#FFFFFF',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.9rem',
              textDecoration: 'none',
              boxShadow: '0 3px 12px rgba(95, 122, 112, 0.25)',
              transition: 'background 0.2s ease',
            }}
          >
            Browse Services &amp; Clinics &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '768px',
        width: '100%',
        margin: '2rem auto 2.5rem auto',
        padding: '0 1.5rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Widget Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🟢 Your Live Queue Preview
          </span>
        </div>

        {/* Subtle Indicator & Dots */}
        {items.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {items.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => goToIndex(idx)}
                  aria-label={`View booking ${idx + 1} of ${items.length}`}
                  style={{
                    width: idx === currentIndex ? '18px' : '7px',
                    height: '7px',
                    borderRadius: '999px',
                    background: idx === currentIndex ? '#5F7A70' : '#D6D0C7',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 600, minWidth: '38px', textAlign: 'right' }}>
              {currentIndex + 1} of {items.length}
            </span>
          </div>
        )}
      </div>

      {/* Swipeable Viewport Container */}
      <div
        ref={cardContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'relative',
          touchAction: 'pan-y',
          overflow: 'hidden',
          borderRadius: '20px',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Horizontal Multi-Card Flex Track */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            transform: `translateX(calc(${-currentIndex * 100}% + ${dragOffset}px))`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            willChange: 'transform',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {items.map((item, idx) => (
            <LiveQueuePreviewCard key={item.id || idx} item={item} formatTime={formatTime} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default HomepageLiveQueueWidget;
