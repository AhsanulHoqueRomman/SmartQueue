import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';

const TABLE_COLUMNS = [
  { key: 'provider', label: 'Specialist / Provider' },
  { key: 'specialties', label: 'Specialty & Profile' },
  { key: 'experience', label: 'Experience' },
  { key: 'duration', label: 'Avg Consultation' },
];

/**
 * Builds truthful provider display name from first and last names.
 * Never uses nonexistent user_name; falls back to 'Service Provider'
 * only when both first and last name are missing.
 */
function renderProviderName(firstName, lastName) {
  const full = `${firstName || ''} ${lastName || ''}`.trim();
  return full || 'Service Provider';
}

/**
 * Formats provider designation/title truthfully.
 * Displays '—' when title is absent; never fabricates 'General Practitioner'.
 */
function renderProviderTitle(title) {
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return '—';
}

/**
 * Formats specialty or bio from verified backend fields.
 * Prioritizes specialties (array or string); falls back to bio.
 * Displays '—' when no profile details are configured.
 */
function renderSpecialtiesOrBio(specialties, bio) {
  if (Array.isArray(specialties) && specialties.length > 0) {
    const list = specialties
      .map((s) => (typeof s === 'string' ? s.trim() : (s?.name || '')))
      .filter(Boolean);
    if (list.length > 0) {
      return list.join(', ');
    }
  }
  if (typeof specialties === 'string' && specialties.trim()) {
    return specialties.trim();
  }
  if (typeof bio === 'string' && bio.trim()) {
    return bio.trim();
  }
  return '—';
}

/**
 * Formats years of experience from backend data.
 * Displays '{num} yrs' (or '{num} yr') if positive integer; otherwise '—'.
 * Never fabricates experience.
 */
function renderExperience(years) {
  if (years === null || years === undefined || years === '') {
    return '—';
  }
  const num = Number(years);
  if (!Number.isFinite(num) || num <= 0) {
    return '—';
  }
  return `${num} yr${num === 1 ? '' : 's'}`;
}

/**
 * Formats provider-wide average consultation duration.
 * Displays '{num} min' if positive integer; otherwise '—'.
 * Never fabricates service duration or confuses with ETA.
 */
function renderAverageDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') {
    return '—';
  }
  const num = Number(minutes);
  if (!Number.isFinite(num) || num <= 0) {
    return '—';
  }
  return `${num} min`;
}

export function StaffProvidersPage() {
  const { currentOrg } = useTenant();

  const [providers, setProviders] = useState([]);
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

  const fetchProviders = useCallback(async (targetPage, searchToApply) => {
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

      const data = await organizationService.getProviders(orgIdAtRequest, params);

      // Stale response guard: discard if newer request was triggered or org switched
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
      setProviders(normalized.items);
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

      setError(err.response?.data?.detail || 'Failed to load provider directory.');
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
      setProviders([]);
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
    fetchProviders(page, appliedSearch);
  }, [fetchProviders, page, appliedSearch]);

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
          <h1>Specialist & Provider Roster</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Active care providers, clinical credentials, and consultation timings at {currentOrg.name}.
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
          {error}
        </div>
      )}

      {/* Search Bar Toolbar */}
      <SearchFilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        searchPlaceholder="Search provider name, title, bio..."
        searchLabel="Search facility specialists"
        filters={[]}
        isFiltered={isFiltered}
        onClear={handleClearFilters}
        isLoading={loading}
      />

      {/* Table & Pagination Content Surface */}
      <div>
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={4} />
        ) : providers.length === 0 ? (
          <EmptyState
            title={isFiltered ? 'No Matching Specialists' : 'No Providers Configured'}
            message={
              isFiltered
                ? 'No active provider profiles matched your search query.'
                : `No active provider profiles configured for ${currentOrg.name}.`
            }
            actionLabel={isFiltered ? 'Clear Search' : undefined}
            onAction={isFiltered ? handleClearFilters : undefined}
          />
        ) : (
          <div className="qt-table-surface">
            <ResponsiveTable
              caption={`Active Provider Roster for ${currentOrg.name}`}
              columns={TABLE_COLUMNS}
            >
              {providers.map((p) => {
                const displayName = renderProviderName(p.user_first_name, p.user_last_name);
                const displayTitle = renderProviderTitle(p.title);
                const displaySpecialty = renderSpecialtiesOrBio(p.specialties, p.bio);
                const displayExperience = renderExperience(p.experience_years);
                const displayDuration = renderAverageDuration(p.average_service_minutes);

                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-semibold">{displayName}</div>
                      {displayTitle !== '—' && (
                        <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                          {displayTitle}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="text-sm">
                        {displaySpecialty}
                      </span>
                    </td>
                    <td>
                      <span className="qt-tabular-num">{displayExperience}</span>
                    </td>
                    <td>
                      <span className="qt-tabular-num">{displayDuration}</span>
                    </td>
                  </tr>
                );
              })}
            </ResponsiveTable>

            <Pagination
              currentPage={paginationInfo.currentPage}
              totalPages={paginationInfo.totalPages}
              totalCount={paginationInfo.totalCount}
              itemRange={paginationInfo.itemRange}
              onPageChange={handlePageChange}
              disabled={loading}
              ariaLabel="Facility providers pagination"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StaffProvidersPage;
