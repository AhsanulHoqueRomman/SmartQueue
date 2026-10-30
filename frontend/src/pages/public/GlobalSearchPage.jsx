import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import PublicNavbar from '../../components/PublicNavbar';
import PublicFooter from '../../components/PublicFooter';
import '../../styles/LandingPage.css';
import '../../styles/GlobalSearchPage.css';

/* ─── Tiny SVG Icon Components ─────────────────────────────────────────── */
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }} aria-hidden="true">
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
    icon: '🩺',
    category: 'Healthcare',
    duration: '20 min',
    query: 'Consultation',
    desc: 'Comprehensive medical assessment and specialist consultation.'
  },
  {
    name: 'Teeth Scaling & Oral Checkup',
    icon: '🦷',
    category: 'Dental Care',
    duration: '30 min',
    query: 'Dental',
    desc: 'Professional plaque removal, teeth whitening, and hygiene inspection.'
  },
  {
    name: 'Full Pathology & MRI Scan',
    icon: '🔬',
    category: 'Diagnostic',
    duration: '45 min',
    query: 'Diagnostic',
    desc: 'Advanced lab testing, blood work panels, and diagnostic imaging.'
  },
  {
    name: 'Executive Haircut & Beauty Spa',
    icon: '💇',
    category: 'Salon & Beauty',
    duration: '40 min',
    query: 'Beauty',
    desc: 'Luxury hair styling, facial care, and grooming treatments.'
  },
  {
    name: 'Tax Audit & Legal Vetting',
    icon: '👔',
    category: 'Consulting',
    duration: '60 min',
    query: 'Legal',
    desc: 'Business agreement vetting, tax planning, and corporate legal advice.'
  },
];

