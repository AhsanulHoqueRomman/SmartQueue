import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import reviewService from '../../services/reviewService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import '../../styles/ProviderReviews.css';

/**
 * Format ISO date string into human-readable date using Asia/Dhaka timezone.
 * Returns null if string is missing or invalid.
 */
const formatReviewDate = (isoString) => {
  if (!isoString) return null;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return parsed.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
};

export function ProviderReviewsPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  // ---------------------------------------------------------------------------
  // Filter & Pagination State
  // ---------------------------------------------------------------------------
  const [ratingFilter, setRatingFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [ordering, setOrdering] = useState('-created_at');
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------------------------
  // Data & Lifecycle State
  // ---------------------------------------------------------------------------
  const [reviewsData, setReviewsData] = useState({
    orgId: null,
    userId: null,
    items: [],
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    hasNext: false,
    hasPrevious: false,
    itemRange: { start: 0, end: 0, total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Concurrency, Tenant Context & Mount Protection Refs
  const requestTicketRef = useRef(0);
  const activeContextRef = useRef({
    orgId: currentOrg?.id || null,
    userId: user?.id || null,
  });
  const isMountedRef = useRef(true);

  // Mount/Unmount lifecycle tracker
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Synchronize tenant & authenticated identity changes (Strict Account & Org Isolation)
  useEffect(() => {
    const currentOrgId = currentOrg?.id || null;
    const currentUserId = user?.id || null;

    if (
      activeContextRef.current.orgId !== currentOrgId ||
      activeContextRef.current.userId !== currentUserId
    ) {
      activeContextRef.current = {
        orgId: currentOrgId,
        userId: currentUserId,
      };
      requestTicketRef.current += 1;
      setRatingFilter('');
      setSearchInput('');
      setAppliedSearch('');
      setOrdering('-created_at');
      setPage(1);
      setError(null);
      setReviewsData({
        orgId: null,
        userId: null,
        items: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      });
    }
  }, [currentOrg?.id, user?.id]);

  // ---------------------------------------------------------------------------
  // Data Fetching with Concurrency & Tenant Scoping
  // ---------------------------------------------------------------------------
  const fetchReviews = useCallback(async () => {
    if (!currentOrg?.id || !user?.id) {
      setLoading(false);
      setReviewsData({
        orgId: null,
        userId: null,
        items: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      });
      return;
    }

    const ticket = ++requestTicketRef.current;
    const targetOrgId = currentOrg.id;
    const targetUserId = user.id;

    setLoading(true);
    setError(null);

    try {
      const params = {
        page,
        page_size: DEFAULT_PAGE_SIZE,
      };

      if (ratingFilter) {
        params.rating = ratingFilter;
      }

      if (appliedSearch) {
        params.search = appliedSearch;
      }

      if (ordering) {
        params.ordering = ordering;
      }

      // Backend automatically scopes results to the authenticated provider's own profile
      // when the active organization membership role is PROVIDER.
      const response = await reviewService.getReviews(targetOrgId, params);

      // Discard stale responses if ticket superseded, unmounted, or context switched
      if (
        !isMountedRef.current ||
        ticket !== requestTicketRef.current ||
        activeContextRef.current.orgId !== targetOrgId ||
        activeContextRef.current.userId !== targetUserId
      ) {
        return;
      }

      const normalized = normalizePaginatedResponse(response, page, DEFAULT_PAGE_SIZE);
      setReviewsData({
        ...normalized,
        orgId: targetOrgId,
        userId: targetUserId,
      });
    } catch (err) {
      if (
        !isMountedRef.current ||
        ticket !== requestTicketRef.current ||
        activeContextRef.current.orgId !== targetOrgId ||
        activeContextRef.current.userId !== targetUserId
      ) {
        return;
      }

      // Safe recovery for out-of-range pagination: if page > 1 returns EmptyPage 404, reset to page 1
      const isEmptyPage =
        err.response?.status === 404 &&
        err.response?.data?.detail === 'That page contains no results.';

      if (isEmptyPage && page > 1) {
        setPage(1);
        return;
      }

      setError(err.response?.data?.detail || 'Failed to load patient reviews. Please try again.');
    } finally {
      if (
        isMountedRef.current &&
        ticket === requestTicketRef.current &&
        activeContextRef.current.orgId === targetOrgId &&
        activeContextRef.current.userId === targetUserId
      ) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id, user?.id, page, ratingFilter, appliedSearch, ordering]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ---------------------------------------------------------------------------
  // Filter Event Handlers
  // ---------------------------------------------------------------------------
  const handleRatingSelect = (selectedRating) => {
    setRatingFilter(selectedRating);
    setPage(1);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setRatingFilter('');
    setSearchInput('');
    setAppliedSearch('');
    setOrdering('-created_at');
    setPage(1);
  };

  const handleOrderingChange = (e) => {
    setOrdering(e.target.value);
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isFiltered = Boolean(ratingFilter || appliedSearch);

  // Render-time ownership & session isolation:
  // Data is considered valid for rendering only if the user is authenticated,
  // an organization is selected, and the loaded dataset's orgId and userId match.
  const isContextMatching = Boolean(
    currentOrg?.id &&
    user?.id &&
    reviewsData.orgId === currentOrg.id &&
    reviewsData.userId === user.id
  );
  const displayTotalCount = isContextMatching ? reviewsData.totalCount : 0;

  if (!currentOrg) {
    return (
      <div className="provider-reviews animate-page-entrance">
        <EmptyState
          title="No Organization Selected"
          message="Select an organization from the top navigation to view your patient reviews."
        />
      </div>
    );
  }

  return (
    <div className="provider-reviews animate-page-entrance">
      {/* Editorial Header */}
      <header className="provider-reviews__header">
        <div className="provider-reviews__header-info">
          <div className="provider-reviews__eyebrow">
            <span>★ Patient Reviews & Ratings</span>
          </div>
          <h1 className="provider-reviews__title">Patient Reviews</h1>
          <p className="provider-reviews__subtitle">
            Authentic ratings and feedback submitted by patients following completed consultations at{' '}
            <strong className="provider-reviews__clinic-highlight">
              {currentOrg?.name || 'this healthcare clinic'}
            </strong>.
          </p>
        </div>

        <div className="provider-reviews__header-actions">
          <button
            type="button"
            className="provider-reviews__btn-refresh"
            onClick={fetchReviews}
            disabled={loading}
            title="Refresh patient reviews"
            aria-label="Refresh patient reviews"
          >
            <span>🔄</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Trustworthy Summary Card (Owner Decision D1 — No Fabricated 5.0 Fallback) */}
      <section className="provider-reviews__summary" aria-label="Review metrics summary">
        {!isFiltered && displayTotalCount === 0 && !loading && isContextMatching ? (
          <div className="provider-reviews__metric-card provider-reviews__metric-card--zero">
            <div className="provider-reviews__metric-zero-title">No reviews yet</div>
            <p className="provider-reviews__metric-zero-desc">
              Patient ratings and written feedback submitted after completed consultations will appear here once received.
            </p>
          </div>
        ) : (
          <>
            <div className="provider-reviews__metric-card">
              <span className="provider-reviews__metric-label">
                {isFiltered ? 'Matching Reviews' : 'Total Patient Reviews'}
              </span>
              <span className="provider-reviews__metric-value">{displayTotalCount}</span>
              <span className="provider-reviews__metric-desc">
                {isFiltered
                  ? 'Reviews matching active search and filters'
                  : `Lifetime reviews at ${currentOrg?.name || 'this clinic'}`}
              </span>
            </div>

            <div className="provider-reviews__metric-card">
              <span className="provider-reviews__metric-label">Eligibility Requirement</span>
              <span className="provider-reviews__metric-value" style={{ fontSize: '1.25rem' }}>
                Completed Visits Only
              </span>
              <span className="provider-reviews__metric-desc">
                Reviews are presence-gated and strictly one per appointment
              </span>
            </div>

            <div className="provider-reviews__metric-card">
              <span className="provider-reviews__metric-label">Ledger Integrity</span>
              <span className="provider-reviews__metric-value" style={{ fontSize: '1.25rem' }}>
                Read-Only Feed
              </span>
              <span className="provider-reviews__metric-desc">
                Permanent patient feedback submitted directly via patient portal
              </span>
            </div>
          </>
        )}
      </section>

      {/* Filter & Search Toolbar */}
      <section className="provider-reviews__toolbar" aria-label="Review search and filter controls">
        <div className="provider-reviews__toolbar-top">
          {/* Star Rating Pills */}
          <div className="provider-reviews__rating-pills" role="group" aria-label="Filter by star rating">
            <button
              type="button"
              className={`provider-reviews__pill-btn ${ratingFilter === '' ? 'provider-reviews__pill-btn--active' : ''}`}
              onClick={() => handleRatingSelect('')}
              disabled={loading}
            >
              All Ratings
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                type="button"
                className={`provider-reviews__pill-btn ${ratingFilter === String(star) ? 'provider-reviews__pill-btn--active' : ''}`}
                onClick={() => handleRatingSelect(String(star))}
                disabled={loading}
              >
                {star} ★
              </button>
            ))}
          </div>

          {/* Search Form (Verified Backend: searches comment, customer email, provider email) */}
          <form onSubmit={handleSearchSubmit} className="provider-reviews__search-form" role="search">
            <div className="provider-reviews__search-wrap">
              <span className="provider-reviews__search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search reviews by comment..."
                className="provider-reviews__search-input"
                aria-label="Search reviews by comment text"
                disabled={loading}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="provider-reviews__search-clear"
                  aria-label="Clear search input"
                >
                  &times;
                </button>
              )}
            </div>
            <button
              type="submit"
              className="provider-reviews__btn-search"
              disabled={loading || !searchInput.trim()}
            >
              Search
            </button>
          </form>
        </div>

        <div className="provider-reviews__toolbar-bottom">
          <div className="provider-reviews__stats-summary">
            <span>
              Showing <strong className="provider-reviews__stats-badge">{displayTotalCount}</strong>{' '}
              {displayTotalCount === 1 ? 'review' : 'reviews'}
            </span>
            {isFiltered && (
              <>
                <span>• Filtered</span>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="provider-reviews__clear-btn"
                >
                  Reset filters
                </button>
              </>
            )}
          </div>

          <div className="provider-reviews__sort-wrap">
            <label htmlFor="provider-reviews-sort">Sort by:</label>
            <select
              id="provider-reviews-sort"
              value={ordering}
              onChange={handleOrderingChange}
              disabled={loading}
              className="provider-reviews__sort-select"
            >
              <option value="-created_at">Newest First</option>
              <option value="created_at">Oldest First</option>
              <option value="-rating">Highest Rating</option>
              <option value="rating">Lowest Rating</option>
            </select>
          </div>
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div role="alert" className="provider-reviews__alert provider-reviews__alert--error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Review List */}
      {error ? (
        <EmptyState
          title="Failed to Load Reviews"
          message={error}
          actionText="Try Again"
          onAction={fetchReviews}
        />
      ) : loading || !isContextMatching ? (
        <LoadingState message="Fetching patient feedback and ratings..." />
      ) : reviewsData.items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No Matching Reviews Found"
            message="No patient reviews match your active rating or search criteria."
            actionText="Clear All Filters"
            onAction={handleClearAllFilters}
          />
        ) : (
          <EmptyState
            title="No Patient Reviews Yet"
            message="Feedback submitted by patients after completed consultations will appear here."
          />
        )
      ) : (
        <>
          <section className="provider-reviews__feed" aria-label="Patient review history list">
            {reviewsData.items.map((rev) => {
              const formattedDate = formatReviewDate(rev.created_at);
              // Privacy-preserving patient display: neutral label without leaking email usernames or personal identifiers
              const patientDisplayName = 'Patient';

              return (
                <article key={rev.id} className="provider-reviews__card">
                  <div className="provider-reviews__card-header">
                    <div className="provider-reviews__patient-group">
                      <h2 className="provider-reviews__patient-name">
                        {patientDisplayName}
                      </h2>
                      {rev.service_name && (
                        <div className="provider-reviews__service-tag">
                          <span>Consultation:</span>
                          <strong className="provider-reviews__service-strong">
                            {rev.service_name}
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className="provider-reviews__rating-block">
                      <div
                        className="provider-reviews__stars-row"
                        aria-label={`Rating: ${rev.rating} out of 5 stars`}
                      >
                        <span className="provider-reviews__stars" aria-hidden="true">
                          {'★'.repeat(rev.rating)}
                          {'☆'.repeat(5 - rev.rating)}
                        </span>
                        <span className="provider-reviews__rating-badge">
                          {rev.rating}.0
                        </span>
                      </div>
                      {formattedDate ? (
                        <time className="provider-reviews__date" dateTime={rev.created_at}>
                          Reviewed on {formattedDate}
                        </time>
                      ) : (
                        <span className="provider-reviews__date">
                          Review date unavailable
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="provider-reviews__comment-box">
                    {rev.comment?.trim() ? (
                      <p className="provider-reviews__comment-text">
                        "{rev.comment.trim()}"
                      </p>
                    ) : (
                      <p className="provider-reviews__comment-empty">
                        Rating submitted without a written comment.
                      </p>
                    )}
                  </div>

                  <footer className="provider-reviews__card-footer">
                    <span className="provider-reviews__verified-badge">
                      <span>✓</span>
                      <span>Completed Visit Review</span>
                    </span>
                    {rev.appointment_id && (
                      <span className="provider-reviews__appointment-ref">
                        Ref: {String(rev.appointment_id).slice(0, 8)}
                      </span>
                    )}
                  </footer>
                </article>
              );
            })}
          </section>

          {/* Pagination Navigation */}
          {reviewsData.totalPages > 1 && (
            <nav className="provider-reviews__pagination" aria-label="Review history pagination">
              <div className="provider-reviews__pagination-info">
                Showing {reviewsData.itemRange.start}–{reviewsData.itemRange.end} of {reviewsData.totalCount} entries
              </div>

              <div className="provider-reviews__pagination-controls">
                <button
                  type="button"
                  className="provider-reviews__page-btn"
                  onClick={() => handlePageChange(reviewsData.currentPage - 1)}
                  disabled={!reviewsData.hasPrevious || loading}
                  aria-label="Go to previous page"
                >
                  ← Previous
                </button>

                {Array.from({ length: reviewsData.totalPages }, (_, i) => i + 1)
                  .filter((pNum) => {
                    // Show current page, first, last, and immediate neighbors
                    return (
                      pNum === 1 ||
                      pNum === reviewsData.totalPages ||
                      Math.abs(pNum - reviewsData.currentPage) <= 1
                    );
                  })
                  .map((pNum) => (
                    <button
                      key={pNum}
                      type="button"
                      className={`provider-reviews__page-btn ${pNum === reviewsData.currentPage ? 'provider-reviews__page-btn--active' : ''}`}
                      onClick={() => handlePageChange(pNum)}
                      disabled={loading}
                      aria-current={pNum === reviewsData.currentPage ? 'page' : undefined}
                    >
                      {pNum}
                    </button>
                  ))}

                <button
                  type="button"
                  className="provider-reviews__page-btn"
                  onClick={() => handlePageChange(reviewsData.currentPage + 1)}
                  disabled={!reviewsData.hasNext || loading}
                  aria-label="Go to next page"
                >
                  Next →
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export default ProviderReviewsPage;
