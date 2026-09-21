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
    TURN_NOW: { text: '🟢 It is Your Turn! Proceed inside', bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
    BE_READY: { text: '⚡ You Are Next! Be ready at door', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    GET_READY: { text: '🚶 Get Ready! Turn approaching', bg: '#FEF9C3', color: '#854D0E', border: '#FEF08A' },
    NOT_YET: { text: '☕ Relaxed Waiting (Time remaining)', bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB' },
  }[readiness] || { text: 'Queue Active', bg: '#FAF8F3', color: '#5F7A70', border: '#E6E1D9' };

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
            color: '#5F7A70',
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
            background: '#FAF8F3',
            color: '#5C544E',
            border: '1px solid #E6E1D9',
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
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid #E6E1D9',
          padding: '2rem',
          boxShadow: '0 8px 30px rgba(47, 37, 32, 0.06)',
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
          <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: isTerminal ? '#78716C' : readinessBadgeConfig.color }} />
          {readinessBadgeConfig.text}
        </div>

        <h1 style={{ fontSize: '1.75rem', color: '#211C19', fontFamily: 'Cinzel, serif', marginBottom: '0.25rem' }}>
          {myQueueEntry.service_name || 'Service Consultation'}
        </h1>
        <p style={{ color: '#78716C', fontSize: '0.95rem', margin: '0 0 1.75rem 0' }}>
          {currentOrg?.name || 'Organization'} &bull; Provider: <strong>{myQueueEntry.provider_name || 'Assigned Provider'}</strong>
        </p>

        {/* Check-In Status Callout Banner */}
        {!myQueueEntry.is_checked_in && !isTerminal && (
          <div style={{
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
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
              <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.95rem' }}>📍 Physical Presence Check-In Required</div>
              <div style={{ fontSize: '0.85rem', color: '#B45309', marginTop: '0.15rem' }}>
                Please click "Check In Now" when you arrive at the facility so the provider can call your serial number.
              </div>
            </div>
            <button
              onClick={handleCheckInNow}
              disabled={checking}
              style={{
                padding: '0.6rem 1.25rem',
                background: '#B06D2E',
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
              background: '#2F2520',
              color: '#FAF8F3',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 4px 16px rgba(47, 37, 32, 0.15)',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#E6E1D9', marginBottom: '0.35rem' }}>
              Your Serial #
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
              #{myQueueEntry.serial_number || myQueueEntry.token_number}
            </div>
            <div style={{ fontSize: '0.75rem', color: myQueueEntry.is_checked_in ? '#86EFAC' : '#FCD34D', marginTop: '0.25rem', fontWeight: 600 }}>
              {myQueueEntry.is_checked_in ? '✓ Checked In' : '• Waiting for Check-In'}
            </div>
          </div>

          {/* Now Serving */}
          <div
            style={{
              background: '#FAF8F3',
              border: '1px solid #E6E1D9',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#78716C', marginBottom: '0.35rem' }}>
              Now Serving
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, color: '#5F7A70', fontFamily: 'Outfit, sans-serif' }}>
              {nowServingSerial ? `#${nowServingSerial}` : 'Not started'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', marginTop: '0.25rem' }}>
              Active in Room
            </div>
          </div>

          {/* People Ahead */}
          <div
            style={{
              background: '#FAF8F3',
              border: '1px solid #E6E1D9',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#78716C', marginBottom: '0.35rem' }}>
              People Ahead
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, color: '#B06D2E', fontFamily: 'Outfit, sans-serif' }}>
              {myQueueEntry.status === 'CALLED' || myQueueEntry.status === 'IN_PROGRESS' ? '0' : peopleAhead}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', marginTop: '0.25rem' }}>
              Checked-in Waiting
            </div>
          </div>

          {/* Estimated Service Range */}
          <div
            style={{
              background: '#FAF8F3',
              border: '1px solid #E6E1D9',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#78716C', marginBottom: '0.35rem' }}>
              Estimated Service
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#211C19', fontFamily: 'Outfit, sans-serif', marginTop: '0.4rem' }}>
              {estStartStr && estEndStr ? `${estStartStr} – ${estEndStr}` : estStartStr || 'Scheduled'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#5F7A70', marginTop: '0.35rem', fontWeight: 600 }}>
              Recommended arrival: {recArrivalStr}
            </div>
          </div>
        </div>

        {/* Detailed Queue Status Callout */}
        <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#211C19' }}>Queue Status</span>
            <StatusBadge status={myQueueEntry.status} />
          </div>

          {myQueueEntry.status === 'WAITING' && (
            <p style={{ margin: 0, color: '#5C544E', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {myQueueEntry.is_checked_in
                ? 'You are checked in and safely in line. Please remain available near the waiting area.'
                : 'Your serial number is confirmed. Remember to check in upon physical arrival at the venue.'}
            </p>
          )}

          {myQueueEntry.status === 'CALLED' && (
            <p style={{ margin: 0, color: '#065F46', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.5 }}>
              ⚡ Your serial number has been called! Please proceed directly to the provider room.
            </p>
          )}

          {myQueueEntry.status === 'IN_PROGRESS' && (
            <p style={{ margin: 0, color: '#5F7A70', fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.5 }}>
              🩺 Your consultation/service is currently in progress.
            </p>
          )}

          {myQueueEntry.status === 'COMPLETED' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem', fontWeight: 600 }}>
                ✅ Service completed. Thank you for visiting!
              </p>
              <button
                onClick={() => navigate(`/customer/appointments/${myQueueEntry.appointment_id}`)}
                style={{
                  padding: '0.4rem 0.85rem',
                  background: '#F5EFE6',
                  color: '#B06D2E',
                  border: '1px solid #E6E1D9',
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
            <p style={{ margin: 0, color: '#991B1B', fontSize: '0.9rem', fontWeight: 600 }}>
              ⚠️ Your serial turn was skipped. If you missed your call, please report to the front desk.
            </p>
          )}
        </div>

        {lastUpdated && (
          <div style={{ fontSize: '0.75rem', color: '#78716C', marginTop: '1.25rem' }}>
            Live ETA Telemetry &bull; Auto-refreshes every 10s &bull; Last updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerLiveQueuePage;
