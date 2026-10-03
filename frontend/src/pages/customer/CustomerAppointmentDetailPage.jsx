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
  const isFuture = appointment.temporal_classification === 'future';
  const qStatus = isFuture ? appointment.status : (qEntry?.status || appointment.status);
  const qId = qEntry?.id || appointment.id;
  const orgId = appointment.organization_id || appointment.organization;

  const canCheckIn = appointment.can_check_in !== undefined
    ? appointment.can_check_in
    : (appointment.temporal_classification === 'today' && appointment.status === 'CONFIRMED');
  const canCancel = appointment.can_cancel !== undefined
    ? appointment.can_cancel
    : (['CONFIRMED', 'PENDING'].includes(appointment.status) && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'IN_PROGRESS'].includes(qStatus));
  const isLive = !isFuture && (
    appointment.is_live_queue !== undefined
      ? appointment.is_live_queue
      : ['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus)
  );
  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(qStatus);

  const formatDateStr = (isoStr, fallbackDateStr) => {
    if (isoStr) {
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    if (fallbackDateStr) {
      const d = new Date(fallbackDateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    return 'Scheduled Date';
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formattedScheduleDate = formatDateStr(appointment.start_datetime, appointment.appointment_date);
  const startTimeStr = formatTime(appointment.start_datetime);
  const endTimeStr = formatTime(appointment.end_datetime);

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

  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!newDate) return;
    const orgId = appointment.organization_id || appointment.organization;
    setRescheduling(true);
    try {
      await appointmentService.rescheduleAppointment(orgId, appointment.id, {
        appointment_date: newDate,
      });
      showSuccess('Appointment rescheduled successfully! New queue serial allocated.');
      setRescheduleModalOpen(false);
      await fetchDetail();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.appointment_date?.[0] || 'Reschedule failed. Please select an operational date for this provider.';
      showError(msg);
    } finally {
      setRescheduling(false);
    }
  };

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
            color: 'var(--lp-accent)',
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
          background: 'var(--lp-surface)',
          borderRadius: '20px',
          border: '1px solid var(--lp-border)',
          padding: '2rem',
          boxShadow: 'var(--lp-shadow-sm)',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--lp-border)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {appointment.organization_category || 'CLINIC'} &bull; {appointment.organization_name || 'Organization'}
            </span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--lp-text)', fontFamily: 'Cinzel, serif', margin: '0.2rem 0 0 0' }}>
              {appointment.service_name || 'Appointment Service'}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginTop: '0.25rem' }}>
              Appointment UUID: <span style={{ fontFamily: 'monospace' }}>#{appointment.id}</span>
            </div>
          </div>
          <StatusBadge status={qStatus} />
        </div>

        {/* Primary Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
          <div style={{ background: 'var(--lp-bg-subtle)', borderRadius: '12px', border: '1px solid var(--lp-border)', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📅 Schedule & Time
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.4rem' }}>
              {formattedScheduleDate}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem' }}>
              {startTimeStr && endTimeStr ? `${startTimeStr} – ${endTimeStr}` : (startTimeStr || 'Scheduled Consultation')}
            </div>
          </div>

          <div style={{ background: 'var(--lp-bg-subtle)', borderRadius: '12px', border: '1px solid var(--lp-border)', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              👨‍⚕️ Provider & Category
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.4rem' }}>
              {appointment.provider_name || appointment.provider_title || 'Assigned Specialist'}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem' }}>
              Category: {appointment.category_name || 'General Consultation'}
            </div>
          </div>

          <div style={{ background: 'var(--lp-bg-subtle)', borderRadius: '12px', border: '1px solid var(--lp-border)', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎫 Serial & Booking Info
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', marginTop: '0.2rem' }}>
              #{appointment.serial_number || qEntry?.token_number || '—'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem' }}>
              Channel: {appointment.booking_channel || 'ONLINE'} &bull; Type: {appointment.arrival_type || 'SCHEDULED'}
            </div>
          </div>
        </div>

        {/* Live Queue Telemetry Box if active */}
        {isLive && qEntry && (
          <div
            style={{
              background: 'var(--lp-bg-subtle)',
              border: '1px solid var(--lp-border)',
              borderRadius: '16px',
              padding: '1.25rem',
              marginBottom: '1.75rem',
            }}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.85rem' }}>
              🟢 Live Queue Telemetry Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Your Serial</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--lp-btn-bg)', fontFamily: 'Outfit, sans-serif' }}>
                  #{appointment.serial_number || qEntry?.token_number || '—'}
                </div>
              </div>

              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Now Serving</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif' }}>
                  {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
                </div>
              </div>

              <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '10px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>People Ahead</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif' }}>
                  {qStatus === 'CALLED' || qStatus === 'IN_PROGRESS' ? '0' : peopleAhead}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', fontWeight: 600 }}>Estimated Service: </span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--lp-text)' }}>{estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}</strong>
              </div>

              {recArrivalStr && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', fontWeight: 600 }}>Recommended Arrival: </span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--lp-accent)' }}>{recArrivalStr}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes section */}
        {appointment.notes && (
          <div style={{ marginBottom: '1.5rem', background: 'var(--lp-bg-subtle)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--lp-border)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.4rem' }}>
              📝 Additional Notes / Symptoms
            </div>
            <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {appointment.notes}
            </p>
          </div>
        )}

        {/* Cancellation Reason */}
        {appointment.cancellation_reason && (
          <div style={{ marginBottom: '1.5rem', background: 'var(--color-danger-light)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--color-danger)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-danger)', marginBottom: '0.4rem' }}>
              ⚠️ Cancellation Reason
            </div>
            <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: '0.9rem' }}>
              {appointment.cancellation_reason}
            </p>
          </div>
        )}

        {/* Created Date */}
        <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', marginBottom: '1.75rem' }}>
          Booked on: {new Date(appointment.created_at).toLocaleString()}
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid var(--lp-border)' }}>
          {canCheckIn && !isTerminal && (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              style={{
                padding: '0.75rem 1.5rem',
                background: checkingIn ? 'var(--lp-text-subtle)' : 'var(--color-warning)',
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

          {canCancel && (
            <button
              onClick={() => {
                setNewDate(appointment.appointment_date || new Date().toISOString().slice(0, 10));
                setRescheduleModalOpen(true);
              }}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-accent)',
                border: '1px solid var(--lp-border)',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              📅 Reschedule Date
            </button>
          )}

          {isLive && qEntry?.id && (
            <button
              onClick={() => navigate(`/customer/queue/${qEntry.id}`)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--lp-btn-bg)',
                color: 'var(--lp-btn-text)',
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
                background: 'var(--lp-bg-subtle)',
                color: 'var(--color-warning)',
                border: '1px solid var(--lp-border)',
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
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-danger)',
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

      {/* Reschedule Modal */}
      {rescheduleModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--lp-surface)', borderRadius: '16px', padding: '1.75rem', maxWidth: '450px', width: '100%', boxShadow: 'var(--lp-shadow-sm)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--lp-text)' }}>Reschedule Queue Appointment</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', marginBottom: '1.25rem' }}>
              Select a new date. The system will atomically allocate your new serial position for that date.
            </p>
            <form onSubmit={handleRescheduleSubmit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="reschedule-date">New Appointment Date</label>
                <input
                  type="date"
                  id="reschedule-date"
                  className="form-control"
                  min={new Date().toISOString().slice(0, 10)}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setRescheduleModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={rescheduling}>
                  {rescheduling ? 'Allocating New Serial...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
