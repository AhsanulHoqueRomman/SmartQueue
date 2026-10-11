import { useEffect, useState } from 'react';
import { bookingWindow } from '../utils/bookingWindow';

export function useBookingWindow() {
  const [window, setWindow] = useState(bookingWindow);
  useEffect(() => {
    let timer;
    const refresh = () => {
      const next = bookingWindow();
      setWindow(previous => previous.first === next.first ? previous : next);
      clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(50, next.nextMidnight - Date.now() + 50));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return window;
}
