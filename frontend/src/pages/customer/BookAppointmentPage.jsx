import { useState, useEffect, useRef, useCallback } from 'react';
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
import { formatCurrency, providerCharge, bookingError, currentBusinessDate } from '../../utils/bookingDisplay';
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
  return <div className="direct-weekly-hours" aria-label={provider ? 'Professional working schedule' : 'Organization operating hours'}>
    {windows.length ? windows.map(row => <div key={row.days}><span>{row.days}</span><span>{row.window}</span></div>) : <span>Hours unavailable</span>}
  </div>;
}

function SelectionSection({ number, title, selected, onChange, children }) {
  return <section className="booking-step-section" aria-labelledby={`direct-step-${number}`}>
    <div className="booking-step-header">
      <h2 className="booking-step-title" id={`direct-step-${number}`}><span className="booking-step-badge">{number}</span>{title}</h2>
      {selected && <button type="button" className="booking-step-change-btn" onClick={onChange}>Change {STEPS[number - 1].label}</button>}
    </div>
    {children}
  </section>;
}

function StartingCharge({ service }) {
  return service.starting_from_price == null ? <span className="direct-muted">Price unavailable</span>
    : <span className="direct-starting-charge"><small>Starting from</small><strong>{formatCurrency(service.starting_from_price)}</strong></span>;
}

