import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import queueService from '../../services/queueService';
import appointmentService from '../../services/appointmentService';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerLiveQueuePage() {
  const { queueEntryId } = useParams();
  const navigate = useNavigate();
  const { currentOrg } = useTenant();

  const [myQueueEntry, setMyQueueEntry] = useState(null);
  const [providerQueueEntries, setProviderQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const timerRef = useRef(null);

  const fetchQueueStatus = async (isManual = false) => {
    if (!currentOrg?.id || !queueEntryId) return;

    if (isManual) setRefreshing(true);
    setError(null);

    try {
      // 1. Fetch customer's queue list in current org
      const myData = await queueService.getMyQueue(currentOrg.id);
      const myList = Array.isArray(myData) ? myData : myData.results || [];
      const entry = myList.find((q) => String(q.id) === String(queueEntryId)) || myList[0];

      if (!entry) {
        setError('Queue entry not found or is no longer active.');
        setLoading(false);
        return;
      }

      setMyQueueEntry(entry);
      setLastUpdated(new Date());

      // 2. Fetch full provider queue to compute currently serving serial and people ahead
      if (entry.provider_id) {
        try {
          const provData = await queueService.getProviderQueue(currentOrg.id, entry.provider_id);
          const provEntries = Array.isArray(provData)
            ? provData
            : provData.entries || provData.results || [];
          setProviderQueueEntries(provEntries);
        } catch (pErr) {
          // Fallback gracefully
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update queue telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCheckInNow = async () => {
    if (!currentOrg?.id || !myQueueEntry?.appointment_id) return;
    setCheckingIn(true);
    try {
      await appointmentService.checkInAppointment(currentOrg.id, myQueueEntry.appointment_id);
      await fetchQueueStatus(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  };

  useEffect(() => {
    fetchQueueStatus();

    // 10-second polling loop for responsive dynamic ETA updates
    timerRef.current = setInterval(() => {
      fetchQueueStatus();
    }, 10000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentOrg?.id, queueEntryId]);

  useEffect(() => {
    if (myQueueEntry && ['COMPLETED', 'SKIPPED'].includes(myQueueEntry.status)) {
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
      <div className="animate-fade-in">
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

  const isTerminal = ['COMPLETED', 'SKIPPED'].includes(myQueueEntry.status);

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const readiness = myQueueEntry.readiness_info?.readiness_state || 'NOT_YET';
  const peopleAhead = myQueueEntry.readiness_info?.people_ahead ?? 0;
  const nowServingSerial = myQueueEntry.readiness_info?.now_serving_serial || currentlyServing?.serial_number;

  const estStartStr = formatTime(myQueueEntry.readiness_info?.estimated_start_time) || formatTime(myQueueEntry.appointment_start);
  const estEndStr = formatTime(myQueueEntry.readiness_info?.estimated_end_time) || formatTime(myQueueEntry.appointment_end);
  const recArrivalStr = formatTime(myQueueEntry.readiness_info?.recommended_arrival_time) || 'Now';

  const readinessBadgeConfig = {
    TURN_NOW: { text: '🟢 It is Your Turn! Proceed inside', bg: 'var(--color-success-light)', color: 'var(--color-success)', border: 'var(--color-success)' },
    BE_READY: { text: '⚡ You Are Next! Be ready at door', bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)' },
    GET_READY: { text: '🚶 Get Ready! Turn approaching', bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)' },
    NOT_YET: { text: '☕ Relaxed Waiting (Time remaining)', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-text-subtle)', border: 'var(--lp-border)' },
  }[readiness] || { text: 'Queue Active', bg: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: 'var(--lp-border)' };

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto' }}>
      {/* Top back link & manual refresh button */}
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
          🔄 {refreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      {/* Main Telemetry Box */}
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
          {myQueueEntry.service_name || 'Service Consultation'}
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', margin: '0 0 1.75rem 0' }}>
          {currentOrg?.name || 'Organization'} &bull; Provider: <strong style={{ color: 'var(--lp-text)' }}>{myQueueEntry.provider_name || 'Assigned Provider'}</strong>
        </p>

        {/* Check-In Status Callout Banner */}
        {!myQueueEntry.is_checked_in && !isTerminal && (
          <div style={{
            background: 'var(--color-warning-light)',
            border: '1px solid var(--color-warning)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.75rem',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            textAlign: 'left'
          }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-warning)', fontSize: '0.95rem' }}>📍 Physical Presence Check-In Required</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-warning)', marginTop: '0.15rem' }}>
                Please click "Check In Now" when you arrive at the facility so the provider can call your serial number.
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

        {/* Primary Serial Telemetry Row */}
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
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-btn-text)', opacity: 0.8, marginBottom: '0.35rem' }}>
              Your Serial #
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
              #{myQueueEntry.serial_number || myQueueEntry.token_number}
            </div>
            <div style={{ fontSize: '0.75rem', color: myQueueEntry.is_checked_in ? 'var(--color-success)' : 'var(--color-warning)', marginTop: '0.25rem', fontWeight: 600 }}>
              {myQueueEntry.is_checked_in ? '✓ Checked In' : '• Waiting for Check-In'}
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
              Active in Room
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
              Checked-in Waiting
            </div>
          </div>

          {/* Estimated Service Range */}
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
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', marginTop: '0.4rem' }}>
              {estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--lp-accent)', marginTop: '0.35rem', fontWeight: 600 }}>
              Recommended arrival: {recArrivalStr}
            </div>
          </div>
        </div>

        {/* Detailed Queue Status Callout */}
        <div style={{ background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)' }}>Queue Status</span>
            <StatusBadge status={myQueueEntry.status} />
          </div>

          {myQueueEntry.status === 'WAITING' && (
            <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {myQueueEntry.is_checked_in
                ? 'You are checked in and safely in line. Please remain available near the waiting area.'
                : 'Your serial number is confirmed. Remember to check in upon physical arrival at the venue.'}
            </p>
          )}

          {myQueueEntry.status === 'CALLED' && (
            <p style={{ margin: 0, color: 'var(--color-success)', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.5 }}>
              ⚡ Your serial number has been called! Please proceed directly to the provider room.
            </p>
          )}

          {myQueueEntry.status === 'IN_PROGRESS' && (
            <p style={{ margin: 0, color: 'var(--lp-accent)', fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.5 }}>
              🩺 Your consultation/service is currently in progress.
            </p>
          )}

          {myQueueEntry.status === 'COMPLETED' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: 'var(--color-success)', fontSize: '0.9rem', fontWeight: 600 }}>
                ✅ Service completed. Thank you for visiting!
              </p>
              <button
                onClick={() => navigate(`/customer/appointments/${myQueueEntry.appointment_id}`)}
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

          {myQueueEntry.status === 'SKIPPED' && (
            <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: '0.9rem', fontWeight: 600 }}>
              ⚠️ Your serial turn was skipped. If you missed your call, please report to the front desk.
            </p>
          )}
        </div>

        {lastUpdated && (
          <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '1.25rem' }}>
            Live ETA Telemetry &bull; Auto-refreshes every 10s &bull; Last updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerLiveQueuePage;
