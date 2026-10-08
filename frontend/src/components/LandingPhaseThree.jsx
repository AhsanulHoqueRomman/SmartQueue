import { useEffect, useState } from 'react';
import useScrollPresence from '../hooks/useScrollPresence';
import { Link } from 'react-router-dom';
import '../styles/LandingPhaseThree.css';
import '../styles/LandingPolish.css';

const icons = {
  organization: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 9h1m6 0h1M8 12h1m6 0h1" /></>,
  service: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1 1 2-3m2 2h3m-8 6 1 1 2-3m2 2h3" /></>,
  professional: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a8 8 0 0 1 16 0v3M9 17l3 3 3-3" /></>,
  serial: <><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6ZM8 9v6m5-6v6m3-6v6" /></>,
  arrival: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2m-8 0 2 2 3-3" /></>,
  queue: <><path d="M3 5h18M3 12h12M3 19h8m5-3 3 3 4-5" /><circle cx="6" cy="5" r="2" /><circle cx="10" cy="12" r="2" /></>,
};
function ProductIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function useSectionMotion(threshold = .08, replay = true) {
  const [ref, revealed, visible, observed] = useScrollPresence(threshold, replay);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return [ref, `sq-phase3 ${observed ? 'is-observed' : ''} ${revealed ? 'is-revealed' : ''}`, visible && pageVisible && revealed];
}

const steps = [
  ['organization', 'Find an Organization', 'Discover verified clinics, salons, legal firms, service centers and more.'],
  ['service', 'Choose a Service', 'Find the service you need and see the professionals who offer it.'],
  ['professional', 'Select a Professional', 'Compare relevant experience, service charges and working availability.'],
  ['serial', 'Reserve Your Serial', 'Choose your date and confirm. QueueTurn assigns your queue serial.'],
  ['arrival', 'Check In / Get Ready', 'Follow arrival and readiness guidance, and check in when appropriate.'],
  ['queue', 'Track the Live Queue', 'Follow Now Serving, people ahead and readiness updates until your service.'],
];

export function HowSmartQueueWorks() {
  const [journeyRef, motionClass] = useSectionMotion(.25);
  return <section id="how-it-works" className={`${motionClass} sq-journey-section`} aria-labelledby="sq-journey-heading">
    <div className="sq-phase3-inner">
      <header className="sq-section-heading"><span className="sq-eyebrow">From discovery to your turn</span><h2 id="sq-journey-heading">How QueueTurn Works</h2><p>Six simple steps. A queue serial, with live guidance along the way.</p></header>
      <div ref={journeyRef} className="sq-journey-wrap">
        <svg className="sq-journey-path" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">{['M165 145H500', 'M500 145H835', 'M835 145H920Q975 145 975 220V245Q975 300 920 300H80Q25 300 25 355V390Q25 445 80 445H165', 'M165 445H500', 'M500 445H835'].map((path, index) => <path key={path} d={path} pathLength="1" style={{ '--path-delay': `${.12 + index * .26}s` }} />)}</svg>
        <ol className="sq-journey-grid">{steps.map(([icon, title, description], index) => <li key={title} className="sq-journey-card sq-entry" style={{ '--entry-delay': `${index * .26}s` }}>
          <div className="sq-journey-card-top"><span className="sq-icon-tile"><ProductIcon name={icon} /></span><span className="sq-step-number">{String(index + 1).padStart(2, '0')}</span></div>
          <h3>{title}</h3><p>{description}</p>
        </li>)}</ol>
      </div>
    </div>
  </section>;
}

