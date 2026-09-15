import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import queueService from '../../services/queueService';
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

      // 2. Fetch full provider queue to compute currently serving token and people ahead
      if (entry.provider_id) {
        try {
          const provData = await queueService.getProviderQueue(currentOrg.id, entry.provider_id);
          const provEntries = Array.isArray(provData)
            ? provData
            : provData.entries || provData.results || [];
          setProviderQueueEntries(provEntries);
        } catch (pErr) {
          // If customer lacks direct provider queue list permission, fallback gracefully
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update queue telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueueStatus();

    // 12-second polling loop
    timerRef.current = setInterval(() => {
      fetchQueueStatus();
    }, 12000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentOrg?.id, queueEntryId]);

  // Stop polling if queue reaches terminal status (COMPLETED, SKIPPED)
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

  // Calculate currently serving token
  const currentlyServing = providerQueueEntries.find(
    (e) => e.status === 'IN_PROGRESS' || e.status === 'CALLED'
  );

  // Calculate people ahead in queue (status == WAITING and created before / lower token)
  const peopleAhead = providerQueueEntries.filter(
    (e) => e.status === 'WAITING' && e.token_number < myQueueEntry.token_number
  ).length;

  const isTerminal = ['COMPLETED', 'SKIPPED'].includes(myQueueEntry.status);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Top back link */}
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1.25rem' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: isTerminal ? '#78716C' : '#22C55E', animation: isTerminal ? 'none' : 'pulse 1.5s infinite' }} />
          {isTerminal ? 'Queue Session Ended' : 'Live Queue Telemetry Active'}
        </div>

        <h1 style={{ fontSize: '1.75rem', color: '#211C19', fontFamily: 'Cinzel, serif', marginBottom: '0.25rem' }}>
          {myQueueEntry.service_name || 'Service Consultation'}
        </h1>
        <p style={{ color: '#78716C', fontSize: '0.95rem', margin: '0 0 1.75rem 0' }}>
          {currentOrg?.name || 'Clinic'} — Provider: <strong>{myQueueEntry.provider_name || 'Assigned Provider'}</strong>
        </p>

        {/* Primary Token Telemetry Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {/* Your Token */}
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
              Your Token Number
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
              #{myQueueEntry.token_number}
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
              {currentlyServing ? `#${currentlyServing.token_number}` : 'Waiting'}
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
          </div>
        </div>

        {/* Queue Status Callout */}
        <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#211C19' }}>Queue Status</span>
            <StatusBadge status={myQueueEntry.status} />
          </div>

          {myQueueEntry.status === 'WAITING' && (
            <p style={{ margin: 0, color: '#5C544E', fontSize: '0.9rem', lineHeight: 1.5 }}>
              You are checked in and safely in the queue. Please stay nearby or keep this page open. You will be notified when called.
            </p>
          )}

          {myQueueEntry.status === 'CALLED' && (
            <p style={{ margin: 0, color: '#065F46', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.5 }}>
              ⚡ Your token has been called! Please proceed directly to the provider desk.
            </p>
          )}

          {myQueueEntry.status === 'IN_PROGRESS' && (
            <p style={{ margin: 0, color: '#5F7A70', fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.5 }}>
              🩺 Your service is currently in progress.
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
              ⚠️ Your token was skipped. If you missed your turn, please check with the front desk.
            </p>
          )}
        </div>

        {lastUpdated && (
          <div style={{ fontSize: '0.75rem', color: '#78716C', marginTop: '1.25rem' }}>
            Auto-refreshes every 12 seconds · Last updated at {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerLiveQueuePage;
