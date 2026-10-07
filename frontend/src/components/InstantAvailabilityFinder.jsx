import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import organizationService from '../services/organizationService';
import appointmentService from '../services/appointmentService';
import useScrollPresence from '../hooks/useScrollPresence';
import { currentBusinessDate } from '../utils/bookingDisplay';
import { deriveProfessionalDisplay } from '../utils/providerDisplay';
import { matchesWorkingWindow } from '../utils/availabilityDisplay';
import '../styles/LandingPolish.css';

const list = data => Array.isArray(data) ? data : data.results || [];
const categoryOptions = [['ALL', 'All Categories'], ['HEALTHCARE', 'Healthcare'], ['SALON', 'Salon & Beauty'], ['DENTAL', 'Dental Care'], ['DIAGNOSTIC', 'Diagnostics'], ['CONSULTING', 'Consulting & Legal']];
function inCategory(org, category) {
  if (category === 'ALL') return true;
  const text = `${org.category || ''} ${org.industry_type || ''} ${org.industry_label || ''} ${org.name || ''} ${org.description || ''}`.toUpperCase();
  const words = { HEALTHCARE: ['HEALTHCARE', 'MEDICAL', 'CLINIC', 'HEALTH', 'DOCTOR'], SALON: ['SALON', 'BEAUTY', 'WELLNESS', 'HAIR', 'SPA'], DENTAL: ['DENTAL', 'ORTHODONTIC', 'TEETH'], DIAGNOSTIC: ['DIAGNOSTIC', 'LAB', 'IMAGING', 'TEST', 'SCREENING'], CONSULTING: ['CONSULTING', 'LEGAL', 'PROFESSIONAL', 'REPAIR', 'SERVICE', 'SUPPORT'] };
  return words[category]?.some(word => text.includes(word)) || false;
}