function ProfessionalAvatar({ provider, name }) {
  const [failed, setFailed] = useState(false);
  return provider.profile_photo && !failed ? <img className="direct-avatar" src={provider.profile_photo} alt="" onError={() => setFailed(true)} />
    : <span className="direct-avatar direct-avatar-fallback" aria-hidden="true">{name.split(' ').filter(word => word !== 'Dr.').slice(0, 2).map(word => word[0]).join('')}</span>;
}

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const contact = useBookingContact();
  const [searchParams] = useSearchParams();
  const { selectOrg } = useTenant();
  const today = currentBusinessDate();
  const [selection, setSelection] = useState(() => {
    const requestedDate = searchParams.get('date');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') && requestedDate >= today ? requestedDate : today;
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
    // Query parameters initialize the journey once; changing a selection never reapplies them.
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
      // Existing authenticated schedule endpoint. Retain only customer-safe weekly windows.
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
  const validDate = Boolean(selection.date && !isPastDate && availability?.is_available === true && !loadingAvailability);
  const ready = Boolean(selectedCategory && selectedOrg && selectedService && selectedProvider && validDate && charge != null && Number.isFinite(Number(charge)) && contact.valid);
  const currentStep = !selectedCategory ? 1 : !selectedOrg ? 2 : !selectedService ? 3 : !selectedProvider ? 4 : !validDate ? 5 : 6;

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
    }).catch(() => {
      if (active && availabilityRequest.current === request) setAvailabilityError('Unable to check availability. Choose the date again to retry.');
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

  if (bookedAppointment) return <div className="direct-booking-success">
    <h1>Appointment Confirmed & Serial Allocated!</h1>
    <p>Your Serial Number <strong>#{bookedAppointment.serial_number ?? bookedAppointment.queue_number ?? '—'}</strong></p>
    <BookingSummary organization={selectedOrg} service={selectedService} provider={selectedProvider} appointment={bookedAppointment} confirmation />
    <p>You booked a queue serial. Expected service time remains a live forecast.</p>
    <div className="direct-success-actions"><button className="btn btn-primary" onClick={() => navigate('/customer/appointments')}>View My Appointments & Live Queue</button>
      <button className="btn btn-secondary" onClick={() => { setBookedAppointment(null); choose('category'); }}>Book Another Appointment</button></div>
  </div>;

  const summaryContent = <div className="direct-summary-content">
    {!selectedCategory ? <p>Start by choosing a category. Your selections will appear here as you continue.</p> : <>
      <span className="direct-summary-category">{selectedCategory.name}</span>
      {selectedOrg && <h3>{selectedOrg.name}</h3>}
      {selectedService && <p className="direct-summary-service">{selectedService.name}</p>}
      {selectedService && !selectedProvider && <StartingCharge service={selectedService} />}
      {selectedProvider && <><p>{deriveProfessionalDisplay(selectedProvider).displayName}</p><div className="direct-summary-charge"><small>Service Charge</small><strong>{formatCurrency(charge)}</strong></div></>}
      {selectedProvider && selection.date && <p>{displayDate(selection.date)}</p>}
      {availability?.is_available && <p className="direct-summary-availability">Available{availability.working_hours_display ? ` · ${availability.working_hours_display}` : ''} · Capacity Available</p>}
      {loadingAvailability && selectedProvider && <p>Checking date availability…</p>}
      {availability?.is_available === false && <p>{availability.reason || 'Not available on this date'}</p>}
      <p className="direct-summary-next">{!selectedOrg ? 'Choose an organization next' : !selectedService ? 'Choose a service next' : !selectedProvider ? 'Choose a professional next' : !validDate ? 'Choose an available date to continue' : 'Add your contact details, then review your booking'}</p>
    </>}
  </div>;

  return <div className="booking-wizard-page direct-booking-page">
    <div className="booking-header"><h1 className="booking-title">Book an Appointment & Join Queue</h1>
      <p className="booking-subtitle">Choose a category, organization, service and professional. Book a queue serial; expected service time is a forecast.</p></div>
    <BookingStepper steps={STEPS} currentStep={currentStep} onStepClick={step => choose(DEPENDENCIES[step - 1] || 'date', step === 5 ? selection.date : '')} />
    {error && !showReview && <div className="banner banner-danger" role="alert">{error}</div>}
    <details className="direct-mobile-summary"><summary>Your Booking</summary>{summaryContent}</details>
    <div className="booking-workspace-grid">
      <div className="booking-journey-column">
        <SelectionSection number={1} title="Category" selected={selection.category} onChange={() => choose('category')}>
          {loading.categories ? <LoadingState message="Loading categories..." /> : <select id="category_select_input" aria-label="Select Category" value={selection.category} onChange={e => choose('category', e.target.value)} className="booking-select-control">
            <option value="">-- Select a Category --</option>{categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>}
          {!selection.category && <p className="direct-guidance">Select a category first to see relevant organizations and continue your booking.</p>}
        </SelectionSection>
        {selectedCategory && <SelectionSection number={2} title="Organization" selected={selection.organization} onChange={() => choose('organization')}>
          {loading.organizations ? <LoadingState message="Loading organizations..." /> : !organizations.length ? <EmptyState title="No Organizations Found" description="No active organizations are available in this category." /> :
            <div className="direct-choice-list" role="group" aria-label="Select Organization">{organizations.map(org => <div key={org.id} className={`direct-choice-card ${selection.organization === org.id ? 'is-selected' : ''}`}>
              <label className="direct-choice-label"><input type="radio" name="organization" value={org.id} checked={selection.organization === org.id} onChange={() => choose('organization', org.id)} /><span className="direct-choice-info"><strong>{org.name}</strong>
                {org.smartqueue_verified && <span className="direct-verified">✓ QueueTurn Verified</span>}<span className="direct-muted">{org.industry_label}</span></span></label>
              <div className="direct-choice-details"><ScheduleSummary records={org.operating_hours || []} /><p className="direct-muted">{org.address || 'Location unavailable'}</p>
                <Link to={`/organizations/${org.id}`} target="_blank" rel="noopener noreferrer">View Organization Profile</Link></div>
            </div>)}</div>}
        </SelectionSection>}
        {selectedOrg && <SelectionSection number={3} title="Service" selected={selection.service} onChange={() => choose('service')}>
          {loading.services ? <LoadingState message="Loading services..." /> : !services.length ? <EmptyState title="No Services Available" /> :
            <div className="direct-choice-list" role="group" aria-label="Select Service">{services.map(service => <label key={service.id} className={`direct-choice-card direct-choice-label ${selection.service === service.id ? 'is-selected' : ''}`}>
              <input type="radio" name="service" value={service.id} checked={selection.service === service.id} onChange={() => choose('service', service.id)} />
              <span className="direct-choice-info"><strong>{service.name}</strong><span className="direct-service-description">{service.description}</span>
                <span className="direct-service-meta"><span className="direct-muted">Typical duration · {service.duration_minutes} min</span><StartingCharge service={service} /></span></span>
            </label>)}</div>}
        </SelectionSection>}
        {selectedService && <SelectionSection number={4} title="Eligible Professional" selected={selection.provider} onChange={() => choose('provider')}>
          {loading.providers ? <LoadingState message="Loading professionals..." /> : !providers.length ? <EmptyState title="No Eligible Professionals" /> :
            <div className="direct-choice-list" role="group" aria-label="Select Professional">{providers.map(provider => {
              const display = deriveProfessionalDisplay(provider);
              return <div key={provider.id} className={`direct-choice-card ${selection.provider === provider.id ? 'is-selected' : ''}`}>
                <label className="direct-choice-label"><input type="radio" name="provider" value={provider.id} checked={selection.provider === provider.id} onChange={() => choose('provider', provider.id)} />
                  <ProfessionalAvatar provider={provider} name={display.displayName} /><span className="direct-choice-info"><strong>{display.displayName}</strong>
                    {display.showDesignation && <span className="direct-muted">{display.designation}</span>}{provider.experience_years != null && <span className="direct-muted">{provider.experience_years} years experience</span>}
                    <span className="direct-professional-charge">Service Charge <strong>{formatCurrency(providerCharge(provider, selection.service))}</strong></span></span></label>
                <div className="direct-choice-details"><ScheduleSummary records={schedules[provider.id] || []} provider />
                  <Link to={`/organizations/${selection.organization}/providers/${provider.id}`} target="_blank" rel="noopener noreferrer">View Full Profile</Link></div>
              </div>;
            })}</div>}
        </SelectionSection>}
        {selectedProvider && <SelectionSection number={5} title="Appointment Date">
          <label className="form-label" htmlFor="appointment_date_input">Appointment Date</label>
          <input id="appointment_date_input" className="form-control direct-date-input" type="date" min={today} value={selection.date} onChange={e => choose('date', e.target.value)} />
          <div className="direct-availability" aria-live="polite">
            {isPastDate && <p className="banner banner-danger">Appointments cannot be booked for a past date.</p>}
            {loadingAvailability && <p>Checking provider availability…</p>}
            {availabilityError && <p role="alert">{availabilityError}</p>}
            {availability && <p className={`banner ${availability.is_available ? 'banner-success' : 'banner-warning'}`}>{availability.is_available ? `Available${availability.working_hours_display ? ` · ${availability.working_hours_display}` : ''} · Capacity Available` : availability.reason || 'Not available on this date'}</p>}
          </div>
        </SelectionSection>}
        {selectedProvider && validDate && <SelectionSection number={6} title="Review & Confirm Booking">
          <form onSubmit={reviewBooking}><BookingContactFields contact={contact} />
            <label className="form-label" htmlFor="direct-booking-notes">Additional Notes (optional)</label>
            <textarea id="direct-booking-notes" className="form-control" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any relevant request or information for the provider..." />
            <button className="btn btn-primary direct-review-button" type="submit" disabled={!ready || submitting}>Review & Confirm Booking</button>
          </form>
        </SelectionSection>}
      </div>
      <aside className="direct-desktop-summary" aria-label="Your Booking"><h2>Your Booking</h2>{summaryContent}</aside>
    </div>
    <BookingReviewModal open={showReview} onBack={closeReview} onConfirm={confirmBooking} submitting={submitting} ready={ready} error={error}
      organization={selectedOrg} service={selectedService} provider={selectedProvider} date={displayDate(selection.date)}
      contact={{ name: contact.payload.contact_name, phone: contact.payload.contact_phone }} charge={charge} notes={notes.trim()} />
  </div>;
}

export default BookAppointmentPage;
