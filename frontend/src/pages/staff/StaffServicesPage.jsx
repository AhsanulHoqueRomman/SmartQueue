import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import { formatCurrency } from '../../utils/bookingDisplay';

const TABLE_COLUMNS = [
  { key: 'name', label: 'Service Name' },
  { key: 'category', label: 'Category' },
  { key: 'duration', label: 'Duration' },
  { key: 'price', label: 'Standard Fee' },
];

/**
 * Formats duration according to QueueTurn data integrity rules:
 * - Positive number: "{num} min"
 * - Missing / invalid / non-positive: "Duration unavailable"
 * - Never substitutes a fabricated default duration
 */
function renderDuration(durationMinutes) {
  if (durationMinutes === null || durationMinutes === undefined || durationMinutes === '') {
    return 'Duration unavailable';
  }
  const num = Number(durationMinutes);
  if (!Number.isFinite(num) || num <= 0) {
    return 'Duration unavailable';
  }
  return `${num} min`;
}

/**
 * Formats category name according to QueueTurn data integrity rules:
 * - Assigned category object/string: actual name
 * - Missing / unassigned: "—"
 * - Never invents an artificial category
 */
function renderCategory(category) {
  if (category && typeof category === 'object' && category.name) {
    return category.name;
  }
  if (typeof category === 'string' && category.trim()) {
    return category.trim();
  }
  return '—';
}

/**
 * Formats service fee according to QueueTurn currency standards:
 * - Positive number: formatCurrency(num) (e.g. "৳1,200")
 * - Zero: "Free"
 * - Missing / invalid: "Price unavailable"
 */
function renderServicePrice(price) {
  if (price === null || price === undefined || price === '') {
    return 'Price unavailable';
  }
  const num = Number(price);
  if (!Number.isFinite(num)) {
    return 'Price unavailable';
  }
  if (num === 0) {
    return 'Free';
  }
  return formatCurrency(num);
}

export function StaffServicesPage() {
  const { currentOrg } = useTenant();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search: draft vs applied
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

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

  // Stale request guards & organization change tracking
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);

  const fetchServices = useCallback(async (targetPage, searchToApply) => {
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

      const data = await organizationService.getServices(orgIdAtRequest, params);

      // Stale response guard: discard if newer request was triggered or org switched
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
      setServices(normalized.items);
      setPaginationInfo(normalized);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      // Strict 404 pagination recovery: only recover if targetPage > 1 and detail matches backend empty page error
      const isPaginationEmptyPage =
        err.response?.status === 404 &&
        targetPage > 1 &&
        err.response?.data?.detail === 'That page contains no results.';

      if (isPaginationEmptyPage) {
        setPage((prev) => Math.max(1, prev - 1));
        return;
      }

      setError(err.response?.data?.detail || 'Failed to load facility services.');
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
      activeRequestIdRef.current += 1;
      setPage(1);
      setSearchInput('');
      setAppliedSearch('');
      setServices([]);
      setPaginationInfo({
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      });
      setError(null);
    }
  }, [currentOrg?.id]);

  // Fetch when active org, page, or applied search changes
  useEffect(() => {
    fetchServices(page, appliedSearch);
  }, [fetchServices, page, appliedSearch]);

  const handleSearchSubmit = () => {
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
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

  const isFiltered = Boolean(appliedSearch || searchInput);

  return (
    <div className="app-container animate-page-entrance">
      {/* Page Header */}
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Facility Services & Pricing</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Active service catalog, standard durations, and consultation fees at {currentOrg.name}.
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

      {/* Search Bar Toolbar */}
      <SearchFilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        searchPlaceholder="Search service name, description..."
        searchLabel="Search facility services"
        filters={[]}
        isFiltered={isFiltered}
        onClear={handleClearFilters}
        isLoading={loading}
      />

      {/* Table & Pagination Content Surface */}
      <div>
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={4} />
        ) : services.length === 0 ? (
          <EmptyState
            title={isFiltered ? 'No Matching Services' : 'No Services Configured'}
            message={
              isFiltered
                ? 'No active services matched your search query.'
                : `No active services configured for ${currentOrg.name}.`
            }
            actionLabel={isFiltered ? 'Clear Search' : undefined}
            onAction={isFiltered ? handleClearFilters : undefined}
          />
        ) : (
          <div className="qt-table-surface">
            <ResponsiveTable
              caption={`Active Services Catalog for ${currentOrg.name}`}
              columns={TABLE_COLUMNS}
            >
              {services.map((svc) => (
                <tr key={svc.id}>
                  <td>
                    <div className="font-semibold">{svc.name}</div>
                    {svc.description && (
                      <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                        {svc.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-neutral">
                      {renderCategory(svc.category)}
                    </span>
                  </td>
                  <td>
                    <span className="qt-tabular-num">{renderDuration(svc.duration_minutes)}</span>
                  </td>
                  <td>
                    <span className="qt-tabular-num">{renderServicePrice(svc.price)}</span>
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
              ariaLabel="Facility services pagination"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StaffServicesPage;
