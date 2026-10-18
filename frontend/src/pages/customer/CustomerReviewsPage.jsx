import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import reviewService from '../../services/reviewService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import '../../styles/CustomerReviews.css';

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

export function CustomerReviewsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
    ownerId: null,
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

  // Concurrency, User Session & Mount Protection Refs
  const requestTicketRef = useRef(0);
  const activeUserIdRef = useRef(user?.id);
  const isMountedRef = useRef(true);

  // Mount/Unmount lifecycle tracker
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Synchronize authenticated user identity changes (Account switch isolation)
  useEffect(() => {
    if (activeUserIdRef.current !== user?.id) {
      activeUserIdRef.current = user?.id;
      requestTicketRef.current += 1;
      setRatingFilter('');
      setSearchInput('');
      setAppliedSearch('');
      setOrdering('-created_at');
      setPage(1);
      setError(null);
      setReviewsData({
        ownerId: null,
        items: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      });
    }
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Data Fetching with Concurrency Guard
  // ---------------------------------------------------------------------------
  const fetchReviews = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setReviewsData({
        ownerId: null,
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

      const response = await reviewService.getMyReviews(params);

      // Discard stale responses if ticket superseded, component unmounted, or user switched
      if (
        !isMountedRef.current ||
        ticket !== requestTicketRef.current ||
        activeUserIdRef.current !== targetUserId
      ) {
        return;
      }

      const normalized = normalizePaginatedResponse(response, page, DEFAULT_PAGE_SIZE);
      setReviewsData({
        ...normalized,
        ownerId: targetUserId,
      });
    } catch (err) {
      if (
        !isMountedRef.current ||
        ticket !== requestTicketRef.current ||
        activeUserIdRef.current !== targetUserId
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

      setError(err.response?.data?.detail || 'Failed to load your feedback history. Please try again.');
    } finally {
      if (
        isMountedRef.current &&
        ticket === requestTicketRef.current &&
        activeUserIdRef.current === targetUserId
      ) {
        setLoading(false);
      }
    }
  }, [user?.id, page, ratingFilter, appliedSearch, ordering]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ---------------------------------------------------------------------------
  // Filter Event Handlers
  // ---------------------------------------------------------------------------
  const handleRatingSelect = (rating) => {
    setRatingFilter(rating);
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
  // Data is considered valid for rendering only if the user is authenticated
  // and the loaded dataset's owner matches the current user.id.
  const isOwnerMatching = Boolean(user?.id && reviewsData.ownerId === user.id);
  const displayTotalCount = isOwnerMatching ? reviewsData.totalCount : 0;

  return (
    <div className="customer-reviews animate-page-entrance">
      {/* Editorial Header */}
      <header className="customer-reviews__header">
        <div className="customer-reviews__header-info">
          <div className="customer-reviews__eyebrow">
            <span>★ Personal Feedback Archive</span>
          </div>
          <h1 className="customer-reviews__title">My Reviews & Ratings</h1>
          <p className="customer-reviews__subtitle">
            A verified ledger of your consultation feedback submitted across QueueTurn healthcare clinics.
          </p>
        </div>

        <div className="customer-reviews__header-actions">
          <button
            type="button"
            className="customer-reviews__btn-nav"
            onClick={() => navigate('/customer/appointments')}
            title="Navigate to My Appointments to review eligible completed consultations"
          >
            <span>📅</span>
            <span>Go to My Appointments</span>
          </button>
          <button
            type="button"
            className="customer-reviews__btn-refresh"
            onClick={fetchReviews}
            disabled={loading}
            title="Refresh feedback history"
            aria-label="Refresh feedback history"
          >
            <span>🔄</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Informational Guidance Banner (History-Only Workflow — Approved D3) */}
      <aside className="customer-reviews__guidance-banner" aria-label="Review submission workflow notice">
        <div className="customer-reviews__guidance-content">
          <div className="customer-reviews__guidance-title">
            <span>ℹ️</span>
            <span>About Customer Reviews & Ratings</span>
          </div>
          <p className="customer-reviews__guidance-text">
            Reviews on QueueTurn can only be submitted once following a completed consultation. Once submitted, your feedback is permanent and cannot be edited or deleted. To leave a review for an eligible completed appointment, visit your My Appointments ledger.
          </p>
        </div>
        <button
          type="button"
          className="customer-reviews__guidance-link"
          onClick={() => navigate('/customer/appointments')}
        >
          <span>Review Eligible Visits</span>
          <span>→</span>
        </button>
      </aside>

      {/* Filter & Search Toolbar */}
      <section className="customer-reviews__toolbar" aria-label="Review search and filter controls">
        <div className="customer-reviews__toolbar-top">
          {/* Star Rating Pills */}
          <div className="customer-reviews__rating-pills" role="group" aria-label="Filter by star rating">
            <button
              type="button"
              className={`customer-reviews__pill-btn ${ratingFilter === '' ? 'customer-reviews__pill-btn--active' : ''}`}
              onClick={() => handleRatingSelect('')}
              disabled={loading}
            >
              All Ratings
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                type="button"
                className={`customer-reviews__pill-btn ${ratingFilter === String(star) ? 'customer-reviews__pill-btn--active' : ''}`}
                onClick={() => handleRatingSelect(String(star))}
                disabled={loading}
              >
                {star} ★
              </button>
            ))}
          </div>

          {/* Search Form (Verified Backend: searches comment and organization name) */}
          <form onSubmit={handleSearchSubmit} className="customer-reviews__search-form" role="search">
            <div className="customer-reviews__search-wrap">
              <span className="customer-reviews__search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by comment or clinic..."
                className="customer-reviews__search-input"
                aria-label="Search reviews by comment or clinic name"
                disabled={loading}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="customer-reviews__search-clear"
                  aria-label="Clear search input"
                >
                  &times;
                </button>
              )}
            </div>
            <button
              type="submit"
              className="customer-reviews__btn-search"
              disabled={loading || !searchInput.trim()}
            >
              Search
            </button>
          </form>
        </div>

        <div className="customer-reviews__toolbar-bottom">
          <div className="customer-reviews__stats-summary">
            <span>
              Showing <strong className="customer-reviews__stats-badge">{displayTotalCount}</strong>{' '}
              {displayTotalCount === 1 ? 'review' : 'reviews'}
            </span>
            {isFiltered && (
              <>
                <span>• Filtered</span>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="customer-reviews__clear-btn"
                >
                  Reset filters
                </button>
              </>
            )}
          </div>

          <div className="customer-reviews__sort-wrap">
            <label htmlFor="customer-reviews-sort">Sort by:</label>
            <select
              id="customer-reviews-sort"
              value={ordering}
              onChange={handleOrderingChange}
              disabled={loading}
              className="customer-reviews__sort-select"
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
        <div role="alert" className="customer-reviews__alert customer-reviews__alert--error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Review List */}
      {!user?.id ? (
        <EmptyState
          title="Sign In Required"
          message="Please sign in to your customer account to view your review history."
          actionText="Sign In"
          onAction={() => navigate('/login')}
        />
      ) : error ? (
        <EmptyState
          title="Failed to Load Reviews"
          message={error}
          actionText="Try Again"
          onAction={fetchReviews}
        />
      ) : loading || !isOwnerMatching ? (
        <LoadingState message="Loading your feedback history..." />
      ) : reviewsData.items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No Matching Reviews Found"
            message="No feedback entries match your active rating or search criteria."
            actionText="Clear All Filters"
            onAction={handleClearAllFilters}
          />
        ) : (
          <EmptyState
            title="You Haven't Submitted Any Reviews Yet"
            message="Reviews can be submitted for completed consultations from your My Appointments ledger."
            actionText="View My Appointments"
            onAction={() => navigate('/customer/appointments')}
          />
        )
      ) : (
        <>
          <section className="customer-reviews__feed" aria-label="Customer review history list">
            {reviewsData.items.map((rev) => {
              const formattedDate = formatReviewDate(rev.created_at);

              return (
                <article key={rev.id} className="customer-reviews__card">
                  <div className="customer-reviews__card-header">
                    <div className="customer-reviews__clinic-group">
                      <span className="customer-reviews__clinic-name">
                        {rev.organization_name || 'Healthcare Clinic'}
                      </span>
                      <h2 className="customer-reviews__service-name">
                        {rev.service_name || 'Medical Consultation'}
                      </h2>
                      {rev.provider_name && (
                        <div className="customer-reviews__provider-tag">
                          <span>Specialist:</span>
                          <strong className="customer-reviews__provider-strong">{rev.provider_name}</strong>
                        </div>
                      )}
                    </div>

                    <div className="customer-reviews__rating-block">
                      <div
                        className="customer-reviews__stars-row"
                        aria-label={`Rating: ${rev.rating} out of 5 stars`}
                      >
                        <span className="customer-reviews__stars" aria-hidden="true">
                          {'★'.repeat(rev.rating)}
                          {'☆'.repeat(5 - rev.rating)}
                        </span>
                        <span className="customer-reviews__rating-badge">
                          {rev.rating}.0
                        </span>
                      </div>
                      {formattedDate ? (
                        <time className="customer-reviews__date" dateTime={rev.created_at}>
                          Reviewed on {formattedDate}
                        </time>
                      ) : (
                        <span className="customer-reviews__date">
                          Review date unavailable
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="customer-reviews__comment-box">
                    {rev.comment?.trim() ? (
                      <p className="customer-reviews__comment-text">
                        "{rev.comment.trim()}"
                      </p>
                    ) : (
                      <p className="customer-reviews__comment-empty">
                        Rating submitted without a written comment.
                      </p>
                    )}
                  </div>

                  <footer className="customer-reviews__card-footer">
                    <span className="customer-reviews__verified-badge">
                      <span>✓</span>
                      <span>Completed Visit Review</span>
                    </span>
                    {rev.appointment_id && (
                      <span className="customer-reviews__appointment-ref">
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
            <nav className="customer-reviews__pagination" aria-label="Review history pagination">
              <div className="customer-reviews__pagination-info">
                Showing {reviewsData.itemRange.start}–{reviewsData.itemRange.end} of {reviewsData.totalCount} entries
              </div>

              <div className="customer-reviews__pagination-controls">
                <button
                  type="button"
                  className="customer-reviews__page-btn"
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
                      className={`customer-reviews__page-btn ${pNum === reviewsData.currentPage ? 'customer-reviews__page-btn--active' : ''}`}
                      onClick={() => handlePageChange(pNum)}
                      disabled={loading}
                      aria-current={pNum === reviewsData.currentPage ? 'page' : undefined}
                    >
                      {pNum}
                    </button>
                  ))}

                <button
                  type="button"
                  className="customer-reviews__page-btn"
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

export default CustomerReviewsPage;
