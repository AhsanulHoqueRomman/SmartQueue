import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import queueService from '../services/queueService';
import organizationService from '../services/organizationService';
import { useAuth } from '../contexts/AuthContext';
import { useRequestScope } from '../hooks/useRequestScope';
import { useBookingWindow } from '../hooks/useBookingWindow';
import { currentBusinessDate, bookingError, formatCurrency, providerCharge } from '../utils/bookingDisplay';
import { recoveryPayload } from '../utils/emergencyDisplay.js';

const root = (org, provider) => `/organizations/${org}/providers/${provider}/emergencies/`;

export function EmergencyPanel(props) {
  const { user } = useAuth();
  return <EmergencyContent key={`${user?.id}:${props.orgId}:${props.providerId}:${props.serviceDate}:${props.mode}`} {...props} />;
}

function EmergencyContent({ orgId, providerId, serviceDate, mode, onChanged }) {
  const key = `${orgId}:${providerId}:${serviceDate}:${mode}`;
  const scope = useRequestScope(key);
  const [incident, setIncident] = useState(null);
  const [providers, setProviders] = useState([]);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const load = useCallback(async () => {
    if (busyRef.current) return;
    const ticket = scope.begin(key, { background: true });
    if (!ticket) return;
    try {
      const response = await apiClient.get(root(orgId, providerId), { params: { service_date: serviceDate } });
      if (scope.isCurrent(ticket)) { setIncident(response.data[0] || null); setLoaded(true); }
    } catch (error) { if (scope.isCurrent(ticket)) { setFeedback(bookingError(error)); setLoaded(true); } }
    finally { scope.finish(ticket); }
  }, [scope, key, orgId, providerId, serviceDate]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    let active = true;
    if (mode !== 'provider') organizationService.getProviders(orgId).then(data => { if (active) setProviders(Array.isArray(data) ? data : data.results || []); }).catch(() => {});
    return () => { active = false; clearInterval(timer); };
  }, [load, orgId, mode]);
  const consultationAction = async (row, action) => {
    if (busyRef.current) return;
    const ticket = scope.begin(key); if (!ticket) return;
    busyRef.current = true; setBusy(true); setFeedback('');
    try {
      if (action === 'INTERRUPTED') await apiClient.post(`${root(orgId, providerId)}${incident.id}/recoveries/${row.id}/`, { action });
      else await queueService.completeEntry(orgId, row.queue_entry_id);
      if (!scope.isCurrentScope(ticket)) return;
      busyRef.current = false; await load(); onChanged?.();
    } catch (error) { if (scope.isCurrentScope(ticket)) setFeedback(bookingError(error)); }
    finally { if (scope.isCurrentScope(ticket)) { busyRef.current = false; setBusy(false); } }
  };
  const action = async value => {
    if (busyRef.current) return;
    const ticket = scope.begin(key); if (!ticket) return;
    busyRef.current = true; setBusy(true); setFeedback('');
    try {
      const response = value === 'DECLARE'
        ? await apiClient.post(root(orgId, providerId), { service_date: serviceDate, private_reason: reason })
        : await apiClient.post(`${root(orgId, providerId)}${incident.id}/action/`, { action: value });
      if (!scope.isCurrentScope(ticket)) return;
      setIncident(response.data); setFeedback('Emergency action recorded. Email acceptance is shown separately; delivery is not guaranteed.');
      onChanged?.();
    } catch (error) { if (scope.isCurrentScope(ticket)) setFeedback(bookingError(error)); }
    finally { if (scope.isCurrentScope(ticket)) { busyRef.current = false; setBusy(false); } }
  };
  if (!loaded) return <section className="card"><p>Loading service interruption status…</p></section>;
  return <section className="card flex flex-col gap-md">
    <h3>Emergency service interruption · {serviceDate}</h3>
    {feedback && <p role="status">{feedback}</p>}
    {incident ? <>
      <strong>{incident.status_label}</strong>
      <p>{incident.unresolved_count} unresolved bookings. {incident.state === 'TEMPORARY'
        ? 'The hold remains active. Do not begin outbound recovery calls; customer-initiated assistance may be recorded.'
        : incident.state === 'UNAVAILABLE' ? 'This service date is finalized. Staff may begin recovery calls; it cannot resume.'
          : 'Staff should personally confirm attendance or another available date. Original serial order remains.'}</p>
      <p>Email attempts: {Object.entries(incident.email_states).map(([state, count]) => `${state}: ${count}`).join(' · ') || 'None'}. Accepted does not mean delivered.</p>
    </> : <p>No emergency incident recorded for this service date.</p>}
    {mode !== 'staff' && (!incident || incident.state === 'RESUMED') && <>
      <label className="form-label">Internal reason (not shared with customers)<textarea className="form-control" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button type="button" className="btn btn-secondary" disabled={busy || serviceDate > currentBusinessDate()} onClick={() => action('DECLARE')}>Declare Temporary Emergency</button>
    </>}
    {incident?.state === 'TEMPORARY' && <div className="flex flex-wrap gap-sm">
      {mode === 'provider' && <>
        <button type="button" className="btn btn-secondary" disabled={busy || !!incident.resume_requested_at} onClick={() => action('REQUEST_RESUME')}>Request Manager Approval to Resume</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => action('CONFIRM_UNAVAILABLE')}>Confirm I Cannot Return Today</button>
      </>}
      {mode === 'manager' && <>
        <button type="button" className="btn btn-primary" disabled={busy || !incident.resume_requested_at} onClick={() => action('APPROVE_RESUME')}>Approve Requested Resumption</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => action('CONFIRM_UNAVAILABLE')}>Finalize After Scheduled End</button>
      </>}
    </div>}
    {incident?.active_consultations.map(row => <div key={row.id} className="flex flex-wrap gap-sm">
      <span>Serial #{row.serial}: {row.interrupted_at ? 'Recorded interrupted — unresolved recovery' : row.status}</span>
      {!row.interrupted_at && <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => consultationAction(row, 'INTERRUPTED')}>Record Consultation Interrupted / Unfinished</button>}
      {row.status === 'IN_PROGRESS' && <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => consultationAction(row, 'COMPLETE')}>Record Service Genuinely Completed</button>}
    </div>)}
    {mode === 'manager' && incident && <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => action('RETRY_EMAILS')}>Retry Pending / Failed Emails</button>}
    {mode !== 'provider' && incident?.recoveries.map(row => <RecoveryRow key={row.id} row={row} incident={incident}
      orgId={orgId} providerId={providerId} providers={providers} onSaved={() => { load(); onChanged?.(); }} />)}
  </section>;
}

