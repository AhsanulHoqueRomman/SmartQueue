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

import { formatAvailabilityError } from './availabilityDisplay.js';

test('formatAvailabilityError maps PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED to customer guidance', () => {
  const err = {
    response: {
      status: 400,
      data: {
        error: {
          code: 'PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED',
          message: 'Configure a positive provider average service time before booking or forecasting this queue.',
        },
      },
    },
  };
  const msg = formatAvailabilityError(err);
  assert.equal(
    msg,
    'This professional is temporarily unavailable for online booking because their service duration settings are incomplete. Please choose another professional or contact the organization.'
  );
  assert.ok(!msg.includes('Choose the date again'));
  assert.ok(!msg.includes('positive provider average'));
});

test('formatAvailabilityError maps recognized domain error codes', () => {
  const outsideWindow = {
    response: { status: 400, data: { error: { code: 'OUTSIDE_BOOKING_WINDOW' } } },
  };
  assert.equal(
    formatAvailabilityError(outsideWindow),
    'Appointments can only be booked for today or one of the next three dates.'
  );

  const notAssigned = {
    response: { status: 400, data: { error: { code: 'PROVIDER_SERVICE_NOT_ASSIGNED' } } },
  };
  assert.equal(
    formatAvailabilityError(notAssigned),
    'This professional is not assigned to the selected service. Please choose another professional.'
  );

  const emergency = {
    response: { status: 400, data: { error: { code: 'PROVIDER_EMERGENCY' } } },
  };
  assert.equal(
    formatAvailabilityError(emergency),
    'This professional is temporarily unavailable on this date due to an operational hold.'
  );

  const notFound = {
    response: { status: 404, data: { error: { code: 'PROVIDER_NOT_FOUND' } } },
  };
  assert.equal(
    formatAvailabilityError(notFound),
    'The requested booking details could not be found. Please refresh your selections.'
  );
});

test('formatAvailabilityError handles network and transport failures safely', () => {
  const networkErr = { code: 'ERR_NETWORK', message: 'Network Error' };
  assert.equal(
    formatAvailabilityError(networkErr),
    'Network connection issue. Please check your connection and try again.'
  );

  const requestErr = { request: {}, message: 'timeout of 5000ms exceeded' };
  assert.equal(
    formatAvailabilityError(requestErr),
    'Network connection issue. Please check your connection and try again.'
  );
});

test('formatAvailabilityError handles HTTP status fallbacks and unknown errors', () => {
  const forbidden = { response: { status: 403, data: {} } };
  assert.equal(
    formatAvailabilityError(forbidden),
    'You do not have permission to check availability for this professional.'
  );

  const serverError = { response: { status: 500, data: {} } };
  assert.equal(
    formatAvailabilityError(serverError),
    'The service is temporarily unavailable. Please try again shortly.'
  );

  const unknownError = { response: { status: 400, data: { error: { code: 'CUSTOM_UNKNOWN_CODE' } } } };
  const fallback = formatAvailabilityError(unknownError);
  assert.equal(
    fallback,
    'Unable to check availability for this selection. Please try again or choose another date or professional.'
  );
  assert.ok(!fallback.includes('Choose the date again'));

  assert.equal(
    formatAvailabilityError(null),
    'Unable to check availability for this selection. Please try again or choose another date or professional.'
  );
});
