import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import '../styles/LandingPage.css';

export const PublicNavbar = ({ activePage = '' }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleAnchorClick = (anchor) => {
    if (location.pathname !== '/') {
      navigate(`/${anchor}`);
    } else {
      const el = document.querySelector(anchor);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
      <div className="lp-nav-inner">
        {/* Brand */}
        <Link
          to="/"
          className="lp-brand"
          onClick={(e) => {
            if (location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          <span className="lp-brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px' }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <span className="lp-brand-name">SmartQueue</span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="lp-nav-links">
          <Link to="/organizations" className="lp-nav-link">Organizations</Link>
          <Link to="/search" className="lp-nav-link">Search</Link>
          <span
            onClick={() => handleAnchorClick('#how-it-works')}
            className="lp-nav-link"
            style={{ cursor: 'pointer' }}
          >
            How it works
          </span>
          <span
            onClick={() => handleAnchorClick('#why-smartqueue')}
            className="lp-nav-link"
            style={{ cursor: 'pointer' }}
          >
            Why SmartQueue
          </span>
          <Link
            to="/contact"
            className="lp-nav-link"
            style={{
              fontWeight: activePage === 'contact' ? 700 : undefined,
              background: activePage === 'contact' ? 'var(--lp-bg-subtle)' : undefined,
            }}
          >
            Contact Us
          </Link>
        </nav>

        {/* CTA Buttons & Theme Toggle */}
        <div className="lp-nav-cta">
          <ThemeToggle />
          {user ? (
            <Link to="/dashboard" className="lp-btn-primary">
              Dashboard →
            </Link>
          ) : (
            <>
              <Link to="/login" className="lp-btn-ghost">Sign in</Link>
              <Link to="/register" className="lp-btn-primary">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default PublicNavbar;
