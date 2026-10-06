// Display weekly windows only. Availability and current opening status remain server decisions.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function timeLabel(value) {
  if (!/^\d{2}:\d{2}/.test(value || '')) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (hour > 23 || minute > 59) return null;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function weeklyWindows(records = [], provider = false) {
  const byDay = new Map(records.map(row => [row.day_of_week, row]));
  // Sunday first, matching the local weekly presentation; missing days are unknown, not closed.
  const groups = [];
  for (const day of [6, 0, 1, 2, 3, 4, 5]) {
    const row = byDay.get(day);
    const closed = row && (provider ? row.is_working_day === false : row.is_closed === true);
    const start = timeLabel(provider ? row?.start_time : row?.open_time);
    const end = timeLabel(provider ? row?.end_time : row?.close_time);
    const window = !row ? 'Hours unavailable' : closed ? (provider ? 'Not working' : 'Closed')
      : start && end ? `${start} – ${end}` : 'Hours unavailable';
    const previous = groups.at(-1);
    if (previous?.window === window) previous.last = day;
    else groups.push({ first: day, last: day, window });
  }
  if (!records.length) return [];
  return groups.map(({ first, last, window }) => ({
    days: first === last ? DAYS[first] : `${DAYS[first]}–${DAYS[last]}`, window,
  }));
}
