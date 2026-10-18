import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import organizationService from '../../services/organizationService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import '../../styles/OperationalPrimitives.css';
import '../../styles/ManagerAppointments.css';

/**
 * Valid backend Appointment.Status choices from Appointment model.
 */
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CHECKED_IN', label: 'Checked In' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
];

/**
 * Table columns for ResponsiveTable primitive.
 */
const TABLE_COLUMNS = [
  { key: 'datetime', label: 'Date, Time & Serial', width: '22%' },
  { key: 'customer', label: 'Customer', width: '22%' },
  { key: 'service', label: 'Service Offering', width: '20%' },
  { key: 'provider', label: 'Assigned Provider', width: '18%' },
  { key: 'status', label: 'Status', width: '10%' },
  { key: 'actions', label: 'Actions', width: '8%', align: 'right' },
];

/**
 * Resolves a provider object's display name prioritizing real first/last name,
 * then provider title, and finally the neutral 'Service Provider'.
 * Strictly forbids using email as a display-name fallback.
 */
function getProviderDisplayName(provider) {
  if (!provider) return 'Service Provider';
  const fullName = `${provider.user_first_name || ''} ${provider.user_last_name || ''}`.trim();
  if (fullName) return fullName;
  if (provider.title && typeof provider.title === 'string' && provider.title.trim()) {
    return provider.title.trim();
  }
  return 'Service Provider';
}

/**
 * Formats appointment date string in Asia/Dhaka without timezone drift.
 */
