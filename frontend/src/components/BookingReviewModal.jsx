import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookingSummary } from './BookingContact';
import '../styles/LandingPage.css';

// Shared by the storefront and the direct booking journey.
export default function BookingReviewModal({ open, onBack, onConfirm, submitting, ready, error, ...summary }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleKey = event => {
      if (event.key === 'Escape' && !submitting) onBack();
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); };
  }, [open, submitting, onBack]);
  if (!open) return null;
  // AppShell animations can create a containing block for fixed descendants.
  // Render at the document root so the same modal stays inside either viewport.
  return createPortal(<div className="org-modal-overlay" onClick={() => { if (!submitting) onBack(); }}>
    <div ref={dialog} className="org-modal-card org-booking-review-card" role="dialog" aria-modal="true" aria-labelledby="booking-review-title" onClick={e => e.stopPropagation()}>
      <div className="org-modal-body org-booking-review-body">
        <h2 className="org-modal-title" id="booking-review-title">Review Your Booking</h2>
        <p className="org-about-text">Check your details before confirming your queue serial.</p>
        <BookingSummary {...summary} />
        <div className="org-modal-serial-notice">You are booking a queue serial, not a fixed consultation start time.</div>
        {error && <p className="org-form-error" role="alert">{error}</p>}
      </div>
      <div className="org-booking-review-actions">
        <button type="button" className="lp-btn-outline" autoFocus disabled={submitting} onClick={onBack}>Back & Edit</button>
        <button type="button" className="lp-btn-primary" disabled={submitting || !ready} onClick={onConfirm}>
          {submitting ? 'Booking & Allocating Serial...' : 'Confirm Serial Booking'}
        </button>
      </div>
    </div>
  </div>, document.body);
}
