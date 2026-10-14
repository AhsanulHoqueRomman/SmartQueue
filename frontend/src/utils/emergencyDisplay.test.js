import test from 'node:test';
import assert from 'node:assert/strict';
import { emergencyNotice, recoveryPayload } from './emergencyDisplay.js';
import { getNormalizedCustomerQueueState } from './queueDisplay.js';

test('contact outcomes cannot imply consent or trigger a recovery action', () => {
  const payload = recoveryPayload('CONTACT', { direction: 'OUTBOUND', outcome: 'UNREACHABLE', note: 'Try later', requestId: 'stable-request' });
  assert.equal(payload.outcome, 'UNREACHABLE'); assert.equal(payload.consent, undefined);
  assert.throws(() => recoveryPayload('CANCEL', { direction: 'INBOUND', consent: false, consentNote: 'Not yet agreed' }));
});
test('replacement requires explicit consent and exact agreed target', () => {
  const form = { direction: 'OUTBOUND', consent: true, consentNote: ' Customer agreed ', targetDate: '2026-10-14', targetProvider: 'target' };
  assert.deepEqual(recoveryPayload('RESCHEDULE', form), { action: 'RESCHEDULE', direction: 'OUTBOUND', consent: true, consent_note: 'Customer agreed', target_date: '2026-10-14', target_provider_id: 'target' });
  assert.throws(() => recoveryPayload('RESCHEDULE', { ...form, targetDate: '' }));
});
test('customer notices use only backend incident state and preserve absent data', () => {
  assert.equal(emergencyNotice({}), null);
  assert.deepEqual(emergencyNotice({ queue_entry: { readiness_info: { emergency: { state: 'TEMPORARY' } } } }), { state: 'TEMPORARY' });
});
test('held called consultation retains actual state but suppresses proceed-now advice', () => {
  const state = getNormalizedCustomerQueueState({ status: 'CHECKED_IN', temporal_classification: 'today', emergency: { hold: true, resolution: 'UNRESOLVED', status_label: 'Temporary Emergency', message: 'Follow recovery details.' }, queue_entry: { status: 'CALLED' } });
  assert.equal(state.readinessState, 'TURN_NOW'); assert.equal(state.displayStatus, 'Service interrupted');
  assert.equal(state.guidance, 'Follow recovery details.');
});
test('resolved original is historical without relabeling it as ordinary cancellation', () => {
  const state = getNormalizedCustomerQueueState({ status: 'CONFIRMED', temporal_classification: 'today', emergency: { resolution: 'RESCHEDULED', replacement_id: 'replacement', hold: false }, queue_entry: { status: 'IN_PROGRESS' } });
  assert.equal(state.rawStatus, 'RESCHEDULED'); assert.equal(state.isTerminal, true); assert.equal(state.can_open_telemetry, false);
});
