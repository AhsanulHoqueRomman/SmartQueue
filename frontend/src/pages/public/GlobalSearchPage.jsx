import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import '../../styles/LandingPage.css';

/* ─── Tiny SVG Icon Components ─────────────────────────────────────────── */
const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const POPULAR_SEARCH_TAGS = [
  'Dhaka Care Clinic',
  'Pearl Dental',
  'Apex Legal',
  'Medinova Diagnostic',
  'General Consultation',
  'Dental Scaling',
  'Haircut & Spa',
  'Blood Test & Scans',
];

const POPULAR_SERVICES = [
  {
    name: 'General Medical Consultation',
    category: 'Healthcare',
    icon: '🩺',
    duration: '20 min',
    query: 'Care',
    desc: 'Comprehensive medical assessment and specialist consultation.'
  },
  {
    name: 'Teeth Scaling & Oral Checkup',
    category: 'Dental Care',
    icon: '🦷',
    duration: '30 min',
    query: 'Dental',
    desc: 'Professional plaque removal, teeth whitening, and hygiene inspection.'
  },
  {
    name: 'Full Pathology & MRI Scan',
    category: 'Diagnostic',
    icon: '🔬',
    duration: '45 min',
    query: 'Diagnostic',
    desc: 'Advanced lab testing, blood work panels, and diagnostic imaging.'
  },
  {
    name: 'Executive Haircut & Beauty Spa',
    category: 'Salon & Beauty',
    icon: '💇‍♀️',
    duration: '40 min',
    query: 'Salon',
    desc: 'Luxury hair styling, facial care, and grooming treatments.'
  },
  {
    name: 'Tax Audit & Legal Vetting',
    category: 'Consulting',
    icon: '👔',
    duration: '60 min',
    query: 'Legal',
    desc: 'Business agreement vetting, tax planning, and corporate legal advice.'
  },
];

