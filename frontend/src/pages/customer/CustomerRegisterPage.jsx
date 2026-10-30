import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PublicNavbar } from '../../components/PublicNavbar';
import AuthFooter from '../../components/AuthFooter';
import '../../styles/AuthPages.css';

export const CustomerRegisterPage = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    password: '',
    password_confirm: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { registerCustomer } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (formData.password !== formData.password_confirm) {
      setFieldErrors({ password_confirm: ['Passwords do not match.'] });
      return;
    }

    setSubmitting(true);

    try {
      await registerCustomer(formData);
      
      // Preserve active booking journey if present in sessionStorage
      const pendingBooking = sessionStorage.getItem('sq_pending_booking');
      if (pendingBooking) {
        navigate('/customer/book', { replace: true });
      } else {
        navigate('/customer/dashboard', { replace: true });
      }
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        if (data.error) {
          setError(data.error.message || 'Registration failed.');
          if (data.error.details && typeof data.error.details === 'object') {
            setFieldErrors(data.error.details);
          }
        } else if (typeof data === 'object') {
          setFieldErrors(data);
          setError('Please resolve the validation errors below.');
        } else {
          setError('Registration failed. Please check your details.');
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
      <PublicNavbar activePage="register" />
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
              <div>
                <span className="auth-page__badge">
                  👤 Customer Registration
                </span>
              </div>
              <h1 className="auth-page__title">Create Customer Account</h1>
              <p className="auth-page__subtitle">
                Find services, book appointments, and manage your visits.
              </p>
            </div>

            {error && (
              <div className="auth-page__banner auth-page__banner--danger" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-page__form" noValidate>
              <div className="auth-page__field-row">
                <div>
                  <label className="auth-page__label" htmlFor="customer-first-name">
                    First Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="customer-first-name"
                    name="first_name"
                    type="text"
                    className={`auth-page__input ${fieldErrors.first_name ? 'auth-page__input--error' : ''}`}
                    placeholder="Jane"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    disabled={submitting}
                    autoComplete="given-name"
                    aria-invalid={Boolean(fieldErrors.first_name)}
                  />
                  {fieldErrors.first_name && (
                    <div className="auth-page__field-error" role="alert">
                      {fieldErrors.first_name.join(' ')}
                    </div>
                  )}
                </div>

                <div>
                  <label className="auth-page__label" htmlFor="customer-last-name">
                    Last Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="customer-last-name"
                    name="last_name"
                    type="text"
                    className={`auth-page__input ${fieldErrors.last_name ? 'auth-page__input--error' : ''}`}
                    placeholder="Doe"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    disabled={submitting}
                    autoComplete="family-name"
                    aria-invalid={Boolean(fieldErrors.last_name)}
                  />
                  {fieldErrors.last_name && (
                    <div className="auth-page__field-error" role="alert">
                      {fieldErrors.last_name.join(' ')}
                    </div>
                  )}
                </div>
              </div>

              <div className="auth-page__field-group">
                <label className="auth-page__label" htmlFor="customer-email">
                  Email Address <span className="auth-page__label-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="customer-email"
                  name="email"
                  type="email"
                  className={`auth-page__input ${fieldErrors.email ? 'auth-page__input--error' : ''}`}
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email && (
                  <div className="auth-page__field-error" role="alert">
                    {fieldErrors.email.join(' ')}
                  </div>
                )}
              </div>

              <div className="auth-page__field-group">
                <label className="auth-page__label" htmlFor="customer-phone">
                  Phone Number
                </label>
                <input
                  id="customer-phone"
                  name="phone_number"
                  type="tel"
                  className={`auth-page__input ${fieldErrors.phone_number ? 'auth-page__input--error' : ''}`}
                  placeholder="+1 555-0192"
                  value={formData.phone_number}
                  onChange={handleChange}
                  disabled={submitting}
                  autoComplete="tel"
                />
                {fieldErrors.phone_number && (
                  <div className="auth-page__field-error" role="alert">
                    {fieldErrors.phone_number.join(' ')}
                  </div>
                )}
              </div>

              <div className="auth-page__field-group">
                <div className="auth-page__label-wrapper">
                  <label className="auth-page__label" htmlFor="customer-password">
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
                  id="customer-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`auth-page__input ${fieldErrors.password ? 'auth-page__input--error' : ''}`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                {fieldErrors.password && (
                  <div className="auth-page__field-error" role="alert">
                    {fieldErrors.password.join(' ')}
                  </div>
                )}
              </div>

              <div className="auth-page__field-group" style={{ marginBottom: '1.75rem' }}>
                <label className="auth-page__label" htmlFor="customer-password-confirm">
                  Confirm Password <span className="auth-page__label-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="customer-password-confirm"
                  name="password_confirm"
                  type={showPassword ? 'text' : 'password'}
                  className={`auth-page__input ${fieldErrors.password_confirm ? 'auth-page__input--error' : ''}`}
                  placeholder="••••••••"
                  value={formData.password_confirm}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.password_confirm)}
                />
                {fieldErrors.password_confirm && (
                  <div className="auth-page__field-error" role="alert">
                    {fieldErrors.password_confirm.join(' ')}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="auth-page__submit-btn auth-page__submit-btn--accent"
                disabled={submitting}
              >
                {submitting ? 'Creating Customer Account...' : 'Create Customer Account'}
              </button>
            </form>

            <div className="auth-page__footer">
              Already have an account?{' '}
              <Link to="/login" className="auth-page__footer-link">
                Sign In
              </Link>
              <div>
                <Link to="/register" className="auth-page__back-link">
                  ← Change Account Type
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

export default CustomerRegisterPage;
