import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import reviewService from '../../services/reviewService';
import managerService from '../../services/managerService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import '../../styles/ManagerReviews.css';

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

export function ManagerReviewsPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  // ---------------------------------------------------------------------------
  // 1. Authoritative Organization Analytics Scorecard State (Owner Decision D2)
  // ---------------------------------------------------------------------------
  const [analyticsData, setAnalyticsData] = useState({
    orgId: null,
    userId: null,
    averageRating: null,
    totalReviews: 0,
    ratingDistribution: {
      star_5: 0,
      star_4: 0,
      star_3: 0,
      star_2: 0,
      star_1: 0,
    },
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);

  // ---------------------------------------------------------------------------
  // 2. Filter, Search & Pagination State for Review Feed
  // ---------------------------------------------------------------------------
  const [ratingFilter, setRatingFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [ordering, setOrdering] = useState('-created_at');
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------------------------
  // 3. Organization Review Feed State
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
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState(null);

  // ---------------------------------------------------------------------------
  // 4. Concurrency, Tenant Context & Lifecycle Tracking Refs
  // ---------------------------------------------------------------------------
  const analyticsTicketRef = useRef(0);
  const reviewsTicketRef = useRef(0);
  const activeContextRef = useRef({
    orgId: currentOrg?.id || null,
    userId: user?.id || null,
  });
  const isMountedRef = useRef(true);

  // Mount/Unmount tracker
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Strict tenant & account context boundary check
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

      // Invalidate all pending asynchronous tickets
      analyticsTicketRef.current += 1;
      reviewsTicketRef.current += 1;

      // Reset controls
      setRatingFilter('');
      setSearchInput('');
      setAppliedSearch('');
      setOrdering('-created_at');
      setPage(1);

      // Reset states
      setAnalyticsError(null);
      setReviewsError(null);
      setAnalyticsData({
        orgId: null,
        userId: null,
        averageRating: null,
        totalReviews: 0,
        ratingDistribution: {
          star_5: 0,
          star_4: 0,
          star_3: 0,
          star_2: 0,
          star_1: 0,
        },
      });
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
  // 5. Fetch Authoritative Analytics Summary (Organization-Wide Lifetime Metrics)
  // ---------------------------------------------------------------------------
  const fetchAnalytics = useCallback(async () => {
    if (!currentOrg?.id || !user?.id) {
      setAnalyticsLoading(false);
      return;
    }

    const ticket = ++analyticsTicketRef.current;
    const targetOrgId = currentOrg.id;
    const targetUserId = user.id;

    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      // Calling getAnalyticsSummary without date parameters evaluates organization-wide lifetime totals
      const data = await managerService.getAnalyticsSummary(targetOrgId);

      if (!isMountedRef.current || ticket !== analyticsTicketRef.current) return;
      if (
        activeContextRef.current.orgId !== targetOrgId ||
        activeContextRef.current.userId !== targetUserId
      ) return;

      const summary = data?.summary || {};
      const avgRating = summary.average_rating != null ? Number(summary.average_rating) : null;
      const totalReviews = Number.isFinite(summary.total_reviews) && summary.total_reviews >= 0
        ? summary.total_reviews
        : 0;

      const dist = data?.rating_distribution || {};
      const ratingDistribution = {
        star_5: Number.isFinite(dist.star_5) ? dist.star_5 : 0,
        star_4: Number.isFinite(dist.star_4) ? dist.star_4 : 0,
        star_3: Number.isFinite(dist.star_3) ? dist.star_3 : 0,
        star_2: Number.isFinite(dist.star_2) ? dist.star_2 : 0,
        star_1: Number.isFinite(dist.star_1) ? dist.star_1 : 0,
      };

      setAnalyticsData({
        orgId: targetOrgId,
        userId: targetUserId,
        averageRating: avgRating,
        totalReviews,
        ratingDistribution,
      });
    } catch (err) {
      if (!isMountedRef.current || ticket !== analyticsTicketRef.current) return;
      if (
        activeContextRef.current.orgId !== targetOrgId ||
        activeContextRef.current.userId !== targetUserId
      ) return;

      setAnalyticsError('Authoritative organization rating metrics are currently unavailable.');
    } finally {
      if (isMountedRef.current && ticket === analyticsTicketRef.current) {
        setAnalyticsLoading(false);
      }
    }
  }, [currentOrg?.id, user?.id]);

  // ---------------------------------------------------------------------------
  // 6. Fetch Filtered, Scoped Review Feed with Server-Side Pagination
  // ---------------------------------------------------------------------------
  const fetchReviews = useCallback(async () => {
    if (!currentOrg?.id || !user?.id) {
      setReviewsLoading(false);
      return;
    }

    const ticket = ++reviewsTicketRef.current;
    const targetOrgId = currentOrg.id;
    const targetUserId = user.id;
    const targetPage = page;

    setReviewsLoading(true);
    setReviewsError(null);

    const params = {
      page: targetPage,
      page_size: DEFAULT_PAGE_SIZE,
      ordering,
    };

    if (ratingFilter) {
      const parsedRating = Number(ratingFilter);
      if (Number.isInteger(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
        params.rating = parsedRating;
      }
    }

    if (appliedSearch.trim()) {
      params.search = appliedSearch.trim();
    }

    try {
      const data = await reviewService.getReviews(targetOrgId, params);

      if (!isMountedRef.current || ticket !== reviewsTicketRef.current) return;
      if (
        activeContextRef.current.orgId !== targetOrgId ||
        activeContextRef.current.userId !== targetUserId
      ) return;

      const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);

      setReviewsData({
        orgId: targetOrgId,
        userId: targetUserId,
        ...normalized,
      });
    } catch (err) {
      if (!isMountedRef.current || ticket !== reviewsTicketRef.current) return;
      if (
        activeContextRef.current.orgId !== targetOrgId ||
        activeContextRef.current.userId !== targetUserId
      ) return;

      // Out-of-range pagination recovery: only reset to page 1 if exact EmptyPage message matches
      const isOutOfRange404 =
        err.response?.status === 404 &&
        err.response?.data?.detail === 'That page contains no results.' &&
        targetPage > 1;

      if (isOutOfRange404) {
        setPage(1);
        return;
      }

      setReviewsError('Unable to load patient reviews for this organization.');
      setReviewsData({
        orgId: targetOrgId,
        userId: targetUserId,
        items: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      });
    } finally {
      if (isMountedRef.current && ticket === reviewsTicketRef.current) {
        setReviewsLoading(false);
      }
    }
  }, [currentOrg?.id, user?.id, page, ratingFilter, appliedSearch, ordering]);

  // Trigger data fetching on relevant dependency updates
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ---------------------------------------------------------------------------
  // 7. Event Handlers
  // ---------------------------------------------------------------------------
  const handleRatingFilter = (value) => {
    const nextVal = ratingFilter === value ? '' : value;
    setRatingFilter(nextVal);
    setPage(1);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleSearchClear = () => {
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
  };

  const handleClearFilters = () => {
    setRatingFilter('');
    setSearchInput('');
    setAppliedSearch('');
    setOrdering('-created_at');
    setPage(1);
  };

  const handleRefreshAll = () => {
    fetchAnalytics();
    fetchReviews();
  };

  // ---------------------------------------------------------------------------
  // 8. Synchronous Render-Time Context Protection
  // ---------------------------------------------------------------------------
  if (!currentOrg) {
    return (
      <div className="manager-reviews">
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the workspace header to view patient feedback."
        />
      </div>
    );
  }

  const isAnalyticsContextMatching =
    analyticsData.orgId === currentOrg.id && analyticsData.userId === user?.id;
  const isReviewsContextMatching =
    reviewsData.orgId === currentOrg.id && reviewsData.userId === user?.id;

  const currentAnalytics = isAnalyticsContextMatching
    ? analyticsData
    : {
        averageRating: null,
        totalReviews: 0,
        ratingDistribution: { star_5: 0, star_4: 0, star_3: 0, star_2: 0, star_1: 0 },
      };

  const currentReviews = isReviewsContextMatching
    ? reviewsData
    : {
        items: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      };

  const isFilterActive = Boolean(ratingFilter || appliedSearch);

  return (
    <div className="manager-reviews animate-page-entrance">
      {/* --------------------------------------------------------------------
         1. Editorial Page Header
         -------------------------------------------------------------------- */}
      <header className="manager-reviews__header">
        <div className="manager-reviews__header-info">
          <span className="manager-reviews__eyebrow">
            ★ Management & Patient Feedback
          </span>
          <h1 className="manager-reviews__title">Patient Reviews</h1>
          <p className="manager-reviews__subtitle">
            Organization-wide patient feedback overview and care ratings for{' '}
            <strong className="manager-reviews__clinic-highlight">{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="manager-reviews__header-actions">
          <button
            type="button"
            className="manager-reviews__btn-refresh"
            onClick={handleRefreshAll}
            disabled={analyticsLoading || reviewsLoading}
            aria-label="Refresh ratings and reviews"
          >
            <span aria-hidden="true">{analyticsLoading || reviewsLoading ? '⏳' : '🔄'}</span>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* --------------------------------------------------------------------
         2. Authoritative Organization Rating Scorecard (Owner Decision D2)
         -------------------------------------------------------------------- */}
      <section className="manager-reviews__scorecard-section" aria-labelledby="scorecard-heading">
        <div className="manager-reviews__scorecard-header">
          <h2 id="scorecard-heading" className="manager-reviews__scorecard-title">
            <span>Authoritative Rating Analytics</span>
          </h2>
          <span className="manager-reviews__scorecard-note">
            Comprehensive lifetime organization statistics
          </span>
        </div>

        {analyticsError ? (
          <div className="manager-reviews__alert manager-reviews__alert--warning" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{analyticsError} Independent review feed remains available below.</span>
          </div>
        ) : (
          <div className="manager-reviews__scorecard-grid">
            {/* Rating Average Card */}
            <article className="manager-reviews__card-rating">
              <span className="manager-reviews__rating-label">Overall Average Rating</span>
              <div className="manager-reviews__rating-big">
                <span aria-hidden="true">★</span>
                <span>
                  {currentAnalytics.totalReviews > 0 && currentAnalytics.averageRating != null
                    ? currentAnalytics.averageRating.toFixed(1)
                    : '—'}
                </span>
              </div>
              <span className="manager-reviews__rating-sub">
                {currentAnalytics.totalReviews > 0
                  ? `Based on ${currentAnalytics.totalReviews} total organization review${
                      currentAnalytics.totalReviews === 1 ? '' : 's'
                    }`
                  : 'No ratings submitted yet for this organization'}
              </span>
            </article>

            {/* Rating Distribution Card */}
            <article className="manager-reviews__card-dist">
              <div className="manager-reviews__dist-header">
                Rating Distribution ({currentAnalytics.totalReviews} Total Reviews)
              </div>
              <div className="manager-reviews__dist-rows">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = currentAnalytics.ratingDistribution[`star_${star}`] || 0;
                  const pct =
                    currentAnalytics.totalReviews > 0
                      ? (count / currentAnalytics.totalReviews) * 100
                      : 0;

                  return (
                    <div key={star} className="manager-reviews__dist-row">
                      <span className="manager-reviews__dist-star-label">
                        <span>{star}</span>
                        <span aria-hidden="true">★</span>
                      </span>
                      <div
                        className="manager-reviews__bar-track"
                        role="progressbar"
                        aria-valuenow={count}
                        aria-valuemin="0"
                        aria-valuemax={currentAnalytics.totalReviews}
                        aria-label={`${star} star rating count`}
                      >
                        <div
                          className="manager-reviews__bar-fill"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                      <span className="manager-reviews__dist-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------
         3. Search & Filter Toolbar
         -------------------------------------------------------------------- */}
      <section className="manager-reviews__toolbar" aria-label="Review Filters and Search">
        <div className="manager-reviews__toolbar-top">
          {/* Star Filter Pills */}
          <div className="manager-reviews__rating-pills" role="group" aria-label="Filter reviews by star rating">
            <button
              type="button"
              className={`manager-reviews__pill-btn ${ratingFilter === '' ? 'manager-reviews__pill-btn--active' : ''}`}
              onClick={() => handleRatingFilter('')}
              disabled={reviewsLoading && !isReviewsContextMatching}
            >
              All Stars
            </button>
            {['5', '4', '3', '2', '1'].map((star) => (
              <button
                key={star}
                type="button"
                className={`manager-reviews__pill-btn ${ratingFilter === star ? 'manager-reviews__pill-btn--active' : ''}`}
                onClick={() => handleRatingFilter(star)}
                disabled={reviewsLoading && !isReviewsContextMatching}
              >
                {star} ★
              </button>
            ))}
          </div>

          {/* Search Form */}
          <form className="manager-reviews__search-form" onSubmit={handleSearchSubmit}>
            <div className="manager-reviews__search-wrap">
              <span className="manager-reviews__search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                className="manager-reviews__search-input"
                placeholder="Search comments or references..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search reviews"
              />
              {searchInput && (
                <button
                  type="button"
                  className="manager-reviews__search-clear"
                  onClick={handleSearchClear}
                  aria-label="Clear search input"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="submit"
              className="manager-reviews__btn-search"
              disabled={reviewsLoading && !isReviewsContextMatching}
            >
              Search
            </button>
          </form>
        </div>

        <div className="manager-reviews__toolbar-bottom">
          <div className="manager-reviews__stats-summary">
            {reviewsLoading ? (
              <span>Updating review feed...</span>
            ) : (
              <>
                <span>
                  Showing{' '}
                  <span className="manager-reviews__stats-badge">
                    {currentReviews.itemRange.start}–{currentReviews.itemRange.end}
                  </span>{' '}
                  of{' '}
                  <span className="manager-reviews__stats-badge">
                    {currentReviews.totalCount}
                  </span>{' '}
                  matching review{currentReviews.totalCount === 1 ? '' : 's'}
                </span>
                {isFilterActive && (
                  <button
                    type="button"
                    className="manager-reviews__clear-btn"
                    onClick={handleClearFilters}
                  >
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>

          {/* Sort Selector */}
          <div className="manager-reviews__sort-wrap">
            <label htmlFor="review-sort-select">Sort by:</label>
            <select
              id="review-sort-select"
              className="manager-reviews__sort-select"
              value={ordering}
              onChange={(e) => {
                setOrdering(e.target.value);
                setPage(1);
              }}
              disabled={reviewsLoading && !isReviewsContextMatching}
            >
              <option value="-created_at">Newest First</option>
              <option value="created_at">Oldest First</option>
              <option value="-rating">Highest Rating</option>
              <option value="rating">Lowest Rating</option>
            </select>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
         4. Review Feed & States
         -------------------------------------------------------------------- */}
      <section className="manager-reviews__feed-container" aria-label="Patient Reviews Feed">
        {reviewsLoading && !isReviewsContextMatching ? (
          <LoadingState message="Loading organization reviews..." />
        ) : reviewsError ? (
          <EmptyState
            title="Unable to Load Reviews"
            message={reviewsError}
            actionText="Try Again"
            onAction={fetchReviews}
          />
        ) : currentReviews.items.length === 0 ? (
          <EmptyState
            title={isFilterActive ? 'No Matching Reviews' : 'No Reviews Submitted Yet'}
            message={
              isFilterActive
                ? 'No patient reviews match your selected star rating or search criteria.'
                : 'Patients will leave star ratings and comments here after completing appointments at this organization.'
            }
            actionText={isFilterActive ? 'Reset Filters' : undefined}
            onAction={isFilterActive ? handleClearFilters : undefined}
          />
        ) : (
          <div className="manager-reviews__feed">
            {currentReviews.items.map((rev) => {
              const formattedDate = formatReviewDate(rev.created_at);
              const starCount = Math.round(rev.rating) || 5;

              return (
                <article key={rev.id} className="manager-reviews__card">
                  <header className="manager-reviews__card-header">
                    <div className="manager-reviews__patient-group">
                      {/* Privacy-Preserving Patient Label (Owner/Audit Instruction) */}
                      <h3 className="manager-reviews__patient-name">Patient</h3>
                      <div className="manager-reviews__context-tags">
                        {rev.service_name && (
                          <span className="manager-reviews__context-tag">
                            <span>💼 Service:</span>
                            <strong className="manager-reviews__context-strong">
                              {rev.service_name}
                            </strong>
                          </span>
                        )}
                        {rev.provider_name && (
                          <span className="manager-reviews__context-tag">
                            <span>🩺 Provider:</span>
                            <strong className="manager-reviews__context-strong">
                              {rev.provider_name}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="manager-reviews__rating-block">
                      <div className="manager-reviews__stars-row">
                        <span
                          className="manager-reviews__stars"
                          aria-label={`${rev.rating} out of 5 stars`}
                        >
                          {'★'.repeat(starCount)}
                          {'☆'.repeat(5 - starCount)}
                        </span>
                        <span className="manager-reviews__rating-badge">
                          {Number(rev.rating).toFixed(1)}
                        </span>
                      </div>
                      <span className="manager-reviews__date">
                        Reviewed on{' '}
                        {formattedDate ? (
                          <time dateTime={rev.created_at}>{formattedDate}</time>
                        ) : (
                          <span>Date unknown</span>
                        )}
                      </span>
                    </div>
                  </header>

                  {/* Feedback Written Comment */}
                  <div className="manager-reviews__comment-box">
                    {rev.comment && rev.comment.trim() ? (
                      <p className="manager-reviews__comment-text">"{rev.comment.trim()}"</p>
                    ) : (
                      <p className="manager-reviews__comment-empty">
                        Rating submitted without a written comment.
                      </p>
                    )}
                  </div>

                  {/* Card Footer: Strictly Read-Only Context and Appointment Reference */}
                  <footer className="manager-reviews__card-footer">
                    <span className="manager-reviews__verified-badge">
                      <span aria-hidden="true">✓</span>
                      <span>Completed Visit Review</span>
                    </span>
                    {rev.appointment_id && (
                      <span
                        className="manager-reviews__appointment-ref"
                        title={`Appointment UUID: ${rev.appointment_id}`}
                      >
                        Ref: {rev.appointment_id.slice(0, 8)}
                      </span>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------
         5. Server-Side Pagination Controls
         -------------------------------------------------------------------- */}
      {!reviewsLoading && currentReviews.totalPages > 1 && (
        <nav
          className="manager-reviews__pagination"
          aria-label="Manager reviews pagination navigation"
        >
          <div className="manager-reviews__pagination-info">
            Page {currentReviews.currentPage} of {currentReviews.totalPages} (
            {currentReviews.totalCount} total reviews)
          </div>

          <div className="manager-reviews__pagination-controls">
            <button
              type="button"
              className="manager-reviews__page-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!currentReviews.hasPrevious || reviewsLoading}
              aria-label="Previous page"
            >
              Previous
            </button>

            {Array.from({ length: currentReviews.totalPages }, (_, i) => i + 1)
              .filter((pageNum) => {
                // Show first, last, and window around current page
                return (
                  pageNum === 1 ||
                  pageNum === currentReviews.totalPages ||
                  Math.abs(pageNum - currentReviews.currentPage) <= 1
                );
              })
              .map((pageNum, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev && pageNum - prev > 1;

                return (
                  <React.Fragment key={pageNum}>
                    {showEllipsis && (
                      <span className="manager-reviews__page-ellipsis" aria-hidden="true">
                        …
                      </span>
                    )}
                    <button
                      type="button"
                      className={`manager-reviews__page-btn ${
                        pageNum === currentReviews.currentPage
                          ? 'manager-reviews__page-btn--active'
                          : ''
                      }`}
                      onClick={() => setPage(pageNum)}
                      disabled={reviewsLoading}
                      aria-label={`Page ${pageNum}`}
                      aria-current={pageNum === currentReviews.currentPage ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  </React.Fragment>
                );
              })}

            <button
              type="button"
              className="manager-reviews__page-btn"
              onClick={() => setPage((p) => Math.min(currentReviews.totalPages, p + 1))}
              disabled={!currentReviews.hasNext || reviewsLoading}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default ManagerReviewsPage;