export default function InstantAvailabilityFinder({ organizations }) {
  const [ref, entered, , observed] = useScrollPresence(.1);
  const [selection, setSelection] = useState(() => ({ category: 'ALL', organization: '', service: '', provider: 'ANY', window: 'ANY', date: currentBusinessDate() }));
  const [serviceData, setServiceData] = useState({ key: '', rows: [], error: false });
  const [providerData, setProviderData] = useState({ key: '', rows: [], error: false });
  const [result, setResult] = useState(null);
  const [loadingKey, setLoadingKey] = useState(null);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  const orgs = useMemo(() => organizations.filter(org => inCategory(org, selection.category)), [organizations, selection.category]);
  const orgId = orgs.find(org => org.id === selection.organization)?.id || orgs[0]?.id || '';
  const organization = orgs.find(org => org.id === orgId);
  const services = serviceData.key === orgId ? serviceData.rows : [];
  const serviceId = services.find(service => service.id === selection.service)?.id || services[0]?.id || '';
  const providerKey = `${orgId}:${serviceId}`;
  const providers = providerData.key === providerKey ? providerData.rows : [];
  const providerId = providers.some(provider => provider.id === selection.provider) ? selection.provider : 'ANY';
  const key = [orgId, serviceId, providerId, selection.date, selection.window].join(':');
  const currentResult = result?.key === key ? result : null;
  const loading = loadingKey === key;
  const change = (field, value) => {
    request.current += 1;
    setResult(null);
    setLoadingKey(null);
    setSelection(old => ({ ...old, [field]: value,
      ...(['category', 'organization'].includes(field) ? { service: '', provider: 'ANY' } : {}),
      ...(field === 'category' ? { organization: '' } : {}),
      ...(field === 'service' ? { provider: 'ANY' } : {}),
    }));
  };
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    organizationService.getServices(orgId).then(data => {
      if (active) setServiceData({ key: orgId, rows: list(data).filter(row => row.is_active !== false), error: false });
    }).catch(() => { if (active) setServiceData({ key: orgId, rows: [], error: true }); });
    return () => { active = false; };
  }, [orgId]);
  useEffect(() => {
    if (!orgId || !serviceId) return;
    let active = true;
    organizationService.getProviders(orgId, { service_id: serviceId }).then(data => {
      if (active) setProviderData({ key: providerKey, rows: list(data).filter(row => row.is_active !== false && row.is_operationally_active !== false), error: false });
    }).catch(() => { if (active) setProviderData({ key: providerKey, rows: [], error: true }); });
    return () => { active = false; };
  }, [orgId, serviceId, providerKey]);
  const check = async event => {
    event.preventDefault();
    if (!orgId || !serviceId || !selection.date || loading) return;
    const token = ++request.current;
    setLoadingKey(key);
    const chosen = providerId === 'ANY' ? providers : providers.filter(row => row.id === providerId);
    const answers = await Promise.all(chosen.map(async provider => {
      try { return { provider, data: await appointmentService.getAvailability(orgId, provider.id, serviceId, selection.date) }; }
      catch { return { provider, error: true }; }
    }));
    if (request.current !== token) return;
    setResult({ key, answers });
    setLoadingKey(null);
  };
  const available = currentResult?.answers.filter(answer => !answer.error && answer.data.is_available === true && matchesWorkingWindow(answer.data, selection.window)) || [];
  const failed = currentResult?.answers.some(answer => answer.error);
  return <section ref={ref} className={`availability-finder ${observed ? 'is-observed' : ''} ${entered ? 'is-revealed' : ''}`} aria-labelledby="availability-heading">
    <header className="availability-header"><div className="availability-heading-label"><span className="availability-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5" /></svg></span><span className="discovery-eyebrow">Instant Availability Lookup</span></div><h2 id="availability-heading">Need an appointment?</h2><p>Check queue availability across organizations, then choose your professional.</p></header>
    <form onSubmit={check} className="availability-fields">
      <div><label htmlFor="finder-category">Category</label><select id="finder-category" value={selection.category} onChange={event => change('category', event.target.value)}>{categoryOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      <div><label htmlFor="finder-organization">Organization</label><select id="finder-organization" value={orgId} disabled={!orgs.length} onChange={event => change('organization', event.target.value)}>{!orgs.length && <option value="">No organizations available</option>}{orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></div>
      <div><label htmlFor="finder-service">Service</label><select id="finder-service" value={serviceId} disabled={!services.length} onChange={event => change('service', event.target.value)}>{!services.length && <option value="">{serviceData.key === orgId ? 'No services available' : 'Loading services…'}</option>}{services.map(service => <option key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min</option>)}</select></div>
      <div><label htmlFor="finder-professional">Professional</label><select id="finder-professional" value={providerId} disabled={!providers.length} onChange={event => change('provider', event.target.value)}><option value="ANY">Any eligible professional</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{deriveProfessionalDisplay(provider).displayName}</option>)}</select></div>
      <div><label htmlFor="finder-window">Preferred working window</label><select id="finder-window" value={selection.window} onChange={event => change('window', event.target.value)}><option value="ANY">Any working window</option><option value="MORNING">Morning · 8 AM–12 PM</option><option value="AFTERNOON">Afternoon · 12 PM–5 PM</option><option value="EVENING">Evening · 5 PM–9 PM</option></select></div>
      <div><label htmlFor="finder-date">Appointment date</label><input id="finder-date" type="date" value={selection.date} min={currentBusinessDate()} required onChange={event => change('date', event.target.value)} /></div>
      <div className="availability-actions"><p>Organization → Service → Professional.<br />Reserve a queue serial, not a fixed consultation time.</p><button type="submit" className="lp-btn-primary" disabled={loading || !orgId || !serviceId || !providers.length}>{loading ? 'Checking availability…' : 'Check Availability'}</button></div>
    </form>
    {(serviceData.key === orgId && serviceData.error || providerData.key === providerKey && providerData.error) && <p role="alert">Unable to load services or professionals. Please try again later.</p>}
    {currentResult && <div className="availability-results" aria-live="polite"><h3>{available.length ? `${available.length} professional${available.length === 1 ? '' : 's'} available on ${selection.date}` : failed ? 'Availability could not be fully checked.' : `No matching availability on ${selection.date}.`}</h3>{failed && <p role="alert">Some professionals could not be checked. Please try again.</p>}{!available.length && !failed && <p>{currentResult.answers.length === 1 ? currentResult.answers[0].data.reason || 'Try another date or working window.' : 'Try another date, professional or working window.'}</p>}{available.map(({ provider, data }) => <article key={provider.id}><div><strong>{deriveProfessionalDisplay(provider).displayName}</strong><p>{data.working_hours_display || 'Working hours unavailable'} · Capacity available</p></div><Link className="lp-btn-outline" to={`/customer/book?category=${encodeURIComponent(organization.industry_type)}&organization_id=${orgId}&service_id=${serviceId}&provider_id=${provider.id}&date=${selection.date}`}>Continue to serial booking</Link></article>)}</div>}
  </section>;
}
