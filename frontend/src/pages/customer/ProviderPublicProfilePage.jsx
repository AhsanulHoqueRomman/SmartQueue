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

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // Avatar error state
  const [imgError, setImgError] = useState(false);

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

  const fetchAvailability = async () => {
    if (!organizationId || !providerId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    setLoadingAvailability(true);
    setBookingError(null);

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
      setBookingError(detailMsg || 'Failed to load availability.');
      setAvailability(null);
    } finally {
      setLoadingAvailability(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [organizationId, providerId, selectedServiceId, selectedDate]);

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedServiceId || !selectedDate) {
      setBookingError('Please complete all selection steps.');
      return;
    }

    if (!isAuthenticated) {
      const pendingState = {
        orgId: organizationId,
        providerId: providerId,
        serviceId: selectedServiceId,
        date: selectedDate,
        notes: notes,
      };
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(pendingState));
      navigate(`/login?redirect=/organizations/${organizationId}/providers/${providerId}`);
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    try {
      const appointment = await appointmentService.bookAppointment(organizationId, {
        provider_id: providerId,
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
        'Failed to book appointment. Please try again.';
      setBookingError(msg);
    } finally {
      setSubmitting(false);
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
  const name = profile.provider_name || 'Professional';
  const initials = name.split(' ').map(n => n[0]).filter(Boolean).join('').substring(0, 2).toUpperCase() || 'P';

  // Booking Confirmation View
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
            Your place with {profile.provider_name} is confirmed for {bookedAppointment.appointment_date || selectedDate}.
          </p>

          <div style={{ backgroundColor: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', textAlign: 'left', marginBottom: '1.75rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Professional:</span>
              <strong style={{ color: 'var(--lp-text)' }}>{profile.provider_name} ({profile.title || 'Provider'})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Organization:</span>
              <strong style={{ color: 'var(--lp-text)' }}>{profile.organization_name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>Service:</span>
              <strong style={{ color: 'var(--lp-text)' }}>{bookedAppointment.service_name || selectedService?.name}</strong>
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
            💡 <strong>Queue Telemetry Notice:</strong> Your estimated service window and recommended arrival time will update dynamically as live consultations progress.
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

      <div style={{ padding: '6rem 1rem 3rem 1rem', maxWidth: '1040px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Back Link */}
        <div style={{ marginBottom: '1rem' }}>
          <Link
            to={`/organizations/${organizationId}`}
            style={{ color: 'var(--lp-accent)', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Back to {profile.organization_name} Directory
          </Link>
        </div>

        {/* Profile Header Card */}
        <div
          style={{
            padding: '2rem',
            marginBottom: '2rem',
            backgroundColor: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '20px',
            boxShadow: '0 4px 20px var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '1.5rem' }}>
            {/* Photo Avatar with Fallback */}
            {profile.profile_photo && !imgError ? (
              <img
                src={profile.profile_photo}
                alt={name}
                onError={() => setImgError(true)}
                style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--lp-border)' }}
              />
            ) : (
              <div style={{
                width: '96px',
                height: '96px',
                borderRadius: '50%',
                backgroundColor: 'var(--lp-accent)',
                color: 'var(--lp-btn-primary-text, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.25rem',
                fontWeight: '800',
                border: '2px solid var(--lp-border)'
              }}>
                {initials}
              </div>
            )}

            {/* Info */}
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: '800', color: 'var(--lp-text)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {profile.provider_name}
                </h1>
                {profile.experience_years > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '6px', backgroundColor: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: '1px solid var(--lp-border)' }}>
                    {profile.experience_years} Years Exp.
                  </span>
                )}
              </div>

              {profile.title && (
                <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--lp-accent)', margin: '0 0 0.5rem 0' }}>
                  {profile.title}
                </p>
              )}

              <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', margin: '0 0 0.75rem 0' }}>
                🏢 <Link to={`/organizations/${organizationId}`} style={{ color: 'var(--lp-text)', fontWeight: 600, textDecoration: 'underline' }}>{profile.organization_name}</Link>
              </p>

              {/* Rating & Reviews */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--color-warning)', fontWeight: 'bold', fontSize: '1.1rem' }}>★</span>
                <span style={{ fontWeight: '800', color: 'var(--lp-text)' }}>
                  {profile.rating ? profile.rating.toFixed(1) : '4.9'}
                </span>
                <span style={{ color: 'var(--lp-text-subtle)' }}>
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
              📅 Book Appointment
            </button>
          </div>
        </div>

        {/* Bio / About */}
        {profile.bio && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '0.5rem', fontFamily: 'Outfit, sans-serif' }}>
              About & Professional Summary
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
              {profile.bio}
            </p>
          </div>
        )}

        {/* Specialties & Derived Categories */}
        {((profile.specialties && profile.specialties.length > 0) || (profile.categories && profile.categories.length > 0)) && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
              Specialties & Expertise
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {profile.specialties?.map((spec, idx) => (
                <span
                  key={idx}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '9999px',
                    background: 'var(--lp-bg-subtle)',
                    border: '1px solid var(--lp-border)',
                    color: 'var(--lp-text)',
                    fontSize: '0.825rem',
                    fontWeight: 600
                  }}
                >
                  ✨ {spec}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Education Section */}
        {profile.education && profile.education.length > 0 && (
          <div style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '1rem', fontFamily: 'Outfit, sans-serif' }}>
              🎓 Education & Qualifications
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {profile.education.map((edu, idx) => (
                <div key={idx} style={{ padding: '0.85rem 1rem', background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--lp-text)', fontSize: '0.95rem' }}>
                    {typeof edu === 'string' ? edu : edu.degree} {edu.field ? `in ${edu.field}` : ''}
                  </div>
                  {typeof edu === 'object' && edu.institution && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--lp-accent)', fontWeight: 600 }}>
                      {edu.institution} {edu.year ? `(${edu.year})` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Serial Booking Form for this Provider */}
        <div
          id="provider-booking-section"
          style={{
            padding: '2rem',
            backgroundColor: 'var(--lp-surface)',
            border: '2px solid var(--lp-accent)',
            borderRadius: '20px',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--lp-border)', paddingBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Serial Queue Booking
            </span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--lp-text)', marginTop: '0.25rem', marginBottom: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
              Book an Appointment with {profile.provider_name}
            </h2>
          </div>

          {bookingError && (
            <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: '10px', color: 'var(--color-error)', fontSize: '0.875rem' }}>
              {bookingError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Service & Date Pickers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  1. Select Offered Service
                </label>
                <select
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid var(--lp-border)', outline: 'none', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontSize: '0.9rem', cursor: 'pointer' }}
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                >
                  {profile.services?.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} (~{svc.duration_minutes} min {svc.price ? `- ৳${svc.price}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  2. Select Date
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

            {/* Availability Summary & Confirmation */}
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--lp-text)', marginBottom: '0.75rem', fontFamily: 'Outfit, sans-serif' }}>
                Queue Availability ({selectedDate})
              </h3>

              {!selectedServiceId ? (
                <EmptyState
                  title="Select Service"
                  message="Choose a service to view availability."
                />
              ) : loadingAvailability ? (
                <LoadingState message="Loading provider availability..." />
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
                        Additional Notes (Optional)
                      </label>
                      <textarea
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--lp-border)', outline: 'none', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                        rows="2"
                        placeholder="Add any specific requests..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={submitting || (availability && !availability.is_available)}
                      />
                    </div>

                    {!isAuthenticated && (
                      <p style={{ fontSize: '0.825rem', color: 'var(--lp-accent)', fontWeight: '600', marginBottom: '0.75rem' }}>
                        ℹ️ You will be asked to sign in to complete your serial booking.
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
                      {submitting ? 'Allocating Serial...' : (availability && !availability.is_available) ? 'Unavailable on Selected Date' : isAuthenticated ? 'Confirm Appointment & Join Queue for This Date' : 'Sign In to Confirm Booking'}
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

export default ProviderPublicProfilePage;
