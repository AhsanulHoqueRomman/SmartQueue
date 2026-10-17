import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';

const TABLE_COLUMNS = [
  { key: 'datetime', label: 'Date, Time & Serial' },
  { key: 'patient', label: 'Patient' },
  { key: 'service', label: 'Service' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
];

/**
 * Valid backend Appointment.Status choices from Appointment model.
 */
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CHECKED_IN', label: 'Checked In' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
  { value: 'PENDING', label: 'Pending' },
];

/**
 * Format date in Asia/Dhaka without fabricating missing dates.
 */
function formatDhakaDate(dateStr) {
  if (!dateStr) return 'Date unavailable';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(dt);
    }
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(dt);
  } catch {
    return 'Date unavailable';
  }
}

/**
 * Format scheduled time in Asia/Dhaka. Returns null if invalid or missing.
 */
function formatDhakaTime(isoStr) {
  if (!isoStr) return null;
  try {
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return null;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(dt);
  } catch {
    return null;
  }
}

export function ProviderAppointmentsPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  // Profile resolution state
  const [providerProfile, setProviderProfile] = useState(null);
  const [resolvingProfile, setResolvingProfile] = useState(true);
  const [profileNotFound, setProfileNotFound] = useState(false);

  // Appointments state
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState({
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    hasNext: false,
    hasPrevious: false,
    itemRange: { start: 0, end: 0, total: 0 },
  });

  // Stale request guards
  const activeRequestIdRef = useRef(0);

  // Phase 1: Resolve provider profile when tenant or authenticated user changes
  useEffect(() => {
    if (!currentOrg?.id || !user?.id) {
      setResolvingProfile(false);
      setProviderProfile(null);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    const orgIdAtRequest = currentOrg.id;
    const userIdAtRequest = user.id;

    setResolvingProfile(true);
    setProfileNotFound(false);
    setAppointments([]);
    setPage(1);
    setSearchInput('');
    setAppliedSearch('');
    setStatusFilter('');
    setError(null);
    setPaginationInfo({
      totalCount: 0,
      totalPages: 1,
      currentPage: 1,
      hasNext: false,
      hasPrevious: false,
      itemRange: { start: 0, end: 0, total: 0 },
    });

    organizationService
      .getProviders(orgIdAtRequest)
      .then((data) => {
        if (
          requestId !== activeRequestIdRef.current ||
          orgIdAtRequest !== currentOrg?.id ||
          userIdAtRequest !== user?.id
        ) {
          return;
        }

        const list = Array.isArray(data) ? data : data?.results || [];
        const myProfile = list.find((p) => p.user_id === userIdAtRequest);

        if (myProfile) {
          setProviderProfile(myProfile);
          setProfileNotFound(false);
        } else {
          setProviderProfile(null);
          setProfileNotFound(true);
        }
      })
      .catch((err) => {
        if (
          requestId !== activeRequestIdRef.current ||
          orgIdAtRequest !== currentOrg?.id ||
          userIdAtRequest !== user?.id
        ) {
          return;
        }
        setError(err.response?.data?.detail || 'Failed to resolve provider profile.');
        setProviderProfile(null);
      })
      .finally(() => {
        if (
          requestId === activeRequestIdRef.current &&
          orgIdAtRequest === currentOrg?.id &&
          userIdAtRequest === user?.id
        ) {
          setResolvingProfile(false);
        }
      });
  }, [currentOrg?.id, user?.id]);

  // Phase 2: Fetch assigned appointments for the resolved provider profile
  const fetchAppointments = useCallback(
    async (profileId, targetPage, searchToApply, statusToApply) => {
      const activeOrgId = currentOrg?.id;
      if (!activeOrgId || !profileId) return;

      const requestId = ++activeRequestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const params = {
          provider_id: profileId,
          page: targetPage,
          page_size: DEFAULT_PAGE_SIZE,
        };
        if (searchToApply) params.search = searchToApply;
        if (statusToApply) params.status = statusToApply;

        const data = await appointmentService.getAppointments(activeOrgId, params);

        if (
          requestId !== activeRequestIdRef.current ||
          activeOrgId !== currentOrg?.id ||
          profileId !== providerProfile?.id
        ) {
          return;
        }

        const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
        setAppointments(normalized.items);
        setPaginationInfo(normalized);
      } catch (err) {
        if (
          requestId !== activeRequestIdRef.current ||
          activeOrgId !== currentOrg?.id ||
          profileId !== providerProfile?.id
        ) {
          return;
        }

        // Strict 404 out-of-range pagination recovery
        const isPaginationEmptyPage =
          err.response?.status === 404 &&
          targetPage > 1 &&
          err.response?.data?.detail === 'That page contains no results.';

        if (isPaginationEmptyPage) {
          setPage((prev) => Math.max(1, prev - 1));
          return;
        }

        setError(err.response?.data?.detail || 'Failed to load assigned appointments.');
      } finally {
        if (
          requestId === activeRequestIdRef.current &&
          activeOrgId === currentOrg?.id &&
          profileId === providerProfile?.id
        ) {
          setLoading(false);
        }
      }
    },
    [currentOrg, providerProfile]
  );

  // Fetch when page, appliedSearch, or statusFilter changes for active profile
  useEffect(() => {
    if (providerProfile?.id) {
      fetchAppointments(providerProfile.id, page, appliedSearch, statusFilter);
    }
  }, [fetchAppointments, providerProfile?.id, page, appliedSearch, statusFilter]);

  const handleSearchSubmit = () => {
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed);
    setPage(1);
  };

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header dropdown above."
      />
    );
  }

  const isFiltered = Boolean(appliedSearch || statusFilter || searchInput);

  const filterConfigs = [
    {
      id: 'status-filter',
      label: 'Status',
      value: statusFilter,
      onChange: handleStatusChange,
      options: STATUS_OPTIONS,
    },
  ];

  return (
    <div className="app-container animate-page-entrance">
      {/* Page Header */}
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>My Patient Appointments</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Bookings assigned to{' '}
            <strong>
              {providerProfile?.user_name || user?.first_name || user?.email}
            </strong>{' '}
            at {currentOrg.name}.
          </p>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div
          role="alert"
          className="error-banner"
          style={{
            padding: '1rem',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            border: '1px solid var(--color-error-border)',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Profile Not Found State */}
      {profileNotFound && (
        <EmptyState
          title="No Provider Profile Found"
          message={`You do not have an active provider profile registered with ${currentOrg.name}.`}
        />
      )}

      {/* Resolving Profile Loading State */}
      {resolvingProfile && !profileNotFound && (
        <LoadingState message="Resolving provider profile and workload..." />
      )}

      {/* Main Content (when provider profile resolved) */}
      {!resolvingProfile && !profileNotFound && providerProfile && (
        <>
          {/* Search & Filter Toolbar */}
          <SearchFilterBar
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onSearchSubmit={handleSearchSubmit}
            searchPlaceholder="Search patient email, service name..."
            searchLabel="Search assigned appointments"
            filters={filterConfigs}
            isFiltered={isFiltered}
            onClear={handleClearFilters}
            isLoading={loading}
          />

          {/* Table & Pagination Surface */}
          <div>
            {loading ? (
              <LoadingState type="skeleton-table" rows={4} cols={5} />
            ) : appointments.length === 0 ? (
              <EmptyState
                title={isFiltered ? 'No Matching Appointments' : 'No Appointments Assigned'}
                message={
                  isFiltered
                    ? 'No assigned appointments matched your active search and status filters.'
                    : `You currently have no patient appointments assigned at ${currentOrg.name}.`
                }
                actionLabel={isFiltered ? 'Clear Filters' : undefined}
                onAction={isFiltered ? handleClearFilters : undefined}
              />
            ) : (
              <div className="qt-table-surface">
                <ResponsiveTable
                  caption={`Assigned Appointments for ${providerProfile?.user_name || user?.first_name || 'Provider'}`}
                  columns={TABLE_COLUMNS}
                >
                  {appointments.map((appt) => (
                    <tr key={appt.id}>
                      <td>
                        <div className="font-semibold">
                          {formatDhakaDate(appt.appointment_date || appt.start_datetime)}
                        </div>
                        <div className="flex items-center gap-xs flex-wrap" style={{ marginTop: '0.2rem' }}>
                          {formatDhakaTime(appt.start_datetime) && (
                            <span className="text-xs text-muted qt-tabular-num">
                              {formatDhakaTime(appt.start_datetime)}
                            </span>
                          )}
                          {appt.serial_number != null && (
                            <span
                              className="badge badge-neutral qt-tabular-num"
                              style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                            >
                              Serial #{appt.serial_number}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="font-semibold">
                          {appt.customer_name || 'Patient'}
                        </div>
                        {appt.customer_email && (
                          <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                            {appt.customer_email}
                          </div>
                        )}
                        {appt.contact_phone && (
                          <div className="text-xs text-muted" style={{ marginTop: '0.1rem' }}>
                            📞 {appt.contact_phone}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="font-medium">{appt.service_name || '—'}</span>
                      </td>
                      <td>
                        <StatusBadge status={appt.status} type="appointment" />
                      </td>
                      <td>
                        {appt.notes ? (
                          <span className="text-sm text-muted" style={{ fontStyle: 'italic' }}>
                            {appt.notes}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </ResponsiveTable>

                <Pagination
                  currentPage={paginationInfo.currentPage}
                  totalPages={paginationInfo.totalPages}
                  totalCount={paginationInfo.totalCount}
                  itemRange={paginationInfo.itemRange}
                  onPageChange={handlePageChange}
                  disabled={loading}
                  ariaLabel="Assigned appointments pagination"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default ProviderAppointmentsPage;
