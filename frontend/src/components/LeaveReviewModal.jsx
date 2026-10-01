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
          background: 'var(--color-surface)',
          borderRadius: '16px',
          border: '1px solid var(--color-border)',
          maxWidth: '480px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
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
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            background: 'var(--color-bg-subtle)',
          }}
        >
          <h3 id="leave-review-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-text-main)', fontWeight: 700 }}>
            Leave a Review
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
            }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.4 }}>
            Share your experience for <strong style={{ color: 'var(--color-text-main)' }}>{appointment.service_name || 'Service'}</strong> with{' '}
            <strong style={{ color: 'var(--color-text-main)' }}>{appointment.provider_name || 'Provider'}</strong>.
          </p>

          {error && (
            <div
              style={{
                background: 'var(--color-error-bg)',
                color: 'var(--color-error)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                border: '1px solid var(--color-error-border)',
              }}
            >
              {error}
            </div>
          )}

          {/* Star Rating Selector */}
          <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '0.5rem' }}>
              Your Rating
            </label>
            <div style={{ display: 'inline-flex', gap: '0.4rem', cursor: 'pointer' }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= (hoverRating || rating);
                return (
                  <span
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    style={{
                      fontSize: '2.2rem',
                      color: isFilled ? 'var(--color-warning)' : 'var(--color-border)',
                      transition: 'color 0.15s ease, transform 0.1s ease',
                      transform: isFilled ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    ★
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', fontWeight: 600 }}>
              {rating === 5 ? 'Excellent' : rating === 4 ? 'Very Good' : rating === 3 ? 'Average' : rating === 2 ? 'Poor' : 'Terrible'}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="review-comment" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '0.35rem' }}>
              Comments (Optional)
            </label>
            <textarea
              id="review-comment"
              rows="4"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you liked or how we can improve..."
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-main)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.65rem 1.25rem',
                background: 'var(--color-surface)',
                color: 'var(--color-text-main)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.65rem 1.25rem',
                background: 'var(--color-secondary-accent)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s ease',
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
