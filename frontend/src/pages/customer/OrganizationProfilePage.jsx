import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import ProfessionalCarousel from '../../components/ProfessionalCarousel';
import PublicNavbar from '../../components/PublicNavbar';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { deriveProfessionalDisplay } from '../../utils/providerDisplay';
import { startingPrice, providerCharge, bookingError as getBookingError, currentBusinessDate } from '../../utils/bookingDisplay';
import { BookingContactFields, BookingSummary } from '../../components/BookingContact';
import { useBookingContact } from '../../hooks/useBookingContact';
import '../../styles/LandingPage.css';

// ─── Format Currency Helper ────────────────────────────────────────────────
export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '';
  const num = Number(amount);
  if (isNaN(num)) return `৳${amount}`;
  return `৳${num.toLocaleString('en-US')}`;
};

// ─── Domain-aware Service Image Helper (Strict Isolation) ───────────────────
export const getServiceImage = (service, org) => {
  if (service?.image) return service.image;

  const orgInd = (org?.industry_type || org?.category || '').toUpperCase();
  const name = (service?.name || '').toLowerCase();
  const desc = (service?.description || '').toLowerCase();
  const combined = `${name} ${desc}`;

  // Domain 1: LEGAL & LAW FIRM
  if (orgInd.includes('LEGAL') || orgInd.includes('LAW')) {
    if (combined.includes('rjsc') || combined.includes('company') || combined.includes('incorporation') || combined.includes('corporate') || combined.includes('business')) {
      return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'; // modern corporate architectural office
    }
    if (combined.includes('contract') || combined.includes('vetting') || combined.includes('agreement') || combined.includes('nda') || combined.includes('document')) {
      return 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80'; // fountain pen on signed contract document
    }
    if (combined.includes('property') || combined.includes('land') || combined.includes('estate') || combined.includes('real estate') || combined.includes('title')) {
      return 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80'; // deed / property legal
    }
    if (combined.includes('tax') || combined.includes('audit') || combined.includes('finance')) {
      return 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80'; // finance legal desk
    }
    if (combined.includes('litigation') || combined.includes('court') || combined.includes('dispute') || combined.includes('advocate') || combined.includes('settlement')) {
      return 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80'; // law library / books
    }
    // Generic legal fallback - professional law library / counsel desk
    return 'https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=800&q=80';
  }

  // Domain 2: HEALTHCARE & MEDICAL
  if (orgInd.includes('HEALTH') || orgInd.includes('MEDIC') || orgInd.includes('CLINIC')) {
    if (combined.includes('dental') || combined.includes('teeth') || combined.includes('scaling') || combined.includes('ortho')) {
      return 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80'; // dental clinic
    }
    if (combined.includes('skin') || combined.includes('derma') || combined.includes('laser')) {
      return 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80'; // dermatology clinical
    }
    if (combined.includes('lab') || combined.includes('blood') || combined.includes('test') || combined.includes('mri') || combined.includes('scan') || combined.includes('patholog') || combined.includes('diagnos')) {
      return 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=800&q=80'; // medical lab
    }
    if (combined.includes('cardio') || combined.includes('heart') || combined.includes('ecg')) {
      return 'https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&w=800&q=80'; // cardiology monitor
    }
    if (combined.includes('eye') || combined.includes('vision') || combined.includes('opht')) {
      return 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80'; // ophthalmology
    }
    // Generic healthcare fallback - clinical stethoscope & consultation desk
    return 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80';
  }

  // Domain 3: BEAUTY, SALON & WELLNESS
  if (orgInd.includes('BEAUTY') || orgInd.includes('SALON') || orgInd.includes('SPA') || orgInd.includes('WELLNESS')) {
    if (combined.includes('hair') || combined.includes('cut') || combined.includes('style') || combined.includes('trim')) {
      return 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80'; // hair styling
    }
    if (combined.includes('facial') || combined.includes('skin') || combined.includes('massage') || combined.includes('spa')) {
      return 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80'; // spa treatment
    }
    return 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
  }

  // Domain 4: TECHNICAL REPAIR & SERVICE
  if (orgInd.includes('REPAIR') || orgInd.includes('TECH')) {
    return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80'; // precision electronics repair desk
  }

  // Domain 5: CONSULTING & PROFESSIONAL SERVICES
  if (orgInd.includes('CONSULT')) {
    return 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80'; // consulting desk
  }

  // Neutral generic professional fallback
  return 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80';
};

