import { formatCurrency } from '../utils/bookingDisplay';
import { deriveProfessionalDisplay } from '../utils/providerDisplay';

export function BookingContactFields({ contact }) {
  return <div className="booking-contact-fields">
    <label className="form-label">Customer Name
      <input className="form-control" autoComplete="name" value={contact.name} onChange={e => contact.setName(e.target.value)} maxLength={300} required />
    </label>
    <label className="form-label">Phone Number
      <input className="form-control" type="tel" autoComplete="tel" value={contact.phone} onChange={e => contact.setPhone(e.target.value)} maxLength={30} placeholder="01712345678 or +8801712345678" required />
    </label>
    <p className="text-muted">These contact details apply only to this appointment.</p>
  </div>;
}

export function BookingSummary({ organization, service, provider, date, contact, charge, notes, appointment, confirmation = false }) {
  const appointmentDate = appointment?.appointment_date || date;
  const displayDate = confirmation && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate || '')
    ? new Date(`${appointmentDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : appointmentDate;
  const rows = [
    ['Organization', organization?.name], ['Service', service?.name || appointment?.service_name],
    ['Professional', provider ? deriveProfessionalDisplay(provider).displayName : appointment?.provider_name],
    ['Appointment Date', displayDate],
    ['Customer Name', appointment ? appointment.contact_name ?? appointment.customer_name : contact?.name],
    ['Phone Number', appointment ? appointment.contact_phone : contact?.phone],
    ['Service Charge', formatCurrency(appointment ? appointment.booked_service_charge : charge)],
    ['Additional Notes', appointment ? appointment.notes : notes],
  ];
  const orderedRows = confirmation ? [rows[1], rows[2], rows[3], rows[6], rows[4], rows[5], rows[0], rows[7]] : rows;
  return <dl className="booking-contact-summary">{orderedRows.filter(([, value]) => value).map(([label, value]) =>
    <div key={label} className={['Organization', 'Additional Notes'].includes(label) ? 'booking-summary-wide' : undefined} style={{ marginBottom: '0.5rem', overflowWrap: 'anywhere' }}><dt style={{ fontWeight: 600 }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>
  )}</dl>;
}
