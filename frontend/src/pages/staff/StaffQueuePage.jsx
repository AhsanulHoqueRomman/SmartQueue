import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

export function StaffQueuePage() {
  const { currentOrg } = useTenant();

  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [queueEntries, setQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentOrg?.id) {
      setProviders([]);
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
        setProviders(list);
        if (list.length > 0) {
          setSelectedProviderId(list[0].id);
        }
      })
      .catch(() => setError('Failed to load organization providers.'))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id]);

  const fetchQueue = async () => {
    if (!currentOrg?.id || !selectedProviderId) {
      setQueueEntries([]);
      return;
    }
    try {
      const data = await queueService.getProviderQueue(
        currentOrg.id,
        selectedProviderId
      );
      const list = Array.isArray(data) ? data : data.entries || data.results || [];
      setQueueEntries(list);
    } catch (err) {
      setError('Failed to fetch provider queue.');
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [currentOrg?.id, selectedProviderId]);

  useEffect(() => {
    if (!currentOrg?.id || !selectedProviderId) return;
    const interval = setInterval(() => {
      fetchQueue();
    }, 10000);
    return () => clearInterval(interval);
  }, [currentOrg?.id, selectedProviderId]);

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header dropdown above."
      />
    );
  }

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const activeEntry = queueEntries.find((e) => e.status === 'IN_PROGRESS');
  const calledEntry = queueEntries.find((e) => e.status === 'CALLED');
  const waitingEntries = queueEntries.filter((e) => e.status === 'WAITING');

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Queue Monitor Board</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Real-time provider queue supervision for {currentOrg.name}.</p>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '240px' }}>
          <label className="form-label">Provider Roster</label>
          <select
            className="form-control"
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            disabled={loading}
          >
            {providers.length === 0 ? (
              <option value="">No active providers</option>
            ) : (
              providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ? `${p.title} - ` : ''}{p.user_email || `Provider #${p.id.slice(0, 8)}`}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState type="skeleton-card" rows={3} />
      ) : !selectedProvider ? (
        <EmptyState
          title="No Provider Selected"
          message="Please select a provider to view their live queue board."
        />
      ) : (
        <div className="flex flex-col gap-lg animate-section stagger-1">
          {/* Active Call Highlight */}
          <div className="card" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3>Current Call Status for {selectedProvider.user_email || 'Provider'}</h3>
            <div style={{ marginTop: '1rem' }}>
              {activeEntry ? (
                <div className="flex justify-between items-center" style={{ backgroundColor: 'var(--color-primary-light)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-primary-border)' }}>
                  <div>
                    <StatusBadge status="IN_PROGRESS" type="queue" />
                    <h2 style={{ fontSize: '2rem', marginTop: '0.25rem', color: 'var(--color-primary-text)' }}>
                      Serial #{activeEntry.serial_number || activeEntry.token_number}
                    </h2>
                    <p className="text-sm font-semibold" style={{ marginTop: '0.15rem' }}>
                      {activeEntry.customer_name || activeEntry.customer_email}
                    </p>
                  </div>
                  <span className="badge badge-info">In Room</span>
                </div>
              ) : calledEntry ? (
                <div className="flex justify-between items-center" style={{ backgroundColor: 'var(--color-warning-bg)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-border)' }}>
                  <div>
                    <StatusBadge status="CALLED" type="queue" />
                    <h2 style={{ fontSize: '2rem', marginTop: '0.25rem', color: 'var(--color-warning)' }}>
                      Serial #{calledEntry.serial_number || calledEntry.token_number}
                    </h2>
                    <p className="text-sm font-semibold" style={{ marginTop: '0.15rem' }}>
                      {calledEntry.customer_name || calledEntry.customer_email}
                    </p>
                  </div>
                  <span className="badge badge-warning">Called</span>
                </div>
              ) : (
                <p className="text-muted text-sm" style={{ padding: '1rem 0' }}>No active patient called or in consultation for this provider.</p>
              )}
            </div>
          </div>

          {/* Queue List Table */}
          <div className="card animate-section stagger-2">
            <h3>Waiting Patients ({waitingEntries.length})</h3>
            {waitingEntries.length === 0 ? (
              <EmptyState
                title="Queue Empty"
                message="There are no patients waiting in line for this provider."
              />
            ) : (
              <div className="table-container" style={{ marginTop: '1rem' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Serial #</th>
                      <th>Patient Name</th>
                      <th>Arrival Type</th>
                      <th>Check-In Status</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingEntries.map((entry) => (
                      <tr key={entry.id} style={{ background: entry.is_urgent ? '#FEF2F2' : 'transparent' }}>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                            #{entry.serial_number || entry.token_number}
                          </span>
                        </td>
                        <td className="font-semibold">{entry.customer_name || entry.customer_email || 'Patient'}</td>
                        <td>
                          <span className="badge" style={{ fontSize: '0.75rem', background: entry.arrival_type === 'WALK_IN' ? '#F5EFE6' : '#E0F2FE', color: entry.arrival_type === 'WALK_IN' ? '#B06D2E' : '#0369A1' }}>
                            {entry.arrival_type === 'WALK_IN' ? '🚶 Walk-In' : '📅 Scheduled'}
                          </span>
                        </td>
                        <td>
                          {entry.is_checked_in ? (
                            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>✓ Checked In</span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>⏳ Waiting Arrival</span>
                          )}
                        </td>
                        <td>
                          {entry.is_urgent ? (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem', fontWeight: 700 }}>🚨 URGENT</span>
                          ) : (
                            <span className="text-xs text-muted">Normal</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffQueuePage;
