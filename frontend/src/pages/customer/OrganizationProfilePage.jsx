import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import PublicNavbar from '../../components/PublicNavbar';
import '../../styles/LandingPage.css';

const PENDING_BOOKING_KEY = 'sq_pending_booking';

export function OrganizationProfilePage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { selectOrg } = useTenant();

  // Profile State
  const [org, setOrg] = useState(null);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');

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

  // Fetch Organization, Categories, Services, Providers
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

        let catList = [];
        let svcList = [];
        let provList = [];

        try {
          const catData = await organizationService.getCategories(organizationId);
          catList = Array.isArray(catData) ? catData : catData.results || [];
        } catch (e) {
          console.warn('Could not load categories:', e);
        }

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
        setCategories(catList);
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

  // Dynamic Availability Slots Fetch
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
      const detailMsg = err.response?.data?.detail;
      const isValidationMismatch = detailMsg && (
        detailMsg.includes('not assigned') ||
        detailMsg.includes('does not offer') ||
        detailMsg.includes('not operating')
      );

      if (isValidationMismatch) {
        setAvailability(null);
      } else {
        setBookingError(
          detailMsg ||
          err.response?.data?.date?.[0] ||
          'Failed to load available slots.'
        );
        setAvailability(null);
      }
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

  // Industry-specific label helper
  const getIndustryLabels = (indType) => {
    switch (indType) {
      case 'LEGAL':
        return { providers: 'Legal Professionals & Attorneys', category: 'Practice Areas' };
      case 'BEAUTY':
        return { providers: 'Stylists & Beauticians', category: 'Service Categories' };
      case 'REPAIR':
        return { providers: 'Technicians & Repair Experts', category: 'Repair Categories' };
      case 'CONSULTING':
        return { providers: 'Consultants & Senior Advisors', category: 'Consulting Areas' };
      case 'HEALTHCARE':
      default:
        return { providers: 'Providers & Specialists', category: 'Departments & Categories' };
    }
  };

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  // Category Filtering for Services
  const filteredServices = selectedCategoryFilter === 'ALL'
    ? services
    : services.filter(s => s.category?.id === selectedCategoryFilter || s.category === selectedCategoryFilter);

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
        message={error?.includes('404') || error?.includes('Not Found') ? 'This organization is currently unavailable.' : (error || 'This organization is currently unavailable.')}
        actionText="Back to Organizations"
        onAction={() => navigate('/organizations')}
      />
    );
  }

  const industryLabels = getIndustryLabels(org.industry_type);

  // Booking Confirmation View
  if (bookedAppointment) {
    return (
      <div className="lp-root" style={{ background: '#FAF8F3', minHeight: '100vh' }}>
        <PublicNavbar />
        <div style={{ maxWidth: '640px', margin: '3rem auto', textAlign: 'center', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '2rem', boxShadow: '0 8px 30px rgba(47, 37, 32, 0.08)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#F0FDF4', color: '#4F7A5A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.25rem' }}>
            ✓
          </div>
          <h2 style={{ fontSize: '1.65rem', fontWeight: '800', marginBottom: '0.35rem', color: '#2F2520', fontFamily: 'Cinzel, serif' }}>
            Appointment Booked Successfully!
          </h2>
          <p style={{ color: '#78716C', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
            Your appointment has been confirmed and registered with {org.name}.
          </p>

          <div style={{ backgroundColor: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', textAlign: 'left', marginBottom: '1.75rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Organization:</span>
              <strong style={{ color: '#211C19' }}>{org.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Service:</span>
              <strong style={{ color: '#211C19' }}>{bookedAppointment.service_name || selectedService?.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Provider:</span>
              <strong style={{ color: '#211C19' }}>{bookedAppointment.provider_name || selectedProvider?.title || 'Assigned Professional'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Date & Time:</span>
              <strong style={{ color: '#211C19' }}>{new Date(bookedAppointment.start_datetime).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.65rem' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Status:</span>
              <StatusBadge status={bookedAppointment.status} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/customer/appointments')}
              style={{ padding: '0.75rem 1.5rem', background: '#2F2520', color: '#FAF8F3', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              View My Appointments
            </button>
            <button
              onClick={() => {
                setBookedAppointment(null);
                setSelectedSlot(null);
                setNotes('');
                fetchAvailability();
              }}
              style={{ padding: '0.75rem 1.5rem', background: '#FAF8F3', color: '#2F2520', border: '1px solid #E6E1D9', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Book Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-root" style={{ background: '#FAF8F3', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      <PublicNavbar />

      <div style={{ padding: '2rem 1rem 3rem 1rem', maxWidth: '1140px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Organization Header Banner */}
        <div
          style={{
            padding: '2rem',
            marginBottom: '2rem',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF8F3 100%)',
            border: '1px solid #E6E1D9',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(47, 37, 32, 0.05)'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem' }}>
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: '#2F2520', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {org.name}
                </h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '8px',
                    backgroundColor: '#F3F0EA',
                    color: '#5F7A70',
                    border: '1px solid #E6E1D9'
                  }}
                >
                  {org.industry_label || 'Organization'}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '8px',
                    backgroundColor: '#F0FDF4',
                    color: '#4F7A5A',
                    border: '1px solid #DCFCE7'
                  }}
                >
                  ✓ Verified Organization
                </span>
              </div>

              {/* Address & Contact Details */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: '#78716C', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                {org.address && <span>📍 {org.address}</span>}
                {org.phone_number && <span>📞 {org.phone_number}</span>}
                {org.email && <span>✉️ {org.email}</span>}
              </div>

              {/* Rating & Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: '#B06D2E', fontSize: '1.1rem', fontWeight: 'bold' }}>★</span>
                  <span style={{ fontWeight: '800', color: '#211C19' }}>
                    {org.rating ? org.rating.toFixed(1) : '4.9'}
                  </span>
                  <span style={{ color: '#78716C' }}>
                    ({org.reviews_count || 12} reviews)
                  </span>
                </div>
                <span style={{ color: '#E6E1D9' }}>|</span>
                <span style={{ color: '#78716C' }}>⚡ {services.length} Services</span>
                <span style={{ color: '#E6E1D9' }}>|</span>
                <span style={{ color: '#78716C' }}>👥 {providers.length} Professionals</span>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById('appointment-booking-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#2F2520',
                color: '#FAF8F3',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(47, 37, 32, 0.15)'
              }}
            >
              ✨ Schedule Appointment
            </button>
          </div>
        </div>

        {/* About Section */}
        {org.description && (
          <div style={{ padding: '1.5rem', marginBottom: '2rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.5rem', fontFamily: 'Outfit, sans-serif' }}>
              About {org.name}
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
              {org.description}
            </p>
          </div>
        )}

        {/* Categories Tab Bar */}
        {categories.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
              {industryLabels.category}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('ALL')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  border: '1px solid #E6E1D9',
                  background: selectedCategoryFilter === 'ALL' ? '#2F2520' : '#FFFFFF',
                  color: selectedCategoryFilter === 'ALL' ? '#FAF8F3' : '#211C19',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '9999px',
                    border: '1px solid #E6E1D9',
                    background: selectedCategoryFilter === cat.id ? '#5F7A70' : '#FFFFFF',
                    color: selectedCategoryFilter === cat.id ? '#FFFFFF' : '#211C19',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Services Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#2F2520', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
              Available Services
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.875rem', margin: '0.2rem 0 0 0' }}>
              Select a service below to schedule your appointment.
            </p>
          </div>

          {filteredServices.length === 0 ? (
            <p style={{ color: '#78716C', fontStyle: 'italic', padding: '1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E6E1D9' }}>
              No services found for the selected category.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {filteredServices.map((svc) => {
                const isSelected = selectedServiceId === svc.id;
                const catName = svc.category_name || svc.category?.name || 'General';

                return (
                  <div
                    key={svc.id}
                    style={{
                      padding: '1.25rem',
                      backgroundColor: '#FFFFFF',
                      border: `1.5px solid ${isSelected ? '#5F7A70' : '#E6E1D9'}`,
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isSelected ? '0 4px 16px rgba(95, 122, 112, 0.15)' : 'none'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#2F2520', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                          {svc.name}
                        </h3>
                        {svc.price && (
                          <span style={{ fontSize: '1rem', fontWeight: '800', color: '#5F7A70' }}>
                            ৳{svc.price}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#78716C', background: '#FAF8F3', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid #E6E1D9', display: 'inline-block', marginBottom: '0.65rem' }}>
                        {catName}
                      </span>
                      {svc.description && (
                        <p style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '0.85rem', lineHeight: '1.4' }}>
                          {svc.description}
                        </p>
                      )}
                      <div style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: '600' }}>
                        ⏱️ Expected Duration: {svc.duration_minutes} min
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectService(svc.id)}
                        style={{
                          width: '100%',
                          padding: '0.55rem',
                          borderRadius: '8px',
                          border: isSelected ? 'none' : '1px solid #E6E1D9',
                          background: isSelected ? '#5F7A70' : '#FAF8F3',
                          color: isSelected ? '#FFFFFF' : '#2F2520',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
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

        {/* Providers / Professionals Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#2F2520', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
              {industryLabels.providers}
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.875rem', margin: '0.2rem 0 0 0' }}>
              Select a professional to view their availability or open their public profile.
            </p>
          </div>

          {providers.length === 0 ? (
            <p style={{ color: '#78716C', fontStyle: 'italic', padding: '1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E6E1D9' }}>
              No providers listed for this organization yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {providers.map((prov) => {
                const isSelected = selectedProviderId === prov.id;
                const displayName = prov.title ? `${prov.title}` : `Professional`;
                const emailText = prov.user_email || `Team Member`;

                return (
                  <div
                    key={prov.id}
                    style={{
                      padding: '1.25rem',
                      backgroundColor: '#FFFFFF',
                      border: `1.5px solid ${isSelected ? '#5F7A70' : '#E6E1D9'}`,
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justify: 'space-between',
                      boxShadow: isSelected ? '0 4px 16px rgba(95, 122, 112, 0.15)' : 'none'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        {prov.profile_photo ? (
                          <img
                            src={prov.profile_photo}
                            alt={displayName}
                            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #E6E1D9' }}
                          />
                        ) : (
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#2F2520', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>
                            👤
                          </div>
                        )}
                        <div>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#2F2520', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                            {displayName}
                          </h4>
                          <span style={{ fontSize: '0.775rem', color: '#78716C' }}>{emailText}</span>
                        </div>
                      </div>

                      {prov.experience_years > 0 && (
                        <div style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600, marginBottom: '0.5rem' }}>
                          🎓 {prov.experience_years} Years Experience
                        </div>
                      )}

                      {prov.bio && (
                        <p style={{ fontSize: '0.85rem', color: '#78716C', lineHeight: '1.4', marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {prov.bio}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectProvider(prov.id)}
                        style={{
                          width: '100%',
                          padding: '0.55rem',
                          borderRadius: '8px',
                          border: isSelected ? 'none' : '1px solid #E6E1D9',
                          background: isSelected ? '#5F7A70' : '#FAF8F3',
                          color: isSelected ? '#FFFFFF' : '#2F2520',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected ? '✓ Selected Provider' : 'Select Provider'}
                      </button>
                      <Link
                        to={`/organizations/${organizationId}/providers/${prov.id}`}
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          padding: '0.45rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'transparent',
                          color: '#5F7A70',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          textDecoration: 'none'
                        }}
                      >
                        View Full Public Profile →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Appointment Booking Section */}
        <div
          id="appointment-booking-section"
          style={{
            padding: '2rem',
            backgroundColor: '#FFFFFF',
            border: '2px solid #5F7A70',
            borderRadius: '20px',
            boxShadow: '0 8px 30px rgba(47, 37, 32, 0.08)'
          }}
        >
          <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #E6E1D9', paddingBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Instant Booking System
            </span>
            <h2 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#2F2520', marginTop: '0.25rem', marginBottom: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
              Schedule Your Appointment
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.9rem', margin: 0 }}>
              Choose your preferred service, professional, and date to view live available time slots.
            </p>
          </div>

          {bookingError && (
            <div style={{ marginBottom: '1.5rem', padding: '0.85rem', background: conflictError ? '#FEF3C7' : '#FEE2E2', border: `1px solid ${conflictError ? '#FDE68A' : '#FCA5A5'}`, borderRadius: '10px', color: conflictError ? '#B06D2E' : '#B4534B', fontSize: '0.875rem' }}>
              {bookingError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Step 1, 2, 3 Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem' }}>
                  1. Select Service
                </label>
                <select
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid #E6E1D9', outline: 'none', background: '#FFFFFF', fontSize: '0.9rem', cursor: 'pointer' }}
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
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem' }}>
                  2. Select Professional
                </label>
                <select
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid #E6E1D9', outline: 'none', background: '#FFFFFF', fontSize: '0.9rem', cursor: 'pointer' }}
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
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem' }}>
                  3. Select Date
                </label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid #E6E1D9', outline: 'none', background: '#FFFFFF', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  min={todayStr}
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                />
              </div>
            </div>

            {/* Step 4: Slot Display */}
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
                Available Time Slots ({selectedDate})
              </h3>

              {!selectedServiceId || !selectedProviderId ? (
                <EmptyState
                  title="Make Selections"
                  message="Choose a service and provider to load real-time slot availability."
                />
              ) : loadingAvailability ? (
                <LoadingState message="Fetching available slots..." />
              ) : !availability || !availability.slots || availability.slots.length === 0 ? (
                <EmptyState
                  title="No Open Slots"
                  message={`No available slots found for ${selectedDate}. Try selecting another date.`}
                />
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                    {availability.slots.map((slot, idx) => {
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={idx}
                          type="button"
                          style={{
                            padding: '0.65rem 0.5rem',
                            borderRadius: '8px',
                            border: isSelected ? 'none' : '1px solid #E6E1D9',
                            background: isSelected ? '#5F7A70' : '#FAF8F3',
                            color: isSelected ? '#FFFFFF' : '#211C19',
                            fontSize: '0.825rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
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
                    <form onSubmit={handleBookAppointment} style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #E6E1D9' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.5rem' }}>
                        Confirm Appointment Details
                      </h4>
                      <div style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '1rem', backgroundColor: '#FAF8F3', padding: '0.75rem', borderRadius: '8px' }}>
                        <div><strong>Service:</strong> {selectedService?.name}</div>
                        <div><strong>Provider:</strong> {selectedProvider?.title || 'Assigned Professional'}</div>
                        <div><strong>Time:</strong> {new Date(selectedSlot.start).toLocaleString()}</div>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#78716C', marginBottom: '0.25rem' }}>
                          Additional Notes (Optional)
                        </label>
                        <textarea
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #E6E1D9', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }}
                          rows="2"
                          placeholder="Add any specific requests or details..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          disabled={submitting}
                        />
                      </div>

                      {!isAuthenticated && (
                        <p style={{ fontSize: '0.825rem', color: '#5F7A70', fontWeight: '600', marginBottom: '0.75rem' }}>
                          ℹ️ You will be asked to sign in to finalize your booking. Your selected slot choice will be preserved!
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={submitting}
                        style={{
                          width: '100%',
                          padding: '0.8rem',
                          background: '#2F2520',
                          color: '#FAF8F3',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          cursor: 'pointer'
                        }}
                      >
                        {submitting ? 'Confirming Booking...' : isAuthenticated ? 'Confirm & Book Appointment Now' : 'Sign In to Confirm Booking'}
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
