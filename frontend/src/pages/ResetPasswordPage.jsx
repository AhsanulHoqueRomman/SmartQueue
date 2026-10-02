import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import PublicNavbar from '../components/PublicNavbar';

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
              Reset your password
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', margin: 0 }}>
              Enter your new account password below.
            </p>
          </div>

          {tokenExpired ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-error-bg, rgba(180, 83, 75, 0.15))',
                  color: 'var(--color-error)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.75rem',
                  margin: '0 auto 1.25rem',
                }}
              >
                ⚠️
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.5rem' }}>
                Link Expired or Invalid
              </h3>
              <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                {error || 'That password reset link is invalid or has expired.'}
              </p>
              <Link
                to="/forgot-password"
                className="btn btn-primary"
                style={{ display: 'inline-block', width: '100%', padding: '0.75rem 1.5rem', textDecoration: 'none' }}
              >
                Request a new reset link
              </Link>
            </div>
          ) : success ? (
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
                ✓
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.5rem' }}>
                Password Reset Successfully
              </h3>
              <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                Your SmartQueue account password has been updated. You can now sign in with your new password.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem 1.5rem' }}
              >
                Sign In Now →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="banner banner-danger" style={{ marginBottom: '1.25rem' }}>
                  {error}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.4rem' }}>
                  <label className="form-label" htmlFor="reset-new-password" style={{ marginBottom: 0 }}>
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="reset-new-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
                {fieldErrors.new_password && (
                  <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {Array.isArray(fieldErrors.new_password) ? fieldErrors.new_password[0] : fieldErrors.new_password}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="reset-confirm-password">
                  Confirm New Password
                </label>
                <input
                  id="reset-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
                {fieldErrors.confirm_password && (
                  <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {Array.isArray(fieldErrors.confirm_password) ? fieldErrors.confirm_password[0] : fieldErrors.confirm_password}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={submitting || !newPassword || !confirmPassword}
              >
                {submitting ? 'Resetting Password...' : 'Reset Password'}
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

export default ResetPasswordPage;
