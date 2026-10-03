import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import appointmentService from '../services/appointmentService';
import StatusBadge from './StatusBadge';

// Intersection Observer Hook for scroll-triggered entrance animation
function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.1, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, inView];
}

import getNormalizedCustomerQueueState from '../utils/queueDisplay';

function LiveQueuePreviewCard({ item, formatTime }) {
  const qState = getNormalizedCustomerQueueState(item);

  const estStartStr = formatTime(qState.estimatedStartTime);
  const estEndStr = formatTime(qState.estimatedEndTime);

  return (
    <div
      style={{
        flex: '0 0 100%',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border)',
          borderRadius: '20px',
          padding: '1.75rem 2rem',
          boxShadow: 'var(--lp-shadow-sm)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        {/* Header: Organization & Service */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.organization_name}
            </span>
            <h4 style={{ margin: '0.15rem 0 0 0', fontSize: '1.25rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              {item.service_name || 'Consultation Service'}
            </h4>
            <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginTop: '0.15rem' }}>
              Provider: <strong style={{ color: 'var(--lp-text)' }}>{item.provider_name || item.provider_title || 'Assigned Specialist'}</strong>
            </div>
          </div>
          <StatusBadge status={qState.rawStatus} />
        </div>

        {/* Hero Serial & Status Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', padding: '1.25rem', background: 'var(--lp-bg-subtle)', borderRadius: '14px', border: '1px solid var(--lp-border)', marginBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--lp-text-subtle)', letterSpacing: '0.05em' }}>Your Serial</span>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: 'var(--lp-text)', lineHeight: 1 }}>
              #{qState.serialNumber}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontWeight: 700, fontSize: '0.85rem', background: qState.statusTone === 'success' ? 'var(--color-success-light)' : qState.statusTone === 'warning' ? 'var(--color-warning-light)' : 'var(--lp-surface)', color: qState.statusTone === 'success' ? 'var(--color-success)' : qState.statusTone === 'warning' ? 'var(--color-warning)' : 'var(--lp-accent)', border: '1px solid var(--lp-border)' }}>
              {qState.displayStatus}
            </div>
            {qState.secondaryStatus && (
              <div style={{ fontSize: '0.78rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: '0.25rem' }}>
                ⏰ {qState.secondaryStatus}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Human Guidance */}
        <p style={{ fontSize: '0.9rem', color: 'var(--lp-text)', lineHeight: 1.5, margin: '0 0 1.25rem 0', fontWeight: 500 }}>
          {qState.guidance}
        </p>

        {/* Action Link to Full Telemetry */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)' }}>
            People Ahead: <strong style={{ color: 'var(--lp-text)' }}>{qState.peopleAhead}</strong>
          </span>
          <Link
            to={item.queue_entry?.id ? `/customer/queue/${item.queue_entry.id}` : `/customer/appointments/${item.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: 'var(--lp-accent)',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
            }}
          >
            Open Live Telemetry →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function HomepageLiveQueueWidget() {
  const [sectionRef, inView] = useInView({ threshold: 0.1 });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Swipe & Drag gesture state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const isScrollingRef = useRef(null);
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
        const activeOrUpcoming = list.filter(
          (item) => item.temporal_classification !== 'past' && item.temporal_classification !== 'historical' && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(item.status)
        );
        const sorted = [...activeOrUpcoming].sort((a, b) => getPriorityScore(a) - getPriorityScore(b));
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

    if (isScrollingRef.current === null) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) {
        isScrollingRef.current = true;
        setIsDragging(false);
        setDragOffset(0);
        return;
      } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
        isScrollingRef.current = false;
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
      setCurrentIndex((prev) => prev + 1);
    } else if (finalOffset >= threshold && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }

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
      <div
        ref={sectionRef}
        style={{
          maxWidth: '1150px',
          width: '100%',
          margin: '2.5rem auto 1.5rem auto',
          padding: '0 1.5rem',
          boxSizing: 'border-box',
          opacity: inView ? 1 : 0,
          transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.98)',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '24px',
            padding: '2.25rem',
            textAlign: 'center',
            boxShadow: 'var(--lp-shadow-sm)',
            minHeight: '380px',
            display: 'flex',
            justify: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: 'var(--lp-text-subtle)', fontWeight: 600 }}>Loading your live queue status...</div>
        </div>
      </div>
    );
  }

  // Logged-in customer with 0 bookings
  if (items.length === 0) {
    return (
      <div
        ref={sectionRef}
        style={{
          maxWidth: '1150px',
          width: '100%',
          margin: '2.5rem auto 1.5rem auto',
          padding: '0 1.5rem',
          boxSizing: 'border-box',
          opacity: inView ? 1 : 0,
          transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.98)',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '24px',
            padding: '2.5rem 2.25rem',
            textAlign: 'center',
            boxShadow: 'var(--lp-shadow-sm)',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗓️</div>
          <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
            You don't have any bookings yet.
          </h3>
          <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.9rem', color: 'var(--lp-text-subtle)', maxWidth: '420px', lineHeight: 1.4, marginInline: 'auto' }}>
            Book an appointment with a clinic or specialist to track your real-time queue position here.
          </p>
          <Link
            to="/organizations"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.7rem 1.5rem',
              background: 'var(--lp-accent)',
              color: 'var(--lp-btn-text)',
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
      ref={sectionRef}
      style={{
        maxWidth: '1150px',
        width: '100%',
        margin: '2.5rem auto 1.5rem auto',
        padding: '0 1.5rem',
        boxSizing: 'border-box',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.98)',
        transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Widget Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--lp-accent)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>🟢</span> Your Live Queue Preview
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
                    background: idx === currentIndex ? 'var(--lp-accent)' : 'var(--lp-border)',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', fontWeight: 600, minWidth: '38px', textAlign: 'right' }}>
              {currentIndex + 1} of {items.length}
            </span>
          </div>
        )}
      </div>

      {/* Swipeable Viewport Container - Single 1150px Width Card */}
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
          borderRadius: '24px',
          cursor: isDragging ? 'grabbing' : 'grab',
          width: '100%',
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
