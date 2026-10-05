import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import BookingStepper from '../../components/BookingStepper';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { deriveProfessionalDisplay } from '../../utils/providerDisplay';

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectOrg } = useTenant();

  // Progress Stepper steps
  const STEPPER_STEPS = [
    { id: 'category', label: 'Category' },
    { id: 'organization', label: 'Organization' },
    { id: 'service', label: 'Service' },
    { id: 'provider', label: 'Professional' },
    { id: 'date', label: 'Date' },
    { id: 'confirm', label: 'Confirm' },
  ];

  // Current Active Step (1 to 6)
  const [currentStep, setCurrentStep] = useState(1);

  // Dynamic Data Lists
  const [categories, setCategories] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);

  // Selection States
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');

  // Date State (default to today's date in local ISO YYYY-MM-DD)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Availability State
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Notes & Booking State
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // Loading Flags
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // 1. Fetch Global Categories on Mount
  useEffect(() => {
    let isMounted = true;
    setLoadingCategories(true);
    organizationService.getGlobalCategories()
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setCategories(list);

        // Check deep-link query parameter for category
        const paramCategory = searchParams.get('category') || searchParams.get('category_id');
        if (paramCategory && list.some(c => c.id.toLowerCase() === paramCategory.toLowerCase())) {
          setSelectedCategory(paramCategory);
          setCurrentStep(2);
        }
      })
      .catch(() => {
        if (isMounted) setError('Failed to load categories. Please refresh.');
      })
      .finally(() => {
        if (isMounted) setLoadingCategories(false);
      });
    return () => { isMounted = false; };
  }, [searchParams]);

  // 2. Fetch Organizations when selectedCategory changes
  useEffect(() => {
    if (!selectedCategory) {
      setOrganizations([]);
      return;
    }

    let isMounted = true;
    setLoadingOrgs(true);
    organizationService.getOrganizations({ category: selectedCategory })
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setOrganizations(list);

        // Check deep-link query parameter for organization
        const paramOrg = searchParams.get('organization_id') || searchParams.get('org_id');
        if (paramOrg && list.some(o => o.id === paramOrg)) {
          setSelectedOrgId(paramOrg);
          selectOrg(paramOrg);
          setCurrentStep(3);
        }
      })
      .catch(() => {
        if (isMounted) setOrganizations([]);
      })
      .finally(() => {
        if (isMounted) setLoadingOrgs(false);
      });
    return () => { isMounted = false; };
  }, [selectedCategory, searchParams, selectOrg]);

  // 3. Fetch Services when selectedOrgId changes
  useEffect(() => {
    if (!selectedOrgId) {
      setServices([]);
      return;
    }

    let isMounted = true;
    setLoadingServices(true);
    organizationService.getServices(selectedOrgId)
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const activeList = list.filter(s => s.is_active !== false);
        setServices(activeList);

        // Check deep-link query parameter for service
        const paramService = searchParams.get('service_id');
        if (paramService && activeList.some(s => s.id === paramService)) {
          setSelectedServiceId(paramService);
          setCurrentStep(4);
        }
      })
      .catch(() => {
        if (isMounted) setServices([]);
      })
      .finally(() => {
        if (isMounted) setLoadingServices(false);
      });
    return () => { isMounted = false; };
  }, [selectedOrgId, searchParams]);

  // 4. Fetch Providers when selectedOrgId or selectedServiceId changes
  useEffect(() => {
    if (!selectedOrgId || !selectedServiceId) {
      setProviders([]);
      return;
    }

    let isMounted = true;
    setLoadingProviders(true);
    organizationService.getProviders(selectedOrgId, { service_id: selectedServiceId })
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const activeList = list.filter(p => p.is_active !== false);
        setProviders(activeList);

        // Check deep-link query parameter for provider
        const paramProvider = searchParams.get('provider_id');
        if (paramProvider && activeList.some(p => p.id === paramProvider)) {
          setSelectedProviderId(paramProvider);
          setCurrentStep(5);
        } else if (activeList.length === 1) {
          // Preselect if single eligible provider
          setSelectedProviderId(activeList[0].id);
        }
      })
      .catch(() => {
        if (isMounted) setProviders([]);
      })
      .finally(() => {
        if (isMounted) setLoadingProviders(false);
      });
    return () => { isMounted = false; };
  }, [selectedOrgId, selectedServiceId, searchParams]);

  // 5. Fetch Availability Telemetry when Provider, Service, and Date are selected
  useEffect(() => {
    if (!selectedOrgId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setAvailability(null);
      return;
    }

    // Invalidate stale state immediately
    setAvailability(null);
    let isMounted = true;
    setLoadingAvailability(true);
    appointmentService.getAvailability(selectedOrgId, selectedProviderId, selectedServiceId, selectedDate)
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
  }, [selectedOrgId, selectedProviderId, selectedServiceId, selectedDate]);

  // --- Cascade Reset Handlers ---
  const handleCategorySelect = (catId) => {
    setSelectedCategory(catId);
    setSelectedOrgId('');
    setSelectedServiceId('');
    setSelectedProviderId('');
    setAvailability(null);
    setError(null);
    if (catId) setCurrentStep(2);
  };

  const handleOrgSelect = (orgId) => {
    setSelectedOrgId(orgId);
    if (orgId) selectOrg(orgId);
    setSelectedServiceId('');
    setSelectedProviderId('');
    setAvailability(null);
    setError(null);
    if (orgId) setCurrentStep(3);
  };

  const handleServiceSelect = (svcId) => {
    setSelectedServiceId(svcId);
    setSelectedProviderId('');
    setAvailability(null);
    setError(null);
    if (svcId) setCurrentStep(4);
  };

  const handleProviderSelect = (provId) => {
    setSelectedProviderId(provId);
    setError(null);
    if (provId) setCurrentStep(5);
  };

  const handleDateSelect = (dateStr) => {
    setSelectedDate(dateStr);
    setError(null);
    if (selectedProviderId && dateStr) {
      setCurrentStep(6);
    }
  };

  // --- Derived Active Selected Objects ---
  const selectedOrg = useMemo(() => organizations.find(o => o.id === selectedOrgId), [organizations, selectedOrgId]);
  const selectedService = useMemo(() => services.find(s => s.id === selectedServiceId), [services, selectedServiceId]);
  const selectedProvider = useMemo(() => providers.find(p => p.id === selectedProviderId), [providers, selectedProviderId]);

  // Check if selected date is in the past
  const isPastDate = useMemo(() => {
    if (!selectedDate) return false;
    return selectedDate < todayStr;
  }, [selectedDate, todayStr]);

  // Handle Serial Queue Booking Submit
  const handleBookSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedProviderId || !selectedServiceId || !selectedDate) {
      setError('Please complete all selection steps.');
      return;
    }

    if (isPastDate) {
      setError('Appointments cannot be booked for a past date.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await appointmentService.bookAppointment(selectedOrgId, {
        provider_id: selectedProviderId,
        service_id: selectedServiceId,
        appointment_date: selectedDate,
        notes,
      });
      setBookedAppointment(result);
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || err.response?.data?.appointment_date || 'Failed to book appointment. Please try again.';
      setError(typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Render Confirmation Screen after Successful Booking
  if (bookedAppointment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-sand-50 dark:bg-navy-900 border border-sand-200 dark:border-navy-800 rounded-2xl p-8 shadow-lg text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-teal-900/50 text-emerald-600 dark:text-teal-400 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm">
            ✓
          </div>

          <h2 className="text-2xl font-extrabold text-espresso-900 dark:text-sand-50 tracking-tight">
            Appointment Confirmed & Serial Allocated!
          </h2>

          <p className="text-sm text-sand-600 dark:text-sand-300 max-w-md mx-auto">
            You have successfully joined the queue. Below is your allocated serial position and forecast window.
          </p>

          <div className="bg-sand-100/70 dark:bg-navy-800/70 rounded-xl p-6 border border-sand-200/80 dark:border-navy-700/80 max-w-md mx-auto text-left space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-sand-200 dark:border-navy-700">
              <span className="text-xs uppercase tracking-wider text-sand-500 dark:text-sand-400 font-semibold">Your Serial Number</span>
              <span className="text-2xl font-black text-espresso-900 dark:text-teal-400">#{bookedAppointment.serial_number || '1'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-sand-600 dark:text-sand-400">Organization:</span>
              <span className="font-semibold text-espresso-900 dark:text-sand-100">{selectedOrg?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-sand-600 dark:text-sand-400">Service:</span>
              <span className="font-semibold text-espresso-900 dark:text-sand-100">{selectedService?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-sand-600 dark:text-sand-400">Professional:</span>
              <span className="font-semibold text-espresso-900 dark:text-sand-100">
                {selectedProvider?.membership?.user?.first_name || 'Dr.'} {selectedProvider?.membership?.user?.last_name || selectedProvider?.title}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-sand-600 dark:text-sand-400">Date:</span>
              <span className="font-semibold text-espresso-900 dark:text-sand-100">{selectedDate}</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/customer/appointments')}
              className="px-6 py-3 bg-espresso-900 hover:bg-espresso-800 text-sand-50 dark:bg-teal-400 dark:hover:bg-teal-300 dark:text-navy-950 font-bold rounded-xl shadow-md transition-all duration-200"
            >
              View My Appointments & Live Queue
            </button>
            <button
              onClick={() => {
                setBookedAppointment(null);
                setCurrentStep(1);
                setSelectedCategory('');
                setSelectedOrgId('');
                setSelectedServiceId('');
                setSelectedProviderId('');
                setAvailability(null);
              }}
              className="px-6 py-3 bg-sand-200 hover:bg-sand-300 dark:bg-navy-800 dark:hover:bg-navy-700 text-espresso-900 dark:text-sand-100 font-semibold rounded-xl transition-all duration-200"
            >
              Book Another Appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-wizard-page animate-page-entrance">
      {/* Page Header */}
      <div className="booking-header">
        <h1 className="booking-title">
          Book an Appointment & Join Queue
        </h1>
        <p className="booking-subtitle">
          Choose a category, organization, service and professional. Your serial and live estimated service window are assigned after booking.
        </p>
      </div>

      {/* Progress Stepper */}
      <BookingStepper
        steps={STEPPER_STEPS}
        currentStep={currentStep}
        onStepClick={(stepNum) => setCurrentStep(stepNum)}
      />

      {/* Error Alert */}
      {error && (
        <div className="banner banner-danger mb-6 flex justify-between items-center" style={{ borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '1.25rem' }}>×</button>
        </div>
      )}

      {/* Main 2-Column Workspace (Unboxed Continuous Flow) */}
      <div className="booking-workspace-grid">
        
        {/* Left Column: Selection Journey */}
        <div className="booking-journey-column">
          
          {/* STEP 1: CATEGORY SELECTION (FILTER / DROPDOWN CONTROL) */}
          <section className="booking-step-section animate-section">
            <div className="booking-step-header">
              <h2 className="booking-step-title">
                <span className="booking-step-badge">1</span>
                Category
              </h2>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="booking-step-change-btn"
                >
                  Change Category
                </button>
              )}
            </div>

            {loadingCategories ? (
              <LoadingState message="Loading categories..." />
            ) : (
              <div>
                <select
                  id="category_select_input"
                  aria-label="Select Category"
                  value={selectedCategory}
                  onChange={(e) => handleCategorySelect(e.target.value)}
                  className="booking-select-control"
                >
                  <option value="">-- Select a Category --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.industry_label || 'Professional Services'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* STEP 2: ORGANIZATION SELECTION */}
          {selectedCategory && (
            <section className="booking-step-section animate-section">
              <div className="booking-step-header">
                <h2 className="booking-step-title">
                  <span className="booking-step-badge">2</span>
                  Organization
                </h2>
                {selectedOrgId && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="booking-step-change-btn"
                  >
                    Change Organization
                  </button>
                )}
              </div>

              {loadingOrgs ? (
                <LoadingState message="Loading organizations..." />
              ) : organizations.length === 0 ? (
                <EmptyState title="No Organizations Found" description="No verified active organizations are available in this category." />
              ) : (
                <div>
                  <select
                    id="org_select_input"
                    aria-label="Select Organization"
                    value={selectedOrgId}
                    onChange={(e) => handleOrgSelect(e.target.value)}
                    className="booking-select-control"
                  >
                    <option value="">-- Select an Organization --</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} — {org.address || 'Location N/A'} {org.verification_status === 'APPROVED' ? '✓ Verified' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Contextual org detail preview */}
                  {selectedOrg && (
                    <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-main)' }}>{selectedOrg.name}</strong>
                        {selectedOrg.tagline && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>"{selectedOrg.tagline}"</div>}
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>📍 {selectedOrg.address || 'Dhanmondi, Dhaka'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/organizations/${selectedOrg.id}`)}
                        className="booking-step-change-btn"
                        style={{ fontSize: '0.75rem' }}
                      >
                        View Storefront →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* STEP 3: SERVICE SELECTION */}
          {selectedOrgId && (
            <section className="booking-step-section animate-section">
              <div className="booking-step-header">
                <h2 className="booking-step-title">
                  <span className="booking-step-badge">3</span>
                  Service
                </h2>
                {selectedServiceId && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="booking-step-change-btn"
                  >
                    Change Service
                  </button>
                )}
              </div>

              {loadingServices ? (
                <LoadingState message="Loading services..." />
              ) : services.length === 0 ? (
                <EmptyState title="No Services Found" description="No active services are configured for this organization." />
              ) : (
                <div>
                  <select
                    id="service_select_input"
                    aria-label="Select Service"
                    value={selectedServiceId}
                    onChange={(e) => handleServiceSelect(e.target.value)}
                    className="booking-select-control"
                  >
                    <option value="">-- Select a Service --</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} — ৳{svc.price || '0'} (~{svc.duration_minutes || 30} min)
                      </option>
                    ))}
                  </select>

                  {/* Contextual service detail preview */}
                  {selectedService && (
                    <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-main)' }}>{selectedService.name}</strong>
                        {selectedService.description && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.15rem' }}>{selectedService.description}</div>}
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                          Typical duration: <strong>~{selectedService.duration_minutes || 30} min</strong>
                        </div>
                      </div>
                      {selectedService.price && (
                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-main)' }}>
                          ৳{selectedService.price}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* STEP 4: ELIGIBLE PROFESSIONAL SELECTION (RADIO LIST) */}
          {selectedServiceId && (
            <section className="booking-step-section animate-section">
              <div className="booking-step-header">
                <h2 className="booking-step-title">
                  <span className="booking-step-badge">4</span>
                  Eligible Professional
                </h2>
                {selectedProviderId && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    className="booking-step-change-btn"
                  >
                    Change Professional
                  </button>
                )}
              </div>

              {loadingProviders ? (
                <LoadingState message="Loading eligible professionals..." />
              ) : providers.length === 0 ? (
                <EmptyState title="No Eligible Professionals" description="No active professionals currently offer this service." />
              ) : (
                <div className="professional-radio-list" role="radiogroup" aria-label="Select Professional">
                  {providers.map((prov) => {
                    const isSelected = selectedProviderId === prov.id;
                    const { displayName: fullName, designation, showDesignation } = deriveProfessionalDisplay(prov, 'Professional');
                    const u = prov.membership?.user || {};
                    const initials = `${(u.first_name || 'P')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();

                    return (
                      <div
                        key={prov.id}
                        onClick={() => handleProviderSelect(prov.id)}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleProviderSelect(prov.id); }}
                        className={`professional-radio-card ${isSelected ? 'professional-radio-card-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="provider_selection"
                          checked={isSelected}
                          onChange={() => handleProviderSelect(prov.id)}
                          className="professional-radio-input"
                        />

                        <div className="professional-avatar-box">
                          {prov.profile_photo ? (
                            <img
                              src={prov.profile_photo}
                              alt={fullName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            initials
                          )}
                        </div>

                        <div className="professional-info-block">
                          <div className="professional-name-text">{fullName}</div>
                          {showDesignation && <div className="professional-credentials-text">{designation}</div>}
                          <div className="professional-designation-text">
                            {prov.bio || 'Available for consultations'}
                          </div>
                          <div className="professional-experience-text">
                            {prov.experience_years > 0 && `${prov.experience_years} years experience`}
                            {prov.specialties && Array.isArray(prov.specialties) && prov.specialties.length > 0 && (
                              ` • ${prov.specialties.join(', ')}`
                            )}
                          </div>
                          {availability && isSelected && !isPastDate && (
                            <div className="professional-schedule-pill">
                              📅 {availability.working_hours_display || 'Available today'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* STEP 5: DATE SELECTION & TEMPORAL VALIDATION */}
          {selectedProviderId && (
            <section className="booking-step-section animate-section">
              <div className="booking-step-header">
                <h2 className="booking-step-title">
                  <span className="booking-step-badge">5</span>
                  Appointment Date
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label htmlFor="appointment_date_input" className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                    Date:
                  </label>
                  <input
                    id="appointment_date_input"
                    type="date"
                    min={todayStr}
                    value={selectedDate}
                    onChange={(e) => handleDateSelect(e.target.value)}
                    className="form-control"
                    style={{ width: 'auto', padding: '0.55rem 0.85rem', fontWeight: 600 }}
                  />
                </div>

                {/* Past Date Warning Banner */}
                {isPastDate && (
                  <div className="past-date-alert">
                    <span>⚠️ This date has already passed. Choose today or a future date.</span>
                  </div>
                )}

                {/* Real-time Availability State */}
                {!isPastDate && loadingAvailability ? (
                  <LoadingState message="Checking provider queue capacity..." />
                ) : !isPastDate && availability ? (
                  <div>
                    {availability.is_available ? (
                      <span className="status-badge status-confirmed" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}>
                        ✓ AVAILABLE {availability.working_hours_display || ''} • CAPACITY AVAILABLE
                      </span>
                    ) : (
                      <span className="status-badge status-cancelled" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}>
                        ✕ {availability.reason || availability.message || 'Not available on this date'}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {/* STEP 6: REVIEW & CONFIRM SECTION */}
          {selectedDate && (
            <section className="booking-step-section animate-section">
              <div className="booking-step-header">
                <h2 className="booking-step-title">
                  <span className="booking-step-badge">6</span>
                  Review & Confirm Booking
                </h2>
              </div>

              {/* Optional Notes */}
              <div className="form-group mb-4">
                <label className="form-label" style={{ fontWeight: 700 }}>
                  Additional Notes for Provider (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any relevant request or information for the provider..."
                  rows={3}
                  className="form-control"
                />
              </div>

              {/* Explanatory Notice */}
              <div className="banner banner-warning mb-4" style={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                ⓘ Your serial is assigned after confirmation. Your estimated service time is a live forecast and may change as the queue progresses.
              </div>

              {/* Confirm CTA */}
              <button
                type="button"
                onClick={handleBookSubmit}
                disabled={submitting || !selectedOrgId || !selectedProviderId || !selectedServiceId || !selectedDate || isPastDate || (availability && availability.is_available === false)}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.9rem 1.5rem', fontSize: '1rem', fontWeight: 800 }}
              >
                {submitting ? 'Allocating Serial...' : 'Confirm Appointment & Join Queue'}
              </button>
            </section>
          )}
        </div>

        {/* Right Column: Compact Sticky Booking Summary Sidebar */}
        <div className="sticky-summary-sidebar">
          <h3 className="sidebar-summary-title">
            Current Selection
          </h3>

          <div className="sidebar-summary-row">
            <span className="sidebar-summary-label">Category</span>
            <span className={selectedCategory ? "sidebar-summary-value" : "sidebar-summary-value-empty"}>
              {selectedCategory ? (categories.find(c => c.id.toLowerCase() === selectedCategory.toLowerCase())?.name || selectedCategory) : 'Not selected'}
            </span>
          </div>

          <div className="sidebar-summary-row">
            <span className="sidebar-summary-label">Organization</span>
            <span className={selectedOrg ? "sidebar-summary-value" : "sidebar-summary-value-empty"}>
              {selectedOrg ? selectedOrg.name : 'Not selected'}
            </span>
          </div>

          <div className="sidebar-summary-row">
            <span className="sidebar-summary-label">Service</span>
            <span className={selectedService ? "sidebar-summary-value" : "sidebar-summary-value-empty"}>
              {selectedService ? selectedService.name : 'Not selected'}
            </span>
          </div>

          <div className="sidebar-summary-row">
            <span className="sidebar-summary-label">Professional</span>
            <span className={selectedProvider ? "sidebar-summary-value" : "sidebar-summary-value-empty"}>
              {selectedProvider ? `${selectedProvider.membership?.user?.first_name || ''} ${selectedProvider.membership?.user?.last_name || selectedProvider.title}` : 'Not selected'}
            </span>
          </div>

          <div className="sidebar-summary-row">
            <span className="sidebar-summary-label">Date</span>
            <span className={selectedDate ? "sidebar-summary-value" : "sidebar-summary-value-empty"}>
              {selectedDate || 'Not selected'}
            </span>
          </div>

          {selectedService && (
            <div className="sidebar-summary-row" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border-subtle)' }}>
              <span className="sidebar-summary-label">Est. Duration</span>
              <span className="sidebar-summary-value">~{selectedService.duration_minutes || 30} min</span>
            </div>
          )}

          {availability && availability.working_hours_display && !isPastDate && (
            <div className="sidebar-summary-row">
              <span className="sidebar-summary-label">Provider Hours</span>
              <span className="sidebar-summary-value" style={{ fontSize: '0.8125rem' }}>{availability.working_hours_display}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
