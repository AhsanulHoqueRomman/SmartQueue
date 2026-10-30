import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getApiDocsUrl } from '../api/client';
import { footerSocials, publicContact } from '../config/publicContact';
import '../styles/LandingPhaseFour.css';

function QueueMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

function SocialIcon({ platform }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {platform === 'facebook' && <path d="M14 22v-9h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.4C17.4 1.2 16.3 1 15 1c-3 0-5 1.8-5 5v3H7v4h3v9z" />}
      {platform === 'instagram' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.5" cy="6.5" r="1.2" />
        </>
      )}
      {platform === 'x' && <path d="M18.9 2H22l-7 8 8.2 12h-6.5l-5.1-7.4L5 22H2l8.2-9.5L2.4 2h6.7l4.6 6.7zm-1.3 18h2L8 4H6z" />}
      {platform === 'youtube' && (
        <>
          <path d="M21.6 6.1c-.3-1-1-1.6-2-1.8C17.7 4 14 4 12 4s-5.7 0-7.6.3c-1 .2-1.7.8-2 1.8C2 7.7 2 10.4 2 12s0 4.3.4 5.9c.3 1 1 1.6 2 1.8 1.9.3 5.6.3 7.6.3s5.7 0 7.6-.3c1-.2 1.7-.8 2-1.8.4-1.6.4-4.3.4-5.9s0-4.3-.4-5.9Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10 8 6 4-6 4z" />
        </>
      )}
    </svg>
  );
}

function ContactIcon({ kind }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'phone' && <path d="m5 3 4 1 1 5-3 2c2 3 3 4 6 6l2-3 5 1 1 4c0 1-2 3-4 2C9 19 5 15 3 7 2 5 4 3 5 3Z" />}
      {kind === 'email' && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 6 9 7 9-7" />
        </>
      )}
      {kind === 'location' && (
        <>
          <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
          <circle cx="12" cy="10" r="2" />
        </>
      )}
    </svg>
  );
}

export function PublicFooter() {
  const location = useLocation();
  const navigate = useNavigate();

  const reduced = () =>
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const anchorClick = (event, selector) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.pathname !== '/') {
      navigate('/', { state: { landingAnchor: selector } });
    } else {
      if (location.hash) navigate('/', { replace: true, state: null });
      document.querySelector(selector)?.scrollIntoView({
        behavior: reduced() ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  const handleBrandClick = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (location.pathname === '/') {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: reduced() ? 'auto' : 'smooth',
      });
    }
  };

  return (
    <footer className="phase-four-footer">
      <div className="phase-four-inner">
        <div className="production-footer-grid">
          <div className="production-footer-brand">
            <Link to="/" className="lp-brand" onClick={handleBrandClick}>
              <span className="lp-brand-mark"><QueueMark /></span>
              <span className="lp-brand-name">QueueTurn</span>
            </Link>
            <p>Multi-service appointment &amp; queue management platform.</p>
            <div className="footer-socials" aria-label="Social profiles">
              {footerSocials.map(social =>
                social.url ? (
                  <a
                    key={social.platform}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${social.label} (opens in a new tab)`}
                  >
                    <SocialIcon platform={social.platform} />
                  </a>
                ) : (
                  <span
                    key={social.platform}
                    className="footer-social-unavailable"
                    role="img"
                    tabIndex={0}
                    aria-label={`${social.label} profile not available yet`}
                    title={`${social.label} profile not available yet`}
                  >
                    <SocialIcon platform={social.platform} />
                  </span>
                )
              )}
            </div>
          </div>

          <nav aria-label="Footer explore">
            <h2>Explore</h2>
            <Link to="/organizations">Organizations</Link>
            <Link to="/professionals">Professionals</Link>
            <Link to="/search">Search</Link>
            <Link to="/" onClick={event => anchorClick(event, '#how-it-works')}>How It Works</Link>
            <Link to="/" onClick={event => anchorClick(event, '#why-smartqueue')}>Why QueueTurn</Link>
          </nav>

          <nav aria-label="Footer for organizations">
            <h2>For Organizations</h2>
            <Link to="/" onClick={event => anchorClick(event, '#for-organizations')}>Overview</Link>
            <Link to="/register/manager">Register Your Organization</Link>
            <Link to="/contact">Contact / Enquiry</Link>
          </nav>

          <nav aria-label="Footer support">
            <h2>Support</h2>
            <Link to="/contact">Contact Us</Link>
            <a href={getApiDocsUrl()} target="_blank" rel="noopener noreferrer" aria-label="API Docs (opens in a new tab)">
              API Docs
            </a>
          </nav>

          <div className="production-footer-contact">
            <h2>Contact</h2>
            {publicContact.phone && (
              <a href={`tel:${publicContact.phone.replace(/[^+\d]/g, '')}`}>
                <ContactIcon kind="phone" />
                <span>{publicContact.phone}</span>
              </a>
            )}
            {publicContact.email && (
              <a href={`mailto:${encodeURIComponent(publicContact.email)}`}>
                <ContactIcon kind="email" />
                <span>{publicContact.email}</span>
              </a>
            )}
            {publicContact.location && (
              <div className="footer-contact-row">
                <ContactIcon kind="location" />
                <span>{publicContact.location}</span>
              </div>
            )}
            <Link to="/contact">
              <ContactIcon kind="email" />
              <span>Send an enquiry</span>
            </Link>
            <p>Need help with a visit or joining QueueTurn? Get in touch through our contact form.</p>
          </div>
        </div>

        <div className="production-footer-bottom">
          <span>© {new Date().getFullYear()} QueueTurn. All rights reserved.</span>
          <Link to="/contact">Get in touch</Link>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