function formatDhakaDate(dateStr) {
  if (!dateStr) return '—';
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
    if (isNaN(dt.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(dt);
  } catch {
    return '—';
  }
}

/**
 * Formats scheduled clock time in Asia/Dhaka. Returns null if invalid or missing.
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

export function ManagerAppointmentsPage() {
  const { currentOrg } = useTenant();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');

  // Organization Providers with tenant ownership tag
  const [providersData, setProvidersData] = useState({
    orgId: null,
    items: [],
  });

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

  // Appointments Data with tenant ownership tag
  const [appointmentsData, setAppointmentsData] = useState({
    orgId: null,
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Read-Only Detail Modal State
  const [selectedAppt, setSelectedAppt] = useState(null);

  // Refs for request safety and accessible focus restoration
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);
  const lastFocusedBtnRef = useRef(null);
  const modalRef = useRef(null);
  const modalCloseBtnRef = useRef(null);

  // Render-time tenant ownership guards
  const isCurrentOrgAppointments = appointmentsData.orgId === currentOrg?.id;
  const isCurrentOrgProviders = providersData.orgId === currentOrg?.id;

  const activeAppointments = isCurrentOrgAppointments ? appointmentsData.items : [];
  const activeProviders = isCurrentOrgProviders ? providersData.items : [];
  const activePagination = isCurrentOrgAppointments
    ? paginationInfo
    : {
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      };

  // Map providers by ID for fast name resolution
  const providersMap = useMemo(() => {
    const map = new Map();
    activeProviders.forEach((p) => {
      map.set(String(p.id), p);
    });
    return map;
  }, [activeProviders]);

  /**
   * Resolves provider display name from provider_id using organization provider list.
   * Uses real names, titles, and neutral fallbacks; never uses email or synthetic IDs.
   */
  const resolveProviderName = useCallback(
    (providerId) => {
      if (!providerId) return 'Unassigned';
      const p = providersMap.get(String(providerId));
      if (p) {
        return getProviderDisplayName(p);
      }
      return 'Service Provider';
    },
    [providersMap]
  );

  // Provider Filter Dropdown Options using consistent display resolution
  const providerOptions = useMemo(() => {
    return [
      { value: '', label: 'All Providers' },
      ...activeProviders.map((p) => ({
        value: String(p.id),
        label: getProviderDisplayName(p),
      })),
    ];
  }, [activeProviders]);

  /**
   * Primary asynchronous fetch function with request-ticket isolation and exact 404 recovery.
   */
  const fetchAppointments = useCallback(
    async (targetPage, searchToApply, statusToApply, providerToApply) => {
      if (!currentOrg?.id) return;

      const requestId = ++activeRequestIdRef.current;
      const orgIdAtRequest = currentOrg.id;
      setLoading(true);
      setError(null);

      try {
        const params = {
          page: targetPage,
          page_size: DEFAULT_PAGE_SIZE,
          ordering: '-start_datetime',
        };
        if (searchToApply) params.search = searchToApply;
        if (statusToApply) params.status = statusToApply;
        if (providerToApply) params.provider_id = providerToApply;

        const data = await appointmentService.getAppointments(orgIdAtRequest, params);

        // Discard response if organization switched or newer query started
        if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
          return;
        }

        const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
        setAppointmentsData({
          orgId: orgIdAtRequest,
          items: normalized.items,
        });
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

        setError(err.response?.data?.detail || 'Failed to load organization appointments.');
      } finally {
        if (requestId === activeRequestIdRef.current && orgIdAtRequest === currentOrg?.id) {
          setLoading(false);
        }
      }
    },
    [currentOrg?.id]
  );

  // Fetch organization providers for lookup and provider filter options
  useEffect(() => {
    if (!currentOrg?.id) return;
    const orgIdAtRequest = currentOrg.id;

    organizationService
      .getProviders(orgIdAtRequest)
      .then((data) => {
        if (orgIdAtRequest === currentOrg?.id) {
          const list = Array.isArray(data) ? data : data?.results || [];
          setProvidersData({
            orgId: orgIdAtRequest,
            items: list,
          });
        }
      })
      .catch(() => {
        if (orgIdAtRequest === currentOrg?.id) {
          setProvidersData({
            orgId: orgIdAtRequest,
            items: [],
          });
        }
      });
  }, [currentOrg?.id]);

  // Synchronous state clearance and request invalidation on organization switch
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      // Invalidate any in-flight requests from the previous tenant
      activeRequestIdRef.current++;
      // Clear appointment and provider records
      setAppointmentsData({
        orgId: currentOrg?.id || null,
        items: [],
      });
      setProvidersData({
        orgId: currentOrg?.id || null,
        items: [],
      });
      setPage(1);
      setSearchInput('');
      setAppliedSearch('');
      setStatusFilter('');
      setProviderFilter('');
      setSelectedAppt(null);
      setError(null);
    }
  }, [currentOrg?.id]);

  // Synchronize appointments query on state changes
  useEffect(() => {
    fetchAppointments(page, appliedSearch, statusFilter, providerFilter);
  }, [fetchAppointments, page, appliedSearch, statusFilter, providerFilter]);

  // Manage modal focus and prevent body background scrolling while open
  useEffect(() => {
    if (selectedAppt) {
      modalCloseBtnRef.current?.focus();
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          closeDetailsModal();
          return;
        }
        if (e.key === 'Tab' && modalRef.current) {
          const focusable = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [selectedAppt]);

  const handleSearchSubmit = () => {
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed);
    setPage(1);
  };

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleProviderChange = (newProvider) => {
    setProviderFilter(newProvider);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setStatusFilter('');
    setProviderFilter('');
    setPage(1);
  };

  const handleRefresh = () => {
    fetchAppointments(page, appliedSearch, statusFilter, providerFilter);
  };

  const handlePageChange = (newPage) => {
    if (!loading && newPage !== page) {
      setPage(newPage);
    }
  };

  const openDetailsModal = (appt, btnElement) => {
    lastFocusedBtnRef.current = btnElement;
    setSelectedAppt(appt);
  };

  const closeDetailsModal = () => {
    setSelectedAppt(null);
    if (lastFocusedBtnRef.current) {
      lastFocusedBtnRef.current.focus();
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Select an organization from the tenant switcher to monitor appointments."
      />
    );
  }

  const isFiltered = Boolean(appliedSearch || statusFilter || providerFilter);

  return (
    <div className="manager-appointments animate-page-entrance">
      {/* --------------------------------------------------------------------
         Top Header Command Bar
         -------------------------------------------------------------------- */}
      <header className="manager-appointments__header">
        <div className="manager-appointments__header-info">
          <div className="manager-appointments__eyebrow">
            <span>📅 Operational Desk</span>
          </div>
          <div className="manager-appointments__title-row">
            <h1 className="manager-appointments__title">Appointments Roster</h1>
            <span className="manager-appointments__role-badge">Operational Oversight</span>
          </div>
          <p className="manager-appointments__subtitle">
            Server-authoritative appointment bookings across{' '}
            <strong className="manager-appointments__subtitle-org">{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="manager-appointments__controls">
          <button
            type="button"
            className="manager-appointments__btn-refresh"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh appointment roster records"
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
        searchPlaceholder="Search customer email, service, provider..."
        searchLabel="Search appointments"
        filters={[
          {
            id: 'appointment-status-filter',
            label: 'Filter by Status',
            value: statusFilter,
            onChange: handleStatusChange,
            options: STATUS_OPTIONS,
          },
          {
            id: 'appointment-provider-filter',
            label: 'Filter by Provider',
            value: providerFilter,
            onChange: handleProviderChange,
            options: providerOptions,
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
        <div className="manager-appointments__error-banner" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------
         Data Presentation / Empty / Loading States
         -------------------------------------------------------------------- */}
      {loading ? (
        <LoadingState message="Loading appointment records..." />
      ) : activeAppointments.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No Matching Appointments Found"
            message="No appointment records match your active search or filter criteria."
            actionLabel="Clear Filters"
            onAction={handleClearFilters}
          />
        ) : (
          <EmptyState
            title="No Appointments Recorded"
            message={`No customer bookings have been scheduled for ${currentOrg.name} yet.`}
          />
        )
      ) : (
        <>
          <ResponsiveTable
            caption={`Appointments Roster for ${currentOrg.name}`}
            columns={TABLE_COLUMNS}
          >
            {activeAppointments.map((appt) => {
              const displayDate = formatDhakaDate(appt.appointment_date || appt.start_datetime);
              const displayTime = formatDhakaTime(appt.start_datetime);
              const providerName = resolveProviderName(appt.provider_id);

              return (
                <tr key={appt.id}>
                  {/* 1. Date, Time & Serial */}
                  <td>
                    <div className="manager-appointments__cell-datetime">
                      <span className="manager-appointments__date">{displayDate}</span>
                      {displayTime && (
                        <span className="manager-appointments__time">{displayTime}</span>
                      )}
                      {appt.serial_number && (
                        <span className="manager-appointments__serial-badge">
                          Serial #{appt.serial_number}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 2. Customer */}
                  <td>
                    <div className="manager-appointments__customer-cell">
                      <span className="manager-appointments__customer-name">
                        {appt.customer_name || appt.contact_name || appt.customer_email?.split('@')[0] || 'Customer'}
                      </span>
                      {appt.customer_email && (
                        <span className="manager-appointments__customer-email" title={appt.customer_email}>
                          {appt.customer_email}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 3. Service Offering */}
                  <td>
                    <div className="manager-appointments__service-cell">
                      <span className="manager-appointments__service-name">
                        {appt.service_name || 'Standard Service'}
                      </span>
                    </div>
                  </td>

                  {/* 4. Assigned Provider */}
                  <td>
                    <span className="manager-appointments__provider-cell">
                      <span aria-hidden="true">🩺</span> {providerName}
                    </span>
                  </td>

                  {/* 5. Status */}
                  <td>
                    <StatusBadge status={appt.status} type="appointment" />
                  </td>

                  {/* 6. Read-Only Actions */}
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="manager-appointments__btn-details"
                      onClick={(e) => openDetailsModal(appt, e.currentTarget)}
                      aria-label={`View details for appointment #${String(appt.id).slice(0, 8)}`}
                    >
                      <span>Details</span>
                      <span aria-hidden="true">→</span>
                    </button>
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
            totalPages={activePagination.totalPages}
            totalCount={activePagination.totalCount}
            itemRange={activePagination.itemRange}
            onPageChange={handlePageChange}
            disabled={loading}
            ariaLabel="Appointments table pagination"
          />
        </>
      )}

      {/* --------------------------------------------------------------------
         Accessible Read-Only Appointment Details Modal
         -------------------------------------------------------------------- */}
      {selectedAppt && (!selectedAppt.organization_id || String(selectedAppt.organization_id) === String(currentOrg?.id)) && (
        <div
          className="manager-appointments-modal__backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetailsModal();
          }}
        >
          <div
            ref={modalRef}
            className="manager-appointments-modal__content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-appointment-details-title"
          >
            <div className="manager-appointments-modal__header">
              <h2
                id="manager-appointment-details-title"
                className="manager-appointments-modal__title"
              >
                Appointment Details
              </h2>
              <button
                ref={modalCloseBtnRef}
                type="button"
                className="manager-appointments-modal__close-btn"
                onClick={closeDetailsModal}
                aria-label="Close appointment details modal"
              >
                ✕
              </button>
            </div>

            <div className="manager-appointments-modal__body">
              <div className="manager-appointments-modal__grid">
                {/* Reference ID */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Reference ID</span>
                  <span className="manager-appointments-modal__value manager-appointments-modal__value--mono">
                    #{selectedAppt.id}
                  </span>
                </div>

                {/* Status */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Status</span>
                  <div>
                    <StatusBadge status={selectedAppt.status} type="appointment" />
                  </div>
                </div>

                {/* Serial Number */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Serial Number</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.serial_number ? `Serial #${selectedAppt.serial_number}` : '—'}
                  </span>
                </div>

                {/* Service Name */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Service</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.service_name || 'Standard Service'}
                  </span>
                </div>

                {/* Assigned Provider */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Provider</span>
                  <span className="manager-appointments-modal__value">
                    🩺 {resolveProviderName(selectedAppt.provider_id)}
                  </span>
                </div>

                {/* Customer Email */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Customer Email</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.customer_email || '—'}
                  </span>
                </div>

                {/* Customer Name */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Customer Name</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.customer_name || selectedAppt.contact_name || '—'}
                  </span>
                </div>

                {/* Contact Phone */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Contact Phone</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.contact_phone || '—'}
                  </span>
                </div>

                {/* Appointment Date */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Appointment Date</span>
                  <span className="manager-appointments-modal__value">
                    {formatDhakaDate(selectedAppt.appointment_date || selectedAppt.start_datetime)}
                  </span>
                </div>

                {/* Scheduled Time */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Scheduled Time (Dhaka)</span>
                  <span className="manager-appointments-modal__value">
                    {formatDhakaTime(selectedAppt.start_datetime) || 'No specific time slot'}
                  </span>
                </div>

                {/* Booking Channel */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Booking Channel</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.booking_channel || '—'}
                  </span>
                </div>

                {/* Arrival Type */}
                <div className="manager-appointments-modal__field">
                  <span className="manager-appointments-modal__label">Arrival Type</span>
                  <span className="manager-appointments-modal__value">
                    {selectedAppt.arrival_type || '—'}
                  </span>
                </div>

                {/* Cancellation Reason if present */}
                {selectedAppt.cancellation_reason && (
                  <div className="manager-appointments-modal__field manager-appointments-modal__field--full">
                    <span className="manager-appointments-modal__label">Cancellation Reason</span>
                    <div className="manager-appointments-modal__alert-callout">
                      <strong>Reason:</strong> {selectedAppt.cancellation_reason}
                    </div>
                  </div>
                )}

                {/* Customer Notes */}
                <div className="manager-appointments-modal__field manager-appointments-modal__field--full">
                  <span className="manager-appointments-modal__label">Customer Notes</span>
                  <div className="manager-appointments-modal__value--notes">
                    {selectedAppt.notes || 'No customer notes recorded.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="manager-appointments-modal__footer">
              <button
                type="button"
                className="manager-appointments-modal__dismiss-btn"
                onClick={closeDetailsModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerAppointmentsPage;
