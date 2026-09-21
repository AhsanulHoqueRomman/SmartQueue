import React, { useState, useEffect } from 'react';

export function CancelAppointmentModal({
  isOpen,
  onClose,
  onConfirm,
  appointment,
}) {
  const [reason, setReason] = useState('');
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
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason);
      setReason('');
      onClose();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.cancellation_reason?.[0] ||
        'Failed to cancel appointment. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedDate = appointment.start_datetime
    ? new Date(appointment.start_datetime).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const formattedTime = appointment.start_datetime
    ? new Date(appointment.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

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
        aria-labelledby="cancel-modal-title"
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
          <h3 id="cancel-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
            Cancel Appointment
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#78716C' }}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <p style={{ margin: '0 0 1rem 0', color: '#5C544E', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Are you sure you want to cancel your appointment for{' '}
            <strong>{appointment.service_name || 'Service Consultation'}</strong> at{' '}
            <strong>{appointment.organization_name || 'the clinic'}</strong> on{' '}
            <strong>{formattedDate} at {formattedTime}</strong>?
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

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="cancellation-reason" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
              Reason for cancellation (optional)
            </label>
            <textarea
              id="cancellation-reason"
              rows="3"
              placeholder="Please share any reason for cancelling..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
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
              Keep Appointment
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                minWidth: '150px',
                padding: '0.65rem 1.25rem',
                background: submitting ? '#78716C' : '#B4534B',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CancelAppointmentModal;
