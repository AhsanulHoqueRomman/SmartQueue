import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PublicNavbar } from '../../components/PublicNavbar';

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
    <div style={{ backgroundColor: '#FAF8F3', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar activePage="register" />
      <div
        className="animate-page-entrance"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 1.25rem',
        }}
      >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: '1px solid #E6E1D9',
          padding: '2.5rem',
          boxShadow: '0 12px 40px rgba(47, 37, 32, 0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
              marginBottom: '1rem',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', fontWeight: 700, color: '#211C19' }}>
              SmartQueue
            </span>
          </Link>
          <div style={{ display: 'inline-block', backgroundColor: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '9999px', padding: '0.2rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', marginBottom: '0.5rem' }}>
            👤 Customer Registration
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#211C19', margin: '0 0 0.35rem 0', fontFamily: 'Cinzel, serif' }}>
            Create Customer Account
          </h2>
          <p style={{ color: '#78716C', fontSize: '0.9rem', margin: 0 }}>
            Find services, book appointments and manage your visits.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: '#FDF2F2',
              color: '#B4534B',
              border: '1px solid #F87171',
              borderRadius: '12px',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                First Name *
              </label>
              <input
                name="first_name"
                type="text"
                className="form-control"
                placeholder="Jane"
                value={formData.first_name}
                onChange={handleChange}
                required
                disabled={submitting}
              />
              {fieldErrors.first_name && (
                <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.first_name.join(' ')}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Last Name *
              </label>
              <input
                name="last_name"
                type="text"
                className="form-control"
                placeholder="Doe"
                value={formData.last_name}
                onChange={handleChange}
                required
                disabled={submitting}
              />
              {fieldErrors.last_name && (
                <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.last_name.join(' ')}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
              Email Address *
            </label>
            <input
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
              <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.email.join(' ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
              Phone Number
            </label>
            <input
              name="phone_number"
              type="tel"
              className="form-control"
              placeholder="+1 555-0192"
              value={formData.phone_number}
              onChange={handleChange}
              disabled={submitting}
            />
            {fieldErrors.phone_number && (
              <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.phone_number.join(' ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1.25rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#211C19' }}>
                Password *
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: '#5F7A70', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {showPassword ? 'Hide' : 'Show'} password
              </button>
            </div>
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="form-control"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={submitting}
            />
            {fieldErrors.password && (
              <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.password.join(' ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
              Confirm Password *
            </label>
            <input
              name="password_confirm"
              type={showPassword ? 'text' : 'password'}
              className="form-control"
              placeholder="••••••••"
              value={formData.password_confirm}
              onChange={handleChange}
              required
              disabled={submitting}
            />
            {fieldErrors.password_confirm && (
              <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {fieldErrors.password_confirm.join(' ')}
              </div>
            )}
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.85rem',
              backgroundColor: '#5F7A70',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(95, 122, 112, 0.2)',
            }}
            disabled={submitting}
          >
            {submitting ? 'Creating Customer Account...' : 'Create Customer Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: '#78716C', paddingTop: '1.5rem', borderTop: '1px solid #E6E1D9' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#2F2520', fontWeight: 700, textDecoration: 'none' }}>
            Sign In
          </Link>
          <div style={{ marginTop: '0.75rem' }}>
            <Link to="/register" style={{ color: '#5F7A70', fontSize: '0.825rem', textDecoration: 'none', fontWeight: 600 }}>
              ← Change Account Type
            </Link>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerRegisterPage;
