import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import queueService from '../../services/queueService';
import CancelAppointmentModal from '../../components/CancelAppointmentModal';
import LeaveReviewModal from '../../components/LeaveReviewModal';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerAppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrg } = useTenant();

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  
  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [activeQueueEntryId, setActiveQueueEntryId] = useState(null);

  const fetchDetail = async () => {
    if (!currentOrg?.id || !id) return;
    setLoading(true);
    setError(null);

    try {
      const data = await appointmentService.getAppointmentDetail(currentOrg.id, id);
      setAppointment(data);

      // Check if there is an active queue entry for this appointment
      if (['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED'].includes(data.status)) {
        try {
          const qRes = await queueService.getMyQueue(currentOrg.id);
          const qList = Array.isArray(qRes) ? qRes : qRes.results || [];
          const match = qList.find((q) => String(q.appointment_id) === String(id));
          if (match) {
            setActiveQueueEntryId(match.id);
          }
        } catch (qErr) {
          // Ignore background queue lookup failure
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load appointment details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [currentOrg?.id, id]);

  const handleCheckIn = async () => {
    if (!appointment || !currentOrg?.id) return;
    setCheckingIn(true);
    setActionFeedback(null);
    setError(null);

    try {
      const updated = await appointmentService.checkInAppointment(
        currentOrg.id,
        appointment.id
      );
      setAppointment(updated);

      try {
        const qRes = await queueService.getMyQueue(currentOrg.id);
        const qList = Array.isArray(qRes) ? qRes : qRes.results || [];
        const match = qList.find((q) => String(q.appointment_id) === String(appointment.id));
        if (match) {
          setActiveQueueEntryId(match.id);
          setActionFeedback({
            type: 'success',
            message: `Successfully checked in! Your queue token is #${match.token_number || match.id}.`,
          });
          return;
        }
      } catch (qErr) {}

      setActionFeedback({
        type: 'success',
        message: 'Successfully checked in! You have been added to the provider queue.',
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to check in. Please verify your appointment status.',
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleConfirmCancel = async (reason) => {
    if (!appointment || !currentOrg?.id) return;
    try {
      const updated = await appointmentService.cancelAppointment(
        currentOrg.id,
        appointment.id,
        reason
      );
      setAppointment(updated);
      setActionFeedback({
        type: 'success',
        message: 'Appointment was successfully cancelled.',
      });
      setCancelModalOpen(false);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel appointment.';
      setActionFeedback({ type: 'error', message: msg });
      setCancelModalOpen(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading appointment details..." />;
  }

  if (error || !appointment) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          title="Appointment Not Found"
          message={error || 'Unable to locate the requested appointment record.'}
          actionText="Back to My Appointments"
          onAction={() => navigate('/customer/appointments')}
        />
      </div>
    );
  }

  const canCheckIn = appointment.status === 'CONFIRMED';
  const canCancel = ['CONFIRMED', 'PENDING'].includes(appointment.status);
  const inQueue = ['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(appointment.status);

  const startDate = new Date(appointment.start_datetime);
  const endDate = new Date(appointment.end_datetime);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto' }}>
      {/* Top back navigation */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          to="/customer/appointments"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: '#5F7A70',
            fontWeight: 600,
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          ← Back to My Appointments
        </Link>
      </div>

      {/* Main Header Card */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E6E1D9',
          padding: '2rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #FAF8F3', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#78716C', fontFamily: 'monospace', marginBottom: '0.25rem' }}>
              APPOINTMENT #{appointment.id}
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#211C19', fontFamily: 'Cinzel, serif', margin: 0 }}>
              {appointment.service_name || 'Appointment Service'}
            </h1>
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {actionFeedback && (
          <div
            className={`banner ${actionFeedback.type === 'success' ? 'banner-success' : 'banner-danger'}`}
            style={{ marginBottom: '1.5rem' }}
          >
            {actionFeedback.message}
          </div>
        )}

        {/* Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
          <div style={{ background: '#FAF8F3', borderRadius: '12px', border: '1px solid #E6E1D9', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📅 Schedule & Time
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#211C19', marginTop: '0.4rem' }}>
              {startDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#78716C', marginTop: '0.2rem' }}>
              {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          <div style={{ background: '#FAF8F3', borderRadius: '12px', border: '1px solid #E6E1D9', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              👨‍⚕️ Provider & Organization
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#211C19', marginTop: '0.4rem' }}>
              {appointment.provider_name || 'Assigned Provider'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#78716C', marginTop: '0.2rem' }}>
              🏢 {currentOrg?.name || 'SmartQueue Clinic'}
            </div>
          </div>
        </div>

        {/* Notes section */}
        {appointment.notes && (
          <div style={{ marginBottom: '1.5rem', background: '#FAF8F3', borderRadius: '12px', padding: '1.25rem', border: '1px solid #E6E1D9' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#211C19', marginBottom: '0.4rem' }}>
              📝 Additional Notes / Symptoms
            </div>
            <p style={{ margin: 0, color: '#5C544E', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {appointment.notes}
            </p>
          </div>
        )}

        {/* Cancellation Reason */}
        {appointment.cancellation_reason && (
          <div style={{ marginBottom: '1.5rem', background: '#FEE2E2', borderRadius: '12px', padding: '1.25rem', border: '1px solid #FCA5A5' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.4rem' }}>
              ⚠️ Cancellation Reason
            </div>
            <p style={{ margin: 0, color: '#7F1D1D', fontSize: '0.9rem' }}>
              {appointment.cancellation_reason}
            </p>
          </div>
        )}

        {/* Created Date */}
        <div style={{ fontSize: '0.8rem', color: '#78716C', marginBottom: '1.75rem', display: 'flex', gap: '1.5rem' }}>
          <span>Booked on: {new Date(appointment.created_at).toLocaleString()}</span>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid #E6E1D9' }}>
          {canCheckIn && (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#5F7A70',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              {checkingIn ? 'Checking in...' : '⚡ Check-In Now'}
            </button>
          )}

          {inQueue && activeQueueEntryId && (
            <button
              onClick={() => navigate(`/customer/queue/${activeQueueEntryId}`)}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#2F2520',
                color: '#FAF8F3',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              ⏳ View Live Queue
            </button>
          )}

          {appointment.status === 'COMPLETED' && (
            <button
              onClick={() => setReviewModalOpen(true)}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#F5EFE6',
                color: '#B06D2E',
                border: '1px solid #E6E1D9',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              ★ Leave Review
            </button>
          )}

          {canCancel && (
            <button
              onClick={() => setCancelModalOpen(true)}
              style={{
                padding: '0.75rem 1.25rem',
                background: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Cancel Appointment
            </button>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {cancelModalOpen && (
        <CancelAppointmentModal
          isOpen={cancelModalOpen}
          appointment={appointment}
          onConfirm={handleConfirmCancel}
          onClose={() => setCancelModalOpen(false)}
        />
      )}

      {/* Review Modal */}
      {reviewModalOpen && (
        <LeaveReviewModal
          isOpen={reviewModalOpen}
          appointment={appointment}
          orgId={currentOrg?.id}
          onSuccess={() => {
            setActionFeedback({ type: 'success', message: 'Thank you! Your review has been recorded.' });
            fetchDetail();
          }}
          onClose={() => setReviewModalOpen(false)}
        />
      )}
    </div>
  );
}

export default CustomerAppointmentDetailPage;
