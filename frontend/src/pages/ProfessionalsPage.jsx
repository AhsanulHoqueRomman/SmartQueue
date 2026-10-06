import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicNavbar from '../components/PublicNavbar';
import { useAuth } from '../contexts/AuthContext';
import { publicOrganizations, publicProfessionals } from '../services/discoveryService';
import providerManagementService from '../services/providerManagementService';
import { deriveProfessionalDisplay } from '../utils/providerDisplay';
import { formatCurrency } from '../utils/bookingDisplay';
import { weeklyWindows } from '../utils/scheduleDisplay';
import '../styles/LandingPhaseTwo.css';

function ProfessionalCard({ provider, authenticated }) {
  const [failed, setFailed] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const { displayName, designation, showDesignation } = deriveProfessionalDisplay(provider);
  useEffect(() => {
    let current = true;
    // This existing endpoint requires authentication. Never request it for guests.
    if (authenticated) providerManagementService.getSchedules(provider.organization.id, provider.id).then(rows => {
      if (current) setSchedule(rows.map(({ day_of_week, start_time, end_time, is_working_day }) => ({ day_of_week, start_time, end_time, is_working_day })));
    }).catch(() => { /* Public availability can still be checked by date on the profile. */ });
    return () => { current = false; };
  }, [provider.id, provider.organization.id, authenticated]);
  const windows = authenticated ? weeklyWindows(schedule, true).filter(row => row.window !== 'Not working') : [];
  return <article className="professional-discovery-card">
    <div className="professional-discovery-header">{provider.profile_photo && !failed ? <img src={provider.profile_photo} alt="" onError={() => setFailed(true)} />
      : <span className="professional-discovery-avatar" aria-hidden="true">{displayName.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span>}
      <div><h2>{displayName}</h2>{showDesignation && <p>{designation}</p>}{provider.experience_years > 0 && <small>{provider.experience_years} years of experience</small>}</div>
    </div>
    <Link className="professional-organization" to={`/organizations/${provider.organization.id}`}>{provider.organization.name}</Link>
    <span className="discovery-eyebrow">{provider.organization.industry_label}</span>
    <ul className="professional-charges">{provider.service_charges?.slice(0, 3).map(charge => <li key={charge.service_id}><span>{charge.service_name}</span><strong>{formatCurrency(charge.effective_customer_charge)}</strong></li>)}</ul>
    {provider.service_charges?.length > 3 && <small>More services on profile</small>}
    <div className="professional-schedule">{windows.length ? <>{windows.slice(0, 3).map(row => <p key={row.days}>{row.days} · {row.window}</p>)}{windows.length > 3 && <small>Hours vary by weekday.</small>}</> : <p>Select a date on the profile to check availability.</p>}</div>
    <Link className="lp-btn-outline" to={`/organizations/${provider.organization.id}/providers/${provider.id}`}>View Profile</Link>
  </article>;
}

export default function ProfessionalsPage() {
  const { isAuthenticated } = useAuth();
  const [providers, setProviders] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [query, setQuery] = useState('');
  const [organization, setOrganization] = useState('');
  const [industry, setIndustry] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    publicOrganizations().then(async orgs => {
      const result = await publicProfessionals(orgs);
      if (current) { setOrganizations(orgs); setProviders(result.providers); setIncomplete(result.incomplete); }
    }).catch(() => { if (current) setError(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload]);
  const filtered = useMemo(() => providers.filter(provider => {
    const { displayName } = deriveProfessionalDisplay(provider);
    const text = `${displayName} ${provider.title} ${provider.organization.name} ${provider.specialties?.join(' ')} ${provider.service_charges?.map(charge => charge.service_name).join(' ')}`.toLowerCase();
    return (!organization || provider.organization.id === organization) && (!industry || provider.organization.industry_type === industry) && text.includes(query.trim().toLowerCase());
  }), [providers, query, organization, industry]);
  const industries = [...new Map(organizations.map(org => [org.industry_type, org.industry_label])).entries()];
  const change = setter => event => { setter(event.target.value); setPage(1); };
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const retry = () => { setLoading(true); setError(false); setReload(value => value + 1); };
  return <div className="lp-root professionals-page"><PublicNavbar activePage="professionals" />
    <main className="professionals-content"><span className="discovery-eyebrow">Discover expertise near you</span><h1>Find your professional.</h1><p className="discovery-intro">Explore specialists across organizations. Compare services and customer charges, then choose the right person for your visit.</p>
      <div className="professional-filters"><label>Search professionals<input type="search" value={query} onChange={change(setQuery)} placeholder="Name, specialty or service" /></label>
        <label>Category<select value={industry} onChange={change(setIndustry)}><option value="">All categories</option>{industries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Organization<select value={organization} onChange={change(setOrganization)}><option value="">All organizations</option>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      </div>
      {loading ? <p role="status">Loading professionals…</p> : error ? <p role="alert">Professionals are unavailable right now. <button onClick={retry}>Try again</button></p> : <>
        {incomplete && <p role="status">Some organizations could not be loaded. <button onClick={retry}>Retry</button></p>}
        <p role="status" className="professional-result-count">{filtered.length} professionals{filtered.length ? ` · Page ${page} of ${pages}` : ' match your search'}</p>
        <div className="professionals-grid">{filtered.slice((page - 1) * 12, page * 12).map(provider => <ProfessionalCard key={`${provider.organization.id}-${provider.id}`} provider={provider} authenticated={isAuthenticated} />)}</div>
        {pages > 1 && <nav className="professional-pagination" aria-label="Professional results pages"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>{page} / {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
      </>}
    </main>
  </div>;
}
