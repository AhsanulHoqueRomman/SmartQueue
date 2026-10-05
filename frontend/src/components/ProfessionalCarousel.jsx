import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProfessionalCarousel({ providers = [], orgId, organizationName }) {
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -340, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 340, behavior: 'smooth' });
    }
  };

  if (!providers || providers.length === 0) {
    return (
      <div className="org-prof-empty">
        <p>No professionals are currently listed for this organization.</p>
      </div>
    );
  }

  // Get domain fallback photo based on title / name
  const getFallbackPhoto = (prov, index) => {
    const title = (prov.title || '').toLowerCase();
    if (title.includes('barrister') || title.includes('advocate') || title.includes('law')) {
      return 'https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=400&q=80';
    } else if (title.includes('doctor') || title.includes('dr.') || title.includes('physician') || title.includes('surgeon')) {
      return 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80';
    } else if (title.includes('dentist') || title.includes('dental')) {
      return 'https://images.unsplash.com/photo-1594824813591-168a7f92ba48?auto=format&fit=crop&w=400&q=80';
    }
    const defaultFaces = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    ];
    return defaultFaces[index % defaultFaces.length];
  };

  return (
    <div className="org-prof-section">
      {/* Header with Title and Left/Right Navigation Arrows */}
      <div className="org-prof-header">
        <div>
          <h3 className="org-section-title">Our Renowned Professionals</h3>
          <p className="org-section-subtitle">
            Meet the professionals serving at {organizationName || 'this organization'}.
          </p>
        </div>

        {/* Carousel Arrow Buttons */}
        <div className="org-carousel-arrows">
          <button
            type="button"
            onClick={scrollLeft}
            aria-label="Previous professional"
            className="org-carousel-arrow-btn"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={scrollRight}
            aria-label="Next professional"
            className="org-carousel-arrow-btn"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Carousel Track with smooth snap */}
      <div
        ref={scrollRef}
        className="org-prof-carousel-track"
        tabIndex={0}
        aria-label="Professional cards carousel"
      >
        {providers.map((prov, index) => {
          const u = prov.membership?.user || {};
          const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || prov.title || 'Specialist';
          const photoSrc = prov.profile_photo || getFallbackPhoto(prov, index);
          const profileLink = `/organizations/${orgId}/providers/${prov.id}`;

          return (
            <div key={prov.id} className="org-prof-card">
              {/* Controlled Medium Image */}
              <div className="org-prof-img-wrap">
                <img
                  src={photoSrc}
                  alt={fullName}
                  className="org-prof-img"
                  onError={(e) => {
                    e.target.src = getFallbackPhoto(prov, index);
                  }}
                />
              </div>

              {/* Card Content */}
              <div className="org-prof-info">
                <h4 className="org-prof-name">{fullName}</h4>
                {prov.title && (
                  <div className="org-prof-title">{prov.title}</div>
                )}
                {prov.experience_years > 0 && (
                  <div className="org-prof-exp">{prov.experience_years} years experience</div>
                )}
                {prov.specialties && Array.isArray(prov.specialties) && prov.specialties.length > 0 && (
                  <div className="org-prof-specialties">
                    {prov.specialties.slice(0, 2).map((spec, i) => (
                      <span key={i} className="org-prof-spec-tag">
                        {spec}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Footer: View Full Profile Link Only (No Select Provider Button) */}
              <div className="org-prof-footer">
                <button
                  type="button"
                  onClick={() => navigate(profileLink)}
                  className="org-prof-link-btn"
                >
                  View Full Profile <span className="org-arrow">→</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
