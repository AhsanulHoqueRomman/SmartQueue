import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';

const TABLE_COLUMNS = [
  { key: 'customer', label: 'Customer Email' },
  { key: 'service', label: 'Service' },
  { key: 'datetime', label: 'Date & Time' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', align: 'right' },
];

export function StaffAppointmentsPage() {
  const { currentOrg } = useTenant();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Search: editable draft vs applied query
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

  const [checkingInId, setCheckingInId] = useState(null);

  // Stale-response tracking
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);

  const fetchAppointments = useCallback(async (targetPage, searchToApply, statusToApply) => {
    if (!currentOrg?.id) return;

    const requestId = ++activeRequestIdRef.current;
    const orgIdAtRequest = currentOrg.id;
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: targetPage,
        page_size: DEFAULT_PAGE_SIZE,
      };
      if (searchToApply) params.search = searchToApply;
      if (statusToApply) params.status = statusToApply;

      const data = await appointmentService.getAppointments(orgIdAtRequest, params);

      // Discard response if organization switched or newer query started
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
      setAppointments(normalized.items);
      setPaginationInfo(normalized);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      // If page > 1 returned 404 (e.g. data reduced by filter), recover to page 1
      if (err.response?.status === 404 && targetPage > 1) {
        setPage(1);
        return;
      }

      setError(err.response?.data?.detail || 'Failed to load organization appointments.');
    } finally {
      if (requestId === activeRequestIdRef.current && orgIdAtRequest === currentOrg?.id) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id]);

  // Reset state when switching active organization
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      setPage(1);
      setSearchInput('');
      setAppliedSearch('');
      setStatusFilter('');
      setFeedback(null);
      setError(null);
    }
  }, [currentOrg?.id]);

  // Fetch when active org, page, applied search, or status filter changes
  useEffect(() => {
    fetchAppointments(page, appliedSearch, statusFilter);
  }, [fetchAppointments, page, appliedSearch, statusFilter]);

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

  const handleCheckIn = async (appointmentId) => {
    if (!currentOrg?.id) return;
    const orgIdAtAction = currentOrg.id;

    setCheckingInId(appointmentId);
    setFeedback(null);

    try {
      await appointmentService.checkInAppointment(orgIdAtAction, appointmentId);

      // Ensure active org hasn't changed during network roundtrip
      if (orgIdAtAction === currentOrg?.id) {
        setFeedback({
          type: 'success',
          message: 'Successfully checked in customer appointment!',
        });
        fetchAppointments(page, appliedSearch, statusFilter);
      }
    } catch (err) {
      if (orgIdAtAction === currentOrg?.id) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.detail || 'Check-in failed.',
        });
      }
    } finally {
      if (orgIdAtAction === currentOrg?.id) {
        setCheckingInId(null);
      }
    }
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

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Customer Appointments Roster</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Search, verify, and check-in customer bookings at {currentOrg.name}.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            background: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

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
          }}
        >
          {error}
        </div>
      )}

      {/* Accessible Search & Filter Toolbar (Open layout, no heavy card nesting) */}
      <SearchFilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        searchPlaceholder="Search email, service, provider..."
        searchLabel="Search customer appointments"
        filters={[
          {
            id: 'staff-status-select',
            label: 'Status Filter',
            value: statusFilter,
            onChange: handleStatusChange,
            options: [
              { value: '', label: 'All Statuses' },
              { value: 'CONFIRMED', label: 'CONFIRMED' },
              { value: 'CHECKED_IN', label: 'CHECKED_IN' },
              { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
              { value: 'COMPLETED', label: 'COMPLETED' },
              { value: 'CANCELLED', label: 'CANCELLED' },
            ],
          },
        ]}
        isFiltered={isFiltered}
        onClear={handleClearFilters}
        isLoading={loading}
      />

      {/* Table & Pagination Content Surface */}
      <div>
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={5} />
        ) : appointments.length === 0 ? (
          <EmptyState
            title={appliedSearch || statusFilter ? 'No Matching Appointments' : 'No Appointments Found'}
            message={
              appliedSearch || statusFilter
                ? 'No appointment records matched your query filter.'
                : `No customer bookings are currently scheduled for ${currentOrg.name}.`
            }
            actionLabel={appliedSearch || statusFilter ? 'Clear Filters' : undefined}
            onAction={appliedSearch || statusFilter ? handleClearFilters : undefined}
          />
        ) : (
          <div className="qt-table-surface">
            <ResponsiveTable
              caption={`Customer Appointments Roster for ${currentOrg.name}`}
              columns={TABLE_COLUMNS}
            >
              {appointments.map((appt) => (
                <tr key={appt.id}>
                  <td className="font-semibold">
                    {appt.customer_email || `Customer #${appt.customer}`}
                  </td>
                  <td>{appt.service_name || 'Service'}</td>
                  <td>
                    <div className="qt-tabular-num">{new Date(appt.start_datetime).toLocaleDateString()}</div>
                    <div className="text-xs text-muted qt-tabular-num" style={{ marginTop: '0.15rem' }}>
                      {new Date(appt.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={appt.status} type="appointment" />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {appt.status === 'CONFIRMED' && (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleCheckIn(appt.id)}
                        disabled={checkingInId === appt.id}
                        aria-label={`Check in customer ${appt.customer_email || ''}`}
                      >
                        {checkingInId === appt.id ? 'Checking in...' : 'Check In Customer'}
                      </button>
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
              ariaLabel="Appointments pagination"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StaffAppointmentsPage;