export function GlobalSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get('q') || '';

  const [query, setQuery] = useState(queryParam);
  const [organizations, setOrganizations] = useState([]);
  const [popularOrgs, setPopularOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
    <div className="lp-root" style={{ background: 'var(--lp-bg)', minHeight: '100vh', color: 'var(--lp-text)' }}>
      {/* ── Top Navigation Header ────────────────────────────────────────── */}
      <PublicNavbar activePage="search" />

      {/* Main Page Container */}
      <div className="search-page-container animate-page-entrance">
        <div className="search-hero-header">
          <span className="search-hero-eyebrow">
            Instant Network Search
          </span>
          <h1 className="search-hero-title">
            Global QueueTurn Search
          </h1>
          <p className="search-hero-desc">
            Find verified clinics, specialized services, doctors, and diagnostic centers across the QueueTurn network.
          </p>

          {/* Search Form */}
          <form
            onSubmit={handleSubmit}
            className="search-form-pill"
          >
            <span className="search-form-icon"><IconSearch /></span>
            <input
              type="text"
              placeholder="Search clinics, doctors, services..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-form-input"
              aria-label="Search clinics, doctors and services"
            />
            <button
              type="submit"
              className="search-form-submit-btn"
            >
              Search
            </button>
          </form>

          {/* Popular Search Suggestion Chips */}
          <div className="search-popular-tags">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--lp-text-subtle)', alignSelf: 'center', marginRight: '0.2rem' }}>
              Popular:
            </span>
            {POPULAR_SEARCH_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagClick(tag)}
                className="search-tag-chip"
                style={{
                  background: query.toLowerCase() === tag.toLowerCase() ? 'var(--lp-btn-primary-bg)' : 'var(--lp-surface)',
                  color: query.toLowerCase() === tag.toLowerCase() ? 'var(--lp-btn-primary-text)' : 'var(--lp-text)',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Search Results ({organizations.length} Clinic{organizations.length > 1 ? 's' : ''} Found)
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSearchParams({});
                  setSearched(false);
                  setOrganizations([]);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--color-error)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '0.2rem 0.4rem' }}
              >
                Clear Search ✕
              </button>
            </div>

            <div className="search-orgs-grid">
              {organizations.map((org) => {
                const rating = org.rating ? parseFloat(org.rating).toFixed(1) : '4.9';
                const reviewsCount = org.reviews_count || 12;
                const servicesCount = org.services_count || 4;

                return (
                  <article
                    key={org.id}
                    style={{
                      background: 'var(--lp-surface)',
                      borderRadius: '16px',
                      border: '1px solid var(--lp-border)',
                      padding: '1.25rem',
                      boxShadow: '0 4px 16px var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.2s ease, boxShadow 0.2s ease',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <span style={{ background: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: '1px solid var(--lp-border)', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                          {org.category || 'HEALTHCARE'}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                          ★ {rating} <span style={{ color: 'var(--lp-text-subtle)', fontWeight: 400, fontSize: '0.75rem' }}>({reviewsCount})</span>
                        </span>
                      </div>

                      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.35rem 0', fontFamily: 'Outfit, sans-serif' }}>
                        {org.name}
                      </h2>

                      <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.825rem', lineHeight: 1.4, margin: '0 0 1rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        📍 {org.address || 'Verified partner facility with online booking.'}
                      </p>
                    </div>

                    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--lp-sage)', fontWeight: 600 }}>
                        ⚡ {servicesCount} Services
                      </span>
                      <Link
                        to={`/organizations/${org.id}`}
                        style={{
                          padding: '0.45rem 0.85rem',
                          background: 'var(--lp-btn-primary-bg)',
                          color: 'var(--lp-btn-primary-text)',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        View Profile →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          /* Default Pre-Populated View when no search active */
          <div className="animate-page-entrance">
            {/* Section 1: Popular Searched Clinics */}
            <div style={{ marginBottom: '2.5rem' }}>
              <div className="search-section-header">
                <div>
                  <span style={{ color: 'var(--lp-accent)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                    Top Destinations
                  </span>
                  <h2 className="search-section-title">
                    🏥 Popular Care Providers & Clinics
                  </h2>
                </div>
                <Link to="/organizations" style={{ color: 'var(--lp-accent)', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Browse All 28 Clinics →
                </Link>
              </div>

              <div className="search-orgs-grid">
                {popularOrgs.map((org) => {
                  const rating = org.rating ? parseFloat(org.rating).toFixed(1) : '4.9';
                  const reviewsCount = org.reviews_count || 12;

                  return (
                    <article
                      key={org.id}
                      style={{
                        background: 'var(--lp-surface)',
                        borderRadius: '16px',
                        border: '1px solid var(--lp-border)',
                        padding: '1.25rem',
                        boxShadow: '0 4px 16px var(--shadow-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'transform 0.2s ease, boxShadow 0.2s ease',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <span style={{ background: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: '1px solid var(--lp-border)', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                            {org.category || 'HEALTHCARE'}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                            ★ {rating} <span style={{ color: 'var(--lp-text-subtle)', fontWeight: 400, fontSize: '0.75rem' }}>({reviewsCount})</span>
                          </span>
                        </div>

                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.35rem 0', fontFamily: 'Outfit, sans-serif' }}>
                          {org.name}
                        </h3>

                        <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.825rem', lineHeight: 1.4, margin: '0 0 1rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          📍 {org.address || 'Verified medical & care facility.'}
                        </p>
                      </div>

                      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--lp-sage)', fontWeight: 600 }}>
                          ⚡ {org.services_count || 4} Services
                        </span>
                        <Link
                          to={`/organizations/${org.id}`}
                          style={{
                            padding: '0.45rem 0.85rem',
                            background: 'var(--lp-btn-primary-bg)',
                            color: 'var(--lp-btn-primary-text)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          View Profile →
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Frequently Searched Services & Catalog */}
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ color: 'var(--lp-accent)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                  Frequently Requested
                </span>
                <h2 className="search-section-title">
                  ⚡ Popular Services & Procedures
                </h2>
              </div>

              <div className="search-services-grid">
                {POPULAR_SERVICES.map((svc) => (
                  <article
                    key={svc.name}
                    onClick={() => handleTagClick(svc.query)}
                    style={{
                      background: 'var(--lp-surface)',
                      borderRadius: '16px',
                      border: '1px solid var(--lp-border)',
                      padding: '1.25rem',
                      boxShadow: '0 4px 16px var(--shadow-sm)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.2s ease, boxShadow 0.2s ease, border-color 0.2s ease',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.75rem' }}>{svc.icon}</span>
                        <span style={{ background: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: '1px solid var(--lp-border)', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                          {svc.category}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.35rem 0', fontFamily: 'Outfit, sans-serif' }}>
                        {svc.name}
                      </h3>

                      <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.825rem', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
                        {svc.desc}
                      </p>
                    </div>

                    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', fontWeight: 600 }}>
                        ⏱ {svc.duration}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--lp-accent)', fontWeight: 600 }}>
                        Search Clinics →
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <PublicFooter />
    </div>
  );
}

export default GlobalSearchPage;
