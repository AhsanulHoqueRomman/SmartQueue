import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

export function ProviderQueuePage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  const [providerProfile, setProviderProfile] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) {
      setProviderProfile(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    organizationService
      .getProviders(currentOrg.id)
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const myProfile = list.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);
      })
      .catch(() => {
        if (isMounted) {
          setError('Failed to resolve provider profile for this organization.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id]);

  const fetchQueue = async () => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    try {
      const data = await queueService.getProviderQueue(
        currentOrg.id,
        providerProfile.id
      );
      const list = Array.isArray(data) ? data : data.results || [];
      setQueueEntries(list);
    } catch (err) {
      setError(
        err.response?.data?.detail || 'Failed to update queue information.'
      );
    }
  };

  useEffect(() => {
    if (providerProfile?.id) {
      fetchQueue();
    }
  }, [currentOrg?.id, providerProfile?.id]);

  useEffect(() => {
    if (!autoRefresh || !providerProfile?.id) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchQueue();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, currentOrg?.id, providerProfile?.id]);

  const handleCallNext = async () => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    setProcessingId('call-next');
    setActionFeedback(null);
    setError(null);

    try {
      const entry = await queueService.callNext(
        currentOrg.id,
        providerProfile.id
      );
      setActionFeedback({
        type: 'success',
        message: `Called Token #${entry.token_number} (${entry.customer_email || 'Customer'}).`,
      });
      fetchQueue();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to call next token. Active entry or conflict exists.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setProcessingId(null);
    }
  };

  const handleStart = async (entryId) => {
    setProcessingId(entryId);
    setActionFeedback(null);
    setError(null);

    try {
      await queueService.startEntry(currentOrg.id, entryId);
      setActionFeedback({
        type: 'success',
        message: 'Started service for patient.',
      });
      fetchQueue();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to start service.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleComplete = async (entryId) => {
    setProcessingId(entryId);
    setActionFeedback(null);
    setError(null);

    try {
      await queueService.completeEntry(currentOrg.id, entryId);
      setActionFeedback({
        type: 'success',
        message: 'Completed appointment service.',
      });
      fetchQueue();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to complete service.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSkip = async (entryId) => {
    setProcessingId(entryId);
    setActionFeedback(null);
    setError(null);

    try {
      await queueService.skipEntry(currentOrg.id, entryId);
      setActionFeedback({
        type: 'success',
        message: 'Skipped entry and marked appointment NO_SHOW.',
      });
      fetchQueue();
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to skip entry.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <LoadingState type="spinner" text="Loading provider queue board..." />;
  }

  if (!providerProfile) {
    return (
      <EmptyState
        title="Provider Profile Required"
        message={`You do not have an active Provider Profile assigned in ${currentOrg?.name || 'this organization'}.`}
      />
    );
  }

  const calledEntry = queueEntries.find((e) => e.status === 'CALLED');
  const activeEntry = queueEntries.find((e) => e.status === 'IN_PROGRESS');
  const waitingEntries = queueEntries.filter((e) => e.status === 'WAITING');

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Live Operational Queue</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Provider Command Center &bull; {currentOrg?.name}</p>
        </div>
        <div className="flex items-center gap-sm">
          <label className="flex items-center gap-xs text-sm text-muted" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (10s)
          </label>
        </div>
      </div>

      {actionFeedback && (
        <div
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            background: actionFeedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: actionFeedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${actionFeedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {actionFeedback.message}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Active / Called Patient Highlight Card */}
      <div className="card animate-section stagger-1 animate-zoom-in" style={{ marginBottom: '1.75rem', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ marginBottom: '1rem' }}>Active Patient Call & Service Controls</h3>

        {activeEntry ? (
          <div className="flex justify-between items-center flex-wrap gap-md animate-zoom-in" style={{ backgroundColor: 'var(--color-primary-light)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-primary-border)' }}>
            <div>
              <StatusBadge status="IN_PROGRESS" type="queue" />
              <h2 className="animate-float" style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--color-primary-text)' }}>
                Token #{activeEntry.token_number}
              </h2>
              <p className="text-main font-semibold" style={{ marginTop: '0.15rem' }}>{activeEntry.customer_email || 'Customer'}</p>
            </div>
            <button
              className="btn btn-success"
              onClick={() => handleComplete(activeEntry.id)}
              disabled={processingId === activeEntry.id}
            >
              {processingId === activeEntry.id ? 'Completing...' : '✔ Complete Service'}
            </button>
          </div>
        ) : calledEntry ? (
          <div className="flex justify-between items-center flex-wrap gap-md" style={{ backgroundColor: 'var(--color-warning-bg)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-warning-border)' }}>
            <div>
              <StatusBadge status="CALLED" type="queue" />
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--color-warning)' }}>
                Token #{calledEntry.token_number}
              </h2>
              <p className="text-main font-semibold" style={{ marginTop: '0.15rem' }}>{calledEntry.customer_email || 'Customer'}</p>
            </div>
            <div className="flex gap-sm">
              <button
                className="btn btn-primary"
                onClick={() => handleStart(calledEntry.id)}
                disabled={processingId === calledEntry.id}
              >
                {processingId === calledEntry.id ? 'Starting...' : '▶ Start Service'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleSkip(calledEntry.id)}
                disabled={processingId === calledEntry.id}
              >
                {processingId === calledEntry.id ? 'Skipping...' : '✖ Skip'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center flex-wrap gap-md" style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
            <div>
              <p className="text-main font-semibold">No active patient currently called or in consultation.</p>
              <p className="text-sm text-muted" style={{ marginTop: '0.15rem' }}>Click Call Next to bring the next waiting patient into your room.</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleCallNext}
              disabled={waitingEntries.length === 0 || processingId === 'call-next'}
            >
              {processingId === 'call-next' ? 'Calling...' : `🔊 Call Next (${waitingEntries.length} Waiting)`}
            </button>
          </div>
        )}
      </div>

      {/* Waiting List Table */}
      <div className="card animate-section stagger-2">
        <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
          <h3>Waiting Queue List ({waitingEntries.length})</h3>
        </div>

        {waitingEntries.length === 0 ? (
          <EmptyState
            title="Queue is Clear"
            message="No patients are currently waiting in queue for today."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Token #</th>
                  <th>Customer Email</th>
                  <th>Status</th>
                  <th>Check-In Time</th>
                </tr>
              </thead>
              <tbody>
                {waitingEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className="badge badge-info" style={{ fontSize: '0.85rem', fontWeights: 700 }}>#{entry.token_number}</span>
                    </td>
                    <td className="font-semibold">{entry.customer_email || 'Customer'}</td>
                    <td>
                      <StatusBadge status={entry.status} type="queue" />
                    </td>
                    <td className="text-muted">
                      {entry.created_at
                        ? new Date(entry.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProviderQueuePage;
