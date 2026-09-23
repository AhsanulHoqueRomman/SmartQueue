import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiDocsUrl } from '../api/client';
import '../styles/LandingPage.css';

export const PublicNavbar = ({ activePage = '' }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleAnchorClick = (anchor) => {
    setMobileMenuOpen(false);
    navigate(`/${anchor}`);
  };

  return (
    <header className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 1000, width: '100%' }}>
      <div className="lp-nav-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Brand */}
        <Link
          to="/"
          className="lp-brand"
          onClick={(e) => {
            if (window.location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textDecoration: 'none' }}
        >
          <div className="lp-brand-mark" style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#2F2520', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF8F3' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <span className="lp-brand-name" style={{ fontFamily: 'Cinzel, serif', fontSize: '1.2rem', fontWeight: 800, color: '#211C19' }}>
            SmartQueue
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="lp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Link to="/organizations" className="lp-nav-link" style={{ textDecoration: 'none', color: '#57534E', fontWeight: 600, fontSize: '0.9rem' }}>
            Organizations
          </Link>
          <Link to="/search" className="lp-nav-link" style={{ textDecoration: 'none', color: '#57534E', fontWeight: 600, fontSize: '0.9rem' }}>
            Search
          </Link>
          <span
            onClick={() => handleAnchorClick('#how-it-works')}
            className="lp-nav-link"
            style={{ cursor: 'pointer', color: '#57534E', fontWeight: 600, fontSize: '0.9rem' }}
          >
            How it works
          </span>
          <span
            onClick={() => handleAnchorClick('#why-smartqueue')}
            className="lp-nav-link"
            style={{ cursor: 'pointer', color: '#57534E', fontWeight: 600, fontSize: '0.9rem' }}
          >
            Why SmartQueue
          </span>
        </nav>

        {/* CTA Buttons */}
        <div className="lp-nav-cta" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user ? (
            <Link
              to="/dashboard"
              className="lp-btn-primary"
              style={{
                textDecoration: 'none',
                background: '#2F2520',
                color: '#FAF8F3',
                padding: '0.5rem 1.1rem',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              Dashboard →
            </Link>
          ) : (
            <>
              {activePage !== 'login' && (
                <Link
                  to="/login"
                  style={{
                    textDecoration: 'none',
                    color: '#2F2520',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    padding: '0.5rem 1rem',
                  }}
                >
                  Sign in
                </Link>
              )}
              {activePage !== 'register' && (
                <Link
                  to="/register"
                  style={{
                    textDecoration: 'none',
                    background: '#2F2520',
                    color: '#FAF8F3',
                    padding: '0.55rem 1.15rem',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    boxShadow: '0 4px 12px rgba(47, 37, 32, 0.15)',
                  }}
                >
                  {activePage === 'login' ? 'Create Account' : 'Register'}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default PublicNavbar;
