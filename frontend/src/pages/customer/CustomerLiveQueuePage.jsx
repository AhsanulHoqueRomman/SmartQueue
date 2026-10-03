import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import queueService from '../../services/queueService';
import appointmentService from '../../services/appointmentService';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerLiveQueuePage() {
  const { queueEntryId } = useParams();
  const navigate = useNavigate();

  const [myQueueEntry, setMyQueueEntry] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [providerQueueEntries, setProviderQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const timerRef = useRef(null);

  const fetchQueueStatus = async (isManual = false) => {
    if (!queueEntryId) return;

    if (isManual) setRefreshing(true);
    setError(null);

    try {
      const dashData = await appointmentService.getCustomerDashboard();
      const apptList = Array.isArray(dashData) ? dashData : dashData.results || [];

      const matchAppt = apptList.find(
        (a) => String(a.queue_entry?.id) === String(queueEntryId) || (a.queue_entry == null && String(a.id) === String(queueEntryId))
      );

      if (!matchAppt) {
        setError('Queue entry or appointment record not found in your schedule.');
        setLoading(false);
        return;
      }

      setAppointment(matchAppt);

      const qEntry = matchAppt.queue_entry || {
        id: matchAppt.id,
        appointment_id: matchAppt.id,
        serial_number: matchAppt.serial_number,
        status: matchAppt.status,
        provider_id: matchAppt.provider_id,
        provider_name: matchAppt.provider_name,
        service_name: matchAppt.service_name,
        organization_id: matchAppt.organization_id,
        organization_name: matchAppt.organization_name,
        is_checked_in: matchAppt.status === 'CHECKED_IN' || matchAppt.status === 'WAITING' || matchAppt.status === 'IN_PROGRESS',
        readiness_info: {
          readiness_state: matchAppt.temporal_classification === 'today' ? (matchAppt.status === 'CONFIRMED' ? 'GET_READY' : 'BE_READY') : 'NOT_YET',
          people_ahead: 0,
        }
      };

      setMyQueueEntry(qEntry);
      setLastUpdated(new Date());

      const orgId = matchAppt.organization_id || matchAppt.organization;
      const provId = matchAppt.provider_id || qEntry.provider_id;

      if (orgId && provId) {
        try {
          const provData = await queueService.getProviderQueue(orgId, provId);
          const provEntries = Array.isArray(provData)
            ? provData
            : provData.entries || provData.results || [];
          setProviderQueueEntries(provEntries);
        } catch (pErr) {
          // Graceful fallback
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update live queue telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCheckInNow = async () => {
    const orgId = appointment?.organization_id || appointment?.organization || myQueueEntry?.organization_id;
    const apptId = appointment?.id || myQueueEntry?.appointment_id;
    if (!orgId || !apptId) return;

    setCheckingIn(true);
    try {
      await appointmentService.checkInAppointment(orgId, apptId);
      await fetchQueueStatus(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Check-in failed. Please verify your appointment date.');
    } finally {
      setCheckingIn(false);
    }
  };

  useEffect(() => {
    fetchQueueStatus();

    timerRef.current = setInterval(() => {
      fetchQueueStatus();
    }, 10000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [queueEntryId]);

  useEffect(() => {
    if (myQueueEntry && ['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(myQueueEntry.status)) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [myQueueEntry?.status]);

  if (loading) {
    return <LoadingState message="Connecting to live queue telemetry..." />;
  }

  if (error || !myQueueEntry) {
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

  const currentlyServing = providerQueueEntries.find(
    (e) => e.status === 'IN_PROGRESS' || e.status === 'CALLED'
  );

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Derive normalized presentation model
  const qState = getNormalizedCustomerQueueState(appointment, myQueueEntry);
  const nowServingSerial = qState.nowServing || currentlyServing?.serial_number;
  const canCheckIn = appointment?.can_check_in !== undefined
    ? appointment.can_check_in
    : (appointment?.temporal_classification === 'today' && !qState.isCheckedIn && !qState.isTerminal);

  const estStartStr = formatTime(qState.estimatedStartTime);
  const estEndStr = formatTime(qState.estimatedEndTime);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '820px', margin: '0 auto', padding: '0 0.5rem' }}>
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif', margin: '0.2rem 0' }}>
            {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>
            Active Room Serial
          </div>
        </div>

        {/* Metric 2: People Ahead */}
        <div style={{ textAlign: 'center', padding: '0.5rem', borderLeft: '1px solid var(--lp-border)', borderRight: '1px solid var(--lp-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)' }}>
            People Ahead
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif', margin: '0.2rem 0' }}>
            {qState.peopleAhead}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>
            Checked-in Ahead
          </div>
        </div>

        {/* Metric 3: Estimated Service / Pace */}
        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)' }}>
            Estimated Window
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', margin: '0.6rem 0 0.2rem 0' }}>
            {qState.isDelayed
              ? 'Awaiting Provider Start'
              : (estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : (estStartStr || 'Scheduled'))}
          </div>
          <div style={{ fontSize: '0.78rem', color: qState.isCheckedIn ? 'var(--color-success)' : 'var(--lp-text-subtle)' }}>
            {qState.isCheckedIn ? '✓ Arrived at Venue' : 'Pending Arrival'}
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
