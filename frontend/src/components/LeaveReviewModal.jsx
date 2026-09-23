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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        zIndex: 1000,
        padding: '1rem',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E6E1D9',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(47, 37, 32, 0.15)',
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
            borderBottom: '1px solid #E6E1D9',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            background: '#FAF8F3',
          }}
        >
          <h3 id="leave-review-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: '#211C19', fontWeight: 700 }}>
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
              color: '#78716C',
            }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <p style={{ margin: '0 0 1rem 0', color: '#5C544E', fontSize: '0.9rem', lineHeight: 1.4 }}>
            Share your experience for <strong>{appointment.service_name || 'Service'}</strong> with{' '}
            <strong>{appointment.provider_name || 'Provider'}</strong>.
          </p>

          {error && (
            <div
              style={{
                background: '#FEE2E2',
                color: '#991B1B',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                border: '1px solid #FCA5A5',
              }}
            >
              {error}
            </div>
          )}

          {/* Star Rating Selector */}
          <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.5rem' }}>
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
                      color: isFilled ? '#B06D2E' : '#E6E1D9',
                      transition: 'color 0.15s ease, transform 0.1s ease',
                      transform: isFilled ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    ★
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#78716C', marginTop: '0.25rem', fontWeight: 600 }}>
              {rating === 5 ? 'Excellent' : rating === 4 ? 'Very Good' : rating === 3 ? 'Average' : rating === 2 ? 'Poor' : 'Terrible'}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="review-comment" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
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
                border: '1px solid #E6E1D9',
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
                background: '#FAF8F3',
                color: '#5C544E',
                border: '1px solid #E6E1D9',
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
                background: '#5F7A70',
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
