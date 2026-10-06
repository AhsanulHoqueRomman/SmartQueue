import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBookingDate, getUpcomingBookings } from './homeBookingDisplay.js';

const booking = (id, date = '2099-10-07', extra = {}) => ({ id, appointment_date: date, temporal_classification: 'future', status: 'CONFIRMED', ...extra });
test('empty and single booking states', () => {
  assert.deepEqual(getUpcomingBookings([]), []);
  assert.equal(getUpcomingBookings([booking('one')]).length, 1);
});
test('multiple bookings across organizations select nearest and count additional', () => {
  const items = [booking('later', '2099-10-09', { organization_id: 'a' }), booking('next', '2099-10-07', { organization_id: 'b' }), booking('middle', '2099-10-08')];
  const upcoming = getUpcomingBookings(items);
  assert.equal(upcoming[0].id, 'next');
  assert.equal(upcoming.length - 1, 2);
  assert.equal(items[0].id, 'later');
});
test('exclude past, terminal and already in-service visits', () => {
  assert.deepEqual(getUpcomingBookings([booking('past', '2099-10-07', { temporal_classification: 'past' }), booking('cancelled', undefined, { status: 'CANCELLED' }), booking('underway', undefined, { queue_entry: { status: 'IN_PROGRESS' } })]), []);
});
test('same day uses returned estimated window without comparing unrelated queue serials', () => {
  const upcoming = getUpcomingBookings([booking('pm', undefined, { start_datetime: '2099-10-07T15:00:00+06:00', serial_number: 1 }), booking('am', undefined, { start_datetime: '2099-10-07T09:00:00+06:00', serial_number: 9 })]);
  assert.equal(upcoming[0].id, 'am');
});
test('date-only formatting is calendar-safe across timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['Asia/Dhaka', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      assert.equal(formatBookingDate('2026-10-07'), '7 October 2026');
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
test('missing or invalid dates have a truthful fallback', () => {
  assert.equal(formatBookingDate(null), 'Date unavailable');
  assert.equal(formatBookingDate('2026-02-30'), 'Date unavailable');
});
test('legacy null and zero charge snapshots are preserved', () => {
  const upcoming = getUpcomingBookings([booking('legacy', undefined, { booked_service_charge: null, price: '1700' }), booking('zero', undefined, { booked_service_charge: '0.00' })]);
  assert.equal(upcoming[0].booked_service_charge, null);
  assert.equal(upcoming[1].booked_service_charge, '0.00');
});
