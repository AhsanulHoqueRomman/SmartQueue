import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';

export const ProviderDashboard = () => {
  const { user } = useAuth();
  const { currentOrg, effectiveRole } = useTenant();
  const navigate = useNavigate();

  const [providerProfile, setProviderProfile] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) {
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

        if (myProfile) {
          return queueService.getProviderQueue(currentOrg.id, myProfile.id);
        }
      })
      .then((queueData) => {
        if (!isMounted || !queueData) return;
        const qList = Array.isArray(queueData) ? queueData : queueData.results || [];
        setQueueEntries(qList);
      })
      .catch(() => {
        if (isMounted) {
          setError('Failed to load provider operational overview.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id]);

  const activeEntry = queueEntries.find((e) => e.status === 'IN_PROGRESS');
  const calledEntry = queueEntries.find((e) => e.status === 'CALLED');
  const waitingEntries = queueEntries.filter((e) => e.status === 'WAITING');
  const completedEntries = queueEntries.filter((e) => e.status === 'COMPLETED');

  const handleCallNext = async () => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    setActionFeedback(null);
    setError(null);

    try {
      const entry = await queueService.callNext(currentOrg.id, providerProfile.id);
      setActionFeedback({
        type: 'success',
        message: `Called Token #${entry.token_number} (${entry.customer_email || 'Customer'}).`,
      });
      const q = await queueService.getProviderQueue(currentOrg.id, providerProfile.id);
      setQueueEntries(Array.isArray(q) ? q : q.results || []);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Cannot call next token.',
      });
    }
  };

  return (
    <div className="app-container animate-page-entrance">
      <div className="card" style={{ marginBottom: '1.75rem', backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex justify-between items-center flex-wrap gap-md">
          <div>
            <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Provider Operational Center</span>
            <h1 style={{ marginTop: '0.25rem' }}>Welcome, {providerProfile?.title ? `${providerProfile.title} ` : ''}{user?.first_name || user?.email}!</h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Operational queue telemetry for <strong>{currentOrg?.name || 'SmartQueue'}</strong>.
            </p>
          </div>
          <div className="flex gap-sm">
            <button className="btn btn-primary" onClick={() => navigate('/provider/queue')}>
              🔔 Open Live Queue
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/provider/schedule')}>
              📆 Manage Schedule
            </button>
          </div>
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

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the header dropdown above."
        />
      ) : loading ? (
        <LoadingState type="skeleton-card" rows={3} />
      ) : !providerProfile ? (
        <EmptyState
          title="Provider Profile Required"
          message={`You do not have an active Provider Profile registered in ${currentOrg.name}. Contact your manager to be onboarded.`}
        />
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div className="grid-responsive grid-cols-3 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="Patients Waiting"
              value={waitingEntries.length}
              icon="⏳"
              subtitle="Pending in queue today"
              color="warning"
            />
            <StatCard
              title="Currently Active"
              value={activeEntry ? `#${activeEntry.token_number}` : calledEntry ? `#${calledEntry.token_number}` : 'None'}
              icon="🩺"
              subtitle={activeEntry ? 'In progress' : calledEntry ? 'Called' : 'Idle'}
              color="primary"
            />
            <StatCard
              title="Completed Today"
              value={completedEntries.length}
              icon="✓"
              subtitle="Served patients"
              color="success"
            />
          </div>

          {/* Operational Action Grid */}
          <div className="grid-responsive grid-cols-2 animate-section stagger-2">
            <div className="card flex flex-col justify-between">
              <div>
                <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Current Patient</span>
                <h3>Active Consultation Status</h3>
                <div style={{ marginTop: '1rem', backgroundColor: 'var(--color-bg-subtle)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  {activeEntry ? (
                    <div>
                      <StatusBadge status="IN_PROGRESS" type="queue" />
                      <h4 style={{ marginTop: '0.5rem' }}>Token #{activeEntry.token_number}</h4>
                      <p className="text-sm text-muted" style={{ marginTop: '0.15rem' }}>{activeEntry.customer_email}</p>
                    </div>
                  ) : calledEntry ? (
                    <div>
                      <StatusBadge status="CALLED" type="queue" />
                      <h4 style={{ marginTop: '0.5rem' }}>Token #{calledEntry.token_number}</h4>
                      <p className="text-sm text-muted" style={{ marginTop: '0.15rem' }}>{calledEntry.customer_email}</p>
                    </div>
                  ) : (
                    <p className="text-muted text-sm">No active patient currently in consultation. Click below to call next patient.</p>
                  )}
                </div>
              </div>
              <div className="flex gap-sm" style={{ marginTop: '1.5rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCallNext}
                  disabled={waitingEntries.length === 0 || !!calledEntry || !!activeEntry}
                  style={{ flex: 1 }}
                >
                  🔊 Call Next Patient
                </button>
                <button className="btn btn-outline" onClick={() => navigate('/provider/queue')}>
                  Open Live Board →
                </button>
              </div>
            </div>

            <div className="card flex flex-col justify-between">
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: '0.5rem' }}>Schedule & Roster</span>
                <h3>Working Hours & Leave Management</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Configure weekly working shifts, lunch breaks, and block out vacation leave dates.
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => navigate('/provider/schedule')} style={{ marginTop: '1.5rem' }}>
                Manage Schedule & Leaves →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProviderDashboard;
