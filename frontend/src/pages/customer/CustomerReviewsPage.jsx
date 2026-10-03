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
    <div className="animate-page-entrance" style={{ maxWidth: '950px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--lp-sage-bg)', color: 'var(--lp-sage)', border: '1px solid var(--lp-sage-border)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          ★ Feedback & Ratings History
        </div>
        <h1 style={{ fontSize: '1.85rem', marginBottom: '0.25rem', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)' }}>
          My Reviews & Ratings
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.95rem' }}>
          Your submitted feedback for completed service consultations across SmartQueue clinics.
        </p>
      </div>

      {loading ? (
        <LoadingState message="Loading your submitted reviews..." />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {reviews.map((rev) => (
            <div
              key={rev.id}
              style={{
                background: 'var(--lp-surface)',
                borderRadius: '16px',
                border: '1px solid var(--lp-border)',
                padding: '1.5rem',
                boxShadow: 'var(--card-shadow)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      🏢 {rev.organization_name || rev.organization_details?.name || 'Clinic'}
                    </span>
                    <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.15rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
                      {rev.service_name || rev.appointment_details?.service_name || 'Service Consultation'}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', gap: '0.15rem', color: 'var(--color-warning)', fontSize: '1.1rem' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star}>{star <= rev.rating ? '★' : '☆'}</span>
                    ))}
                  </div>
                </div>

                {rev.provider_name && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', marginBottom: '0.85rem' }}>
                    Provider: <strong style={{ color: 'var(--lp-text)' }}>{rev.provider_name}</strong>
                  </div>
                )}

                <p style={{ color: 'var(--lp-text)', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1rem 0', fontStyle: rev.comment ? 'normal' : 'italic', background: 'var(--lp-bg-subtle)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--lp-border)' }}>
                  "{rev.comment || 'No written feedback provided.'}"
                </p>
              </div>

              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--lp-border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--lp-text-subtle)' }}>
                <span>Submitted</span>
                <span>{new Date(rev.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerReviewsPage;