const benefits = [
  ['arrival', 'Zero Waiting-Room Chaos', 'Reserve a serial and plan your arrival instead of blindly waiting for long periods.', 'A clearer plan for your visit', ['Reserve', 'Plan arrival', 'Check in']],
  ['queue', 'Live Queue Visibility', 'Follow Now Serving, your serial, people ahead and readiness information as the queue progresses.', 'Stay informed as your turn approaches', ['Now Serving', 'Your Serial', 'Get Ready']],
  ['organization', 'One Place for Multiple Services', 'Discover organizations and professionals across healthcare, legal, beauty, repair, consulting and other services.', 'Everyday needs, one place to explore', ['Care', 'Advice', 'Repair']],
  ['professional', 'Transparent Service Choice', 'Compare professionals, customer-facing charges, organization information and availability before booking.', 'Choose with useful information', ['Professional', 'Service Charge', 'Availability']],
];
export function WhySmartQueue() {
  const [clusterRef, motionClass] = useSectionMotion(.25);
  return <section id="why-smartqueue" className={`${motionClass} sq-benefits-section `} aria-labelledby="sq-benefits-heading">
    <div className="sq-phase3-inner">
    <header className="sq-section-heading sq-benefits-heading"><span className="sq-eyebrow">More clarity. Less guesswork.</span><h2 id="sq-benefits-heading">Why Patients &amp; Clients Choose QueueTurn</h2><p>Useful information before your visit, and better visibility while you wait.</p></header>
    <div ref={clusterRef} className="sq-benefits-cluster">
    <div className="sq-benefits-grid">{benefits.map(([icon, title, description, detail, chips], index) => <article className={`sq-benefit-card sq-entry sq-semantic-${['healthcare', 'diagnostics', 'legal', 'consulting'][index]}`} tabIndex={0} aria-labelledby={`sq-benefit-title-${index}`} key={title} style={{ '--entry-delay': `${.12 + index * .16}s` }}>
      <span className="sq-icon-tile"><ProductIcon name={icon} /></span><h3 id={`sq-benefit-title-${index}`}>{title}</h3><p>{description}</p>
      <div className="sq-benefit-detail" aria-hidden="true"><span>{detail}</span><div>{chips.map(chip => <span key={chip}>{chip}</span>)}</div></div>
    </article>)}</div>
  </div></div></section>;
}

function OperationsPreview({ active }) {
  return <figure className={`sq-operations-preview ${active ? 'is-active' : ''}`} aria-label="Illustrative QueueTurn organization operations dashboard">
    <div className="sq-operations-header"><span className="sq-operations-brand"><ProductIcon name="organization" />QueueTurn</span><span>Organization workspace</span></div>
    <div className="sq-operations-body"><span className="sq-eyebrow">Today’s operations</span><h3>Dhaka Care Clinic</h3>
      <dl className="sq-operation-stats"><div><dt>Waiting</dt><dd>8</dd></div><div><dt>In Service</dt><dd>2</dd></div><div><dt>Completed</dt><dd>31</dd></div></dl>
      <div className="sq-activity-heading"><h4>Queue activity</h4><span>Today</span></div>
      <svg className="sq-activity-chart" viewBox="0 0 400 120" role="img" aria-label="Illustrative queue activity rising and easing through the day">
        <path className="sq-chart-grid" d="M8 24H392M8 60H392M8 96H392" />
        <path className="sq-chart-line" d="M8 94H48Q64 94 70 74T96 54H145Q160 54 170 32T198 20H235Q250 20 258 44T282 62H325Q340 62 350 82T392 94" />
        <circle className="sq-chart-tracer" r="4" aria-hidden="true" />
      </svg><div className="sq-chart-axis" aria-hidden="true"><span>Morning</span><span>Afternoon</span><span>Evening</span></div>
      <div className="sq-current-queue"><h4>Current Queue</h4><ul><li><strong>#21</strong><span>General Consultation</span><span className="sq-preview-state">In Service</span></li><li><strong>#22</strong><span>Dental Consultation</span><span>Waiting</span></li><li><strong>#23</strong><span>General Consultation</span><span>Waiting</span></li></ul></div>
      <div className="sq-provider-activity"><ProductIcon name="professional" /><span>Dr. Samira Rahman<strong>General Consultation · Serving #21</strong></span></div>
    </div><figcaption>An example workspace. Your organization’s activity appears here.</figcaption>
  </figure>;
}

export function ForOrganizations() {
  const [sectionRef, motionClass, active] = useSectionMotion(.08, false);
  return <section ref={sectionRef} id="for-organizations" className={`${motionClass} sq-organizations-section`} aria-labelledby="sq-organizations-heading"><div className="sq-phase3-inner sq-organizations-split">
    <div className="sq-organization-copy sq-entry"><span className="sq-eyebrow">For organizations</span><h2 id="sq-organizations-heading">Built for organizations that serve people in queues.</h2><p>Manage appointments, serials, your team and customer queue visibility from one system. Built for clinics, salons, legal firms, consultants, service centers and counters.</p>
      <ul className="sq-capabilities">{[['professional', 'Provider & Staff Management'], ['serial', 'Appointment & Serial Management'], ['queue', 'Live Queue Operations'], ['service', 'Services, Schedules & Customer Charges']].map(([icon, title]) => <li key={title}><ProductIcon name={icon} /><span>{title}</span></li>)}</ul>
      <div className="sq-business-actions"><Link className="lp-btn-primary" to="/register/manager">Register Your Organization <span aria-hidden="true">→</span></Link></div>
    </div><div className="sq-entry" style={{ '--entry-delay': '.15s' }}><OperationsPreview active={active} /></div>
  </div></section>;
}
