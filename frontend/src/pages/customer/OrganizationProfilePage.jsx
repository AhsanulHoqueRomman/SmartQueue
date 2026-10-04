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
  const { isAuthenticated } = useAuth();
  const { selectOrg } = useTenant();

  // Profile State
  const [org, setOrg] = useState(null);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');

  // Booking Flow State: Organization -> Service -> Provider -> Date -> Serial
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // Avatar Image Error Tracker
  const [imgErrors, setImgErrors] = useState({});

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

          const defaultSvc = (paramService && svcList.some(s => s.id === paramService))
            ? paramService
            : (svcList.length > 0 ? svcList[0].id : '');

          setSelectedServiceId(defaultSvc);

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

  // Service-First Provider Filtering: Filter providers by selected service
  const displayedProviders = selectedServiceId
    ? providers.filter((prov) => {
        if (!prov.services || prov.services.length === 0) return true;
        return prov.services.some((s) => s.id === selectedServiceId);
      })
    : providers;

  // Auto-sync selectedProviderId when service changes
  useEffect(() => {
    if (selectedServiceId && displayedProviders.length > 0) {
      const isStillEligible = displayedProviders.some((p) => p.id === selectedProviderId);
      if (!isStillEligible) {
        setSelectedProviderId(displayedProviders[0].id);
      }
    }
  }, [selectedServiceId, displayedProviders]);

  // Dynamic Availability Fetch for selected provider & date
  const fetchAvailability = async () => {
    if (!organizationId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    setLoadingAvailability(true);
    setBookingError(null);

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
      setBookingError(detailMsg || 'Failed to load provider availability.');
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
    const bookingSection = document.getElementById('appointment-booking-section');
    if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectProvider = (provId) => {
    setSelectedProviderId(provId);
    const bookingSection = document.getElementById('appointment-booking-section');
    if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedServiceId || !selectedProviderId || !selectedDate) {
      setBookingError('Please complete all selection steps.');
      return;
    }

    if (!isAuthenticated) {
      const pendingState = {
        orgId: organizationId,
        serviceId: selectedServiceId,
        providerId: selectedProviderId,
        date: selectedDate,
        notes: notes,
      };
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(pendingState));
      navigate(`/login?redirect=/organizations/${organizationId}`);
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    try {
      const appointment = await appointmentService.bookAppointment(organizationId, {
        provider_id: selectedProviderId,
        service_id: selectedServiceId,
        appointment_date: selectedDate,
        notes: notes,
      });

      setBookedAppointment(appointment);
    } catch (err) {
      const errorData = err.response?.data;
      const msg =
        errorData?.detail ||
        errorData?.non_field_errors?.[0] ||
        errorData?.appointment_date?.[0] ||
        'Failed to book appointment. Please check availability and try again.';
      setBookingError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Industry-specific terminology helper
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

  if (loading) {
    return <LoadingState message="Loading organization directory..." />;
  }

  if (error || !org) {
    return (
      <EmptyState
        title="Organization Unavailable"
        message={error || 'This organization is currently unavailable.'}
        actionText="Back to Directory"
        onAction={() => navigate('/organizations')}
      />
    );
  }

  const industryLabels = getIndustryLabels(org.industry_type);

  // Serial Booking Confirmation View
  if (bookedAppointment) {
    const queueId = bookedAppointment.queue_entry?.id || bookedAppointment.queue_entry_id;
    return (
      <div className="lp-root" style={{ background: 'var(--lp-bg)', minHeight: '100vh', color: 'var(--lp-text)' }}>
        <PublicNavbar />
        <div style={{ maxWidth: '640px', margin: '6rem auto 3rem auto', textAlign: 'center', backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px', padding: '2.5rem', boxShadow: '0 8px 30px var(--shadow-sm)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.25rem' }}>
            ✓
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
            Serial Allocated
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.35rem', color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif' }}>
            Serial #{bookedAppointment.serial_number || 1} Assigned
          </h2>
          <p style={{ color: 'var(--lp-text-subtle)', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
            Your position in {org.name}'s queue is locked for {bookedAppointment.appointment_date || selectedDate}.
          </p>

          <div style={{ backgroundColor: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', textAlign: 'left', marginBottom: '1.75rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Organization:</span>
              <strong style={{ color: 'var(--lp-text)' }}>{org.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Service:</span>
              <strong style={{ color: 'var(--lp-text)' }}>{bookedAppointment.service_name || selectedService?.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Provider:</span>
              <strong style={{ color: 'var(--lp-text)' }}>{bookedAppointment.provider_name || selectedProvider?.title || 'Assigned Professional'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Estimated Service Window:</span>
              <strong style={{ color: 'var(--lp-text)' }}>~{new Date(bookedAppointment.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.65rem' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Status:</span>
              <StatusBadge status={bookedAppointment.status} />
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'left', marginBottom: '1.75rem', fontSize: '0.875rem', color: 'var(--color-success)' }}>
            💡 <strong>Queue Telemetry Notice:</strong> Your estimated service window and recommended arrival time will update dynamically as consultations progress.
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {queueId && (
              <button
                onClick={() => navigate(`/customer/queue/${queueId}`)}
                style={{ padding: '0.75rem 1.5rem', background: 'var(--lp-btn-primary-bg)', color: 'var(--lp-btn-primary-text)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
              >
                📍 Track Live Queue
              </button>
            )}
            <button
              onClick={() => navigate('/customer/appointments')}
              style={{ padding: '0.75rem 1.5rem', background: 'var(--lp-bg-subtle)', color: 'var(--lp-text)', border: '1px solid var(--lp-border)', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              My Appointments
            </button>
            <button
              onClick={() => {
                setBookedAppointment(null);
                setNotes('');
                fetchAvailability();
              }}
              style={{ padding: '0.75rem 1.5rem', background: 'transparent', color: 'var(--lp-text-subtle)', border: '1px solid var(--lp-border)', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Book Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-root" style={{ background: 'var(--lp-bg)', minHeight: '100vh', width: '100%', overflowX: 'hidden', color: 'var(--lp-text)' }}>
      <PublicNavbar />

      <div style={{ padding: '6rem 1rem 3rem 1rem', maxWidth: '1140px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Organization Directory Header */}
        <div
          style={{
            padding: '2rem',
            marginBottom: '2rem',
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '16px',
            boxShadow: '0 4px 20px var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem' }}>
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: 'var(--lp-text)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {org.name}
                </h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--lp-bg-subtle)',
                    color: 'var(--lp-accent)',
                    border: '1px solid var(--lp-border)'
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
                    backgroundColor: 'var(--color-success-bg)',
                    color: 'var(--color-success)',
                    border: '1px solid var(--color-success-border)'
                  }}
                >
                  ✓ Verified Directory
                </span>
              </div>

              {/* Address & Contact Details */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: 'var(--lp-text-subtle)', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                {org.address && <span>📍 {org.address}</span>}
                {org.phone_number && <span>📞 {org.phone_number}</span>}
                {org.email && <span>✉️ {org.email}</span>}
              </div>

              {/* Rating & Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: 'var(--color-warning)', fontSize: '1.1rem', fontWeight: 'bold' }}>★</span>
                  <span style={{ fontWeight: '800', color: 'var(--lp-text)' }}>
                    {org.rating ? org.rating.toFixed(1) : '4.9'}
                  </span>
                  <span style={{ color: 'var(--lp-text-subtle)' }}>
                    ({org.reviews_count || 12} reviews)
                  </span>
                </div>
                <span style={{ color: 'var(--lp-border)' }}>|</span>
                <span style={{ color: 'var(--lp-text-subtle)' }}>⚡ {services.length} Services</span>
                <span style={{ color: 'var(--lp-border)' }}>|</span>
                <span style={{ color: 'var(--lp-text-subtle)' }}>👥 {providers.length} Professionals</span>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById('appointment-booking-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--lp-btn-primary-bg)',
                color: 'var(--lp-btn-primary-text)',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px var(--shadow-sm)'
              }}
            >
              ✨ Schedule Appointment
            </button>
          </div>
        </div>

        {/* About Section */}
        {org.description && (
          <div style={{ padding: '1.5rem', marginBottom: '2rem', backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '0.5rem', fontFamily: 'Outfit, sans-serif' }}>
              About {org.name}
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
              {org.description}
            </p>
          </div>
        )}

        {/* Categories Tab Bar */}
        {categories.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
              {industryLabels.category}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('ALL')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  border: '1px solid var(--lp-border)',
                  background: selectedCategoryFilter === 'ALL' ? 'var(--lp-btn-primary-bg)' : 'var(--lp-surface)',
                  color: selectedCategoryFilter === 'ALL' ? 'var(--lp-btn-primary-text)' : 'var(--lp-text)',
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
                    border: '1px solid var(--lp-border)',
                    background: selectedCategoryFilter === cat.id ? 'var(--lp-btn-primary-bg)' : 'var(--lp-surface)',
                    color: selectedCategoryFilter === cat.id ? 'var(--lp-btn-primary-text)' : 'var(--lp-text)',
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
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--lp-text)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
              Services
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.875rem', margin: '0.2rem 0 0 0' }}>
              Select a service below to filter available professionals who offer it.
            </p>
          </div>

          {filteredServices.length === 0 ? (
            <p style={{ color: 'var(--lp-text-subtle)', fontStyle: 'italic', padding: '1rem', background: 'var(--lp-surface)', borderRadius: '12px', border: '1px solid var(--lp-border)' }}>
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
                      backgroundColor: 'var(--lp-surface)',
                      border: `1.5px solid ${isSelected ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isSelected ? '0 4px 16px var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--lp-text)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                          {svc.name}
                        </h3>
                        {svc.price && (
                          <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--lp-accent)' }}>
                            ৳{svc.price}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--lp-text-subtle)', background: 'var(--lp-bg-subtle)', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid var(--lp-border)', display: 'inline-block', marginBottom: '0.65rem' }}>
                        {catName}
                      </span>
                      {svc.description && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginBottom: '0.85rem', lineHeight: '1.4' }}>
                          {svc.description}
                        </p>
                      )}
                      <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', fontWeight: '600' }}>
                        ⏱️ Typical consultation duration: {svc.duration_minutes} min
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectService(svc.id)}
                        style={{
                          width: '100%',
                          padding: '0.55rem',
                          borderRadius: '8px',
                          border: isSelected ? 'none' : '1px solid var(--lp-border)',
                          background: isSelected ? 'var(--lp-btn-primary-bg)' : 'var(--lp-bg-subtle)',
                          color: isSelected ? 'var(--lp-btn-primary-text)' : 'var(--lp-text)',
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

        {/* Provider Directory Section (Vertical List Presentation) */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--lp-text)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
              {industryLabels.providers}
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.875rem', margin: '0.2rem 0 0 0' }}>
              {selectedService ? `Showing professionals offering "${selectedService.name}"` : 'Select a service above to view matching professionals.'}
            </p>
          </div>

          {displayedProviders.length === 0 ? (
            <p style={{ color: 'var(--lp-text-subtle)', fontStyle: 'italic', padding: '1.25rem', background: 'var(--lp-surface)', borderRadius: '12px', border: '1px solid var(--lp-border)' }}>
              No professionals listed for this service.
            </p>
          ) : (
            <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px var(--shadow-sm)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {displayedProviders.map((prov, idx) => {
                  const isSelected = selectedProviderId === prov.id;
                  const name = prov.provider_name || `${prov.user_first_name || ''} ${prov.user_last_name || ''}`.trim() || prov.user_email || 'Professional';
                  const title = prov.title || 'Professional';
                  
                  // Extract education degrees string
                  let degrees = '';
                  if (Array.isArray(prov.education) && prov.education.length > 0) {
                    degrees = prov.education.map(e => typeof e === 'string' ? e : e.degree).filter(Boolean).join(', ');
                  }

                  // Initials fallback
                  const initials = name.split(' ').map(n => n[0]).filter(Boolean).join('').substring(0, 2).toUpperCase() || 'P';

                  return (
                    <div
                      key={prov.id}
                      style={{
                        padding: '1.25rem 0',
                        borderBottom: idx < displayedProviders.length - 1 ? '1px solid var(--lp-border)' : 'none',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                        gap: '1.25rem',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Left: Avatar + Professional Info */}
                      <div style={{ display: 'flex', gap: '1.25rem', flex: '1 1 320px', alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0 }}>
                          {prov.profile_photo && !imgErrors[prov.id] ? (
                            <img
                              src={prov.profile_photo}
                              alt={name}
                              onError={() => setImgErrors(prev => ({ ...prev, [prov.id]: true }))}
                              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--lp-border)' }}
                            />
                          ) : (
                            <div style={{
                              width: '64px',
                              height: '64px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--lp-accent)',
                              color: 'var(--lp-btn-primary-text, #ffffff)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '800',
                              fontSize: '1.25rem',
                              border: '2px solid var(--lp-border)'
                            }}>
                              {initials}
                            </div>
                          )}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--lp-text)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                              {name}
                            </h3>
                            {degrees && (
                              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--lp-text-subtle)' }}>
                                {degrees}
                              </span>
                            )}
                          </div>

                          {title && (
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--lp-accent)', marginTop: '0.2rem' }}>
                              {title}
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginTop: '0.35rem' }}>
                            {prov.experience_years > 0 && (
                              <span>🎓 {prov.experience_years} years experience</span>
                            )}
                            {prov.specialties && prov.specialties.length > 0 && (
                              <span>✨ {Array.isArray(prov.specialties) ? prov.specialties.join(', ') : prov.specialties}</span>
                            )}
                          </div>

                          {prov.bio && (
                            <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', margin: '0.5rem 0 0 0', lineHeight: '1.5', maxWidth: '650px' }}>
                              {prov.bio}
                            </p>
                          )}

                          <div style={{ marginTop: '0.65rem', fontSize: '0.825rem', fontWeight: '600', color: isSelected && availability?.is_available ? 'var(--color-success)' : 'var(--lp-text-subtle)' }}>
                            📅 Selected Date ({selectedDate}): {isSelected && availability ? (availability.is_available ? `Available (${availability.working_hours_display})` : `Unavailable (${availability.reason || 'Not available'})`) : 'Select provider to inspect working hours'}
                          </div>
                        </div>
                      </div>

                      {/* Right: Selection Action & Profile Link */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0, minWidth: '150px' }}>
                        <button
                          type="button"
                          onClick={() => handleSelectProvider(prov.id)}
                          style={{
                            padding: '0.65rem 1.25rem',
                            borderRadius: '10px',
                            border: isSelected ? 'none' : '1px solid var(--lp-border)',
                            background: isSelected ? 'var(--lp-btn-primary-bg)' : 'var(--lp-bg-subtle)',
                            color: isSelected ? 'var(--lp-btn-primary-text)' : 'var(--lp-text)',
                            fontWeight: 700,
                            fontSize: '0.875rem',
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
                            color: 'var(--lp-accent)',
                            fontWeight: 600,
                            fontSize: '0.825rem',
                            textDecoration: 'none'
                          }}
                        >
                          View Full Profile →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Serial-Based Queue Booking Component */}
        <div
          id="appointment-booking-section"
          style={{
            padding: '2rem',
            backgroundColor: 'var(--lp-surface)',
            border: '2px solid var(--lp-accent)',
            borderRadius: '20px',
            boxShadow: '0 8px 30px var(--shadow-sm)'
          }}
        >
          <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--lp-border)', paddingBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Serial Queue Booking
            </span>
            <h2 style={{ fontSize: '1.65rem', fontWeight: '800', color: 'var(--lp-text)', marginTop: '0.25rem', marginBottom: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
              Schedule Appointment & Join Queue
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', margin: 0 }}>
              Select a date to check provider availability. Serial and estimated consultation window are assigned upon booking.
            </p>
          </div>

          {bookingError && (
            <div style={{ marginBottom: '1.5rem', padding: '0.85rem', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: '10px', color: 'var(--color-error)', fontSize: '0.875rem' }}>
              {bookingError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Step 1, 2, 3 Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  1. Selected Service
                </label>
                <select
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid var(--lp-border)', outline: 'none', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontSize: '0.9rem', cursor: 'pointer' }}
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                >
                  {services.length === 0 ? (
                    <option value="">No services available</option>
                  ) : (
                    services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} (~{svc.duration_minutes} min {svc.price ? `- ৳${svc.price}` : ''})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  2. Selected Professional
                </label>
                <select
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid var(--lp-border)', outline: 'none', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontSize: '0.9rem', cursor: 'pointer' }}
                  value={selectedProviderId}
                  onChange={(e) => setSelectedProviderId(e.target.value)}
                >
                  {displayedProviders.length === 0 ? (
                    <option value="">No providers available for selected service</option>
                  ) : (
                    displayedProviders.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.provider_name || prov.title || `Provider #${prov.id.slice(0, 8)}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  3. Select Date
                </label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid var(--lp-border)', outline: 'none', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  min={todayStr}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>

            {/* Step 4: Availability Summary & Booking Confirmation */}
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
                Queue Availability ({selectedDate})
              </h3>

              {!selectedServiceId || !selectedProviderId ? (
                <EmptyState
                  title="Make Selections"
                  message="Choose a service and provider to load real-time queue availability."
                />
              ) : loadingAvailability ? (
                <LoadingState message="Checking provider working schedule..." />
              ) : (
                <div>
                  <div style={{ backgroundColor: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Selected Date:</span>
                      <strong style={{ color: 'var(--lp-text)' }}>{selectedDate}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Provider Availability:</span>
                      <strong style={{ color: availability?.is_available ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {availability?.is_available ? `Available (${availability.working_hours_display})` : (availability?.reason || 'Not Available')}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Estimated Consultation Duration:</span>
                      <strong style={{ color: 'var(--lp-text)' }}>{availability?.duration_minutes || selectedService?.duration_minutes || 30} min</strong>
                    </div>
                    <div style={{ fontSize: '0.825rem', color: 'var(--lp-text-subtle)', padding: '0.75rem', backgroundColor: 'var(--lp-surface)', borderRadius: '8px', border: '1px solid var(--lp-border)' }}>
                      ⚡ <strong>Queue-based booking:</strong> Your serial and estimated service window will be assigned after booking. The estimate may update continuously as the live queue progresses.
                    </div>
                  </div>

                  <form onSubmit={handleBookAppointment}>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--lp-text-subtle)', marginBottom: '0.25rem' }}>
                        Additional Notes for Provider (Optional)
                      </label>
                      <textarea
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }}
                        rows="2"
                        placeholder="Add any specific requests or details..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={submitting || (availability && !availability.is_available)}
                      />
                    </div>

                    {!isAuthenticated && (
                      <p style={{ fontSize: '0.825rem', color: 'var(--lp-accent)', fontWeight: '600', marginBottom: '0.75rem' }}>
                        ℹ️ You will be asked to sign in to finalize your serial booking.
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting || (availability && !availability.is_available)}
                      style={{
                        width: '100%',
                        padding: '0.8rem',
                        background: (availability && !availability.is_available) ? 'var(--lp-bg-subtle)' : 'var(--lp-btn-primary-bg)',
                        color: (availability && !availability.is_available) ? 'var(--lp-text-subtle)' : 'var(--lp-btn-primary-text)',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: (availability && !availability.is_available) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {submitting ? 'Allocating Serial...' : (availability && !availability.is_available) ? 'Unavailable on Selected Date' : isAuthenticated ? 'Confirm Appointment & Join Queue for This Date' : 'Sign In to Confirm Appointment'}
                    </button>
                  </form>
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
