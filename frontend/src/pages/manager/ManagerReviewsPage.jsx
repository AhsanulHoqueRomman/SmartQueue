import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import reviewService from '../../services/reviewService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ManagerReviewsPage() {
  const { currentOrg } = useTenant();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReviews = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError('');

    try {
      const data = await reviewService.getReviews(currentOrg.id);
      const list = Array.isArray(data) ? data : data.results || [];
      setReviews(list);
    } catch (err) {
      setError('Failed to load patient reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [currentOrg?.id]);

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view patient reviews." />;
  }

  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0
    ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / totalReviews).toFixed(1)
    : '—';

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const star = Math.round(r.rating) || 5;
    if (ratingCounts[star] !== undefined) ratingCounts[star]++;
  });

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <span className="badge badge-info" style={{ marginBottom: '0.4rem' }}>
            ★ Patient Ratings & Reviews
          </span>
          <h1 style={{ marginTop: '0.25rem' }}>
            Organization Feedback Summary
          </h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Patient feedback and star ratings for care delivered at <strong>{currentOrg.name}</strong>.
          </p>
        </div>

        <button
          className="btn btn-outline"
          onClick={fetchReviews}
        >
          🔄 Refresh Reviews
        </button>
      </div>

      {loading ? (
        <LoadingState message="Fetching patient feedback..." />
      ) : error ? (
        <EmptyState
          title="Failed to Load Reviews"
          message={error}
          actionText="Try Again"
          onAction={fetchReviews}
        />
      ) : (
        <>
          {/* Summary Scorecard */}
          <div className="grid-responsive grid-cols-2" style={{ gap: '1.5rem', marginBottom: '1.75rem' }}>
            {/* Rating Score Card */}
            <div className="card" style={{ textAlign: 'center', backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="text-xs text-muted font-semibold uppercase">
                Average Overall Rating
              </div>
              <div style={{ fontSize: '3.2rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '0.25rem' }}>
                {totalReviews > 0 ? `★ ${avgRating}` : '—'}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
                {totalReviews > 0 ? `Based on ${totalReviews} patient review(s)` : 'No ratings submitted yet'}
              </div>
            </div>

            {/* Distribution Card */}
            <div className="card" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="text-xs text-muted font-semibold uppercase" style={{ marginBottom: '0.85rem' }}>
                Rating Distribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingCounts[star] || 0;
                  const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;

                  return (
                    <div key={star} className="flex items-center gap-sm" style={{ fontSize: '0.85rem' }}>
                      <span className="font-semibold" style={{ width: '55px' }}>{star} Stars</span>
                      <div style={{ flex: 1, height: '8px', background: 'var(--color-bg-subtle)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-warning)', transition: 'width 0.3s ease' }} />
                      </div>
                      <span className="text-xs text-muted font-semibold" style={{ width: '30px', textAlign: 'right' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {reviews.length === 0 ? (
            <EmptyState
              title="No Reviews Submitted Yet"
              message="Patients will leave star ratings and comments here after completing their appointments."
            />
          ) : (
            <div className="flex flex-col gap-md">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="card"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    padding: '1.5rem',
                  }}
                >
                  <div className="flex justify-between items-center flex-wrap gap-xs" style={{ marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-warning)', marginRight: '0.75rem' }}>
                        {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                      </span>
                      <span className="font-semibold" style={{ fontSize: '0.95rem' }}>
                        {rev.customer_name || rev.customer_email?.split('@')[0] || 'Patient'}
                      </span>
                    </div>
                    <span className="text-xs text-muted">
                      {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>

                  {rev.comment ? (
                    <p style={{ fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 0.85rem 0', fontStyle: 'italic', background: 'var(--color-bg-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      "{rev.comment}"
                    </p>
                  ) : (
                    <p className="text-xs text-muted" style={{ margin: '0 0 0.85rem 0', fontStyle: 'italic' }}>
                      No written comment provided.
                    </p>
                  )}

                  <div className="flex gap-md text-xs text-muted flex-wrap">
                    {rev.service_name && <div>💼 Service: <strong>{rev.service_name}</strong></div>}
                    {rev.provider_name && <div>🩺 Provider: <strong>{rev.provider_name}</strong></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ManagerReviewsPage;
