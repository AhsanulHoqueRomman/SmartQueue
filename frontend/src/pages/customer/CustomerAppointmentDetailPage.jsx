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
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';

export function CustomerAppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals & Action states
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const fetchDetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // Direct customer detail endpoint
      const detail = await appointmentService.getCustomerAppointmentDetail(id);
      if (detail && detail.id) {
        setAppointment(detail);
        setLoading(false);
        return;
      }
    } catch (err) {
      // If direct detail fails (e.g. legacy structure), fall back to customer dashboard
    }

    try {
      const dashList = await appointmentService.getCustomerDashboard();
      const list = Array.isArray(dashList) ? dashList : dashList.results || [];
      const match = list.find((item) => String(item.id) === String(id));

      if (match) {
        setAppointment(match);
      } else {
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
  const normState = getNormalizedCustomerQueueState(appointment, qEntry);

  const isFuture = appointment.temporal_classification === 'future';
  const qStatus = isFuture ? appointment.status : (qEntry?.status || appointment.status);
  const orgId = appointment.organization_id || appointment.organization;

  const canCheckIn = appointment.can_check_in !== undefined
    ? appointment.can_check_in
    : (appointment.temporal_classification === 'today' && appointment.status === 'CONFIRMED');
  const canCancel = appointment.can_cancel !== undefined
    ? appointment.can_cancel
    : (['CONFIRMED', 'PENDING'].includes(appointment.status) && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'IN_PROGRESS'].includes(qStatus));
  const isLive = normState.can_open_telemetry;
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

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!newDate) return;
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
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto', padding: '0 0.5rem 2rem 0.5rem' }}>
      {/* Top back navigation */}
      <div style={{ marginBottom: '1.25rem' }}>
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

      {/* Title & Service Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {appointment.organization_category || 'CLINIC'} &bull; {appointment.organization_name || 'Organization'}
            </span>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--lp-text)', fontFamily: 'Cinzel, serif', margin: '0.2rem 0 0 0' }}>
              {appointment.service_name || 'Appointment Service'}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginTop: '0.25rem' }}>
              Appointment ID: <span style={{ fontFamily: 'monospace' }}>#{appointment.id}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {normState.serial_number && (
              <div style={{ background: 'var(--lp-accent-light)', border: '1px solid var(--lp-accent-border)', padding: '0.3rem 0.75rem', borderRadius: '8px', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif' }}>
                #{normState.serial_number}
              </div>
            )}
            <StatusBadge status={qStatus} />
          </div>
        </div>
      </div>

      {/* Main Content Area - De-boxed task-first presentation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        
        {/* Live Queue Status Section if active */}
        {isLive && (
          <div
            style={{
              background: normState.is_delayed ? 'var(--color-warning-light, rgba(217, 119, 6, 0.08))' : 'var(--lp-surface)',
              border: `1px solid ${normState.is_delayed ? 'var(--color-warning, #d97706)' : 'var(--lp-border)'}`,
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: 'var(--lp-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: normState.is_delayed ? 'var(--color-warning)' : 'var(--lp-accent)', letterSpacing: '0.04em' }}>
                  Live Queue Status
                </span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.15rem 0 0 0', color: 'var(--lp-text)' }}>
                  {normState.headline}
                </h2>
              </div>

              {normState.is_delayed && (
                <span style={{ background: 'var(--color-warning)', color: '#FFFFFF', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Running behind schedule
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 1.25rem 0', color: 'var(--lp-text-subtle)', fontSize: '0.925rem', lineHeight: 1.5 }}>
              {normState.guidance}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--lp-border)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Your Serial</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif' }}>
                  #{normState.serial_number || '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Now Serving</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif' }}>
                  {normState.now_serving ? `#${normState.now_serving}` : 'Not started'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>People Ahead</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif' }}>
                  {normState.people_ahead ?? 0}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Expected Service</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.2rem' }}>
                  {normState.estimated_window}
                </div>
              </div>
            </div>

            {qEntry?.id && (
              <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
                <button
                  onClick={() => navigate(`/customer/queue/${qEntry.id}`)}
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: 'var(--lp-btn-bg)',
                    color: 'var(--lp-btn-text)',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Open Full Live Telemetry →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Schedule & Location Details */}
        <div style={{ borderBottom: '1px solid var(--lp-border)', paddingBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 1rem 0' }}>
            📅 Schedule & Consultation Details
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Date & Time</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.25rem' }}>
                {formattedScheduleDate}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', marginTop: '0.15rem' }}>
                {startTimeStr && endTimeStr ? `${startTimeStr} – ${endTimeStr}` : (startTimeStr || 'Scheduled Consultation')}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Assigned Specialist</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.25rem' }}>
                {appointment.provider_name || appointment.provider_title || 'Assigned Specialist'}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', marginTop: '0.15rem' }}>
                Category: {appointment.category_name || 'General Consultation'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>Location</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--lp-text)', marginTop: '0.25rem' }}>
                {appointment.organization_name || 'Organization Clinic'}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', marginTop: '0.15rem' }}>
                {appointment.arrival_type || 'SCHEDULED'} &bull; {appointment.booking_channel || 'ONLINE'}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Notes section */}
        {appointment.notes && (
          <div style={{ borderBottom: '1px solid var(--lp-border)', paddingBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.5rem 0' }}>
              📝 Patient Notes / Symptoms
            </h3>
            <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {appointment.notes}
            </p>
          </div>
        )}

        {/* Cancellation Reason */}
        {appointment.cancellation_reason && (
          <div style={{ background: 'var(--color-danger-light)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--color-danger)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-danger)', marginBottom: '0.4rem' }}>
              ⚠️ Cancellation Reason
            </div>
            <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: '0.9rem' }}>
              {appointment.cancellation_reason}
            </p>
          </div>
        )}

        <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)' }}>
          Booked on: {new Date(appointment.created_at).toLocaleString()}
        </div>

        {/* Action Controls Bar */}
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

