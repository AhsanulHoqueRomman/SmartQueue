import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import '../../styles/LandingPage.css';

const PENDING_BOOKING_KEY = 'sq_pending_booking';

const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

export function OrganizationProfilePage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { selectOrg } = useTenant();

  // Profile State
  const [org, setOrg] = useState(null);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Booking Flow State
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [conflictError, setConflictError] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // 1. Fetch Organization, Services, and Providers Resiliently
  useEffect(() => {
    if (!organizationId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    organizationService.getOrganizationDetail(organizationId)
      .then(async (orgData) => {
        if (!isMounted) return;
        setOrg(orgData);
        selectOrg(orgData.id);

        let svcList = [];
        let provList = [];

        try {
          const servicesData = await organizationService.getServices(organizationId);
          svcList = (Array.isArray(servicesData) ? servicesData : servicesData.results || []).filter(s => s.is_active !== false);
        } catch (e) {
          console.warn('Could not load services:', e);
        }

        try {
          const providersData = await organizationService.getProviders(organizationId);
          provList = (Array.isArray(providersData) ? providersData : providersData.results || []).filter(p => p.is_active !== false);
        } catch (e) {
          console.warn('Could not load providers:', e);
        }

        if (!isMounted) return;
        setServices(svcList);
        setProviders(provList);

        // Check for URL query params or pending booking in storage
        const storedBookingJson = sessionStorage.getItem(PENDING_BOOKING_KEY);
        let restored = false;
        if (storedBookingJson) {
          try {
            const pb = JSON.parse(storedBookingJson);
            if (pb.orgId === organizationId) {
              if (pb.serviceId && svcList.some(s => s.id === pb.serviceId)) setSelectedServiceId(pb.serviceId);
              if (pb.providerId && provList.some(p => p.id === pb.providerId)) setSelectedProviderId(pb.providerId);
              if (pb.date) setSelectedDate(pb.date);
              if (pb.slot) setSelectedSlot(pb.slot);
              if (pb.notes) setNotes(pb.notes);
              restored = true;
              sessionStorage.removeItem(PENDING_BOOKING_KEY);
            }
          } catch (e) {
            sessionStorage.removeItem(PENDING_BOOKING_KEY);
          }
        }

        if (!restored) {
          const paramService = searchParams.get('service_id');
          const paramProvider = searchParams.get('provider_id');

          if (paramService && svcList.some(s => s.id === paramService)) {
            setSelectedServiceId(paramService);
          } else if (svcList.length > 0) {
            setSelectedServiceId(svcList[0].id);
          }

          if (paramProvider && provList.some(p => p.id === paramProvider)) {
            setSelectedProviderId(paramProvider);
          } else if (provList.length > 0) {
            setSelectedProviderId(provList[0].id);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.detail || 'Failed to load organization profile.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [organizationId]);

  // 2. Fetch Availability Slots
  const fetchAvailability = async () => {
    if (!organizationId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    setLoadingAvailability(true);
    setBookingError(null);
    setConflictError(false);

    try {
      const data = await appointmentService.getAvailability(
        organizationId,
        selectedProviderId,
        selectedServiceId,
        selectedDate
      );
      setAvailability(data);
    } catch (err) {
      setBookingError(
        err.response?.data?.detail ||
        err.response?.data?.date?.[0] ||
        'Failed to load available slots.'
      );
      setAvailability(null);
    } finally {
      setLoadingAvailability(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [organizationId, selectedProviderId, selectedServiceId, selectedDate]);

  const handleSelectService = (svcId) => {
    setSelectedServiceId(svcId);
    setSelectedSlot(null);
    const bookingSection = document.getElementById('appointment-booking-section');
    if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectProvider = (provId) => {
    setSelectedProviderId(provId);
    setSelectedSlot(null);
    const bookingSection = document.getElementById('appointment-booking-section');
    if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      setBookingError('Please select an available time slot.');
      return;
    }

    // Unauthenticated user flow: save state & redirect to login
    if (!isAuthenticated) {
      const pendingState = {
        orgId: organizationId,
        serviceId: selectedServiceId,
        providerId: selectedProviderId,
        date: selectedDate,
        slot: selectedSlot,
        notes: notes,
      };
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(pendingState));
      navigate(`/login?redirect=/organizations/${organizationId}`);
      return;
    }

    setSubmitting(true);
    setBookingError(null);
    setConflictError(false);

    try {
      const appointment = await appointmentService.bookAppointment(organizationId, {
        provider_id: selectedProviderId,
        service_id: selectedServiceId,
        start_datetime: selectedSlot.start,
        notes: notes,
      });

      setBookedAppointment(appointment);
    } catch (err) {
      const status = err.response?.status;
      const errorData = err.response?.data;

      if (status === 409 || errorData?.code === 'DOUBLE_BOOKING_CONFLICT' || errorData?.detail?.includes('conflict') || errorData?.detail?.includes('booked')) {
        setConflictError(true);
        setBookingError('This slot is no longer available because another booking occurred. Please select a different slot.');
        fetchAvailability();
      } else {
        const msg =
          errorData?.detail ||
          errorData?.non_field_errors?.[0] ||
          errorData?.start_datetime?.[0] ||
          'Failed to book appointment. Please check your selections and try again.';
        setBookingError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  const formatSlotTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };

  if (loading) {
    return <LoadingState message="Loading organization profile..." />;
  }

  if (error || !org) {
    return (
      <EmptyState
        title="Organization Unavailable"
        message={error?.includes('404') || error?.includes('Not Found') ? 'This organization is currently unavailable for booking.' : (error || 'This organization is currently unavailable for booking.')}
        actionText="Back to Organizations"
        onAction={() => navigate('/organizations')}
      />
    );
  }

  // Booking Confirmation View
  if (bookedAppointment) {
    return (
      <div className="card animate-page-entrance" style={{ maxWidth: '640px', margin: '2rem auto', textAlign: 'center', boxShadow: 'var(--shadow-xl)', padding: '2rem' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.25rem' }}>
          ✓
        </div>
        <h2 style={{ fontSize: '1.65rem', fontWeight: '700', marginBottom: '0.35rem', color: '#2F2520' }}>
          Appointment Booked Successfully!
        </h2>
        <p style={{ color: '#78716C', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
          Your appointment has been confirmed and registered in {org.name}'s system.
        </p>

        <div className="card" style={{ backgroundColor: '#FAF8F3', border: '1px solid #E6E1D9', textAlign: 'left', marginBottom: '1.75rem', padding: '1.25rem' }}>
          <div className="flex justify-between" style={{ paddingBottom: '0.65rem', borderBottom: '1px solid #E6E1D9' }}>
            <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Organization:</span>
            <strong style={{ color: '#211C19' }}>{org.name}</strong>
          </div>
          <div className="flex justify-between" style={{ padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
            <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Service:</span>
            <strong style={{ color: '#211C19' }}>{bookedAppointment.service_name || selectedService?.name}</strong>
          </div>
          <div className="flex justify-between" style={{ padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
            <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Provider:</span>
            <strong style={{ color: '#211C19' }}>{bookedAppointment.provider_name || selectedProvider?.title || 'Assigned Provider'}</strong>
          </div>
          <div className="flex justify-between" style={{ padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
            <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Date & Time:</span>
            <strong style={{ color: '#211C19' }}>{new Date(bookedAppointment.start_datetime).toLocaleString()}</strong>
          </div>
          <div className="flex justify-between items-center" style={{ paddingTop: '0.65rem' }}>
            <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Status:</span>
            <StatusBadge status={bookedAppointment.status} />
          </div>
        </div>

        <div className="flex justify-center gap-md">
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/customer/appointments')}>
            View My Appointments
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              setBookedAppointment(null);
              setSelectedSlot(null);
              setNotes('');
              fetchAvailability();
            }}
          >
            Book Another
          </button>
        </div>
      </div>
    );
  }

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

      <div className="container animate-page-entrance" style={{ padding: '5.5rem 1.5rem 2rem 1.5rem', maxWidth: '1140px', margin: '0 auto' }}>
      {/* Header Profile Banner */}
      <div
        className="card"
        style={{
          padding: '2rem',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF8F3 100%)',
          border: '1px solid #E6E1D9',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)'
        }}
      >
        <div className="flex flex-wrap justify-between items-start gap-md">
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div className="flex items-center gap-sm" style={{ marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: '#2F2520', margin: 0 }}>
                {org.name}
              </h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#F3F0EA',
                  color: '#5F7A70',
                  border: '1px solid #E6E1D9'
                }}
              >
                Verified Organization
              </span>
            </div>

            {/* Address & Contact Details */}
            <div className="flex flex-wrap gap-md" style={{ color: '#78716C', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
              {org.address && <span>📍 {org.address}</span>}
              {org.phone_number && <span>📞 {org.phone_number}</span>}
              {org.email && <span>✉️ {org.email}</span>}
            </div>

            {/* Rating & Stats */}
            <div className="flex items-center gap-md" style={{ fontSize: '0.9rem' }}>
              <div className="flex items-center gap-xs">
                <span style={{ color: '#EAB308', fontSize: '1.1rem', fontWeight: 'bold' }}>★</span>
                <span style={{ fontWeight: '800', color: '#211C19' }}>
                  {org.rating ? org.rating.toFixed(1) : 'New'}
                </span>
                <span style={{ color: '#78716C' }}>
                  ({org.reviews_count || 0} reviews)
                </span>
              </div>
              <span style={{ color: '#E6E1D9' }}>|</span>
              <span style={{ color: '#78716C' }}>⚙️ {services.length} Services</span>
              <span style={{ color: '#E6E1D9' }}>|</span>
              <span style={{ color: '#78716C' }}>🩺 {providers.length} Providers</span>
            </div>
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              const el = document.getElementById('appointment-booking-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            ✨ Book Appointment
          </button>
        </div>
      </div>

      {/* About & Info Section */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.75rem' }}>
          About {org.name}
        </h2>
        <p style={{ color: '#78716C', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
          {org.name} provides professional, high-quality appointment and queue-based services. Select from our available service catalog and certified providers below to schedule your appointment slot.
        </p>
      </div>

      {/* Services Section */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#2F2520', margin: 0 }}>
              Available Services
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.875rem', margin: 0 }}>
              Select a service to begin your appointment booking.
            </p>
          </div>
        </div>

        {services.length === 0 ? (
          <p style={{ color: '#78716C', fontStyle: 'italic' }}>No active services currently listed for this organization.</p>
        ) : (
          <div className="grid-responsive grid-cols-3 gap-md">
            {services.map((svc) => {
              const isSelected = selectedServiceId === svc.id;
              return (
                <div
                  key={svc.id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    backgroundColor: '#FFFFFF',
                    border: `1.5px solid ${isSelected ? '#5F7A70' : '#E6E1D9'}`,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div className="flex justify-between items-start" style={{ marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#2F2520', margin: 0 }}>
                        {svc.name}
                      </h3>
                      {svc.price && (
                        <span style={{ fontSize: '1rem', fontWeight: '800', color: '#5F7A70' }}>
                          ৳{svc.price}
                        </span>
                      )}
                    </div>
                    {svc.description && (
                      <p style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '0.85rem', lineHeight: '1.4' }}>
                        {svc.description}
                      </p>
                    )}
                    <div style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: '600' }}>
                      ⏱️ Duration: {svc.duration_minutes} minutes
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #E6E1D9' }}>
                    <button
                      type="button"
                      className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'} btn-sm`}
                      style={{ width: '100%' }}
                      onClick={() => handleSelectService(svc.id)}
                    >
                      {isSelected ? '✓ Selected Service' : 'Select Service'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Providers Section */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#2F2520', marginBottom: '0.25rem' }}>
          Certified Providers & Specialists
        </h2>
        <p style={{ color: '#78716C', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Choose a provider to view their specific schedule and dynamic availability.
        </p>

        {providers.length === 0 ? (
          <p style={{ color: '#78716C', fontStyle: 'italic' }}>No active providers currently listed for this organization.</p>
        ) : (
          <div className="grid-responsive grid-cols-3 gap-md">
            {providers.map((prov) => {
              const isSelected = selectedProviderId === prov.id;
              const displayName = prov.title ? `${prov.title}` : `Provider`;
              const emailText = prov.user_email || `Staff Member`;

              return (
                <div
                  key={prov.id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    backgroundColor: '#FFFFFF',
                    border: `1.5px solid ${isSelected ? '#5F7A70' : '#E6E1D9'}`,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between'
                  }}
                >
                  <div>
                    <div className="flex items-center gap-sm" style={{ marginBottom: '0.65rem' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#2F2520', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem' }}>
                        🩺
                      </div>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#2F2520', margin: 0 }}>
                          {displayName}
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: '#78716C' }}>{emailText}</span>
                      </div>
                    </div>

                    {prov.bio && (
                      <p style={{ fontSize: '0.85rem', color: '#78716C', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                        {prov.bio}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    style={{ width: '100%', marginTop: '0.5rem' }}
                    onClick={() => handleSelectProvider(prov.id)}
                  >
                    {isSelected ? '✓ Selected Provider' : 'Select Provider'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Prominent Appointment Booking Section */}
      <div
        id="appointment-booking-section"
        className="card"
        style={{
          padding: '2rem',
          backgroundColor: '#FFFFFF',
          border: '2px solid #5F7A70',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #E6E1D9', pb: '1rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Instant Online Booking
          </span>
          <h2 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#2F2520', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
            Schedule Your Appointment
          </h2>
          <p style={{ color: '#78716C', fontSize: '0.9rem', margin: 0 }}>
            Select your service, provider, and date below to load dynamic real-time slot availability.
          </p>
        </div>

        {bookingError && (
          <div className={`banner ${conflictError ? 'banner-warning' : 'banner-danger'}`} style={{ marginBottom: '1.5rem' }}>
            {bookingError}
          </div>
        )}

        <div className="grid-responsive grid-cols-3 gap-xl">
          {/* Step 1 & 2 Pickers */}
          <div style={{ gridColumn: 'span 1' }} className="flex flex-col gap-md">
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 1</div>
              <label className="label" htmlFor="booking-service-select">Service</label>
              <select
                id="booking-service-select"
                className="input"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
              >
                {services.length === 0 ? (
                  <option value="">No services available</option>
                ) : (
                  services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} ({svc.duration_minutes} min {svc.price ? `- ৳${svc.price}` : ''})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 2</div>
              <label className="label" htmlFor="booking-provider-select">Provider</label>
              <select
                id="booking-provider-select"
                className="input"
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
              >
                {providers.length === 0 ? (
                  <option value="">No providers available</option>
                ) : (
                  providers.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.title ? `${prov.title}` : `Provider #${prov.id.slice(0, 8)}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 3</div>
              <label className="label" htmlFor="booking-date-input">Select Date</label>
              <input
                type="date"
                id="booking-date-input"
                className="input"
                min={todayStr}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot(null);
                }}
              />
            </div>
          </div>

          {/* Step 4 & 5 Slot Selection */}
          <div style={{ gridColumn: 'span 2' }} className="flex flex-col gap-md">
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 4 & 5</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#2F2520', margin: 0 }}>
                Available Time Slots ({selectedDate})
              </h3>
            </div>

            {!selectedServiceId || !selectedProviderId ? (
              <EmptyState
                title="Select Service & Provider"
                message="Choose a service and provider from the left panel to load time slots."
              />
            ) : loadingAvailability ? (
              <LoadingState message="Fetching real-time backend slots..." />
            ) : !availability || !availability.slots || availability.slots.length === 0 ? (
              <EmptyState
                title="No Open Slots"
                message={`No available slots found for ${selectedDate}. Try selecting another date or provider.`}
              />
            ) : (
              <div>
                <div className="grid-responsive grid-cols-3 gap-sm">
                  {availability.slots.map((slot, idx) => {
                    const isSelected = selectedSlot?.start === slot.start;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '0.65rem 0.5rem', fontSize: '0.85rem' }}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setBookingError(null);
                        }}
                      >
                        {formatSlotTime(slot.start)} – {formatSlotTime(slot.end)}
                      </button>
                    );
                  })}
                </div>

                {selectedSlot && (
                  <form onSubmit={handleBookAppointment} style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #E6E1D9' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 6 & 7</div>
                    <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.5rem' }}>
                      Review & Confirm Booking
                    </h4>
                    <div style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '1rem', backgroundColor: '#FAF8F3', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                      <div><strong>Service:</strong> {selectedService?.name}</div>
                      <div><strong>Provider:</strong> {selectedProvider?.title || 'Assigned Provider'}</div>
                      <div><strong>Selected Time:</strong> {new Date(selectedSlot.start).toLocaleString()}</div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="label" htmlFor="profile-booking-notes" style={{ fontSize: '0.85rem' }}>
                        Additional Notes (Optional)
                      </label>
                      <textarea
                        id="profile-booking-notes"
                        className="input"
                        rows="2"
                        placeholder="Add any specific requests or instructions for your provider..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    {!isAuthenticated && (
                      <p style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: '600', marginBottom: '0.75rem' }}>
                        ℹ️ You will be prompted to log in to complete your booking. Your selected slot choice will be preserved!
                      </p>
                    )}

                    <button type="submit" disabled={submitting} className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                      {submitting ? 'Confirming Booking...' : isAuthenticated ? 'Confirm & Book Appointment Now' : 'Log In to Confirm Booking'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
}

export default OrganizationProfilePage;
