import React, { useState } from 'react';

export function CancelAppointmentModal({
  isOpen,
  onClose,
  onConfirm,
  appointment,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
    ? new Date(appointment.start_datetime).toLocaleString()
    : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-modal-title"
      >
        <div className="modal-header">
          <h3 id="cancel-modal-title" className="modal-title">
            Cancel Appointment
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Are you sure you want to cancel your appointment for{' '}
              <strong>{appointment.service_name || 'Service'}</strong> on{' '}
              <strong>{formattedDate}</strong>?
            </p>

            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label htmlFor="cancellation-reason">
                Reason for cancellation (optional)
              </label>
              <textarea
                id="cancellation-reason"
                className="form-control"
                rows="3"
                placeholder="Please tell us why you need to cancel..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Keep Appointment
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={submitting}
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
