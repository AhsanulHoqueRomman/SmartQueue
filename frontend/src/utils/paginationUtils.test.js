import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTotalPages,
  clampPage,
  getPageItemRange,
  normalizePaginatedResponse,
  INITIAL_PAGINATION,
  isStaleResponse,
} from './paginationUtils.js';

test('INITIAL_PAGINATION exports standard initial pagination state', () => {
  assert.deepEqual(INITIAL_PAGINATION, {
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    hasNext: false,
    hasPrevious: false,
    itemRange: { start: 0, end: 0, total: 0 },
  });
});

test('calculateTotalPages calculates correct page counts', () => {
  assert.equal(calculateTotalPages(0, 20), 1);
  assert.equal(calculateTotalPages(1, 20), 1);
  assert.equal(calculateTotalPages(20, 20), 1);
  assert.equal(calculateTotalPages(21, 20), 2);
  assert.equal(calculateTotalPages(40, 20), 2);
  assert.equal(calculateTotalPages(41, 20), 3);
  assert.equal(calculateTotalPages(-5, 20), 1);
  assert.equal(calculateTotalPages(100, 0), 5); // default fallback to 20
  assert.equal(calculateTotalPages(100, -10), 5); // default fallback to 20
});

test('clampPage keeps page within [1, totalPages]', () => {
  assert.equal(clampPage(1, 5), 1);
  assert.equal(clampPage(3, 5), 3);
  assert.equal(clampPage(5, 5), 5);
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage(-2, 5), 1);
  assert.equal(clampPage(6, 5), 5);
  assert.equal(clampPage(999, 5), 5);
  assert.equal(clampPage('invalid', 5), 1);
  assert.equal(clampPage(3, 0), 1);
});

test('getPageItemRange calculates display item ranges', () => {
  // Empty
  assert.deepEqual(getPageItemRange(1, 20, 0), { start: 0, end: 0, total: 0 });

  // Single page with few items
  assert.deepEqual(getPageItemRange(1, 20, 7), { start: 1, end: 7, total: 7 });

  // First page of multi-page
  assert.deepEqual(getPageItemRange(1, 20, 45), { start: 1, end: 20, total: 45 });

  // Middle page
  assert.deepEqual(getPageItemRange(2, 20, 45), { start: 21, end: 40, total: 45 });

  // Last page
  assert.deepEqual(getPageItemRange(3, 20, 45), { start: 41, end: 45, total: 45 });

  // Out of bound requested page clamped to last page
  assert.deepEqual(getPageItemRange(10, 20, 45), { start: 41, end: 45, total: 45 });
});

test('normalizePaginatedResponse handles raw array', () => {
  const raw = [{ id: 1 }, { id: 2 }];
  const res = normalizePaginatedResponse(raw, 1, 20);
  assert.equal(res.items.length, 2);
  assert.equal(res.totalCount, 2);
  assert.equal(res.totalPages, 1);
  assert.equal(res.currentPage, 1);
  assert.equal(res.hasNext, false);
  assert.equal(res.hasPrevious, false);
  assert.deepEqual(res.itemRange, { start: 1, end: 2, total: 2 });
});

test('normalizePaginatedResponse handles backend DRF list_response envelope', () => {
  const envelope = {
    count: 45,
    next: 2,
    previous: null,
    results: Array.from({ length: 20 }, (_, i) => ({ id: i + 1 })),
  };

  const res = normalizePaginatedResponse(envelope, 1, 20);
  assert.equal(res.items.length, 20);
  assert.equal(res.totalCount, 45);
  assert.equal(res.totalPages, 3);
  assert.equal(res.currentPage, 1);
  assert.equal(res.hasNext, true);
  assert.equal(res.hasPrevious, false);
  assert.deepEqual(res.itemRange, { start: 1, end: 20, total: 45 });

  // Page 2
  const envelopePage2 = {
    count: 45,
    next: 3,
    previous: 1,
    results: Array.from({ length: 20 }, (_, i) => ({ id: i + 21 })),
  };
  const res2 = normalizePaginatedResponse(envelopePage2, 2, 20);
  assert.equal(res2.currentPage, 2);
  assert.equal(res2.hasNext, true);
  assert.equal(res2.hasPrevious, true);
  assert.deepEqual(res2.itemRange, { start: 21, end: 40, total: 45 });

  // Page 3 (last page)
  const envelopePage3 = {
    count: 45,
    next: null,
    previous: 2,
    results: Array.from({ length: 5 }, (_, i) => ({ id: i + 41 })),
  };
  const res3 = normalizePaginatedResponse(envelopePage3, 3, 20);
  assert.equal(res3.currentPage, 3);
  assert.equal(res3.hasNext, false);
  assert.equal(res3.hasPrevious, true);
  assert.deepEqual(res3.itemRange, { start: 41, end: 45, total: 45 });
});

test('normalizePaginatedResponse handles null and empty envelope safely', () => {
  const resNull = normalizePaginatedResponse(null, 1, 20);
  assert.deepEqual(resNull.items, []);
  assert.equal(resNull.totalCount, 0);
  assert.equal(resNull.totalPages, 1);
  assert.equal(resNull.currentPage, 1);
  assert.equal(resNull.hasNext, false);
  assert.equal(resNull.hasPrevious, false);
  assert.deepEqual(resNull.itemRange, { start: 0, end: 0, total: 0 });

  const resEmptyObj = normalizePaginatedResponse({}, 1, 20);
  assert.deepEqual(resEmptyObj.items, []);
  assert.equal(resEmptyObj.totalCount, 0);
});

test('isStaleResponse rejects out-of-order, superseded, and cross-tenant responses', () => {
  // Valid match: same ticket, same tenant
  assert.equal(isStaleResponse(1, 1, 'org-1', 'org-1'), false);
  assert.equal(isStaleResponse(5, 5, 10, 10), false);

  // Stale ticket: superseded by newer query (out-of-order search/page change)
  assert.equal(isStaleResponse(1, 2, 'org-1', 'org-1'), true);

  // Cross-tenant: tenant switched while request in flight
  assert.equal(isStaleResponse(1, 1, 'org-1', 'org-2'), true);

  // Rapid tenant switch (A -> B -> A) where older ticket finishes during return to A
  assert.equal(isStaleResponse(1, 3, 'org-1', 'org-1'), true);

  // Missing or cleared active tenant
  assert.equal(isStaleResponse(1, 1, 'org-1', null), true);
  assert.equal(isStaleResponse(1, 1, null, 'org-1'), true);
});
