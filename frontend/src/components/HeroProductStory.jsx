import { useState, useEffect, useRef } from 'react';
import './HeroProductStory.css';

const STAGES = ['Discover', 'Serial Assigned', 'Live Queue'];

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

export default function HeroProductStory() {
  const root = useRef(null);
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReducedMotion(preference.matches);
    const onVisibility = () => setDocumentVisible(!document.hidden);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
    observer.observe(root.current);
    preference.addEventListener('change', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); preference.removeEventListener('change', onPreference); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  useEffect(() => {
    if (paused || reducedMotion || !visible || !documentVisible) return;
    const timer = window.setInterval(() => setStage(old => (old + 1) % STAGES.length), 4800);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, visible, documentVisible]);

  return <div className={`hero-product-story ${reducedMotion ? 'is-reduced-motion' : ''}`} ref={root} aria-label="Illustrative SmartQueue product walkthrough">
    <div className="hero-story-canvas" data-stage={stage}>
      <svg className="hero-queue-path" viewBox="0 0 560 600" aria-hidden="true"><rect x="85" y="56" width="420" height="470" rx="80" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 9" /></svg>
      <div className={`hero-phone ${stage === 0 ? 'is-highlighted' : ''}`}>
        <div className="hero-phone-speaker" aria-hidden="true" />
        <div className="hero-phone-brand"><span className="hero-mini-mark">S</span><strong>SmartQueue</strong><span>9:41</span></div>
        <div className="hero-phone-top"><small>YOUR NEXT VISIT, SIMPLIFIED</small><h2>Discover your next visit.</h2></div>
        <div className="hero-phone-screen">
          <div className="hero-demo-search">⌕ <span>Organizations in Dhaka</span></div>
          <div className="hero-demo-org"><div className="hero-org-illustration"><OrganizationImage /></div><small>HEALTHCARE · DHANMONDI</small><h3>Dhaka Care Clinic</h3><p>★ 4.6 <span>· 14 reviews</span></p><div className="hero-org-stats"><span><strong>7</strong> professionals</span><span><strong>4</strong> services</span></div><span className="hero-demo-action">Book Appointment <span aria-hidden="true">↗</span></span></div>
          <div className="hero-device-progress" key={stage}><span aria-hidden="true">{stage === 0 ? '⌕' : stage === 1 ? '✓' : '≋'}</span><div><strong>{stage === 0 ? 'Choose a service & professional' : stage === 1 ? 'Your serial is reserved' : 'Know when to arrive'}</strong><small>{stage === 0 ? 'Find the right fit for your visit.' : stage === 1 ? 'Serial #24 · 18 October' : 'Get Ready · Follow your live estimate.'}</small></div></div>
        </div>
        <div className="hero-phone-home" aria-hidden="true" />
      </div>
      <div className={`hero-support-card hero-support-serial ${stage === 1 ? 'is-highlighted' : ''}`}><div className="hero-support-heading"><span className="hero-support-icon" aria-hidden="true">✓</span><small>SERIAL ASSIGNED</small></div><div className="hero-assigned-number"><strong>#24</strong><span>You're in the queue</span></div><div className="hero-support-context"><span>18 October · Dhaka Care Clinic</span><strong>11:30 AM – 12:00 PM</strong><small>Estimated service window</small></div></div>
      <div className={`hero-support-card hero-support-live ${stage === 2 ? 'is-highlighted' : ''}`}><div className="hero-support-heading"><span className="hero-support-icon" aria-hidden="true">≋</span><small>LIVE QUEUE</small><span className="hero-queue-ready">Get Ready</span></div><div className="hero-support-serials"><div><small>Now Serving</small><strong>21</strong></div><div><small>Your Serial</small><strong>24</strong></div></div><p className="hero-support-ahead"><strong>2</strong> people ahead <span>Live estimate updates</span></p></div>
    </div>
    <div className="hero-story-stages" role="group" aria-label="Product preview stages">{STAGES.map((label, index) => <button key={label} type="button" aria-pressed={stage === index} onClick={() => { setStage(index); setPaused(true); }}><span>{index + 1}</span>{label}</button>)}
      {!reducedMotion && <button type="button" className="hero-story-motion" onClick={() => setPaused(old => !old)} aria-label={paused ? 'Play product preview' : 'Pause product preview'} title={paused ? 'Play animation' : 'Pause animation'}><svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">{paused ? <path d="m6 3 11 7-11 7z" /> : <path d="M5 3h3v14H5zm7 0h3v14h-3z" />}</svg></button>}
    </div>
    <p className="hero-story-disclaimer">Illustrative visit. Service windows are estimates, not fixed start times.</p>
  </div>;
}
