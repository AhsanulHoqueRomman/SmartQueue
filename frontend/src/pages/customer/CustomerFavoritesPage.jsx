import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getFavoriteOrgs, toggleFavoriteOrg } from '../../utils/recentAndFavorites';
import EmptyState from '../../components/EmptyState';

const BookmarkIcon = ({ active = true, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={active ? 'var(--lp-accent)' : 'none'}
    stroke={active ? 'var(--lp-accent)' : 'var(--lp-text-subtle)'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transition: 'all 0.2s ease', display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

export function CustomerFavoritesPage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    setFavorites(getFavoriteOrgs());
  }, []);

  const handleRemove = (org) => {
    toggleFavoriteOrg(org);
    setFavorites(getFavoriteOrgs());
  };

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '950px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)' }}>
          Saved Clinics & Favorites
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', margin: 0 }}>
          Your bookmarked partner facilities for fast repeat appointments.
        </p>
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          title="No Saved Clinics"
          message="Click the bookmark icon on any organization card or profile page to save your favorite care providers for quick access."
          actionText="Explore Clinics"
          onAction={() => navigate('/organizations')}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {favorites.map((org) => (
            <div
              key={org.id}
              style={{
                background: 'var(--lp-surface)',
                borderRadius: '16px',
                border: '1px solid var(--lp-border)',
                padding: '1.5rem',
                boxShadow: 'var(--lp-shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ background: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: '1px solid var(--lp-border)', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {org.category || 'HEALTHCARE'}
                  </span>
                  <button
                    onClick={() => handleRemove(org)}
                    title="Remove from favorites"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                  >
                    <BookmarkIcon active={true} />
                  </button>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  {org.name}
                </h3>

                <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                  ★ {org.rating || '4.9'} ({org.reviews_count || 12} reviews)
                </p>
              </div>

              <Link
                to={`/organizations/${org.id}`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '0.65rem',
                  background: 'var(--lp-accent)',
                  color: 'var(--lp-btn-text)',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                }}
              >
                View Services & Book →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerFavoritesPage;
