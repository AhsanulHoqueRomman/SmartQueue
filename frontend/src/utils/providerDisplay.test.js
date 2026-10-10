import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProfessionalDisplay } from './providerDisplay.js';

test('discovery names support selector designation and selected-provider heading', () => {
  const provider = { id: 'demo-provider', user_first_name: '  Farhana ', user_last_name: ' Rahman  ', title: 'Consultant' };
  const display = deriveProfessionalDisplay(provider, 'Provider #demo-pro');
  assert.deepEqual(display, { displayName: 'Farhana Rahman', designation: 'Consultant', showDesignation: true });
  assert.equal(deriveProfessionalDisplay(provider, 'Provider').displayName, 'Farhana Rahman');
  assert.equal(provider.id, 'demo-provider');
});

test('a single public name remains usable', () => {
  assert.equal(deriveProfessionalDisplay({ user_first_name: 'Nusrat' }).displayName, 'Nusrat');
  assert.equal(deriveProfessionalDisplay({ user_last_name: 'Karim' }).displayName, 'Karim');
});

test('existing nested operational names remain supported', () => {
  assert.equal(deriveProfessionalDisplay({ membership: { user: { first_name: 'Arif', last_name: 'Hasan' } } }).displayName, 'Arif Hasan');
});

test('a title-only fallback does not duplicate the designation', () => {
  assert.deepEqual(deriveProfessionalDisplay({ user_first_name: ' ', title: ' Technician ' }), {
    displayName: 'Technician', designation: 'Technician', showDesignation: false,
  });
});

test('missing names use safe caller fallbacks and never account email', () => {
  const provider = { user_email: 'private@example.test', user_first_name: '', user_last_name: '' };
  assert.equal(deriveProfessionalDisplay(provider, 'Provider #12345678').displayName, 'Provider #12345678');
  assert.equal(deriveProfessionalDisplay(provider, 'Provider').displayName, 'Provider');
  assert.equal(deriveProfessionalDisplay(null, 'Provider').displayName, 'Provider');
});
