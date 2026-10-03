import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiClient } from '../api/client';

export function ReportIssueModal({ isOpen, appointment, onSuccess, onClose }) {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [reason, setReason] = useState('CHECKED_IN_NOT_SERVED');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const resp = await apiClient.post(`/customer/appointments/${appointment.id}/report-issue/`, {
        reason,
        details: details.trim(),
      });
      showSuccess(resp.data?.detail || 'Issue report submitted successfully.');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to submit issue report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--lp-surface)',
          borderRadius: '16px',
          border: '1px solid var(--lp-border)',
          padding: '2rem',
          maxWidth: '520px',
          width: '100%',
          boxShadow: 'var(--lp-shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
            Report Service Discrepancy
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              color: 'var(--lp-text-subtle)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
          Submit a service report regarding your appointment at{' '}
          <strong style={{ color: 'var(--lp-text)' }}>{appointment.organization_name}</strong>. Clinic staff and support will review your claim.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
              Reason for Report
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--lp-border)',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-text)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            >
              <option value="CHECKED_IN_NOT_SERVED">I checked in but was not served</option>
              <option value="RECEIVED_SERVICE_NOT_UPDATED">I received the service, but the appointment was not updated</option>
              <option value="LEFT_BEFORE_CONSULTATION">I left before the consultation</option>
              <option value="OTHER">Other issue</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
              Additional Details (Optional)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add any relevant context for clinic staff..."
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--lp-border)',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-text)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.65rem 1.1rem',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-text-subtle)',
                border: '1px solid var(--lp-border)',
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
                background: 'var(--color-warning, #d97706)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReportIssueModal;
