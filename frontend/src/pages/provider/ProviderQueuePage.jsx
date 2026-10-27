import { EmergencyPanel } from '../../components/EmergencyPanel';
import { useRequestScope } from '../../hooks/useRequestScope';
import { currentBusinessDate } from '../../utils/bookingDisplay';
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import '../../styles/ProviderQueue.css';

export function ProviderQueuePage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  const [providerProfile, setProviderProfile] = useState(null);
  const [queueRows, setQueueEntries] = useState([]);
  const [queueDate, setQueueDate] = useState(currentBusinessDate);
  const [queueDates, setQueueDates] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Skip confirmation state and accessibility refs
  const [skipConfirmEntry, setSkipConfirmEntry] = useState(null);
  const skipOriginatingBtnRef = useRef(null);
  const skipCancelBtnRef = useRef(null);
  const skipDialogRef = useRef(null);

  // Walk-in modal state
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    service_id: '',
    notes: '',
  });

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) {
      setProviderProfile(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setProviderProfile(null); setQueueEntries([]); setQueueDates([]);
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

  const queueContext = `${user?.id}:${currentOrg?.id}:${providerProfile?.id}:${queueDate}`;
  const latestQueueContext = useRef(queueContext);
  useLayoutEffect(() => { latestQueueContext.current = queueContext; }, [queueContext]);

  const [loadedQueueContext, setLoadedQueueContext] = useState('');
  const queueEntries = loadedQueueContext === queueContext ? queueRows : [];
  const mutationBusy = useRef(false);
  const requestScope = useRequestScope(queueContext);
  const fetchQueue = async (force = false) => {
    const context = queueContext;
    if (context !== latestQueueContext.current || (mutationBusy.current && !force)) return;
    const ticket = requestScope.begin(queueContext, { background: !force });
    if (!currentOrg?.id || !providerProfile?.id) return;
    if (!ticket) return;
    try {
      const data = await queueService.getProviderQueue(currentOrg.id, providerProfile.id, queueDate);
      if (context !== latestQueueContext.current || !requestScope.isCurrent(ticket)) return;
      const list = Array.isArray(data) ? data : data.entries || data.results || [];
      setError(null); setQueueEntries(list); setLoadedQueueContext(context);
      setQueueDates(data.available_queue_dates || []);
    } catch (err) {
      if (context !== latestQueueContext.current || !requestScope.isCurrent(ticket)) return;
      setError(err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to update queue data.');
    } finally { requestScope.finish(ticket); }
  };

  useEffect(() => {
    mutationBusy.current = false; setProcessingId(null); setActionFeedback(null);
    if (providerProfile?.id) {
      fetchQueue();
    }
  }, [currentOrg?.id, providerProfile?.id, queueDate]);

  useEffect(() => {
    if (!autoRefresh || !providerProfile?.id) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchQueue();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, currentOrg?.id, providerProfile?.id, queueDate]);

  const setBusy = value => {
    if (queueContext !== latestQueueContext.current) return;
    mutationBusy.current = value !== null;
    if (value !== null) requestScope.invalidate();
    setProcessingId(value);
  };

  const handleCallNext = async () => {
    if (mutationBusy.current) return;
    if (!currentOrg?.id || !providerProfile?.id) return;
    setBusy('call-next');
    setActionFeedback(null);
    setError(null);

    try {
      const entry = await queueService.callNext(currentOrg.id, providerProfile.id, queueDate);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Called Serial #${entry.serial_number || entry.token_number} (${entry.customer_name || entry.customer_email}).`,
      });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      const msg = err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to call next patient. Ensure next patient is checked in.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setBusy(null);
    }
  };

  const handleStart = async (entryId) => {
    if (mutationBusy.current) return;
    setBusy(entryId);
    setActionFeedback(null);

    try {
      await queueService.startEntry(currentOrg.id, entryId);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'success', message: 'Started service for patient.' });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'error', message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to start service.' });
    } finally {
      setBusy(null);
    }
  };

  const handleComplete = async (entryId) => {
    if (mutationBusy.current) return;
    setBusy(entryId);
    setActionFeedback(null);

    try {
      await queueService.completeEntry(currentOrg.id, entryId);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'success', message: 'Completed appointment service.' });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'error', message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to complete service.' });
    } finally {
      setBusy(null);
    }
  };

  const handleSkip = async (entryId) => {
    if (mutationBusy.current) return;
    setBusy(entryId);
    setActionFeedback(null);

    try {
      await queueService.skipEntry(currentOrg.id, entryId);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'success', message: 'Skipped entry and marked appointment NO_SHOW.' });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'error', message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to skip entry.' });
    } finally {
      setBusy(null);
    }
  };

  const closeSkipConfirm = useCallback(() => {
    if (mutationBusy.current || processingId) return;
    setSkipConfirmEntry(null);
    const triggerEl = skipOriginatingBtnRef.current;
    skipOriginatingBtnRef.current = null;
    if (triggerEl && typeof triggerEl.focus === 'function') {
      setTimeout(() => {
        try {
          triggerEl.focus();
        } catch {
          // ignore if unmounted
        }
      }, 0);
    }
  }, [processingId]);

  const handleConfirmSkip = async () => {
    if (!skipConfirmEntry || mutationBusy.current || processingId) return;
    const entryId = skipConfirmEntry.id;
    skipOriginatingBtnRef.current = null;
    try {
      await handleSkip(entryId);
    } finally {
      setSkipConfirmEntry(null);
    }
  };

  useEffect(() => {
    if (!skipConfirmEntry) return;

    // 1. Initial focus: place focus on Cancel button
    const focusTimer = setTimeout(() => {
      skipCancelBtnRef.current?.focus?.();
    }, 50);

    // 2. Focus trap and Escape key listener
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSkipConfirm();
        return;
      }

      if (e.key === 'Tab') {
        if (!skipDialogRef.current) return;
        const focusableElements = skipDialogRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements.length) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [skipConfirmEntry, closeSkipConfirm]);

  const handleWalkInSubmit = async (e) => {
    if (mutationBusy.current) return;
    e.preventDefault();
    if (!currentOrg?.id || !providerProfile?.id) return;
    setBusy('walkin');

    try {
      const entry = await queueService.registerWalkIn(currentOrg.id, providerProfile.id, walkInForm);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Walk-in patient registered with Serial #${entry.serial_number || entry.token_number}.`,
      });
      setShowWalkInModal(false);
      setWalkInForm({ first_name: '', last_name: '', phone_number: '', service_id: services[0]?.id || '', notes: '' });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'error', message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to register walk-in patient.' });
    } finally {
      setBusy(null);
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
    <div className="provider-queue animate-page-entrance">
      <EmergencyPanel
        orgId={currentOrg.id}
        providerId={providerProfile.id}
        serviceDate={queueDate}
        mode="provider"
        onChanged={() => fetchQueue(true)}
      />

      {/* Top Header Command Bar */}
      <div className="provider-queue__header">
        <div className="provider-queue__header-info">
          <h1 className="provider-queue__title">Provider Queue Command Board</h1>
          <p className="provider-queue__subtitle">
            Serial-Based Provider Desk &bull; <span className="provider-queue__subtitle-org">{currentOrg?.name}</span>
          </p>
        </div>

        <div className="provider-queue__header-actions">
          <button
            type="button"
            className="provider-queue__btn provider-queue__btn--walkin"
            onClick={() => setShowWalkInModal(true)}
          >
            ➕ Register Front-Desk Walk-In
          </button>

          <button
            type="button"
            className="provider-queue__btn provider-queue__btn--refresh"
            onClick={() => fetchQueue(true)}
            title="Refresh queue data now"
          >
            🔄 Refresh
          </button>

          <label className="provider-queue__auto-refresh-label">
            <input
              type="checkbox"
              className="provider-queue__auto-refresh-input"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (10s)
          </label>
        </div>
      </div>

      {/* Queue Date Control & Unfinished Queues Bar */}
      <div className="provider-queue__date-bar">
        <div className="provider-queue__date-picker-wrap">
          <span className="provider-queue__date-label">Queue Date:</span>
          <input
            className="provider-queue__date-input"
            type="date"
            value={queueDate}
            onChange={(e) => setQueueDate(e.target.value)}
          />
        </div>

        {queueDates.filter((date) => date !== queueDate).length > 0 && (
          <div className="provider-queue__unfinished-pills">
            {queueDates
              .filter((date) => date !== queueDate)
              .map((date) => (
                <button
                  key={date}
                  type="button"
                  className="provider-queue__unfinished-pill"
                  onClick={() => setQueueDate(date)}
                >
                  ⚠️ Unfinished queue: {date}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`provider-queue__banner provider-queue__banner--${actionFeedback.type}`}
          role="status"
        >
          {actionFeedback.type === 'success' ? '✓ ' : '⚠️ '}
          {actionFeedback.message}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="provider-queue__banner provider-queue__banner--error" role="alert">
          ⚠️ {error}
        </div>
      )}

      {/* Active Consultation Console */}
      <div className="provider-queue__console">
        <h2 className="provider-queue__console-title">Active Consultation & Service Controls</h2>

        {activeEntry ? (
          /* State 1: In Consultation */
          <div className="provider-queue__stage-card provider-queue__stage-card--in-progress">
            <div className="provider-queue__stage-info">
              <div className="provider-queue__stage-badge-row">
                <StatusBadge status="IN_PROGRESS" type="queue" />
                <span className="provider-queue__arrival-badge provider-queue__arrival-badge--scheduled">
                  Service In Progress
                </span>
              </div>
              <div className="provider-queue__stage-serial">
                Serial #{activeEntry.serial_number || activeEntry.token_number}
              </div>
              <p className="provider-queue__stage-patient">
                {activeEntry.customer_name || activeEntry.customer_email || 'Patient'}
              </p>
              <div className="provider-queue__stage-contact">
                {activeEntry.service_name && `${activeEntry.service_name} • `}
                {activeEntry.customer_phone || activeEntry.customer_email || ''}
              </div>
            </div>

            <div className="provider-queue__stage-actions">
              <button
                type="button"
                className="provider-queue__btn provider-queue__btn--success"
                onClick={() => handleComplete(activeEntry.id)}
                disabled={processingId === activeEntry.id}
              >
                {processingId === activeEntry.id ? 'Completing...' : '✔ Complete Service'}
              </button>
            </div>
          </div>
        ) : calledEntry ? (
          /* State 2: Patient Called */
          <div className="provider-queue__stage-card provider-queue__stage-card--called">
            <div className="provider-queue__stage-info">
              <div className="provider-queue__stage-badge-row">
                <StatusBadge status="CALLED" type="queue" />
                <span className="provider-queue__arrival-badge provider-queue__arrival-badge--walkin">
                  Called to Counter / Room
                </span>
              </div>
              <div className="provider-queue__stage-serial provider-queue__stage-serial--called">
                Serial #{calledEntry.serial_number || calledEntry.token_number}
              </div>
              <p className="provider-queue__stage-patient">
                {calledEntry.customer_name || calledEntry.customer_email || 'Patient'}
              </p>
              <div className="provider-queue__stage-contact">
                {calledEntry.service_name && `${calledEntry.service_name} • `}
                {calledEntry.customer_phone || calledEntry.customer_email || ''}
              </div>
            </div>

            <div className="provider-queue__stage-actions">
              <button
                type="button"
                className="provider-queue__btn provider-queue__btn--primary"
                onClick={() => handleStart(calledEntry.id)}
                disabled={processingId === calledEntry.id}
              >
                {processingId === calledEntry.id ? 'Starting...' : '▶ Start Service'}
              </button>

              <button
                type="button"
                className="provider-queue__btn provider-queue__btn--danger"
                onClick={(e) => {
                  skipOriginatingBtnRef.current = e.currentTarget;
                  setSkipConfirmEntry(calledEntry);
                }}
                disabled={processingId === calledEntry.id}
              >
                {processingId === calledEntry.id ? 'Skipping...' : '✖ Skip'}
              </button>
            </div>
          </div>
        ) : (
          /* State 3: Idle */
          <div className="provider-queue__stage-card provider-queue__stage-card--idle">
            <div className="provider-queue__stage-info">
              <p className="provider-queue__stage-patient">No active patient currently in consultation room.</p>
              <p className="provider-queue__stage-contact">
                {checkedInWaitingCount > 0
                  ? `${checkedInWaitingCount} checked-in patient(s) ready to be called.`
                  : 'No checked-in patients waiting. Click Call Next when a checked-in patient arrives.'}
              </p>
            </div>

            <div className="provider-queue__stage-actions">
              <button
                type="button"
                className="provider-queue__btn provider-queue__btn--primary"
                onClick={handleCallNext}
                disabled={checkedInWaitingCount === 0 || processingId === 'call-next'}
              >
                {processingId === 'call-next'
                  ? 'Calling...'
                  : `🔊 Call Next (${checkedInWaitingCount} Checked-In Ready)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Daily Waiting Queue Roster Table */}
      <div className="provider-queue__roster-card">
        <div className="provider-queue__roster-header">
          <h2 className="provider-queue__roster-title">
            Daily Serial Queue List ({waitingEntries.length} Total &bull; {checkedInWaitingCount} Checked In)
          </h2>
        </div>

        {waitingEntries.length === 0 ? (
          <EmptyState
            title="Queue is Clear"
            message="No patients are currently in the waiting list for today."
          />
        ) : (
          <>
            <div className="qt-table-scroll-hint" aria-hidden="true">
              <svg
                className="qt-table-scroll-hint__icon"
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Scroll table horizontally for full details and presence</span>
              <svg
                className="qt-table-scroll-hint__icon"
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
            <div
              className="provider-queue__table-wrap"
              role="region"
              aria-label="Daily waiting queue roster"
              tabIndex={0}
            >
            <table className="provider-queue__table">
              <thead>
                <tr>
                  <th>Serial #</th>
                  <th>Patient Details</th>
                  <th>Arrival Channel</th>
                  <th>Presence / Check-In</th>
                </tr>
              </thead>
              <tbody>
                {waitingEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className="provider-queue__serial-badge">
                        #{entry.serial_number || entry.token_number}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{entry.customer_name || 'Walk-In / Customer'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        {entry.customer_email || entry.customer_phone || ''}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`provider-queue__arrival-badge provider-queue__arrival-badge--${
                          entry.arrival_type === 'WALK_IN' ? 'walkin' : 'scheduled'
                        }`}
                      >
                        {entry.arrival_type === 'WALK_IN' ? '🚶 Walk-In' : '📅 Scheduled'}
                      </span>
                    </td>
                    <td>
                      {entry.is_checked_in ? (
                        <span className="provider-queue__presence-badge provider-queue__presence-badge--ready">
                          ✓ Checked In
                        </span>
                      ) : (
                        <span className="provider-queue__presence-badge provider-queue__presence-badge--pending">
                          ⏳ Not Checked In
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Skip Confirmation Modal */}
      {skipConfirmEntry && (
        <div
          className="provider-queue__modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-dialog-title"
        >
          <div className="provider-queue__modal-dialog" ref={skipDialogRef}>
            <h3 id="skip-dialog-title" className="provider-queue__modal-title">
              Confirm Skip / Mark Absent
            </h3>
            <p className="provider-queue__modal-desc">
              Are you sure you want to skip Serial #{skipConfirmEntry.serial_number || skipConfirmEntry.token_number} (
              {skipConfirmEntry.customer_name || skipConfirmEntry.customer_email || 'Patient'})?
            </p>
            <p className="provider-queue__modal-desc" style={{ fontSize: '0.875rem', color: 'var(--color-warning)' }}>
              ⚠️ The customer will be marked absent and their appointment transitioned to NO_SHOW. Staff or managers may handle an authorized restoration if the customer returns.
            </p>
            <div className="provider-queue__modal-actions">
              <button
                ref={skipCancelBtnRef}
                type="button"
                className="provider-queue__btn provider-queue__btn--secondary"
                onClick={closeSkipConfirm}
                disabled={processingId === skipConfirmEntry.id || mutationBusy.current}
              >
                Cancel
              </button>
              <button
                type="button"
                className="provider-queue__btn provider-queue__btn--danger"
                onClick={handleConfirmSkip}
                disabled={processingId === skipConfirmEntry.id || mutationBusy.current}
              >
                {processingId === skipConfirmEntry.id ? 'Skipping...' : 'Confirm Skip / Mark Absent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Front-Desk Walk-In Registration Modal */}
      {showWalkInModal && (
        <div className="provider-queue__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="walkin-dialog-title">
          <div className="provider-queue__modal-dialog">
            <h3 id="walkin-dialog-title" className="provider-queue__modal-title">
              Register Front-Desk Walk-In Patient
            </h3>
            <form onSubmit={handleWalkInSubmit} className="provider-queue__form">
              <div className="provider-queue__form-group">
                <label className="provider-queue__form-label">First Name *</label>
                <input
                  type="text"
                  className="provider-queue__form-input"
                  required
                  value={walkInForm.first_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, first_name: e.target.value })}
                />
              </div>

              <div className="provider-queue__form-group">
                <label className="provider-queue__form-label">Last Name *</label>
                <input
                  type="text"
                  className="provider-queue__form-input"
                  required
                  value={walkInForm.last_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, last_name: e.target.value })}
                />
              </div>

              <div className="provider-queue__form-group">
                <label className="provider-queue__form-label">Phone Number (Optional)</label>
                <input
                  type="text"
                  className="provider-queue__form-input"
                  placeholder="+8801700000000"
                  value={walkInForm.phone_number}
                  onChange={(e) => setWalkInForm({ ...walkInForm, phone_number: e.target.value })}
                />
              </div>

              <div className="provider-queue__form-group">
                <label className="provider-queue__form-label">Service *</label>
                <select
                  className="provider-queue__form-select"
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

              <div className="provider-queue__form-group">
                <label className="provider-queue__form-label">Notes (Optional)</label>
                <textarea
                  className="provider-queue__form-textarea"
                  rows={2}
                  value={walkInForm.notes}
                  onChange={(e) => setWalkInForm({ ...walkInForm, notes: e.target.value })}
                />
              </div>

              <div className="provider-queue__modal-actions">
                <button
                  type="button"
                  className="provider-queue__btn provider-queue__btn--secondary"
                  onClick={() => setShowWalkInModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="provider-queue__btn provider-queue__btn--primary"
                  disabled={processingId === 'walkin'}
                >
                  {processingId === 'walkin' ? 'Registering...' : 'Register & Assign Serial'}
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
