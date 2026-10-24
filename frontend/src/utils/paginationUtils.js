/**
 * Pure calculation utilities for table and list pagination.
 * Compatible with QueueTurn's server-side list_response envelope
 * and client-side fallback normalization.
 */

export const DEFAULT_PAGE_SIZE = 20;

export const INITIAL_PAGINATION = Object.freeze({
  totalCount: 0,
  totalPages: 1,
  currentPage: 1,
  hasNext: false,
  hasPrevious: false,
  itemRange: { start: 0, end: 0, total: 0 },
});

/**
 * Calculates total pages given total items count and page size.
 * Returns at least 1 page.
 *
 * @param {number} totalCount - Total number of items
 * @param {number} [pageSize=DEFAULT_PAGE_SIZE] - Items per page
 * @returns {number}
 */
export function calculateTotalPages(totalCount, pageSize = DEFAULT_PAGE_SIZE) {
  const safeCount = Number.isFinite(totalCount) && totalCount > 0 ? totalCount : 0;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  if (safeCount === 0) return 1;
  return Math.ceil(safeCount / safeSize);
}

/**
 * Clamps a page number between 1 and totalPages.
 *
 * @param {number} page
 * @param {number} totalPages
 * @returns {number}
 */
export function clampPage(page, totalPages) {
  const safeTotal = Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1;
  const safePage = Number.isFinite(page) ? Math.floor(page) : 1;
  if (safePage < 1) return 1;
  if (safePage > safeTotal) return safeTotal;
  return safePage;
}

/**
 * Computes 1-indexed item display range for the current page.
 * Example: Page 1, Size 20, Total 45 -> { start: 1, end: 20, total: 45 }
 *
 * @param {number} page
 * @param {number} pageSize
 * @param {number} totalCount
 * @returns {{ start: number, end: number, total: number }}
 */
export function getPageItemRange(page, pageSize, totalCount) {
  const safeTotal = Number.isFinite(totalCount) && totalCount > 0 ? Math.floor(totalCount) : 0;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const totalPages = calculateTotalPages(safeTotal, safeSize);
  const safePage = clampPage(page, totalPages);

  if (safeTotal === 0) {
    return { start: 0, end: 0, total: 0 };
  }

  const start = (safePage - 1) * safeSize + 1;
  const end = Math.min(safePage * safeSize, safeTotal);
  return { start, end, total: safeTotal };
}

/**
 * Parses and normalizes pagination payload from backend API response.
 * Handles both the DRF list_response envelope { count, next, previous, results }
 * and legacy raw array [ ... ].
 *
 * @param {Object|Array} responseData
 * @param {number} requestedPage
 * @param {number} [pageSize=DEFAULT_PAGE_SIZE]
 * @returns {{
 *   items: Array,
 *   totalCount: number,
 *   currentPage: number,
 *   totalPages: number,
 *   hasNext: boolean,
 *   hasPrevious: boolean,
 *   itemRange: { start: number, end: number, total: number }
 * }}
 */
export function normalizePaginatedResponse(responseData, requestedPage = 1, pageSize = DEFAULT_PAGE_SIZE) {
  if (Array.isArray(responseData)) {
    const totalCount = responseData.length;
    const totalPages = calculateTotalPages(totalCount, pageSize);
    const currentPage = clampPage(requestedPage, totalPages);
    return {
      items: responseData,
      totalCount,
      currentPage,
      totalPages,
      hasNext: false,
      hasPrevious: false,
      itemRange: getPageItemRange(currentPage, pageSize, totalCount),
    };
  }

  const safeData = responseData && typeof responseData === 'object' ? responseData : {};
  const items = Array.isArray(safeData.results) ? safeData.results : [];
  const totalCount = Number.isFinite(safeData.count) && safeData.count >= 0 ? safeData.count : items.length;
  const totalPages = calculateTotalPages(totalCount, pageSize);
  const currentPage = clampPage(requestedPage, totalPages);

  // In backend list_response, 'next' and 'previous' are integer page numbers or null
  const hasNext = Boolean(safeData.next !== null && safeData.next !== undefined && safeData.next !== false);
  const hasPrevious = Boolean(safeData.previous !== null && safeData.previous !== undefined && safeData.previous !== false);

  return {
    items,
    totalCount,
    currentPage,
    totalPages,
    hasNext: hasNext || currentPage < totalPages,
    hasPrevious: hasPrevious || currentPage > 1,
    itemRange: getPageItemRange(currentPage, pageSize, totalCount),
  };
}

/**
 * Evaluates whether an asynchronous response should be discarded because
 * a newer request has started or the active organization tenant has changed.
 *
 * @param {number} requestId - Ticket of the completed request
 * @param {number} activeRequestId - Current active ticket
 * @param {string|number|null} orgIdAtRequest - Organization ID when request started
 * @param {string|number|null} currentOrgId - Currently active organization ID
 * @returns {boolean} True if response is stale or cross-tenant and must be discarded
 */
export function isStaleResponse(requestId, activeRequestId, orgIdAtRequest, currentOrgId) {
  if (requestId !== activeRequestId) return true;
  if (!orgIdAtRequest || !currentOrgId) return true;
  return String(orgIdAtRequest) !== String(currentOrgId);
}