export function OrganizationProfilePage() {
  const contact = useBookingContact();
  const { organizationId, id, serviceId } = useParams();
  const orgId = organizationId || id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingSectionRef = useRef(null);

  // Core Data States
  const [org, setOrg] = useState(null);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal States
  const [activeDetailService, setActiveDetailService] = useState(null);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [showBookingReview, setShowBookingReview] = useState(false);
  const submissionPending = useRef(false);

  // Booking Selection States
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');

  // Date & Availability States
  const todayStr = currentBusinessDate();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Booking Form State
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // Section reveal observer refs
  const aboutRef = useRef(null);
  const servicesRef = useRef(null);
  const profRef = useRef(null);
  const bookingRef = useRef(null);

  // Keyboard escape listener for all modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveDetailService(null);
        setShowReviewsModal(false);
        setShowCredentialsModal(false);
        setShowHoursModal(false);
        if (!submissionPending.current) setShowBookingReview(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 1. Fetch Organization, Services, Providers, Credentials & Reviews on Mount
  useEffect(() => {
    if (!orgId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      organizationService.getOrganizationDetail(orgId),
      organizationService.getServices(orgId),
      organizationService.getProviders(orgId),
      organizationService.getCredentials(orgId).catch(() => []),
      organizationService.getReviews(orgId).catch(() => ({ results: [] })),
    ])
      .then(([orgData, servicesData, providersData, credsData, reviewsData]) => {
        if (!isMounted) return;
        setOrg(orgData);

        const svcList = Array.isArray(servicesData) ? servicesData : servicesData?.results || [];
        const provList = Array.isArray(providersData) ? providersData : providersData?.results || [];
        const credList = Array.isArray(credsData) ? credsData : credsData?.results || orgData?.credentials || [];
        const revList = Array.isArray(reviewsData) ? reviewsData : reviewsData?.results || [];

        const activeSvcs = svcList.filter(s => s.is_active !== false);
        const activeProvs = provList.filter(p => p.is_active !== false);

        setServices(activeSvcs);
        setProviders(activeProvs);
        setCredentials(credList);
        setReviews(revList);

        // Preselect via query parameter or route param if present
        const targetServiceId = serviceId || searchParams.get('service_id');
        const paramProvider = searchParams.get('provider_id');

        if (targetServiceId) {
          const matchSvc = activeSvcs.find(s => s.id === targetServiceId);
          if (matchSvc) {
            setSelectedServiceId(targetServiceId);
            if (serviceId) {
              setActiveDetailService(matchSvc);
            }
          }
        }
        if (paramProvider && activeProvs.some(p => p.id === paramProvider)) {
          setSelectedProviderId(paramProvider);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.response?.data?.detail || 'Failed to load organization profile.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [orgId, serviceId, searchParams]);

  // 2. Fetch Availability Telemetry when Provider, Service, and Date are selected
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    const refreshStatus = () => {
      if (document.visibilityState !== 'visible') return;
      organizationService.getOrganizationDetail(orgId).then(data => {
        if (active) setOrg(previous => previous ? { ...previous, current_status: data.current_status, today_hours: data.today_hours } : previous);
      }).catch(() => { /* Retain the last response until the next refresh. */ });
    };
    const interval = setInterval(refreshStatus, 60000);
    window.addEventListener('focus', refreshStatus);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refreshStatus); };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    let isMounted = true;
    setLoadingAvailability(true);
    appointmentService.getAvailability(orgId, selectedProviderId, selectedServiceId, selectedDate)
      .then((data) => {
        if (!isMounted) return;
        setAvailability(data);
      })
      .catch(() => {
        if (isMounted) setAvailability(null);
      })
      .finally(() => {
        if (isMounted) setLoadingAvailability(false);
      });

    return () => { isMounted = false; };
  }, [orgId, selectedProviderId, selectedServiceId, selectedDate]);

  // Smooth scroll to booking section
  const scrollToBooking = () => {
    if (bookingSectionRef.current) {
      bookingSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Filtered Providers list based on selected service in booking section
  const filteredBookingProviders = useMemo(() => {
    if (!selectedServiceId) return providers;
    return providers.filter(p => {
      return p.service_charges?.some(s => s.service_id === selectedServiceId);
    });
  }, [providers, selectedServiceId]);

  // Check if date is in the past
  const isPastDate = useMemo(() => {
    if (!selectedDate) return false;
    return selectedDate < todayStr;
  }, [selectedDate, todayStr]);

  // Booking handlers
  const handleBookingServiceChange = (e) => {
    const newServiceId = e.target.value;
    setSelectedServiceId(newServiceId);
    setSelectedProviderId('');
    setAvailability(null);
  };

  const handleBookingProviderChange = (e) => {
    setSelectedProviderId(e.target.value);
  };

  const handleBookingDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  // Open Service Details Modal
  const handleViewServiceDetails = (svc) => {
    setActiveDetailService(svc);
  };

  // Close Service Details Modal
  const handleCloseServiceDetails = () => {
    setActiveDetailService(null);
    if (serviceId) {
      navigate(`/organizations/${orgId}`, { replace: true });
    }
  };

  // Schedule CTA inside Service Details Modal
  const handleScheduleFromServiceDetail = (svc) => {
    setSelectedServiceId(svc.id);
    setSelectedProviderId('');
    setAvailability(null);
    handleCloseServiceDetails();
    setTimeout(() => {
      scrollToBooking();
    }, 150);
  };

  const selectedService = services.find(service => service.id === selectedServiceId);
  const selectedProvider = providers.find(provider => provider.id === selectedProviderId);
  const selectedCharge = providerCharge(selectedProvider, selectedServiceId);
  const hasCharge = selectedCharge !== null && selectedCharge !== undefined && selectedCharge !== '' && Number.isFinite(Number(selectedCharge));
  const reviewReady = Boolean(selectedService && selectedProvider && selectedDate && contact.valid && hasCharge && !isPastDate);

  const validateBookingReview = () => {
    if (!contact.valid) { setBookingError('Enter a customer name and a valid Bangladesh mobile number.'); return false; }
    if (!orgId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setBookingError('Please select a service, professional, and date.');
      return false;
    }

    if (isPastDate) {
      setBookingError('Appointments cannot be booked for a past date.');
      return false;
    }
    if (!hasCharge) { setBookingError('Service charge is unavailable. Please select another professional or try again.'); return false; }
    return true;
  };

  const handleReviewBooking = (e) => {
    e.preventDefault();
    if (submissionPending.current || !validateBookingReview()) return;
    setBookingError(null);
    setShowBookingReview(true);
  };

  // The review action never books; only modal confirmation reaches this request.
  const handleBookSubmit = async () => {
    if (!showBookingReview || submissionPending.current || !validateBookingReview()) return;
    submissionPending.current = true;

    setSubmitting(true);
    setBookingError(null);

    try {
      const result = await appointmentService.bookAppointment(orgId, {
        provider_id: selectedProviderId,
        service_id: selectedServiceId,
        appointment_date: selectedDate,
        notes,
        ...contact.payload,
      });
      setBookedAppointment(result);
      setShowBookingReview(false);
    } catch (err) {
      const msg = getBookingError(err, 'Failed to book appointment.');
      setBookingError(typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setSubmitting(false);
      submissionPending.current = false;
    }
  };

  // Domain cover fallback
  const getDomainCoverFallback = () => {
    const ind = (org?.industry_type || org?.category || '').toLowerCase();
    if (ind.includes('health') || ind.includes('medical') || ind.includes('clinic')) {
      return 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80';
    } else if (ind.includes('legal') || ind.includes('law')) {
      return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';
    } else if (ind.includes('beauty') || ind.includes('salon') || ind.includes('spa')) {
      return 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80';
    }
    return 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80';
  };

  if (loading) {
    return (
      <div className="lp-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicNavbar activePage="organizations" />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '64px' }}>
          <LoadingState message="Loading organization profile..." />
        </main>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="lp-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicNavbar activePage="organizations" />
        <main style={{ flex: 1, paddingTop: '100px', paddingBottom: '3rem' }}>
          <div className="org-profile-container">
            <EmptyState title="Organization Not Found" description={error || "The requested organization is not available."} />
          </div>
        </main>
      </div>
    );
  }

  const coverSrc = org.cover_image || getDomainCoverFallback();
  const rawRating = org.rating ? Number(org.rating) : 0;
  const ratingValue = rawRating > 0 ? rawRating.toFixed(1) : (reviews.length > 0 ? (reviews.reduce((a, b) => a + b.rating, 0) / reviews.length).toFixed(1) : null);
  const reviewsCount = org.reviews_count || reviews.length;
  const isSmartQueueVerified = org.verification_status === 'APPROVED' || org.smartqueue_verified;

  return (
    <div className="lp-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 0. GLOBAL SMARTQUEUE PUBLIC NAVBAR */}
      <PublicNavbar activePage="organizations" />

      <main style={{ flex: 1, paddingTop: '84px', paddingBottom: '4rem' }}>
        {/* CENTERED CONTENT CONTAINER (1150px MAX-WIDTH CONSTRAINED) */}
        <div className="org-profile-container">

          {/* 1. ORGANIZATION COVER BANNER */}
          <section className="org-banner-card org-reveal-section">
            <div className="org-banner-img-wrap">
              <img
                src={coverSrc}
                alt={org.name}
                className="org-banner-img"
                onError={(e) => { e.target.src = getDomainCoverFallback(); }}
              />
              <div className="org-banner-scrim" />
              {org.tagline && (
                <div className="org-banner-tagline-wrap">
                  <p className="org-banner-tagline">
                    "{org.tagline}"
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* 2. ORGANIZATION IDENTITY (BELOW BANNER IN DOCUMENT FLOW) */}
          <section className="org-identity-section org-reveal-section">
            <div className="org-identity-left">
              <h1 className="org-identity-name">{org.name}</h1>
              <div className="org-identity-meta">
                <span className="org-category-label">
                  {org.industry_label || org.industry_type || 'Professional Organization'}
                </span>
                {isSmartQueueVerified && (
                  <span className="org-verified-badge" title="Verified by SmartQueue Platform">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    SmartQueue Verified
                  </span>
                )}
              </div>
            </div>

            <div className="org-identity-right">
              <button
                type="button"
                onClick={scrollToBooking}
                className="lp-btn-primary org-identity-cta"
              >
                <svg
                  className="org-cta-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
                  <path d="M3 9.75h18" />
                  <path d="M8 2.5v4" />
                  <path d="M16 2.5v4" />
                  <path d="M12 13.25v5" />
                  <path d="M9.5 15.75h5" />
                </svg>
                Schedule Appointment
              </button>
            </div>
          </section>

          {/* 3. ABOUT + TRUST & CREDENTIALS / CONTACT & HOURS (BALANCED 2-COLUMN) */}
          <section ref={aboutRef} className="org-about-contact-section org-reveal-section">
            {/* Full-width About, followed by two naturally stretched cards. */}
            <div className="org-about-col">
              <h3 className="org-subheading">About {org.name}</h3>
              <p className="org-about-text">
                {org.description || 'Welcome to our organization. We provide professional queue-based consultations and services tailored to your specific needs with transparent serial allocation.'}
              </p>
            </div>

              {/* TRUST & CREDENTIALS SECTION (FILLS SPACE INTELLIGENTLY) */}
              <div className="org-trust-block">
                <div className="org-trust-header">
                  <div className="org-trust-title">
                    <span className="org-trust-icon">🛡️</span>
                    <span>Trust & Verified Credentials</span>
                  </div>
                  {credentials.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCredentialsModal(true)}
                      className="org-text-link"
                    >
                      View Credentials <span className="org-arrow">→</span>
                    </button>
                  )}
                </div>

                <div className="org-trust-items">
                  {/* SmartQueue Verification Notice */}
                  <div className="org-trust-row">
                    <span className="org-trust-badge-icon">✓</span>
                    <div className="org-trust-row-content">
                      <strong>SmartQueue Platform Verified</strong>
                      <p>Identity, physical address, and storefront ownership verified by SmartQueue Platform.</p>
                    </div>
                  </div>

                  {/* Registered Official Credentials */}
                  {credentials.length > 0 ? (
                    credentials.slice(0, 2).map((cred) => (
                      <div key={cred.id} className="org-trust-row">
                        <span className="org-trust-badge-icon">📜</span>
                        <div className="org-trust-row-content">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <strong>{cred.credential_name}</strong>
                            <span className="org-trust-status-pill">Verified</span>
                          </div>
                          <p>
                            Issued by {cred.issuing_authority || 'Regulatory Authority'} {cred.masked_number ? `• ID: ${cred.masked_number}` : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="org-trust-row">
                      <span className="org-trust-badge-icon">📋</span>
                      <div className="org-trust-row-content">
                        <strong>Official Organization Credentials</strong>
                        <p>Regulatory trade and professional licenses are documented with SmartQueue Compliance.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            {/* RIGHT COLUMN: Contact, Reviews & Operating Hours */}
            <div className="org-contact-col">
              <h4 className="org-contact-heading">Contact & Location</h4>
              <div className="org-contact-list">
                {org.address && (
                  <div className="org-contact-item">
                    <span className="org-contact-icon">📍</span>
                    <span>{org.address}</span>
                  </div>
                )}
                {org.phone_number && (
                  <div className="org-contact-item">
                    <span className="org-contact-icon">☎</span>
                    <span>{org.phone_number}</span>
                  </div>
                )}
                {org.email && (
                  <div className="org-contact-item">
                    <span className="org-contact-icon">✉</span>
                    <span>{org.email}</span>
                  </div>
                )}
              </div>

              {/* REVIEWS SUMMARY */}
              <div className="org-reviews-summary">
                <div className="org-reviews-score">
                  <span className="org-reviews-star">★</span>
                  <span className="org-reviews-num">{ratingValue || '—'}</span>
                  <span className="org-reviews-count">
                    {reviewsCount > 0 ? `Based on ${reviewsCount} reviews` : 'No reviews yet'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewsModal(true)}
                  className="org-see-reviews-btn"
                >
                  See Reviews <span className="org-arrow">→</span>
                </button>
              </div>

              {/* ORGANIZATION OPERATING HOURS */}
              <div className="org-hours-summary">
                <div className="org-hours-info">
                  <span className="org-hours-icon">🕒</span>
                  <span className="org-hours-text" style={{ color: org.current_status?.is_open_now === true ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {org.current_status?.status_label || 'Hours unavailable'}
                    {org.current_status?.status_detail && <span style={{ display: 'block', fontWeight: 400 }}>{org.current_status.status_detail}</span>}
                  </span>
                </div>
                {(
                  <button
                    type="button"
                    onClick={() => setShowHoursModal(true)}
                    className="org-hours-link-btn"
                  >
                    View Hours <span className="org-arrow">→</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          <hr className="org-thin-divider" />

          {/* 4. OUR SERVICES (DISCOVERY ONLY — NO SELECT BUTTON) */}
          <section ref={servicesRef} className="org-services-section org-reveal-section">
            <div className="org-services-header">
              <h3 className="org-section-title">Our Services</h3>
              <p className="org-section-subtitle">
                Explore the services offered by {org.name}.
              </p>
            </div>

            {services.length === 0 ? (
              <EmptyState title="No Active Services" description="No services are currently published for this organization." />
            ) : (
              <div className="org-services-grid">
                {services.map((svc) => {
                  const durationMins = svc.duration_minutes || 30;
                  const svcImg = getServiceImage(svc, org);
                  const displayDesc = svc.short_description || svc.description;

                  return (
                    <div key={svc.id} className="org-service-card">
                      <div className="org-service-card-img-wrap">
                        <img
                          src={svcImg}
                          alt={svc.name}
                          className="org-service-card-img"
                          onError={(e) => {
                            e.target.src = getDomainCoverFallback();
                          }}
                        />
                      </div>

                      <div className="org-service-card-body">
                        <div>
                          <h4 className="org-service-card-title">{svc.name}</h4>
                          {displayDesc && (
                            <p className="org-service-card-desc">{displayDesc}</p>
                          )}
                        </div>

                        <div className="org-service-card-footer">
                          <div className="org-service-card-meta">
                            <span className="org-service-duration">⏱ ~{durationMins} min</span>
                            {svc && (
                              <span className="org-service-price">{startingPrice(svc)}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleViewServiceDetails(svc)}
                            className="org-view-details-btn"
                          >
                            View Service Details <span className="org-arrow">→</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <hr className="org-thin-divider" />

          {/* 5. OUR RENOWNED PROFESSIONALS (HORIZONTAL CAROUSEL) */}
          <section ref={profRef} className="org-professionals-section org-reveal-section">
            <ProfessionalCarousel
              providers={providers}
              orgId={orgId}
              organizationName={org.name}
            />
          </section>

          <hr className="org-thin-divider" />

          {/* 6. SCHEDULE AN APPOINTMENT (SERIAL QUEUE BOOKING SECTION) */}
          <section ref={bookingSectionRef} className="org-booking-section org-reveal-section">
            <div className="org-booking-header">
              <h3 className="org-section-title">Schedule an Appointment</h3>
              <p className="org-section-subtitle">
                Select your service, choose an available professional, and join the verified queue at {org.name}.
              </p>
            </div>

            {bookedAppointment ? (
              <div className="org-booking-success-card">
                <div className="org-booking-success-icon">✓</div>
                <h4 className="org-booking-success-title">Appointment Confirmed!</h4>
                <p className="org-booking-success-desc">
                  Your serial queue reservation has been created for {org.name}.
                </p>
                <div className="org-booking-success-details">
                  <div><strong>Serial Number:</strong> #{bookedAppointment.serial_number || bookedAppointment.queue_number || '1'}</div>
                  <div><strong>Date:</strong> {bookedAppointment.appointment_date || selectedDate}</div>
                  <div><strong>Status:</strong> {bookedAppointment.status || 'CONFIRMED'}</div>
                  <BookingSummary organization={org} service={services.find(s => s.id === selectedServiceId)} provider={providers.find(p => p.id === selectedProviderId)} appointment={bookedAppointment} />
                  {bookedAppointment.estimated_service_time && (
                    <div><strong>Estimated Time:</strong> {new Date(bookedAppointment.estimated_service_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  )}
                </div>
                <div className="org-booking-success-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setBookedAppointment(null);
                      setNotes('');
                    }}
                    className="lp-btn-secondary"
                  >
                    Book Another Appointment
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/customer/appointments')}
                    className="lp-btn-primary"
                  >
                    View My Appointments <span className="org-arrow">→</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReviewBooking} className="org-booking-form-card">
                {bookingError && (
                  <div className="org-booking-error-banner">
                    {bookingError}
                  </div>
                )}

                <div className="org-booking-grid">
                  {/* Service Selection */}
                  <div className="org-form-group">
                    <label className="org-form-label">Service</label>
                    <select
                      value={selectedServiceId}
                      onChange={handleBookingServiceChange}
                      className="org-form-select"
                      required
                    >
                      <option value="">Select a service ▾</option>
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.duration_minutes || 30} min) — {startingPrice(s)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Professional Selection */}
                  <div className="org-form-group">
                    <label className="org-form-label">Professional</label>
                    <select
                      value={selectedProviderId}
                      onChange={handleBookingProviderChange}
                      className="org-form-select"
                      disabled={!selectedServiceId}
                      required
                    >
                      <option value="">
                        {!selectedServiceId ? 'Select a service first' : 'Select professional ▾'}
                      </option>
                      {filteredBookingProviders.map(p => {
                        const { displayName: name, designation, showDesignation } = deriveProfessionalDisplay(p);
                        return (
                          <option key={p.id} value={p.id}>
                            {name} {showDesignation ? `(${designation})` : ''} — {formatCurrency(providerCharge(p, selectedServiceId)) || 'Price unavailable'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Appointment Date */}
                  <div className="org-form-group">
                    <label className="org-form-label">Appointment Date</label>
                    <input
                      type="date"
                      min={todayStr}
                      value={selectedDate}
                      onChange={handleBookingDateChange}
                      className="org-form-input"
                      required
                    />
                    {isPastDate && (
                      <p className="org-form-hint-error">
                        Cannot select a past date.
                      </p>
                    )}
                  </div>
                </div>

                {/* Availability Telemetry Display */}
                {selectedServiceId && selectedProviderId && (
                  <div className="org-availability-box">
                    <div className="org-availability-header">
                      <span className="org-availability-dot" />
                      <strong>Queue Availability for {selectedDate}</strong>
                    </div>

                    {loadingAvailability ? (
                      <p className="org-availability-loading">Checking provider schedule...</p>
                    ) : availability ? (
                      <div className="org-availability-content">
                        <div className="org-availability-window">
                          Working Hours: <strong>{availability.working_hours || availability.start_time ? `${availability.start_time || '10:00 AM'} – ${availability.end_time || '06:00 PM'}` : '10:00 AM – 6:00 PM'}</strong>
                        </div>
                        <div className="org-availability-status">
                          {availability.is_available === false ? (
                            <span className="org-avail-badge org-avail-unavailable">
                              Provider unavailable or on leave on this date
                            </span>
                          ) : (
                            <span className="org-avail-badge org-avail-available">
                              ✓ Available for Serial Queue Booking (Capacity: {availability.capacity_remaining !== undefined ? availability.capacity_remaining : 'Open'})
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="org-availability-content">
                        <span className="org-avail-badge org-avail-available">
                          ✓ Provider schedule active (10:00 AM – 6:00 PM) • Serial capacity available
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Additional Notes */}
                <BookingContactFields contact={contact} />
                {selectedServiceId && selectedProviderId && !hasCharge && <p className="org-form-error" role="alert">Service charge is unavailable. Please select another professional or try again.</p>}
                <div className="org-form-group" style={{ marginTop: '1.25rem' }}>
                  <label className="org-form-label">
                    Additional Notes for Provider (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Briefly describe your request or any preliminary information..."
                    className="org-form-textarea"
                  />
                </div>

                {/* Submit CTA */}
                <div className="org-form-submit-wrap">
                  <button
                    type="submit"
                    disabled={submitting || loadingAvailability || !reviewReady}
                    className="lp-btn-primary org-submit-btn"
                  >
                    Review & Confirm Booking
                  </button>
                </div>
              </form>
            )}
          </section>

        </div>

        {showBookingReview && (
          <div className="org-modal-overlay" onClick={() => { if (!submissionPending.current) setShowBookingReview(false); }}>
            <div className="org-modal-card org-booking-review-card" role="dialog" aria-modal="true" aria-labelledby="booking-review-title" onClick={e => e.stopPropagation()}>
              <div className="org-modal-body org-booking-review-body">
                <h2 className="org-modal-title" id="booking-review-title">Review Your Booking</h2>
                <p className="org-about-text">Check your details before confirming your queue serial.</p>
                <BookingSummary organization={org} service={selectedService} provider={selectedProvider}
                  date={new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  contact={{ ...contact, name: contact.payload.contact_name, phone: contact.payload.contact_phone }} charge={selectedCharge} notes={notes.trim()} />
                <div className="org-modal-serial-notice">You are booking a queue serial, not a fixed consultation start time.</div>
                {bookingError && <p className="org-form-error" role="alert">{bookingError}</p>}
              </div>
              <div className="org-booking-review-actions">
                <button type="button" className="lp-btn-outline" autoFocus disabled={submitting} onClick={() => setShowBookingReview(false)}>Back & Edit</button>
                <button type="button" className="lp-btn-primary" disabled={submitting || !reviewReady} onClick={handleBookSubmit}>
                  {submitting ? 'Booking & Allocating Serial...' : 'Confirm Serial Booking'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── ENRICHED SERVICE DETAILS MODAL (PHASE A.9.4) ─────────────── */}
      {activeDetailService && (
        <div className="org-modal-overlay" onClick={handleCloseServiceDetails}>
          <div className="org-modal-card org-service-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleCloseServiceDetails}
              className="org-modal-close-btn"
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="org-modal-img-wrap org-service-modal-img-wrap">
              <img
                src={getServiceImage(activeDetailService, org)}
                alt={activeDetailService.name}
                className="org-modal-img"
              />
            </div>

            <div className="org-modal-body">
              <div className="org-modal-header-row">
                <span className="org-modal-org-tag">{org.name}</span>
                <span className="org-modal-duration">⏱ ~{activeDetailService.duration_minutes || 30} min</span>
              </div>

              <h2 className="org-modal-title">{activeDetailService.name}</h2>

              {activeDetailService && (
                <div className="org-modal-price">{startingPrice(activeDetailService)}</div>
              )}

              {/* Service Overview */}
              <div className="org-modal-desc-section">
                <h4 className="org-modal-section-title">Service Overview</h4>
                <p className="org-modal-desc">
                  {activeDetailService.detailed_description || activeDetailService.description || 'Full professional consultation and service delivery under standard organizational protocols.'}
                </p>
              </div>

              {/* What This Service Covers (Scope / Highlights) */}
              {activeDetailService.service_scope && Array.isArray(activeDetailService.service_scope) && activeDetailService.service_scope.length > 0 && (
                <div className="org-modal-scope-section">
                  <h4 className="org-modal-section-title">What This Service Covers</h4>
                  <ul className="org-modal-scope-list">
                    {activeDetailService.service_scope.map((item, idx) => (
                      <li key={idx} className="org-modal-scope-item">
                        <span className="org-modal-scope-check">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* How It Works (Process Steps) */}
              {activeDetailService.process_steps && Array.isArray(activeDetailService.process_steps) && activeDetailService.process_steps.length > 0 && (
                <div className="org-modal-steps-section">
                  <h4 className="org-modal-section-title">How It Works</h4>
                  <div className="org-modal-steps-grid">
                    {activeDetailService.process_steps.map((st, idx) => (
                      <div key={idx} className="org-modal-step-card">
                        <span className="org-modal-step-num">
                          {String(st.step_number || idx + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <strong>{st.title}</strong>
                          <p>{st.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What You May Need / Preparation Notes */}
              {activeDetailService.preparation_notes && Array.isArray(activeDetailService.preparation_notes) && activeDetailService.preparation_notes.length > 0 && (
                <div className="org-modal-notes-section">
                  <h4 className="org-modal-section-title">What You May Need / Before Your Visit</h4>
                  <ul className="org-modal-notes-list">
                    {activeDetailService.preparation_notes.map((req, idx) => (
                      <li key={idx}>• {req}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Serial Queue Booking Notice */}
              <div className="org-modal-serial-notice">
                <span className="org-modal-notice-icon">ℹ️</span>
                <div>
                  <strong>Serial Queue Booking Architecture</strong>
                  <p>
                    Your serial number is assigned after booking confirmation. Your estimated service window is an authoritative live forecast that updates dynamically as earlier patients or clients are served.
                  </p>
                </div>
              </div>

              {/* Important Information */}
              {activeDetailService.important_information && Array.isArray(activeDetailService.important_information) && activeDetailService.important_information.length > 0 && (
                <div className="org-modal-important-section">
                  <h4 className="org-modal-section-title">Important Information</h4>
                  <ul className="org-modal-notes-list">
                    {activeDetailService.important_information.map((info, idx) => (
                      <li key={idx}>• {info}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Eligible Professionals (Clean, Deduplicated rows) */}
              {providers.length > 0 && (
                <div className="org-modal-providers-section">
                  <h4 className="org-modal-section-title">Available Professionals for this Service</h4>
                  <div className="org-modal-prov-rows">
                    {providers
                      .filter(p => {
                        return p.service_charges?.some(s => s.service_id === activeDetailService.id);
                      })
                      .map(p => {
                        const { displayName, designation, showDesignation } = deriveProfessionalDisplay(p, 'Professional');
                        return (
                          <div key={p.id} className="org-modal-prov-row">
                            <div className="org-modal-prov-info">
                              <span className="org-modal-prov-avatar">👤</span>
                              <div>
                                <span className="org-modal-prov-name">{displayName}</span>
                                <span className="org-modal-prov-exp">Service Charge: {formatCurrency(providerCharge(p, activeDetailService.id)) || 'Price unavailable'}</span>
                                {showDesignation && <span className="org-modal-prov-desig">{designation}</span>}
                                {p.experience_years > 0 && (
                                  <span className="org-modal-prov-exp">{p.experience_years} yrs exp</span>
                                )}
                              </div>
                            </div>
                            <Link
                              to={`/organizations/${orgId}/providers/${p.id}`}
                              className="org-modal-prov-link"
                            >
                              View Profile <span className="org-arrow">→</span>
                            </Link>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="org-modal-actions" style={{ marginTop: '1.75rem' }}>
                <button
                  type="button"
                  onClick={() => handleScheduleFromServiceDetail(activeDetailService)}
                  className="lp-btn-primary"
                  style={{ width: '100%', padding: '0.9rem 1.25rem', fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'normal', display: 'block' }}
                >
                  Schedule Appointment for this Service <span className="org-arrow">→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREDENTIALS MODAL (PHASE A.9.4) ─────────────────────────── */}
      {showCredentialsModal && (
        <div className="org-modal-overlay" onClick={() => setShowCredentialsModal(false)}>
          <div className="org-modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowCredentialsModal(false)}
              className="org-modal-close-btn"
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="org-modal-body" style={{ paddingTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🛡️</span>
                <h3 className="org-modal-title" style={{ fontSize: '1.4rem', margin: 0 }}>
                  Verified Organization Credentials
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-sec)', margin: '0 0 1.25rem 0' }}>
                Official regulatory registrations and professional accreditations verified for {org.name}.
              </p>

              <div className="org-creds-modal-list">
                {/* SmartQueue Platform Verification */}
                <div className="org-cred-card">
                  <div className="org-cred-card-header">
                    <span className="org-cred-type-tag">Platform Standing</span>
                    <span className="org-cred-verified-pill">✓ Verified by SmartQueue</span>
                  </div>
                  <h4 className="org-cred-card-title">SmartQueue Identity & Storefront Verification</h4>
                  <p className="org-cred-card-meta">
                    Authority: SmartQueue Platform Trust & Safety Review<br />
                    Scope: Physical address, business presence, and queue operational standing verified.
                  </p>
                </div>

                {/* External Regulatory Credentials */}
                {credentials.map((cred) => (
                  <div key={cred.id} className="org-cred-card">
                    <div className="org-cred-card-header">
                      <span className="org-cred-type-tag">{cred.credential_type_label || 'Official Credential'}</span>
                      <span className="org-cred-verified-pill">✓ Verified by SmartQueue</span>
                    </div>
                    <h4 className="org-cred-card-title">{cred.credential_name}</h4>
                    <div className="org-cred-card-meta">
                      {cred.issuing_authority && (
                        <div><strong>Issuing Authority:</strong> {cred.issuing_authority}</div>
                      )}
                      {cred.masked_number && (
                        <div><strong>Credential ID:</strong> {cred.masked_number}</div>
                      )}
                      <div>
                        <strong>Validity:</strong> {cred.issued_date || 'Documented'} {cred.expiry_date ? `through ${cred.expiry_date}` : '• Permanent'}
                      </div>
                      {cred.verified_at && (
                        <div><strong>Verified Date:</strong> {new Date(cred.verified_at).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="org-cred-privacy-notice">
                🔒 Official licenses and registrations are verified securely by SmartQueue Compliance. Sensitive personal documents and taxpayer identifiers are never exposed publicly.
              </div>

              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowCredentialsModal(false)}
                  className="lp-btn-secondary"
                  style={{ width: '100%' }}
                >
                  Close Credentials
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── OPERATING HOURS MODAL (PHASE A.9.4) ───────────────────────── */}
      {showHoursModal && (
        <div className="org-modal-overlay" onClick={() => setShowHoursModal(false)}>
          <div className="org-modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowHoursModal(false)}
              className="org-modal-close-btn"
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="org-modal-body" style={{ paddingTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🕒</span>
                <h3 className="org-modal-title" style={{ fontSize: '1.35rem', margin: 0 }}>
                  Organization Operating Hours
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-sec)', margin: '0 0 1.25rem 0' }}>
                General office and facility opening schedule for {org.name}.
              </p>

              <div className="org-hours-table">
                {org.operating_hours && org.operating_hours.length > 0 ? (
                  org.operating_hours.map((h) => {
                    const formatTime = (t) => {
                      if (!t) return '';
                      const [hh, mm] = t.split(':');
                      const hour = parseInt(hh, 10);
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      const formattedHour = hour % 12 || 12;
                      return `${formattedHour}:${mm} ${ampm}`;
                    };
                    return (
                      <div key={h.id || h.day_of_week} className="org-hours-row">
                        <span className="org-hours-day">{h.day_name}</span>
                        <span className="org-hours-time">
                          {h.is_closed ? (
                            <span className="org-hours-closed-badge">Closed</span>
                          ) : (
                            `${formatTime(h.open_time)} – ${formatTime(h.close_time)}`
                          )}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--lp-muted)' }}>
                    Operating hours are unavailable. Contact the organization for details.
                  </p>
                )}
              </div>

              <div className="org-cred-privacy-notice" style={{ marginTop: '1.25rem' }}>
                ℹ️ Organization operating hours represent general facility open times. Provider consultation availability is scheduled independently in the booking section.
              </div>

              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowHoursModal(false)}
                  className="lp-btn-secondary"
                  style={{ width: '100%' }}
                >
                  Close Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GENUINE REVIEWS MODAL (PHASE A.9.4 NO FAKE TESTIMONIALS) ──── */}
      {showReviewsModal && (
        <div className="org-modal-overlay" onClick={() => setShowReviewsModal(false)}>
          <div className="org-modal-card" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowReviewsModal(false)}
              className="org-modal-close-btn"
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="org-modal-body" style={{ paddingTop: '2rem' }}>
              <h3 className="org-modal-title" style={{ fontSize: '1.4rem' }}>
                Verified Customer Reviews
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-sec)', margin: '0 0 1rem 0' }}>
                Authentic feedback from verified completed serial queue appointments.
              </p>

              {reviews.length > 0 ? (
                <>
                  <div className="org-reviews-modal-score-box">
                    <div className="org-reviews-big-star">★ {ratingValue || '5.0'}</div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-sec)', margin: '0.25rem 0 0 0' }}>
                      Based on {reviews.length} authentic customer reviews
                    </p>
                  </div>

                  <div className="org-reviews-list">
                    {reviews.map((rev) => (
                      <div key={rev.id} className="org-review-item">
                        <div className="org-review-item-header">
                          <strong>{rev.customer_name || 'Verified Client'}</strong>
                          <span className="org-review-item-stars">
                            {'★'.repeat(rev.rating)}{'☆'.repeat(Math.max(0, 5 - rev.rating))}
                          </span>
                        </div>
                        {rev.comment ? (
                          <p className="org-review-item-text">{rev.comment}</p>
                        ) : (
                          <p className="org-review-item-text" style={{ fontStyle: 'italic', color: 'var(--lp-muted)' }}>
                            Rating submitted without written comment.
                          </p>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--lp-muted)' }}>
                          <span>{rev.service_name ? `Service: ${rev.service_name}` : 'Verified Appointment'}</span>
                          <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="org-reviews-empty-state">
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.35rem 0' }}>
                    No Reviews Submitted Yet
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-sec)', margin: 0, lineHeight: 1.5 }}>
                    SmartQueue enforces strict review authenticity. Only verified customers with completed appointments can submit ratings and reviews.
                  </p>
                </div>
              )}

              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowReviewsModal(false)}
                  className="lp-btn-secondary"
                  style={{ width: '100%' }}
                >
                  Close Reviews
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. SITE FOOTER */}
      <footer className="lp-footer" style={{ marginTop: 'auto' }}>
        <div className="lp-footer-bottom" style={{ maxWidth: '1150px', margin: '0 auto', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid var(--lp-border)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--lp-muted)' }}>
            © 2026 SmartQueue Platform. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--lp-text-sec)' }}>
            <Link to="/organizations" className="lp-footer-link">Organizations</Link>
            <Link to="/search" className="lp-footer-link">Search</Link>
            <Link to="/contact" className="lp-footer-link">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default OrganizationProfilePage;
