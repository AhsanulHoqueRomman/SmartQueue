import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import organizationService from '../../services/organizationService';
import { toggleFavoriteOrg, isFavoriteOrg, addRecentlyViewedOrg } from '../../utils/recentAndFavorites';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import PublicNavbar from '../../components/PublicNavbar';
import PublicFooter from '../../components/PublicFooter';
import '../../styles/LandingPage.css';
import '../../styles/OrganizationsPage.css';

/* ─── Bookmark Icon ────────────────────────────────────────────────────────── */
export const BookmarkIcon = ({ active = false, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={active ? '#5F7A70' : 'none'}
    stroke={active ? '#5F7A70' : '#78716C'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transition: 'all 0.2s ease', display: 'inline-block', verticalAlign: 'middle' }}
    aria-hidden="true"
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

/* ─── Filter Icon ──────────────────────────────────────────────────────────── */
const FilterIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

/* ─── Search Icon ──────────────────────────────────────────────────────────── */
const SearchIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const INDUSTRY_OPTIONS = [
  { value: 'ALL', label: 'All Industries' },
  { value: 'HEALTHCARE', label: 'Healthcare & Medical' },
  { value: 'LEGAL', label: 'Legal & Advisory' },
  { value: 'BEAUTY', label: 'Beauty & Wellness' },
  { value: 'REPAIR', label: 'Repair & Tech' },
  { value: 'CONSULTING', label: 'Business Consulting' },
  { value: 'OTHER', label: 'Other Services' },
];

export function OrganizationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const industryParam = searchParams.get('industry') || 'ALL';

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState(industryParam);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('name');
  const [favMap, setFavMap] = useState({});

  // Mobile filter drawer state
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterBtnRef = useRef(null);

  useEffect(() => {
    if (industryParam) {
      setSelectedIndustry(industryParam);
    }
  }, [industryParam]);

  // Lock body scroll and handle Escape key when mobile drawer is open
  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileFiltersOpen(false);
        filterBtnRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileFiltersOpen]);

  const fetchOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (sortBy === 'name' || sortBy === '-name' || sortBy === '-created_at') {
        params.ordering = sortBy;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (selectedIndustry !== 'ALL') {
        params.industry_type = selectedIndustry;
      }

      const data = await organizationService.getOrganizations(params);
      const list = Array.isArray(data) ? data : data.results || [];
      setOrgs(list);

      const map = {};
      list.forEach((o) => { map[o.id] = isFavoriteOrg(o.id); });
      setFavMap(map);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load organizations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [searchTerm, selectedIndustry, sortBy]);

  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      const rating = org.rating || 0;
      if (minRating > 0 && rating < minRating) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      return 0;
    });
  }, [orgs, minRating, sortBy]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedIndustry !== 'ALL') count += 1;
    if (minRating > 0) count += 1;
    return count;
  }, [selectedIndustry, minRating]);

  const handleSelectIndustry = (val) => {
    setSelectedIndustry(val);
    if (val === 'ALL') {
      searchParams.delete('industry');
    } else {
      searchParams.set('industry', val);
    }
    setSearchParams(searchParams);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedIndustry('ALL');
    setMinRating(0);
    setSortBy('name');
    setSearchParams({});
  };

  const handleToggleFav = (e, org) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleFavoriteOrg(org);
    setFavMap((prev) => ({ ...prev, [org.id]: newState }));
  };

  const handleViewOrg = (org) => {
    addRecentlyViewedOrg(org);
    navigate(`/organizations/${org.id}`);
  };

  const closeMobileDrawer = () => {
    setMobileFiltersOpen(false);
    filterBtnRef.current?.focus();
  };

  /* ─── Filter Options Content (Shared Desktop & Mobile) ─────────────────── */
  const renderFilterOptions = () => (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.75rem 0', fontFamily: 'Outfit, sans-serif', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          Industry
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {INDUSTRY_OPTIONS.map((item) => {
            const isSelected = selectedIndustry === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => handleSelectIndustry(item.value)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '10px',
                  border: isSelected ? '1px solid var(--lp-accent)' : '1px solid transparent',
                  fontSize: '0.875rem',
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected ? 'var(--lp-bg-subtle)' : 'transparent',
                  color: isSelected ? 'var(--lp-accent)' : 'var(--lp-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{item.label}</span>
                {isSelected && <span style={{ fontWeight: 800, color: 'var(--lp-accent)' }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.75rem 0', fontFamily: 'Outfit, sans-serif', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          Rating
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {[
            { label: 'Any Rating', val: 0 },
            { label: '★ 4.0 & above', val: 4.0 },
            { label: '★ 4.5 & above', val: 4.5 },
          ].map((r) => {
            const isSelected = minRating === r.val;
            return (
              <button
                key={r.val}
                type="button"
                onClick={() => setMinRating(r.val)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '10px',
                  border: isSelected ? '1px solid var(--color-warning)' : '1px solid transparent',
                  fontSize: '0.875rem',
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected ? 'var(--lp-bg-subtle)' : 'transparent',
                  color: isSelected ? 'var(--color-warning)' : 'var(--lp-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{r.label}</span>
                {isSelected && <span style={{ fontWeight: 800, color: 'var(--color-warning)' }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="lp-root" style={{ background: 'var(--lp-bg)', minHeight: '100vh', width: '100%', overflowX: 'hidden', color: 'var(--lp-text)' }}>
      <PublicNavbar activePage="organizations" />

      {/* Main Page Container */}
      <div className="orgs-page-container">
        {/* Page Header */}
        <div className="orgs-page-header">
          <div>
            <h1 className="orgs-title">
              Explore Organizations
            </h1>
            <p className="orgs-subtitle">
              Discover verified organizations across Healthcare, Legal, Beauty, Repair, and Consulting.
            </p>
          </div>

          <div className="orgs-count-badge orgs-desktop-count">
            Showing {filteredOrgs.length} Organizations
          </div>
        </div>

        {/* Search & Action Toolbar */}
        <div className="orgs-toolbar">
          {/* Search Box */}
          <div className="orgs-search-box">
            <span className="orgs-search-icon">
              <SearchIcon size={17} />
            </span>
            <input
              type="text"
              className="orgs-search-input"
              placeholder="Search by organization name, description, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search organizations"
            />
            {searchTerm && (
              <button
                type="button"
                className="orgs-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search text"
              >
                ✕
              </button>
            )}
          </div>

          {/* Toolbar Actions: Filter Trigger + Count + Sort */}
          <div className="orgs-toolbar-actions">
            {/* Mobile Filters Trigger Button */}
            <button
              ref={filterBtnRef}
              type="button"
              className={`orgs-filter-btn ${activeFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setMobileFiltersOpen(true)}
              aria-label={`Open filters panel. ${activeFilterCount} active filters`}
              aria-expanded={mobileFiltersOpen}
            >
              <FilterIcon size={15} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="orgs-filter-badge">{activeFilterCount}</span>
              )}
            </button>

            {/* Mobile-Only Center Organization Count */}
            <span className="orgs-mobile-count" aria-live="polite">
              {filteredOrgs.length} results
            </span>

            {/* Sort Control */}
            <div className="orgs-sort-container">
              <label htmlFor="orgs-sort-select" className="orgs-sort-label">Sort:</label>
              <select
                id="orgs-sort-select"
                className="orgs-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort organizations"
              >
                <option value="name">Name (A-Z)</option>
                <option value="-name">Name (Z-A)</option>
                <option value="rating">Highest Rated</option>
                <option value="-created_at">Newest Added</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {(selectedIndustry !== 'ALL' || minRating > 0 || searchTerm) && (
          <div className="orgs-active-chips-bar" role="region" aria-label="Active filters">
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--lp-text-subtle)' }}>Active:</span>
            {selectedIndustry !== 'ALL' && (
              <span className="orgs-chip" style={{ color: 'var(--lp-accent)' }}>
                Industry: {INDUSTRY_OPTIONS.find(i => i.value === selectedIndustry)?.label || selectedIndustry}
                <button
                  type="button"
                  onClick={() => handleSelectIndustry('ALL')}
                  aria-label="Remove industry filter"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', fontWeight: 700 }}
                >
                  ✕
                </button>
              </span>
            )}
            {minRating > 0 && (
              <span className="orgs-chip" style={{ color: 'var(--color-warning)' }}>
                Rating: ★ {minRating}+
                <button
                  type="button"
                  onClick={() => setMinRating(0)}
                  aria-label="Remove rating filter"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', fontWeight: 700 }}
                >
                  ✕
                </button>
              </span>
            )}
            {searchTerm && (
              <span className="orgs-chip" style={{ color: 'var(--lp-text)' }}>
                "{searchTerm}"
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Remove search filter"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', fontWeight: 700 }}
                >
                  ✕
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={handleClearFilters}
              className="orgs-chip-clear-btn"
            >
              Clear All ✕
            </button>
          </div>
        )}

        {/* Layout: Desktop Sidebar + Cards Grid */}
        <div className="orgs-page-layout">
          {/* Industry & Rating Filter Sidebar (Desktop >= 900px) */}
          <aside className="orgs-desktop-sidebar" aria-label="Desktop organization filters">
            {renderFilterOptions()}
          </aside>

          {/* Cards Grid */}
          <main>
            {loading ? (
              <LoadingState message="Discovering organizations..." />
            ) : error ? (
              <div className="banner banner-danger" style={{ padding: '1rem', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: '12px', color: 'var(--color-error)' }}>{error}</div>
            ) : filteredOrgs.length === 0 ? (
              <EmptyState
                title="No Organizations Found"
                message="No organizations matched your search and filter criteria. Try adjusting your query or clearing active filters."
                actionText="Reset Filters"
                onAction={handleClearFilters}
              />
            ) : (
              <div className="orgs-cards-grid">
                {filteredOrgs.map((org) => {
                  const isFav = favMap[org.id];
                  const industryLabel = org.industry_label || 'Other';

                  return (
                    <article
                      key={org.id}
                      className="orgs-card"
                      onClick={() => handleViewOrg(org)}
                    >
                      <div>
                        {/* Card Header Tag & Favorite */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                          <span className="orgs-card-industry-tag">
                            {industryLabel}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleToggleFav(e, org)}
                            title={isFav ? 'Remove from saved' : 'Save organization'}
                            aria-label={isFav ? `Remove ${org.name} from saved` : `Save ${org.name}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                          >
                            <BookmarkIcon active={isFav} />
                          </button>
                        </div>

                        {/* Title */}
                        <h2 className="orgs-card-name">
                          {org.name}
                        </h2>

                        {/* Rating */}
                        <div className="orgs-card-rating">
                          ★ {org.rating ? org.rating.toFixed(1) : '4.9'} <span style={{ color: 'var(--lp-text-subtle)', fontWeight: 400 }}>({org.reviews_count || 0} reviews)</span>
                        </div>

                        {/* Description / Address */}
                        {org.description && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginBottom: '0.5rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {org.description}
                          </p>
                        )}

                        {org.address && (
                          <p style={{ fontSize: '0.825rem', color: 'var(--lp-text-subtle)', marginBottom: '0.75rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            📍 {org.address}
                          </p>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', gap: '0.5rem' }}>
                        <span className="orgs-card-meta">
                          ⚡ {org.services_count || 0} Services • 🩺 {org.providers_count || 0} Providers
                        </span>
                        <button
                          type="button"
                          className="orgs-card-cta-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOrg(org);
                          }}
                        >
                          View Profile
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      <PublicFooter />

      {/* Mobile Collapsible Filter Drawer / Bottom Sheet */}
      {mobileFiltersOpen && (
        <div
          className="orgs-drawer-backdrop"
          onClick={closeMobileDrawer}
          role="presentation"
        >
          <div
            className="orgs-drawer-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="orgs-drawer-heading"
          >
            {/* Drawer Header */}
            <div className="orgs-drawer-header">
              <div className="orgs-drawer-title-group">
                <h2 id="orgs-drawer-heading" className="orgs-drawer-title">
                  Filters
                </h2>
                {activeFilterCount > 0 && (
                  <span className="orgs-filter-badge">{activeFilterCount}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.25rem 0.5rem' }}
                  >
                    Reset All
                  </button>
                )}
                <button
                  type="button"
                  className="orgs-drawer-close-btn"
                  onClick={closeMobileDrawer}
                  aria-label="Close filters panel"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="orgs-drawer-body">
              {renderFilterOptions()}
            </div>

            {/* Drawer Footer CTA */}
            <div className="orgs-drawer-footer">
              <button
                type="button"
                className="orgs-drawer-apply-btn"
                onClick={closeMobileDrawer}
              >
                Show {filteredOrgs.length} Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizationsPage;
