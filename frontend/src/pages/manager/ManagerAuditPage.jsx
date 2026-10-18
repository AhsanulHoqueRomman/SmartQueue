import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import '../../styles/OperationalPrimitives.css';
import '../../styles/ManagerAudit.css';

/**
 * Exact verified backend action choices for audit log filtering.
 * Strictly uses validated backend enum values without invented category strings.
 */
const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'QUEUE_CALLED', label: 'Queue: Called' },
  { value: 'QUEUE_STARTED', label: 'Queue: Started' },
  { value: 'QUEUE_COMPLETED', label: 'Queue: Completed' },
  { value: 'QUEUE_SKIPPED', label: 'Queue: Skipped' },
  { value: 'QUEUE_RESTORED', label: 'Queue: Restored' },
  { value: 'APPOINTMENT_BOOKED', label: 'Appointment: Booked' },
  { value: 'APPOINTMENT_CHECKED_IN', label: 'Appointment: Checked In' },
  { value: 'APPOINTMENT_CANCELLED', label: 'Appointment: Cancelled' },
  { value: 'APPOINTMENT_RESCHEDULED', label: 'Appointment: Rescheduled' },
  { value: 'MEMBER_ADDED', label: 'Team: Member Added' },
  { value: 'MEMBERSHIP_UPDATED', label: 'Team: Membership Updated' },
  { value: 'STAFF_ACTIVATED', label: 'Staff: Activated' },
  { value: 'STAFF_DEACTIVATED', label: 'Staff: Deactivated' },
  { value: 'STAFF_INVITATION_CREATED', label: 'Staff: Invite Created' },
  { value: 'PROVIDER_INVITATION_CREATED', label: 'Provider: Invite Created' },
  { value: 'SCHEDULE_CHANGE_REQUESTED', label: 'Schedule: Change Requested' },
  { value: 'PROVIDER_LEAVE_REQUESTED', label: 'Leave: Requested' },
  { value: 'ORGANIZATION_DOCUMENT_UPLOADED', label: 'Document: Uploaded' },
  { value: 'VERIFICATION_DOCUMENT_DOWNLOADED', label: 'Document: Downloaded' },
];

/**
 * Table column definitions for ResponsiveTable.
 */
const AUDIT_COLUMNS = [
  { key: 'timestamp', label: 'Date & Time', width: '22%' },
  { key: 'actor', label: 'Actor', width: '22%' },
  { key: 'action', label: 'Action Event', width: '22%' },
  { key: 'resource', label: 'Target Resource', width: '18%' },
  { key: 'details', label: 'Operational Details', width: '16%' },
];

/**
 * Formats an ISO datetime string into the authoritative Asia/Dhaka timezone.
 */
function formatDhakaDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Human-readable action label formatter while keeping the exact action token distinct.
 */
function formatActionLabel(actionStr) {
  if (!actionStr) return 'Unknown Action';
  return actionStr.replace(/_/g, ' ');
}

/**
 * Assigns token-compliant badge styling based on action category.
 */
function getActionBadgeClass(actionStr) {
  if (!actionStr) return 'qt-audit-badge--neutral';
  if (actionStr.startsWith('QUEUE_')) {
    if (actionStr === 'QUEUE_SKIPPED') return 'qt-audit-badge--warning';
    if (actionStr === 'QUEUE_COMPLETED') return 'qt-audit-badge--success';
    return 'qt-audit-badge--teal';
  }
  if (actionStr.startsWith('APPOINTMENT_')) {
    if (actionStr === 'APPOINTMENT_CANCELLED') return 'qt-audit-badge--danger';
    if (actionStr === 'APPOINTMENT_CHECKED_IN') return 'qt-audit-badge--success';
    return 'qt-audit-badge--espresso';
  }
  if (actionStr.startsWith('STAFF_') || actionStr.startsWith('MEMBER_')) {
    if (actionStr.includes('DEACTIVATED')) return 'qt-audit-badge--danger';
    return 'qt-audit-badge--info';
  }
  return 'qt-audit-badge--neutral';
}

/**
 * Safely extracts non-sensitive operational summaries from audit metadata.
 * Prohibits unrestricted JSON dumps, token exposures, or free-text leakages.
 */
