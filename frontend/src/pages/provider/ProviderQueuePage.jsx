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
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Walk-in modal state
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    service_id: '',
    notes: '',
  });

  // Urgent modal state
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [urgentEntryId, setUrgentEntryId] = useState(null);
  const [urgentReason, setUrgentReason] = useState('');

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) {
      setProviderProfile(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    Promise.all([
      organizationService.getProviders(currentOrg.id),
      organizationService.getServices(currentOrg.id),
    ])
      .then(([provData, svcData]) => {
        if (!isMounted) return;
        const pList = Array.isArray(provData) ? provData : provData.results || [];
        const myProfile = pList.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);

        const sList = Array.isArray(svcData) ? svcData : svcData.results || [];
        setServices(sList);
        if (sList.length > 0) {
          setWalkInForm((prev) => ({ ...prev, service_id: sList[0].id }));
        }
      })
      .catch(() => {
        if (isMounted) setError('Failed to load operational configuration.');
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
      const data = await queueService.getProviderQueue(currentOrg.id, providerProfile.id);
      const list = Array.isArray(data) ? data : data.entries || data.results || [];
      setQueueEntries(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update queue data.');
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
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, currentOrg?.id, providerProfile?.id]);

  const handleCallNext = async () => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    setProcessingId('call-next');
    setActionFeedback(null);
    setError(null);

    try {
      const entry = await queueService.callNext(currentOrg.id, providerProfile.id);
      setActionFeedback({
        type: 'success',
        message: `Called Serial #${entry.serial_number || entry.token_number} (${entry.customer_name || entry.customer_email}).`,
      });
      fetchQueue();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to call next patient. Ensure next patient is checked in.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setProcessingId(null);
    }
  };

  const handleStart = async (entryId) => {
    setProcessingId(entryId);
    setActionFeedback(null);

    try {
      await queueService.startEntry(currentOrg.id, entryId);
      setActionFeedback({ type: 'success', message: 'Started service for patient.' });
      fetchQueue();
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to start service.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleComplete = async (entryId) => {
    setProcessingId(entryId);
    setActionFeedback(null);

    try {
      await queueService.completeEntry(currentOrg.id, entryId);
      setActionFeedback({ type: 'success', message: 'Completed appointment service.' });
      fetchQueue();
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to complete service.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSkip = async (entryId) => {
    setProcessingId(entryId);
    setActionFeedback(null);

    try {
      await queueService.skipEntry(currentOrg.id, entryId);
      setActionFeedback({ type: 'success', message: 'Skipped entry and marked appointment NO_SHOW.' });
      fetchQueue();
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to skip entry.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleWalkInSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id || !providerProfile?.id) return;
    setProcessingId('walkin');

    try {
      const entry = await queueService.registerWalkIn(currentOrg.id, providerProfile.id, walkInForm);
      setActionFeedback({
        type: 'success',
        message: `Walk-in patient registered with Serial #${entry.serial_number || entry.token_number}.`,
      });
      setShowWalkInModal(false);
      setWalkInForm({ first_name: '', last_name: '', phone_number: '', service_id: services[0]?.id || '', notes: '' });
      fetchQueue();
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to register walk-in patient.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkUrgentSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id || !urgentEntryId) return;
    setProcessingId(urgentEntryId);

    try {
      await queueService.markUrgent(currentOrg.id, urgentEntryId, urgentReason);
      setActionFeedback({ type: 'success', message: 'Queue entry bumped as URGENT.' });
      setShowUrgentModal(false);
      setUrgentReason('');
      fetchQueue();
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to mark urgent.' });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <LoadingState type="spinner" text="Loading provider command center..." />;
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
  const checkedInWaitingCount = waitingEntries.filter((e) => e.is_checked_in).length;

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Serial Provider Queue Command Board</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Serial-Based Provider Desk &bull; {currentOrg?.name}</p>
        </div>
        <div className="flex items-center gap-sm">
          <button
            className="btn btn-secondary"
            onClick={() => setShowWalkInModal(true)}
            style={{ fontWeight: 700 }}
          >
            ➕ Register Front-Desk Walk-In
          </button>
          <label className="flex items-center gap-xs text-sm text-muted" style={{ cursor: 'pointer', marginLeft: '0.5rem' }}>
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
        <h3 style={{ marginBottom: '1rem' }}>Active Consultation & Service Controls</h3>

        {activeEntry ? (
          <div className="flex justify-between items-center flex-wrap gap-md animate-zoom-in" style={{ backgroundColor: 'var(--color-primary-light)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-primary-border)' }}>
            <div>
              <StatusBadge status="IN_PROGRESS" type="queue" />
              <h2 className="animate-float" style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--color-primary-text)' }}>
                Serial #{activeEntry.serial_number || activeEntry.token_number}
              </h2>
              <p className="text-main font-semibold" style={{ marginTop: '0.15rem' }}>
                {activeEntry.customer_name || activeEntry.customer_email || 'Patient'}
              </p>
              <span className="badge badge-success" style={{ marginTop: '0.35rem' }}>Service In Progress</span>
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
                Serial #{calledEntry.serial_number || calledEntry.token_number}
              </h2>
              <p className="text-main font-semibold" style={{ marginTop: '0.15rem' }}>
                {calledEntry.customer_name || calledEntry.customer_email || 'Patient'}
              </p>
              <span className="badge badge-warning" style={{ marginTop: '0.35rem' }}>Called to Counter/Room</span>
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
              <p className="text-main font-semibold">No active patient currently in consultation room.</p>
              <p className="text-sm text-muted" style={{ marginTop: '0.15rem' }}>
                {checkedInWaitingCount > 0
                  ? `${checkedInWaitingCount} checked-in patient(s) ready to be called.`
                  : 'No checked-in patients waiting. Click Call Next when a checked-in patient arrives.'}
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleCallNext}
              disabled={checkedInWaitingCount === 0 || processingId === 'call-next'}
            >
              {processingId === 'call-next' ? 'Calling...' : `🔊 Call Next (${checkedInWaitingCount} Checked-In Ready)`}
            </button>
          </div>
        )}
      </div>

      {/* Waiting List Table */}
      <div className="card animate-section stagger-2">
        <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
          <h3>Daily Serial Queue List ({waitingEntries.length} Total &bull; {checkedInWaitingCount} Checked In)</h3>
        </div>

        {waitingEntries.length === 0 ? (
          <EmptyState
            title="Queue is Clear"
            message="No patients are currently in the waiting list for today."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Serial #</th>
                  <th>Patient Name & Contact</th>
                  <th>Arrival Type</th>
                  <th>Presence / Check-In</th>
                  <th>Priority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {waitingEntries.map((entry) => (
                  <tr key={entry.id} style={{ background: entry.is_urgent ? '#FEF2F2' : 'transparent' }}>
                    <td>
                      <span className="badge badge-info" style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                        #{entry.serial_number || entry.token_number}
                      </span>
                    </td>
                    <td>
                      <div className="font-semibold">{entry.customer_name || 'Walk-In / Customer'}</div>
                      <div className="text-xs text-muted">{entry.customer_email || entry.customer_phone || ''}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ fontSize: '0.75rem', background: entry.arrival_type === 'WALK_IN' ? '#F5EFE6' : '#E0F2FE', color: entry.arrival_type === 'WALK_IN' ? '#B06D2E' : '#0369A1' }}>
                        {entry.arrival_type === 'WALK_IN' ? '🚶 Walk-In' : '📅 Scheduled'}
                      </span>
                    </td>
                    <td>
                      {entry.is_checked_in ? (
                        <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>✓ Checked In</span>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>⏳ Not Checked In</span>
                      )}
                    </td>
                    <td>
                      {entry.is_urgent ? (
                        <span className="badge badge-danger" style={{ fontSize: '0.75rem', fontWeight: 700 }}>🚨 URGENT</span>
                      ) : (
                        <span className="text-xs text-muted">Normal</span>
                      )}
                    </td>
                    <td>
                      {!entry.is_urgent && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setUrgentEntryId(entry.id);
                            setShowUrgentModal(true);
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        >
                          ⚡ Mark Urgent
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Front-Desk Walk-In Registration Modal */}
      {showWalkInModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card animate-zoom-in" style={{ width: '90%', maxWidth: '500px', background: '#FFFFFF', padding: '2rem', borderRadius: '16px' }}>
            <h2 style={{ marginBottom: '1rem', fontFamily: 'Cinzel, serif' }}>Register Front-Desk Walk-In Patient</h2>
            <form onSubmit={handleWalkInSubmit}>
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={walkInForm.first_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, first_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={walkInForm.last_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, last_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="+8801700000000"
                  value={walkInForm.phone_number}
                  onChange={(e) => setWalkInForm({ ...walkInForm, phone_number: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Service *</label>
                <select
                  className="form-control"
                  required
                  value={walkInForm.service_id}
                  onChange={(e) => setWalkInForm({ ...walkInForm, service_id: e.target.value })}
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowWalkInModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={processingId === 'walkin'}>
                  {processingId === 'walkin' ? 'Registering...' : 'Register & Assign Serial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Urgent Modal */}
      {showUrgentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card animate-zoom-in" style={{ width: '90%', maxWidth: '450px', background: '#FFFFFF', padding: '2rem', borderRadius: '16px' }}>
            <h3 style={{ marginBottom: '1rem', color: '#991B1B' }}>Bump Patient as Urgent</h3>
            <p style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '1rem' }}>
              Urgent entries are prioritized to the top of the waiting queue and will be called next.
            </p>
            <form onSubmit={handleMarkUrgentSubmit}>
              <div className="form-group">
                <label className="form-label">Reason for Emergency/Urgent Bump</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Acute pain / High priority triage"
                  value={urgentReason}
                  onChange={(e) => setUrgentReason(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowUrgentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Confirm Urgent Bump
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderQueuePage;
