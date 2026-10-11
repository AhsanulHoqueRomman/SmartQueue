import { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { ScheduleEditor } from './ScheduleEditor';
import { initialSchedule, weekdayForDate } from '../utils/scheduleDraft';
import { bookingWindow } from '../utils/bookingWindow';

const root = (org, provider) => `/organizations/${org}/providers/${provider}/schedule-requests/`;
const message = error => error.response?.data?.error?.message || error.response?.data?.detail || 'Could not save the schedule request.';

export function SchedulePreview({ days }) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return <ul>{days.map(day => <li key={day.day_of_week}>{names[day.day_of_week]} · {day.is_working_day ? `${day.start_time.slice(0, 5)}–${day.end_time.slice(0, 5)}` : 'Off'}{(day.breaks || []).map((brk, index) => <span key={index}> · Break {brk.start_time.slice(0, 5)}–{brk.end_time.slice(0, 5)}</span>)}</li>)}</ul>;
}

export function ScheduleRequestsPanel({ orgId, providerId, manager = false }) {
  const prepareRevision = useRef(0);
  const [approved, setApproved] = useState([]);
  const [requests, setRequests] = useState([]);
  const [kind, setKind] = useState('SPECIFIC_DATE');
  const [date, setDate] = useState('');
  const [days, setDays] = useState(initialSchedule);
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rejection, setRejection] = useState({});
  const load = async () => setRequests((await apiClient.get(root(orgId, providerId))).data);
  useEffect(() => {
    let active = true;
    apiClient.get(root(orgId, providerId)).then(response => { if (active) setRequests(response.data); }).catch(error => { if (active) setFeedback(message(error)); });
    apiClient.get(`/organizations/${orgId}/providers/${providerId}/schedules/`).then(response => { if (active) setApproved(response.data); }).catch(error => { if (active) setFeedback(message(error)); });
    return () => { active = false; prepareRevision.current += 1; };
  }, [orgId, providerId]);
  const prepare = async value => {
    const revision = ++prepareRevision.current;
    setDate(value); setDays([]); setFeedback(''); setPreparing(true);
    try {
      const response = await apiClient.get(`/organizations/${orgId}/providers/${providerId}/schedules/`, { params: { date: value } });
      if (revision === prepareRevision.current) setDays(response.data.map(day => ({ day_of_week: day.day_of_week, start_time: day.start_time, end_time: day.end_time, is_working_day: day.is_working_day, breaks: day.breaks || [] })));
    } catch (error) { if (revision === prepareRevision.current) setFeedback(message(error)); }
    finally { if (revision === prepareRevision.current) setPreparing(false); }
  };
  const selectedDays = kind === 'SPECIFIC_DATE' && date ? days.filter(day => day.day_of_week === weekdayForDate(date)) : days;
  const earliest = () => {
    const now = bookingWindow();
    return new Date(new Date(`${now.first}T00:00:00Z`).getTime() + (kind === 'SPECIFIC_DATE' ? 4 : 10) * 86400000).toISOString().slice(0, 10);
  };
  return <section className="card flex flex-col gap-md">
    <h2>{manager ? 'Schedule change review' : 'Schedule change requests'}</h2>
    {manager && <div><h3>Current approved / initial schedule</h3><SchedulePreview days={approved} /></div>}
    {!manager && <>
      <p className="text-sm text-muted">Initial schedules require organization approval. Approved schedules cannot be edited directly. Specific-date changes need 4 calendar days notice; permanent changes need 10. A reason and manager approval are mandatory. Supporting documents are optional. Existing confirmed bookings are protected; conflicting proposals cannot be approved. Future changes take effect on their approved date.</p>
      <form className="flex flex-col gap-md" onSubmit={async e => {
        e.preventDefault(); if (busy || preparing) return; setBusy(true); setFeedback('');
        try {
          const form = new FormData(); form.append('kind', kind); form.append('effective_date', date); form.append('reason', reason);
          form.append('proposed_schedule', JSON.stringify(selectedDays)); if (attachment) form.append('attachment', attachment);
          await apiClient.post(root(orgId, providerId), form);
          setFeedback('Request submitted for manager review. The approved schedule is unchanged.'); await load();
        } catch (error) { setFeedback(message(error)); }
        finally { setBusy(false); }
      }}>
        <label>Change type<select className="form-control" value={kind} onChange={e => setKind(e.target.value)}><option value="SPECIFIC_DATE">Specific date</option><option value="PERMANENT">Permanent</option></select></label>
        <label>Affected / effective date<input className="form-control" required type="date" min={earliest()} value={date} onChange={e => prepare(e.target.value)} /></label>
        {date && <ScheduleEditor days={selectedDays} onChange={changed => setDays(previous => previous.map(day => changed.find(next => next.day_of_week === day.day_of_week) || day))} />}
        <label>Reason<textarea className="form-control" required value={reason} onChange={e => setReason(e.target.value)} /></label>
        <label>Supporting document (optional, PDF/image, up to 3 MB)<input className="form-control" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setAttachment(e.target.files[0] || null)} /></label>
        <button className="btn btn-primary" disabled={busy || preparing || !date || !selectedDays.length}>{busy ? 'Submitting…' : 'Submit for Manager Approval'}</button>
      </form>
    </>}
    {feedback && <p role="status">{feedback}</p>}
    {!requests.length && <p className="text-muted">No schedule requests.</p>}
    {requests.map(request => <article className="card" key={request.id}>
      <h3>{request.kind === 'PERMANENT' ? 'Permanent' : 'Specific-date'} · {request.effective_date} · {request.status}</h3>
      <p>{request.reason}</p>
      <div className="grid-responsive grid-cols-2"><div><strong>Current approved schedule at requested date</strong><SchedulePreview days={request.current_schedule} /></div><div><strong>Proposed schedule</strong><SchedulePreview days={request.proposed_schedule} /></div></div>
      {request.decision_reason && <p>Decision: {request.decision_reason}</p>}
      {request.has_attachment && <button className="btn btn-sm btn-outline" onClick={async () => {
        try { const response = await apiClient.get(`${root(orgId, providerId)}${request.id}/attachment/`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = 'supporting-document'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        catch (error) { setFeedback(message(error)); }
      }}>Download supporting document</button>}
      {!!request.affected_bookings?.length && <p className="banner banner-warning">Conflicts: {request.affected_bookings.map(appt => `${appt.date} · serial #${appt.serial_number}`).join(', ')}. Approval is blocked.</p>}
      {manager && request.status === 'PENDING' && <div className="flex flex-col gap-sm">
        <label>Rejection explanation<textarea className="form-control" value={rejection[request.id] || ''} onChange={e => setRejection(previous => ({ ...previous, [request.id]: e.target.value }))} /></label>
        <div className="flex gap-sm">{['APPROVED', 'REJECTED'].map(decision => <button key={decision} className={`btn ${decision === 'APPROVED' ? 'btn-primary' : 'btn-outline'}`} disabled={busy || (decision === 'APPROVED' && !!request.affected_bookings?.length) || (decision === 'REJECTED' && !rejection[request.id]?.trim())} onClick={async () => {
          setBusy(true); setFeedback('');
          try { await apiClient.post(`${root(orgId, providerId)}${request.id}/review/`, { decision, reason: rejection[request.id] || '' }); setFeedback('Decision recorded.'); await load(); }
          catch (error) { setFeedback(message(error)); await load(); }
          finally { setBusy(false); }
        }}>{decision === 'APPROVED' ? 'Approve' : 'Reject'}</button>)}</div>
      </div>}
    </article>)}
  </section>;
}