export function GlobalSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryParam = searchParams.get('q') || '';

  const [query, setQuery] = useState(queryParam);
  const [organizations, setOrganizations] = useState([]);
  const [popularOrgs, setPopularOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Fetch initial popular organizations for quick discovery
  useEffect(() => {
    let isMounted = true;
    organizationService.getOrganizations({ page_size: 6 })
      .then(res => {
        if (!isMounted) return;
        const list = Array.isArray(res) ? res : (res.results || []);
        setPopularOrgs(list.slice(0, 6));
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const handleSearch = async (searchTerm) => {
    if (!searchTerm.trim()) {
      setOrganizations([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const res = await organizationService.getOrganizations({ search: searchTerm.trim() });
      const list = Array.isArray(res) ? res : res.results || [];
      setOrganizations(list);
    } catch (err) {
      console.error('Global search error:', err);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryParam) {
      setQuery(queryParam);
      handleSearch(queryParam);
    } else {
      setSearched(false);
      setOrganizations([]);
    }
  }, [queryParam]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
      handleSearch(query.trim());
    } else {
      setSearchParams({});
      setSearched(false);
      setOrganizations([]);
    }
  };

  const handleTagClick = (tag) => {
    setQuery(tag);
    setSearchParams({ q: tag });
    handleSearch(tag);
  };

  return (
    <div className="lp-root" style={{ background: '#FAF8F3', minHeight: '100vh' }}>
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
            <Link to="/organizations" className="lp-nav-link">Organizations</Link>
            <Link to="/search" className="lp-nav-link" style={{ fontWeight: 700, color: '#5F7A70' }}>Search</Link>
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
      <div className="container animate-page-entrance" style={{ padding: '5.5rem 1.5rem 3rem 1.5rem', maxWidth: '1150px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span style={{ color: '#5F7A70', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Instant Network Search
          </span>
          <h1 style={{ fontSize: '2.2rem', fontFamily: 'Cinzel, serif', color: '#211C19', marginTop: '0.25rem', marginBottom: '0.5rem' }}>
            Global SmartQueue Search
          </h1>
          <p style={{ color: '#78716C', fontSize: '0.975rem', maxWidth: '640px', margin: '0 auto' }}>
            Find verified clinics, specialized services, doctors, and diagnostic centers across the SmartQueue network.
          </p>

          {/* Search Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              maxWidth: '680px',
              margin: '1.75rem auto 1rem auto',
              background: '#FFFFFF',
              borderRadius: '9999px',
              padding: '0.4rem 0.4rem 0.4rem 1.25rem',
              boxShadow: '0 12px 32px rgba(47, 37, 32, 0.08)',
              border: '1px solid #E6E1D9',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#78716C', display: 'flex', alignItems: 'center' }}><IconSearch /></span>
            <input
              type="text"
              placeholder="Search by clinic name, service (e.g. Dental, Consultation), or category..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '0.65rem 0.75rem', fontSize: '0.95rem', color: '#211C19' }}
            />
            <button
              type="submit"
              style={{
                background: '#5F7A70',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.75rem 1.75rem',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(95, 122, 112, 0.25)'
              }}
            >
              Search
            </button>
          </form>

          {/* Popular Search Suggestion Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', maxWidth: '750px', margin: '0 auto' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#78716C', alignSelf: 'center', marginRight: '0.25rem' }}>
              Popular:
            </span>
            {POPULAR_SEARCH_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagClick(tag)}
                style={{
                  background: query.toLowerCase() === tag.toLowerCase() ? '#5F7A70' : '#FFFFFF',
                  color: query.toLowerCase() === tag.toLowerCase() ? '#FFFFFF' : '#211C19',
                  border: '1px solid #E6E1D9',
                  borderRadius: '9999px',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Results / Default State */}
        {loading ? (
          <LoadingState message="Searching organizations and services..." />
        ) : searched && organizations.length === 0 ? (
          <EmptyState
            title="No Matching Clinics Found"
            message={`No organizations or services matched "${queryParam}". Try adjusting your query or exploring our popular clinics below.`}
            actionText="Browse All Organizations"
            onAction={() => navigate('/organizations')}
          />
        ) : searched && organizations.length > 0 ? (
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Search Results ({organizations.length} Clinic{organizations.length > 1 ? 's' : ''} Found)
              </div>
              <button
                onClick={() => {
                  setQuery('');
                  setSearchParams({});
                  setSearched(false);
                  setOrganizations([]);
                }}
                style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Clear Search ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {organizations.map((org) => {
                const rating = org.rating ? parseFloat(org.rating).toFixed(1) : '4.9';
                const reviewsCount = org.reviews_count || 12;
                const servicesCount = org.services_count || 4;

                return (
                  <div
                    key={org.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1px solid #E6E1D9',
                      padding: '1.5rem',
                      boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      justify: 'space-between',
                      transition: 'transform 0.2s ease, boxShadow 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 10px 24px rgba(47, 37, 32, 0.08)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.04)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <span style={{ background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                          {org.category || 'HEALTHCARE'}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#B06D2E' }}>
                          ★ {rating} <span style={{ color: '#78716C', fontWeight: 400, fontSize: '0.75rem' }}>({reviewsCount})</span>
                        </span>
                      </div>

                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem', fontFamily: 'Outfit, sans-serif' }}>
                        {org.name}
                      </h3>

                      <p style={{ color: '#78716C', fontSize: '0.85rem', lineHeight: 1.4, margin: '0 0 1rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        📍 {org.address || 'Verified partner facility with online booking.'}
                      </p>
                    </div>

                    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600 }}>
                        ⚡ {servicesCount} Services
                      </span>
                      <Link
                        to={`/organizations/${org.id}`}
                        style={{
                          padding: '0.45rem 0.9rem',
                          background: '#5F7A70',
                          color: '#FFFFFF',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          textDecoration: 'none',
                        }}
                      >
                        View Profile →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Default Pre-Populated View when no search active */
          <div className="animate-page-entrance">
            {/* Section 1: Popular Searched Clinics */}
            <div style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <span style={{ color: '#5F7A70', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                    Top Destinations
                  </span>
                  <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#211C19', margin: 0, fontFamily: 'Cinzel, serif' }}>
                    🏥 Popular Care Providers & Clinics
                  </h2>
                </div>
                <Link to="/organizations" style={{ color: '#5F7A70', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>
                  Browse All 28 Clinics →
                </Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {popularOrgs.map((org) => {
                  const rating = org.rating ? parseFloat(org.rating).toFixed(1) : '4.9';
                  const reviewsCount = org.reviews_count || 12;

                  return (
                    <div
                      key={org.id}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E6E1D9',
                        padding: '1.5rem',
                        boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        justify: 'space-between',
                        transition: 'transform 0.2s ease, boxShadow 0.2s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 10px 24px rgba(47, 37, 32, 0.08)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.04)';
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <span style={{ background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                            {org.category || 'HEALTHCARE'}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#B06D2E' }}>
                            ★ {rating} <span style={{ color: '#78716C', fontWeight: 400, fontSize: '0.75rem' }}>({reviewsCount})</span>
                          </span>
                        </div>

                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem', fontFamily: 'Outfit, sans-serif' }}>
                          {org.name}
                        </h3>

                        <p style={{ color: '#78716C', fontSize: '0.85rem', lineHeight: 1.4, margin: '0 0 1rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          📍 {org.address || 'Verified medical & care facility.'}
                        </p>
                      </div>

                      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600 }}>
                          ⚡ {org.services_count || 4} Services
                        </span>
                        <Link
                          to={`/organizations/${org.id}`}
                          style={{
                            padding: '0.45rem 0.9rem',
                            background: '#5F7A70',
                            color: '#FFFFFF',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            textDecoration: 'none',
                          }}
                        >
                          View Profile →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Frequently Searched Services & Catalog */}
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ color: '#5F7A70', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                  Frequently Requested
                </span>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#211C19', margin: 0, fontFamily: 'Cinzel, serif' }}>
                  ⚡ Popular Services & Procedures
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {POPULAR_SERVICES.map((svc) => (
                  <div
                    key={svc.name}
                    onClick={() => handleTagClick(svc.query)}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1px solid #E6E1D9',
                      padding: '1.5rem',
                      boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justify: 'space-between',
                      transition: 'transform 0.2s ease, boxShadow 0.2s ease, border-color 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 10px 24px rgba(47, 37, 32, 0.08)';
                      e.currentTarget.style.borderColor = '#5F7A70';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.04)';
                      e.currentTarget.style.borderColor = '#E6E1D9';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.8rem' }}>{svc.icon}</span>
                        <span style={{ background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                          {svc.category}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem', fontFamily: 'Outfit, sans-serif' }}>
                        {svc.name}
                      </h3>

                      <p style={{ color: '#78716C', fontSize: '0.85rem', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
                        {svc.desc}
                      </p>
                    </div>

                    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 600 }}>
                        ⏱️ Est. {svc.duration}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 700 }}>
                        Search Clinics →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GlobalSearchPage;
