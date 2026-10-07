import { useState, useEffect } from 'react';
import './HeroProductStory.css';

const QUEUE_PATHS = [
  'M30 168V78Q30 24 88 24H486Q578 24 578 118V480Q578 578 498 578H144Q22 578 22 460V338',
  'M8 282Q8 196 76 196H452Q548 196 548 280V432Q548 524 454 524H74',
];

function OrganizationImage() {
  return <svg className="hero-org-image" viewBox="0 0 280 140" role="img" aria-label="Illustration of fictional Dhaka Care Clinic in Dhanmondi">
    <rect width="280" height="140" fill="var(--lp-bg-subtle)" />
    <g fill="var(--lp-border)" opacity=".65"><path d="M0 50h35v70H0zM236 28h44v92h-44zM25 35h28v85H25z" /></g>
    <path d="M53 122V34h172v88" fill="var(--lp-surface)" stroke="var(--lp-border-med)" strokeWidth="2" />
    <path d="M46 34h187v9H46z" fill="var(--lp-sage)" />
    <rect x="70" y="50" width="138" height="24" rx="3" fill="var(--lp-sage-bg)" />
    <text x="139" y="66" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--lp-text)">ঢাকা কেয়ার ক্লিনিক</text>
    <g fill="var(--lp-bg-deeper)" stroke="var(--lp-border-med)"><rect x="67" y="83" width="31" height="27" rx="2" /><rect x="182" y="83" width="31" height="27" rx="2" /><path d="M121 122V84h38v38" /></g>
    <path d="M140 84v38M67 97h31M182 97h31" stroke="var(--lp-border-med)" />
    <path d="M107 120h67v6h-67zM99 126h83v5H99z" fill="var(--lp-border-med)" />
    <path d="M0 134h280" stroke="var(--lp-border-med)" strokeWidth="3" />
    <g stroke="var(--lp-sage)" strokeWidth="3"><path d="M31 126V91M247 126V82" /></g>
    <g fill="var(--lp-sage)"><circle cx="31" cy="83" r="15" /><circle cx="247" cy="73" r="17" /></g>
    <g fill="var(--lp-surface)" opacity=".5"><circle cx="27" cy="79" r="5" /><circle cx="242" cy="68" r="6" /></g>
  </svg>;
}

export default function HeroProductStory({ entered, visible }) {
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  return <div className={`hero-product-story ${entered ? 'has-entered' : ''} ${!documentVisible || !visible ? 'is-motion-paused' : ''}`} aria-label="Illustrative SmartQueue product walkthrough">
    <div className="hero-story-canvas">
      <svg className="hero-queue-path" viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          {QUEUE_PATHS.map(path => <path key={path} className="hero-network-line" d={path} strokeDasharray="3 8" />)}
          <path d="M420 70Q496 70 496 140M22 338H54M486 24V60" />
        </g>
        <g className="hero-network-nodes" fill="currentColor">
          <circle cx="88" cy="24" r="3" /><circle cx="486" cy="24" r="4" /><circle cx="578" cy="118" r="3" /><circle cx="498" cy="578" r="4" /><circle cx="22" cy="460" r="4" /><circle cx="454" cy="524" r="3" />
        </g>
        <g className="hero-network-active" fill="currentColor"><circle cx="496" cy="140" r="3" /><circle cx="22" cy="338" r="3" /><circle cx="144" cy="578" r="3" /></g>
        <g fill="currentColor" className="hero-network-tracers">
          {[QUEUE_PATHS[0], QUEUE_PATHS[1], QUEUE_PATHS[0]].map((path, index) => <circle key={index} className="hero-network-tracer" r="3" style={{ offsetPath: `path('${path}')` }} />)}
        </g>
      </svg>
      <div className="hero-phone">
        <div className="hero-phone-speaker" aria-hidden="true" />
        <div className="hero-phone-brand"><span className="hero-mini-mark">S</span><strong>SmartQueue</strong><span>9:41</span></div>
        <div className="hero-phone-top"><small>YOUR NEXT VISIT, SIMPLIFIED</small><h2>Discover your next visit.</h2></div>
        <div className="hero-phone-screen">
          <div className="hero-demo-search">⌕ <span>Organizations in Dhaka</span></div>
          <div className="hero-demo-org"><div className="hero-org-illustration"><OrganizationImage /></div><small>HEALTHCARE · DHANMONDI</small><h3>Dhaka Care Clinic</h3><p>★ 4.6 <span>· 14 reviews</span></p><div className="hero-org-stats"><span><strong>7</strong> professionals</span><span><strong>4</strong> services</span></div><span className="hero-demo-action">Book Appointment <span aria-hidden="true">↗</span></span></div>
          <p className="hero-illustrative-note">Illustrative visit · Live estimates, not fixed start times.</p>
        </div>
        <div className="hero-phone-home" aria-hidden="true" />
      </div>
      <div className="hero-support-card hero-support-serial"><div className="hero-support-heading"><span className="hero-support-icon" aria-hidden="true">✓</span><small>SERIAL ASSIGNED</small></div><div className="hero-assigned-number"><strong>#24</strong><span>You're in the queue</span></div><div className="hero-support-context"><span>18 October · Dhaka Care Clinic</span><strong>11:30 AM – 12:00 PM</strong><small>Estimated service window</small></div></div>
      <div className="hero-support-card hero-support-live"><div className="hero-support-heading"><span className="hero-support-icon" aria-hidden="true">≋</span><small>LIVE QUEUE</small><span className="hero-queue-ready">Get Ready</span></div><div className="hero-support-serials"><div><small>Now Serving</small><strong>21</strong></div><div><small>Your Serial</small><strong>24</strong></div></div><p className="hero-support-ahead"><strong>2</strong> people ahead <span>Live estimate updates</span></p></div>
    </div>
  </div>;
}
