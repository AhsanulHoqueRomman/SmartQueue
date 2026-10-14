import { EmergencyNotice } from '../../components/EmergencyNotice';
import { formatBookingDate } from '../../utils/homeBookingDisplay.js';
import { useRequestScope } from '../../hooks/useRequestScope';
import { useAuth } from '../../contexts/AuthContext';
import { confirmCustomerArrival } from '../../utils/customerArrival.js';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import appointmentService from '../../services/appointmentService';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import ReportIssueModal from '../../components/ReportIssueModal';

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
      <div className="animate-fade-in" style={{ maxWidth: '850px', margin: '0 auto' }}>
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
      <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '2rem auto' }}>
        <EmergencyNotice appointment={appointment} />
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

        <div
          style={{
            background: 'var(--lp-surface)',
            borderRadius: '20px',
            border: '1px solid var(--lp-border)',
            padding: '2.5rem',
            textAlign: 'center',
            boxShadow: 'var(--lp-shadow-sm)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏱️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)' }}>
            This Queue Session Is No Longer Active
          </h2>
          <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', maxWidth: '600px', margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
            {qState.isUnresolved
              ? `This queue session was scheduled for ${formattedDate}. You checked in, but no consultation outcome was recorded by clinic staff.`
              : qState.guidance}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate(`/customer/appointments/${appointment?.id || queueEntryId}`)}
              style={{
                padding: '0.7rem 1.25rem',
                background: 'var(--lp-btn-bg)',
                color: 'var(--lp-btn-text)',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              View Appointment Details
            </button>

            {qState.isUnresolved && (
              appointment?.has_issue_report ? (
                <span
                  style={{
                    padding: '0.65rem 1.1rem',
                    background: 'var(--lp-bg-subtle)',
                    color: 'var(--lp-accent)',
                    border: '1px solid var(--lp-border)',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                >
                  ✓ Issue Reported
                </span>
              ) : (
                <button
                  onClick={() => setReportModalOpen(true)}
                  style={{
                    padding: '0.7rem 1.25rem',
                    background: 'var(--lp-bg-subtle)',
                    color: 'var(--color-warning)',
                    border: '1px solid var(--lp-border)',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
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
    <div className="animate-page-entrance" style={{ maxWidth: '820px', margin: '0 auto', padding: '0 0.5rem' }}>
      {error && <p className="banner banner-warning" role="alert">{error}</p>}
      {/* Top Header Bar */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        <button
          onClick={() => fetchQueueStatus(true)}
          disabled={refreshing}
          style={{
            padding: '0.45rem 0.9rem',
            background: 'var(--lp-bg-subtle)',
            color: 'var(--lp-text-subtle)',
            border: '1px solid var(--lp-border)',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          🔄 {refreshing ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
      </div>

      <EmergencyNotice appointment={appointment} />
      {/* Hero Queue Section (De-boxed open design) */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {appointment?.organization_name || myQueueEntry.organization_name || 'Clinic'} &bull; {appointment?.service_name || myQueueEntry.service_name || 'Service Consultation'}
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem', marginBottom: '1.5rem' }}>
          Provider: <strong style={{ color: 'var(--lp-text)' }}>{appointment?.provider_name || myQueueEntry.provider_name || 'Specialist'}</strong>
        </div>

        {/* Primary Serial Number Display */}
        <div style={{ margin: '1rem 0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-subtle)' }}>
            Your Serial Number
          </span>
          <h1 style={{ fontSize: '3.75rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: 'var(--lp-text)', margin: '0.2rem 0' }}>
            #{qState.serialNumber}
          </h1>

          {/* Status Pills */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 1rem',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.88rem',
              background: qState.statusTone === 'success' ? 'var(--color-success-light)' : qState.statusTone === 'warning' ? 'var(--color-warning-light)' : 'var(--lp-bg-subtle)',
              color: qState.statusTone === 'success' ? 'var(--color-success)' : qState.statusTone === 'warning' ? 'var(--color-warning)' : 'var(--lp-accent)',
              border: `1px solid ${qState.statusTone === 'success' ? 'var(--color-success)' : qState.statusTone === 'warning' ? 'var(--color-warning)' : 'var(--lp-border)'}`,
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }} />
              {qState.displayStatus}
            </span>

            {qState.secondaryStatus && (
              <span style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '9999px',
                fontWeight: 600,
                fontSize: '0.82rem',
                background: 'var(--color-warning-light)',
                color: 'var(--color-warning)',
                border: '1px solid var(--color-warning)',
              }}>
                ⏰ {qState.secondaryStatus}
              </span>
            )}
          </div>

          {/* Human Guidance Statement */}
          <p style={{ maxWidth: '560px', margin: '1.25rem auto 0 auto', fontSize: '1rem', color: 'var(--lp-text)', lineHeight: 1.5, fontWeight: 500 }}>
            {qState.guidance}
          </p>
        </div>
      </div>

      {/* Check-In Banner if pending */}
      {canCheckIn && (
        <div style={{
          background: 'var(--color-warning-light)',
          border: '1px solid var(--color-warning)',
          borderRadius: '14px',
          padding: '1.25rem 1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-warning)', fontSize: '0.95rem' }}>📍 Venue Check-In Available</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-warning)', marginTop: '0.2rem' }}>
              Check in upon arrival at the venue to enter the active queue list.
            </div>
          </div>
          <button
            onClick={handleCheckInNow}
            disabled={checkingIn}
            style={{
              padding: '0.65rem 1.35rem',
              background: 'var(--color-warning)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            {checkingIn ? 'Checking In...' : '✓ Check In Now'}
          </button>
        </div>
      )}

      {/* Metrics Row (Horizontal typography-led, minimal borders) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '1.25rem',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border)',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '2rem',
      }}>
        {/* Metric 1: Now Serving */}
        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)' }}>
            Now Serving
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif', margin: '0.2rem 0' }}>
            {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>
            Active Consultation
          </div>
        </div>

        {/* Metric 2: Scheduled Ahead */}
        <div style={{ textAlign: 'center', padding: '0.5rem', borderLeft: '1px solid var(--lp-border)', borderRight: '1px solid var(--lp-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)' }}>
            Scheduled Ahead
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif', margin: '0.2rem 0' }}>
            {qState.scheduledAhead}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>
            Reserved Serials
          </div>
        </div>

        {/* Metric 3: Checked-in Ahead */}
        <div style={{ textAlign: 'center', padding: '0.5rem', borderRight: '1px solid var(--lp-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)' }}>
            Checked-In Ahead
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', margin: '0.2rem 0' }}>
            {qState.checkedInAhead}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>
            Present at Venue
          </div>
        </div>

        {/* Metric 4: Estimated Service / Recommended Arrival */}
        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)' }}>
            {qState.rawStatus === 'IN_PROGRESS' ? 'Consultation Status' : 'Estimated Service'}
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', margin: '0.5rem 0 0.2rem 0' }}>
            {qState.rawStatus === 'IN_PROGRESS'
              ? (qState.remainingServiceMinutes != null ? `In Consultation (~${qState.remainingServiceMinutes}m rem.)` : 'In Consultation')
              : (!qState.providerHasStarted && qState.isDelayed
                  ? qState.timingPlaceholder
                  : (estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : (estStartStr || qState.timingPlaceholder)))}
          </div>
          <div style={{ fontSize: '0.78rem', color: (qState.rawStatus === 'IN_PROGRESS' || qState.isCheckedIn) ? 'var(--color-success)' : 'var(--lp-accent)' }}>
            {qState.rawStatus === 'IN_PROGRESS'
              ? (qState.actualStartedAt ? `Started at ${formatTime(qState.actualStartedAt)}` : 'Service underway')
              : (qState.isCheckedIn
                  ? '✓ Arrived & Checked In'
                  : (qState.recommendedArrivalTime ? `Recommended Arrival: ${formatTime(qState.recommendedArrivalTime)}` : (qState.checkInAvailableAt ? `Check-in opens: ${formatTime(qState.checkInAvailableAt)}` : 'Awaiting Arrival')))}
          </div>
        </div>
      </div>

      {/* Live Status Metadata Footer */}
      <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--lp-text-subtle)', margin: '1.5rem 0' }}>
        Live queue updates automatically every 10s {lastUpdated && `• Last updated ${lastUpdated.toLocaleTimeString()}`}
      </div>
    </div>
  );
}

export default CustomerLiveQueuePage;
