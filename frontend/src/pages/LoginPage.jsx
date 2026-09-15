import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

  const from = location.state?.from?.pathname || '/dashboard';

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
    <div className="animate-page-entrance" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)', padding: '2rem 1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ textCenter: 'center', marginBottom: '2rem', textAlign: 'center' }}>
          <Link to="/" className="navbar-brand" style={{ justifyContent: 'center', marginBottom: '1.25rem' }}>
            <span className="brand-icon">⚡</span>
            <span>SmartQueue</span>
          </Link>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>Welcome back</h2>
          <p className="subtitle">Sign in to your SmartQueue account</p>
        </div>

        {error && (
          <div className="banner banner-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              className="form-control"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
            />
            {fieldErrors.email && (
              <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.email[0]}
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="flex justify-between items-center" style={{ marginBottom: '0.4rem' }}>
              <label className="form-label" htmlFor="login-password" style={{ marginBottom: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
            />
            {fieldErrors.password && (
              <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.password[0]}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '0.75rem' }} disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: 'var(--color-text-muted)', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Create Account</Link>
          <div style={{ marginTop: '0.875rem' }}>
            <Link to="/" style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', textDecoration: 'none' }}>← Back to Landing Page</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
