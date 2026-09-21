import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg, selectOrg, organizations, loadingOrgs } = useTenant();

  // Selected State
  const [selectedOrgId, setSelectedOrgId] = useState(currentOrg?.id || '');
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');

  // Today date YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Availability State
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Notes & Booking State
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [conflictError, setConflictError] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // Loading flags
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [availableOrgs, setAvailableOrgs] = useState(organizations || []);
  const [loadingOrgsList, setLoadingOrgsList] = useState(false);

  // Sync availableOrgs from context or fetch directly if context is empty
  useEffect(() => {
    let isMounted = true;
    if (organizations && organizations.length > 0) {
      setAvailableOrgs(organizations);
    } else {
      setLoadingOrgsList(true);
      organizationService.getOrganizations()
        .then((data) => {
          if (!isMounted) return;
          const list = Array.isArray(data) ? data : data.results || [];
          setAvailableOrgs(list);
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setLoadingOrgsList(false);
        });
    }
    return () => { isMounted = false; };
  }, [organizations]);

  // Sync selected org
  useEffect(() => {
    if (currentOrg?.id) {
      setSelectedOrgId(currentOrg.id);
    } else if (!selectedOrgId && availableOrgs.length > 0) {
      const firstId = availableOrgs[0].id;
      setSelectedOrgId(firstId);
      selectOrg(firstId);
    }
  }, [currentOrg, availableOrgs, selectedOrgId, selectOrg]);

  const handleOrgChange = (e) => {
    const orgId = e.target.value;
    setSelectedOrgId(orgId);
    selectOrg(orgId);
    setSelectedServiceId('');
    setSelectedProviderId('');
    setAvailability(null);
    setSelectedSlot(null);
  };

  useEffect(() => {
    if (!selectedOrgId) {
      setServices([]);
      setProviders([]);
      return;
    }

    let isMounted = true;
    setLoadingDetails(true);
    setError(null);

    Promise.all([
      organizationService.getServices(selectedOrgId),
      organizationService.getProviders(selectedOrgId),
    ])
      .then(([servicesData, providersData]) => {
        if (!isMounted) return;
        const svcList = Array.isArray(servicesData) ? servicesData : servicesData.results || [];
        const provList = Array.isArray(providersData) ? providersData : providersData.results || [];

        setServices(svcList.filter(s => s.is_active !== false));
        setProviders(provList.filter(p => p.is_active !== false));

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
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.detail || 'Failed to load organization services and providers.');
        }
      })
      .finally(() => {
        if (isMounted) setLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedOrgId]);

  const fetchAvailability = async () => {
    if (!selectedOrgId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    setLoadingAvailability(true);
    setError(null);
    setConflictError(false);
    setSelectedSlot(null);

    try {
      const data = await appointmentService.getAvailability(
        selectedOrgId,
        selectedProviderId,
        selectedServiceId,
        selectedDate
      );
      setAvailability(data);
    } catch (err) {
      setError(
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
  }, [selectedOrgId, selectedProviderId, selectedServiceId, selectedDate]);

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
    setError(null);
    setConflictError(false);
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      setError('Please select an available time slot.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setConflictError(false);

    try {
      const appointment = await appointmentService.bookAppointment(selectedOrgId, {
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
        setError('This slot is no longer available because another booking occurred. Please select a different slot.');
        fetchAvailability();
      } else {
        const msg =
          errorData?.detail ||
          errorData?.non_field_errors?.[0] ||
          errorData?.start_datetime?.[0] ||
          'Failed to book appointment. Please check your selections and try again.';
        setError(msg);
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

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  // Success view if appointment is booked
  if (bookedAppointment) {
    const queueId = bookedAppointment.queue_entry?.id || bookedAppointment.queue_entry_id;
    return (
      <div className="card animate-page-entrance" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.25rem' }}>
          ✓
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>
          Serial Allocated Successfully
        </div>
        <h2 style={{ fontSize: '2.25rem', margin: '0.25rem 0 0.5rem', fontWeight: '800' }}>
          Serial #{bookedAppointment.serial_number || 1}
        </h2>
        <p className="subtitle" style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Your place in the provider queue is confirmed for {bookedAppointment.appointment_date || selectedDate}.
        </p>

        <div className="card" style={{ backgroundColor: 'var(--color-bg-subtle)', textAlign: 'left', marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div className="flex justify-between" style={{ paddingBottom: '0.65rem', borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-muted text-sm">Organization:</span>
            <strong className="text-main">{currentOrg?.name || selectedOrgId}</strong>
          </div>
          <div className="flex justify-between" style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-muted text-sm">Service & Provider:</span>
            <strong className="text-main">{bookedAppointment.service_name || selectedService?.name} &bull; {selectedProvider?.user_email || 'Assigned Provider'}</strong>
          </div>
          <div className="flex justify-between" style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-muted text-sm">Target Arrival Target:</span>
            <strong className="text-main">{new Date(bookedAppointment.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
          <div className="flex justify-between items-center" style={{ paddingTop: '0.65rem' }}>
            <span className="text-muted text-sm">Status:</span>
            <StatusBadge status={bookedAppointment.status} />
          </div>
        </div>

        <div className="card" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '1rem', textAlign: 'left', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#166534' }}>
          💡 <strong>Dynamic ETA Notice:</strong> Your actual consultation time will adapt continuously based on live queue movement. Please check in on your live queue tracker upon physical arrival.
        </div>

        <div className="flex justify-center gap-md flex-wrap">
          {queueId && (
            <button className="btn btn-primary" onClick={() => navigate(`/customer/queue/${queueId}`)}>
              📍 Track Live Queue & Check In
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/customer/appointments')}>
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
    <div className="animate-page-entrance">
      <div className="margin-bottom">
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Book an Appointment</h1>
        <p className="subtitle">Select an organization, service, provider, and dynamic slot.</p>
      </div>

      {error && (
        <div className={`banner ${conflictError ? 'banner-warning' : 'banner-danger'}`}>
          {error}
        </div>
      )}

      <div className="grid-responsive grid-cols-3 gap-lg">
        {/* Step 1 & 2 Selection Sidebar */}
        <div className="card flex flex-col gap-md" style={{ gridColumn: 'span 1' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Step 1</div>
            <h3>Organization</h3>
            <div className="form-group margin-top-sm">
              <select
                id="org-select"
                className="form-control"
                value={selectedOrgId}
                onChange={handleOrgChange}
                disabled={loadingOrgs || loadingOrgsList}
              >
                <option value="">-- Select Organization --</option>
                {availableOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedOrgId && (
            <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-info)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Step 2</div>
              <h3>Service & Provider</h3>

              {loadingDetails ? (
                <LoadingState message="Loading services & providers..." />
              ) : (
                <div className="flex flex-col gap-md margin-top-sm">
                  <div className="form-group">
                    <label className="form-label" htmlFor="service-select">Service</label>
                    <select
                      id="service-select"
                      className="form-control"
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                    >
                      {services.length === 0 ? (
                        <option value="">No active services found</option>
                      ) : (
                        services.map((svc) => (
                          <option key={svc.id} value={svc.id}>
                            {svc.name} ({svc.duration_minutes} min {svc.price ? `- $${svc.price}` : ''})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {selectedService && (
                    <div className="card" style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '0.85rem', fontSize: '0.85rem' }}>
                      <div><strong>Duration:</strong> {selectedService.duration_minutes} mins</div>
                      {selectedService.price && <div style={{ marginTop: '0.2rem' }}><strong>Price:</strong> ${selectedService.price}</div>}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="provider-select">Provider</label>
                    <select
                      id="provider-select"
                      className="form-control"
                      value={selectedProviderId}
                      onChange={(e) => setSelectedProviderId(e.target.value)}
                    >
                      {providers.length === 0 ? (
                        <option value="">No active providers found</option>
                      ) : (
                        providers.map((prov) => (
                          <option key={prov.id} value={prov.id}>
                            {prov.title ? `${prov.title} - ` : ''}
                            {prov.user_email || `Provider #${prov.id.slice(0, 8)}`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3 & 4 Date & Slot Picker Main Content */}
        <div className="card flex flex-col gap-md" style={{ gridColumn: 'span 2' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-success)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Step 3</div>
            <h3>Available Time Slots</h3>
          </div>

          {!selectedOrgId || !selectedServiceId || !selectedProviderId ? (
            <EmptyState
              title="Select Service & Provider"
              message="Choose an organization, service, and provider from the left panel to view dynamic slot availability."
            />
          ) : (
            <>
              <div className="form-group" style={{ maxWidth: '300px' }}>
                <label className="form-label" htmlFor="booking-date">Appointment Date</label>
                <input
                  type="date"
                  id="booking-date"
                  className="form-control"
                  min={todayStr}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              {loadingAvailability ? (
                <LoadingState message="Fetching provider operating schedule & serial availability..." />
              ) : !availability ? (
                <EmptyState
                  title="No Schedule Available"
                  message={`Provider is not operating on ${selectedDate}. Try selecting a different date or provider.`}
                />
              ) : (
                <div className="flex flex-col gap-md margin-top-sm">
                  {/* Provider Operating Hours Banner */}
                  <div className="card" style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '1.25rem', borderLeft: '4px solid var(--color-primary)' }}>
                    <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--color-text-main)', marginBottom: '0.35rem' }}>
                      Provider Operating Schedule: {selectedDate}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                      Serial Queue Booking Available &bull; Duration per patient: ~{selectedService?.duration_minutes || 15} mins
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-info)', marginTop: '0.5rem', fontWeight: '500' }}>
                      ℹ️ SmartQueue assigns sequential serial numbers. Your estimated consultation start will update continuously on your live queue tracker.
                    </div>
                  </div>

                  {/* Target Arrival Window Preference Selector */}
                  <div className="form-group margin-top-sm">
                    <label className="form-label" htmlFor="arrival-preference-select">
                      Preferred Target Arrival Window (Optional)
                    </label>
                    <p className="subtitle" style={{ fontSize: '0.825rem', marginBottom: '0.5rem' }}>
                      Select a preferred arrival target during operating hours. This helps estimate your serial position while live queue movement determines exact service order.
                    </p>
                    {availability.slots && availability.slots.length > 0 ? (
                      <div className="grid-responsive grid-cols-3 gap-sm">
                        {availability.slots.map((slot, idx) => {
                          const isSelected = selectedSlot?.start === slot.start;
                          return (
                            <button
                              key={idx}
                              type="button"
                              className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                              style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap' }}
                              onClick={() => handleSelectSlot(slot)}
                            >
                              Arrive ~{formatSlotTime(slot.start)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`btn ${selectedSlot ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '0.85rem 1.25rem', textAlign: 'left' }}
                        onClick={() => handleSelectSlot({ start: `${selectedDate}T09:00:00` })}
                      >
                        Book Next Available Serial on {selectedDate}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedSlot && (
                <form onSubmit={handleBookAppointment} style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Step 4</div>
                  <h3>Confirm Serial Booking</h3>
                  <p className="subtitle" style={{ marginBottom: '1rem' }}>
                    Target Arrival: <strong>{new Date(selectedSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({selectedDate})</strong>
                  </p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="booking-notes">Additional Notes for Provider (optional)</label>
                    <textarea
                      id="booking-notes"
                      className="form-control"
                      rows="3"
                      placeholder="Special instructions or requests..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={submitting}>
                    {submitting ? 'Assigning Serial Number...' : 'Book Queue Serial Now'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookAppointmentPage;
