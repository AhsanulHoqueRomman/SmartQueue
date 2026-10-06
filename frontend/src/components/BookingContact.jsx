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

export function BookingSummary({ organization, service, provider, date, contact, charge, notes, appointment }) {
  const rows = [
    ['Organization', organization?.name], ['Service', service?.name || appointment?.service_name],
    ['Professional', provider ? deriveProfessionalDisplay(provider).displayName : appointment?.provider_name],
    ['Appointment Date', appointment?.appointment_date || date],
    ['Customer Name', appointment ? appointment.contact_name ?? appointment.customer_name : contact?.name],
    ['Phone Number', appointment ? appointment.contact_phone : contact?.phone],
    ['Service Charge', formatCurrency(appointment ? appointment.booked_service_charge : charge)],
    ['Additional Notes', appointment ? appointment.notes : notes],
  ];
  return <dl className="booking-contact-summary">{rows.filter(([, value]) => value).map(([label, value]) =>
    <div key={label} style={{ marginBottom: '0.5rem', overflowWrap: 'anywhere' }}><dt style={{ fontWeight: 600 }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>
  )}</dl>;
}
