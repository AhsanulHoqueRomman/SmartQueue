import { EmergencyNotice } from '../../components/EmergencyNotice';
import { formatBookingDate } from '../../utils/homeBookingDisplay.js';
import { useRequestScope } from '../../hooks/useRequestScope';
import { useAuth } from '../../contexts/AuthContext';
import { confirmCustomerArrival } from '../../utils/customerArrival.js';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import appointmentService from '../../services/appointmentService';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import ReportIssueModal from '../../components/ReportIssueModal';
import '../../styles/CustomerLiveQueue.css';

export function CustomerLiveQueuePage() {
  const { queueEntryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const scopeKey = `${user?.id}:${queueEntryId}`;
  const scope = useRequestScope(scopeKey);
  const [loadedScope, setLoadedScope] = useState('');
  const actionBusy = useRef(false);

  const [myQueueEntry, setMyQueueEntry] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const timerRef = useRef(null);

  const fetchQueueStatus = async (isManual = false) => {
    if (!queueEntryId || !user?.id || actionBusy.current) return;
    const ticket = scope.begin(scopeKey, { background: !isManual });
    if (!ticket) return;
    if (isManual) setRefreshing(true);
    try {
      const data = await appointmentService.getCustomerDashboard();
      if (!scope.isCurrent(ticket)) return;
      const list = Array.isArray(data) ? data : data.results || [];
      const match = list.find(item => String(item.queue_entry?.id) === String(queueEntryId) || String(item.id) === String(queueEntryId));
      if (!match?.queue_entry) {
        setMyQueueEntry(null); setAppointment(match || null);
        setError('Queue telemetry is unavailable for this appointment. Please open appointment details or contact the organization.');
        return;
      }
      setAppointment(match); setMyQueueEntry(match.queue_entry);
      setLoadedScope(scopeKey); setLastUpdated(new Date()); setError(null);
    } catch (err) {
      if (scope.isCurrent(ticket)) setError(err.response?.data?.error?.message || err.response?.data?.detail || 'Last refresh failed. Displayed information is from the last successful update.');
    } finally {
      if (scope.isCurrent(ticket)) { setLoading(false); setRefreshing(false); }
      scope.finish(ticket);
    }
  };

  const handleCheckInNow = async () => {
    if (!confirmCustomerArrival()) return;
    const orgId = appointment?.organization_id || appointment?.organization || myQueueEntry?.organization_id;
    const apptId = appointment?.id || myQueueEntry?.appointment_id;
    if (!orgId || !apptId) return;

    if (actionBusy.current) return;
    const ticket = scope.begin(scopeKey);
    if (!ticket) return;
    actionBusy.current = true;
    setCheckingIn(true);
    try {
      await appointmentService.checkInAppointment(orgId, apptId);
      if (!scope.isCurrent(ticket)) return;
      actionBusy.current = false;
      await fetchQueueStatus(true);
    } catch (err) {
      if (scope.isCurrent(ticket)) setError(err.response?.data?.error?.message || err.response?.data?.detail || 'Check-in failed. Please verify your appointment date.');
    } finally {
      if (scope.isCurrentScope(ticket)) { actionBusy.current = false; setCheckingIn(false); }
    }
  };

  useEffect(() => {
    actionBusy.current = false; setMyQueueEntry(null); setAppointment(null); setError(null); setLoading(true);
    fetchQueueStatus();

    timerRef.current = setInterval(() => {
      fetchQueueStatus();
    }, 10000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [queueEntryId, user?.id]);

  useEffect(() => {
    if (myQueueEntry && ['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(myQueueEntry.status)) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [myQueueEntry?.status]);

  if (loading || (loadedScope !== scopeKey && !error)) {
    return <LoadingState message="Connecting to live queue telemetry..." />;
  }

  if (!myQueueEntry || loadedScope !== scopeKey) {
    return (
      <div className="customer-live-queue animate-fade-in">
        <EmptyState
          title="Queue Information Unavailable"
          message={error || 'Could not retrieve active queue status for this appointment.'}
          actionText="Back to My Appointments"
          onAction={() => navigate('/customer/appointments')}
        />
      </div>
    );
  }

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Derive normalized presentation model
  const qState = getNormalizedCustomerQueueState(appointment, myQueueEntry);
  const nowServingSerial = qState.nowServing;
  const canCheckIn = appointment?.can_check_in !== undefined
    ? appointment.can_check_in
    : qState.canCheckIn;

  if (qState.isPast || !qState.can_open_telemetry) {
    const formattedDate = formatBookingDate(appointment?.appointment_date || (appointment?.start_datetime
      ? new Date(appointment.start_datetime).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) : null));

    return (
      <div className="customer-live-queue animate-page-entrance">
        <EmergencyNotice appointment={appointment} />
        <div className="customer-live-queue__top-nav">
          <Link
            to="/customer/appointments"
            className="customer-live-queue__back-link"
          >
            ← Back to My Appointments
          </Link>
        </div>

        <div className="customer-live-queue__inactive-card">
          <div className="customer-live-queue__inactive-icon" aria-hidden="true">⏱️</div>
          <h2 className="customer-live-queue__inactive-title">
            This Queue Session Is No Longer Active
          </h2>
          <p className="customer-live-queue__inactive-desc">
            {qState.isUnresolved
              ? `This queue session was scheduled for ${formattedDate}. You checked in, but no consultation outcome was recorded by clinic staff.`
              : qState.guidance}
          </p>

          <div className="customer-live-queue__inactive-actions">
            <button
              onClick={() => navigate(`/customer/appointments/${appointment?.id || queueEntryId}`)}
              className="customer-live-queue__details-btn"
            >
              View Appointment Details
            </button>

            {qState.isUnresolved && (
              appointment?.has_issue_report ? (
                <span className="customer-live-queue__reported-badge">
                  ✓ Issue Reported
                </span>
              ) : (
                <button
                  onClick={() => setReportModalOpen(true)}
                  className="customer-live-queue__report-btn"
                >
                  ⚠️ Report an Issue
                </button>
              )
            )}
          </div>
        </div>

        {reportModalOpen && appointment && (
          <ReportIssueModal
            isOpen={reportModalOpen}
            appointment={appointment}
            onSuccess={() => fetchQueueStatus()}
            onClose={() => setReportModalOpen(false)}
          />
        )}
      </div>
    );
  }

  const estStartStr = formatTime(qState.estimatedStartTime);
  const estEndStr = formatTime(qState.estimatedEndTime);

  return (
    <div className="customer-live-queue animate-page-entrance">
      {error && <p className="customer-live-queue__error-banner" role="alert">{error}</p>}

      {/* Top Navigation Bar */}
      <div className="customer-live-queue__top-nav">
        <Link
          to="/customer/appointments"
          className="customer-live-queue__back-link"
        >
          ← Back to My Appointments
        </Link>
        <button
          onClick={() => fetchQueueStatus(true)}
          disabled={refreshing}
          className="customer-live-queue__refresh-btn"
          aria-label="Refresh telemetry data"
        >
          <span className={`customer-live-queue__refresh-icon ${refreshing ? 'customer-live-queue__refresh-icon--spinning' : ''}`} aria-hidden="true">
            🔄
          </span>
          <span>{refreshing ? 'Refreshing...' : 'Refresh Telemetry'}</span>
        </button>
      </div>

      <EmergencyNotice appointment={appointment} />

      {/* Primary Hero Queue Card */}
      <div className="customer-live-queue__hero-card">
        <div className="customer-live-queue__meta-header">
          <span className="customer-live-queue__org-service">
            {appointment?.organization_name || myQueueEntry.organization_name || 'Clinic'} &bull; {appointment?.service_name || myQueueEntry.service_name || 'Service Consultation'}
          </span>
          <span className="customer-live-queue__provider">
            Provider: <strong className="customer-live-queue__provider-name">{appointment?.provider_name || myQueueEntry.provider_name || 'Specialist'}</strong>
          </span>
        </div>

        {/* Primary Serial Number Display */}
        <div className="customer-live-queue__serial-container">
          <span className="customer-live-queue__serial-label">
            Your Serial Number
          </span>
          <h1 className="customer-live-queue__serial-number">
            #{qState.serialNumber}
          </h1>

          {/* Status Pills */}
          <div className="customer-live-queue__status-row">
            <span className={`customer-live-queue__status-pill customer-live-queue__status-pill--${qState.statusTone || 'info'}`}>
              <span className={`customer-live-queue__status-dot ${qState.rawStatus === 'IN_PROGRESS' || qState.rawStatus === 'CALLED' ? 'customer-live-queue__status-dot--pulse' : ''}`} aria-hidden="true" />
              {qState.displayStatus}
            </span>

            {qState.secondaryStatus && (
              <span className="customer-live-queue__secondary-pill">
                <span aria-hidden="true">⏰</span> {qState.secondaryStatus}
              </span>
            )}
          </div>

          {/* Human Guidance Statement */}
          <p className="customer-live-queue__guidance">
            {qState.guidance}
          </p>
        </div>
      </div>

      {/* Check-In Card if pending */}
      {canCheckIn && (
        <div className="customer-live-queue__checkin-card">
          <div className="customer-live-queue__checkin-content">
            <div className="customer-live-queue__checkin-title">
              <span aria-hidden="true">📍</span> Venue Check-In Available
            </div>
            <p className="customer-live-queue__checkin-desc">
              Check in upon arrival at the venue to enter the active queue list.
            </p>
          </div>
          <button
            onClick={handleCheckInNow}
            disabled={checkingIn}
            className="customer-live-queue__checkin-btn"
          >
            {checkingIn ? 'Checking In...' : '✓ Check In Now'}
          </button>
        </div>
      )}

      {/* Metrics Row (4-Column Command Grid) */}
      <div className="customer-live-queue__metrics-grid">
        {/* Metric 1: Now Serving */}
        <div className="customer-live-queue__metric-card">
          <div className="customer-live-queue__metric-label">
            Now Serving
          </div>
          <div className="customer-live-queue__metric-value customer-live-queue__metric-value--accent">
            {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
          </div>
          <div className="customer-live-queue__metric-subtext">
            Active Consultation
          </div>
        </div>

        {/* Metric 2: Scheduled Ahead */}
        <div className="customer-live-queue__metric-card">
          <div className="customer-live-queue__metric-label">
            Scheduled Ahead
          </div>
          <div className="customer-live-queue__metric-value customer-live-queue__metric-value--warning">
            {qState.scheduledAhead}
          </div>
          <div className="customer-live-queue__metric-subtext">
            Reserved Serials
          </div>
        </div>

        {/* Metric 3: Checked-in Ahead */}
        <div className="customer-live-queue__metric-card">
          <div className="customer-live-queue__metric-label">
            Checked-In Ahead
          </div>
          <div className="customer-live-queue__metric-value">
            {qState.checkedInAhead}
          </div>
          <div className="customer-live-queue__metric-subtext">
            Present at Venue
          </div>
        </div>

        {/* Metric 4: Estimated Service / Consultation Status */}
        <div className="customer-live-queue__metric-card">
          <div className="customer-live-queue__metric-label">
            {qState.rawStatus === 'IN_PROGRESS' ? 'Consultation Status' : 'Estimated Service'}
          </div>
          <div className="customer-live-queue__metric-value customer-live-queue__metric-value--timing">
            {qState.rawStatus === 'IN_PROGRESS'
              ? (qState.remainingServiceMinutes != null ? `In Consultation (~${qState.remainingServiceMinutes}m rem.)` : 'In Consultation')
              : (!qState.providerHasStarted && qState.isDelayed
                  ? qState.timingPlaceholder
                  : (estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : (estStartStr || qState.timingPlaceholder)))}
          </div>
          <div className={`customer-live-queue__metric-subtext ${(qState.rawStatus === 'IN_PROGRESS' || qState.isCheckedIn) ? 'customer-live-queue__metric-subtext--success' : 'customer-live-queue__metric-subtext--accent'}`}>
            {qState.rawStatus === 'IN_PROGRESS'
              ? (qState.actualStartedAt ? `Started at ${formatTime(qState.actualStartedAt)}` : 'Service underway')
              : (qState.isCheckedIn
                  ? '✓ Arrived & Checked In'
                  : (qState.recommendedArrivalTime ? `Recommended Arrival: ${formatTime(qState.recommendedArrivalTime)}` : (qState.checkInAvailableAt ? `Check-in opens: ${formatTime(qState.checkInAvailableAt)}` : 'Awaiting Arrival')))}
          </div>
        </div>
      </div>

      {/* Live Status Metadata Footer */}
      <div className="customer-live-queue__footer">
        <div className="customer-live-queue__auto-refresh-text">
          <span className="customer-live-queue__pulse-dot" aria-hidden="true" />
          <span>Live queue updates automatically every 10s {lastUpdated && `• Last updated ${lastUpdated.toLocaleTimeString()}`}</span>
        </div>
        <Link
          to={`/customer/appointments/${appointment?.id || queueEntryId}`}
          className="customer-live-queue__view-details-link"
        >
          View Full Appointment Details →
        </Link>
      </div>
    </div>
  );
}

export default CustomerLiveQueuePage;
