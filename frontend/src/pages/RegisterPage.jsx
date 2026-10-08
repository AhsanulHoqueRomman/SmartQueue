import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicNavbar } from '../components/PublicNavbar';

export const RegisterPage = () => {
  const navigate = useNavigate();

  const roleOptions = [
    {
      id: 'customer',
      title: 'Customer',
      icon: '👤',
      badge: 'Public Account',
      description: 'Find services, book appointments and manage your visits.',
      cta: 'Continue as Customer',
      path: '/register/customer',
      badgeColor: 'var(--lp-sage)',
      btnBg: '#5F7A70',
      btnText: '#FAF8F3',
    },
    {
      id: 'provider',
      title: 'Provider',
      icon: '🩺',
      badge: 'Professional',
      description: 'Manage your appointments, services, schedule and queue.',
      cta: 'Continue as Provider',
      path: '/register/provider',
      badgeColor: '#B06D2E',
      btnBg: '#B06D2E',
      btnText: '#FAF8F3',
    },
    {
      id: 'manager',
      title: 'Manager',
      icon: '🏢',
      badge: 'Organization Admin',
      description: 'Create and manage your organization, team and services.',
      cta: 'Continue as Manager',
      path: '/register/manager',
      badgeColor: 'var(--lp-espresso)',
      btnBg: 'var(--lp-btn-primary-bg)',
      btnText: 'var(--lp-btn-primary-text)',
    },
  ];

  return (
    <div style={{ backgroundColor: 'var(--lp-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar activePage="register" />
      <div
        className="animate-page-entrance"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6rem 1.5rem 3rem 1.5rem',
        }}
      >
      <div style={{ maxWidth: '960px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.625rem',
              textDecoration: 'none',
              marginBottom: '1.25rem',
            }}
          >
            <span className="lp-brand-mark" style={{ width: '36px', height: '36px', borderRadius: '10px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </span>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--lp-text)',
                letterSpacing: '-0.02em',
              }}
            >
              QueueTurn
            </span>
          </Link>

          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              color: 'var(--lp-text)',
              margin: '0 0 0.5rem 0',
              fontFamily: 'Cinzel, serif',
            }}
          >
            Create your QueueTurn account
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--lp-text-subtle)', margin: 0, fontWeight: 500 }}>
            Choose how you'll use QueueTurn.
          </p>
        </div>

        {/* 3 Role Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: '1.75rem',
            marginBottom: '3rem',
          }}
        >
          {roleOptions.map((opt) => (
            <div
              key={opt.id}
              onClick={() => navigate(opt.path)}
              style={{
                backgroundColor: 'var(--lp-surface)',
                borderRadius: '20px',
                border: '1px solid var(--lp-border)',
                padding: '2.25rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 10px 30px rgba(47, 37, 32, 0.04)',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
              className="role-card-hover"
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      backgroundColor: 'var(--lp-bg-subtle)',
                      border: '1px solid var(--lp-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                    }}
                  >
                    {opt.icon}
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: opt.badgeColor,
                      backgroundColor: 'var(--lp-bg-subtle)',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      border: '1px solid var(--lp-border)',
                    }}
                  >
                    {opt.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.65rem 0' }}>
                  {opt.title}
                </h3>
                <p style={{ fontSize: '0.95rem', color: 'var(--lp-text-subtle)', lineHeight: 1.5, margin: 0 }}>
                  {opt.description}
                </p>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <button
                  style={{
                    width: '100%',
                    padding: '0.85rem 1rem',
                    backgroundColor: opt.btnBg,
                    color: opt.btnText,
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(47, 37, 32, 0.08)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {opt.cta} →
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Link */}
        <div style={{ textAlign: 'center', borderTop: '1px solid var(--lp-border)', paddingTop: '2rem' }}>
          <p style={{ fontSize: '0.95rem', color: 'var(--lp-text-subtle)', margin: '0 0 0.75rem 0' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--lp-accent)', fontWeight: 700, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
          <Link to="/" style={{ color: 'var(--lp-text-subtle)', fontSize: '0.85rem', textDecoration: 'none' }}>
            ← Back to Home Page
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
