import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import organizationService from '../../services/organizationService';
import { toggleFavoriteOrg, isFavoriteOrg, addRecentlyViewedOrg } from '../../utils/recentAndFavorites';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import '../../styles/LandingPage.css';

/* ─── Tiny SVG Icon Components ─────────────────────────────────────────── */
const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

/* ─── LinkedIn / Instagram Ribbon Bookmark Icon ─────────────────────────── */
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

export function OrganizationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || 'ALL';

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('name');
  const [favMap, setFavMap] = useState({});

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
  }, [categoryParam]);

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
  }, [searchTerm, sortBy]);

  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      const cat = org.category || 'Healthcare';
      if (selectedCategory !== 'ALL' && !cat.toLowerCase().includes(selectedCategory.toLowerCase()) && !selectedCategory.toLowerCase().includes(cat.toLowerCase())) {
        return false;
      }
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
  }, [orgs, selectedCategory, minRating, sortBy]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('ALL');
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
    <div className="lp-root" style={{ background: '#FAF8F3', minHeight: '100vh', overflow: 'visible' }}>
      {/* ── Top Navigation Header ────────────────────────────────────────── */}
      <header className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <span className="lp-brand-mark">
              <IconZap />
            </span>
            <span className="lp-brand-name">SmartQueue</span>
          </Link>

          <nav className="lp-nav-links">
            <Link to="/organizations" className="lp-nav-link" style={{ fontWeight: 700, color: '#5F7A70' }}>Organizations</Link>
            <Link to="/search" className="lp-nav-link">Search</Link>
            <Link to="/#how-it-works" className="lp-nav-link">How it works</Link>
            <Link to="/#why-smartqueue" className="lp-nav-link">Why SmartQueue</Link>
          </nav>

          <div className="lp-nav-cta">
            {user ? (
              <Link to="/dashboard" className="lp-btn-primary">
                Dashboard →
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-btn-ghost">Sign in</Link>
                <Link to="/register" className="lp-btn-primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Container */}
      <div className="container animate-page-entrance" style={{ padding: '5.5rem 1.5rem 2rem 1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: '#211C19', fontFamily: 'Cinzel, serif', marginBottom: '0.25rem' }}>
              Explore Organizations
            </h1>
            <p style={{ color: '#78716C', fontSize: '0.95rem', margin: 0 }}>
              Discover verified clinics, browse active services, and book appointments instantly.
            </p>
          </div>

          <div style={{ background: '#FAF8F3', border: '1px solid #E6E1D9', padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#5F7A70' }}>
            Showing {filteredOrgs.length} Clinics
          </div>
        </div>

        {/* Filter Chips Bar */}
        {(selectedCategory !== 'ALL' || minRating > 0 || searchTerm) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#78716C' }}>Active Filters:</span>
            {selectedCategory !== 'ALL' && (
              <span style={{ background: '#F5EFE6', border: '1px solid #E6E1D9', color: '#5F7A70', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
                Category: {selectedCategory}
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
              style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginLeft: '0.5rem' }}
            >
              Clear All ✕
            </button>
          </div>
        )}

        {/* Top Search & Controls Bar */}
        <div style={{ padding: '1rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#78716C', fontSize: '1rem' }}>
                🔍
              </span>
              <input
                type="text"
                style={{ width: '100%', padding: '0.75rem 0.85rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid #E6E1D9', outline: 'none', fontSize: '0.9rem' }}
                placeholder="Search by clinic name, address, or service..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#78716C' }}>Sort:</label>
              <select
                style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.85rem', outline: 'none' }}
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

        {/* Main Grid: Fixed/Sticky Left Sidebar + 2-Column Right Organizations Grid */}
        <div className="orgs-page-layout">
          {/* Filter Sidebar (Far Left) */}
          <aside className="orgs-page-sidebar">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#211C19', margin: '0 0 1rem 0', fontFamily: 'Outfit, sans-serif' }}>
              Categories
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
              {['ALL', 'Healthcare', 'Salon & Beauty', 'Dental Care', 'Diagnostic', 'Consulting'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '10px',
                    border: 'none',
                    fontSize: '0.875rem',
                    fontWeight: selectedCategory === cat ? 700 : 500,
                    background: selectedCategory === cat ? '#FAF8F3' : 'transparent',
                    color: selectedCategory === cat ? '#5F7A70' : '#211C19',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{cat === 'ALL' ? 'All Categories' : cat}</span>
                  {selectedCategory === cat && <span style={{ fontWeight: 800, color: '#5F7A70' }}>✓</span>}
                </button>
              ))}
            </div>

            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#211C19', margin: '0 0 1rem 0', fontFamily: 'Outfit, sans-serif' }}>
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
                    justify: 'space-between',
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

          {/* Organizations 2-Cards-Per-Row Grid */}
          <main className="orgs-page-main">
            {loading ? (
              <LoadingState message="Discovering organizations..." />
            ) : error ? (
              <div className="banner banner-danger">{error}</div>
            ) : filteredOrgs.length === 0 ? (
              <EmptyState
                title="No Organizations Found"
                message="No organizations matched your search and filter criteria. Try adjusting your search query or clearing active filters."
                actionText="Reset Filters"
                onAction={handleClearFilters}
              />
            ) : (
              <div className="orgs-page-cards-grid">
                {filteredOrgs.map((org) => {
                  const category = org.category || 'Healthcare';
                  const isFav = favMap[org.id];

                  return (
                    <div
                      key={org.id}
                      onClick={() => handleViewOrg(org)}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E6E1D9',
                        padding: '1.5rem',
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px', background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9' }}>
                            {category}
                          </span>
                          <button
                            onClick={(e) => handleToggleFav(e, org)}
                            title={isFav ? 'Remove from saved' : 'Save clinic'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                          >
                            <BookmarkIcon active={isFav} />
                          </button>
                        </div>

                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem' }}>
                          {org.name}
                        </h3>

                        <div style={{ fontSize: '0.85rem', color: '#B06D2E', fontWeight: 700, marginBottom: '0.65rem' }}>
                          ★ {org.rating ? org.rating.toFixed(1) : '4.9'} <span style={{ color: '#78716C', fontWeight: 400 }}>({org.reviews_count || 12} reviews)</span>
                        </div>

                        {org.address && (
                          <p style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '0.75rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            📍 {org.address}
                          </p>
                        )}
                      </div>

                      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600 }}>
                          ⚡ {org.services_count || 4} Services
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOrg(org);
                          }}
                          style={{ padding: '0.4rem 0.85rem', background: '#5F7A70', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
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

