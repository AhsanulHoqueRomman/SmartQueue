import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import providerManagementService from '../../services/providerManagementService';
import appointmentService from '../../services/appointmentService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import PublicNavbar from '../../components/PublicNavbar';
import '../../styles/LandingPage.css';

const PENDING_BOOKING_KEY = 'sq_pending_booking';

export function ProviderPublicProfilePage() {
  const { organizationId, providerId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { selectOrg } = useTenant();

  // Profile Data
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Booking Flow State
  const [selectedServiceId, setSelectedServiceId] = useState('');
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

  useEffect(() => {
    if (!organizationId || !providerId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    providerManagementService.getProviderPublicProfile(organizationId, providerId)
      .then((data) => {
        if (!isMounted) return;
        setProfile(data);
        selectOrg(organizationId);

        // Pre-select first service if available
        if (data.services && data.services.length > 0) {
          setSelectedServiceId(data.services[0].id);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.detail || 'Provider public profile not found or unavailable.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [organizationId, providerId]);

  // Dynamic Availability Slots Fetch
  const fetchAvailability = async () => {
    if (!organizationId || !providerId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    setLoadingAvailability(true);
    setBookingError(null);
    setConflictError(false);

    try {
      const data = await appointmentService.getAvailability(
        organizationId,
        providerId,
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
  }, [organizationId, providerId, selectedServiceId, selectedDate]);

  const handleSelectService = (svcId) => {
    setSelectedServiceId(svcId);
    setSelectedSlot(null);
    const bookingSection = document.getElementById('provider-booking-section');
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
        providerId: providerId,
        serviceId: selectedServiceId,
        date: selectedDate,
        slot: selectedSlot,
        notes: notes,
      };
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(pendingState));
      navigate(`/login?redirect=/organizations/${organizationId}/providers/${providerId}`);
      return;
    }

    setSubmitting(true);
    setBookingError(null);
    setConflictError(false);

    try {
      const appointment = await appointmentService.bookAppointment(organizationId, {
        provider_id: providerId,
        service_id: selectedServiceId,
        start_datetime: selectedSlot.start,
        notes: notes,
      });

      setBookedAppointment(appointment);
    } catch (err) {
      const status = err.response?.status;
      const errorData = err.response?.data;

      if (status === 409 || errorData?.code === 'DOUBLE_BOOKING_CONFLICT' || errorData?.detail?.includes('conflict')) {
        setConflictError(true);
        setBookingError('This slot is no longer available because another booking occurred. Please select a different slot.');
        fetchAvailability();
      } else {
        const msg =
          errorData?.detail ||
          errorData?.non_field_errors?.[0] ||
          'Failed to book appointment. Please try again.';
        setBookingError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

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
    return <LoadingState message="Loading provider public profile..." />;
  }

  if (error || !profile) {
    return (
      <EmptyState
        title="Provider Profile Unavailable"
        message={error || 'This provider profile is currently unavailable.'}
        actionText="Back to Organization"
        onAction={() => navigate(`/organizations/${organizationId}`)}
      />
    );
  }

  const selectedService = profile.services?.find((s) => s.id === selectedServiceId);

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
            Appointment Booked!
          </h2>
          <p style={{ color: '#78716C', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
            Your appointment with {profile.provider_name} has been confirmed.
          </p>

          <div style={{ backgroundColor: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '12px', textAlign: 'left', marginBottom: '1.75rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Professional:</span>
              <strong style={{ color: '#211C19' }}>{profile.provider_name} ({profile.title || 'Provider'})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Organization:</span>
              <strong style={{ color: '#211C19' }}>{profile.organization_name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid #E6E1D9' }}>
              <span style={{ color: '#78716C', fontSize: '0.9rem' }}>Service:</span>
              <strong style={{ color: '#211C19' }}>{bookedAppointment.service_name || selectedService?.name}</strong>
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

      <div style={{ padding: '2rem 1rem 3rem 1rem', maxWidth: '1040px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Back Link */}
        <div style={{ marginBottom: '1rem' }}>
          <Link
            to={`/organizations/${organizationId}`}
            style={{ color: '#5F7A70', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Back to {profile.organization_name}
          </Link>
        </div>

        {/* Profile Header Card */}
        <div
          style={{
            padding: '2rem',
            marginBottom: '2rem',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '20px',
            boxShadow: '0 4px 20px rgba(47, 37, 32, 0.05)'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '1.5rem' }}>
            {/* Photo Avatar */}
            {profile.profile_photo ? (
              <img
                src={profile.profile_photo}
                alt={profile.provider_name}
                style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #E6E1D9' }}
              />
            ) : (
              <div style={{ width: '96px', height: '96px', borderRadius: '50%', backgroundColor: '#2F2520', color: '#FAF8F3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 'bold' }}>
                👤
              </div>
            )}

            {/* Info */}
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: '#2F2520', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {profile.provider_name}
                </h1>
                {profile.experience_years > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '6px', backgroundColor: '#F3F0EA', color: '#5F7A70', border: '1px solid #E6E1D9' }}>
                    {profile.experience_years} Years Exp.
                  </span>
                )}
              </div>

              {profile.title && (
                <p style={{ fontSize: '1rem', fontWeight: 600, color: '#5F7A70', margin: '0 0 0.5rem 0' }}>
                  {profile.title}
                </p>
              )}

              <p style={{ fontSize: '0.875rem', color: '#78716C', margin: '0 0 0.75rem 0' }}>
                🏢 <Link to={`/organizations/${organizationId}`} style={{ color: '#211C19', fontWeight: 600, textDecoration: 'underline' }}>{profile.organization_name}</Link>
              </p>

              {/* Rating & Reviews */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <span style={{ color: '#B06D2E', fontWeight: 'bold', fontSize: '1.1rem' }}>★</span>
                <span style={{ fontWeight: '800', color: '#211C19' }}>
                  {profile.rating ? profile.rating.toFixed(1) : '4.9'}
                </span>
                <span style={{ color: '#78716C' }}>
                  ({profile.reviews_count || 12} reviews)
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => {
                const el = document.getElementById('provider-booking-section');
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
              📅 Book Appointment
            </button>
          </div>
        </div>

        {/* Bio / About */}
        {profile.bio && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.5rem', fontFamily: 'Outfit, sans-serif' }}>
              About & Professional Summary
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
              {profile.bio}
            </p>
          </div>
        )}

        {/* Specialties & Derived Categories */}
        {((profile.specialties && profile.specialties.length > 0) || (profile.categories && profile.categories.length > 0)) && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
              Specialties & Expertise
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {profile.specialties?.map((spec, idx) => (
                <span
                  key={idx}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '9999px',
                    background: '#FAF8F3',
                    border: '1px solid #E6E1D9',
                    color: '#211C19',
                    fontSize: '0.825rem',
                    fontWeight: 600
                  }}
                >
                  ✨ {spec}
                </span>
              ))}
              {profile.categories?.map((cat) => (
                <span
                  key={cat.id}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '9999px',
                    background: '#F5EFE6',
                    border: '1px solid #E6E1D9',
                    color: '#5F7A70',
                    fontSize: '0.825rem',
                    fontWeight: 600
                  }}
                >
                  📁 {cat.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Education Section */}
        {profile.education && profile.education.length > 0 && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#2F2520', marginBottom: '1rem', fontFamily: 'Outfit, sans-serif' }}>
              🎓 Education & Training
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {profile.education.map((edu, idx) => (
                <div key={idx} style={{ padding: '0.85rem 1rem', background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 700, color: '#211C19', fontSize: '0.95rem' }}>
                    {edu.degree} {edu.field ? `in ${edu.field}` : ''}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600 }}>
                    {edu.institution} {edu.year ? `(${edu.year})` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Experience History Section */}
        {profile.experience_history && profile.experience_history.length > 0 && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#2F2520', marginBottom: '1rem', fontFamily: 'Outfit, sans-serif' }}>
              💼 Professional History
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {profile.experience_history.map((exp, idx) => (
                <div key={idx} style={{ padding: '0.85rem 1rem', background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#211C19', fontSize: '0.95rem' }}>{exp.role}</span>
                    {exp.period && <span style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 600 }}>{exp.period}</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600, marginBottom: '0.35rem' }}>
                    {exp.organization}
                  </div>
                  {exp.description && (
                    <p style={{ fontSize: '0.825rem', color: '#78716C', margin: 0, lineHeight: 1.4 }}>
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications Section */}
        {profile.certifications && profile.certifications.length > 0 && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#2F2520', marginBottom: '1rem', fontFamily: 'Outfit, sans-serif' }}>
              📜 Certifications & Accreditation
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {profile.certifications.map((cert, idx) => (
                <div key={idx} style={{ padding: '0.75rem 0.9rem', background: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 700, color: '#211C19', fontSize: '0.9rem' }}>{cert.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#5F7A70' }}>
                    {cert.issuing_organization} {cert.year ? `(${cert.year})` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offered Services Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#2F2520', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
            Services Offered by {profile.provider_name}
          </h2>

          {profile.services && profile.services.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {profile.services.map((svc) => {
                const isSelected = selectedServiceId === svc.id;
                return (
                  <div
                    key={svc.id}
                    style={{
                      padding: '1.25rem',
                      backgroundColor: '#FFFFFF',
                      border: `1.5px solid ${isSelected ? '#5F7A70' : '#E6E1D9'}`,
                      borderRadius: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justify: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#211C19', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                          {svc.name}
                        </h3>
                        {svc.price && (
                          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#5F7A70' }}>
                            ৳{svc.price}
                          </span>
                        )}
                      </div>
                      {svc.category_name && (
                        <span style={{ fontSize: '0.75rem', color: '#78716C', background: '#FAF8F3', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid #E6E1D9', display: 'inline-block', marginBottom: '0.5rem' }}>
                          {svc.category_name}
                        </span>
                      )}
                      <div style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 600 }}>
                        ⏱️ {svc.duration_minutes} min duration
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectService(svc.id)}
                      style={{
                        marginTop: '0.85rem',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: isSelected ? 'none' : '1px solid #E6E1D9',
                        background: isSelected ? '#5F7A70' : '#FAF8F3',
                        color: isSelected ? '#FFFFFF' : '#211C19',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      {isSelected ? '✓ Selected Service' : 'Book This Service'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: '#78716C', fontStyle: 'italic', padding: '1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E6E1D9' }}>
              No services listed for this provider.
            </p>
          )}
        </div>

        {/* Embedded Booking Form for this Provider */}
        <div
          id="provider-booking-section"
          style={{
            padding: '2rem',
            backgroundColor: '#FFFFFF',
            border: '2px solid #5F7A70',
            borderRadius: '20px',
            boxShadow: '0 8px 30px rgba(47, 37, 32, 0.08)'
          }}
        >
          <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid #E6E1D9', paddingBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Direct Professional Booking
            </span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#2F2520', marginTop: '0.25rem', marginBottom: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
              Book an Appointment with {profile.provider_name}
            </h2>
          </div>

          {bookingError && (
            <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: conflictError ? '#FEF3C7' : '#FEE2E2', border: `1px solid ${conflictError ? '#FDE68A' : '#FCA5A5'}`, borderRadius: '10px', color: conflictError ? '#B06D2E' : '#B4534B', fontSize: '0.875rem' }}>
              {bookingError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Service & Date Pickers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem' }}>
                  1. Select Offered Service
                </label>
                <select
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid #E6E1D9', outline: 'none', background: '#FFFFFF', fontSize: '0.9rem', cursor: 'pointer' }}
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                >
                  {profile.services?.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} ({svc.duration_minutes} min {svc.price ? `- ৳${svc.price}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem' }}>
                  2. Select Date
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

            {/* Slot display */}
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#2F2520', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
                Available Time Slots ({selectedDate})
              </h3>

              {!selectedServiceId ? (
                <EmptyState
                  title="Select Service"
                  message="Choose a service to view availability slots."
                />
              ) : loadingAvailability ? (
                <LoadingState message="Loading available time slots..." />
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
                    <form onSubmit={handleBookAppointment} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E6E1D9' }}>
                      <div style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '1rem', backgroundColor: '#FAF8F3', padding: '0.75rem', borderRadius: '8px' }}>
                        <div><strong>Professional:</strong> {profile.provider_name}</div>
                        <div><strong>Service:</strong> {selectedService?.name}</div>
                        <div><strong>Selected Time:</strong> {new Date(selectedSlot.start).toLocaleString()}</div>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#78716C', marginBottom: '0.25rem' }}>
                          Additional Notes (Optional)
                        </label>
                        <textarea
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #E6E1D9', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }}
                          rows="2"
                          placeholder="Add any specific requests..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          disabled={submitting}
                        />
                      </div>

                      {!isAuthenticated && (
                        <p style={{ fontSize: '0.825rem', color: '#5F7A70', fontWeight: '600', marginBottom: '0.75rem' }}>
                          ℹ️ You will be asked to sign in to complete your booking. Your selected slot choice will be preserved!
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

export default ProviderPublicProfilePage;
