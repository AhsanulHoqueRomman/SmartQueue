import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import reviewService from '../../services/reviewService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ProviderReviewsPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  const [providerProfile, setProviderProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) return;
    let isMounted = true;
    setLoading(true);

    organizationService
      .getProviders(currentOrg.id)
      .then(async (provsData) => {
        if (!isMounted) return;
        const provList = Array.isArray(provsData) ? provsData : provsData.results || [];
        const myProfile = provList.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);

        if (myProfile) {
          const revsData = await reviewService.getReviews(currentOrg.id, { provider_id: myProfile.id });
          const revList = Array.isArray(revsData) ? revsData : revsData.results || [];
          if (isMounted) setReviews(revList);
        }
      })
      .catch((err) => {
        if (isMounted) setError('Failed to load feedback reviews.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id]);

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view your patient reviews." />;
  }

  if (loading) {
    return <LoadingState message="Fetching patient feedback and ratings..." />;
  }

  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0
    ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / totalReviews).toFixed(1)
    : '5.0';

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '950px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          ★ Patient Reviews & Ratings
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Patient Feedback
        </h1>
        <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
          Verified ratings left by patients after completed consultations with <strong>{providerProfile?.user_name || user?.first_name || user?.email}</strong>.
        </p>
      </div>

      {/* Summary Box */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#B06D2E', fontFamily: 'Outfit, sans-serif' }}>
          ★ {avgRating}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#211C19', fontSize: '1.1rem' }}>Provider Performance Rating</div>
          <div style={{ color: '#78716C', fontSize: '0.88rem' }}>Based on {totalReviews} patient feedback review(s)</div>
        </div>
      </div>

      {error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState title="No Patient Reviews Yet" message="Feedback submitted by patients after completed appointments will appear here." />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#B06D2E', marginRight: '0.75rem' }}>
                    {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                  </span>
                  <span style={{ fontWeight: 700, color: '#211C19' }}>
                    {rev.customer_name || rev.customer_email?.split('@')[0] || 'Verified Patient'}
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#78716C' }}>
                  {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : 'Recent'}
                </span>
              </div>

              {rev.comment ? (
                <p style={{ color: '#211C19', fontSize: '0.92rem', lineHeight: 1.5, margin: 0, fontStyle: 'italic', background: '#FAF8F3', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E6E1D9' }}>
                  "{rev.comment}"
                </p>
              ) : (
                <p style={{ color: '#78716C', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
                  No comment text provided.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProviderReviewsPage;