function getSafeMetadataSummary(log) {
  const meta = log?.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return 'Event recorded';
  }

  // 1. Validated serial number
  if (
    meta.serial_number !== undefined &&
    meta.serial_number !== null &&
    meta.serial_number !== '' &&
    !isNaN(Number(meta.serial_number))
  ) {
    return `Serial #${meta.serial_number}`;
  }

  // 2. Safe operational booking/queue date
  if (meta.booking_date && typeof meta.booking_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.booking_date)) {
    return `Date: ${meta.booking_date}`;
  }

  // 3. Safe effective date for schedule adjustments
  if (meta.effective_date && typeof meta.effective_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.effective_date)) {
    return `Effective: ${meta.effective_date}`;
  }

  // 4. Safe rescheduled current target serial & date
  if (meta.current && typeof meta.current === 'object') {
    if (meta.current.serial && meta.current.date) {
      return `Target: Serial #${meta.current.serial}`;
    }
  }

  // 5. Default conservative fallback
  return 'Event recorded';
}

export function ManagerAuditPage() {
  const { currentOrg } = useTenant();

  // Search and Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // Pagination State
  const [page, setPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState({
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    hasNext: false,
    hasPrevious: false,
    itemRange: { start: 0, end: 0, total: 0 },
  });

  // Data & Request State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Request-scope tracking for tenant and query isolation
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);

  const fetchAuditLogs = useCallback(async (targetPage, searchToApply, actionToApply) => {
    if (!currentOrg?.id) return;

    const requestId = ++activeRequestIdRef.current;
    const orgIdAtRequest = currentOrg.id;
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: targetPage,
        page_size: DEFAULT_PAGE_SIZE,
        ordering: '-created_at',
      };
      if (searchToApply) params.search = searchToApply;
      if (actionToApply) params.action = actionToApply;

      const data = await managerService.getAuditLogs(orgIdAtRequest, params);

      // Discard response if tenant switched or newer request initiated
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
      setAuditLogs(normalized.items);
      setPaginationInfo(normalized);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      // Recover to page 1 ONLY on explicit out-of-range 404 from backend EmptyPage
      const isOutOfRange404 =
        targetPage > 1 &&
        err.response?.status === 404 &&
        err.response?.data?.detail === 'That page contains no results.';

      if (isOutOfRange404) {
        setPage(1);
        return;
      }

      setError(err.response?.data?.detail || 'Failed to load organization compliance audit logs.');
    } finally {
      if (requestId === activeRequestIdRef.current && orgIdAtRequest === currentOrg?.id) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id]);

  // Reset pagination and query state when switching organization
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      setPage(1);
      setSearchInput('');
      setAppliedSearch('');
      setActionFilter('');
      setError(null);
    }
  }, [currentOrg?.id]);

  // Fetch audit logs on query change
  useEffect(() => {
    fetchAuditLogs(page, appliedSearch, actionFilter);
  }, [fetchAuditLogs, page, appliedSearch, actionFilter]);

  const handleSearchSubmit = () => {
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed);
    setPage(1);
  };

  const handleActionChange = (newAction) => {
    setActionFilter(newAction);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setActionFilter('');
    setPage(1);
  };

  const handleRefresh = () => {
    fetchAuditLogs(page, appliedSearch, actionFilter);
  };

  const handlePageChange = (newPage) => {
    if (!loading && newPage !== page) {
      setPage(newPage);
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Select an organization from the tenant switcher to monitor compliance audit logs."
      />
    );
  }

  const isFiltered = Boolean(appliedSearch || actionFilter);

  return (
    <div className="manager-audit animate-page-entrance">
      {/* --------------------------------------------------------------------
         Top Header Command Bar
         -------------------------------------------------------------------- */}
      <header className="manager-audit__header">
        <div className="manager-audit__header-info">
          <div className="manager-audit__eyebrow">
            <span>🛡️ Governance & Compliance</span>
          </div>
          <div className="manager-audit__title-row">
            <h1 className="manager-audit__title">Compliance & Audit Logs</h1>
            <span className="manager-audit__role-badge">Executive Oversight</span>
          </div>
          <p className="manager-audit__subtitle">
            Server-authoritative append-only operational event history for{' '}
            <strong className="manager-audit__subtitle-org">{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="manager-audit__controls">
          <button
            type="button"
            className="manager-audit__btn-refresh"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh compliance audit records"
          >
            <span aria-hidden="true">🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* --------------------------------------------------------------------
         Search & Filter Bar (UI-2A Primitive Reuse)
         -------------------------------------------------------------------- */}
      <SearchFilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        searchPlaceholder="Search actor email, entity ID, or action..."
        searchLabel="Search audit records"
        filters={[
          {
            id: 'action-filter',
            label: 'Filter by Action Event',
            value: actionFilter,
            onChange: handleActionChange,
            options: ACTION_FILTER_OPTIONS,
          },
        ]}
        isFiltered={isFiltered}
        onClear={handleClearFilters}
        isLoading={loading}
      />

      {/* --------------------------------------------------------------------
         Error State
         -------------------------------------------------------------------- */}
      {error && (
        <div className="manager-audit__error-banner" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------
         Data Presentation / Empty / Loading States
         -------------------------------------------------------------------- */}
      {loading ? (
        <LoadingState message="Loading compliance audit records..." />
      ) : auditLogs.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No Matching Audit Logs Found"
            message="No operational audit events match your active search or action filter."
            actionLabel="Clear Filters"
            onAction={handleClearFilters}
          />
        ) : (
          <EmptyState
            title="No Audit Logs Recorded"
            message={`No administrative actions or operational events have been recorded for ${currentOrg.name} yet.`}
          />
        )
      ) : (
        <>
          <ResponsiveTable
            caption={`Compliance Audit Logs for ${currentOrg.name}`}
            columns={AUDIT_COLUMNS}
          >
            {auditLogs.map((log) => {
              const safeSummary = getSafeMetadataSummary(log);

              return (
                <tr key={log.id}>
                  {/* 1. Date & Time (Asia/Dhaka) */}
                  <td className="manager-audit__timestamp">
                    {formatDhakaDateTime(log.created_at)}
                  </td>

                  {/* 2. Actor */}
                  <td>
                    {log.actor_email ? (
                      <span className="manager-audit__actor" title={log.actor_email}>
                        <span aria-hidden="true">👤</span> {log.actor_email}
                      </span>
                    ) : (
                      <span className="manager-audit__actor manager-audit__actor--system">
                        <span aria-hidden="true">⚙️</span> System
                      </span>
                    )}
                  </td>

                  {/* 3. Action Event */}
                  <td>
                    <div className="manager-audit__action-cell">
                      <span className={`qt-audit-badge ${getActionBadgeClass(log.action)}`}>
                        {formatActionLabel(log.action)}
                      </span>
                      <span className="manager-audit__action-token" aria-hidden="true">
                        {log.action}
                      </span>
                    </div>
                  </td>

                  {/* 4. Target Resource */}
                  <td>
                    <div className="manager-audit__resource">
                      <span className="manager-audit__entity-type">
                        {log.entity_type || '—'}
                      </span>
                      {log.entity_id ? (
                        <span className="manager-audit__entity-id" title={log.entity_id}>
                          #{String(log.entity_id).slice(0, 8)}
                        </span>
                      ) : (
                        <span className="manager-audit__entity-id">—</span>
                      )}
                    </div>
                  </td>

                  {/* 5. Operational Details */}
                  <td>
                    <div className="manager-audit__details">
                      <span className="manager-audit__details-tag">
                        {safeSummary}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </ResponsiveTable>

          {/* ----------------------------------------------------------------
             Accessible Server-Side Pagination (UI-2A Primitive Reuse)
             ---------------------------------------------------------------- */}
          <Pagination
            currentPage={page}
            totalPages={paginationInfo.totalPages}
            totalCount={paginationInfo.totalCount}
            itemRange={paginationInfo.itemRange}
            onPageChange={handlePageChange}
            disabled={loading}
            ariaLabel="Audit logs table pagination"
          />
        </>
      )}
    </div>
  );
}

export default ManagerAuditPage;
