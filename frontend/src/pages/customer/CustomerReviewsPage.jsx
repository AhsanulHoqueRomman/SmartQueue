import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import reviewService from '../../services/reviewService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerReviewsPage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await reviewService.getMyReviews();
      const list = Array.isArray(data) ? data : data.results || [];
      setReviews(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load your reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto', padding: '0 0.5rem 2rem 0.5rem' }}>
      {/* Header section */}
      <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--lp-border)', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--lp-accent)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
          ★ Feedback History
        </div>
        <h1 style={{ fontSize: '1.85rem', marginBottom: '0.35rem', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)', fontWeight: 700 }}>
          My Reviews & Ratings
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.95rem' }}>
          Feedback you've shared after completed service consultations across QueueTurn clinics.
        </p>
      </div>

      {loading ? (
        <LoadingState message="Loading your feedback history..." />
      ) : error ? (
        <EmptyState
          title="Failed to Load Reviews"
          message={error}
          actionText="Try Again"
          onAction={fetchReviews}
        />
      ) : reviews.length === 0 ? (
        <EmptyState
          title="You haven't submitted any reviews yet"
          message="Reviews can be submitted for completed consultations from your My Appointments page."
          actionText="View My Appointments"
          onAction={() => navigate('/customer/appointments')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {reviews.map((rev, idx) => (
            <div
              key={rev.id}
              style={{
                padding: '1.5rem 0',
                borderBottom: idx === reviews.length - 1 ? 'none' : '1px solid var(--lp-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {rev.organization_name || rev.organization_details?.name || 'Clinic'}
                  </div>
                  <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.15rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
                    {rev.service_name || rev.appointment_details?.service_name || 'Service Consultation'}
                  </h3>
                  {rev.provider_name && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem' }}>
                      Provider: <strong style={{ color: 'var(--lp-text)' }}>{rev.provider_name}</strong>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.15rem', color: 'var(--color-warning)', fontSize: '1.1rem' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star}>{star <= rev.rating ? '★' : '☆'}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '0.2rem' }}>
                    {new Date(rev.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>

              {rev.comment ? (
                <p style={{ margin: 0, color: 'var(--lp-text)', fontSize: '0.95rem', lineHeight: 1.55, fontStyle: 'italic', background: 'var(--lp-bg-subtle)', padding: '0.85rem 1rem', borderRadius: '10px' }}>
                  "{rev.comment}"
                </p>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', fontStyle: 'italic' }}>
                  No written comment provided.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerReviewsPage;
