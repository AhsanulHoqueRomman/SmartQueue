import React, { useState, useEffect } from 'react';
import reviewService from '../services/reviewService';

export function LeaveReviewModal({
  isOpen,
  onClose,
  onSuccess,
  appointment,
  orgId,
}) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating between 1 and 5.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const targetOrgId = orgId || appointment.organization;
      await reviewService.submitReview(targetOrgId, appointment.id, {
        rating,
        comment: comment.trim(),
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.rating?.[0] ||
        'Failed to submit review. Ensure appointment is completed.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--color-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--lp-surface)',
          borderRadius: '20px',
          border: '1px solid var(--lp-border)',
          maxWidth: '520px',
          width: '100%',
          boxShadow: 'var(--card-shadow)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-review-modal-title"
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--lp-border)',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            background: 'var(--lp-bg-subtle)',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {appointment.organization_name || 'Clinic'}
            </span>
            <h3 id="leave-review-modal-title" style={{ margin: '0.1rem 0 0 0', fontSize: '1.25rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              Leave a Review
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--lp-text-subtle)',
            }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <div style={{ background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--lp-text)', fontWeight: 700 }}>
              {appointment.service_name || 'Service Consultation'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem' }}>
              Provider: <strong style={{ color: 'var(--lp-text)' }}>{appointment.provider_name || appointment.provider_title || 'Assigned Specialist'}</strong>
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
                border: '1px solid var(--color-danger)',
              }}
            >
              {error}
            </div>
          )}

          {/* Star Rating Selector */}
          <div style={{ marginBottom: '1.5rem', textAlign: 'center', background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '14px', padding: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Select Consultation Rating
            </label>
            <div style={{ display: 'inline-flex', gap: '0.5rem', cursor: 'pointer' }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= (hoverRating || rating);
                return (
                  <span
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    style={{
                      fontSize: '2.4rem',
                      color: isFilled ? 'var(--color-warning)' : 'var(--lp-border)',
                      transition: 'color 0.15s ease, transform 0.1s ease',
                      transform: isFilled ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    ★
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-warning)', marginTop: '0.35rem', fontWeight: 700 }}>
              {rating === 5 ? '★ 5 - Excellent Care' : rating === 4 ? '★ 4 - Very Good' : rating === 3 ? '★ 3 - Average' : rating === 2 ? '★ 2 - Poor Experience' : '★ 1 - Terrible'}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="review-comment" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
              Written Feedback (Optional)
            </label>
            <textarea
              id="review-comment"
              rows="3"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Tell us what went well or how the clinic can improve..."
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--lp-border)',
                backgroundColor: 'var(--lp-surface)',
                color: 'var(--lp-text)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              disabled={submitting}
            />
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '0.25rem' }}>
              {comment.length}/500 characters
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.7rem 1.25rem',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-text)',
                border: '1px solid var(--lp-border)',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.7rem 1.4rem',
                background: 'var(--lp-accent)',
                color: 'var(--lp-btn-text)',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(95, 122, 112, 0.25)',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LeaveReviewModal;
