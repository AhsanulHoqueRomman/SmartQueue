import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import organizationService from '../services/organizationService';
import appointmentService from '../services/appointmentService';
import reviewService from '../services/reviewService';
import { getRecentlyViewedOrgs, getFavoriteOrgs, toggleFavoriteOrg, isFavoriteOrg } from '../utils/recentAndFavorites';
import '../styles/LandingPage.css';

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

const BookmarkIcon = ({ active = false, size = 18 }) => (
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

  // Filter organizations by selected category
  const filteredOrgs = React.useMemo(() => {
    const list = allOrgsList.length > 0 ? allOrgsList : (organizations || []);
    if (selectedCategory === 'ALL') return list;
    return list.filter(o => {
      const cat = (o.category || '').toUpperCase();
      const sel = selectedCategory.toUpperCase();
      if (sel === 'HEALTHCARE') return cat.includes('HEALTHCARE') || cat.includes('MEDICAL');
      if (sel === 'SALON') return cat.includes('SALON') || cat.includes('BEAUTY') || cat.includes('WELLNESS');
      if (sel === 'DENTAL') return cat.includes('DENTAL') || cat.includes('ORTHODONTIC');
      if (sel === 'DIAGNOSTIC') return cat.includes('DIAGNOSTIC') || cat.includes('LAB');
      if (sel === 'CONSULTING') return cat.includes('CONSULTING') || cat.includes('LEGAL') || cat.includes('PROFESSIONAL');
      return cat === sel;
    });
  }, [allOrgsList, organizations, selectedCategory]);

  useEffect(() => {
    if (filteredOrgs.length > 0) {
      if (!filteredOrgs.some(o => o.id === selectedOrgId)) {
        setSelectedOrgId(filteredOrgs[0].id);
      }
    } else {
      setSelectedOrgId('');
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
        background: '#FAF8F3',
        borderRadius: '24px',
        border: '1px solid #E6E1D9',
        padding: '2.25rem',
        margin: '2.5rem auto 1.5rem auto',
        maxWidth: '1150px',
        width: '100%',
        boxShadow: '0 10px 35px rgba(47, 37, 32, 0.06)',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.98)',
        transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#5F7A70', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>📅</span> Instant Availability Lookup
        </div>
        <span style={{ fontSize: '0.75rem', color: '#78716C', background: '#FFFFFF', padding: '0.2rem 0.65rem', borderRadius: '999px', border: '1px solid #E6E1D9' }}>
          Live Telemetry Sync
        </span>
      </div>

      <h3 style={{ fontSize: '1.45rem', color: '#211C19', margin: '0 0 1.5rem 0', fontFamily: 'Cinzel, serif', fontWeight: 700 }}>
        Need an appointment today? Check live open slots across clinics
      </h3>

      <form onSubmit={handleCheckSlots} className="lp-availability-form">
        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.875rem', color: '#211C19', outline: 'none' }}
          >
            <option value="ALL">All Categories</option>
            <option value="HEALTHCARE">Healthcare</option>
            <option value="SALON">Salon & Beauty</option>
            <option value="DENTAL">Dental Care</option>
            <option value="DIAGNOSTIC">Diagnostic</option>
            <option value="CONSULTING">Consulting</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Select Clinic / Store
          </label>
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.875rem', color: '#211C19', outline: 'none' }}
          >
            {filteredOrgs.length === 0 ? (
              <option value="">No clinics available</option>
            ) : (
              filteredOrgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Select Service
          </label>
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.875rem', color: '#211C19', outline: 'none' }}
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
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Specialist / Doctor
          </label>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.875rem', color: '#211C19', outline: 'none' }}
          >
            <option value="ANY">Any Specialist / Doctor</option>
            {providers.map(p => {
              const displayName = p.title 
                ? `${p.title} (${p.user_email || `ID: ${p.id}`})`
                : (p.user_email || p.name || `Doctor #${p.id}`);
              return (
                <option key={p.id} value={p.id}>{displayName}</option>
              );
            })}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Time Preference
          </label>
          <select
            value={timePref}
            onChange={(e) => setTimePref(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.875rem', color: '#211C19', outline: 'none' }}
          >
            <option value="ANY">Any Time Slot</option>
            <option value="MORNING">Morning (8 AM - 12 PM)</option>
            <option value="AFTERNOON">Afternoon (12 PM - 5 PM)</option>
            <option value="EVENING">Evening (5 PM - 9 PM)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
            Appointment Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.875rem', color: '#211C19', outline: 'none' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1', width: '100%', marginTop: '0.25rem' }}>
          <button
            type="submit"
            disabled={loading || !selectedOrgId || !selectedServiceId}
            style={{
              width: '100%',
              padding: '0.85rem 1.5rem',
              background: loading ? '#8FA39C' : '#5F7A70',
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
            {loading ? 'Searching Open Slots...' : 'Find Open Slots'}
          </button>
        </div>
      </form>

      {searched && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #E6E1D9' }}>
          <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#211C19', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚡</span>
            {slots.length > 0
              ? `Found ${slots.length} Open Slot${slots.length > 1 ? 's' : ''} for ${date}`
              : `No open slots available for the selected parameters on ${date}.`}
          </div>
          {slots.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
              {slots.slice(0, 12).map((slot, i) => {
                const startIso = slot.start || slot.start_datetime;
                const timeStr = new Date(startIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <button
                    key={i}
                    onClick={() => navigate(`/organizations/${selectedOrgId}?serviceId=${selectedServiceId}&providerId=${slot.provider_id || ''}&slot=${encodeURIComponent(startIso)}`)}
                    style={{
                      padding: '0.65rem 0.75rem',
                      background: '#FFFFFF',
                      border: '1.5px solid #5F7A70',
                      color: '#5F7A70',
                      borderRadius: '10px',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'center'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#5F7A70';
                      e.currentTarget.style.color = '#FFFFFF';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#FFFFFF';
                      e.currentTarget.style.color = '#5F7A70';
                    }}
                  >
                    {timeStr}
                    {slot.provider_name && (
                      <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, opacity: 0.85, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {slot.provider_name.split('(')[0]}
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 500, opacity: 0.95, marginTop: '2px' }}>Book →</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Browse by Category Component ────────────────────────────────────────── */
const CategoryDiscoverySection = () => {
  const [ref, inView] = useInView({ threshold: 0.1 });

  const categories = [
    { title: 'Healthcare', icon: '🏥', count: 'Diagnostic & Medical' },
    { title: 'Salon & Beauty', icon: '💇‍♀️', count: 'Wellness & Grooming' },
    { title: 'Dental Care', icon: '🦷', count: 'Orthodontics & Dental' },
    { title: 'Diagnostic', icon: '🔬', count: 'Labs & Scans' },
    { title: 'Consulting', icon: '👔', count: 'Legal & Professional' },
  ];

  return (
    <div
      ref={ref}
      style={{ margin: '3.5rem auto 2rem auto', maxWidth: '1150px', padding: '0 1.5rem', textAlign: 'center' }}
    >
      <span style={{ color: '#5F7A70', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Service Categorization
      </span>
      <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: '#211C19', marginTop: '0.25rem', marginBottom: '1.75rem' }}>
        Browse by Service Category
      </h2>

      {/* Side-by-side horizontal grid layout */}
      <div
        className="lp-categories-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {categories.map((cat, idx) => (
          <Link
            key={cat.title}
            to={`/organizations?category=${encodeURIComponent(cat.title)}`}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E6E1D9',
              padding: '1.5rem 0.75rem',
              textDecoration: 'none',
              color: '#211C19',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)',
              // Entrance animation re-triggered every time scrolled into view
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0) scale(1)' : 'translateY(35px) scale(0.92)',
              transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.08}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.08}s, box-shadow 0.25s ease`,
            }}
            onMouseEnter={e => {
              if (inView) {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)';
                e.currentTarget.style.boxShadow = '0 12px 28px rgba(47, 37, 32, 0.12)';
              }
            }}
            onMouseLeave={e => {
              if (inView) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.03)';
              }
            }}
          >
            <span style={{ fontSize: '2.4rem', marginBottom: '0.5rem', display: 'inline-block', transition: 'transform 0.3s ease' }}>{cat.icon}</span>
            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{cat.title}</h4>
            <span style={{ fontSize: '0.75rem', color: '#78716C', lineHeight: 1.3 }}>{cat.count}</span>
          </Link>
        ))}
      </div>
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
            <div key={rev.id} style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.75rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
              <div style={{ display: 'flex', color: '#B06D2E', fontSize: '1.1rem', marginBottom: '0.75rem' }}>
                {[1, 2, 3, 4, 5].map(s => <span key={s}>{s <= rev.rating ? '★' : '☆'}</span>)}
              </div>
              <p style={{ color: '#211C19', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
                "{rev.comment || 'Smooth check-in experience and minimal wait time.'}"
              </p>
              <div style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 600 }}>
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
  const [ref, inView] = useInView({ threshold: 0.1 });
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const localViewed = getRecentlyViewedOrgs();

    if (localViewed && localViewed.length > 0) {
      setRecentlyViewed(localViewed);
    } else {
      // Fetch fallback organizations so section is ALWAYS populated gracefully!
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
  }, []);

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
          background: '#FAF8F3',
          borderRadius: '24px',
          border: '1px solid #E6E1D9',
          padding: '2rem 2.25rem',
          width: '100%',
          boxShadow: '0 10px 35px rgba(47, 37, 32, 0.05)',
          opacity: inView ? 1 : 0,
          transform: inView ? 'translateY(0)' : 'translateY(35px)',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span style={{ color: '#5F7A70', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.2rem' }}>
              Instant Quick Access
            </span>
            <h3 style={{ margin: 0, fontSize: '1.35rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              🕒 Recently Viewed Clinics & Organizations
            </h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#78716C', background: '#FFFFFF', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #E6E1D9', fontWeight: 600 }}>
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
                background: '#FFFFFF',
                padding: '1.25rem 1.5rem',
                borderRadius: '16px',
                border: '1px solid #E6E1D9',
                textDecoration: 'none',
                color: '#211C19',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0) scale(1)' : 'translateY(25px) scale(0.95)',
                transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s, box-shadow 0.25s ease, border-color 0.25s ease`
              }}
              onMouseEnter={e => {
                if (inView) {
                  e.currentTarget.style.transform = 'translateY(-4px) scale(1.015)';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(47, 37, 32, 0.12)';
                  e.currentTarget.style.borderColor = '#5F7A70';
                }
              }}
              onMouseLeave={e => {
                if (inView) {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.04)';
                  e.currentTarget.style.borderColor = '#E6E1D9';
                }
              }}
            >
              <div>
                <strong style={{ fontSize: '1.05rem', display: 'block', marginBottom: '0.3rem', color: '#211C19', fontFamily: 'Outfit, sans-serif' }}>
                  {item.name}
                </strong>
                <span style={{ fontSize: '0.8rem', color: '#78716C', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: '#B06D2E', fontWeight: 700 }}>★ {item.rating || '4.9'}</span> · {item.category || 'HEALTHCARE'}
                </span>
              </div>
              <span style={{ color: '#5F7A70', fontWeight: 700, fontSize: '0.9rem', background: '#F5EFE6', padding: '0.45rem 0.9rem', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                Book →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Featured Organizations Component for Landing Page ──────────────────── */
const FeaturedOrganizationsSection = ({ onOrgLoaded }) => {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favMap, setFavMap] = useState({});

  useEffect(() => {
    let isMounted = true;
    organizationService.getOrganizations({ page_size: 3 })
      .then(res => {
        if (!isMounted) return;
        const list = Array.isArray(res) ? res : (res.results || []);
        setOrganizations(list.slice(0, 3));
        if (onOrgLoaded) onOrgLoaded(list);

        // Build favorite map
        const map = {};
        list.forEach(o => { map[o.id] = isFavoriteOrg(o.id); });
        setFavMap(map);
      })
      .catch(err => {
        console.error('Failed to load featured organizations:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const handleToggleFav = (e, org) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleFavoriteOrg(org);
    setFavMap(prev => ({ ...prev, [org.id]: newState }));
  };

  return (
    <div
      ref={ref}
      style={{
        margin: '1.5rem auto 2rem auto',
        maxWidth: '1150px',
        width: '100%',
        padding: '0 1.5rem',
        textAlign: 'center'
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#F5EFE6', color: '#5F7A70', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        <span>🏥</span> Verified Partner Network
      </div>
      <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: '#211C19', marginBottom: '0.5rem' }}>
        Popular Care Providers & Clinics
      </h2>
      <p style={{ color: '#78716C', maxWidth: '600px', margin: '0 auto 2.5rem auto', fontSize: '0.95rem' }}>
        Explore top-rated medical centers, diagnostic clinics, and wellness facilities offering instant online booking and live queue telemetry.
      </p>

      {loading ? (
        <div className="lp-featured-grid">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#FAF8F3', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.75rem', height: '240px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#E6E1D9', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '60%', height: '16px', background: '#E6E1D9', borderRadius: '4px', marginBottom: '0.5rem' }} />
              <div style={{ width: '40%', height: '12px', background: '#E6E1D9', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="lp-featured-grid">
          {organizations.map((org, idx) => {
            const rating = org.rating ? parseFloat(org.rating).toFixed(1) : '4.9';
            const reviewsCount = org.reviews_count || 12;
            const servicesCount = org.services_count || (org.services ? org.services.length : 0) || 4;
            const providersCount = org.providers_count || 3;
            const isFav = favMap[org.id];

            return (
              <div
                key={org.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E6E1D9',
                  padding: '1.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateY(0) scale(1)' : 'translateY(35px) scale(0.95)',
                  transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.12}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.12}s, box-shadow 0.25s ease`,
                  textAlign: 'left',
                  position: 'relative'
                }}
                onMouseEnter={e => {
                  if (inView) {
                    e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 14px 32px rgba(47, 37, 32, 0.12)';
                  }
                }}
                onMouseLeave={e => {
                  if (inView) {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(47, 37, 32, 0.04)';
                  }
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <span style={{ background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                      {org.category || 'HEALTHCARE'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#B06D2E' }}>
                        ★ {rating} <span style={{ fontWeight: 400, color: '#78716C', fontSize: '0.75rem' }}>({reviewsCount})</span>
                      </span>
                      <button
                        onClick={(e) => handleToggleFav(e, org)}
                        title={isFav ? 'Remove from favorites' : 'Save to favorites'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <BookmarkIcon active={isFav} />
                      </button>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#211C19', marginBottom: '0.4rem', fontFamily: 'Outfit, sans-serif' }}>
                    {org.name}
                  </h3>

                  <p style={{ color: '#78716C', fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {org.description || 'Providing world-class medical and wellness services with online queue management.'}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 0', borderTop: '1px solid #FAF8F3', borderBottom: '1px solid #FAF8F3', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#5C544E' }}>
                    <span>⚡ <strong>{servicesCount}</strong> Services</span>
                    <span>👨‍⚕️ <strong>{providersCount}</strong> Doctors</span>
                  </div>

                  <Link
                    to={`/organizations/${org.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: '0.4rem',
                      width: '100%',
                      padding: '0.7rem',
                      background: '#5F7A70',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      textDecoration: 'none',
                      transition: 'background 0.2s ease'
                    }}
                  >
                    View Services & Book <IconArrow />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '2.5rem' }}>
        <Link
          to="/organizations"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.85rem 1.75rem',
            background: '#2F2520',
            color: '#FAF8F3',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.95rem',
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(47, 37, 32, 0.15)',
            transition: 'all 0.2s ease'
          }}
        >
          Browse All Organizations <IconArrow />
        </Link>
      </div>
    </div>
  );
};

/* ─── Main Landing Page ─────────────────────────────────────────────────── */
export const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [heroSearchQuery, setHeroSearchQuery] = useState('');
  const [allOrgs, setAllOrgs] = useState([]);
  const [heroRef, heroIn] = useInView({ threshold: 0.05 });
  const [ctaRef, ctaIn] = useInView();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      const elem = document.getElementById(targetId);
      if (elem) {
        setTimeout(() => {
          elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  return (
    <div className="lp-root">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
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
            <Link to="/search" className="lp-nav-link">Search</Link>
            <a href="#how-it-works" className="lp-nav-link">How it works</a>
            <a href="#why-smartqueue" className="lp-nav-link">Why SmartQueue</a>
          </nav>

          <div className="lp-nav-cta">
            {user ? (
              <Link to="/dashboard" className="lp-btn-primary">
                Dashboard <IconArrow />
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

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="lp-hero" ref={heroRef}>
        <div className="lp-hero-grid" aria-hidden="true" />
        <div className="lp-hero-glow" aria-hidden="true" />

        <div className="lp-hero-inner">
          <div
            className="lp-hero-eyebrow"
            style={{
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.55s cubic-bezier(0.16,1,0.3,1) 0.05s, transform 0.55s cubic-bezier(0.16,1,0.3,1) 0.05s',
            }}
          >
            <span className="lp-eyebrow-dot" />
            Appointment & Queue Discovery Platform
          </div>

          <h1
            className="lp-hero-h1"
            style={{
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1) 0.12s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.12s',
            }}
          >
            Find and book your next<br />
            <span className="lp-hero-accent">appointment easily.</span>
          </h1>

          <p
            className="lp-hero-sub"
            style={{
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s',
            }}
          >
            Discover top-rated clinics, medical centers, and specialists. Check real-time time slot availability and track your live queue status online.
          </p>

          {/* Hero Search Bar */}
          <form
            onSubmit={handleHeroSearch}
            style={{
              display: 'flex',
              maxWidth: '560px',
              margin: '1.75rem auto 1.5rem auto',
              background: '#FFFFFF',
              borderRadius: '9999px',
              padding: '0.35rem 0.35rem 0.35rem 1.25rem',
              boxShadow: '0 12px 32px rgba(47, 37, 32, 0.12)',
              border: '1px solid #E6E1D9',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#78716C', display: 'flex', alignItems: 'center' }}><IconSearch /></span>
            <input
              type="text"
              placeholder="Search clinics, services, or doctors..."
              value={heroSearchQuery}
              onChange={(e) => setHeroSearchQuery(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '0.65rem 0.75rem', fontSize: '0.95rem', color: '#211C19' }}
            />
            <button
              type="submit"
              style={{
                background: '#5F7A70',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.75rem 1.5rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>

          <div
            className="lp-hero-actions"
            style={{
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1) 0.28s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.28s',
            }}
          >
            <Link to="/organizations" className="lp-btn-primary lp-btn-lg">
              Browse Organizations <IconArrow />
            </Link>
            <Link to="/customer/book" className="lp-btn-outline lp-btn-lg">
              Find an Appointment
            </Link>
          </div>
        </div>

        {/* Categories */}
        <CategoryDiscoverySection />

        {/* Availability Lookup Widget */}
        <AvailabilityDiscoveryWidget organizations={allOrgs} />

        {/* Recently Viewed & Saved Clinics */}
        <LocalStorageDiscoveryWidgets />

        {/* Featured Organizations */}
        <FeaturedOrganizationsSection onOrgLoaded={(list) => setAllOrgs(list)} />
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="lp-section lp-section--alt">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-label">Simple 6-Step Journey</div>
            <h2 className="lp-section-h2">How SmartQueue Works</h2>
          </div>

          <div className="lp-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            <div className="lp-step">
              <div className="lp-step-number">01</div>
              <div className="lp-step-body">
                <div className="lp-step-title">Find an Organization</div>
                <div className="lp-step-desc">Explore verified clinics, diagnostic centers, and care facilities.</div>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-number">02</div>
              <div className="lp-step-body">
                <div className="lp-step-title">Choose a Service</div>
                <div className="lp-step-desc">Select consultations, checkups, or specialized procedures.</div>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-number">03</div>
              <div className="lp-step-body">
                <div className="lp-step-title">Select a Provider</div>
                <div className="lp-step-desc">Pick your preferred doctor or specialist from the roster.</div>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-number">04</div>
              <div className="lp-step-body">
                <div className="lp-step-title">Pick a Time Slot</div>
                <div className="lp-step-desc">Choose an available time slot matching provider working schedules.</div>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-number">05</div>
              <div className="lp-step-body">
                <div className="lp-step-title">Instant Check-In</div>
                <div className="lp-step-desc">Arrive and check in online or at the desk to receive your token.</div>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-number">06</div>
              <div className="lp-step-body">
                <div className="lp-step-title">Track Live Queue</div>
                <div className="lp-step-desc">Monitor serving tokens and people ahead in real time on your phone.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why SmartQueue ────────────────────────────────────────────── */}
      <section id="why-smartqueue" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-label">Core Platform Benefits</div>
            <h2 className="lp-section-h2">Why Patients & Clinics Choose SmartQueue</h2>
          </div>

          <div className="lp-features-grid">
            <div className="lp-feature-card">
              <div className="lp-feature-icon" style={{ '--accent': '#52796F' }}>⚡</div>
              <h3 className="lp-feature-title">Zero Waiting Room Chaos</h3>
              <p className="lp-feature-desc">Know your exact token position and estimated call time before arriving.</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon" style={{ '--accent': '#2C221E' }}>📊</div>
              <h3 className="lp-feature-title">Real-Time Queue Telemetry</h3>
              <p className="lp-feature-desc">Live updating token indicators for complete transparency.</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon" style={{ '--accent': '#B06D2E' }}>🏥</div>
              <h3 className="lp-feature-title">Multi-Tenant Clinic Discovery</h3>
              <p className="lp-feature-desc">Browse diagnostic labs, hospitals, and wellness centers in one place.</p>
            </div>
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
            <Link to="/" className="lp-brand">
              <span className="lp-brand-mark lp-brand-mark--sm">
                <IconZap />
              </span>
              <span className="lp-brand-name">SmartQueue</span>
            </Link>
            <p className="lp-footer-tagline">
              Multi-tenant appointment & queue management SaaS platform.
            </p>
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
