import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PublicNavbar } from '../components/PublicNavbar';
import AuthFooter from '../components/AuthFooter';
import '../styles/AuthPages.css';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryRedirect = new URLSearchParams(location.search).get('redirect');
  const from = queryRedirect || location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        if (data.error) {
          setError(data.error.message || 'Login failed.');
          if (data.error.details && typeof data.error.details === 'object') {
            setFieldErrors(data.error.details);
          }
        } else if (data.detail) {
          setError(typeof data.detail === 'string' ? data.detail : 'Invalid credentials.');
        } else if (typeof data === 'object') {
          setFieldErrors(data);
          setError('Please check the form inputs.');
        } else {
          setError('Failed to log in. Please try again.');
        }
      } else {
        setError('Network error. Is the backend server running?');
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
              <h1 className="auth-page__title">Welcome back</h1>
              <p className="auth-page__subtitle">Sign in to your QueueTurn account</p>
            </div>

            {error && (
              <div className="auth-page__banner auth-page__banner--danger" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-page__form" noValidate>
              <div className="auth-page__field-group">
                <label className="auth-page__label" htmlFor="login-email">
                  Email Address <span className="auth-page__label-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="login-email"
                  type="email"
                  className={`auth-page__input ${fieldErrors.email ? 'auth-page__input--error' : ''}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                />
                {fieldErrors.email && (
                  <div id="login-email-error" className="auth-page__field-error" role="alert">
                    {Array.isArray(fieldErrors.email) ? fieldErrors.email.join(' ') : fieldErrors.email}
                  </div>
                )}
              </div>

              <div className="auth-page__field-group">
                <div className="auth-page__label-wrapper">
                  <label className="auth-page__label" htmlFor="login-password">
                    Password <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="auth-page__toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className={`auth-page__input ${fieldErrors.password ? 'auth-page__input--error' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="current-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                />
                {fieldErrors.password && (
                  <div id="login-password-error" className="auth-page__field-error" role="alert">
                    {Array.isArray(fieldErrors.password) ? fieldErrors.password.join(' ') : fieldErrors.password}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.45rem' }}>
                  <Link
                    to="/forgot-password"
                    className="auth-page__footer-link"
                    style={{ fontSize: '0.8125rem' }}
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                className="auth-page__submit-btn"
                disabled={submitting}
                style={{ marginTop: '0.5rem' }}
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="auth-page__footer">
              Don't have an account?{' '}
              <Link to="/register" className="auth-page__footer-link">
                Create Account
              </Link>
              <div>
                <Link to="/" className="auth-page__back-link">
                  ← Back to Home Page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <AuthFooter />
    </div>
  );
};

export default LoginPage;
