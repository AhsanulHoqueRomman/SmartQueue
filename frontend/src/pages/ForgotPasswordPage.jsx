import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import PublicNavbar from '../components/PublicNavbar';
import '../styles/AuthPages.css';

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
    <div className="auth-page">
      <PublicNavbar activePage="login" />
      <main className="auth-page__main animate-page-entrance">
        <div className="auth-page__content-wrap">
          <div className="auth-card">
            <div className="auth-page__header">
              <Link to="/" className="auth-page__brand" aria-label="QueueTurn Home">
                <span className="auth-page__brand-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                <span className="auth-page__brand-title">QueueTurn</span>
              </Link>

              <h1 className="auth-page__title">Forgot your password?</h1>
              <p className="auth-page__subtitle">
                Enter the email associated with your QueueTurn account and we'll send you a password reset link.
              </p>
            </div>

            {error && (
              <div className="auth-page__banner auth-page__banner--danger" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {successMessage ? (
              <div className="auth-page__status-card">
                <div className="auth-page__status-icon auth-page__status-icon--success" aria-hidden="true">
                  ✉️
                </div>
                <h2 className="auth-page__status-title">Check your inbox</h2>
                <p className="auth-page__status-desc">
                  {successMessage}
                </p>
                <Link
                  to="/login"
                  className="auth-page__submit-btn"
                  style={{ textDecoration: 'none' }}
                >
                  Return to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-page__form" noValidate>
                <div className="auth-page__field-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="auth-page__label" htmlFor="forgot-email">
                    Email Address <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    className="auth-page__input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={submitting}
                    autoComplete="email"
                  />
                </div>

                <button
                  type="submit"
                  className="auth-page__submit-btn"
                  disabled={submitting || !email.trim()}
                >
                  {submitting ? 'Sending Link...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <div className="auth-page__footer">
              <Link to="/login" className="auth-page__footer-link">
                ← Back to Login
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ForgotPasswordPage;
