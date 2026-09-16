import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import appointmentService from '../../services/appointmentService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';

export const ProviderDashboard = () => {
  const { user } = useAuth();
  const { currentOrg } = useTenant();
  const navigate = useNavigate();

  const [providerProfile, setProviderProfile] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const fetchOperationalData = useCallback(async (pProfile) => {
    if (!currentOrg?.id || !pProfile?.id) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [qData, apptData] = await Promise.allSettled([
        queueService.getProviderQueue(currentOrg.id, pProfile.id),
        appointmentService.getAppointments(currentOrg.id, {
          provider_id: pProfile.id,
          date: todayStr,
        }),
      ]);

      if (qData.status === 'fulfilled') {
        const qList = Array.isArray(qData.value) ? qData.value : qData.value?.results || [];
        setQueueEntries(qList);
      }
      if (apptData.status === 'fulfilled') {
        const aList = Array.isArray(apptData.value) ? apptData.value : apptData.value?.results || [];
        setTodayAppointments(aList);
      }
    } catch (err) {
      // Background poll error - quiet fail to preserve active UI
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    organizationService
      .getProviders(currentOrg.id)
      .then(async (data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const myProfile = list.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);

        if (myProfile) {
          await fetchOperationalData(myProfile);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError('Failed to resolve provider profile.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id, fetchOperationalData]);

  // 15-second HTTP polling timer with clean unmount & visibility awareness
  useEffect(() => {
    if (!providerProfile?.id || !currentOrg?.id) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchOperationalData(providerProfile);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [providerProfile, currentOrg?.id, fetchOperationalData]);

  const activeEntry = queueEntries.find((e) => e.status === 'IN_PROGRESS');
  const calledEntry = queueEntries.find((e) => e.status === 'CALLED');
  const waitingEntries = queueEntries.filter((e) => e.status === 'WAITING');
  const completedEntries = queueEntries.filter((e) => e.status === 'COMPLETED');

  const handleCallNext = async () => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    setProcessingId('call-next');
    setActionFeedback(null);
    setError(null);

    try {
      const entry = await queueService.callNext(currentOrg.id, providerProfile.id);
      setActionFeedback({
        type: 'success',
        message: `Called Token #${entry.token_number} (${entry.customer_email || 'Customer'}).`,
      });
      await fetchOperationalData(providerProfile);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Cannot call next token. Active entry or conflict exists.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setProcessingId(null);
    }
  };

  const handleStartService = async (entryId) => {
    if (!currentOrg?.id) return;
    setProcessingId(entryId);
    setActionFeedback(null);
    setError(null);

    try {
      await queueService.startEntry(currentOrg.id, entryId);
      setActionFeedback({ type: 'success', message: 'Started service consultation.' });
      await fetchOperationalData(providerProfile);
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to start service.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCompleteService = async (entryId) => {
    if (!currentOrg?.id) return;
    setProcessingId(entryId);
    setActionFeedback(null);
    setError(null);

    try {
      await queueService.completeEntry(currentOrg.id, entryId);
      setActionFeedback({ type: 'success', message: 'Completed appointment service.' });
      await fetchOperationalData(providerProfile);
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to complete service.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSkipPatient = async (entryId) => {
    if (!currentOrg?.id) return;
    setProcessingId(entryId);
    setActionFeedback(null);
    setError(null);

    try {
      await queueService.skipEntry(currentOrg.id, entryId);
      setActionFeedback({ type: 'success', message: 'Skipped token & marked appointment NO_SHOW.' });
      await fetchOperationalData(providerProfile);
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to skip patient.' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="app-container animate-page-entrance">
      {/* Header Banner */}
      <div
        className="card"
        style={{
          marginBottom: '1.75rem',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex justify-between items-center flex-wrap gap-md">
          <div>
            <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>
              Provider Operational Center
            </span>
            <h1 style={{ marginTop: '0.25rem' }}>
              Welcome, {providerProfile?.title ? `${providerProfile.title} ` : ''}
              {user?.first_name || user?.email}!
            </h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Operational schedule & queue telemetry for <strong>{currentOrg?.name || 'SmartQueue'}</strong>.
            </p>
          </div>
          <div className="flex gap-sm flex-wrap">
            <button className="btn btn-primary" onClick={() => navigate('/provider/queue')}>
              ⚡ Live Queue Board
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/provider/appointments')}>
              📋 All Bookings
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/provider/schedule')}>
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
        <div
          className="error-banner"
          style={{
            padding: '1rem',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the header selector."
        />
      ) : loading ? (
        <LoadingState type="skeleton-card" rows={3} />
      ) : !providerProfile ? (
        <EmptyState
          title="Provider Profile Required"
          message={`You do not have an active Provider Profile assigned in ${currentOrg.name}. Contact your manager to be onboarded.`}
        />
      ) : (
        <>
          {/* Operational Metrics Row */}
          <div className="grid-responsive grid-cols-4 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="Today's Bookings"
              value={todayAppointments.length}
              icon="📅"
              subtitle="Scheduled appointments"
              color="info"
            />
            <StatCard
              title="Patients Waiting"
              value={waitingEntries.length}
              icon="⏳"
              subtitle="Checked in & waiting"
              color="warning"
            />
            <StatCard
              title="Currently Active"
              value={activeEntry ? `#${activeEntry.token_number}` : calledEntry ? `#${calledEntry.token_number}` : 'Idle'}
              icon="🩺"
              subtitle={activeEntry ? 'In progress' : calledEntry ? 'Called' : 'No active patient'}
              color="primary"
            />
            <StatCard
              title="Completed Today"
              value={completedEntries.length}
              icon="✓"
              subtitle="Finished consultations"
              color="success"
            />
          </div>

          {/* Consultation Action Control Card */}
          <div
            className="card animate-section stagger-2"
            style={{
              marginBottom: '1.75rem',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Active Consultation Status & Controls</h3>

            {activeEntry ? (
              <div
                className="flex justify-between items-center flex-wrap gap-md"
                style={{
                  backgroundColor: 'var(--color-primary-light)',
                  padding: '1.5rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-primary-border)',
                }}
              >
                <div>
                  <StatusBadge status="IN_PROGRESS" type="queue" />
                  <h2 style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--color-primary-text)' }}>
                    Token #{activeEntry.token_number}
                  </h2>
                  <p className="text-main font-semibold" style={{ marginTop: '0.15rem' }}>
                    {activeEntry.customer_email || 'Customer'} &bull; Service: {activeEntry.appointment?.service_name || 'Consultation'}
                  </p>
                </div>
                <button
                  className="btn btn-success btn-lg"
                  onClick={() => handleCompleteService(activeEntry.id)}
                  disabled={processingId === activeEntry.id}
                >
                  {processingId === activeEntry.id ? 'Completing...' : '✔ Complete Service'}
                </button>
              </div>
            ) : calledEntry ? (
              <div
                className="flex justify-between items-center flex-wrap gap-md"
                style={{
                  backgroundColor: 'var(--color-warning-bg)',
                  padding: '1.5rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-warning-border)',
                }}
              >
                <div>
                  <StatusBadge status="CALLED" type="queue" />
                  <h2 style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--color-warning)' }}>
                    Token #{calledEntry.token_number}
                  </h2>
                  <p className="text-main font-semibold" style={{ marginTop: '0.15rem' }}>
                    {calledEntry.customer_email || 'Customer'}
                  </p>
                </div>
                <div className="flex gap-sm flex-wrap">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={() => handleStartService(calledEntry.id)}
                    disabled={processingId === calledEntry.id}
                  >
                    {processingId === calledEntry.id ? 'Starting...' : '▶ Start Service'}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleSkipPatient(calledEntry.id)}
                    disabled={processingId === calledEntry.id}
                  >
                    {processingId === calledEntry.id ? 'Skipping...' : '✖ Skip (No-Show)'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex justify-between items-center flex-wrap gap-md"
                style={{
                  backgroundColor: 'var(--color-bg-subtle)',
                  padding: '1.5rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <p className="text-main font-semibold">No active patient currently called or in consultation.</p>
                  <p className="text-sm text-muted" style={{ marginTop: '0.15rem' }}>
                    Click below to call the next waiting patient into your consultation room.
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleCallNext}
                  disabled={waitingEntries.length === 0 || processingId === 'call-next'}
                >
                  {processingId === 'call-next' ? 'Calling...' : `🔊 Call Next Patient (${waitingEntries.length} Waiting)`}
                </button>
              </div>
            )}
          </div>

          {/* Today's Schedule Roster */}
          <div className="card animate-section stagger-3" style={{ marginBottom: '1.75rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              <h3>Today's Schedule ({todayAppointments.length})</h3>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/provider/appointments')}>
                View All Appointments &rarr;
              </button>
            </div>

            {todayAppointments.length === 0 ? (
              <EmptyState title="No Appointments Today" message="You have no scheduled appointments for today's date." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Customer</th>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayAppointments.map((appt) => {
                      const dt = appt.start_datetime ? new Date(appt.start_datetime) : null;
                      return (
                        <tr key={appt.id}>
                          <td className="font-semibold">
                            {dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </td>
                          <td>
                            <div className="font-semibold">{appt.customer_name || appt.customer_email}</div>
                            <div className="text-xs text-muted">{appt.customer_email}</div>
                          </td>
                          <td>{appt.service_name || 'Consultation'}</td>
                          <td>
                            <StatusBadge status={appt.status} />
                          </td>
                          <td className="text-xs text-muted" style={{ fontStyle: 'italic' }}>
                            {appt.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProviderDashboard;
