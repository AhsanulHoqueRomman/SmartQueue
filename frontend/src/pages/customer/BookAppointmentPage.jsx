import { useBookingWindow } from '../../hooks/useBookingWindow';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import providerManagementService from '../../services/providerManagementService';
import appointmentService from '../../services/appointmentService';
import BookingStepper from '../../components/BookingStepper';
import BookingReviewModal from '../../components/BookingReviewModal';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { deriveProfessionalDisplay } from '../../utils/providerDisplay';
import { formatCurrency, providerCharge, bookingError } from '../../utils/bookingDisplay';
import { formatAvailabilityError } from '../../utils/availabilityDisplay';
import { weeklyWindows } from '../../utils/scheduleDisplay';
import { BookingContactFields, BookingSummary } from '../../components/BookingContact';
import { useBookingContact } from '../../hooks/useBookingContact';
import '../../styles/DirectBooking.css';

const STEPS = ['Category', 'Organization', 'Service', 'Professional', 'Date', 'Confirm'].map(label => ({ id: label, label }));
const DEPENDENCIES = ['category', 'organization', 'service', 'provider'];
const asList = data => Array.isArray(data) ? data : data?.results || [];
const displayDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function ScheduleSummary({ records, provider = false }) {
  const windows = weeklyWindows(records, provider);
  return (
    <div className="direct-weekly-hours" aria-label={provider ? 'Professional working schedule' : 'Organization operating hours'}>
      {windows.length ? (
        windows.map(row => (
          <div key={row.days}>
            <span>{row.days}</span>
            <span>{row.window}</span>
          </div>
        ))
      ) : (
        <span>Hours unavailable</span>
      )}
    </div>
  );
}

