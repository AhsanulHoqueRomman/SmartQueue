import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestScope } from './requestScope.js';
import { confirmCustomerArrival, ARRIVAL_DECLARATION } from './customerArrival.js';
import { getNormalizedCustomerQueueState } from './queueDisplay.js';

test('older polling completion cannot overwrite the newer result', async () => {
  const scope = createRequestScope('customer:queue');
  const old = scope.begin(); let resolveOld; let value;
  const slow = new Promise(resolve => { resolveOld = resolve; }).then(result => { if (scope.isCurrent(old)) value = result; });
  const latest = scope.begin();
  await Promise.resolve('CALLED').then(result => { if (scope.isCurrent(latest)) value = result; });
  resolveOld('WAITING'); await slow;
  assert.equal(value, 'CALLED');
});

test('account tenant provider date changes invalidate old response tickets', () => {
  for (const next of ['another-account:org:provider:date', 'account:other-org:provider:date', 'account:org:other-provider:date', 'account:org:provider:other-date']) {
    const scope = createRequestScope('account:org:provider:date'); const ticket = scope.begin();
    scope.setKey(next); assert.equal(scope.isCurrent(ticket), false);
    assert.equal(scope.isCurrent(scope.begin()), true);
  }
});

test('unmount or mutation invalidation rejects an outstanding poll', () => {
  const scope = createRequestScope('queue'); const poll = scope.begin(); scope.invalidate();
  assert.equal(scope.isCurrent(poll), false);
  assert.equal(scope.isCurrent(scope.begin()), true);
});

test('unchanged scope keeps a request valid until another request starts', () => {
  const scope = createRequestScope('queue'); const ticket = scope.begin(); scope.setKey('queue');
  assert.equal(scope.isCurrent(ticket), true);
});

test('old-context callback cannot begin a request under a new context', () => {
  const scope = createRequestScope('old-account:queue'); scope.setKey('new-account:queue');
  const fresh = scope.begin('new-account:queue');
  assert.equal(scope.begin('old-account:queue'), null);
  assert.equal(scope.isCurrent(fresh), true);
});

test('arrival submission requires affirmative acknowledgement of exact declaration', () => {
  let message;
  assert.equal(confirmCustomerArrival(value => { message = value; return true; }), true);
  assert.equal(message, ARRIVAL_DECLARATION);
  assert.equal(message, 'I confirm that I have arrived at the organization.');
  assert.equal(confirmCustomerArrival(() => false), false);
  assert.equal(confirmCustomerArrival(() => undefined), false);
  assert.equal(confirmCustomerArrival(null), false);
});

const appointment = { status: 'CONFIRMED', temporal_classification: 'today', serial_number: 8,
  start_datetime: '2026-10-12T10:00:00+06:00', end_datetime: '2026-10-12T10:10:00+06:00' };

test('unreliable ETA never falls back to stored appointment window or stale arrival', () => {
  const state = getNormalizedCustomerQueueState(appointment, { status: 'WAITING', readiness_info: {
    eta_reliable: false, is_delayed: true, provider_has_started: false, estimated_start_time: null,
    estimated_end_time: appointment.end_datetime, recommended_arrival_time: appointment.start_datetime,
    queue_status_text: 'Running Behind Schedule', queue_status_message: 'Your provider has not started consultations as expected.',
  } });
  assert.equal(state.estimatedStartTime, null); assert.equal(state.estimatedEndTime, null);
  assert.equal(state.recommendedArrivalTime, null); assert.equal(state.headline, 'Running Behind Schedule');
  assert.equal(state.timingPlaceholder, 'Updating after provider starts');
});

test('physical people ahead preserves active consultation contribution', () => {
  const state = getNormalizedCustomerQueueState(appointment, { status: 'WAITING', is_checked_in: true,
    readiness_info: { people_ahead: 1, checked_in_ahead: 0, scheduled_ahead: 0, now_serving_serial: 2 } });
  assert.equal(state.peopleAhead, 1); assert.equal(state.nowServing, 2);
});

test('actual called and active states take precedence over guidance', () => {
  assert.equal(getNormalizedCustomerQueueState(appointment, { status: 'CALLED', readiness_info: { readiness_state: 'BE_READY' } }).readinessState, 'TURN_NOW');
  assert.equal(getNormalizedCustomerQueueState(appointment, { status: 'IN_PROGRESS' }).readinessState, 'IN_SERVICE');
  assert.notEqual(getNormalizedCustomerQueueState(appointment, { status: 'WAITING', readiness_info: { readiness_state: 'TURN_NOW' } }).readinessState, 'TURN_NOW');
});

test('missing telemetry does not fabricate timing or a physical count', () => {
  const state = getNormalizedCustomerQueueState(appointment, { status: 'WAITING' });
  assert.equal(state.estimatedStartTime, null); assert.equal(state.estimatedEndTime, null);
  assert.equal(state.peopleAhead, null);
});

test('checked-in low count does not override authoritative NOT_YET guidance', () => {
  const state = getNormalizedCustomerQueueState(appointment, { status: 'WAITING', is_checked_in: true,
    readiness_info: { readiness_state: 'NOT_YET', checked_in_ahead: 0, people_ahead: 0 } });
  assert.equal(state.readinessState, 'NOT_YET'); assert.notEqual(state.displayStatus, 'Get ready');
  assert.notEqual(state.displayStatus, "You're likely next");
});

test('ETA recovery uses fresh backend values without inventing a forecast', () => {
  const state = getNormalizedCustomerQueueState(appointment, { status: 'WAITING', readiness_info: {
    eta_reliable: true, estimated_start_time: '2026-10-12T12:00:00+06:00',
    estimated_end_time: '2026-10-12T12:10:00+06:00', recommended_arrival_time: '2026-10-12T11:45:00+06:00',
  } });
  assert.equal(state.estimatedStartTime, '2026-10-12T12:00:00+06:00');
  assert.equal(state.recommendedArrivalTime, '2026-10-12T11:45:00+06:00');
});


test('unmounted scopes reject reads, mutation completions and old callback restarts', () => {
  const scope = createRequestScope('queue'); const ticket = scope.begin();
  scope.deactivate();
  assert.equal(scope.isCurrent(ticket), false);
  assert.equal(scope.isCurrentScope(ticket), false);
  assert.equal(scope.begin('queue'), null);
  scope.activate();
  assert.equal(scope.isCurrent(ticket), false);
  assert.equal(scope.isCurrent(scope.begin('queue')), true);
});


test('slow background responses are not starved by subsequent poll ticks', () => {
  const scope=createRequestScope('queue');
  const slow=scope.begin('queue', {background:true});
  assert.equal(scope.begin('queue', {background:true}), null);
  assert.equal(scope.isCurrent(slow), true);
  scope.finish(slow);
  const next=scope.begin('queue', {background:true});
  assert.equal(scope.isCurrent(next), true);
  const mutation=scope.begin('queue');
  assert.equal(scope.isCurrent(next), false);
  assert.equal(scope.isCurrent(mutation), true);
  scope.finish(next);
  assert.equal(scope.isCurrent(mutation), true);
});


test('BE_READY based on time does not claim the customer is first in line', () => {
  const state=getNormalizedCustomerQueueState(appointment, {status:'WAITING',is_checked_in:true,
    readiness_info:{readiness_state:'BE_READY',checked_in_ahead:6,people_ahead:7,provider_has_started:true}});
  assert.equal(state.displayStatus,'Be ready');
  assert.equal(state.headline,'Turn Approaching');
  assert.equal(state.peopleAhead,7);
});
