import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { EmergencyPanel } from '../../components/EmergencyPanel';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useRequestScope } from '../../hooks/useRequestScope';
import { currentBusinessDate } from '../../utils/bookingDisplay';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import appointmentService from '../../services/appointmentService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StaffBookingForm } from '../../components/StaffBookingForm';
import { deriveProfessionalDisplay } from '../../utils/providerDisplay';
import '../../styles/StaffQueue.css';

export function StaffQueuePage() {
  const { currentOrg } = useTenant();
  const { user } = useAuth();

  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [queueRows, setQueueEntries] = useState([]);
  const [queueDate, setQueueDate] = useState(currentBusinessDate);
  const [queueDates, setQueueDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Skip confirmation state and accessibility refs
  const [skipConfirmEntry, setSkipConfirmEntry] = useState(null);
  const skipOriginatingBtnRef = useRef(null);
  const skipCancelBtnRef = useRef(null);
  const skipDialogRef = useRef(null);

  // Load organization providers on mount / tenant change
  useEffect(() => {
    if (!currentOrg?.id) {
      setProviders([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setProviders([]);
    setSelectedProviderId('');
    setQueueEntries([]);
    setQueueDates([]);
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
      .catch(() => {
        if (isMounted) setError('Failed to load organization providers.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id]);

  // Request scoping and authoritative synchronization
  const queueContext = `${user?.id}:${currentOrg?.id}:${selectedProviderId}:${queueDate}`;
  const latestQueueContext = useRef(queueContext);
  useLayoutEffect(() => {
    latestQueueContext.current = queueContext;
  }, [queueContext]);

  const [loadedQueueContext, setLoadedQueueContext] = useState('');
  const queueEntries = loadedQueueContext === queueContext ? queueRows : [];
  const mutationBusy = useRef(false);
  const requestScope = useRequestScope(queueContext);

  const fetchQueue = async (force = false) => {
    const context = queueContext;
    if (context !== latestQueueContext.current || (mutationBusy.current && !force)) return;
    const ticket = requestScope.begin(queueContext, { background: !force });
    if (!currentOrg?.id || !selectedProviderId) {
      setQueueEntries([]);
      return;
    }
    if (!ticket) return;

    try {
      const data = await queueService.getProviderQueue(
        currentOrg.id,
        selectedProviderId,
        queueDate
      );
      if (context !== latestQueueContext.current || !requestScope.isCurrent(ticket)) return;
      const list = Array.isArray(data) ? data : data.entries || data.results || [];
      setError(null);
      setQueueEntries(list);
      setLoadedQueueContext(context);
      setQueueDates(data.available_queue_dates || []);
    } catch (err) {
      if (context !== latestQueueContext.current || !requestScope.isCurrent(ticket)) return;
      setError('Failed to fetch provider queue.');
    } finally {
      requestScope.finish(ticket);
    }
  };

  // Synchronize on scope dependency changes
  useEffect(() => {
    mutationBusy.current = false;
    setProcessingId(null);
    setActionFeedback(null);
    fetchQueue();
  }, [currentOrg?.id, selectedProviderId, queueDate]);

  // Visibility-aware 10-second polling
  useEffect(() => {
    if (!currentOrg?.id || !selectedProviderId || !autoRefresh) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (mutationBusy.current) return;
      fetchQueue();
    }, 10000);
    return () => clearInterval(interval);
  }, [currentOrg?.id, selectedProviderId, queueDate, autoRefresh]);

  // Resume refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && autoRefresh && currentOrg?.id && selectedProviderId && !mutationBusy.current) {
        fetchQueue();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoRefresh, currentOrg?.id, selectedProviderId, queueDate]);

  const setBusy = (value) => {
    if (queueContext !== latestQueueContext.current) return;
    mutationBusy.current = value !== null;
    if (value !== null) requestScope.invalidate();
    setProcessingId(value);
  };

  // Operational Action Handlers
  const handleCallNext = async () => {
    if (mutationBusy.current) return;
    if (!currentOrg?.id || !selectedProviderId) return;
    setBusy('call-next');
    setActionFeedback(null);
    setError(null);

    try {
      const entry = await queueService.callNext(currentOrg.id, selectedProviderId, queueDate);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Called Serial #${entry.serial_number || entry.token_number} (${entry.customer_name || entry.customer_email || 'Patient'}).`,
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
    if (!currentOrg?.id || !entryId) return;
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
    if (!currentOrg?.id || !entryId) return;
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
    if (!currentOrg?.id || !entryId) return;
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

  const handleRestore = async (entryId) => {
    if (mutationBusy.current) return;
    if (!currentOrg?.id || !entryId) return;
    setBusy(entryId);
    setActionFeedback(null);

    try {
      await queueService.restoreEntry(currentOrg.id, entryId);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'success', message: 'Customer restored to queue with their original serial.' });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'error', message: err.response?.data?.error?.message || err.response?.data?.detail || 'Could not restore customer.' });
    } finally {
      setBusy(null);
    }
  };

  const handleCheckIn = async (entry) => {
    if (mutationBusy.current) return;
    if (!currentOrg?.id || !entry?.appointment_id) return;
    if (queueDate > currentBusinessDate()) return;
    setBusy(entry.id);
    setActionFeedback(null);
    setError(null);

    try {
      await appointmentService.checkInAppointment(currentOrg.id, entry.appointment_id);
      if (queueContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Serial #${entry.serial_number || entry.token_number} (${entry.customer_name || entry.customer_phone || 'Patient'}) checked in successfully.`,
      });
      fetchQueue(true);
    } catch (err) {
      if (queueContext !== latestQueueContext.current) return;
      const msg = err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to check in appointment.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setBusy(null);
    }
  };

  // Accessible Skip Confirmation Dialog Handlers
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

    // 1. Initial focus: place focus on Cancel button inside dialog
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
  const skippedEntries = queueEntries.filter((e) => e.status === 'SKIPPED');
  const checkedInWaitingCount = waitingEntries.filter((e) => e.is_checked_in).length;

  return (
    <div className="staff-queue animate-page-entrance">
      <EmergencyPanel
        orgId={currentOrg.id}
        providerId={selectedProviderId}
        serviceDate={queueDate}
        mode="staff"
        onChanged={() => fetchQueue(true)}
      />

      {/* Top Header Command Bar */}
      <div className="staff-queue__header">
        <div className="staff-queue__header-info">
          <div className="staff-queue__title-row">
            <h1 className="staff-queue__title">Staff Queue Supervision Board</h1>
            <span className="staff-queue__role-badge">Staff Desk</span>
          </div>
          <p className="staff-queue__subtitle">
            Real-time provider queue supervision for <span className="staff-queue__subtitle-org">{currentOrg.name}</span>
          </p>
        </div>

        <div className="staff-queue__header-actions">
          <button
            type="button"
            className="staff-queue__btn staff-queue__btn--refresh"
            onClick={() => fetchQueue(true)}
            title="Refresh queue data now"
          >
            ↻ Refresh
          </button>

          <label className="staff-queue__auto-refresh-label">
            <input
              type="checkbox"
              className="staff-queue__auto-refresh-input"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (10s)
          </label>
        </div>
      </div>

      {/* Provider Selector & Date Control Bar */}
      <div className="staff-queue__control-bar">
        <div className="staff-queue__control-group">
          <span className="staff-queue__control-label">Provider Roster:</span>
          <select
            className="staff-queue__select"
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            disabled={loading}
          >
            {providers.length === 0 ? (
              <option value="">No active providers</option>
            ) : (
              providers.map((p) => {
                const { displayName, designation, showDesignation } = deriveProfessionalDisplay(
                  p,
                  `Provider #${p.id.slice(0, 8)}`
                );
                return (
                  <option key={p.id} value={p.id}>
                    {showDesignation ? `${designation} - ` : ''}{displayName}
                  </option>
                );
              })
            )}
          </select>
        </div>

        <div className="staff-queue__control-group">
          <span className="staff-queue__control-label">Queue Date:</span>
          <input
            className="staff-queue__date-input"
            type="date"
            value={queueDate}
            onChange={(e) => setQueueDate(e.target.value)}
          />
        </div>

        {queueDates.filter((date) => date !== queueDate).length > 0 && (
          <div className="staff-queue__unfinished-pills">
            {queueDates
              .filter((date) => date !== queueDate)
              .map((date) => (
                <button
                  key={date}
                  type="button"
                  className="staff-queue__unfinished-pill"
                  onClick={() => setQueueDate(date)}
                >
                  ⚠ Unfinished queue: {date}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`staff-queue__banner staff-queue__banner--${actionFeedback.type}`}
          role="status"
        >
          {actionFeedback.type === 'success' ? '✓ ' : '⚠ '}
          {actionFeedback.message}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="staff-queue__banner staff-queue__banner--error" role="alert">
          ⚠ {error}
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
        <>
          {/* Active Consultation Console */}
          <div className="staff-queue__console">
            <h2 className="staff-queue__console-title">
              Current Call Status for {deriveProfessionalDisplay(selectedProvider, 'Provider').displayName}
            </h2>

            {activeEntry ? (
              /* State 1: In Consultation */
              <div className="staff-queue__stage-card staff-queue__stage-card--in-progress">
                <div className="staff-queue__stage-info">
                  <div className="staff-queue__stage-badge-row">
                    <StatusBadge status="IN_PROGRESS" type="queue" />
                    <span className="staff-queue__arrival-badge staff-queue__arrival-badge--scheduled">
                      Service In Progress
                    </span>
                  </div>
                  <div className="staff-queue__stage-serial">
                    Serial #{activeEntry.serial_number || activeEntry.token_number}
                  </div>
                  <p className="staff-queue__stage-patient">
                    {activeEntry.customer_name || activeEntry.customer_email || 'Patient'}
                  </p>
                  <div className="staff-queue__stage-contact">
                    {activeEntry.service_name && `${activeEntry.service_name} • `}
                    {activeEntry.customer_phone || activeEntry.customer_email || ''}
                  </div>
                </div>

                <div className="staff-queue__stage-actions">
                  <button
                    type="button"
                    className="staff-queue__btn staff-queue__btn--success"
                    onClick={() => handleComplete(activeEntry.id)}
                    disabled={processingId === activeEntry.id}
                  >
                    {processingId === activeEntry.id ? 'Completing...' : '✓ Complete Service'}
                  </button>
                </div>
              </div>
            ) : calledEntry ? (
              /* State 2: Patient Called */
              <div className="staff-queue__stage-card staff-queue__stage-card--called">
                <div className="staff-queue__stage-info">
                  <div className="staff-queue__stage-badge-row">
                    <StatusBadge status="CALLED" type="queue" />
                    <span className="staff-queue__arrival-badge staff-queue__arrival-badge--walkin">
                      Called to Counter / Room
                    </span>
                  </div>
                  <div className="staff-queue__stage-serial staff-queue__stage-serial--called">
                    Serial #{calledEntry.serial_number || calledEntry.token_number}
                  </div>
                  <p className="staff-queue__stage-patient">
                    {calledEntry.customer_name || calledEntry.customer_email || 'Patient'}
                  </p>
                  <div className="staff-queue__stage-contact">
                    {calledEntry.service_name && `${calledEntry.service_name} • `}
                    {calledEntry.customer_phone || calledEntry.customer_email || ''}
                  </div>
                </div>

                <div className="staff-queue__stage-actions">
                  <button
                    type="button"
                    className="staff-queue__btn staff-queue__btn--primary"
                    onClick={() => handleStart(calledEntry.id)}
                    disabled={processingId === calledEntry.id}
                  >
                    {processingId === calledEntry.id ? 'Starting...' : '▶ Start Service'}
                  </button>

                  <button
                    type="button"
                    className="staff-queue__btn staff-queue__btn--danger"
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
              <div className="staff-queue__stage-card staff-queue__stage-card--idle">
                <div className="staff-queue__stage-info">
                  <p className="staff-queue__stage-patient">
                    No active patient called or in consultation for this provider.
                  </p>
                  <p className="staff-queue__stage-contact">
                    {checkedInWaitingCount > 0
                      ? `${checkedInWaitingCount} checked-in patient(s) ready to be called.`
                      : 'No checked-in patients waiting. Click Call Next when a checked-in patient arrives.'}
                  </p>
                </div>

                <div className="staff-queue__stage-actions">
                  <button
                    type="button"
                    className="staff-queue__btn staff-queue__btn--primary"
                    onClick={handleCallNext}
                    disabled={checkedInWaitingCount === 0 || processingId === 'call-next'}
                  >
                    {processingId === 'call-next'
                      ? 'Calling...'
                      : `🔊 Call Next (${checkedInWaitingCount} Ready)`}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Skipped Customers Recovery Shelf */}
          {skippedEntries.length > 0 && (
            <div className="staff-queue__recovery-card">
              <div className="staff-queue__recovery-header">
                <h3 className="staff-queue__recovery-title">
                  <span>↩</span> Skipped Customers ({skippedEntries.length})
                </h3>
                <p className="staff-queue__recovery-desc">
                  Restore only when the customer returns. Their original serial is retained; an active consultation continues uninterrupted.
                </p>
              </div>

              <div className="staff-queue__recovery-list">
                {skippedEntries.map((entry) => (
                  <div key={entry.id} className="staff-queue__recovery-item">
                    <div className="staff-queue__recovery-patient">
                      <span className="staff-queue__recovery-serial">
                        #{entry.serial_number || entry.token_number}
                      </span>
                      <span>{entry.customer_name || entry.customer_email || 'Patient'}</span>
                    </div>

                    <button
                      type="button"
                      className="staff-queue__btn staff-queue__btn--restore"
                      disabled={processingId === entry.id || mutationBusy.current}
                      onClick={() => handleRestore(entry.id)}
                    >
                      {processingId === entry.id ? 'Restoring...' : 'Restore to Queue'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Front-Desk / Phone Booking Drawer */}
          <div className="staff-queue__booking-wrapper">
            <StaffBookingForm
              key={`${currentOrg.id}:${selectedProviderId}`}
              orgId={currentOrg.id}
              providerId={selectedProviderId}
              onBooked={fetchQueue}
            />
          </div>

          {/* Waiting Queue Roster Table */}
          <div className="staff-queue__roster-card">
            <div className="staff-queue__roster-header">
              <h2 className="staff-queue__roster-title">
                Waiting Patients ({waitingEntries.length} Total • {checkedInWaitingCount} Checked In)
              </h2>
            </div>

            {waitingEntries.length === 0 ? (
              <EmptyState
                title="Queue Empty"
                message="There are no patients waiting in line for this provider."
              />
            ) : (
              <div className="staff-queue__table-wrap">
                <table className="staff-queue__table">
                  <thead>
                    <tr>
                      <th>Serial #</th>
                      <th>Patient Details</th>
                      <th>Arrival Channel</th>
                      <th>Presence / Check-In</th>
                      <th>Staff Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <span className="staff-queue__serial-badge">
                            #{entry.serial_number || entry.token_number}
                          </span>
                        </td>
                        <td>
                          <div className="staff-queue__patient-name">
                            {entry.customer_name || entry.customer_email || 'Patient'}
                          </div>
                          <div className="staff-queue__patient-contact">
                            {entry.service_name && `${entry.service_name} • `}
                            {entry.customer_phone || entry.customer_email || ''}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`staff-queue__arrival-badge staff-queue__arrival-badge--${
                              entry.arrival_type === 'WALK_IN' ? 'walkin' : 'scheduled'
                            }`}
                          >
                            {entry.arrival_type === 'WALK_IN' ? '🚶 Walk-In' : '📅 Scheduled'}
                          </span>
                        </td>
                        <td>
                          {entry.is_checked_in ? (
                            <span className="staff-queue__presence-badge staff-queue__presence-badge--ready">
                              ✓ Checked In
                            </span>
                          ) : (
                            <span className="staff-queue__presence-badge staff-queue__presence-badge--pending">
                              ⏳ Waiting Arrival
                            </span>
                          )}
                        </td>
                        <td>
                          {!entry.is_checked_in && entry.appointment_id && queueDate <= currentBusinessDate() ? (
                            <button
                              type="button"
                              className="staff-queue__btn staff-queue__btn--checkin"
                              onClick={() => handleCheckIn(entry)}
                              disabled={processingId === entry.id || mutationBusy.current}
                            >
                              {processingId === entry.id ? 'Checking In...' : 'Check In'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                              {entry.is_checked_in ? 'Ready' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Accessible Skip Confirmation Modal */}
      {skipConfirmEntry && (
        <div
          className="staff-queue__modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-skip-dialog-title"
        >
          <div className="staff-queue__modal-dialog" ref={skipDialogRef}>
            <h3 id="staff-skip-dialog-title" className="staff-queue__modal-title">
              Confirm Skip / Mark Absent
            </h3>
            <p className="staff-queue__modal-desc">
              Are you sure you want to skip Serial #{skipConfirmEntry.serial_number || skipConfirmEntry.token_number} (
              {skipConfirmEntry.customer_name || skipConfirmEntry.customer_email || 'Patient'})?
            </p>
            <p className="staff-queue__modal-desc" style={{ fontSize: '0.875rem', color: 'var(--color-warning, #d97706)' }}>
              ⚠️ The customer will be marked absent and their appointment transitioned to NO_SHOW. Staff or managers may handle an authorized restoration if the customer returns.
            </p>
            <div className="staff-queue__modal-actions">
              <button
                ref={skipCancelBtnRef}
                type="button"
                className="staff-queue__btn staff-queue__btn--secondary"
                onClick={closeSkipConfirm}
                disabled={processingId === skipConfirmEntry.id || mutationBusy.current}
              >
                Cancel
              </button>
              <button
                type="button"
                className="staff-queue__btn staff-queue__btn--danger"
                onClick={handleConfirmSkip}
                disabled={processingId === skipConfirmEntry.id || mutationBusy.current}
              >
                {processingId === skipConfirmEntry.id ? 'Skipping...' : 'Confirm Skip / Mark Absent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffQueuePage;
