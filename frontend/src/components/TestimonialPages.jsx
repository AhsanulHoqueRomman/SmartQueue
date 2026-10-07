import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const pageSize = () => window.matchMedia('(max-width: 600px)').matches ? 1 : window.matchMedia('(max-width: 1000px)').matches ? 2 : 3;
const transitionMs = 500;
const dwellMs = 5000;
const entryMs = 880;
const graceMs = 1800;

// Testimonials are native-scrollable pages, independent of the autoplay discovery rail.
export default function TestimonialPages({ items, renderItem, active }) {
  const viewport = useRef(null);
  const timer = useRef(null);
  const locked = useRef(false);
  const drag = useRef(null);
  const autoplay = useRef(null);
  const entryEnds = useRef(0);
  const scrollUntil = useRef(0);
  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(0);
  const [transition, setTransition] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [resumeAt, setResumeAt] = useState(0);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pages = useMemo(() => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)), [items, size]);
  const current = Math.min(page, pages.length - 1);
  const activePage = useRef(current);
  useEffect(() => { activePage.current = current; }, [current]);

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(autoplay.current); }, []);
  useEffect(() => {
    entryEnds.current = active && !reduced ? performance.now() + entryMs : 0;
  }, [active, reduced]);
  useEffect(() => {
    const visibility = () => { clearTimeout(autoplay.current); setTabVisible(!document.hidden); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      setReduced(media.matches);
      if (!media.matches) return;
      clearTimeout(timer.current);
      locked.current = false;
      setTransition(null);
    };
    media.addEventListener('change', stop);
    return () => media.removeEventListener('change', stop);
  }, []);
  useEffect(() => {
    const tablet = window.matchMedia('(max-width: 1000px)');
    const mobile = window.matchMedia('(max-width: 600px)');
    const resize = () => {
      const next = pageSize();
      if (next === size) return;
      clearTimeout(timer.current);
      locked.current = false;
      setTransition(null);
      setPage(Math.floor(current * size / next));
      setSize(next);
    };
    tablet.addEventListener('change', resize);
    mobile.addEventListener('change', resize);
    return () => { tablet.removeEventListener('change', resize); mobile.removeEventListener('change', resize); };
  }, [current, size]);
  useEffect(() => {
    const node = viewport.current;
    const align = () => { node.scrollLeft = activePage.current * node.clientWidth; };
    const observer = new ResizeObserver(align);
    observer.observe(node);
    align();
    return () => observer.disconnect();
  }, [size]);

  const move = useCallback((direction, automatic = false) => {
    const next = automatic ? (current + 1) % pages.length : current + direction;
    if (locked.current || next < 0 || next >= pages.length) return;
    clearTimeout(autoplay.current);
    if (!reduced) {
      locked.current = true;
      setTransition({ from: pages[current], to: next, direction });
      timer.current = setTimeout(() => { locked.current = false; setTransition(null); }, transitionMs);
    }
    setPage(next);
    viewport.current.scrollLeft = next * viewport.current.clientWidth;
  }, [current, pages, reduced]);

  useEffect(() => {
    if (!active || !tabVisible || reduced || hovered || focused || interacting || transition || pages.length < 2) return;
    autoplay.current = setTimeout(() => {
      if (!document.hidden) move(1, true);
    }, dwellMs + Math.max(0, resumeAt - performance.now(), entryEnds.current - performance.now()));
    return () => clearTimeout(autoplay.current);
  }, [active, tabVisible, reduced, hovered, focused, interacting, transition, pages.length, resumeAt, move]);

  const pause = () => clearTimeout(autoplay.current);
  const resume = () => setResumeAt(performance.now() + graceMs);
  const endInteraction = () => { if (scrollUntil.current > performance.now()) scrollUntil.current = performance.now() + 600; drag.current = null; setInteracting(false); resume(); };

  return <div className="discovery-rail testimonial-pages" style={{ '--page-direction': transition?.direction || 1 }}
    onMouseEnter={() => { pause(); setHovered(true); }} onMouseLeave={() => { setHovered(false); endInteraction(); }}
    onFocusCapture={event => { if (event.target.matches(':focus-visible')) { pause(); setFocused(true); } }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); resume(); } }}>
    <button type="button" className="discovery-arrow" aria-label="Previous customer experiences" disabled={current === 0} onClick={() => move(-1)}>‹</button>
    <div className="testimonial-stage">
      <div ref={viewport} className="discovery-rail-viewport testimonial-viewport" role="region" aria-label="customer experiences" tabIndex={0}
        onKeyDown={event => { pause(); setFocused(true); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } }}
        onScroll={event => { if (!locked.current && scrollUntil.current > performance.now()) { const next = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth); if (next !== current) { pause(); setPage(next); resume(); } } }}
        onPointerDown={event => { pause(); setInteracting(true); scrollUntil.current = performance.now() + 60000; if (!locked.current && event.pointerType === 'mouse' && event.button === 0) drag.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={event => { const start = drag.current; if (start && Math.abs(event.clientX - start.x) > 40 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) move(event.clientX < start.x ? 1 : -1); endInteraction(); }}
        onPointerCancel={endInteraction} onPointerLeave={endInteraction}
        onWheel={event => { if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) { scrollUntil.current = performance.now() + 600; pause(); resume(); } }}>
        <div className="discovery-rail-track">
          {pages.map((reviews, index) => <div key={index} className={`discovery-rail-group testimonial-page ${transition?.to === index ? 'is-arriving' : ''}`} aria-hidden={index !== current} inert={index !== current}>
            {reviews.map((review, position) => <div className="testimonial-entry" key={review.id} style={{ '--review-delay': `${.22 + position * .12}s` }}>{renderItem(review, position)}</div>)}
          </div>)}
        </div>
      </div>
      {transition && <div className="discovery-rail-group testimonial-page is-departing" aria-hidden="true" inert>{transition.from.map((review, position) => <div className="testimonial-entry" key={review.id}>{renderItem(review, position)}</div>)}</div>}
      <span className="sr-only" aria-live={focused ? 'polite' : 'off'}>Page {current + 1} of {pages.length}</span>
    </div>
    <button type="button" className="discovery-arrow" aria-label="Next customer experiences" disabled={current === pages.length - 1} onClick={() => move(1)}>›</button>
  </div>;
}
