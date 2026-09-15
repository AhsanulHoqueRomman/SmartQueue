import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ManagerQueuePage() {
  const { currentOrg } = useTenant();

  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState('ALL');
  const [providerQueues, setProviderQueues] = useState({}); // { providerId: [entries] }
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  const loadAllQueues = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);

    try {
      const provsData = await organizationService.getProviders(currentOrg.id);
      const provList = Array.isArray(provsData) ? provsData : provsData.results || [];
      setProviders(provList);

      const queueMap = {};
      await Promise.all(
        provList.map(async (p) => {
          try {
            const qData = await queueService.getProviderQueue(currentOrg.id, p.id);
            const qList = Array.isArray(qData) ? qData : qData.results || [];
            queueMap[p.id] = qList;
          } catch (err) {
            queueMap[p.id] = [];
          }
        })
      );
      setProviderQueues(queueMap);
    } catch (err) {
      setMessage({ text: 'Failed to load organization queue telemetry.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllQueues();
  }, [currentOrg?.id]);

  const handleCallNext = async (providerId) => {
    if (!currentOrg?.id) return;
    setActionLoadingId(`call_${providerId}`);
    setMessage({ text: '', type: '' });

    try {
      const res = await queueService.callNext(currentOrg.id, providerId);
      setMessage({ text: `Success: Called Token #${res.token_number}!`, type: 'success' });
      await loadAllQueues();
    } catch (err) {
      setMessage({ text: err.response?.data?.detail || 'Failed to call next patient.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStart = async (queueEntryId) => {
    if (!currentOrg?.id) return;
    setActionLoadingId(`start_${queueEntryId}`);
    setMessage({ text: '', type: '' });

    try {
      await queueService.startEntry(currentOrg.id, queueEntryId);
      setMessage({ text: 'Patient session marked IN_PROGRESS.', type: 'success' });
      await loadAllQueues();
    } catch (err) {
      setMessage({ text: err.response?.data?.detail || 'Failed to start session.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleComplete = async (queueEntryId) => {
    if (!currentOrg?.id) return;
    setActionLoadingId(`comp_${queueEntryId}`);
    setMessage({ text: '', type: '' });

    try {
      await queueService.completeEntry(currentOrg.id, queueEntryId);
      setMessage({ text: 'Patient service marked COMPLETED.', type: 'success' });
      await loadAllQueues();
    } catch (err) {
      setMessage({ text: err.response?.data?.detail || 'Failed to complete session.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSkip = async (queueEntryId) => {
    if (!currentOrg?.id) return;
    setActionLoadingId(`skip_${queueEntryId}`);
    setMessage({ text: '', type: '' });

    try {
      await queueService.skipEntry(currentOrg.id, queueEntryId);
      setMessage({ text: 'Patient marked SKIPPED (No Show).', type: 'success' });
      await loadAllQueues();
    } catch (err) {
      setMessage({ text: err.response?.data?.detail || 'Failed to skip patient.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to monitor live queues." />;
  }

  const activeProviders = selectedProviderId === 'ALL'
    ? providers
    : providers.filter((p) => String(p.id) === String(selectedProviderId));

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            ⏳ Live Queue Operations
          </div>
          <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            Live Queue Command Center
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            Monitor and operate active provider queues across <strong>{currentOrg.name}</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontWeight: 600, fontSize: '0.9rem' }}
          >
            <option value="ALL">All Provider Queues</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.user_name || p.title || p.id}</option>
            ))}
          </select>
          <button
            onClick={loadAllQueues}
            style={{ padding: '0.65rem 1.25rem', background: '#5F7A70', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {message.text && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            background: message.type === 'error' ? '#FEF2F2' : 'rgba(95, 122, 112, 0.1)',
            color: message.type === 'error' ? '#991B1B' : '#5F7A70',
            border: `1px solid ${message.type === 'error' ? '#FCA5A5' : '#5F7A70'}`,
          }}
        >
          {message.type === 'error' ? '⚠️ ' : '✓ '} {message.text}
        </div>
      )}

      {loading ? (
        <LoadingState message="Fetching live queue streams..." />
      ) : activeProviders.length === 0 ? (
        <EmptyState title="No Active Providers" message="No provider profiles found for this organization." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {activeProviders.map((prov) => {
            const queueList = providerQueues[prov.id] || [];
            const currentlyCalled = queueList.find((q) => q.status === 'CALLED');
            const inProgress = queueList.find((q) => q.status === 'IN_PROGRESS');
            const waitingList = queueList.filter((q) => q.status === 'WAITING');

            return (
              <div
                key={prov.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E6E1D9',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                }}
              >
                {/* Provider Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid #FAF8F3' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#211C19', fontWeight: 700 }}>
                      🩺 {prov.user_name || 'Provider'}
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: '#78716C' }}>
                      {prov.title || 'Specialist'} • Waiting: <strong>{waitingList.length}</strong> patient(s)
                    </div>
                  </div>

                  <button
                    disabled={actionLoadingId === `call_${prov.id}` || waitingList.length === 0}
                    onClick={() => handleCallNext(prov.id)}
                    style={{
                      padding: '0.65rem 1.25rem',
                      background: '#2F2520',
                      color: '#FAF8F3',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      cursor: waitingList.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: waitingList.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {actionLoadingId === `call_${prov.id}` ? 'Calling...' : '📢 Call Next Patient'}
                  </button>
                </div>

                {/* Queue Cards Row: Called / In Progress */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  {/* Currently Called Slot */}
                  <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B06D2E', textTransform: 'uppercase' }}>
                      🔔 Currently Called
                    </div>
                    {currentlyCalled ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#211C19' }}>
                          Token #{currentlyCalled.token_number}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#211C19', fontWeight: 600, marginTop: '0.2rem' }}>
                          {currentlyCalled.service_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#78716C' }}>
                          Customer: {currentlyCalled.customer_email || 'Patient'}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                          <button
                            disabled={actionLoadingId === `start_${currentlyCalled.id}`}
                            onClick={() => handleStart(currentlyCalled.id)}
                            style={{ flex: 1, padding: '0.5rem', background: '#5F7A70', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                          >
                            ▶ Start
                          </button>
                          <button
                            disabled={actionLoadingId === `skip_${currentlyCalled.id}`}
                            onClick={() => handleSkip(currentlyCalled.id)}
                            style={{ flex: 1, padding: '0.5rem', background: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                          >
                            ⏭ Skip (No Show)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#78716C', fontStyle: 'italic', marginTop: '0.5rem' }}>
                        No patient currently called. Click "Call Next Patient" above.
                      </div>
                    )}
                  </div>

                  {/* Service In Progress Slot */}
                  <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase' }}>
                      🩺 Service In Progress
                    </div>
                    {inProgress ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#5F7A70' }}>
                          Token #{inProgress.token_number}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#211C19', fontWeight: 600, marginTop: '0.2rem' }}>
                          {inProgress.service_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#78716C' }}>
                          Customer: {inProgress.customer_email || 'Patient'}
                        </div>

                        <button
                          disabled={actionLoadingId === `comp_${inProgress.id}`}
                          onClick={() => handleComplete(inProgress.id)}
                          style={{ width: '100%', marginTop: '1rem', padding: '0.55rem', background: '#5F7A70', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          ✓ Complete Service Session
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#78716C', fontStyle: 'italic', marginTop: '0.5rem' }}>
                        No active service session currently in progress.
                      </div>
                    )}
                  </div>
                </div>

                {/* Waiting Patients List */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    Waiting Queue Roster ({waitingList.length})
                  </div>
                  {waitingList.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#78716C', padding: '0.75rem', background: '#FAF8F3', borderRadius: '8px' }}>
                      No patients waiting in queue for this provider.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      {waitingList.map((entry) => (
                        <div key={entry.id} style={{ padding: '0.75rem', background: '#FAF8F3', borderRadius: '8px', border: '1px solid #E6E1D9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#211C19', fontSize: '1.05rem' }}>#{entry.token_number}</div>
                            <div style={{ fontSize: '0.78rem', color: '#78716C' }}>{entry.service_name}</div>
                          </div>
                          <StatusBadge status={entry.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ManagerQueuePage;
