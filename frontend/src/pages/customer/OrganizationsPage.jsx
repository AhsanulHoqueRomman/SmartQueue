import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import organizationService from '../../services/organizationService';
import { toggleFavoriteOrg, isFavoriteOrg, addRecentlyViewedOrg } from '../../utils/recentAndFavorites';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import PublicNavbar from '../../components/PublicNavbar';
import '../../styles/LandingPage.css';

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
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
  const { user } = useAuth();
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

  useEffect(() => {
    if (industryParam) {
      setSelectedIndustry(industryParam);
    }
  }, [industryParam]);

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

  return (
    <div className="lp-root" style={{ background: '#FAF8F3', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      <PublicNavbar activePage="organizations" />

      {/* Main Page Container */}
      <div style={{ padding: '2rem 1rem 3rem 1rem', maxWidth: '1280px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: '#211C19', fontFamily: 'Cinzel, serif', marginBottom: '0.35rem' }}>
              Explore Organizations
            </h1>
            <p style={{ color: '#78716C', fontSize: '0.95rem', margin: 0 }}>
              Discover verified organizations across Healthcare, Legal, Beauty, Repair, and Consulting.
            </p>
          </div>

          <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', padding: '0.5rem 0.9rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, color: '#5F7A70' }}>
            Showing {filteredOrgs.length} Organizations
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {(selectedIndustry !== 'ALL' || minRating > 0 || searchTerm) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#78716C' }}>Active Filters:</span>
            {selectedIndustry !== 'ALL' && (
              <span style={{ background: '#F5EFE6', border: '1px solid #E6E1D9', color: '#5F7A70', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
                Industry: {INDUSTRY_OPTIONS.find(i => i.value === selectedIndustry)?.label || selectedIndustry}
              </span>
            )}
            {minRating > 0 && (
              <span style={{ background: '#F5EFE6', border: '1px solid #E6E1D9', color: '#B06D2E', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
                Rating: ★ {minRating}+
              </span>
            )}
            {searchTerm && (
              <span style={{ background: '#F5EFE6', border: '1px solid #E6E1D9', color: '#211C19', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
                Search: "{searchTerm}"
              </span>
            )}
            <button
              onClick={handleClearFilters}
              style={{ background: 'none', border: 'none', color: '#B4534B', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginLeft: '0.5rem' }}
            >
              Clear All ✕
            </button>
          </div>
        )}

        {/* Search & Sort Toolbar */}
        <div style={{ padding: '1rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', boxShadow: '0 2px 8px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#78716C', fontSize: '1rem' }}>
                🔍
              </span>
              <input
                type="text"
                style={{ width: '100%', padding: '0.75rem 0.85rem 0.75rem 2.5rem', borderRadius: '10px', border: '1px solid #E6E1D9', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}
                placeholder="Search by organization name, description, address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#78716C' }}>Sort:</label>
              <select
                style={{ padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Name (A-Z)</option>
                <option value="-name">Name (Z-A)</option>
                <option value="rating">Highest Rated</option>
                <option value="-created_at">Newest Added</option>
              </select>
            </div>
          </div>
        </div>

        {/* Layout: Sidebar + Grid */}
        <div className="orgs-page-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.5rem' }}>
          <style>{`
            @media (min-width: 900px) {
              .orgs-page-layout {
                grid-template-columns: 260px minmax(0, 1fr) !important;
              }
            }
          `}</style>

          {/* Industry Filter Sidebar */}
          <aside style={{ backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#211C19', margin: '0 0 1rem 0', fontFamily: 'Outfit, sans-serif' }}>
              Industry Filter
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
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
                      border: 'none',
                      fontSize: '0.875rem',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? '#FAF8F3' : 'transparent',
                      color: isSelected ? '#5F7A70' : '#211C19',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{item.label}</span>
                    {isSelected && <span style={{ fontWeight: 800, color: '#5F7A70' }}>✓</span>}
                  </button>
                );
              })}
            </div>

            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#211C19', margin: '0 0 0.75rem 0', fontFamily: 'Outfit, sans-serif' }}>
              Rating Filter
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {[
                { label: 'Any Rating', val: 0 },
                { label: '★ 4.0 & above', val: 4.0 },
                { label: '★ 4.5 & above', val: 4.5 },
              ].map((r) => (
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
                    border: 'none',
                    fontSize: '0.875rem',
                    fontWeight: minRating === r.val ? 700 : 500,
                    background: minRating === r.val ? '#FAF8F3' : 'transparent',
                    color: minRating === r.val ? '#B06D2E' : '#211C19',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{r.label}</span>
                  {minRating === r.val && <span style={{ fontWeight: 800, color: '#B06D2E' }}>✓</span>}
                </button>
              ))}
            </div>
          </aside>

          {/* Cards Grid */}
          <main>
            {loading ? (
              <LoadingState message="Discovering organizations..." />
            ) : error ? (
              <div className="banner banner-danger" style={{ padding: '1rem', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '12px', color: '#B4534B' }}>{error}</div>
            ) : filteredOrgs.length === 0 ? (
              <EmptyState
                title="No Organizations Found"
                message="No organizations matched your search and filter criteria. Try adjusting your query or clearing active filters."
                actionText="Reset Filters"
                onAction={handleClearFilters}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.25rem' }}>
                {filteredOrgs.map((org) => {
                  const isFav = favMap[org.id];
                  const industryLabel = org.industry_label || 'Other';

                  return (
                    <div
                      key={org.id}
                      onClick={() => handleViewOrg(org)}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E6E1D9',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease, boxShadow 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 10px 24px rgba(47, 37, 32, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.04)';
                      }}
                    >
                      <div>
                        {/* Card Header Tag & Favorite */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px', background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9' }}>
                            {industryLabel}
                          </span>
                          <button
                            onClick={(e) => handleToggleFav(e, org)}
                            title={isFav ? 'Remove from saved' : 'Save organization'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                          >
                            <BookmarkIcon active={isFav} />
                          </button>
                        </div>

                        {/* Title */}
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem', fontFamily: 'Outfit, sans-serif' }}>
                          {org.name}
                        </h3>

                        {/* Rating */}
                        <div style={{ fontSize: '0.85rem', color: '#B06D2E', fontWeight: 700, marginBottom: '0.5rem' }}>
                          ★ {org.rating ? org.rating.toFixed(1) : '4.9'} <span style={{ color: '#78716C', fontWeight: 400 }}>({org.reviews_count || 0} reviews)</span>
                        </div>

                        {/* Description / Address */}
                        {org.description && (
                          <p style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '0.5rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {org.description}
                          </p>
                        )}

                        {org.address && (
                          <p style={{ fontSize: '0.825rem', color: '#78716C', marginBottom: '0.75rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            📍 {org.address}
                          </p>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600 }}>
                          ⚡ {org.services_count || 0} Services • 🩺 {org.providers_count || 0} Providers
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOrg(org);
                          }}
                          style={{ padding: '0.45rem 0.85rem', background: '#2F2520', color: '#FAF8F3', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.825rem', cursor: 'pointer' }}
                        >
                          View Profile →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default OrganizationsPage;
