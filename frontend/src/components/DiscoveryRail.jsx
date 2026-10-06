import { useEffect, useRef, useState } from 'react';

export default function DiscoveryRail({ label, items, renderItem, automatic = false }) {
  const viewport = useRef(null);
  const group = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const resumeTimer = useRef(null);
  const interacting = useRef(false);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const looping = automatic && items.length > 1 && !reduced;
  useEffect(() => () => clearTimeout(resumeTimer.current), []);
  const pauseInteraction = () => { clearTimeout(resumeTimer.current); setPaused(true); };
  const resumeSoon = () => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 2000);
  };

  useEffect(() => {
    const node = viewport.current;
    const update = () => {
      const next = { start: node.scrollLeft <= 1, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1 };
      setEdges(previous => previous.start === next.start && previous.end === next.end ? previous : next);
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(media.matches);
    const observer = new ResizeObserver(update);
    const intersection = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    if (group.current) observer.observe(group.current);
    intersection.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    media.addEventListener('change', onMotion);
    update();
    return () => { observer.disconnect(); intersection.disconnect(); node.removeEventListener('scroll', update); media.removeEventListener('change', onMotion); };
  }, [items.length, looping]);

  useEffect(() => {
    if (!looping || paused || hovered || focused || !visible) return;
    let frame;
    let previous = null;
    let position = viewport.current.scrollLeft;
    const move = time => {
      const node = viewport.current;
      const cycle = group.current?.offsetWidth || 0;
      if (document.hidden || !cycle) previous = null;
      else {
        if (previous !== null) {
          position += Math.min(time - previous, 40) * .024;
          if (position >= cycle) position -= cycle;
          node.scrollLeft = position;
        }
        previous = time;
      }
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [looping, paused, hovered, focused, visible]);

  const moveBy = direction => {
    pauseInteraction();
    const node = viewport.current;
    if (looping && direction < 0 && node.scrollLeft < 1) node.scrollLeft = group.current.offsetWidth;
    const card = group.current.firstElementChild;
    const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(group.current).gap);
    const count = Math.max(1, Math.floor(node.clientWidth / step));
    const index = direction > 0 ? Math.floor((node.scrollLeft + 1) / step) : Math.ceil((node.scrollLeft - 1) / step);
    node.scrollTo({ left: Math.max(0, (index + direction * count) * step), behavior: reduced ? 'auto' : 'smooth' });
    resumeSoon();
  };
  const pointerDown = event => {
    pauseInteraction();
    interacting.current = true;
    setFocused(false); // Pointer focus must not leave autoplay permanently paused after a swipe/drag.
    suppressClick.current = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return; // Native touch scrolling.
    drag.current = { x: event.clientX, scroll: viewport.current.scrollLeft, pointer: event.pointerId };
  };
  const pointerMove = event => {
    if (!drag.current) return;
    const distance = event.clientX - drag.current.x;
    if (Math.abs(distance) < 6 && !suppressClick.current) return;
    suppressClick.current = true;
    viewport.current.setPointerCapture(drag.current.pointer);
    viewport.current.scrollLeft = drag.current.scroll - distance;
  };
  const endDrag = () => { drag.current = null; interacting.current = false; resumeSoon(); };

  return <div className={`discovery-rail ${automatic ? 'discovery-rail-organizations' : ''}`}>
    <button type="button" className="discovery-arrow" aria-label={`Previous ${label}`} disabled={!looping && edges.start} onClick={() => moveBy(-1)}>‹</button>
    <div ref={viewport} className="discovery-rail-viewport" role="region" aria-label={label} tabIndex={0}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); endDrag(); }}
      onFocusCapture={event => setFocused(event.target.matches(':focus-visible'))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={event => { setFocused(true); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveBy(event.key === 'ArrowLeft' ? -1 : 1); } }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onWheel={() => { pauseInteraction(); resumeSoon(); }} onScroll={() => { if (paused && !interacting.current) resumeSoon(); }} onDragStart={event => event.preventDefault()}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      <div className="discovery-rail-track">
        <div ref={group} className="discovery-rail-group">{items.map(item => renderItem(item, false))}</div>
        {looping && <div className="discovery-rail-group" aria-hidden="true">{items.map(item => renderItem(item, true))}</div>}
      </div>
    </div>
    <button type="button" className="discovery-arrow" aria-label={`Next ${label}`} disabled={!looping && edges.end} onClick={() => moveBy(1)}>›</button>
  </div>;
}
