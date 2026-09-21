import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
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
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const fetchDetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // First try fetching from customer dashboard data across organizations
      const dashList = await appointmentService.getCustomerDashboard();
      const list = Array.isArray(dashList) ? dashList : dashList.results || [];
      const match = list.find((item) => String(item.id) === String(id));

      if (match) {
        setAppointment(match);
      } else {
        // Fallback if not found in active list
        setError('Appointment record not found in your customer schedule.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load appointment details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const handleCheckIn = async () => {
    if (!appointment) return;
    const orgId = appointment.organization_id || appointment.organization;
    setCheckingIn(true);
    setError(null);

    try {
      await appointmentService.checkInAppointment(orgId, appointment.id);
      showSuccess('Checked in successfully! You are now in the live queue.');
      await fetchDetail();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Check-in failed. Please verify your appointment status.';
      showError(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleConfirmCancel = async (reason) => {
    if (!appointment) return;
    const orgId = appointment.organization_id || appointment.organization;
    try {
      await appointmentService.cancelAppointment(orgId, appointment.id, reason);
      showSuccess('Appointment was successfully cancelled.');
      setCancelModalOpen(false);
      await fetchDetail();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel appointment.';
      showError(msg);
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
          title="Appointment Record Not Found"
          message={error || 'Unable to locate the requested appointment record.'}
          actionText="Back to My Appointments"
          onAction={() => navigate('/customer/appointments')}
        />
      </div>
    );
  }

  const qEntry = appointment.queue_entry;
  const qStatus = qEntry?.status || appointment.status;
  const qId = qEntry?.id;
  const orgId = appointment.organization_id || appointment.organization;

  const canCheckIn = appointment.status === 'CONFIRMED' || (qEntry && !qEntry.is_checked_in);
  const canCancel = ['CONFIRMED', 'PENDING'].includes(appointment.status) && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'IN_PROGRESS'].includes(qStatus);
  const isLive = ['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);
  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(qStatus);

  const startDate = new Date(appointment.start_datetime);
  const endDate = new Date(appointment.end_datetime);

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const estStartStr = qEntry?.readiness_info?.estimated_start_time
    ? formatTime(qEntry.readiness_info.estimated_start_time)
    : formatTime(appointment.start_datetime);

  const estEndStr = qEntry?.readiness_info?.estimated_end_time
    ? formatTime(qEntry.readiness_info.estimated_end_time)
    : formatTime(appointment.end_datetime);

  const recArrivalStr = qEntry?.readiness_info?.recommended_arrival_time
    ? formatTime(qEntry.readiness_info.recommended_arrival_time)
    : null;

  const readinessState = qEntry?.readiness_info?.readiness_state || 'NOT_YET';
  const peopleAhead = qEntry?.readiness_info?.people_ahead ?? 0;
  const nowServingSerial = qEntry?.readiness_info?.now_serving_serial;

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
          borderRadius: '20px',
          border: '1px solid #E6E1D9',
          padding: '2rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #FAF8F3', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {appointment.organization_category || 'CLINIC'} &bull; {appointment.organization_name || 'Organization'}
            </span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#211C19', fontFamily: 'Cinzel, serif', margin: '0.2rem 0 0 0' }}>
              {appointment.service_name || 'Appointment Service'}
            </h1>
            <div style={{ fontSize: '0.85rem', color: '#78716C', marginTop: '0.25rem' }}>
              Appointment UUID: <span style={{ fontFamily: 'monospace' }}>#{appointment.id}</span>
            </div>
          </div>
          <StatusBadge status={qStatus} />
        </div>

        {/* Primary Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
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
              👨‍⚕️ Provider & Category
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#211C19', marginTop: '0.4rem' }}>
              {appointment.provider_name || appointment.provider_title || 'Assigned Specialist'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#78716C', marginTop: '0.2rem' }}>
              Category: {appointment.category_name || 'General Consultation'}
            </div>
          </div>

          <div style={{ background: '#FAF8F3', borderRadius: '12px', border: '1px solid #E6E1D9', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎫 Serial & Booking Info
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2F2520', fontFamily: 'Outfit, sans-serif', marginTop: '0.2rem' }}>
              #{appointment.serial_number || qEntry?.token_number || '—'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#78716C', marginTop: '0.2rem' }}>
              Channel: {appointment.booking_channel || 'ONLINE'} &bull; Type: {appointment.arrival_type || 'SCHEDULED'}
            </div>
          </div>
        </div>

        {/* Live Queue Telemetry Box if active */}
        {isLive && qEntry && (
          <div
            style={{
              background: '#FAF8F3',
              border: '1px solid #E6E1D9',
              borderRadius: '16px',
              padding: '1.25rem',
              marginBottom: '1.75rem',
            }}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginBottom: '0.85rem' }}>
              🟢 Live Queue Telemetry Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Your Serial</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2F2520', fontFamily: 'Outfit, sans-serif' }}>
                  #{appointment.serial_number || qEntry.token_number}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Now Serving</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#5F7A70', fontFamily: 'Outfit, sans-serif' }}>
                  {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '10px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>People Ahead</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#B06D2E', fontFamily: 'Outfit, sans-serif' }}>
                  {qStatus === 'CALLED' || qStatus === 'IN_PROGRESS' ? '0' : peopleAhead}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #E6E1D9' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 600 }}>Estimated Service: </span>
                <strong style={{ fontSize: '0.9rem', color: '#211C19' }}>{estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}</strong>
              </div>

              {recArrivalStr && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 600 }}>Recommended Arrival: </span>
                  <strong style={{ fontSize: '0.9rem', color: '#5F7A70' }}>{recArrivalStr}</strong>
                </div>
              )}
            </div>
          </div>
        )}

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
        <div style={{ fontSize: '0.8rem', color: '#78716C', marginBottom: '1.75rem' }}>
          Booked on: {new Date(appointment.created_at).toLocaleString()}
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid #E6E1D9' }}>
          {canCheckIn && !isTerminal && (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              style={{
                padding: '0.75rem 1.5rem',
                background: checkingIn ? '#78716C' : '#B06D2E',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: checkingIn ? 'not-allowed' : 'pointer',
              }}
            >
              {checkingIn ? 'Checking in...' : '✓ Check In Now'}
            </button>
          )}

          {isLive && qId && (
            <button
              onClick={() => navigate(`/customer/queue/${qId}`)}
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
              Open Telemetry →
            </button>
          )}

          {qStatus === 'COMPLETED' && (
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
                background: '#FFF1F0',
                color: '#B4534B',
                border: '1px solid #FCA5A5',
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
          orgId={orgId}
          onSuccess={() => {
            showSuccess('Thank you! Your review has been recorded.');
            fetchDetail();
          }}
          onClose={() => setReviewModalOpen(false)}
        />
      )}
    </div>
  );
}

export default CustomerAppointmentDetailPage;
