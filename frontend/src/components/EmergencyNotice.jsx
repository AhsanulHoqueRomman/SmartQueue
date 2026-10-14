import { Link } from 'react-router-dom';
import { emergencyNotice } from '../utils/emergencyDisplay.js';

export function EmergencyNotice({ appointment }) {
  const emergency = emergencyNotice(appointment);
  if (!emergency) return null;
  return <section className="banner banner-warning" role="status">
    <strong>{emergency.resolution === 'UNRESOLVED' ? emergency.status_label : 'Emergency recovery update'}</strong>
    <p>{emergency.message}</p>
    <details><summary>View interruption details</summary>
      <p>Original service date: {emergency.original_date}. Original serial: #{emergency.original_serial ?? 'unavailable'}.</p>
      {emergency.resolution === 'UNRESOLVED' && <p>Your booking and serial remain preserved. {emergency.state === 'TEMPORARY'
        ? 'Follow queue updates; the organization has not finalized today’s service. Contact the organization if you need individual assistance.'
        : emergency.state === 'UNAVAILABLE' ? 'Expect staff-assisted recovery. No replacement or cancellation occurs without your agreement.'
          : 'Staff will confirm whether you can still attend. Previous estimates are not guaranteed; follow updated live queue guidance.'}</p>}
      {emergency.contact_phone && <p>Organization contact: <a href={`tel:${emergency.contact_phone}`}>{emergency.contact_phone}</a></p>}
      {emergency.replacement_id && <Link to={`/customer/appointments/${emergency.replacement_id}`}>View replacement appointment</Link>}
      {appointment.id && <p><Link to={`/customer/appointments/${appointment.id}`}>View original appointment</Link></p>}
    </details>
  </section>;
}
