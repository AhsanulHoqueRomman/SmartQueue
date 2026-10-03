import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import queueService from '../../services/queueService';
import appointmentService from '../../services/appointmentService';
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
      // 1. Fetch customer's dashboard appointments across all organizations
      const dashData = await appointmentService.getCustomerDashboard();
      const apptList = Array.isArray(dashData) ? dashData : dashData.results || [];
      
      const matchAppt = apptList.find(
        (a) => String(a.id) === String(queueEntryId) || String(a.queue_entry?.id) === String(queueEntryId)
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

      // 2. Fetch provider queue if organization & provider are identified
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

  const isTerminal = ['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(myQueueEntry.status);
  const isFuture = appointment?.temporal_classification === 'future';

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const readiness = isFuture ? 'NOT_YET' : (myQueueEntry.readiness_info?.readiness_state || 'NOT_YET');
  const peopleAhead = myQueueEntry.readiness_info?.people_ahead ?? 0;
  const nowServingSerial = myQueueEntry.readiness_info?.now_serving_serial || currentlyServing?.serial_number;

  const estStartStr = formatTime(myQueueEntry.readiness_info?.estimated_start_time) || formatTime(appointment?.start_datetime);
  const estEndStr = formatTime(myQueueEntry.readiness_info?.estimated_end_time) || formatTime(appointment?.end_datetime);
  const recArrivalStr = formatTime(myQueueEntry.readiness_info?.recommended_arrival_time) || null;

  const readinessBadgeConfig = isFuture
    ? { text: '📅 Upcoming / Scheduled Booking', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: 'var(--lp-border)' }
    : {
        TURN_NOW: { text: '🟢 It is Your Turn! Proceed inside', bg: 'var(--color-success-light)', color: 'var(--color-success)', border: 'var(--color-success)' },
        BE_READY: { text: '⚡ You Are Next! Be ready at door', bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)' },
        GET_READY: { text: '🚶 Get Ready! Turn approaching', bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)' },
        NOT_YET: { text: '☕ Scheduled / Relaxed Waiting', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-text-subtle)', border: 'var(--lp-border)' },
      }[readiness] || { text: 'Queue Active', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: 'var(--lp-border)' };

  const canCheckIn = appointment?.can_check_in !== undefined
    ? appointment.can_check_in
    : (appointment?.temporal_classification === 'today' && !myQueueEntry.is_checked_in && !isTerminal);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto' }}>
      {/* Navigation Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            padding: '0.4rem 0.85rem',
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

      {/* Main Telemetry Container */}
      <div
        style={{
          background: 'var(--lp-surface)',
          borderRadius: '20px',
          border: '1px solid var(--lp-border)',
          padding: '2rem',
          boxShadow: 'var(--lp-shadow-sm)',
          textAlign: 'center',
          marginBottom: '1.5rem',
        }}
      >
        {/* Readiness Pill Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: readinessBadgeConfig.bg,
          color: readinessBadgeConfig.color,
          border: `1px solid ${readinessBadgeConfig.border}`,
          padding: '0.5rem 1.1rem',
          borderRadius: '9999px',
          fontSize: '0.9rem',
          fontWeight: 700,
          marginBottom: '1.25rem'
        }}>
          <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: isTerminal ? 'var(--lp-text-subtle)' : readinessBadgeConfig.color }} />
          {readinessBadgeConfig.text}
        </div>

        <h1 style={{ fontSize: '1.75rem', color: 'var(--lp-text)', fontFamily: 'Cinzel, serif', marginBottom: '0.25rem' }}>
          {appointment?.service_name || myQueueEntry.service_name || 'Service Consultation'}
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', margin: '0 0 1.75rem 0' }}>
          {appointment?.organization_name || myQueueEntry.organization_name || 'Clinic Organization'} &bull; Provider: <strong style={{ color: 'var(--lp-text)' }}>{appointment?.provider_name || myQueueEntry.provider_name || 'Assigned Provider'}</strong>
        </p>

        {/* Check-In Callout Banner */}
        {canCheckIn && (
          <div style={{
            background: 'var(--color-warning-light)',
            border: '1px solid var(--color-warning)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            textAlign: 'left'
          }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-warning)', fontSize: '0.95rem' }}>📍 Physical Presence Check-In Available</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-warning)', marginTop: '0.15rem' }}>
                You are scheduled for today. Check in when physically present at the clinic to enter the active queue.
              </div>
            </div>
            <button
              onClick={handleCheckInNow}
              disabled={checkingIn}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'var(--color-warning)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              {checkingIn ? 'Checking In...' : '✓ Check In Now'}
            </button>
          </div>
        )}

        {/* Primary Telemetry Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {/* Your Serial # */}
          <div
            style={{
              background: 'var(--lp-btn-bg)',
              color: 'var(--lp-btn-text)',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: 'var(--lp-shadow-sm)',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, marginBottom: '0.35rem' }}>
              Your Serial #
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
              #{appointment?.serial_number || myQueueEntry.serial_number || myQueueEntry.token_number || '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: myQueueEntry.is_checked_in ? 'var(--color-success)' : 'var(--color-warning)', marginTop: '0.25rem', fontWeight: 600 }}>
              {myQueueEntry.is_checked_in ? '✓ Checked In' : isFuture ? '• Scheduled Future Date' : '• Pending Check-In'}
            </div>
          </div>

          {/* Now Serving */}
          <div
            style={{
              background: 'var(--lp-bg-subtle)',
              border: '1px solid var(--lp-border)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)', marginBottom: '0.35rem' }}>
              Now Serving
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif' }}>
              {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '0.25rem' }}>
              Active Consultation Serial
            </div>
          </div>

          {/* People Ahead */}
          <div
            style={{
              background: 'var(--lp-bg-subtle)',
              border: '1px solid var(--lp-border)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)', marginBottom: '0.35rem' }}>
              People Ahead
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif' }}>
              {myQueueEntry.status === 'CALLED' || myQueueEntry.status === 'IN_PROGRESS' ? '0' : peopleAhead}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '0.25rem' }}>
              Checked-in Queue
            </div>
          </div>

          {/* Estimated Time Window */}
          <div
            style={{
              background: 'var(--lp-bg-subtle)',
              border: '1px solid var(--lp-border)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-subtle)', marginBottom: '0.35rem' }}>
              Estimated Service
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', marginTop: '0.4rem' }}>
              {estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}
            </div>
            {recArrivalStr && (
              <div style={{ fontSize: '0.75rem', color: 'var(--lp-accent)', marginTop: '0.35rem', fontWeight: 600 }}>
                Rec. arrival: {recArrivalStr}
              </div>
            )}
          </div>
        </div>

        {/* Status Callout Footer */}
        <div style={{ background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)' }}>Appointment & Queue Status</span>
            <StatusBadge status={appointment?.status || myQueueEntry.status} />
          </div>

          {isFuture && (
            <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              📅 This is a scheduled future booking. Your serial number is secured. Live queue calling will become active on {appointment?.appointment_date || 'your appointment date'}.
            </p>
          )}

          {!isFuture && myQueueEntry.status === 'WAITING' && (
            <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {myQueueEntry.is_checked_in
                ? 'You are checked in and safely in line. Please remain available near the waiting area.'
                : 'Your serial number is confirmed. Remember to check in upon physical arrival at the venue.'}
            </p>
          )}

          {!isFuture && myQueueEntry.status === 'CALLED' && (
            <p style={{ margin: 0, color: 'var(--color-success)', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.5 }}>
              ⚡ Your serial number has been called! Please proceed directly to the provider room.
            </p>
          )}

          {!isFuture && myQueueEntry.status === 'IN_PROGRESS' && (
            <p style={{ margin: 0, color: 'var(--lp-accent)', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.5 }}>
              🩺 Your consultation/service is currently in progress.
            </p>
          )}

          {myQueueEntry.status === 'COMPLETED' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ margin: 0, color: 'var(--color-success)', fontSize: '0.9rem', fontWeight: 600 }}>
                ✅ Service completed. Thank you for visiting!
              </p>
              <button
                onClick={() => navigate(`/customer/appointments/${appointment?.id || myQueueEntry.appointment_id}`)}
                style={{
                  padding: '0.4rem 0.85rem',
                  background: 'var(--lp-surface)',
                  color: 'var(--color-warning)',
                  border: '1px solid var(--lp-border)',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                ★ Leave Review
              </button>
            </div>
          )}
        </div>

        {lastUpdated && (
          <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '1.25rem' }}>
            Live Queue Telemetry &bull; Auto-refreshes every 10s &bull; Last updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerLiveQueuePage;
