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
    : '5.0';

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const star = Math.round(r.rating) || 5;
    if (ratingCounts[star] !== undefined) ratingCounts[star]++;
  });

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            ★ Patient Ratings & Reviews
          </div>
          <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            Organization Feedback Summary
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            Patient feedback and star ratings for care delivered at <strong>{currentOrg.name}</strong>.
          </p>
        </div>

        <button
          onClick={fetchReviews}
          style={{ padding: '0.65rem 1.25rem', background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '8px', color: '#211C19', fontWeight: 600, cursor: 'pointer' }}
        >
          🔄 Refresh Reviews
        </button>
      </div>

      {/* Summary Scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Rating Score Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Average Overall Rating
          </div>
          <div style={{ fontSize: '3.2rem', fontWeight: 800, color: '#B06D2E', fontFamily: 'Outfit, sans-serif', marginTop: '0.25rem' }}>
            ★ {avgRating}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#78716C', marginTop: '0.25rem' }}>
            Based on <strong>{totalReviews}</strong> patient review(s)
          </div>
        </div>

        {/* Distribution Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.85rem' }}>
            Rating Distribution
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCounts[star] || 0;
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;

              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <span style={{ width: '45px', color: '#211C19', fontWeight: 600 }}>{star} Stars</span>
                  <div style={{ flex: 1, height: '8px', background: '#FAF8F3', borderRadius: '4px', overflow: 'hidden', border: '1px solid #E6E1D9' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#B06D2E', transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ width: '30px', textAlign: 'right', color: '#78716C', fontWeight: 500 }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Fetching patient feedback..." />
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState
          title="No Reviews Submitted Yet"
          message="Patients will leave star ratings and comments here after completing their appointments."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {reviews.map((rev) => (
            <div
              key={rev.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E6E1D9',
                borderRadius: '16px',
                padding: '1.5rem',
                boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#B06D2E', marginRight: '0.75rem' }}>
                    {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                  </span>
                  <span style={{ fontWeight: 700, color: '#211C19', fontSize: '0.95rem' }}>
                    {rev.customer_name || rev.customer_email?.split('@')[0] || 'Patient'}
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#78716C' }}>
                  {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : 'Recent'}
                </span>
              </div>

              {rev.comment ? (
                <p style={{ color: '#211C19', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 0.85rem 0', fontStyle: 'italic', background: '#FAF8F3', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E6E1D9' }}>
                  "{rev.comment}"
                </p>
              ) : (
                <p style={{ color: '#78716C', fontSize: '0.85rem', margin: '0 0 0.85rem 0', fontStyle: 'italic' }}>
                  No written comment provided.
                </p>
              )}

              <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', color: '#78716C', flexWrap: 'wrap' }}>
                {rev.service_name && <div>💼 Service: <strong style={{ color: '#211C19' }}>{rev.service_name}</strong></div>}
                {rev.provider_name && <div>🩺 Provider: <strong style={{ color: '#5F7A70' }}>{rev.provider_name}</strong></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ManagerReviewsPage;
