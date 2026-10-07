import { useEffect, useRef, useState } from 'react';

// Separate enter/exit ratios avoid threshold jitter and edge-touch intersections.
export default function useScrollPresence(threshold = .12, replay = true, targetRef = null) {
  const ownRef = useRef(null);
  const ref = targetRef || ownRef;
  const supported = 'IntersectionObserver' in window;
  const [entered, setEntered] = useState(!supported);
  const [visible, setVisible] = useState(!supported);
  useEffect(() => {
    if (!supported) return;
    const node = ref.current;
    if (!node) return;
    let observer;
    let currentRatio = null;
    const observe = () => {
      // Tall mobile stacks should not require a quarter of the entire stack on screen.
      const enterRatio = Math.max(.02, Math.min(threshold, window.innerHeight * .25 / Math.max(node.offsetHeight, 1)));
      if (enterRatio === currentRatio) return;
      currentRatio = enterRatio;
      observer?.disconnect();
      const nextObserver = new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        if (observer !== nextObserver) return; // Ignore a queued callback from an obsolete sizing observer.
        const present = entry.isIntersecting && entry.intersectionRatio > .01;
        setVisible(present);
        if (!present && replay) setEntered(false);
        else if (present && entry.intersectionRatio >= enterRatio) setEntered(true);
      }, { threshold: [0, .01, enterRatio] });
      observer = nextObserver;
      observer.observe(node);
    };
    observe();
    const resize = new ResizeObserver(observe);
    resize.observe(node);
    window.addEventListener('resize', observe);
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', observe); };
  }, [threshold, replay, supported, ref]);
  return [ref, entered, visible, supported];
}
