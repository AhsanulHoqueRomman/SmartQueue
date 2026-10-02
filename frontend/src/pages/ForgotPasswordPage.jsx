import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import PublicNavbar from '../components/PublicNavbar';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;

    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const data = await authService.requestPasswordReset(email.trim());
      setSuccessMessage(data.detail || 'If an account exists for this email, a password reset link has been sent.');
    } catch (err) {
      if (err.response?.status === 429) {
        setError('Too many password reset requests. Please wait an hour before trying again.');
      } else {
        const detail = err.response?.data?.email?.[0] || err.response?.data?.detail;
        setError(detail || 'Failed to request password reset. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--lp-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar activePage="login" />
      <div
        className="animate-page-entrance"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6.5rem 1rem 3rem 1rem',
        }}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: '460px',
            padding: '2.5rem',
            boxShadow: 'var(--card-shadow)',
            borderRadius: '24px',
            border: '1px solid var(--lp-border)',
            backgroundColor: 'var(--lp-surface)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <Link
              to="/"
              className="navbar-brand"
              style={{
                justifyContent: 'center',
                marginBottom: '1.25rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
              }}
            >
              <span className="lp-brand-mark" style={{ width: '34px', height: '34px', borderRadius: '9px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </span>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', fontWeight: 700, color: 'var(--lp-text)' }}>
                SmartQueue
              </span>
            </Link>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)', fontWeight: 700 }}>
              Forgot your password?
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
              Enter the email associated with your SmartQueue account and we'll send you a password reset link.
            </p>
          </div>

          {error && (
            <div className="banner banner-danger" style={{ marginBottom: '1.25rem' }}>
              {error}
            </div>
          )}

          {successMessage ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-success-bg, rgba(79, 122, 90, 0.15))',
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.75rem',
                  margin: '0 auto 1.25rem',
                }}
              >
                ✉️
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.5rem' }}>
                Check your inbox
              </h3>
              <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                {successMessage}
              </p>
              <Link
                to="/login"
                className="btn btn-primary"
                style={{ display: 'inline-block', width: '100%', padding: '0.75rem 1.5rem', textDecoration: 'none' }}
              >
                Return to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="forgot-email">
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  className="form-control"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={submitting || !email.trim()}
              >
                {submitting ? 'Sending Link...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div
            style={{
              textAlign: 'center',
              marginTop: '2rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
