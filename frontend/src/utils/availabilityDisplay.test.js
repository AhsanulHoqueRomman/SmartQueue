import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesWorkingWindow } from './availabilityDisplay.js';

test('any window does not invent or require provider hours', () => {
  assert.equal(matchesWorkingWindow({}, 'ANY'), true);
  assert.equal(matchesWorkingWindow({}, 'MORNING'), false);
});
test('working windows use overlap rather than fixed appointment times', () => {
  const hours = { start_time: '11:00:00', end_time: '18:00:00' };
  for (const window of ['MORNING', 'AFTERNOON', 'EVENING']) assert.equal(matchesWorkingWindow(hours, window), true);
});
test('adjacent boundaries do not imply overlapping availability', () => {
  assert.equal(matchesWorkingWindow({ start_time: '12:00', end_time: '17:00' }, 'MORNING'), false);
  assert.equal(matchesWorkingWindow({ start_time: '12:00', end_time: '17:00' }, 'EVENING'), false);
  assert.equal(matchesWorkingWindow({ start_time: '12:00', end_time: '17:00' }, 'AFTERNOON'), true);
  assert.equal(matchesWorkingWindow({ start_time: '12:00', end_time: '17:00' }, 'UNKNOWN'), false);
});
