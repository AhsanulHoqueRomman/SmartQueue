import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import appointmentService from '../services/appointmentService';
import getNormalizedCustomerQueueState from '../utils/queueDisplay';
import { formatCurrency } from '../utils/bookingDisplay';

export default function CustomerHomeSection({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    let requesting = false;
    const load = async () => {
      if (requesting || document.hidden) return;
      requesting = true;
      try {
        const data = await appointmentService.getCustomerDashboard();
        if (current) { setItems(Array.isArray(data) ? data : data.results || []); setError(false); }
      } catch { if (current) setError(true); }
      finally { requesting = false; if (current) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener('focus', load);
    return () => { current = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [user.id]);
  const active = items.filter(item => !getNormalizedCustomerQueueState(item).isTerminal).sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)) || (a.serial_number ?? 0) - (b.serial_number ?? 0));
  const booking = active.find(item => ['today', 'future'].includes(item.temporal_classification));
  const live = active.find(item => item.is_live_queue && item.queue_entry);
  const queue = live ? getNormalizedCustomerQueueState(live) : null;
  return <section className="phase-two-section customer-home" aria-labelledby="customer-home-heading">
    <span className="discovery-eyebrow">Your next visit</span><h2 id="customer-home-heading">Welcome back{user.first_name ? `, ${user.first_name}` : ''}</h2>
    {loading ? <p role="status">Loading your bookings…</p> : error ? <p role="status">Your booking status is temporarily unavailable. <Link to="/customer/appointments">Open My Appointments</Link></p> : <div className="customer-home-grid">
      <article className="customer-home-card"><span className="discovery-eyebrow">Upcoming Booking</span>
        {booking ? <><h3>{booking.service_name}</h3><p>{booking.organization_name}</p><p>{booking.provider_name}</p>
          <div className="customer-booking-facts"><strong>{booking.appointment_date}</strong>{booking.serial_number != null && <span>Serial #{booking.serial_number}</span>}{booking.booked_service_charge != null && <span>Service Charge {formatCurrency(booking.booked_service_charge)}</span>}</div>
          <Link className="lp-btn-outline" to={`/customer/appointments/${booking.id}`}>View Appointment</Link></>
          : <><h3>Your next visit starts here.</h3><p>No upcoming booking yet. Explore a service and reserve your serial when you’re ready.</p><Link className="lp-btn-outline" to="/customer/book">Find an Appointment</Link></>}
      </article>
      <article className="customer-home-card"><span className="discovery-eyebrow">Live Queue Status</span>
        {live ? <><h3>{queue.displayStatus}</h3><p>{live.organization_name} · {live.provider_name}</p><div className="customer-queue-facts"><div><span>Now Serving</span><strong>{queue.nowServing ?? (queue.providerHasStarted ? 'Unavailable' : 'Not started')}</strong></div><div><span>Your Serial</span><strong>{queue.serialNumber}</strong></div></div>
          <p>{queue.peopleAhead} people ahead</p><p className="customer-guidance">{queue.guidance}</p><Link className="lp-btn-primary" to={`/customer/queue/${live.queue_entry.id}`}>Open Live Queue</Link></>
          : <><h3>All clear for now.</h3><p>You have no active live queue. Your queue updates will appear here when they’re available.</p></>}
      </article>
    </div>}
  </section>;
}
