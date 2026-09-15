import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const RegisterPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    password: '',
    password_confirm: '',
  });

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
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
      await register(formData);
      navigate('/dashboard', { replace: true });
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
    <div className="animate-page-entrance" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)', padding: '2rem 1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '2.5rem', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" className="navbar-brand" style={{ justifyContent: 'center', marginBottom: '1.25rem' }}>
            <span className="brand-icon">⚡</span>
            <span>SmartQueue</span>
          </Link>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>Create your account</h2>
          <p className="subtitle">Join SmartQueue appointment & queue SaaS platform</p>
        </div>

        {error && (
          <div className="banner banner-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email Address *</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              className="form-control"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={submitting}
            />
            {fieldErrors.email && (
              <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.email.join(' ')}
              </div>
            )}
          </div>

          <div className="grid-responsive grid-cols-2 gap-sm">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-fname">First Name</label>
              <input
                id="reg-fname"
                name="first_name"
                type="text"
                className="form-control"
                placeholder="Jane"
                value={formData.first_name}
                onChange={handleChange}
                disabled={submitting}
              />
              {fieldErrors.first_name && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.first_name.join(' ')}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-lname">Last Name</label>
              <input
                id="reg-lname"
                name="last_name"
                type="text"
                className="form-control"
                placeholder="Doe"
                value={formData.last_name}
                onChange={handleChange}
                disabled={submitting}
              />
              {fieldErrors.last_name && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.last_name.join(' ')}
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">Phone Number</label>
            <input
              id="reg-phone"
              name="phone_number"
              type="tel"
              className="form-control"
              placeholder="+1 555-0192"
              value={formData.phone_number}
              onChange={handleChange}
              disabled={submitting}
            />
            {fieldErrors.phone_number && (
              <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.phone_number.join(' ')}
              </div>
            )}
          </div>

          <div className="grid-responsive grid-cols-2 gap-sm">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password *</label>
              <input
                id="reg-password"
                name="password"
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={submitting}
              />
              {fieldErrors.password && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.password.join(' ')}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-password-confirm">Confirm Password *</label>
              <input
                id="reg-password-confirm"
                name="password_confirm"
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={formData.password_confirm}
                onChange={handleChange}
                required
                disabled={submitting}
              />
              {fieldErrors.password_confirm && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.password_confirm.join(' ')}
                </div>
              )}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '1rem' }} disabled={submitting}>
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: 'var(--color-text-muted)', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Sign In</Link>
          <div style={{ marginTop: '0.875rem' }}>
            <Link to="/" style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8125rem', textDecoration: 'none' }}>← Back to Landing Page</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
