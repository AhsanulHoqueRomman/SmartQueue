import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecentlyViewedOrg, getRecentlyViewedOrgs } from './recentAndFavorites.js';
const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };

test('empty and malformed history never produces suggested organizations', () => {
  stored.clear();
  assert.deepEqual(getRecentlyViewedOrgs(), []);
  for (const value of ['bad JSON', '{}', '[null,{}]']) {
    stored.set('sq_recently_viewed_orgs', value);
    assert.deepEqual(getRecentlyViewedOrgs(), []);
  }
});
test('history preserves five most recent unique IDs in visit order', () => {
  stored.clear();
  for (let id = 1; id <= 7; id++) addRecentlyViewedOrg({ id, name: `Organization ${id}` });
  addRecentlyViewedOrg({ id: '5', name: 'Organization 5' });
  assert.deepEqual(getRecentlyViewedOrgs().map(row => String(row.id)), ['5', '7', '6', '4', '3']);
});
test('history does not fabricate ratings, counts or category and preserves zero', () => {
  stored.clear();
  addRecentlyViewedOrg({ id: 'a', name: 'A' });
  const missing = getRecentlyViewedOrgs()[0];
  for (const field of ['rating', 'reviews_count', 'services_count', 'category']) assert.equal(missing[field], null);
  addRecentlyViewedOrg({ id: 'b', name: 'B', rating: 0, reviews_count: 0, services_count: 0 });
  const zero = getRecentlyViewedOrgs()[0];
  for (const field of ['rating', 'reviews_count', 'services_count']) assert.equal(zero[field], 0);
});
