import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import reviewService from '../../services/reviewService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerReviewsPage() {
  const { currentOrg } = useTenant();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReviews = async () => {
    if (!currentOrg?.id) {
      setReviews([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await reviewService.getReviews(currentOrg.id);
      const list = Array.isArray(data) ? data : data.results || [];
      setReviews(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [currentOrg?.id]);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', fontFamily: 'Cinzel, serif', color: '#211C19' }}>
          My Reviews & Ratings
        </h1>
        <p style={{ color: '#78716C', margin: 0 }}>
          View your submitted feedback for completed service appointments in {currentOrg?.name || 'SmartQueue'}.
        </p>
      </div>

      {error && <div className="banner banner-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the header dropdown above to view your reviews."
        />
      ) : loading ? (
        <LoadingState message="Loading your submitted reviews..." />
      ) : reviews.length === 0 ? (
        <EmptyState
          title="You haven't submitted any reviews"
          message="Reviews can be submitted for completed appointments from the My Appointments page."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {reviews.map((rev) => (
            <div
              key={rev.id}
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E6E1D9',
                padding: '1.5rem',
                boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.2rem', color: '#B06D2E', fontSize: '1.2rem' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star}>{star <= rev.rating ? '★' : '☆'}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#78716C' }}>
                    {new Date(rev.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p style={{ color: '#211C19', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1rem 0', fontStyle: rev.comment ? 'normal' : 'italic' }}>
                  "{rev.comment || 'No written feedback provided.'}"
                </p>
              </div>

              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3', fontSize: '0.8rem', color: '#5C544E' }}>
                <div>🏢 <strong>{currentOrg?.name}</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerReviewsPage;
