import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/LandingPage.css';
import CustomerHomeSection from '../components/CustomerHomeSection';
import InstantAvailabilityFinder from '../components/InstantAvailabilityFinder';
import '../styles/LandingPolish.css';
import { CategoryDiscoverySection, PopularOrganizationsSection } from '../components/LandingDiscovery';
import { publicOrganizations } from '../services/discoveryService';
import { useTenant } from '../contexts/TenantContext';
import { PublicNavbar } from '../components/PublicNavbar';
import HeroProductStory from '../components/HeroProductStory';
import { HowSmartQueueWorks, WhySmartQueue, ForOrganizations } from '../components/LandingPhaseThree';
import '../styles/LandingPhaseOne.css';
import { CommunityExperiences, ClosingCallToAction, ProductionFooter } from '../components/LandingPhaseFour';

/* ─── Tiny SVG Icon Components ─────────────────────────────────────────── */
const IconArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [heroSearchQuery, setHeroSearchQuery] = useState('');
  const [allOrgs, setAllOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsError, setOrgsError] = useState(false);
  const { effectiveRole } = useTenant();
  useEffect(() => {
    let current = true;
    publicOrganizations().then(list => { if (current) setAllOrgs(list); })
      .catch(() => { if (current) setOrgsError(true); })
      .finally(() => { if (current) setOrgsLoading(false); });
    return () => { current = false; };
  }, []);

  const pendingAnchor = useRef(location.state?.landingAnchor || null);
  const consumedAnchor = useRef(false);
  const initialHash = useRef(location.hash);
  const initializedScroll = useRef(false);
  useLayoutEffect(() => {
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    if (!initializedScroll.current) {
      initializedScroll.current = true;
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (initialHash.current) navigate('/', { replace: true, state: null });
    }
    return () => { window.history.scrollRestoration = restoration; };
  }, [navigate]);
  useEffect(() => {
    if (orgsLoading || !pendingAnchor.current || consumedAnchor.current) return;
    consumedAnchor.current = true;
    const anchor = pendingAnchor.current;
    navigate('/', { replace: true, state: null });
    document.querySelector(anchor)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    });
  }, [orgsLoading, navigate]);

  const handleHeroSearch = (e) => {
    e.preventDefault();
    if (heroSearchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(heroSearchQuery.trim())}`);
    } else {
      navigate('/organizations');
    }
  };

  return (
    <div className="lp-root">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <PublicNavbar activePage="" />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="lp-product-hero" aria-labelledby="landing-hero-title">
        <div className="lp-product-hero-inner">
          <div className="lp-product-hero-copy">
            <div className="lp-product-eyebrow"><span aria-hidden="true" />MULTI-SERVICE APPOINTMENT &amp; QUEUE PLATFORM</div>
            <h1 id="landing-hero-title">Book a serial.<br /><span>Arrive smarter.<br />Wait less.</span></h1>
            <p>Discover trusted service providers, reserve your queue serial, and receive an estimated service window. Know when to arrive, with live queue updates along the way.</p>
            <form onSubmit={handleHeroSearch} className="lp-product-search" role="search">
              <span aria-hidden="true"><IconSearch /></span>
              <input aria-label="Search organizations, services or professionals" type="search" placeholder="Organizations, services, professionals…" value={heroSearchQuery} onChange={event => setHeroSearchQuery(event.target.value)} />
              <button type="submit" className="lp-btn-primary">Search</button>
            </form>
            <div className="lp-product-actions">
              <Link to="/customer/book" className="lp-btn-primary lp-btn-lg">Find an Appointment <IconArrow /></Link>
              <Link to="/organizations" className="lp-btn-outline lp-btn-lg">Browse Organizations</Link>
            </div>
            <div className="lp-product-footnote"><span aria-hidden="true">✓</span> Reserve a serial. Track your queue. Plan your arrival.</div>
          </div>
          <HeroProductStory />
        </div>
      </section>
      <section className="lp-discovery-content" aria-label="Discover SmartQueue services">
        {/* Categories */}
        <CategoryDiscoverySection organizations={allOrgs} />
        {user && effectiveRole === 'CUSTOMER' && !user.memberships?.some(membership => ['PROVIDER', 'STAFF', 'MANAGER'].includes(membership.role)) && <CustomerHomeSection user={user} />}

        {/* Availability Lookup Widget */}
        <InstantAvailabilityFinder organizations={allOrgs} />




        {/* Featured Organizations */}
        <PopularOrganizationsSection organizations={allOrgs} loading={orgsLoading} error={orgsError} />
      </section>

      <HowSmartQueueWorks />
      <WhySmartQueue />
      <ForOrganizations />

      <CommunityExperiences organizations={allOrgs} />
      <ClosingCallToAction />
      <ProductionFooter />
    </div>
  );
};

export default LandingPage;
