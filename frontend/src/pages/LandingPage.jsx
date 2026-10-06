import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import organizationService from '../services/organizationService';
import appointmentService from '../services/appointmentService';
import reviewService from '../services/reviewService';
import { getRecentlyViewedOrgs } from '../utils/recentAndFavorites';
import { getApiDocsUrl } from '../api/client';
import '../styles/LandingPage.css';
import CustomerHomeSection from '../components/CustomerHomeSection';
import { CategoryDiscoverySection, PopularOrganizationsSection } from '../components/LandingDiscovery';
import { publicOrganizations } from '../services/discoveryService';
import { useTenant } from '../contexts/TenantContext';
import { PublicNavbar } from '../components/PublicNavbar';
import HeroProductStory from '../components/HeroProductStory';
import '../styles/LandingPhaseOne.css';

/* ─── Tiny SVG Icon Components ─────────────────────────────────────────── */
const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

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

/* ─── Intersection Observer Hook for scroll-triggered animations ─────── */
function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.12, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

/* ─── Availability Discovery Widget ──────────────────────────────────────── */
const AvailabilityDiscoveryWidget = ({ organizations }) => {
  const navigate = useNavigate();
  const [ref, inView] = useInView({ threshold: 0.1 });
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [allOrgsList, setAllOrgsList] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('ANY');
  const [timePref, setTimePref] = useState('ANY');
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Fetch all active public organizations so all clinics appear in dropdown
  useEffect(() => {
    let isMounted = true;
    organizationService.getOrganizations({ page_size: 100 })
      .then(res => {
        if (!isMounted) return;
        const list = Array.isArray(res) ? res : (res.results || []);
        setAllOrgsList(list);
      })
      .catch(() => {
        if (isMounted && organizations) setAllOrgsList(organizations);
      });
    return () => { isMounted = false; };
  }, [organizations]);

  // Filter organizations strictly by selected category
  const filteredOrgs = React.useMemo(() => {
    const list = allOrgsList.length > 0 ? allOrgsList : (organizations || []);
    if (selectedCategory === 'ALL' || !list.length) return list;
    return list.filter(o => {
      const catText = `${o.category || ''} ${o.industry_type || ''} ${o.industry_label || ''} ${o.name || ''} ${o.description || ''}`.toUpperCase();
      const sel = selectedCategory.toUpperCase();
      if (sel === 'HEALTHCARE') return o.industry_type === 'HEALTHCARE' || (catText.includes('HEALTHCARE') || catText.includes('MEDICAL') || catText.includes('CLINIC') || catText.includes('HEALTH') || catText.includes('DOCTOR'));
      if (sel === 'SALON' || sel === 'BEAUTY') return o.industry_type === 'BEAUTY' || (catText.includes('SALON') || catText.includes('BEAUTY') || catText.includes('WELLNESS') || catText.includes('HAIR') || catText.includes('SPA'));
      if (sel === 'DENTAL') return catText.includes('DENTAL') || catText.includes('ORTHODONTIC') || catText.includes('TEETH');
      if (sel === 'DIAGNOSTIC') return catText.includes('DIAGNOSTIC') || catText.includes('LAB') || catText.includes('IMAGING') || catText.includes('TEST') || catText.includes('SCREENING');
      if (sel === 'CONSULTING' || sel === 'LEGAL') return o.industry_type === 'CONSULTING' || o.industry_type === 'LEGAL' || (catText.includes('CONSULTING') || catText.includes('LEGAL') || catText.includes('PROFESSIONAL') || catText.includes('REPAIR') || catText.includes('SERVICE') || catText.includes('SUPPORT'));
      return catText.includes(sel);
    });
  }, [allOrgsList, organizations, selectedCategory]);

  const handleCategoryChange = (cat) => {
    setSelectedCategory(cat);
    setSelectedOrgId('');
    setServices([]);
    setSelectedServiceId('');
    setProviders([]);
    setSelectedProviderId('ANY');
    setSlots([]);
    setSearched(false);
  };

  const handleOrgChange = (orgId) => {
    setSelectedOrgId(orgId);
    setServices([]);
    setSelectedServiceId('');
    setProviders([]);
    setSelectedProviderId('ANY');
    setSlots([]);
    setSearched(false);
  };

  const handleServiceChange = (serviceId) => {
    setSelectedServiceId(serviceId);
    setSelectedProviderId('ANY');
    setSlots([]);
    setSearched(false);
  };

  useEffect(() => {
    if (filteredOrgs.length > 0) {
      if (!filteredOrgs.some(o => o.id === selectedOrgId)) {
        handleOrgChange(filteredOrgs[0].id);
      }
    } else {
      setSelectedOrgId('');
      setServices([]);
      setSelectedServiceId('');
      setProviders([]);
      setSelectedProviderId('ANY');
    }
  }, [filteredOrgs]);

  // Fetch active services & providers when selectedOrgId changes
  useEffect(() => {
    if (!selectedOrgId) {
      setServices([]);
      setProviders([]);
      setSelectedServiceId('');
      setSelectedProviderId('ANY');
      return;
    }
    let isMounted = true;
    Promise.all([
      organizationService.getServices(selectedOrgId).catch(() => []),
      organizationService.getProviders(selectedOrgId).catch(() => [])
    ]).then(([servicesData, providersData]) => {
      if (!isMounted) return;
      const sList = (Array.isArray(servicesData) ? servicesData : servicesData.results || []).filter(s => s.is_active !== false);
      const pList = (Array.isArray(providersData) ? providersData : providersData.results || []).filter(p => p.is_active !== false);

      setServices(sList);
      setProviders(pList);

      if (sList.length > 0) {
        setSelectedServiceId(sList[0].id);
      } else {
        setSelectedServiceId('');
      }
      setSelectedProviderId('ANY');
    });

    return () => { isMounted = false; };
  }, [selectedOrgId]);

  const handleCheckSlots = async (e) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedServiceId) return;
    setLoading(true);
    setSearched(true);
    try {
      let rawSlots = [];

      if (selectedProviderId === 'ANY') {
        const provsToQuery = providers.length > 0 ? providers : [];
        if (provsToQuery.length > 0) {
          const responses = await Promise.all(
            provsToQuery.map(p =>
              appointmentService.getAvailability(selectedOrgId, p.id, selectedServiceId, date)
                .catch(() => ({ slots: [] }))
            )
          );
          responses.forEach((res, idx) => {
            const list = res.slots || res.available_slots || [];
            const provObj = provsToQuery[idx];
            list.forEach(s => {
              rawSlots.push({
                ...s,
                provider_id: provObj.id,
                provider_name: provObj.title ? `${provObj.title} (${provObj.user_email || ''})` : (provObj.user_email || `Doctor #${provObj.id}`)
              });
            });
          });
        }
      } else {
        const res = await appointmentService.getAvailability(selectedOrgId, selectedProviderId, selectedServiceId, date);
        const list = res.slots || res.available_slots || [];
        rawSlots = list.map(s => ({
          ...s,
          provider_id: selectedProviderId
        }));
      }

      // Filter by time preference if specified
      if (timePref !== 'ANY') {
        rawSlots = rawSlots.filter(s => {
          const startDt = s.start || s.start_datetime;
          const hour = new Date(startDt).getHours();
          if (timePref === 'MORNING') return hour >= 8 && hour < 12;
          if (timePref === 'AFTERNOON') return hour >= 12 && hour < 17;
          if (timePref === 'EVENING') return hour >= 17 && hour < 21;
          return true;
        });
      }

      // Sort chronologically
      rawSlots.sort((a, b) => new Date(a.start || a.start_datetime) - new Date(b.start || b.start_datetime));

      setSlots(rawSlots);
    } catch (err) {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--lp-surface)',
        borderRadius: '24px',
        border: '1px solid var(--lp-border)',
        padding: '2.25rem',
        margin: '2.5rem auto 1.5rem auto',
        maxWidth: '1150px',
        width: '100%',
        boxShadow: 'var(--shadow-md)',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.98)',
        transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--lp-sage)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>📅</span> Instant Availability Lookup
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--lp-muted)', background: 'var(--lp-bg-subtle)', padding: '0.2rem 0.65rem', borderRadius: '999px', border: '1px solid var(--lp-border)' }}>
          Live Telemetry Sync
        </span>
      </div>

      <h3 style={{ fontSize: '1.45rem', color: 'var(--lp-text)', margin: '0 0 1.5rem 0', fontWeight: 700 }}>
        Need an appointment? Check serial queue availability across organizations
      </h3>

      <form onSubmit={handleCheckSlots} className="lp-availability-form">
        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', fontSize: '0.875rem', color: 'var(--lp-text)', outline: 'none' }}
          >
            <option value="ALL">All Categories</option>
            <option value="HEALTHCARE">Healthcare</option>
            <option value="SALON">Salon & Beauty</option>
            <option value="DENTAL">Dental Care</option>
            <option value="DIAGNOSTIC">Diagnostic</option>
            <option value="CONSULTING">Consulting & Legal</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Select Clinic / Store
          </label>
          <select
            value={selectedOrgId}
            onChange={(e) => handleOrgChange(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', fontSize: '0.875rem', color: 'var(--lp-text)', outline: 'none' }}
          >
            {filteredOrgs.length === 0 ? (
              <option value="">No organizations available</option>
            ) : (
              filteredOrgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Select Service
          </label>
          <select
            value={selectedServiceId}
            onChange={(e) => handleServiceChange(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', fontSize: '0.875rem', color: 'var(--lp-text)', outline: 'none' }}
          >
            {services.length === 0 ? (
              <option value="">No services available</option>
            ) : (
              services.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes}m)</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Specialist / Provider
          </label>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', fontSize: '0.875rem', color: 'var(--lp-text)', outline: 'none' }}
          >
            <option value="ANY">Any Specialist / Provider</option>
            {providers.map(p => {
              const displayName = p.title 
                ? `${p.title} (${p.user_email || `ID: ${p.id}`})`
                : (p.user_email || p.name || `Provider #${p.id}`);
              return (
                <option key={p.id} value={p.id}>{displayName}</option>
              );
            })}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Preferred Window
          </label>
          <select
            value={timePref}
            onChange={(e) => setTimePref(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', fontSize: '0.875rem', color: 'var(--lp-text)', outline: 'none' }}
          >
            <option value="ANY">Any Preferred Window</option>
            <option value="MORNING">Morning (8 AM - 12 PM)</option>
            <option value="AFTERNOON">Afternoon (12 PM - 5 PM)</option>
            <option value="EVENING">Evening (5 PM - 9 PM)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Appointment Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', fontSize: '0.875rem', color: 'var(--lp-text)', outline: 'none' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1', width: '100%', marginTop: '0.25rem' }}>
          <button
            type="submit"
            disabled={loading || !selectedOrgId || !selectedServiceId}
            style={{
              width: '100%',
              padding: '0.85rem 1.5rem',
              background: loading ? 'var(--lp-muted)' : 'var(--lp-sage)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 14px rgba(95, 122, 112, 0.25)'
            }}
          >
            {loading ? 'Checking Availability...' : 'Check Availability'}
          </button>
        </div>
      </form>

      {searched && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--lp-border)' }}>
          <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚡</span>
            {slots.length > 0
              ? `Serial Queue Appointments Available for ${date}`
              : `No appointments available for the selected parameters on ${date}.`}
          </div>
          {slots.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <button
                onClick={() => navigate(`/customer/book?service_id=${selectedServiceId}&provider_id=${selectedProviderId || ''}&date=${date}`)}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--lp-sage)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Book Queue Serial for {date} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Real Reviews & Testimonials ────────────────────────────────────────── */
const TestimonialsSection = () => {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    organizationService.getOrganizations({ page_size: 1 })
      .then(res => {
        const list = Array.isArray(res) ? res : res.results || [];
        if (list.length > 0) {
          reviewService.getReviews(list[0].id)
            .then(revData => {
              const rList = Array.isArray(revData) ? revData : revData.results || [];
              setReviews(rList.slice(0, 3));
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  if (reviews.length === 0) return null;

  return (
    <section className="lp-section lp-section--alt" style={{ padding: '4rem 1.5rem' }}>
      <div style={{ maxWidth: '1150px', margin: '0 auto', textAlign: 'center' }}>
        <div className="lp-section-label">Verified Customer Experiences</div>
        <h2 className="lp-section-h2" style={{ marginBottom: '2.5rem' }}>What Our Patients & Visitors Say</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', textAlign: 'left' }}>
          {reviews.map((rev) => (
            <div key={rev.id} style={{ background: 'var(--lp-surface)', borderRadius: '16px', border: '1px solid var(--lp-border)', padding: '1.75rem', boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ display: 'flex', color: 'var(--color-warning)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>
                {[1, 2, 3, 4, 5].map(s => <span key={s}>{s <= rev.rating ? '★' : '☆'}</span>)}
              </div>
              <p style={{ color: 'var(--lp-text)', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
                "{rev.comment || 'Smooth check-in experience and minimal wait time.'}"
              </p>
              <div style={{ fontSize: '0.8rem', color: 'var(--lp-muted)', fontWeight: 600 }}>
                {rev.customer_email ? rev.customer_email.split('@')[0] : 'Verified Customer'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── Recently Viewed Clinics Section ────────────────────────────────────── */
const LocalStorageDiscoveryWidgets = () => {
  const { user } = useAuth();
  const [ref, inView] = useInView({ threshold: 0.1 });
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const localViewed = getRecentlyViewedOrgs();

    if (localViewed && localViewed.length > 0) {
      setRecentlyViewed(localViewed);
    } else {
      organizationService.getOrganizations({ page_size: 4 })
        .then(res => {
          if (!isMounted) return;
          const list = Array.isArray(res) ? res : (res.results || []);
          const formatted = list.slice(0, 4).map(o => ({
            id: o.id,
            name: o.name,
            category: o.category || 'HEALTHCARE',
            rating: o.rating ? parseFloat(o.rating).toFixed(1) : '4.9',
            reviews_count: o.reviews_count || 12
          }));
          setRecentlyViewed(formatted);
        })
        .catch(() => {});
    }

    return () => { isMounted = false; };
  }, [user]);

  // Hide section entirely if user is NOT logged in!
  if (!user) return null;

  const recentItems = recentlyViewed.slice(0, 4);

  return (
    <div
      ref={ref}
      style={{
        margin: '2.5rem auto 1.5rem auto',
        maxWidth: '1150px',
        width: '100%',
        padding: '0 1.5rem',
      }}
    >
      <div
        style={{
          background: 'var(--lp-surface)',
          borderRadius: '24px',
          border: '1px solid var(--lp-border)',
          padding: '2rem 2.25rem',
          width: '100%',
          boxShadow: 'var(--shadow-md)',
          opacity: inView ? 1 : 0,
          transform: inView ? 'translateY(0)' : 'translateY(35px)',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ textAlign: 'left' }}>
            <span style={{ color: 'var(--lp-sage)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
              ⚡ Instant Quick Access
            </span>
            <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--lp-text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>🕒</span> Recently Viewed Clinics & Organizations
            </h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--lp-muted)', background: 'var(--lp-bg-subtle)', padding: '0.3rem 0.85rem', borderRadius: '999px', border: '1px solid var(--lp-border)', fontWeight: 600 }}>
            {recentItems.length} Clinic{recentItems.length > 1 ? 's' : ''} Listed
          </span>
        </div>

        {/* Dynamic Grid: If 1 clinic, spans 100% width; if 3 or 4, side-by-side horizontally */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: recentItems.length === 1 ? '1fr' : `repeat(${Math.min(recentItems.length, 4)}, 1fr)`,
            gap: '1.25rem',
            width: '100%'
          }}
          className="lp-recent-grid"
        >
          {recentItems.map((item, idx) => (
            <Link
              key={item.id}
              to={`/organizations/${item.id}`}
              style={{
                background: 'var(--lp-bg)',
                padding: '1.25rem 1.5rem',
                borderRadius: '16px',
                border: '1px solid var(--lp-border)',
                textDecoration: 'none',
                color: 'var(--lp-text)',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                boxShadow: 'var(--shadow-xs)',
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0) scale(1)' : 'translateY(25px) scale(0.95)',
                transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s, box-shadow 0.25s ease, border-color 0.25s ease`
              }}
              onMouseEnter={e => {
                if (inView) {
                  e.currentTarget.style.transform = 'translateY(-4px) scale(1.015)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.borderColor = 'var(--lp-sage)';
                }
              }}
              onMouseLeave={e => {
                if (inView) {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                  e.currentTarget.style.borderColor = 'var(--lp-border)';
                }
              }}
            >
              <div>
                <strong style={{ fontSize: '1.05rem', display: 'block', marginBottom: '0.3rem', color: 'var(--lp-text)' }}>
                  {item.name}
                </strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--lp-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>★ {item.rating || '4.9'}</span> · {item.category || 'HEALTHCARE'}
                </span>
              </div>
              <span style={{ color: 'var(--lp-sage)', fontWeight: 700, fontSize: '0.9rem', background: 'var(--lp-sage-bg)', padding: '0.45rem 0.9rem', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                Book →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

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
  const [howItWorksRef, howItWorksIn] = useInView({ threshold: 0.1 });
  const [whyUsRef, whyUsIn] = useInView({ threshold: 0.1 });
  const [ctaRef, ctaIn] = useInView();

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      const elem = document.getElementById(targetId);
      if (elem) {
        setTimeout(() => {
          elem.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        }, 150);
      }
    }
  }, [location]);

  const handleHeroSearch = (e) => {
    e.preventDefault();
    if (heroSearchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(heroSearchQuery.trim())}`);
    } else {
      navigate('/organizations');
    }
  };

  const handleLogoClick = (e) => {
    if (location.pathname === '/' || window.location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <AvailabilityDiscoveryWidget organizations={allOrgs} />


        {/* Recently Viewed & Saved Clinics */}
        <LocalStorageDiscoveryWidgets />

        {/* Featured Organizations */}
        <PopularOrganizationsSection organizations={allOrgs} loading={orgsLoading} error={orgsError} />
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        ref={howItWorksRef}
        className="lp-section lp-section--alt"
        style={{
          opacity: howItWorksIn ? 1 : 0,
          transform: howItWorksIn ? 'translateY(0)' : 'translateY(35px)',
          transition: 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="lp-section-inner">
          <div
            className="lp-section-header"
            style={{
              opacity: howItWorksIn ? 1 : 0,
              transform: howItWorksIn ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s',
            }}
          >
            <div className="lp-section-label">Simple 6-Step Journey</div>
            <h2 className="lp-section-h2">How SmartQueue Works</h2>
          </div>

          <div className="lp-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {[
              { num: '01', title: 'Find an Organization', desc: 'Explore verified clinics, diagnostic centers, and care facilities.' },
              { num: '02', title: 'Choose a Service', desc: 'Select consultations, checkups, or specialized procedures.' },
              { num: '03', title: 'Select a Provider', desc: 'Pick your preferred doctor or specialist from the roster.' },
              { num: '04', title: 'Pick a Time Slot', desc: 'Choose an available time slot matching provider working schedules.' },
              { num: '05', title: 'Instant Check-In', desc: 'Arrive and check in online or at the desk to receive your token.' },
              { num: '06', title: 'Track Live Queue', desc: 'Monitor serving tokens and people ahead in real time on your phone.' },
            ].map((step, idx) => (
              <div
                key={idx}
                className="lp-step"
                style={{
                  opacity: howItWorksIn ? 1 : 0,
                  transform: howItWorksIn ? 'translateY(0) scale(1)' : 'translateY(25px) scale(0.96)',
                  transition: `opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${0.15 + idx * 0.08}s, transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${0.15 + idx * 0.08}s`,
                }}
              >
                <div className="lp-step-number">{step.num}</div>
                <div className="lp-step-body">
                  <div className="lp-step-title">{step.title}</div>
                  <div className="lp-step-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why SmartQueue ────────────────────────────────────────────── */}
      <section
        id="why-smartqueue"
        ref={whyUsRef}
        className="lp-section"
        style={{
          opacity: whyUsIn ? 1 : 0,
          transform: whyUsIn ? 'translateY(0)' : 'translateY(35px)',
          transition: 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="lp-section-inner">
          <div
            className="lp-section-header"
            style={{
              opacity: whyUsIn ? 1 : 0,
              transform: whyUsIn ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s',
            }}
          >
            <div className="lp-section-label">Core Platform Benefits</div>
            <h2 className="lp-section-h2">Why Patients & Clinics Choose SmartQueue</h2>
          </div>

          <div className="lp-features-grid">
            {[
              { icon: '⚡', accent: '#52796F', title: 'Zero Waiting Room Chaos', desc: 'Know your exact token position and estimated call time before arriving.' },
              { icon: '📊', accent: '#2C221E', title: 'Real-Time Queue Telemetry', desc: 'Live updating token indicators for complete transparency.' },
              { icon: '🏥', accent: '#B06D2E', title: 'Multi-Tenant Clinic Discovery', desc: 'Browse diagnostic labs, hospitals, and wellness centers in one place.' },
            ].map((feat, idx) => (
              <div
                key={idx}
                className="lp-feature-card"
                style={{
                  opacity: whyUsIn ? 1 : 0,
                  transform: whyUsIn ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.95)',
                  transition: `opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${0.15 + idx * 0.12}s, transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${0.15 + idx * 0.12}s`,
                }}
              >
                <div className="lp-feature-icon" style={{ '--accent': feat.accent }}>{feat.icon}</div>
                <h3 className="lp-feature-title">{feat.title}</h3>
                <p className="lp-feature-desc">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────── */}
      <TestimonialsSection />

      {/* ── CTA Banner ─────────────────────────────────────────────────── */}
      <section className="lp-cta-section" ref={ctaRef}>
        <div className="lp-cta-glow" aria-hidden="true" />
        <div className="lp-cta-inner"
          style={{
            opacity: ctaIn ? 1 : 0,
            transform: ctaIn ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div className="lp-cta-label">Ready for seamless care?</div>
          <h2 className="lp-cta-h2">
            Book your next appointment<br />in under 60 seconds.
          </h2>
          <div className="lp-cta-actions">
            <Link to="/organizations" className="lp-btn-primary lp-btn-lg">
              Explore Organizations <IconArrow />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <Link to="/" className="lp-brand" onClick={handleLogoClick}>
              <span className="lp-brand-mark lp-brand-mark--sm">
                <IconZap />
              </span>
              <span className="lp-brand-name">SmartQueue</span>
            </Link>
            <p className="lp-footer-tagline">
              Multi-tenant appointment & queue management SaaS platform.
            </p>
          </div>
          <div className="lp-footer-links" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <a
              href="/contact"
              className="lp-footer-link"
              style={{ fontWeight: 700, color: '#5F7A70' }}
            >
              Contact Us
            </a>
            <a
              href={getApiDocsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-footer-link"
              style={{ fontWeight: 600 }}
            >
              API Docs
            </a>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span className="lp-footer-copy">© {new Date().getFullYear()} SmartQueue. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
