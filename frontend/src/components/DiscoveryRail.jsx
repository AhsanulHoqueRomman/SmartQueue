import { useEffect, useRef, useState } from 'react';
import useScrollPresence from '../hooks/useScrollPresence';

export default function DiscoveryRail({ label, items, renderItem, automatic = false }) {
  const viewport = useRef(null);
  const [, visible] = useScrollPresence(.12, true, viewport);
  const group = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const interaction = useRef({ hovered: false, focused: false, resumeAt: 0 });
  const [edges, setEdges] = useState({ start: true, end: false });
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const looping = automatic && items.length > 1 && !reduced;
  const resumeSoon = () => { interaction.current.resumeAt = performance.now() + 2000; };
  useEffect(() => {
    interaction.current.resumeAt = 0;
    drag.current = null;
    interaction.current.hovered = visible && viewport.current.matches(':hover');
    interaction.current.focused = visible && viewport.current.parentElement.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
  }, [visible]);

  useEffect(() => {
    const node = viewport.current;
    const update = () => {
      const next = { start: node.scrollLeft <= 1, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1 };
      setEdges(previous => previous.start === next.start && previous.end === next.end ? previous : next);
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(media.matches);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (group.current) observer.observe(group.current);
    node.addEventListener('scroll', update, { passive: true });
    media.addEventListener('change', onMotion);
    update();
    return () => { observer.disconnect(); node.removeEventListener('scroll', update); media.removeEventListener('change', onMotion); };
  }, [items.length, looping]);

  useEffect(() => {
    if (!looping || !visible) return;
    let frame;
    let previous = null;
    const node = viewport.current;
    let position = node.scrollLeft;
    const move = time => {
      const cycle = group.current?.offsetWidth || 0;
      const { hovered, focused, resumeAt } = interaction.current;
      if (document.hidden || !cycle || hovered || focused || drag.current || time < resumeAt) { previous = null; position = node.scrollLeft; }
      else {
        if (previous !== null) {
          position += Math.min(time - previous, 40) * .0375;
          if (position >= cycle) position -= cycle;
          node.scrollLeft = position;
        }
        previous = time;
      }
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [looping, visible]);

  const moveBy = direction => {
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
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    interaction.current.focused = false;
    suppressClick.current = false;
    drag.current = { x: event.clientX, y: event.clientY, scroll: viewport.current.scrollLeft, pointer: event.pointerId, type: event.pointerType, horizontal: false };
  };
  const pointerMove = event => {
    if (!drag.current) return;
    const distance = event.clientX - drag.current.x;
    if (Math.abs(distance) <= Math.abs(event.clientY - drag.current.y)) return;
    if (Math.abs(distance) < 6 && !suppressClick.current) return;
    drag.current.horizontal = true;
    if (drag.current.type !== 'mouse') return; // Preserve native touch scrolling.
    suppressClick.current = true;
    viewport.current.setPointerCapture(drag.current.pointer);
    viewport.current.scrollLeft = drag.current.scroll - distance;
  };
  const endDrag = () => { if (drag.current?.horizontal) resumeSoon(); drag.current = null; };

  return <div className={`discovery-rail ${automatic ? 'discovery-rail-organizations' : ''}`}
    onFocusCapture={event => { interaction.current.focused = event.target.matches(':focus-visible'); }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) interaction.current.focused = false; }}>
    <button type="button" className="discovery-arrow" aria-label={`Previous ${label}`} disabled={!looping && edges.start} onClick={() => moveBy(-1)}>‹</button>
    <div ref={viewport} className="discovery-rail-viewport" role="region" aria-label={label} tabIndex={0}
      onMouseEnter={() => { interaction.current.hovered = true; }} onMouseLeave={() => { interaction.current.hovered = false; endDrag(); }}
      onKeyDown={event => { interaction.current.focused = true; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveBy(event.key === 'ArrowLeft' ? -1 : 1); } }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onWheel={event => { if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || (event.shiftKey && event.deltaY !== 0)) resumeSoon(); }} onDragStart={event => event.preventDefault()}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      <div className="discovery-rail-track">
        <div ref={group} className="discovery-rail-group">{items.map(item => renderItem(item, false))}</div>
        {looping && <div className="discovery-rail-group" aria-hidden="true">{items.map(item => renderItem(item, true))}</div>}
      </div>
    </div>
    <button type="button" className="discovery-arrow" aria-label={`Next ${label}`} disabled={!looping && edges.end} onClick={() => moveBy(1)}>›</button>
  </div>;
}
