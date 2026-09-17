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
      accentColor: '#5F7A70',
    },
    {
      id: 'provider',
      title: 'Provider',
      icon: '🩺',
      badge: 'Professional',
      description: 'Manage your appointments, services, schedule and queue.',
      cta: 'Continue as Provider',
      path: '/register/provider',
      accentColor: '#B06D2E',
    },
    {
      id: 'manager',
      title: 'Manager',
      icon: '🏢',
      badge: 'Organization Admin',
      description: 'Create and manage your organization, team and services.',
      cta: 'Continue as Manager',
      path: '/register/manager',
      accentColor: '#2F2520',
    },
  ];

  return (
    <div style={{ backgroundColor: '#FAF8F3', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar activePage="register" />
      <div
        className="animate-page-entrance"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 1.5rem',
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
              gap: '0.5rem',
              textDecoration: 'none',
              marginBottom: '1.25rem',
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>⚡</span>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: '#211C19',
                letterSpacing: '-0.02em',
              }}
            >
              SmartQueue
            </span>
          </Link>

          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              color: '#211C19',
              margin: '0 0 0.5rem 0',
              fontFamily: 'Cinzel, serif',
            }}
          >
            Create your SmartQueue account
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#78716C', margin: 0, fontWeight: 500 }}>
            Choose how you'll use SmartQueue.
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
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid #E6E1D9',
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
                      backgroundColor: '#FAF8F3',
                      border: '1px solid #E6E1D9',
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
                      color: opt.accentColor,
                      backgroundColor: '#FAF8F3',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      border: '1px solid #E6E1D9',
                    }}
                  >
                    {opt.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#211C19', margin: '0 0 0.65rem 0' }}>
                  {opt.title}
                </h3>
                <p style={{ fontSize: '0.95rem', color: '#78716C', lineHeight: 1.5, margin: 0 }}>
                  {opt.description}
                </p>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <button
                  style={{
                    width: '100%',
                    padding: '0.85rem 1rem',
                    backgroundColor: opt.accentColor,
                    color: '#FAF8F3',
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
        <div style={{ textAlign: 'center', borderTop: '1px solid #E6E1D9', paddingTop: '2rem' }}>
          <p style={{ fontSize: '0.95rem', color: '#78716C', margin: '0 0 0.75rem 0' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#2F2520', fontWeight: 700, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
          <Link to="/" style={{ color: '#A8A29E', fontSize: '0.85rem', textDecoration: 'none' }}>
            ← Back to Home Page
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
