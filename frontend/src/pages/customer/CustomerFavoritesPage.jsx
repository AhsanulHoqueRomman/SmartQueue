import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getFavoriteOrgs, toggleFavoriteOrg, getAuthenticatedAccountId } from '../../utils/recentAndFavorites';
import EmptyState from '../../components/EmptyState';
import PublicNavbar from '../../components/PublicNavbar';
import '../../styles/CustomerFavorites.css';

/* ─── SVG Bookmark Icon ─────────────────────────────────────────────────── */
const BookmarkIcon = ({ active = true, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

/* ─── SVG Search Icon ───────────────────────────────────────────────────── */
const SearchIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* ─── SVG Pin Icon ──────────────────────────────────────────────────────── */
const PinIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export function CustomerFavoritesPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // Resolve stable account ID immediately from user state or token
  const effectiveAccountId = useMemo(() => {
    if (user?.id) return String(user.id);
    return getAuthenticatedAccountId();
  }, [user?.id]);

  const [favorites, setFavorites] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Reload favorites whenever account identity transitions
  useEffect(() => {
    setFavorites(getFavoriteOrgs(effectiveAccountId));
  }, [effectiveAccountId]);

  const handleRemove = (org) => {
    toggleFavoriteOrg(org, effectiveAccountId);
    setFavorites(getFavoriteOrgs(effectiveAccountId));
  };

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favorites;
    const q = searchQuery.toLowerCase().trim();
    return favorites.filter((org) => {
      const name = (org.name || '').toLowerCase();
      const cat = (org.category || '').toLowerCase();
      const addr = (org.address || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || addr.includes(q);
    });
  }, [favorites, searchQuery]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar />

      <main className="customer-favorites" role="main">
        {/* Editorial Header */}
        <header className="customer-favorites__header">
          <div className="customer-favorites__header-main">
            <span className="customer-favorites__eyebrow">
              <BookmarkIcon size={14} /> Saved Healthcare Providers
            </span>
            <h1 className="customer-favorites__title">Saved Clinics & Facilities</h1>
            <p className="customer-favorites__subtitle">
              Quick access to your preferred clinics and facilities saved in this browser.
            </p>
          </div>

          <div className="customer-favorites__header-actions">
            {isAuthenticated || effectiveAccountId ? (
              <span
                className="customer-favorites__account-chip"
                title="Favorites isolated to this account in this browser"
              >
                👤 Account: {user?.email || 'Authenticated'} (Browser Storage)
              </span>
            ) : (
              <span
                className="customer-favorites__account-chip customer-favorites__account-chip--anon"
                title="Stored locally in this browser"
              >
                💻 Device Storage (Guest)
              </span>
            )}

            <button
              type="button"
              className="customer-favorites__btn-explore"
              onClick={() => navigate('/organizations')}
            >
              Explore Clinics →
            </button>
          </div>
        </header>

        {/* Anonymous Helper Notice */}
        {!isAuthenticated && !effectiveAccountId && (
          <div className="customer-favorites__anon-banner" role="status">
            <div className="customer-favorites__anon-banner-text">
              <span>💡</span>
              <span>
                Saved locally in this browser. Favorites are isolated per account and stored on this device.
              </span>
            </div>
            <div className="customer-favorites__anon-banner-links">
              <Link to="/login" className="customer-favorites__anon-banner-link">
                Sign In
              </Link>
              <span>·</span>
              <Link to="/register/customer" className="customer-favorites__anon-banner-link">
                Register
              </Link>
            </div>
          </div>
        )}

        {/* Search & Stats Toolbar */}
        {favorites.length > 0 && (
          <div className="customer-favorites__toolbar">
            <div className="customer-favorites__search-wrap">
              <span className="customer-favorites__search-icon">
                <SearchIcon size={16} />
              </span>
              <input
                type="text"
                className="customer-favorites__search-input"
                placeholder="Search saved clinics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search saved clinics"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="customer-favorites__search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="customer-favorites__stats">
              Showing <strong>{filteredFavorites.length}</strong> of <strong>{favorites.length}</strong> saved {favorites.length === 1 ? 'clinic' : 'clinics'}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {favorites.length === 0 ? (
          <EmptyState
            title="No Saved Clinics"
            message="Click the bookmark icon on any organization or clinic page to save your preferred medical centers for quick access."
            actionText="Explore All Clinics"
            onAction={() => navigate('/organizations')}
          />
        ) : filteredFavorites.length === 0 ? (
          <EmptyState
            title="No Matching Clinics"
            message={`No saved clinics match "${searchQuery}". Try a different keyword.`}
            actionText="Clear Filter"
            onAction={() => setSearchQuery('')}
          />
        ) : (
          <div className="customer-favorites__grid">
            {filteredFavorites.map((org) => {
              const hasRating = org.rating !== null && org.rating !== undefined;
              const hasReviews = org.reviews_count !== null && org.reviews_count !== undefined;

              return (
                <article key={org.id} className="customer-favorites__card">
                  <div className="customer-favorites__card-top">
                    <div className="customer-favorites__card-meta">
                      {org.category ? (
                        <span className="customer-favorites__badge">{org.category}</span>
                      ) : (
                        <span className="customer-favorites__badge">FACILITY</span>
                      )}

                      <button
                        type="button"
                        className="customer-favorites__btn-unfavorite"
                        onClick={() => handleRemove(org)}
                        title={`Remove ${org.name} from saved clinics`}
                        aria-label={`Remove ${org.name} from saved clinics`}
                      >
                        <BookmarkIcon active={true} size={18} />
                      </button>
                    </div>

                    <h2 className="customer-favorites__card-title">
                      <Link to={`/organizations/${org.id}`}>{org.name}</Link>
                    </h2>

                    {/* Real ratings & reviews — strictly no fabrication */}
                    <div className="customer-favorites__card-rating-row">
                      <span className="customer-favorites__star">★</span>
                      {hasRating ? (
                        <span>
                          <strong className="customer-favorites__rating-val">
                            {Number(org.rating).toFixed(1)}
                          </strong>
                          {hasReviews && ` (${org.reviews_count} ${org.reviews_count === 1 ? 'review' : 'reviews'})`}
                        </span>
                      ) : (
                        <span>Unrated · No reviews yet</span>
                      )}
                    </div>

                    {org.address && (
                      <p className="customer-favorites__card-address">
                        <span className="customer-favorites__card-address-icon">
                          <PinIcon size={14} />
                        </span>
                        <span>{org.address}</span>
                      </p>
                    )}
                  </div>

                  <div className="customer-favorites__card-bottom">
                    <Link
                      to={`/organizations/${org.id}`}
                      className="customer-favorites__btn-book"
                    >
                      View Services & Book →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default CustomerFavoritesPage;
