import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingWindow } from './bookingWindow.js';
import { initialSchedule, weekdayForDate } from './scheduleDraft.js';
import { getNormalizedCustomerQueueState } from './queueDisplay.js';

test('booking window is four calendar dates and rolls at Dhaka midnight', () => {
  const before = bookingWindow(new Date('2026-10-11T17:59:59Z'));
  const after = bookingWindow(new Date('2026-10-11T18:00:00Z'));
  assert.equal(before.first, '2026-10-11'); assert.equal(before.last, '2026-10-14');
  assert.equal(after.first, '2026-10-12'); assert.equal(after.last, '2026-10-15');
  assert.equal(before.nextMidnight, new Date('2026-10-11T18:00:00Z').getTime());
});
test('calendar window crosses year and month boundaries without extra dates', () => {
  const result = bookingWindow(new Date('2026-12-31T03:00:00Z'));
  assert.equal(result.first, '2026-12-31'); assert.equal(result.last, '2027-01-03');
});
test('schedule draft has independent breaks and matches Python weekday numbering', () => {
  const days = initialSchedule();
  assert.equal(days.length, 7); assert.equal(weekdayForDate('2026-10-11'), 6); assert.equal(weekdayForDate('2026-10-12'), 0);
  days[0].breaks.push({ start_time: '12:00:00', end_time: '13:00:00' });
  assert.equal(days[1].breaks.length, 0);
});
test('unfinished historical booking is not presented as missed or terminal', () => {
  const result = getNormalizedCustomerQueueState({ appointment_date: '2020-01-01', temporal_classification: 'past', status: 'CONFIRMED', serial_number: 11 }, { status: 'WAITING', is_checked_in: false });
  assert.equal(result.displayStatus, 'Waiting');
  assert.equal(result.isMissed, false);
  assert.equal(result.isTerminal, false);
});
test('called previous-day customer keeps called state; calendar change cannot expire them', () => {
  const result = getNormalizedCustomerQueueState({ appointment_date: '2020-01-01', temporal_classification: 'past', status: 'CHECKED_IN' }, { status: 'CALLED', is_checked_in: true });
  assert.equal(result.isTerminal, false);
  assert.equal(result.can_open_telemetry, true);
});
