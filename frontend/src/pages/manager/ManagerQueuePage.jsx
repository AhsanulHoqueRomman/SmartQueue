import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import queueService from '../../services/queueService';
import appointmentService from '../../services/appointmentService';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { EmergencyPanel } from '../../components/EmergencyPanel';
import { useRequestScope } from '../../hooks/useRequestScope';
import { currentBusinessDate } from '../../utils/bookingDisplay';
import '../../styles/ManagerQueue.css';

export function ManagerQueuePage() {
  const { currentOrg } = useTenant();

  const [providers, setProviders] = useState([]);
  const [queueDate, setQueueDate] = useState(currentBusinessDate);
  const [selectedProviderId, setSelectedProviderId] = useState('ALL');
  // providerQueues: { [providerId]: { orgId, queueDate, entries: [] | null, available_queue_dates: [], loaded: boolean, isStale: boolean, error: string | null } }
  const [providerQueues, setProviderQueues] = useState({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Emergency Panel Drawer State
  const [showEmergencyConsole, setShowEmergencyConsole] = useState(false);
  const [emergencyTargetProviderId, setEmergencyTargetProviderId] = useState('');

  // Accessible Skip Confirmation Dialog State (Captures Explicit Context)
  const [skipConfirmEntry, setSkipConfirmEntry] = useState(null);
  const skipDialogRef = useRef(null);
  const skipCancelBtnRef = useRef(null);
  const skipOriginatingBtnRef = useRef(null);

  // Request Scope & Concurrency Protection
  const queueContext = `${currentOrg?.id}:${selectedProviderId}:${queueDate}`;
  const latestQueueContext = useRef(queueContext);
  latestQueueContext.current = queueContext;

  // Mutation Lock Lifecycle & Ref Ownership
  const mutationBusy = useRef(false);
  const activeMutationRef = useRef(null);
  const requestScope = useRequestScope(queueContext);

  const acquireMutationLock = (actionId) => {
    if (mutationBusy.current || processingId !== null) return null;
    const ticket = {};
    activeMutationRef.current = ticket;
    mutationBusy.current = true;
    requestScope.invalidate();
    setProcessingId(actionId);
    setActionFeedback(null);
    return ticket;
  };

  const releaseMutationLock = (ticket) => {
    if (activeMutationRef.current === ticket) {
      activeMutationRef.current = null;
      mutationBusy.current = false;
      setProcessingId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Reset Context-Dependent State on Organization Change (Tenant Isolation)
  // --------------------------------------------------------------------------
  useEffect(() => {
    requestScope.invalidate();
    if (!mutationBusy.current) {
      setProcessingId(null);
      setActionFeedback(null);
    }
    setSkipConfirmEntry(null);
    setSelectedProviderId('ALL');
    setEmergencyTargetProviderId('');
    setProviders([]);
    setProviderQueues({});
  }, [currentOrg?.id]);

  // --------------------------------------------------------------------------
  // Reset Stale Skip Modal on Context Change
  // --------------------------------------------------------------------------
  useEffect(() => {
    setSkipConfirmEntry(null);
    if (!mutationBusy.current) {
      setProcessingId(null);
      setActionFeedback(null);
    }
  }, [currentOrg?.id, queueDate, selectedProviderId]);

  // --------------------------------------------------------------------------
  // Core Queue Fetcher with Partial Failure Isolation & Strict Context Keying
  // --------------------------------------------------------------------------
  const loadQueues = useCallback(async (force = false) => {
    const orgId = currentOrg?.id;
    const context = `${orgId}:${selectedProviderId}:${queueDate}`;
    if (!orgId) return;
    if (context !== latestQueueContext.current || (mutationBusy.current && !force)) return;

    const ticket = requestScope.begin(context, { background: !force });
    if (!ticket) return;

    try {
      // 1. Fetch organization providers strictly scoped to the active organization
      const provsData = await organizationService.getProviders(orgId);
      if (!requestScope.isCurrent(ticket) || context !== latestQueueContext.current) return;
      const provList = Array.isArray(provsData) ? provsData : provsData.results || [];
      setProviders(provList);

      // Verify selectedProviderId still exists in new provider list; reset to ALL if not
      let effectiveSelectedProviderId = selectedProviderId;
      if (
        selectedProviderId !== 'ALL' &&
        !provList.some((p) => String(p.id) === String(selectedProviderId))
      ) {
        effectiveSelectedProviderId = 'ALL';
        setSelectedProviderId('ALL');
      }

      // 2. Determine target providers to fetch
      const targets = effectiveSelectedProviderId === 'ALL'
        ? provList
        : provList.filter((p) => String(p.id) === String(effectiveSelectedProviderId));

      // 3. Parallel fetch with failure isolation
      const results = await Promise.allSettled(
        targets.map(async (p) => {
          const data = await queueService.getProviderQueue(orgId, p.id, queueDate);
          return { providerId: p.id, data };
        })
      );

      // Verify scope ticket has not expired or been superseded
      if (context !== latestQueueContext.current || !requestScope.isCurrent(ticket)) return;

      setProviderQueues((prevMap) => {
        const nextMap = { ...prevMap };
        results.forEach((res, idx) => {
          const p = targets[idx];
          if (!p) return;
          if (res.status === 'fulfilled') {
            const data = res.value.data;
            const entries = Array.isArray(data) ? data : data.entries || data.results || [];
            const dates = data.available_queue_dates || [];
            nextMap[p.id] = {
              orgId,
              queueDate,
              entries,
              available_queue_dates: dates,
              loaded: true,
              isStale: false,
              error: null,
            };
          } else {
            // Strict context check: only retain previous data if it belongs to the EXACT same org & queueDate!
            const prev = prevMap[p.id];
            const isSameContext =
              prev &&
              prev.loaded &&
              prev.orgId === orgId &&
              prev.queueDate === queueDate &&
              Array.isArray(prev.entries);

            if (isSameContext) {
              nextMap[p.id] = {
                ...prev,
                isStale: true,
                error: 'Telemetry refresh failed. Showing previously loaded data for this date.',
              };
            } else {
              // Different date or org, or never loaded: mark unavailable! Do NOT reuse past entries or claim zero count
              nextMap[p.id] = {
                orgId,
                queueDate,
                entries: null,
                available_queue_dates: [],
                loaded: false,
                isStale: false,
                error: 'Queue telemetry unavailable for this provider on this date.',
              };
            }
          }
        });
        return nextMap;
      });
    } catch {
      if (context === latestQueueContext.current && requestScope.isCurrent(ticket)) {
        setActionFeedback({ type: 'error', message: 'Failed to load organization queue telemetry.' });
      }
    } finally {
      requestScope.finish(ticket);
      setLoading(false);
    }
  }, [currentOrg?.id, queueDate, selectedProviderId, requestScope]);

  // Initial load and context change synchronization
  useEffect(() => {
    if (!mutationBusy.current) {
      setProcessingId(null);
      setActionFeedback(null);
    }
    setLoading(true);
    loadQueues(true);
  }, [currentOrg?.id, queueDate, selectedProviderId, loadQueues]);

  // Synchronize emergency provider when provider selection changes
  useEffect(() => {
    if (selectedProviderId !== 'ALL') {
      setEmergencyTargetProviderId(selectedProviderId);
    } else if (providers.length > 0 && !emergencyTargetProviderId) {
      setEmergencyTargetProviderId(providers[0].id);
    }
  }, [selectedProviderId, providers, emergencyTargetProviderId]);

  // Polling with Visibility Pause: 15s in ALL mode, 10s in single provider mode
  useEffect(() => {
    if (!currentOrg?.id || !autoRefresh) return;
    const intervalMs = selectedProviderId === 'ALL' ? 15000 : 10000;

    const interval = setInterval(() => {
      if (document.hidden) return;
      if (mutationBusy.current) return;
      loadQueues(false);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [currentOrg?.id, autoRefresh, selectedProviderId, queueDate, loadQueues]);

  // Resume refresh when window tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && autoRefresh && currentOrg?.id && !mutationBusy.current) {
        loadQueues(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoRefresh, currentOrg?.id, loadQueues]);

  // --------------------------------------------------------------------------
  // Accessible Skip Confirmation Dialog Handlers (D2 & Correction 1)
  // --------------------------------------------------------------------------
  const openSkipConfirm = (target, triggerEl) => {
    if (mutationBusy.current || processingId !== null) return;
    skipOriginatingBtnRef.current = triggerEl;
    setSkipConfirmEntry(target);
  };

  const closeSkipConfirm = useCallback(() => {
    if (mutationBusy.current || processingId !== null) return;
    setSkipConfirmEntry(null);
    const triggerEl = skipOriginatingBtnRef.current;
    skipOriginatingBtnRef.current = null;
    if (triggerEl && typeof triggerEl.focus === 'function') {
      setTimeout(() => {
        try {
          triggerEl.focus();
        } catch {
          // ignore unmounted elements
        }
      }, 0);
    }
  }, [processingId]);

  const handleConfirmSkip = async () => {
    if (!skipConfirmEntry || mutationBusy.current || processingId !== null) return;
    const target = skipConfirmEntry;
    skipOriginatingBtnRef.current = null;
    setSkipConfirmEntry(null);

    // Independent Context Guard: validate captured context against active context
    if (
      !currentOrg?.id ||
      target.orgId !== currentOrg.id ||
      target.queueDate !== queueDate ||
      (selectedProviderId !== 'ALL' && target.providerId !== selectedProviderId) ||
      (selectedProviderId === 'ALL' && !providers.some((p) => String(p.id) === String(target.providerId)))
    ) {
      setActionFeedback({
        type: 'error',
        message: 'Skip action cancelled: The queue context changed before confirmation was submitted.',
      });
      return;
    }

    await handleSkip(target);
  };

  useEffect(() => {
    if (!skipConfirmEntry) return;

    const focusTimer = setTimeout(() => {
      skipCancelBtnRef.current?.focus?.();
    }, 50);

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

  // --------------------------------------------------------------------------
  // Operational Queue Actions with Mutation Lock Lifecycle
  // --------------------------------------------------------------------------

  // D1: Presence-Gated Call Next
  const handleCallNext = async (providerId) => {
    const ticket = acquireMutationLock(`call_${providerId}`);
    if (!ticket || !currentOrg?.id) return;
    const mutationContext = queueContext;

    try {
      const res = await queueService.callNext(currentOrg.id, providerId, queueDate);
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Success: Called Serial #${res.serial_number || res.token_number} (${res.customer_name || 'Patient'}).`,
      });
      await loadQueues(true);
    } catch (err) {
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to call next patient.',
      });
    } finally {
      releaseMutationLock(ticket);
    }
  };

  const handleStart = async (providerId, entryId) => {
    const ticket = acquireMutationLock(`start_${entryId}`);
    if (!ticket || !currentOrg?.id) return;
    const mutationContext = queueContext;

    try {
      await queueService.startEntry(currentOrg.id, entryId);
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'success', message: 'Consultation marked IN_PROGRESS.' });
      await loadQueues(true);
    } catch (err) {
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to start session.',
      });
    } finally {
      releaseMutationLock(ticket);
    }
  };

  const handleComplete = async (providerId, entryId) => {
    const ticket = acquireMutationLock(`comp_${entryId}`);
    if (!ticket || !currentOrg?.id) return;
    const mutationContext = queueContext;

    try {
      await queueService.completeEntry(currentOrg.id, entryId);
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({ type: 'success', message: 'Consultation service session COMPLETED.' });
      await loadQueues(true);
    } catch (err) {
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to complete session.',
      });
    } finally {
      releaseMutationLock(ticket);
    }
  };

  const handleSkip = async (target) => {
    const ticket = acquireMutationLock(`skip_${target.entryId}`);
    if (!ticket || !currentOrg?.id) return;
    const mutationContext = queueContext;

    try {
      await queueService.skipEntry(currentOrg.id, target.entryId);
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Patient (Serial #${target.serialNumber}) marked SKIPPED (No Show). Appointment recorded as absent.`,
      });
      await loadQueues(true);
    } catch (err) {
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to skip patient.',
      });
    } finally {
      releaseMutationLock(ticket);
    }
  };

  // D3: Skipped Customer Restoration
  const handleRestore = async (providerId, entryId) => {
    const ticket = acquireMutationLock(`restore_${entryId}`);
    if (!ticket || !currentOrg?.id) return;
    const mutationContext = queueContext;

    try {
      await queueService.restoreEntry(currentOrg.id, entryId);
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: 'Customer restored to queue with their original serial number preserved.',
      });
      await loadQueues(true);
    } catch (err) {
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || err.response?.data?.detail || 'Could not restore customer.',
      });
    } finally {
      releaseMutationLock(ticket);
    }
  };

  // D4: Manager-Assisted Check-In
  const handleCheckIn = async (providerId, entry) => {
    if (!entry?.appointment_id) return;
    if (queueDate > currentBusinessDate()) {
      setActionFeedback({
        type: 'error',
        message: `Cannot check in for future date (${queueDate}). Check-in opens on appointment day.`,
      });
      return;
    }

    const ticket = acquireMutationLock(`checkin_${entry.id}`);
    if (!ticket || !currentOrg?.id) return;
    const mutationContext = queueContext;

    try {
      await appointmentService.checkInAppointment(currentOrg.id, entry.appointment_id);
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'success',
        message: `Serial #${entry.serial_number || entry.token_number} (${entry.customer_name || 'Patient'}) checked in successfully.`,
      });
      await loadQueues(true);
    } catch (err) {
      if (mutationContext !== latestQueueContext.current) return;
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || err.response?.data?.detail || 'Failed to check in appointment.',
      });
    } finally {
      releaseMutationLock(ticket);
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Select an organization from the tenant switcher to monitor and operate live queues."
      />
    );
  }

  const activeProviders = selectedProviderId === 'ALL'
    ? providers
    : providers.filter((p) => String(p.id) === String(selectedProviderId));

  // --------------------------------------------------------------------------
  // Authoritative Derived Metrics with Strict Partial-Failure Transparency
  // --------------------------------------------------------------------------
  let totalInService = 0;
  let totalCalled = 0;
  let totalCheckedInReady = 0;
  let totalAwaitingArrival = 0;
  let totalSkipped = 0;
  let availableProvidersCount = 0;
  let hasIncompleteTelemetry = false;
  const unfinishedDatesSet = new Set();

  activeProviders.forEach((prov) => {
    const qState = providerQueues[prov.id];
    const isContextValid =
      qState &&
      qState.loaded &&
      qState.orgId === currentOrg.id &&
      qState.queueDate === queueDate &&
      Array.isArray(qState.entries);

    if (isContextValid) {
      availableProvidersCount += 1;
      if (qState.isStale || qState.error) {
        hasIncompleteTelemetry = true;
      }
      qState.entries.forEach((e) => {
        if (e.status === 'IN_PROGRESS') totalInService += 1;
        else if (e.status === 'CALLED') totalCalled += 1;
        else if (e.status === 'WAITING') {
          if (e.is_checked_in) totalCheckedInReady += 1;
          else totalAwaitingArrival += 1;
        } else if (e.status === 'SKIPPED') totalSkipped += 1;
      });
      if (qState.available_queue_dates) {
        qState.available_queue_dates.forEach((d) => {
          if (d < queueDate) {
            unfinishedDatesSet.add(d);
          }
        });
      }
    } else {
      hasIncompleteTelemetry = true;
    }
  });

  const unfinishedDates = Array.from(unfinishedDatesSet).sort();

  return (
    <div className="manager-queue animate-page-entrance">
      {/* --------------------------------------------------------------------
         Top Header Command Bar
         -------------------------------------------------------------------- */}
      <header className="manager-queue__header">
        <div className="manager-queue__header-info">
          <div className="manager-queue__eyebrow">
            <span>🛡️ Operational Command</span>
          </div>
          <div className="manager-queue__title-row">
            <h1 className="manager-queue__title">Manager Queue Board</h1>
            <span className="manager-queue__role-badge">Executive Oversight</span>
          </div>
          <p className="manager-queue__subtitle">
            Clinic-wide multi-provider queue supervision for{' '}
            <span className="manager-queue__subtitle-org">{currentOrg.name}</span>
          </p>
        </div>

        {/* Global Filters & Controls */}
        <div className="manager-queue__controls">
          <div className="manager-queue__control-group">
            <label className="manager-queue__label" htmlFor="mq-date-picker">
              Queue Date
            </label>
            <input
              id="mq-date-picker"
              className="manager-queue__input"
              type="date"
              value={queueDate}
              onChange={(e) => setQueueDate(e.target.value)}
              disabled={mutationBusy.current}
            />
          </div>

          <div className="manager-queue__control-group">
            <label className="manager-queue__label" htmlFor="mq-provider-select">
              Provider Scope
            </label>
            <select
              id="mq-provider-select"
              className="manager-queue__select"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              disabled={mutationBusy.current}
            >
              <option value="ALL">All Providers ({providers.length})</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user_name || p.title || p.id}
                </option>
              ))}
            </select>
          </div>

          <div className="manager-queue__control-group" style={{ justifyContent: 'flex-end' }}>
            <label className="manager-queue__toggle-label">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-Refresh ({selectedProviderId === 'ALL' ? '15s' : '10s'})
            </label>
          </div>

          <div className="manager-queue__control-group" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="manager-queue__btn manager-queue__btn--secondary"
              onClick={() => loadQueues(true)}
              disabled={mutationBusy.current || processingId !== null}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------------
         Action Feedback Message Banner
         -------------------------------------------------------------------- */}
      {actionFeedback && (
        <div
          role="status"
          className={`manager-queue__feedback manager-queue__feedback--${actionFeedback.type}`}
        >
          <span>{actionFeedback.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------
         Telemetry Incomplete Warning Notice (Requirement 4)
         -------------------------------------------------------------------- */}
      {hasIncompleteTelemetry && activeProviders.length > 0 && !loading && (
        <div
          className="manager-queue__feedback manager-queue__feedback--error"
          role="status"
          style={{ marginBottom: '1.25rem' }}
        >
          <span>⚠️</span>
          <span>
            Notice: Telemetry for {activeProviders.length - availableProvidersCount} of {activeProviders.length} active provider(s) is unavailable or stale. Overview metrics reflect authoritative data for {availableProvidersCount} provider(s) only.
          </span>
        </div>
      )}

      {/* --------------------------------------------------------------------
         Unfinished Earlier Queues Banner (BR-025)
         -------------------------------------------------------------------- */}
      {unfinishedDates.length > 0 && (
        <div className="manager-queue__unfinished-banner" role="alert">
          <span>⚠️ Attention: Unfinished queue sessions exist on earlier date(s):</span>
          {unfinishedDates.map((d) => (
            <button
              key={d}
              type="button"
              className="manager-queue__date-pill"
              onClick={() => setQueueDate(d)}
            >
              Switch to {d} &rarr;
            </button>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------------------
         Authoritative Clinic-Wide Overview Strip
         -------------------------------------------------------------------- */}
      <section className="manager-queue__overview-strip" aria-label="Queue Metrics Summary">
        <div className="manager-queue__metric-card">
          <div className="manager-queue__metric-label">Active Providers</div>
          <div className="manager-queue__metric-value">
            {availableProvidersCount}
            {availableProvidersCount !== activeProviders.length && (
              <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 600 }}>
                {' '}/ {activeProviders.length}
              </span>
            )}
          </div>
        </div>
        <div className="manager-queue__metric-card">
          <div className="manager-queue__metric-label">In Consultation</div>
          <div className="manager-queue__metric-value manager-queue__metric-value--active">
            {totalInService}
          </div>
        </div>
        <div className="manager-queue__metric-card">
          <div className="manager-queue__metric-label">Currently Called</div>
          <div className="manager-queue__metric-value">{totalCalled}</div>
        </div>
        <div className="manager-queue__metric-card">
          <div className="manager-queue__metric-label">Checked-In (Ready)</div>
          <div className="manager-queue__metric-value manager-queue__metric-value--ready">
            {totalCheckedInReady}
          </div>
        </div>
        <div className="manager-queue__metric-card">
          <div className="manager-queue__metric-label">Awaiting Arrival</div>
          <div className="manager-queue__metric-value manager-queue__metric-value--awaiting">
            {totalAwaitingArrival}
          </div>
        </div>
        <div className="manager-queue__metric-card">
          <div className="manager-queue__metric-label">Skipped Today</div>
          <div className="manager-queue__metric-value manager-queue__metric-value--skipped">
            {totalSkipped}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
         Emergency Management Console Section (D5)
         -------------------------------------------------------------------- */}
      <section className="manager-queue__emergency-section">
        {selectedProviderId !== 'ALL' ? (
          <EmergencyPanel
            orgId={currentOrg.id}
            providerId={selectedProviderId}
            serviceDate={queueDate}
            mode="manager"
            onChanged={() => loadQueues(true)}
          />
        ) : (
          <div>
            <button
              type="button"
              className="manager-queue__emergency-toggle-btn"
              onClick={() => setShowEmergencyConsole(!showEmergencyConsole)}
            >
              <span>⚠️ Emergency Service Interruption Console</span>
              <span>{showEmergencyConsole ? '▲ Close' : '▼ Manage Emergencies'}</span>
            </button>

            {showEmergencyConsole && (
              <div className="manager-queue__emergency-drawer">
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label htmlFor="mq-emergency-prov-select" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Select Provider to Manage:
                  </label>
                  <select
                    id="mq-emergency-prov-select"
                    className="manager-queue__select"
                    value={emergencyTargetProviderId}
                    onChange={(e) => setEmergencyTargetProviderId(e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.user_name || p.title || p.id}
                      </option>
                    ))}
                  </select>
                </div>

                {emergencyTargetProviderId && (
                  <EmergencyPanel
                    orgId={currentOrg.id}
                    providerId={emergencyTargetProviderId}
                    serviceDate={queueDate}
                    mode="manager"
                    onChanged={() => loadQueues(true)}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------
         Main Content: Provider Queue Cards Grid
         -------------------------------------------------------------------- */}
      {loading ? (
        <LoadingState message="Fetching live queue streams..." />
      ) : activeProviders.length === 0 ? (
        <EmptyState
          title="No Active Providers"
          message="No active provider profiles were found for this organization."
        />
      ) : (
        <main className="manager-queue__grid">
          {activeProviders.map((prov) => {
            const qState = providerQueues[prov.id];
            const isContextValid =
              qState &&
              qState.loaded &&
              qState.orgId === currentOrg.id &&
              qState.queueDate === queueDate &&
              Array.isArray(qState.entries);

            const entries = isContextValid ? qState.entries : [];
            const currentlyCalled = entries.find((q) => q.status === 'CALLED');
            const inProgress = entries.find((q) => q.status === 'IN_PROGRESS');
            const waitingList = entries.filter((q) => q.status === 'WAITING');
            const skippedList = entries.filter((q) => q.status === 'SKIPPED');

            // D1: Presence-Gated Call Next logic
            const checkedInWaiting = waitingList.filter((entry) => entry.is_checked_in === true);
            const isCallNextEligible = isContextValid && checkedInWaiting.length > 0;
            const isCallingThisProvider = processingId === `call_${prov.id}`;

            return (
              <article key={prov.id} className="manager-queue__card">
                {/* Provider Card Header */}
                <header className="manager-queue__card-header">
                  <div className="manager-queue__card-header-main">
                    <div className="manager-queue__card-title-row">
                      <h2 className="manager-queue__provider-name">
                        🩺 {prov.user_name || 'Provider'}
                      </h2>
                      {qState?.error && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: '#DC2626',
                            background: '#FEE2E2',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                          }}
                        >
                          {qState.isStale ? 'Telemetry Stale: Refresh failed' : 'Telemetry Unavailable'}
                        </span>
                      )}
                    </div>
                    <div className="manager-queue__provider-spec">
                      {prov.title || 'General Practice'} &bull; Waiting:{' '}
                      {isContextValid ? (
                        <>
                          <strong>{waitingList.length}</strong> (
                          <span style={{ color: '#059669', fontWeight: 700 }}>
                            {checkedInWaiting.length} Ready
                          </span>
                          )
                        </>
                      ) : (
                        <span style={{ color: '#DC2626', fontWeight: 600 }}>Unavailable</span>
                      )}
                    </div>
                  </div>

                  {/* Call Next Button with Presence Gating (D1) */}
                  <div className="manager-queue__call-action">
                    <button
                      type="button"
                      className="manager-queue__btn manager-queue__btn--call"
                      disabled={
                        mutationBusy.current ||
                        processingId !== null ||
                        !isCallNextEligible
                      }
                      onClick={() => handleCallNext(prov.id)}
                      title={
                        !isContextValid
                          ? 'Call Next is disabled: Telemetry is unavailable for this provider.'
                          : !isCallNextEligible
                            ? 'Call Next is disabled: No checked-in waiting patients.'
                            : 'Call the next checked-in waiting patient in serial order.'
                      }
                    >
                      {isCallingThisProvider
                        ? 'Calling...'
                        : `📢 Call Next (${checkedInWaiting.length} Ready)`}
                    </button>
                    {isContextValid && !isCallNextEligible && waitingList.length > 0 && (
                      <span className="manager-queue__call-hint">
                        Waiting for customer check-in before calling
                      </span>
                    )}
                  </div>
                </header>

                {!isContextValid && (
                  <div
                    className="manager-queue__slot-empty"
                    style={{ color: '#DC2626', fontStyle: 'normal', padding: '1rem', background: '#FEF2F2', borderRadius: '8px', marginBottom: '1.25rem' }}
                  >
                    ⚠️ {qState?.error || 'Queue telemetry is currently unavailable for this provider and date.'}
                  </div>
                )}

                {/* Slots: Currently Called & Service In Progress */}
                <div className="manager-queue__slots-grid">
                  {/* Slot 1: Currently Called */}
                  <div className="manager-queue__slot manager-queue__slot--called">
                    <div>
                      <div className="manager-queue__slot-header">
                        <span className="manager-queue__slot-label manager-queue__slot-label--called">
                          🔔 Currently Called
                        </span>
                        {currentlyCalled && (
                          <span className="manager-queue__presence-pill manager-queue__presence-pill--checked-in">
                            ✓ Presence Confirmed
                          </span>
                        )}
                      </div>

                      {currentlyCalled ? (
                        <>
                          <div className="manager-queue__slot-serial">
                            Serial #{currentlyCalled.serial_number || currentlyCalled.token_number}
                          </div>
                          <div className="manager-queue__slot-service">
                            {currentlyCalled.service_name || 'General Consultation'}
                          </div>
                          <div className="manager-queue__slot-customer">
                            Patient:{' '}
                            <strong>
                              {currentlyCalled.customer_name ||
                                currentlyCalled.customer_phone ||
                                currentlyCalled.customer_email ||
                                'Patient'}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <div className="manager-queue__slot-empty">
                          No patient currently called. Click &quot;Call Next&quot; when patients are checked in.
                        </div>
                      )}
                    </div>

                    {currentlyCalled && (
                      <div className="manager-queue__slot-actions">
                        <button
                          type="button"
                          className="manager-queue__btn manager-queue__btn--start"
                          style={{ flex: 1 }}
                          disabled={mutationBusy.current || processingId !== null}
                          onClick={() => handleStart(prov.id, currentlyCalled.id)}
                        >
                          {processingId === `start_${currentlyCalled.id}`
                            ? 'Starting...'
                            : '▶ Start'}
                        </button>
                        <button
                          type="button"
                          className="manager-queue__btn manager-queue__btn--skip"
                          style={{ flex: 1 }}
                          disabled={mutationBusy.current || processingId !== null}
                          onClick={(e) =>
                            openSkipConfirm(
                              {
                                entryId: currentlyCalled.id,
                                providerId: prov.id,
                                orgId: currentOrg.id,
                                queueDate: queueDate,
                                serialNumber: currentlyCalled.serial_number || currentlyCalled.token_number,
                                customerName:
                                  currentlyCalled.customer_name ||
                                  currentlyCalled.customer_phone ||
                                  currentlyCalled.customer_email ||
                                  'Patient',
                              },
                              e.currentTarget
                            )
                          }
                        >
                          ⏭ Skip (Absent)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Slot 2: Service In Progress */}
                  <div className="manager-queue__slot manager-queue__slot--inprogress">
                    <div>
                      <div className="manager-queue__slot-header">
                        <span className="manager-queue__slot-label manager-queue__slot-label--inprogress">
                          🩺 Service In Progress
                        </span>
                      </div>

                      {inProgress ? (
                        <>
                          <div className="manager-queue__slot-serial manager-queue__slot-serial--inprogress">
                            Serial #{inProgress.serial_number || inProgress.token_number}
                          </div>
                          <div className="manager-queue__slot-service">
                            {inProgress.service_name || 'Active Session'}
                          </div>
                          <div className="manager-queue__slot-customer">
                            Patient:{' '}
                            <strong>
                              {inProgress.customer_name ||
                                inProgress.customer_phone ||
                                inProgress.customer_email ||
                                'Patient'}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <div className="manager-queue__slot-empty">
                          No active consultation session in progress.
                        </div>
                      )}
                    </div>

                    {inProgress && (
                      <div className="manager-queue__slot-actions">
                        <button
                          type="button"
                          className="manager-queue__btn manager-queue__btn--complete"
                          style={{ width: '100%' }}
                          disabled={mutationBusy.current || processingId !== null}
                          onClick={() => handleComplete(prov.id, inProgress.id)}
                        >
                          {processingId === `comp_${inProgress.id}`
                            ? 'Completing...'
                            : '✓ Complete Consultation'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Waiting Queue Roster */}
                <section aria-label="Waiting Patients Roster">
                  <div className="manager-queue__section-heading">
                    <span>Waiting Queue Roster ({waitingList.length})</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#78716C' }}>
                      Strict Ascending Serial Order
                    </span>
                  </div>

                  {waitingList.length === 0 ? (
                    <div className="manager-queue__roster-empty">
                      No patients waiting in queue for this provider.
                    </div>
                  ) : (
                    <div className="manager-queue__roster-grid">
                      {waitingList.map((entry) => {
                        const canCheckIn =
                          !entry.is_checked_in &&
                          entry.appointment_id &&
                          queueDate <= currentBusinessDate();

                        return (
                          <div key={entry.id} className="manager-queue__roster-item">
                            <div className="manager-queue__roster-item-top">
                              <div>
                                <div className="manager-queue__entry-serial">
                                  Serial #{entry.serial_number || entry.token_number}
                                </div>
                                <div className="manager-queue__entry-service">
                                  {entry.service_name || 'Consultation'}
                                </div>
                                <div className="manager-queue__entry-customer">
                                  {entry.customer_name || entry.customer_phone || 'Patient'}
                                </div>
                              </div>
                              <StatusBadge status={entry.status} />
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: '0.25rem',
                              }}
                            >
                              {entry.is_checked_in ? (
                                <span className="manager-queue__presence-pill manager-queue__presence-pill--checked-in">
                                  ✓ Checked In
                                </span>
                              ) : (
                                <span className="manager-queue__presence-pill manager-queue__presence-pill--awaiting">
                                  ⏳ Awaiting Arrival
                                </span>
                              )}

                              {canCheckIn && (
                                <button
                                  type="button"
                                  className="manager-queue__btn manager-queue__btn--checkin"
                                  disabled={
                                    mutationBusy.current ||
                                    processingId === `checkin_${entry.id}`
                                  }
                                  onClick={() => handleCheckIn(prov.id, entry)}
                                >
                                  {processingId === `checkin_${entry.id}`
                                    ? 'Checking in...'
                                    : 'Check In'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* D3: Skipped Customer Recovery Shelf */}
                <section className="manager-queue__skipped-shelf" aria-label="Skipped Customers Shelf">
                  <div className="manager-queue__section-heading">
                    <span style={{ color: '#DC2626' }}>
                      Skipped Customers ({skippedList.length})
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#78716C' }}>
                      Original Serial Retained on Restore
                    </span>
                  </div>

                  {skippedList.length === 0 ? (
                    <div style={{ fontSize: '0.825rem', color: '#78716C', fontStyle: 'italic' }}>
                      No skipped patients for this provider.
                    </div>
                  ) : (
                    <div className="manager-queue__skipped-list">
                      {skippedList.map((entry) => (
                        <div key={entry.id} className="manager-queue__skipped-item">
                          <div className="manager-queue__skipped-info">
                            <span className="manager-queue__skipped-serial">
                              Serial #{entry.serial_number || entry.token_number}
                            </span>
                            <span className="manager-queue__skipped-name">
                              {entry.customer_name || entry.customer_phone || 'Patient'}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="manager-queue__btn manager-queue__btn--restore"
                            disabled={
                              mutationBusy.current ||
                              processingId === `restore_${entry.id}`
                            }
                            onClick={() => handleRestore(prov.id, entry.id)}
                          >
                            {processingId === `restore_${entry.id}`
                              ? 'Restoring...'
                              : '↺ Restore to Queue'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            );
          })}
        </main>
      )}

      {/* --------------------------------------------------------------------
         Accessible Skip Confirmation Modal (D2 & Correction 1)
         -------------------------------------------------------------------- */}
      {skipConfirmEntry && (
        <div
          className="manager-queue__modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mq-skip-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSkipConfirm();
          }}
        >
          <div className="manager-queue__modal-dialog" ref={skipDialogRef}>
            <h3 id="mq-skip-dialog-title" className="manager-queue__modal-title">
              Confirm Skip / Mark Absent
            </h3>
            <p className="manager-queue__modal-desc">
              Are you sure you want to skip Serial #{skipConfirmEntry.serialNumber} (
              {skipConfirmEntry.customerName})?
            </p>
            <div className="manager-queue__modal-warning">
              ⚠️ The customer will be marked absent and their appointment transitioned to NO_SHOW.
              Authorized managers or staff can restore them with their original serial number if they arrive later.
            </div>
            <div className="manager-queue__modal-actions">
              <button
                ref={skipCancelBtnRef}
                type="button"
                className="manager-queue__btn manager-queue__btn--secondary"
                disabled={mutationBusy.current || processingId !== null}
                onClick={closeSkipConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="manager-queue__btn manager-queue__btn--skip"
                disabled={mutationBusy.current || processingId !== null}
                onClick={handleConfirmSkip}
              >
                Confirm Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerQueuePage;
