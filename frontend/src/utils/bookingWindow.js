export function bookingWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  const first = `${value('year')}-${value('month')}-${value('day')}`;
  const midnight = new Date(`${first}T00:00:00+06:00`).getTime();
  const last = new Date(midnight + 3 * 86400000 + 6 * 3600000).toISOString().slice(0, 10);
  return { first, last, nextMidnight: midnight + 86400000 };
}
