import { useEffect, useState } from 'react';
import providerManagementService from '../services/providerManagementService';
import { useRequestScope } from '../hooks/useRequestScope';
import { bookingError } from '../utils/bookingDisplay';

export function LeaveRequestsPanel({ orgId, providerId }) {
  const scopeKey = `${orgId}:${providerId}`;
  const scope = useRequestScope(scopeKey);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    const ticket = scope.begin(scopeKey);
    if (!ticket) return;
    providerManagementService.getLeaves(orgId, providerId)
      .then(data => { if (scope.isCurrent(ticket)) setRows(Array.isArray(data) ? data : data.results || []); })
      .catch(err => { if (scope.isCurrent(ticket)) setError(bookingError(err)); });
  }, [orgId, providerId, scope, scopeKey]);
  const review = async (leave, decision) => {
    if (busy) return;
    const ticket = scope.begin(scopeKey);
    if (!ticket) return;
    setBusy(leave.id); setError('');
    try {
      const updated = await providerManagementService.reviewLeave(orgId, providerId, leave.id, decision, reason);
      if (scope.isCurrent(ticket)) { setRows(previous => previous.map(row => row.id === updated.id ? updated : row)); setReason(''); }
    } catch (err) { if (scope.isCurrent(ticket)) setError(bookingError(err)); }
    finally { if (scope.isCurrent(ticket)) setBusy(null); }
  };
  const format = value => new Date(value).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' });
  return <section className="card">
    <h3>Planned Leave Review</h3>
    <p className="text-sm">Asia/Dhaka times. Coordinate affected bookings before approval; approval does not cancel or move appointments.</p>
    {error && <p role="alert">{error}</p>}
    <label className="form-label">Decision explanation (required for rejection)
      <input className="form-control" value={reason} onChange={event => setReason(event.target.value)} />
    </label>
    {!rows.length && <p>No leave requests.</p>}
    {rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-md">
      <span>{format(row.start_datetime)} – {format(row.end_datetime)} · {row.status || 'Legacy effective leave'} · {row.reason}</span>
      {row.status === 'PENDING' && <>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => review(row, 'APPROVED')}>Approve Leave</button>
        <button type="button" className="btn btn-sm btn-secondary" disabled={busy !== null || !reason.trim()} onClick={() => review(row, 'REJECTED')}>Reject Leave</button>
      </>}
    </div>)}
  </section>;
}
