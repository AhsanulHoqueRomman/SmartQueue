import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import PublicNavbar from '../components/PublicNavbar';
import '../styles/AuthPages.css';

export const ResetPasswordPage = () => {
  const { uid, token } = useParams();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [tokenExpired, setTokenExpired] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setFieldErrors({});

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirm_password: ['Passwords do not match.'] });
      return;
    }

    if (newPassword.length < 8) {
      setFieldErrors({ new_password: ['Password must be at least 8 characters long.'] });
      return;
    }

    setSubmitting(true);

    try {
      await authService.confirmPasswordReset({
        uid,
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(true);
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        if (data.token) {
          setTokenExpired(true);
          setError(typeof data.token === 'string' ? data.token : data.token[0]);
        } else if (typeof data === 'object') {
          setFieldErrors(data);
          if (data.detail) {
            setError(data.detail);
          } else {
            setError('Please check the form for password errors.');
          }
        } else {
          setError('Failed to reset password. The link may have expired.');
        }
      } else {
        setError('Network error. Please check your connection.');
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

              <h1 className="auth-page__title">Reset your password</h1>
              <p className="auth-page__subtitle">
                Enter your new account password below.
              </p>
            </div>

            {tokenExpired ? (
              <div className="auth-page__status-card">
                <div className="auth-page__status-icon auth-page__status-icon--danger" aria-hidden="true">
                  ⚠️
                </div>
                <h2 className="auth-page__status-title">Link Expired or Invalid</h2>
                <p className="auth-page__status-desc">
                  {error || 'That password reset link is invalid or has expired.'}
                </p>
                <Link
                  to="/forgot-password"
                  className="auth-page__submit-btn"
                  style={{ textDecoration: 'none' }}
                >
                  Request a new reset link
                </Link>
              </div>
            ) : success ? (
              <div className="auth-page__status-card">
                <div className="auth-page__status-icon auth-page__status-icon--success" aria-hidden="true">
                  ✓
                </div>
                <h2 className="auth-page__status-title">Password Reset Successfully</h2>
                <p className="auth-page__status-desc">
                  Your QueueTurn account password has been updated. You can now sign in with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="auth-page__submit-btn"
                >
                  Sign In Now →
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-page__form" noValidate>
                {error && (
                  <div className="auth-page__banner auth-page__banner--danger" role="alert">
                    <span aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="auth-page__field-group">
                  <div className="auth-page__label-wrapper">
                    <label className="auth-page__label" htmlFor="reset-new-password">
                      New Password <span className="auth-page__label-required" aria-hidden="true">*</span>
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
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`auth-page__input ${fieldErrors.new_password ? 'auth-page__input--error' : ''}`}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={submitting}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.new_password)}
                    aria-describedby={fieldErrors.new_password ? 'reset-new-password-error' : undefined}
                  />
                  {fieldErrors.new_password && (
                    <div id="reset-new-password-error" className="auth-page__field-error" role="alert">
                      {Array.isArray(fieldErrors.new_password) ? fieldErrors.new_password[0] : fieldErrors.new_password}
                    </div>
                  )}
                </div>

                <div className="auth-page__field-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="auth-page__label" htmlFor="reset-confirm-password">
                    Confirm New Password <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="reset-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`auth-page__input ${fieldErrors.confirm_password ? 'auth-page__input--error' : ''}`}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={submitting}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.confirm_password)}
                    aria-describedby={fieldErrors.confirm_password ? 'reset-confirm-password-error' : undefined}
                  />
                  {fieldErrors.confirm_password && (
                    <div id="reset-confirm-password-error" className="auth-page__field-error" role="alert">
                      {Array.isArray(fieldErrors.confirm_password) ? fieldErrors.confirm_password[0] : fieldErrors.confirm_password}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="auth-page__submit-btn"
                  disabled={submitting || !newPassword || !confirmPassword}
                >
                  {submitting ? 'Resetting Password...' : 'Reset Password'}
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

export default ResetPasswordPage;
