import getNormalizedCustomerQueueState from './queueDisplay.js';

export function formatBookingDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!parts) return 'Date unavailable';
  const [, year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function getUpcomingBookings(items) {
  return items.filter(item => ['today', 'future'].includes(item.temporal_classification)
    && !getNormalizedCustomerQueueState(item).isTerminal
    && item.status !== 'IN_PROGRESS' && item.queue_entry?.status !== 'IN_PROGRESS')
    .sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date))
      || String(a.start_datetime || '').localeCompare(String(b.start_datetime || ''))
      || String(a.created_at || a.id).localeCompare(String(b.created_at || b.id)));
}
