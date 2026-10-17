import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useBookingWindow } from '../../hooks/useBookingWindow';
import { useRequestScope } from '../../hooks/useRequestScope';
import appointmentService from '../../services/appointmentService';
import CancelAppointmentModal from '../../components/CancelAppointmentModal';
import LeaveReviewModal from '../../components/LeaveReviewModal';
import ReportIssueModal from '../../components/ReportIssueModal';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { EmergencyNotice } from '../../components/EmergencyNotice';
import { formatBookingDate } from '../../utils/homeBookingDisplay.js';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';
import { confirmCustomerArrival } from '../../utils/customerArrival.js';
import { BookingSummary } from '../../components/BookingContact';
import '../../styles/CustomerAppointmentDetail.css';

export function CustomerAppointmentDetailPage() {
  const { id } = useParams();
  const { first, last } = useBookingWindow();
  const navigate = useNavigate();
  const { user } = useAuth();
  const scopeKey = `${user?.id}:${id}`;
  const scope = useRequestScope(scopeKey);
  const [loadedScope, setLoadedScope] = useState('');
  const mutationBusy = useRef(false);
  const { showSuccess, showError } = useToast();

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals & Action states
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const fetchDetail = async (showLoader = true, force = false) => {
    if (!id || !user?.id || (mutationBusy.current && !force)) return;
    const ticket = scope.begin(scopeKey, { background: !showLoader && !force });
    if (!ticket) return;
    if (showLoader) setLoading(true);
    try {
      const detail = await appointmentService.getCustomerAppointmentDetail(id);
      if (!scope.isCurrent(ticket)) return;
      if (!detail?.id) throw new Error('Appointment details unavailable');
      setAppointment(detail);
      setLoadedScope(scopeKey);
      setError(null);
    } catch (err) {
      if (scope.isCurrent(ticket)) {
        setError(err.response?.data?.error?.message || err.response?.data?.detail || 'Unable to refresh appointment information.');
      }
    } finally {
      if (scope.isCurrent(ticket)) setLoading(false);
      scope.finish(ticket);
    }
  };

  useEffect(() => {
    mutationBusy.current = false;
    setCheckingIn(false);
    setRescheduling(false);
    setCancelModalOpen(false);
    setReviewModalOpen(false);
    setReportModalOpen(false);
    setRescheduleModalOpen(false);
    setAppointment(null);
    setError(null);
    fetchDetail();
    const timer = setInterval(() => fetchDetail(false), 10000);
    return () => clearInterval(timer);
  }, [id, user?.id]);

  const handleCheckIn = async () => {
    if (!confirmCustomerArrival()) return;
    if (!appointment || mutationBusy.current) return;
    const ticket = scope.begin(scopeKey);
    if (!ticket) return;
    mutationBusy.current = true;
    const orgId = appointment.organization_id || appointment.organization;
    setCheckingIn(true);
    setError(null);

    try {
      await appointmentService.checkInAppointment(orgId, appointment.id);
      if (!scope.isCurrentScope(ticket)) return;
      showSuccess('Checked in successfully! You are now in the live queue.');
      await fetchDetail(false, true);
    } catch (err) {
      if (!scope.isCurrentScope(ticket)) return;
      const msg = err.response?.data?.error?.message || err.response?.data?.detail || 'Check-in failed. Please verify your appointment status.';
      showError(msg);
    } finally {
      if (scope.isCurrentScope(ticket)) {
        mutationBusy.current = false;
        setCheckingIn(false);
      }
    }
  };

  const handleConfirmCancel = async (reason) => {
    if (!appointment || mutationBusy.current) return;
    const ticket = scope.begin(scopeKey);
    if (!ticket) return;
    mutationBusy.current = true;
    const orgId = appointment.organization_id || appointment.organization;
    try {
      await appointmentService.cancelAppointment(orgId, appointment.id, reason);
      if (!scope.isCurrentScope(ticket)) return;
      showSuccess('Appointment was successfully cancelled.');
      setCancelModalOpen(false);
      await fetchDetail(false, true);
    } catch (err) {
      if (!scope.isCurrentScope(ticket)) return;
      const msg = err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to cancel appointment.';
      showError(msg);
      setCancelModalOpen(false);
    } finally {
      if (scope.isCurrentScope(ticket)) mutationBusy.current = false;
    }
  };

  if (loading || (loadedScope !== scopeKey && !error)) {
    return <LoadingState message="Loading appointment details..." />;
  }

  if (!appointment || loadedScope !== scopeKey) {
    return (
      <div className="animate-fade-in customer-appointment-detail">
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
    : normState.canCheckIn;
  const canCancel = appointment.can_cancel === true;
  const selfReschedule = appointment.self_reschedule;
  const canReschedule = selfReschedule?.allowed === true;
  const isLive = normState.can_open_telemetry;
  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(qStatus);

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formattedScheduleDate = formatBookingDate(appointment.appointment_date || (appointment.start_datetime ? new Date(appointment.start_datetime).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) : null));
  const startTimeStr = formatTime(normState.estimatedStartTime);
  const endTimeStr = formatTime(normState.estimatedEndTime);

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!newDate || mutationBusy.current) return;
    const ticket = scope.begin(scopeKey);
    if (!ticket) return;
    mutationBusy.current = true;
    setRescheduling(true);
    try {
      await appointmentService.rescheduleAppointment(orgId, appointment.id, {
        appointment_date: newDate,
      });
      if (!scope.isCurrentScope(ticket)) return;
      showSuccess('Appointment rescheduled successfully! New queue serial allocated.');
      setRescheduleModalOpen(false);
      await fetchDetail(false, true);
    } catch (err) {
      if (!scope.isCurrentScope(ticket)) return;
      const msg = err.response?.data?.error?.message || err.response?.data?.detail || err.response?.data?.appointment_date?.[0] || 'Reschedule failed. Please select an operational date for this provider.';
      showError(msg);
    } finally {
      if (scope.isCurrentScope(ticket)) {
        mutationBusy.current = false;
        setRescheduling(false);
      }
    }
  };

  return (
    <div className="customer-appointment-detail animate-page-entrance">
      {/* Top Navigation */}
      <div className="customer-appointment-detail__nav">
        <Link to="/customer/appointments" className="customer-appointment-detail__back-link">
          ← Back to My Appointments
        </Link>
      </div>

      {error && (
        <p className="banner banner-warning customer-appointment-detail__error-banner" role="alert">
          {error} Displaying the last successful update.
        </p>
      )}

      <EmergencyNotice appointment={appointment} />

      {/* Hero Header Card */}
      <div className="customer-appointment-detail__header-card">
        <div className="customer-appointment-detail__header-main">
          <div className="customer-appointment-detail__org-meta">
            <span>{appointment.organization_category || 'CLINIC'}</span>
            <span className="customer-appointment-detail__org-bullet" aria-hidden="true">•</span>
            <span>{appointment.organization_name || 'Organization'}</span>
          </div>
          <h1 className="customer-appointment-detail__title">
            {appointment.service_name || 'Appointment Service'}
          </h1>
          <div className="customer-appointment-detail__id-pill">
            <span>Appointment ID:</span>
            <span className="customer-appointment-detail__id-code">#{appointment.id}</span>
          </div>
        </div>

        <div className="customer-appointment-detail__badge-cluster">
          {(normState.serialNumber || appointment.serial_number) && (
            <div className="customer-appointment-detail__serial-badge">
              #{normState.serialNumber || appointment.serial_number}
            </div>
          )}
          <StatusBadge
            status={normState.rawStatus}
            customLabel={normState.isUnresolved ? 'Service outcome not recorded' : normState.displayStatus}
          />
        </div>
      </div>

      {/* Historical Reconciliation Box for Needs Follow-up Appointments */}
      {normState.isUnresolved && (
        <div className="customer-appointment-detail__reconciliation-card">
          <span className="customer-appointment-detail__reconciliation-label">Service Outcome</span>
          <h2 className="customer-appointment-detail__reconciliation-title">Service outcome not recorded</h2>
          <p className="customer-appointment-detail__reconciliation-text">
            You checked in for this appointment, but QueueTurn does not have a final service outcome recorded for this consultation.
          </p>

          <div className="customer-appointment-detail__reconciliation-footer">
            <span className="customer-appointment-detail__reconciliation-time">
              Checked in: <strong>{qEntry?.checked_in_at ? new Date(qEntry.checked_in_at).toLocaleString() : 'Verified'}</strong>
            </span>

            {appointment.has_issue_report ? (
              <span className="customer-appointment-detail__reported-badge">
                ✓ Issue Reported
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setReportModalOpen(true)}
              >
                ⚠️ Report an Issue
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live Queue Status Section if active */}
      {isLive && !normState.isUnresolved && (
        <div className={`customer-appointment-detail__live-queue-card ${normState.is_delayed ? 'is-delayed' : ''}`}>
          <div className="customer-appointment-detail__live-header">
            <div>
              <span className="customer-appointment-detail__live-tag">Live Queue Status</span>
              <h2 className="customer-appointment-detail__live-headline">{normState.headline}</h2>
            </div>

            {normState.is_delayed && (
              <span className="customer-appointment-detail__delay-badge">
                Running behind schedule
              </span>
            )}
          </div>

          <p className="customer-appointment-detail__live-guidance">{normState.guidance}</p>

          <div className="customer-appointment-detail__queue-grid">
            <div className="customer-appointment-detail__metric-box">
              <span className="customer-appointment-detail__metric-label">Your Serial</span>
              <span className="customer-appointment-detail__metric-value">
                #{normState.serialNumber || appointment.serial_number || '—'}
              </span>
            </div>

            <div className="customer-appointment-detail__metric-box">
              <span className="customer-appointment-detail__metric-label">Now Serving</span>
              <span className="customer-appointment-detail__metric-value is-accent">
                {normState.nowServing ? `#${normState.nowServing}` : 'Not started'}
              </span>
            </div>

            <div className="customer-appointment-detail__metric-box">
              <span className="customer-appointment-detail__metric-label">Scheduled Ahead</span>
              <span className="customer-appointment-detail__metric-value is-warning">
                {normState.scheduledAhead}
              </span>
            </div>

            <div className="customer-appointment-detail__metric-box">
              <span className="customer-appointment-detail__metric-label">Checked-In Ahead</span>
              <span className="customer-appointment-detail__metric-value">
                {normState.checkedInAhead}
              </span>
            </div>

            <div className="customer-appointment-detail__metric-box">
              <span className="customer-appointment-detail__metric-label">Expected Service</span>
              <span className="customer-appointment-detail__metric-value is-time">
                {formatTime(normState.estimatedStartTime) && formatTime(normState.estimatedEndTime)
                  ? `${formatTime(normState.estimatedStartTime)} – ${formatTime(normState.estimatedEndTime)}`
                  : (formatTime(normState.estimatedStartTime) || 'Around appointment time')}
              </span>
            </div>
          </div>

          {qEntry?.id && (
            <div className="customer-appointment-detail__telemetry-action">
              <button
                type="button"
                className="btn btn-primary customer-appointment-detail__telemetry-btn"
                onClick={() => navigate(`/customer/queue/${qEntry.id}`)}
              >
                Open Full Live Telemetry →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Schedule & Consultation Details */}
      <div className="customer-appointment-detail__details-card">
        <h3 className="customer-appointment-detail__section-title">
          📅 Schedule & Consultation Details
        </h3>

        <div className="customer-appointment-detail__info-grid">
          <div className="customer-appointment-detail__info-block">
            <span className="customer-appointment-detail__info-label">Booking Date</span>
            <span className="customer-appointment-detail__info-val">{formattedScheduleDate}</span>
            <span className="customer-appointment-detail__info-sub">
              {startTimeStr && endTimeStr ? `${startTimeStr} – ${endTimeStr}` : (startTimeStr || normState.timingPlaceholder)}
            </span>
          </div>

          <div className="customer-appointment-detail__info-block">
            <span className="customer-appointment-detail__info-label">Assigned Specialist</span>
            <span className="customer-appointment-detail__info-val">
              {appointment.provider_name || appointment.provider_title || 'Assigned Specialist'}
            </span>
            <span className="customer-appointment-detail__info-sub">
              Category: {appointment.category_name || 'General Consultation'}
            </span>
          </div>

          <div className="customer-appointment-detail__info-block">
            <span className="customer-appointment-detail__info-label">Location</span>
            <span className="customer-appointment-detail__info-val">
              {appointment.organization_name || 'Organization Clinic'}
            </span>
            <span className="customer-appointment-detail__info-sub">
              {appointment.arrival_type || 'SCHEDULED'} • {appointment.booking_channel || 'ONLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Booking Snapshots */}
      <BookingSummary appointment={appointment} organization={{ name: appointment.organization_name }} />

      {/* Additional Notes */}
      {appointment.notes && (
        <div className="customer-appointment-detail__notes-card">
          <h3 className="customer-appointment-detail__notes-label">📝 Patient Notes / Symptoms</h3>
          <p className="customer-appointment-detail__notes-content">{appointment.notes}</p>
        </div>
      )}

      {/* Cancellation Reason */}
      {appointment.cancellation_reason && (
        <div className="customer-appointment-detail__cancellation-banner">
          <h3 className="customer-appointment-detail__cancellation-title">⚠️ Cancellation Reason</h3>
          <p className="customer-appointment-detail__cancellation-reason">{appointment.cancellation_reason}</p>
        </div>
      )}

      <div className="customer-appointment-detail__timestamp-strip">
        Booked on: {new Date(appointment.created_at).toLocaleString()}
      </div>

      {/* Action Controls Bar */}
      <div className="customer-appointment-detail__action-bar">
        {canCheckIn && !isTerminal && (
          <button
            type="button"
            className="btn btn-warning customer-appointment-detail__btn-checkin"
            onClick={handleCheckIn}
            disabled={checkingIn}
          >
            {checkingIn ? 'Checking in...' : '✓ Check In Now'}
          </button>
        )}

        {canReschedule && (
          <button
            type="button"
            className="btn btn-outline customer-appointment-detail__btn-reschedule"
            onClick={() => {
              setNewDate(appointment.appointment_date || first);
              setRescheduleModalOpen(true);
            }}
          >
            📅 Reschedule Date
          </button>
        )}

        {appointment.can_review === true && (
          <button
            type="button"
            className="btn btn-outline customer-appointment-detail__btn-review"
            onClick={() => setReviewModalOpen(true)}
          >
            ★ Leave Review
          </button>
        )}

        {canCancel && (
          <button
            type="button"
            className="btn customer-appointment-detail__btn-cancel"
            onClick={() => setCancelModalOpen(true)}
          >
            Cancel Appointment
          </button>
        )}
      </div>

      {!isTerminal && selfReschedule && !selfReschedule.allowed && (
        <div className="customer-appointment-detail__reschedule-banner" role="status">
          <span>{selfReschedule.message}</span>
          <button type="button" className="btn btn-sm btn-outline" onClick={fetchDetail}>
            Refresh eligibility
          </button>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModalOpen && (
        <div
          className="customer-appointment-detail__modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-modal-title"
        >
          <div className="customer-appointment-detail__modal-dialog">
            <h3 id="reschedule-modal-title" className="customer-appointment-detail__modal-title">
              Reschedule Queue Appointment
            </h3>
            <p className="customer-appointment-detail__modal-desc">
              Select a new date. The system will atomically allocate your new serial position for that date.
            </p>
            <form onSubmit={handleRescheduleSubmit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="reschedule-date">New Appointment Date</label>
                <input
                  type="date"
                  id="reschedule-date"
                  className="form-control"
                  min={first}
                  max={last}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>
              <div className="customer-appointment-detail__modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRescheduleModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={rescheduling}
                >
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

      {/* Report Issue Modal */}
      {reportModalOpen && (
        <ReportIssueModal
          isOpen={reportModalOpen}
          appointment={appointment}
          onSuccess={() => {
            fetchDetail();
          }}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}

export default CustomerAppointmentDetailPage;
