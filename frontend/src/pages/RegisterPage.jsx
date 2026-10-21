import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicNavbar } from '../components/PublicNavbar';
import '../styles/AuthPages.css';

export const RegisterPage = () => {
  const navigate = useNavigate();

  const roleOptions = [
    {
      id: 'customer',
      title: 'Customer',
      icon: '👤',
      badge: 'Public Account',
      description: 'Find organizations and providers, book appointments, and track your place in live queues.',
      cta: 'Continue as Customer',
      path: '/register/customer',
      btnClass: 'auth-page__submit-btn--accent',
      badgeClass: '',
    },
    {
      id: 'provider',
      title: 'Provider',
      icon: '🩺',
      badge: 'Professional',
      description: 'Manage your appointments, working schedule, service catalog, and patient call telemetry.',
      cta: 'Continue as Provider',
      path: '/register/provider',
      btnClass: 'auth-page__submit-btn--provider',
      badgeClass: 'auth-page__badge--warning',
    },
    {
      id: 'manager',
      title: 'Manager',
      icon: '🏢',
      badge: 'Organization Admin',
      description: 'Register and manage your facility, service staff, provider teams, and operational oversight.',
      cta: 'Continue as Manager',
      path: '/register/manager',
      btnClass: '',
      badgeClass: 'auth-page__badge--espresso',
    },
  ];

  return (
    <div className="auth-page">
      <PublicNavbar activePage="register" />
      <main className="auth-page__main animate-page-entrance">
        <div className="auth-page__content-wrap auth-page__content-wrap--hub">
          {/* Header */}
          <div className="auth-page__header">
            <Link to="/" className="auth-page__brand" aria-label="QueueTurn Home">
              <span className="auth-page__brand-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <span className="auth-page__brand-title">QueueTurn</span>
            </Link>

            <h1 className="auth-page__title" style={{ fontSize: '2.125rem' }}>
              Create your QueueTurn account
            </h1>
            <p className="auth-page__subtitle" style={{ fontSize: '1.0625rem' }}>
              Choose how you will use QueueTurn to get started.
            </p>
          </div>

          {/* 3 Role Cards Grid */}
          <div className="auth-page__role-grid">
            {roleOptions.map((opt) => (
              <div
                key={opt.id}
                onClick={() => navigate(opt.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(opt.path);
                  }
                }}
                className="auth-page__role-card"
                role="button"
                tabIndex={0}
                aria-label={`${opt.title} registration: ${opt.description}`}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div className="auth-page__role-icon" aria-hidden="true">
                      {opt.icon}
                    </div>
                    <span className={`auth-page__badge ${opt.badgeClass}`}>
                      {opt.badge}
                    </span>
                  </div>

                  <h2 className="auth-page__role-title">
                    {opt.title}
                  </h2>
                  <p className="auth-page__role-desc">
                    {opt.description}
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`auth-page__submit-btn auth-page__role-cta ${opt.btnClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(opt.path);
                    }}
                  >
                    {opt.cta} →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Link */}
          <div className="auth-page__footer" style={{ width: '100%', maxWidth: '480px' }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>
              Already have an account?{' '}
              <Link to="/login" className="auth-page__footer-link">
                Sign in
              </Link>
            </p>
            <Link to="/" className="auth-page__back-link">
              ← Back to Home Page
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterPage;
