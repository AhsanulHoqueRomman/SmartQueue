import { useState, useEffect, useRef } from 'react';
import './HeroProductStory.css';

const STAGES = ['Discover', 'Serial Assigned', 'Live Queue'];

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
    <div className="hero-story-heading"><span>PRODUCT PREVIEW · DEMO DATA</span>
      {!reducedMotion && <button type="button" onClick={() => setPaused(old => !old)} aria-label={paused ? 'Play product preview' : 'Pause product preview'}>{paused ? 'Play' : 'Pause'}</button>}
    </div>
    <div className="hero-story-canvas" data-stage={stage}>
      <svg className="hero-queue-path" viewBox="0 0 520 540" aria-hidden="true"><path d="M50 105 H445 V425 H70" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 9" /><circle cx="50" cy="105" r="5" fill="currentColor" /><circle cx="70" cy="425" r="5" fill="currentColor" /></svg>
      <div className="hero-phone">
        <div className="hero-phone-speaker" aria-hidden="true" />
        <div className="hero-phone-brand"><span className="hero-mini-mark">S</span><strong>SmartQueue</strong><span>9:41</span></div>
        <div className="hero-phone-top"><small>YOUR NEXT VISIT, SIMPLIFIED</small><h2>{stage === 0 ? 'Find your care.' : stage === 1 ? 'Your serial is reserved.' : 'Know when to arrive.'}</h2></div>
        <div className="hero-phone-screen" key={stage}>
          {stage === 0 ? <>
            <div className="hero-demo-search">⌕ <span>Organizations in Dhaka</span></div>
            <div className="hero-demo-org"><div className="hero-org-illustration" aria-hidden="true"><svg viewBox="0 0 160 72" fill="none" stroke="currentColor" strokeWidth="2"><path d="M35 63V20h90v43M26 63h108M57 63V48h46v15M52 30h12m32 0h12M52 40h12m32 0h12M75 24h10m-5-5v10" /><path d="M35 20 80 5l45 15" /></svg></div><small>HEALTHCARE · DHANMONDI</small><h3>Dhaka Care Clinic</h3><p>★ 4.6 <span>· Fictional demo clinic</span></p><div className="hero-org-stats"><span><strong>7</strong> professionals</span><span><strong>4</strong> services</span></div><span className="hero-demo-action">Book Appointment <span aria-hidden="true">↗</span></span></div>
          </> : stage === 1 ? <div className="hero-phone-confirm"><span className="hero-confirm-check" aria-hidden="true">✓</span><small>BOOKING CONFIRMED</small><div className="hero-big-serial">#24</div><h3>Dhaka Care Clinic</h3><p>General Medical Consultation</p><dl><div><dt>Appointment date</dt><dd>18 October · Demo visit</dd></div><div><dt>Estimated service window</dt><dd>11:30 AM – 12:00 PM</dd></div></dl><p className="hero-demo-note">A queue serial, not a fixed start time.</p></div>
          : <div className="hero-phone-live"><span className="hero-live-label">LIVE QUEUE · DEMO</span><h3>You're getting closer.</h3><div className="hero-live-serials"><div><small>Now Serving</small><strong>21</strong></div><div><small>Your Serial</small><strong>24</strong></div></div><div className="hero-ahead"><strong>2</strong><span>people ahead</span></div><div className="hero-ready">Get Ready <span aria-hidden="true">↗</span><p>Keep an eye on your live estimate.</p></div><p className="hero-demo-note">Forecasts update as the queue moves.</p></div>}
        </div>
        <div className="hero-phone-home" aria-hidden="true" />
      </div>
      <div className={`hero-support-card hero-support-serial ${stage === 1 ? 'is-highlighted' : ''}`}><span className="hero-support-icon" aria-hidden="true">✓</span><div><small>SERIAL ASSIGNED</small><strong>You're #24 in the queue</strong><span>Estimated · 11:30 AM – 12:00 PM</span></div></div>
      <div className={`hero-support-card hero-support-live ${stage === 2 ? 'is-highlighted' : ''}`}><span className="hero-support-icon" aria-hidden="true">≋</span><div><small>LIVE QUEUE</small><strong>Get Ready</strong><span>Now serving #21 · 2 people ahead</span></div></div>
    </div>
    <div className="hero-story-stages" role="group" aria-label="Product preview stages">{STAGES.map((label, index) => <button key={label} type="button" aria-pressed={stage === index} onClick={() => { setStage(index); setPaused(true); }}><span>{index + 1}</span>{label}</button>)}</div>
    <p className="hero-story-disclaimer">Illustrative demo. Service windows are estimates, not appointment start times.</p>
  </div>;
}
