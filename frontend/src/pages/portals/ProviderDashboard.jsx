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
import '../../styles/ProviderDashboard.css';

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
    <div className="qt-provider-dashboard app-container animate-page-entrance">
      {/* 1. Header Command Card */}
      <header className="qt-provider-dashboard__header">
        <div className="qt-provider-dashboard__header-info">
          <span className="qt-provider-dashboard__badge">
            Provider Operational Center
          </span>
          <h1 className="qt-provider-dashboard__title">
            Welcome, {providerProfile?.title ? `${providerProfile.title} ` : ''}
            {user?.first_name || user?.email}!
          </h1>
          <p className="qt-provider-dashboard__subtitle">
            Operational schedule & queue telemetry for <strong>{currentOrg?.name || 'QueueTurn'}</strong>.
          </p>
        </div>
        <div className="qt-provider-dashboard__header-actions">
          <button
            type="button"
            className="btn btn-primary qt-provider-dashboard__nav-btn"
            onClick={() => navigate('/provider/queue')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Live Queue Board
          </button>
          <button
            type="button"
            className="btn btn-secondary qt-provider-dashboard__nav-btn"
            onClick={() => navigate('/provider/appointments')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            All Bookings
          </button>
          <button
            type="button"
            className="btn btn-outline qt-provider-dashboard__nav-btn"
            onClick={() => navigate('/provider/schedule')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Manage Schedule
          </button>
        </div>
      </header>

      {/* 2. Operational Feedback Banner */}
      {actionFeedback && (
        <div
          className={`qt-provider-dashboard__feedback qt-provider-dashboard__feedback--${actionFeedback.type}`}
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
        >
          <div className="qt-provider-dashboard__feedback-icon" aria-hidden="true">
            {actionFeedback.type === 'success' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="qt-provider-dashboard__feedback-message">
            {actionFeedback.message}
          </div>
        </div>
      )}

      {/* 3. Error Banner */}
      {error && (
        <div
          className="qt-provider-dashboard__error-banner"
          role="alert"
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
          {/* 4. Operational Metrics Row */}
          <section className="qt-provider-dashboard__metrics animate-section stagger-1" aria-label="Provider operational metrics">
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
          </section>

          {/* 5. Consultation Action Control Card */}
          <section className="qt-provider-dashboard__control-card animate-section stagger-2" aria-labelledby="provider-consultation-heading">
            <h3 id="provider-consultation-heading" className="qt-provider-dashboard__section-title">
              Active Consultation Status & Controls
            </h3>

            {activeEntry ? (
              <div className="qt-provider-dashboard__panel qt-provider-dashboard__panel--active">
                <div className="qt-provider-dashboard__panel-details">
                  <StatusBadge status="IN_PROGRESS" type="queue" />
                  <h2 className="qt-provider-dashboard__token-number">
                    Token #{activeEntry.token_number}
                  </h2>
                  <p className="qt-provider-dashboard__patient-info">
                    {activeEntry.customer_email || 'Customer'} &bull; Service: {activeEntry.appointment?.service_name || 'Consultation'}
                  </p>
                </div>
                <div className="qt-provider-dashboard__panel-actions">
                  <button
                    type="button"
                    className="btn btn-success btn-lg qt-provider-dashboard__action-btn"
                    onClick={() => handleCompleteService(activeEntry.id)}
                    disabled={processingId === activeEntry.id}
                    aria-busy={processingId === activeEntry.id}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {processingId === activeEntry.id ? 'Completing...' : 'Complete Service'}
                  </button>
                </div>
              </div>
            ) : calledEntry ? (
              <div className="qt-provider-dashboard__panel qt-provider-dashboard__panel--called">
                <div className="qt-provider-dashboard__panel-details">
                  <StatusBadge status="CALLED" type="queue" />
                  <h2 className="qt-provider-dashboard__token-number">
                    Token #{calledEntry.token_number}
                  </h2>
                  <p className="qt-provider-dashboard__patient-info">
                    {calledEntry.customer_email || 'Customer'}
                  </p>
                </div>
                <div className="qt-provider-dashboard__panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg qt-provider-dashboard__action-btn"
                    onClick={() => handleStartService(calledEntry.id)}
                    disabled={processingId === calledEntry.id}
                    aria-busy={processingId === calledEntry.id}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    {processingId === calledEntry.id ? 'Starting...' : 'Start Service'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger qt-provider-dashboard__action-btn"
                    onClick={() => handleSkipPatient(calledEntry.id)}
                    disabled={processingId === calledEntry.id}
                    aria-busy={processingId === calledEntry.id}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {processingId === calledEntry.id ? 'Skipping...' : 'Skip (No-Show)'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="qt-provider-dashboard__panel qt-provider-dashboard__panel--idle">
                <div className="qt-provider-dashboard__panel-details">
                  <p className="qt-provider-dashboard__patient-info">No active patient currently called or in consultation.</p>
                  <p className="qt-provider-dashboard__panel-hint">
                    Click below to call the next waiting patient into your consultation room.
                  </p>
                </div>
                <div className="qt-provider-dashboard__panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg qt-provider-dashboard__action-btn"
                    onClick={handleCallNext}
                    disabled={waitingEntries.length === 0 || processingId === 'call-next'}
                    aria-busy={processingId === 'call-next'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    {processingId === 'call-next' ? 'Calling...' : `Call Next Patient (${waitingEntries.length} Waiting)`}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 6. Today's Schedule Roster Card & Table */}
          <section className="qt-provider-dashboard__schedule-card animate-section stagger-3" aria-labelledby="provider-schedule-heading">
            <div className="qt-provider-dashboard__schedule-header">
              <h3 id="provider-schedule-heading" className="qt-provider-dashboard__section-title">
                Today's Schedule ({todayAppointments.length})
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigate('/provider/appointments')}
              >
                View All Appointments &rarr;
              </button>
            </div>

            {todayAppointments.length === 0 ? (
              <EmptyState title="No Appointments Today" message="You have no scheduled appointments for today's date." />
            ) : (
              <div className="qt-provider-dashboard__table-wrapper" role="region" aria-label="Today's provider schedule table" tabIndex="0">
                <table className="qt-provider-dashboard__table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Service</th>
                      <th scope="col">Status</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayAppointments.map((appt) => {
                      const dt = appt.start_datetime ? new Date(appt.start_datetime) : null;
                      return (
                        <tr key={appt.id}>
                          <td className="qt-provider-dashboard__time-cell">
                            {dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </td>
                          <td>
                            <div className="qt-provider-dashboard__customer-name">
                              {appt.customer_name || appt.customer_email}
                            </div>
                            <div className="qt-provider-dashboard__customer-sub">{appt.customer_email}</div>
                          </td>
                          <td className="qt-provider-dashboard__service-name">
                            {appt.service_name || 'Consultation'}
                          </td>
                          <td>
                            <StatusBadge status={appt.status} />
                          </td>
                          <td className="qt-provider-dashboard__notes-cell">
                            {appt.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ProviderDashboard;
