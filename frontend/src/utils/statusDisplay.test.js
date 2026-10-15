import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatusPresentation,
  APPOINTMENT_STATUS_MAP,
  QUEUE_STATUS_MAP,
  FALLBACK_STATUS,
} from './statusDisplay.js';

test('maps all known appointment statuses correctly', () => {
  const expectedMappings = [
    { status: 'PENDING', label: 'Pending', tone: 'pending', badgeClass: 'status-pending' },
    { status: 'CONFIRMED', label: 'Confirmed', tone: 'confirmed', badgeClass: 'status-confirmed' },
    { status: 'CHECKED_IN', label: 'Checked In', tone: 'in_progress', badgeClass: 'status-in_progress' },
    { status: 'IN_PROGRESS', label: 'In Progress', tone: 'in_progress', badgeClass: 'status-in_progress' },
    { status: 'COMPLETED', label: 'Completed', tone: 'completed', badgeClass: 'status-completed' },
    { status: 'CANCELLED', label: 'Cancelled', tone: 'cancelled', badgeClass: 'status-cancelled' },
    { status: 'NO_SHOW', label: 'No Show', tone: 'no_show', badgeClass: 'status-no_show' },
    { status: 'ACTIVE', label: 'Active', tone: 'in_progress', badgeClass: 'status-in_progress' },
    { status: 'INACTIVE', label: 'Inactive', tone: 'no_show', badgeClass: 'status-no_show' },
  ];

  for (const exp of expectedMappings) {
    const res = getStatusPresentation(exp.status, 'appointment');
    assert.equal(res.label, exp.label);
    assert.equal(res.tone, exp.tone);
    assert.equal(res.badgeClass, exp.badgeClass);
    assert.equal(res.accessibleText, `Status: ${exp.label}`);
  }
});

test('maps all known queue statuses correctly', () => {
  const expectedQueueMappings = [
    { status: 'WAITING', label: 'Waiting', tone: 'pending', badgeClass: 'status-pending' },
    { status: 'CALLED', label: 'Called', tone: 'in_progress', badgeClass: 'status-in_progress' },
    { status: 'IN_PROGRESS', label: 'In Progress', tone: 'in_progress', badgeClass: 'status-in_progress' },
    { status: 'COMPLETED', label: 'Completed', tone: 'completed', badgeClass: 'status-completed' },
    { status: 'SKIPPED', label: 'Skipped', tone: 'cancelled', badgeClass: 'status-cancelled' },
  ];

  for (const exp of expectedQueueMappings) {
    const res = getStatusPresentation(exp.status, 'queue');
    assert.equal(res.label, exp.label);
    assert.equal(res.tone, exp.tone);
    assert.equal(res.badgeClass, exp.badgeClass);
    assert.equal(res.accessibleText, `Queue status: ${exp.label}`);
  }
});

test('handles case-insensitivity and whitespace trimming', () => {
  const variations = ['confirmed', ' CONFIRMED ', 'Confirmed', 'cOnFiRmEd'];
  for (const v of variations) {
    const res = getStatusPresentation(v, 'appointment');
    assert.equal(res.label, 'Confirmed');
    assert.equal(res.tone, 'confirmed');
    assert.equal(res.badgeClass, 'status-confirmed');
  }

  const queueVariations = ['waiting', ' WAITING ', 'Waiting'];
  for (const v of queueVariations) {
    const res = getStatusPresentation(v, 'queue');
    assert.equal(res.label, 'Waiting');
    assert.equal(res.tone, 'pending');
  }
});

test('handles custom-label precedence over default status names', () => {
  const resAppt = getStatusPresentation('IN_PROGRESS', 'appointment', 'Under Doctor Care');
  assert.equal(resAppt.label, 'Under Doctor Care');
  assert.equal(resAppt.tone, 'in_progress');
  assert.equal(resAppt.badgeClass, 'status-in_progress');
  assert.equal(resAppt.accessibleText, 'Status: Under Doctor Care');

  const resQueue = getStatusPresentation('CALLED', 'queue', 'Your Turn Now');
  assert.equal(resQueue.label, 'Your Turn Now');
  assert.equal(resQueue.tone, 'in_progress');
  assert.equal(resQueue.accessibleText, 'Queue status: Your Turn Now');
});

test('handles unknown, empty, and null statuses with safe neutral fallback', () => {
  const nullRes = getStatusPresentation(null);
  assert.equal(nullRes.label, 'Unknown');
  assert.equal(nullRes.tone, 'neutral');
  assert.equal(nullRes.badgeClass, 'status-no_show');
  assert.equal(nullRes.accessibleText, 'Status: Unknown');

  const emptyRes = getStatusPresentation('');
  assert.equal(emptyRes.label, 'Unknown');
  assert.equal(emptyRes.tone, 'neutral');

  const undefinedRes = getStatusPresentation(undefined);
  assert.equal(undefinedRes.label, 'Unknown');
  assert.equal(undefinedRes.tone, 'neutral');

  const unknownRes = getStatusPresentation('SOME_FUTURE_STATUS');
  assert.equal(unknownRes.label, 'SOME_FUTURE_STATUS');
  assert.equal(unknownRes.tone, 'neutral');
  assert.equal(unknownRes.badgeClass, 'status-no_show');
  assert.equal(unknownRes.accessibleText, 'Status: SOME_FUTURE_STATUS');

  const unknownWithCustom = getStatusPresentation('UNRECOGNIZED', 'appointment', 'Special Case');
  assert.equal(unknownWithCustom.label, 'Special Case');
  assert.equal(unknownWithCustom.tone, 'neutral');
  assert.equal(unknownWithCustom.accessibleText, 'Status: Special Case');
});

test('exports valid mapping constants and fallback object', () => {
  assert.equal(typeof APPOINTMENT_STATUS_MAP, 'object');
  assert.equal(typeof QUEUE_STATUS_MAP, 'object');
  assert.equal(typeof FALLBACK_STATUS, 'object');
  assert.equal(FALLBACK_STATUS.tone, 'neutral');
  assert.equal(APPOINTMENT_STATUS_MAP.CONFIRMED.tone, 'confirmed');
  assert.equal(QUEUE_STATUS_MAP.WAITING.tone, 'pending');
});