function RecoveryRow({ row, incident, orgId, providerId, providers, onSaved }) {
  const { first, last } = useBookingWindow();
  const scope = useRequestScope(row.id);
  const [form, setForm] = useState({ direction: '', outcome: 'UNDECIDED', note: '', consent: false, consentNote: '', targetProvider: providerId, targetDate: '', requestId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(null);
  const busyRef = useRef(false);
  const eligible = providers.filter(p => p.is_operationally_active && p.service_charges?.some(charge => String(charge.service_id) === row.service_id));
  const selected = eligible.find(p => p.id === form.targetProvider);
  const save = async action => {
    if (busyRef.current) return;
    const ticket = scope.begin(row.id); if (!ticket) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      if (action === 'CONTACT' && !requestId.current) requestId.current = crypto.randomUUID();
      const payload = recoveryPayload(action, { ...form, requestId: requestId.current });
      await apiClient.post(`${root(orgId, providerId)}${incident.id}/recoveries/${row.id}/`, payload);
      if (!scope.isCurrent(ticket)) return;
      requestId.current = null; setForm(previous => ({ ...previous, consent: false, consentNote: '', note: '' })); onSaved();
    } catch (err) { if (scope.isCurrent(ticket)) setError(err.message && !err.response ? err.message : bookingError(err)); }
    finally { if (scope.isCurrent(ticket)) { busyRef.current = false; setBusy(false); } }
  };
  const edit = (name, value) => { requestId.current = null; setForm(previous => ({ ...previous, [name]: value })); };
  return <details className="card">
    <summary>#{row.original_serial} · {row.customer_name} · {row.resolution_label}</summary>
    <p>{row.original_date} · {row.contact_phone || 'Phone unavailable'} · Originally {row.original_queue_status}</p>
    {row.contact_attempts.map(attempt => <p key={attempt.request_id}>{attempt.at} · {attempt.direction} · {attempt.outcome} · {attempt.note}</p>)}
    {row.replacement_id && <p>Replacement appointment recorded: {row.replacement_id}</p>}
    {row.resolution === 'UNRESOLVED' && <>
      {error && <p role="alert">{error}</p>}
      <label className="form-label">Contact direction<select className="form-control" value={form.direction} onChange={e => edit('direction', e.target.value)}>
        <option value="">Record direction</option><option value="INBOUND">Customer contacted the organization</option>
        {incident.outbound_contact_allowed && <option value="OUTBOUND">Staff called the customer</option>}
      </select></label>
      <label className="form-label">Contact outcome<select className="form-control" value={form.outcome} onChange={e => edit('outcome', e.target.value)}>
        {['REACHED','UNREACHABLE','UNDECIDED','DECLINED_OPTION','ATTENDING'].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label className="form-label">Contact notes<textarea className="form-control" value={form.note} onChange={e => edit('note', e.target.value)} /></label>
      <button type="button" className="btn btn-sm btn-secondary" disabled={busy || !form.direction} onClick={() => save('CONTACT')}>Record Contact Attempt</button>
      <label className="form-label">Agreed replacement professional<select className="form-control" value={form.targetProvider} onChange={e => edit('targetProvider', e.target.value)}>
        <option value="">Choose eligible professional</option>{eligible.map(p => <option key={p.id} value={p.id}>{`${p.user_first_name || ''} ${p.user_last_name || ''}`.trim() || p.title || 'Professional'}</option>)}
      </select></label>
      <label className="form-label">Agreed replacement date<input className="form-control" type="date" min={first} max={last} value={form.targetDate} onChange={e => edit('targetDate', e.target.value)} /></label>
      <p>Service charge: {formatCurrency(providerCharge(selected, row.service_id))}. Final capacity and charge are server-validated.</p>
      <label className="form-label">Customer agreement / cancellation request<textarea className="form-control" value={form.consentNote} onChange={e => edit('consentNote', e.target.value)} /></label>
      <label><input type="checkbox" checked={form.consent} onChange={e => edit('consent', e.target.checked)} /> I have recorded the customer’s explicit agreement to this replacement or their explicit cancellation request.</label>
      <div className="flex flex-wrap gap-sm">
        <button type="button" className="btn btn-primary" disabled={busy || !form.consent || !form.consentNote.trim() || !form.direction || !form.targetDate || !selected} onClick={() => save('RESCHEDULE')}>Book Agreed Replacement Serial</button>
        <button type="button" className="btn btn-secondary" disabled={busy || !form.consent || !form.consentNote.trim() || !form.direction} onClick={() => save('CANCEL')}>Record Customer-Requested Cancellation</button>
      </div>
    </>}
  </details>;
}
