import { useEffect, useState } from 'react';
import providerManagementService from '../services/providerManagementService';
import queueService from '../services/queueService';
import { useBookingWindow } from '../hooks/useBookingWindow';
import { formatCurrency } from '../utils/bookingDisplay';

export function StaffBookingForm({ orgId, providerId, onBooked }) {
  const { first, last } = useBookingWindow();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone_number: '', customer_id: '', service_id: '', appointment_date: first, booking_channel: 'PHONE', notes: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    providerManagementService.getProviderServices(orgId, providerId).then(data => { if (active) setServices(Array.isArray(data) ? data : data.results || []); }).catch(() => { if (active) setMessage('Could not load assigned services.'); });
    return () => { active = false; };
  }, [orgId, providerId]);
  const input = (field, value) => setForm(previous => ({ ...previous, [field]: value }));
  return <details className="card">
    <summary>Phone / Front-desk booking</summary>
    <form className="flex flex-col gap-md" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try {
        const payload = { ...form };
        if (payload.customer_id) payload.customer_id = Number(payload.customer_id); else delete payload.customer_id;
        const entry = await queueService.registerWalkIn(orgId, providerId, payload);
        setMessage(`Booked serial #${entry.serial_number} for ${entry.queue_date}.`);
        onBooked();
      } catch (error) { setMessage(error.response?.data?.error?.message || error.response?.data?.detail || 'Booking could not be completed.'); }
      finally { setBusy(false); }
    }}>
      <p className="text-sm text-muted">All booking channels share one serial sequence. Contact details apply only to this appointment. For an existing account, confirm its customer ID; phone alone does not establish identity.</p>
      <label>Booking channel<select className="form-control" value={form.booking_channel} onChange={e => input('booking_channel', e.target.value)}><option value="PHONE">Phone</option><option value="FRONT_DESK">Front desk (today’s arrival is checked in)</option></select></label>
      <label>Existing customer ID (optional)<input className="form-control" type="number" min="1" value={form.customer_id} onChange={e => input('customer_id', e.target.value)} /></label>
      <div className="grid-responsive grid-cols-2">
        <label>First name<input className="form-control" required value={form.first_name} onChange={e => input('first_name', e.target.value)} /></label>
        <label>Last name<input className="form-control" required value={form.last_name} onChange={e => input('last_name', e.target.value)} /></label>
      </div>
      <label>Phone number<input className="form-control" type="tel" required value={form.phone_number} onChange={e => input('phone_number', e.target.value)} /></label>
      <label>Service<select className="form-control" required value={form.service_id} onChange={e => input('service_id', e.target.value)}><option value="">Choose assigned service</option>{services.map(service => <option key={service.id} value={service.service_id}>{service.service_name} · {formatCurrency(service.effective_customer_charge)}</option>)}</select></label>
      <label>Booking date<input className="form-control" type="date" required min={first} max={last} value={form.appointment_date} onChange={e => input('appointment_date', e.target.value)} /></label>
      <label>Notes<textarea className="form-control" value={form.notes} onChange={e => input('notes', e.target.value)} /></label>
      {message && <p role="status">{message}</p>}
      <button className="btn btn-primary" disabled={busy || !services.length}>{busy ? 'Booking…' : 'Confirm Serial Booking'}</button>
    </form>
  </details>;
}