function SelectionSection({ number, title, selected, onChange, children }) {
  return (
    <section className="booking-step-section" aria-labelledby={`direct-step-${number}`}>
      <div className="booking-step-header">
        <h2 className="booking-step-title" id={`direct-step-${number}`}>
          <span className="booking-step-badge">{number}</span>
          {title}
        </h2>
        {selected && (
          <button type="button" className="booking-step-change-btn" onClick={onChange}>
            Change {STEPS[number - 1].label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function StartingCharge({ service }) {
  return service.starting_from_price == null ? (
    <span className="direct-muted">Price unavailable</span>
  ) : (
    <span className="direct-starting-charge">
      <small>Starting from</small>
      <strong>{formatCurrency(service.starting_from_price)}</strong>
    </span>
  );
}

function ProfessionalAvatar({ provider, name }) {
  const [failed, setFailed] = useState(false);
  return provider.profile_photo && !failed ? (
    <img className="direct-avatar" src={provider.profile_photo} alt="" onError={() => setFailed(true)} />
  ) : (
    <span className="direct-avatar direct-avatar-fallback" aria-hidden="true">
      {name.split(' ').filter(word => word !== 'Dr.').slice(0, 2).map(word => word[0]).join('')}
    </span>
  );
}

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const contact = useBookingContact();
  const [searchParams] = useSearchParams();
  const { selectOrg } = useTenant();
  const { first: today, last: lastBookingDate } = useBookingWindow();
  const [selection, setSelection] = useState(() => {
    const requestedDate = searchParams.get('date');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') && requestedDate >= today && requestedDate <= lastBookingDate ? requestedDate : today;
    return { category: '', organization: '', service: '', provider: '', date };
  });
  const selectionRef = useRef(selection);
  const initialLink = useRef(searchParams);
  const allowDeepLink = useRef(true);
  const availabilityRequest = useRef(0);
  const submissionPending = useRef(false);
  const [categories, setCategories] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState({ categories: true, organizations: false, services: false, providers: false });
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState(null);
  const closeReview = useCallback(() => { if (!submissionPending.current) setShowReview(false); }, []);

  // One cascading transition for selects, Change buttons, and completed stepper steps.
  // Contact/notes are deliberately outside this dependency chain. Keep the preferred date,
  // but discard every old availability response immediately, including in-flight responses.
  const choose = (dependency, value = '') => {
    allowDeepLink.current = false;
    const next = { ...selectionRef.current, [dependency]: value };
    const index = DEPENDENCIES.indexOf(dependency);
    if (index >= 0) DEPENDENCIES.slice(index + 1).forEach(key => { next[key] = ''; });
    selectionRef.current = next;
    availabilityRequest.current += 1;
    setAvailabilityRevision(old => old + 1);
    setSelection(next);
    setAvailabilityResult(null);
    setAvailabilityError(null);
    setLoadingAvailability(false);
    setShowReview(false);
    setError(null);
    if (index === 0) setOrganizations([]);
    if (index <= 1 && index >= 0) setServices([]);
    if (index <= 2 && index >= 0) { setProviders([]); setSchedules({}); }
    if (dependency === 'organization' && value) selectOrg(value);
  };

  const applyDeepLink = useCallback((key, value) => {
    if (!allowDeepLink.current || !value) return;
    const next = { ...selectionRef.current, [key]: value };
    selectionRef.current = next;
    setSelection(next);
    if (key === 'organization') selectOrg(value);
  }, [selectOrg]);

  useEffect(() => {
    let active = true;
    organizationService.getGlobalCategories().then(data => {
      if (!active) return;
      const list = asList(data);
      setCategories(list);
      const category = initialLink.current.get('category') || initialLink.current.get('category_id');
      const match = list.find(row => row.id.toLowerCase() === category?.toLowerCase());
      if (match) applyDeepLink('category', match.id);
    }).catch(() => { if (active) setError('Failed to load categories. Please refresh.'); })
      .finally(() => { if (active) setLoading(old => ({ ...old, categories: false })); });
    return () => { active = false; };
  }, [applyDeepLink]);

  useEffect(() => {
    if (!selection.category) return;
    let active = true;
    const category = selection.category;
    setLoading(old => ({ ...old, organizations: true }));
    organizationService.getOrganizations({ category }).then(data => {
      if (!active || selectionRef.current.category !== category) return;
      const list = asList(data);
      setOrganizations(list);
      const id = initialLink.current.get('organization_id') || initialLink.current.get('org_id');
      if (list.some(row => row.id === id)) applyDeepLink('organization', id);
    }).catch(() => { if (active) setError('Unable to load organizations. Please try again.'); })
      .finally(() => { if (active) setLoading(old => ({ ...old, organizations: false })); });
    return () => { active = false; };
  }, [selection.category, applyDeepLink]);

  useEffect(() => {
    if (!selection.organization) return;
    let active = true;
    const organization = selection.organization;
    setLoading(old => ({ ...old, services: true }));
    organizationService.getServices(organization).then(data => {
      if (!active || selectionRef.current.organization !== organization) return;
      const list = asList(data).filter(row => row.is_active !== false);
      setServices(list);
      const id = initialLink.current.get('service_id');
      if (list.some(row => row.id === id)) applyDeepLink('service', id);
    }).catch(() => { if (active) setError('Unable to load services. Please try again.'); })
      .finally(() => { if (active) setLoading(old => ({ ...old, services: false })); });
    return () => { active = false; };
  }, [selection.organization, applyDeepLink]);

  useEffect(() => {
    if (!selection.organization || !selection.service) return;
    let active = true;
    const organization = selection.organization;
    const service = selection.service;
    setLoading(old => ({ ...old, providers: true }));
    organizationService.getProviders(organization, { service_id: service }).then(data => {
      if (!active || selectionRef.current.organization !== organization || selectionRef.current.service !== service) return;
      const list = asList(data).filter(row => row.is_active !== false && row.is_operationally_active !== false);
      setProviders(list);
      const id = initialLink.current.get('provider_id');
      if (list.some(row => row.id === id)) applyDeepLink('provider', id);
      list.forEach(provider => {
        providerManagementService.getSchedules(organization, provider.id).then(data => {
          if (!active || selectionRef.current.organization !== organization || selectionRef.current.service !== service) return;
          const windows = asList(data).map(({ day_of_week, start_time, end_time, is_working_day }) => ({ day_of_week, start_time, end_time, is_working_day }));
          setSchedules(old => ({ ...old, [provider.id]: windows }));
        }).catch(() => { /* Unknown schedules display honestly; date availability remains authoritative. */ });
      });
    }).catch(() => { if (active) setError('Unable to load professionals. Please try again.'); })
      .finally(() => { if (active) setLoading(old => ({ ...old, providers: false })); });
    return () => { active = false; };
  }, [selection.organization, selection.service, applyDeepLink]);

  const availabilityKey = [selection.organization, selection.service, selection.provider, selection.date, availabilityRevision].join(':');
  const selectedCategory = categories.find(row => row.id === selection.category);
  const selectedOrg = organizations.find(row => row.id === selection.organization);
  const selectedService = services.find(row => row.id === selection.service);
  const selectedProvider = providers.find(row => row.id === selection.provider);
  const charge = providerCharge(selectedProvider, selection.service);
  const isPastDate = selection.date < today;
  const availability = availabilityResult?.key === availabilityKey ? availabilityResult.data : null;
  const validDate = Boolean(selection.date && !isPastDate && selection.date <= lastBookingDate && availability?.is_available === true && !loadingAvailability);
  const ready = Boolean(selectedCategory && selectedOrg && selectedService && selectedProvider && validDate && charge != null && Number.isFinite(Number(charge)) && contact.valid);
  const currentStep = !selectedCategory ? 1 : !selectedOrg ? 2 : !selectedService ? 3 : !selectedProvider ? 4 : !validDate ? 5 : 6;

  // 4 calendar days (today + 3 days) in Asia/Dhaka window
  const dateOptions = useMemo(() => {
    if (!today || !lastBookingDate) return [];
    const list = [];
    const [y, m, d] = today.split('-').map(Number);
    for (let i = 0; i < 4; i++) {
      const dt = new Date(y, m - 1, d + i);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (iso <= lastBookingDate) {
        list.push({
          date: iso,
          label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-GB', { weekday: 'short' }),
          formatted: dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        });
      }
    }
    return list;
  }, [today, lastBookingDate]);

  useEffect(() => {
    setAvailabilityResult(null);
    setAvailabilityError(null);
    if (!selection.organization || !selection.service || !selection.provider || !selection.date || selection.date < today) {
      setLoadingAvailability(false);
      return;
    }
    let active = true;
    const request = ++availabilityRequest.current;
    setLoadingAvailability(true);
    appointmentService.getAvailability(selection.organization, selection.provider, selection.service, selection.date).then(data => {
      if (active && availabilityRequest.current === request) setAvailabilityResult({ key: availabilityKey, data });
    }).catch(err => {
      if (active && availabilityRequest.current === request) setAvailabilityError(formatAvailabilityError(err));
    }).finally(() => {
      if (active && availabilityRequest.current === request) setLoadingAvailability(false);
    });
    return () => { active = false; };
  }, [availabilityKey, selection.organization, selection.service, selection.provider, selection.date, today]);

  const reviewBooking = event => {
    event.preventDefault();
    if (!ready) { setError('Complete the selections, check availability, and enter valid booking contact details.'); return; }
    setError(null);
    setShowReview(true);
  };

  const confirmBooking = async () => {
    if (!showReview || !ready || submissionPending.current) return;
    submissionPending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await appointmentService.bookAppointment(selection.organization, {
        provider_id: selection.provider, service_id: selection.service,
        appointment_date: selection.date, notes, ...contact.payload,
      });
      setBookedAppointment(result);
      setShowReview(false);
    } catch (err) { setError(bookingError(err, 'Failed to book appointment. Please try again.')); }
    finally { submissionPending.current = false; setSubmitting(false); }
  };

  if (bookedAppointment) {
    const serial = bookedAppointment.serial_number ?? bookedAppointment.queue_number ?? '—';
    return (
      <div className="booking-wizard-page direct-booking-page">
        <div className="direct-booking-success">
          <div className="direct-success-header">
            <div className="direct-success-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="direct-success-svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="direct-success-title">Appointment Confirmed & Serial Allocated!</h1>
            <p className="direct-success-subtitle">
              Your appointment has been registered and serial atomically allocated.
            </p>
          </div>

          <div className="direct-success-serial-card">
            <span className="direct-success-serial-label">Your Queue Serial</span>
            <span className="direct-success-serial-number">#{serial}</span>
            <p className="direct-success-serial-notice">
              You booked an authoritative queue serial. Serial ordering is strictly maintained. Expected service time remains a live forecast based on actual consultation pace.
            </p>
          </div>

          <BookingSummary
            organization={selectedOrg}
            service={selectedService}
            provider={selectedProvider}
            appointment={bookedAppointment}
            confirmation
          />

          <div className="direct-success-actions">
            <button
              type="button"
              className="btn btn-primary direct-success-btn-main"
              onClick={() => navigate('/customer/appointments')}
            >
              View My Appointments & Live Queue
            </button>
            <button
              type="button"
              className="btn btn-secondary direct-success-btn-sub"
              onClick={() => { setBookedAppointment(null); choose('category'); }}
            >
              Book Another Appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  const summaryContent = (
    <div className="direct-summary-content">
      {!selectedCategory ? (
        <div className="direct-summary-empty">
          <p>Start by choosing a category. Your booking details will build here as you proceed.</p>
        </div>
      ) : (
        <div className="direct-summary-card">
          <div className="direct-summary-section">
            <span className="direct-summary-label">Category</span>
            <span className="direct-summary-value">{selectedCategory.name}</span>
          </div>

          {selectedOrg && (
            <div className="direct-summary-section">
              <span className="direct-summary-label">Organization</span>
              <span className="direct-summary-value direct-summary-org-name">{selectedOrg.name}</span>
              {selectedOrg.smartqueue_verified && (
                <span className="direct-summary-verified">✓ Verified</span>
              )}
            </div>
          )}

          {selectedService && (
            <div className="direct-summary-section">
              <span className="direct-summary-label">Service</span>
              <span className="direct-summary-value">{selectedService.name}</span>
              {selectedService.duration_minutes && (
                <span className="direct-summary-sub">{selectedService.duration_minutes} min duration</span>
              )}
            </div>
          )}

          {selectedProvider && (
            <div className="direct-summary-section">
              <span className="direct-summary-label">Professional</span>
              <span className="direct-summary-value">{deriveProfessionalDisplay(selectedProvider).displayName}</span>
            </div>
          )}

          {selectedProvider && selection.date && (
            <div className="direct-summary-section">
              <span className="direct-summary-label">Appointment Date</span>
              <span className="direct-summary-value">{displayDate(selection.date)}</span>
              {loadingAvailability && (
                <span className="direct-summary-sub">Checking date availability…</span>
              )}
              {availability?.is_available === true && (
                <span className="direct-summary-avail-badge is-ok">Available · Capacity Open</span>
              )}
              {availability?.is_available === false && (
                <span className="direct-summary-avail-badge is-no">{availability.reason || 'Unavailable'}</span>
              )}
              {availabilityError && (
                <span className="direct-summary-error">{availabilityError}</span>
              )}
            </div>
          )}

          {selectedService && !selectedProvider && (
            <div className="direct-summary-pricing">
              <StartingCharge service={selectedService} />
            </div>
          )}

          {selectedProvider && (
            <div className="direct-summary-pricing">
              <span className="direct-summary-charge-label">Service Charge</span>
              <strong className="direct-summary-charge-amount">{formatCurrency(charge)}</strong>
              <small className="direct-summary-charge-note">Estimated consultation charge</small>
            </div>
          )}

          <div className="direct-summary-hint">
            <p className="direct-summary-next">
              {!selectedOrg
                ? 'Choose an organization next'
                : !selectedService
                ? 'Choose a service next'
                : !selectedProvider
                ? 'Choose a professional next'
                : !validDate
                ? 'Choose an available date to continue'
                : 'Enter your contact details and review booking'}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="booking-wizard-page direct-booking-page">
      <div className="booking-header">
        <h1 className="booking-title">Book an Appointment & Join Queue</h1>
        <p className="booking-subtitle">
          Choose a category, organization, service and professional. Book a queue serial; expected service time is a live forecast.
        </p>
      </div>

      <BookingStepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={step => choose(DEPENDENCIES[step - 1] || 'date', step === 5 ? selection.date : '')}
      />

      {error && !showReview && (
        <div className="banner banner-danger direct-page-error" role="alert">
          {error}
        </div>
      )}

      <details className="direct-mobile-summary">
        <summary>Booking Overview</summary>
        {summaryContent}
      </details>

      <div className="booking-workspace-grid">
        <div className="booking-journey-column">
          {/* Step 1: Category */}
          <SelectionSection number={1} title="Category" selected={selection.category} onChange={() => choose('category')}>
            {loading.categories ? (
              <LoadingState message="Loading categories..." />
            ) : (
              <div className="direct-category-container">
                <select
                  id="category_select_input"
                  aria-label="Select Category"
                  value={selection.category}
                  onChange={e => choose('category', e.target.value)}
                  className="booking-select-control direct-select-control"
                >
                  <option value="">-- Select a Category --</option>
                  {categories.map(row => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>

                {!selection.category && (
                  <div className="direct-category-grid" role="group" aria-label="Available Categories">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        className="direct-category-card"
                        onClick={() => choose('category', cat.id)}
                      >
                        <span className="direct-category-card-title">{cat.name}</span>
                        {cat.description && (
                          <span className="direct-category-card-desc">{cat.description}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!selection.category && (
              <p className="direct-guidance">Select a category first to see relevant organizations and continue your booking.</p>
            )}
          </SelectionSection>

          {/* Step 2: Organization */}
          {selectedCategory && (
            <SelectionSection number={2} title="Organization" selected={selection.organization} onChange={() => choose('organization')}>
              {loading.organizations ? (
                <LoadingState message="Loading organizations..." />
              ) : !organizations.length ? (
                <EmptyState title="No Organizations Found" description="No active organizations are available in this category." />
              ) : (
                <div className="direct-choice-list" role="group" aria-label="Select Organization">
                  {organizations.map(org => {
                    const isSelected = selection.organization === org.id;
                    return (
                      <div key={org.id} className={`direct-choice-card direct-choice-org ${isSelected ? 'is-selected' : ''}`}>
                        <label className="direct-choice-label">
                          <input
                            type="radio"
                            name="organization"
                            value={org.id}
                            checked={isSelected}
                            onChange={() => choose('organization', org.id)}
                          />
                          <span className="direct-choice-info">
                            <span className="direct-card-title-row">
                              <strong className="direct-org-name">{org.name}</strong>
                              {org.smartqueue_verified && (
                                <span className="direct-verified-badge" title="QueueTurn Verified Organization">
                                  ✓ Verified
                                </span>
                              )}
                            </span>
                            {org.industry_label && (
                              <span className="direct-industry-pill">{org.industry_label}</span>
                            )}
                            {org.address && (
                              <p className="direct-org-address">{org.address}</p>
                            )}
                          </span>
                        </label>
                        <div className="direct-choice-details">
                          <ScheduleSummary records={org.operating_hours || []} />
                          <Link
                            to={`/organizations/${org.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="direct-profile-link"
                          >
                            View Organization Profile ↗
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SelectionSection>
          )}

          {/* Step 3: Service */}
          {selectedOrg && (
            <SelectionSection number={3} title="Service" selected={selection.service} onChange={() => choose('service')}>
              {loading.services ? (
                <LoadingState message="Loading services..." />
              ) : !services.length ? (
                <EmptyState title="No Services Available" description="No active services found for this organization." />
              ) : (
                <div className="direct-choice-list" role="group" aria-label="Select Service">
                  {services.map(service => {
                    const isSelected = selection.service === service.id;
                    return (
                      <label
                        key={service.id}
                        className={`direct-choice-card direct-choice-label direct-choice-service ${isSelected ? 'is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="service"
                          value={service.id}
                          checked={isSelected}
                          onChange={() => choose('service', service.id)}
                        />
                        <span className="direct-choice-info">
                          <span className="direct-service-head">
                            <strong className="direct-service-name">{service.name}</strong>
                            {service.duration_minutes != null && (
                              <span className="direct-duration-badge">
                                {service.duration_minutes} min
                              </span>
                            )}
                          </span>
                          {service.description && (
                            <span className="direct-service-description">{service.description}</span>
                          )}
                          <span className="direct-service-meta">
                            <StartingCharge service={service} />
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </SelectionSection>
          )}

          {/* Step 4: Eligible Professional */}
          {selectedService && (
            <SelectionSection number={4} title="Eligible Professional" selected={selection.provider} onChange={() => choose('provider')}>
              {loading.providers ? (
                <LoadingState message="Loading professionals..." />
              ) : !providers.length ? (
                <EmptyState title="No Eligible Professionals" description="No professionals are currently assigned to this service." />
              ) : (
                <div className="direct-choice-list" role="group" aria-label="Select Professional">
                  {providers.map(provider => {
                    const display = deriveProfessionalDisplay(provider);
                    const isSelected = selection.provider === provider.id;
                    const provCharge = providerCharge(provider, selection.service);
                    return (
                      <div key={provider.id} className={`direct-choice-card direct-choice-provider ${isSelected ? 'is-selected' : ''}`}>
                        <label className="direct-choice-label">
                          <input
                            type="radio"
                            name="provider"
                            value={provider.id}
                            checked={isSelected}
                            onChange={() => choose('provider', provider.id)}
                          />
                          <ProfessionalAvatar provider={provider} name={display.displayName} />
                          <span className="direct-choice-info">
                            <span className="direct-provider-head">
                              <strong className="direct-provider-name">{display.displayName}</strong>
                              {display.showDesignation && (
                                <span className="direct-designation-badge">{display.designation}</span>
                              )}
                            </span>
                            {provider.experience_years != null && (
                              <span className="direct-muted">{provider.experience_years} years experience</span>
                            )}
                            <span className="direct-professional-charge">
                              <small>Service Charge</small>
                              <strong>{formatCurrency(provCharge)}</strong>
                            </span>
                          </span>
                        </label>
                        <div className="direct-choice-details">
                          <ScheduleSummary records={schedules[provider.id] || []} provider />
                          <Link
                            to={`/organizations/${selection.organization}/providers/${provider.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="direct-profile-link"
                          >
                            View Full Profile ↗
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SelectionSection>
          )}

          {/* Step 5: Appointment Date & Real-Time Availability */}
          {selectedProvider && (
            <SelectionSection number={5} title="Appointment Date" selected={Boolean(selection.date && validDate)} onChange={() => choose('date', '')}>
              <div className="direct-date-container">
                <label className="form-label" htmlFor="appointment_date_input">
                  Appointment Date (Asia/Dhaka Window: Today + 3 calendar days)
                </label>
                <div className="direct-date-presets" role="radiogroup" aria-label="Quick Date Selection">
                  {dateOptions.map(opt => {
                    const isDateSelected = selection.date === opt.date;
                    return (
                      <button
                        key={opt.date}
                        type="button"
                        className={`direct-date-pill ${isDateSelected ? 'is-selected' : ''}`}
                        onClick={() => choose('date', opt.date)}
                        aria-checked={isDateSelected}
                        role="radio"
                      >
                        <span className="direct-date-pill-label">{opt.label}</span>
                        <span className="direct-date-pill-value">{opt.formatted}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="direct-date-custom-row">
                  <span className="direct-date-custom-label">Calendar Date:</span>
                  <input
                    id="appointment_date_input"
                    className="form-control direct-date-input"
                    type="date"
                    min={today}
                    max={lastBookingDate}
                    value={selection.date}
                    onChange={e => choose('date', e.target.value)}
                  />
                </div>
              </div>

              <div className="direct-availability" aria-live="polite">
                {isPastDate && (
                  <div className="banner banner-danger" role="alert">
                    Appointments cannot be booked for a past date.
                  </div>
                )}
                {loadingAvailability && (
                  <div className="direct-availability-loading">
                    <span className="direct-availability-spinner" aria-hidden="true" />
                    <span>Checking provider availability for {displayDate(selection.date)}…</span>
                  </div>
                )}
                {availabilityError && !loadingAvailability && (
                  <div className="banner banner-danger" role="alert">
                    {availabilityError}
                  </div>
                )}
                {availability && !loadingAvailability && (
                  <div className={`direct-availability-card ${availability.is_available ? 'is-available' : 'is-unavailable'}`}>
                    <div className="direct-availability-badge">
                      {availability.is_available ? (
                        <>
                          <span className="direct-avail-indicator is-online">●</span>
                          <strong>Available for Online Booking</strong>
                        </>
                      ) : (
                        <>
                          <span className="direct-avail-indicator is-offline">●</span>
                          <strong>Unavailable on Selected Date</strong>
                        </>
                      )}
                    </div>
                    <div className="direct-availability-details">
                      {availability.is_available ? (
                        <>
                          {availability.working_hours_display && (
                            <p className="direct-avail-schedule">
                              Working Hours: <strong>{availability.working_hours_display}</strong>
                            </p>
                          )}
                          <p className="direct-avail-note">
                            Capacity open. A queue serial is reserved atomically upon final confirmation.
                          </p>
                        </>
                      ) : (
                        <p className="direct-avail-reason">
                          {availability.reason || 'Professional is not available on this date. Please select another date.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </SelectionSection>
          )}

          {/* Step 6: Contact Details & Review */}
          {selectedProvider && validDate && (
            <SelectionSection number={6} title="Review & Confirm Booking">
              <div className="direct-contact-container">
                <div className="direct-contact-advisory">
                  <span>ℹ Contact details are saved as a booking snapshot for queue notifications and arrival verification.</span>
                </div>
                <form onSubmit={reviewBooking}>
                  <BookingContactFields contact={contact} />
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label" htmlFor="direct-booking-notes">
                      Additional Notes (optional)
                    </label>
                    <textarea
                      id="direct-booking-notes"
                      className="form-control"
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add any relevant request or details for the professional..."
                    />
                  </div>
                  <button
                    className="btn btn-primary direct-review-button"
                    type="submit"
                    disabled={!ready || submitting}
                  >
                    Review & Confirm Booking
                  </button>
                </form>
              </div>
            </SelectionSection>
          )}
        </div>

        {/* Right sticky sidebar */}
        <aside className="direct-desktop-summary" aria-label="Booking Overview">
          <h2 className="direct-desktop-summary-title">Booking Overview</h2>
          {summaryContent}
        </aside>
      </div>

      <BookingReviewModal
        open={showReview}
        onBack={closeReview}
        onConfirm={confirmBooking}
        submitting={submitting}
        ready={ready}
        error={error}
        organization={selectedOrg}
        service={selectedService}
        provider={selectedProvider}
        date={displayDate(selection.date)}
        contact={{ name: contact.payload.contact_name, phone: contact.payload.contact_phone }}
        charge={charge}
        notes={notes.trim()}
      />
    </div>
  );
}

export default BookAppointmentPage;
