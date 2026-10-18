import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import providerManagementService from '../../services/providerManagementService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { formatCurrency } from '../../utils/bookingDisplay';
import '../../styles/OperationalPrimitives.css';
import '../../styles/ProviderServices.css';

/**
 * Filter options for provider services.
 */
const OVERRIDE_FILTER_OPTIONS = [
  { value: '', label: 'All Assigned Services' },
  { value: 'CUSTOM_PRICE', label: 'Custom Price Overrides' },
  { value: 'CUSTOM_DURATION', label: 'Custom Duration Overrides' },
  { value: 'ACTIVE_ONLY', label: 'Active Services Only' },
];

export function ProviderServicesPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  // Component State
  const [providerProfile, setProviderProfile] = useState(null);
  const [hasResolvedProfile, setHasResolvedProfile] = useState(false);
  const [assignedServicesData, setAssignedServicesData] = useState({
    orgId: null,
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [overrideFilter, setOverrideFilter] = useState('');

  // Request & Mutation Safety Refs
  const activeOrgIdRef = useRef(currentOrg?.id);
  activeOrgIdRef.current = currentOrg?.id;
  const orgContextGenRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);

  // Render-time tenant ownership guard
  const rawServices = useMemo(
    () => (assignedServicesData.orgId === currentOrg?.id ? assignedServicesData.items : []),
    [assignedServicesData, currentOrg?.id]
  );

  /**
   * Primary asynchronous fetch function with request-ticket and context-generation isolation.
   * Decoupled to ensure optional organization catalog failure does not hide assigned services (D-3).
   */
  const fetchProviderServices = useCallback(
    async (targetOrgId) => {
      const orgIdToFetch = targetOrgId || currentOrg?.id;
      if (!orgIdToFetch || !user?.id) return;

      const requestId = ++activeRequestIdRef.current;
      const requestGen = orgContextGenRef.current;
      setLoading(true);
      setError(null);

      try {
        // 1. Resolve Provider Profile for Authenticated User
        const provsData = await organizationService.getProviders(orgIdToFetch);

        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }

        const provList = Array.isArray(provsData) ? provsData : provsData?.results || [];
        const myProfile = provList.find((p) => p.user_id === user.id) || null;

        setProviderProfile(myProfile);
        setHasResolvedProfile(true);

        if (!myProfile) {
          setAssignedServicesData({ orgId: orgIdToFetch, items: [] });
          setLoading(false);
          return;
        }

        // 2. Fetch Provider-Scoped Assigned Services & Optional Organization Catalog with Safe Settling (D-3)
        const [assignedResult, orgCatalogResult] = await Promise.allSettled([
          providerManagementService.getProviderServices(orgIdToFetch, myProfile.id),
          organizationService.getServices(orgIdToFetch),
        ]);

        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }

        // Primary authoritative assigned-services failure check
        if (assignedResult.status === 'rejected') {
          throw assignedResult.reason;
        }

        const assignedData = assignedResult.value;
        const assignments = Array.isArray(assignedData) ? assignedData : assignedData?.results || [];

        // Secondary optional catalog enrichment
        let orgCatalog = [];
        if (orgCatalogResult.status === 'fulfilled') {
          const rawCatalog = orgCatalogResult.value;
          orgCatalog = Array.isArray(rawCatalog) ? rawCatalog : rawCatalog?.results || [];
        }

        // Build enriched assigned services dataset with truthful precedence (D-1, D-2)
        const enriched = assignments.map((assignment) => {
          const parentSvc = orgCatalog.find((s) => s.id === assignment.service_id) || null;

          const hasCustomDuration =
            assignment.custom_duration_minutes !== null &&
            assignment.custom_duration_minutes !== undefined &&
            assignment.custom_duration_minutes !== '';

          const hasCustomPrice =
            assignment.custom_price !== null &&
            assignment.custom_price !== undefined &&
            assignment.custom_price !== '';

          const baseDuration =
            parentSvc?.duration_minutes !== null &&
            parentSvc?.duration_minutes !== undefined &&
            parentSvc?.duration_minutes !== ''
              ? Number(parentSvc.duration_minutes)
              : null;

          // Duration Precedence (D-2):
          // 1. custom_duration_minutes
          // 2. parent service duration_minutes
          // 3. Otherwise null (Duration unavailable) — no fabricated 30m fallback
          let effectiveDuration = null;
          if (hasCustomDuration) {
            effectiveDuration = Number(assignment.custom_duration_minutes);
          } else if (baseDuration !== null) {
            effectiveDuration = baseDuration;
          }

          const basePrice =
            parentSvc?.price !== null &&
            parentSvc?.price !== undefined &&
            parentSvc?.price !== ''
              ? parentSvc.price
              : null;

          // Price Precedence (D-2):
          // 1. backend effective_customer_charge (including 0.00)
          // 2. actual custom_price (including 0.00)
          // 3. actual parent service price
          // 4. Otherwise null (Fee unavailable) — no fabricated '0.00' fallback
          let effectivePrice = null;
          if (
            assignment.effective_customer_charge !== null &&
            assignment.effective_customer_charge !== undefined &&
            assignment.effective_customer_charge !== ''
          ) {
            effectivePrice = assignment.effective_customer_charge;
          } else if (hasCustomPrice) {
            effectivePrice = assignment.custom_price;
          } else if (basePrice !== null) {
            effectivePrice = basePrice;
          }

          // Verified parent service status without inventing assignment active status
          const parentServiceActive = parentSvc ? parentSvc.is_active !== false : null;

          return {
            id: assignment.id,
            service_id: assignment.service_id,
            service_name: assignment.service_name || parentSvc?.name || 'Assigned Service',
            description: parentSvc?.description || parentSvc?.short_description || '',
            category_name: parentSvc?.category?.name || 'Clinical Care',
            category_icon: parentSvc?.category?.icon || '🩺',
            parent_service_active: parentServiceActive,
            has_custom_duration: hasCustomDuration,
            custom_duration_minutes: hasCustomDuration ? Number(assignment.custom_duration_minutes) : null,
            base_duration_minutes: baseDuration,
            effective_duration: effectiveDuration,
            has_custom_price: hasCustomPrice,
            custom_price: hasCustomPrice ? assignment.custom_price : null,
            base_price: basePrice,
            effective_customer_charge: effectivePrice,
          };
        });

        setAssignedServicesData({
          orgId: orgIdToFetch,
          items: enriched,
        });
      } catch (err) {
        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }
        setError(
          err.response?.data?.error?.message ||
          err.response?.data?.detail ||
          'Failed to load assigned service offerings.'
        );
      } finally {
        if (
          requestId === activeRequestIdRef.current &&
          requestGen === orgContextGenRef.current &&
          orgIdToFetch === activeOrgIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [currentOrg?.id, user?.id]
  );

  // Organization switch watcher: resets state, clears stale data, increments generation
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      orgContextGenRef.current += 1;

      setProviderProfile(null);
      setHasResolvedProfile(false);
      setSearchInput('');
      setAppliedSearch('');
      setOverrideFilter('');
      setAssignedServicesData({ orgId: currentOrg?.id || null, items: [] });
    }

    if (currentOrg?.id && user?.id) {
      fetchProviderServices(currentOrg.id);
    }
  }, [currentOrg?.id, user?.id, fetchProviderServices]);

  // Derived statistics from authoritative assigned services (D-2)
  const stats = useMemo(() => {
    const total = rawServices.length;
    const active = rawServices.filter((s) => s.parent_service_active === true).length;
    const customPriceCount = rawServices.filter((s) => s.has_custom_price).length;
    const customDurationCount = rawServices.filter((s) => s.has_custom_duration).length;
    const durationItems = rawServices.filter((s) => s.effective_duration !== null);
    const avgDuration = durationItems.length > 0
      ? Math.round(durationItems.reduce((sum, s) => sum + s.effective_duration, 0) / durationItems.length)
      : null;

    return { total, active, customPriceCount, customDurationCount, avgDuration };
  }, [rawServices]);

  // Client-side filtering & search
  const filteredServices = useMemo(() => {
    let result = rawServices;

    // Override / Status filter
    if (overrideFilter === 'CUSTOM_PRICE') {
      result = result.filter((s) => s.has_custom_price);
    } else if (overrideFilter === 'CUSTOM_DURATION') {
      result = result.filter((s) => s.has_custom_duration);
    } else if (overrideFilter === 'ACTIVE_ONLY') {
      result = result.filter((s) => s.parent_service_active === true);
    }

    // Search query: name, description, category
    if (appliedSearch) {
      const q = appliedSearch.toLowerCase();
      result = result.filter((s) => {
        const name = (s.service_name || '').toLowerCase();
        const desc = (s.description || '').toLowerCase();
        const cat = (s.category_name || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || cat.includes(q);
      });
    }

    return result;
  }, [rawServices, overrideFilter, appliedSearch]);

  const handleSearchSubmit = () => {
    setAppliedSearch(searchInput.trim());
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setOverrideFilter('');
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Select an active organization to view your assigned clinical capabilities."
      />
    );
  }

  if (loading && rawServices.length === 0 && !error) {
    return <LoadingState message="Fetching assigned provider services and capabilities..." />;
  }

  return (
    <div className="provider-services app-container animate-page-entrance">
      {/* Header */}
      <header className="provider-services__header">
        <div className="provider-services__header-info">
          <div className="provider-services__eyebrow">
            <span aria-hidden="true">🩺</span> Clinical Offerings & Capabilities
          </div>
          <div className="provider-services__title-row">
            <h1 className="provider-services__title">My Assigned Services</h1>
            <span className="provider-services__role-badge">PROVIDER PORTAL</span>
          </div>
          <p className="provider-services__subtitle">
            Active clinical consultation capabilities configured for your provider profile at{' '}
            <strong className="provider-services__subtitle-org">{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="provider-services__controls">
          <button
            type="button"
            className="provider-services__btn-refresh"
            onClick={() => fetchProviderServices()}
            disabled={loading}
            aria-label="Refresh service offerings"
          >
            <span aria-hidden="true">{loading ? '⏳' : '🔄'}</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Stats Summary Strip */}
      {providerProfile && (
        <div className="provider-services__stats-strip">
          <div className="provider-services__stat-chip provider-services__stat-chip--primary">
            <span>Total Assigned:</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="provider-services__stat-chip">
            <span>Active Services:</span>
            <strong>{stats.active}</strong>
          </div>
          <div className="provider-services__stat-chip">
            <span>Price Overrides:</span>
            <strong>{stats.customPriceCount}</strong>
          </div>
          <div className="provider-services__stat-chip">
            <span>Duration Overrides:</span>
            <strong>{stats.customDurationCount}</strong>
          </div>
          <div className="provider-services__stat-chip">
            <span>Avg Duration:</span>
            <strong>{stats.avgDuration !== null ? `${stats.avgDuration}m` : '—'}</strong>
          </div>
        </div>
      )}

      {/* Governance Advisory Banner */}
      <div className="provider-services__info-banner" role="note">
        <span className="provider-services__info-banner-icon" aria-hidden="true">ℹ️</span>
        <div className="provider-services__info-banner-content">
          <strong>Manager-Governed Clinical Offerings:</strong> Service assignments, custom appointment durations, and customer price overrides are authoritative configurations established by organization leadership. To add or adjust service capabilities, contact your organization manager.
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="provider-services__error-banner" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="provider-services__error-retry"
            onClick={() => fetchProviderServices()}
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* Search and Filter Toolbar */}
      {rawServices.length > 0 && (
        <div className="provider-services__toolbar">
          <SearchFilterBar
            searchValue={searchInput}
            onSearchChange={(val) => setSearchInput(val)}
            onSearchSubmit={handleSearchSubmit}
            searchPlaceholder="Search assigned services by name, description, or category..."
            searchLabel="Search assigned services"
            filters={[
              {
                id: 'provider-service-override-filter',
                label: 'Filter Offerings',
                value: overrideFilter,
                onChange: (val) => setOverrideFilter(val),
                options: OVERRIDE_FILTER_OPTIONS,
              },
            ]}
            isFiltered={Boolean(appliedSearch || overrideFilter)}
            onClear={handleClearFilters}
            isLoading={loading}
          />

          {(appliedSearch || overrideFilter) && (
            <div className="provider-services__search-feedback">
              <span>
                Showing <strong>{filteredServices.length}</strong> of <strong>{rawServices.length}</strong> assigned services
                {appliedSearch && <> matching &ldquo;{appliedSearch}&rdquo;</>}
                {overrideFilter && <> ({OVERRIDE_FILTER_OPTIONS.find((o) => o.value === overrideFilter)?.label})</>}
              </span>
              <button
                type="button"
                className="provider-services__clear-search-link"
                onClick={handleClearFilters}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Directory Cards & Empty States */}
      {!providerProfile && hasResolvedProfile ? (
        <EmptyState
          icon="🩺"
          title="Provider Profile Not Registered"
          message={`Your account is not registered as an active provider for ${currentOrg.name}. If you believe this is an error, please request an invitation from your organization manager.`}
        />
      ) : rawServices.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No Services Assigned"
          message={`No clinical service offerings have been assigned to your provider profile in ${currentOrg.name} yet. Organization leadership will configure your assigned services.`}
        />
      ) : filteredServices.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No Matching Services"
          message="No assigned services match your current search and filter criteria. Clear your filters to view all assigned offerings."
        />
      ) : (
        <div className="provider-services__grid">
          {filteredServices.map((svc) => (
            <article key={svc.id} className="provider-services__card">
              <div>
                <div className="provider-services__card-header">
                  <span className="provider-services__category-tag">
                    <span aria-hidden="true">{svc.category_icon}</span>
                    <span>{svc.category_name}</span>
                  </span>
                  {svc.parent_service_active === true && (
                    <StatusBadge status="ACTIVE" customLabel="Service Active" />
                  )}
                  {svc.parent_service_active === false && (
                    <StatusBadge status="INACTIVE" customLabel="Service Inactive" />
                  )}
                  {svc.parent_service_active === null && (
                    <StatusBadge status="" customLabel="Status Unknown" />
                  )}
                </div>

                <h2 className="provider-services__card-title">{svc.service_name}</h2>

                <p className="provider-services__card-desc">
                  {svc.description || 'Assigned clinical consultation and patient treatment service.'}
                </p>
              </div>

              <div>
                <div className="provider-services__metrics">
                  <div className="provider-services__metric-block">
                    <span className="provider-services__metric-label">Customer Charge</span>
                    <div className="provider-services__metric-value provider-services__metric-value--price">
                      <span>
                        {svc.effective_customer_charge !== null
                          ? formatCurrency(svc.effective_customer_charge)
                          : 'Fee unavailable'}
                      </span>
                      {svc.has_custom_price && (
                        <span
                          className="provider-services__override-tag"
                          title={
                            svc.base_price !== null
                              ? `Custom override applied (Base standard: ${formatCurrency(svc.base_price)})`
                              : 'Custom override applied (Base standard unavailable)'
                          }
                        >
                          Custom
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="provider-services__metric-block">
                    <span className="provider-services__metric-label">Duration</span>
                    <div className="provider-services__metric-value">
                      <span>
                        {svc.effective_duration !== null
                          ? `${svc.effective_duration}m`
                          : 'Duration unavailable'}
                      </span>
                      {svc.has_custom_duration && (
                        <span
                          className="provider-services__override-tag"
                          title={
                            svc.base_duration_minutes !== null
                              ? `Custom duration applied (Base standard: ${svc.base_duration_minutes}m)`
                              : 'Custom duration applied (Base standard unavailable)'
                          }
                        >
                          Custom
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="provider-services__card-footer">
                  <span className="provider-services__assignment-id">
                    Ref #{svc.id}
                  </span>
                  <span className="provider-services__read-only-badge">
                    <span aria-hidden="true">🔒</span> Manager-Managed
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProviderServicesPage;
