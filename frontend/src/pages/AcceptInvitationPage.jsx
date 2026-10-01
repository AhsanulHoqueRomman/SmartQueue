import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import organizationService from '../services/organizationService';
import { PublicNavbar } from '../components/PublicNavbar';

export const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [invitationError, setInvitationError] = useState(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    password: '',
    password_confirm: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvitationError('Invitation token is missing.');
      setLoading(false);
      return;
    }

    organizationService.getInvitationDetails(token)
      .then((data) => {
        setInvitation(data);
      })
      .catch((err) => {
        const msg = err.response?.data?.message || err.response?.data?.detail || 'This invitation link is invalid or has expired.';
        setInvitationError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    if (formData.password !== formData.password_confirm) {
      setFieldErrors({ password_confirm: ['Passwords do not match.'] });
      return;
    }

    setSubmitting(true);
    try {
      await organizationService.acceptInvitation(token, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        password: formData.password,
      });
      setSuccess(true);
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        if (data.error?.message) {
          setSubmitError(data.error.message);
        } else if (typeof data === 'object') {
          setFieldErrors(data);
          setSubmitError('Please resolve validation errors below.');
        } else {
          setSubmitError('Failed to accept invitation.');
        }
      } else {
        setSubmitError('Network error. Is the server running?');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: 'var(--lp-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicNavbar activePage="login" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', color: 'var(--lp-text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ fontSize: '1rem', fontWeight: 600 }}>Validating invitation link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (invitationError) {
    return (
      <div style={{ backgroundColor: 'var(--lp-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicNavbar activePage="login" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 1.25rem 3rem 1.25rem' }}>
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'var(--lp-surface)',
              borderRadius: '24px',
              border: '1px solid var(--lp-border)',
              padding: '3rem 2.5rem',
              boxShadow: 'var(--card-shadow)',
              textAlign: 'center',
            }}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.5rem auto' }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.75rem', fontFamily: 'Cinzel, serif' }}>
              Invitation Link Invalid
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
              {invitationError}
            </p>
            <Link
              to="/login"
              style={{
                display: 'inline-block',
                padding: '0.85rem 2rem',
                backgroundColor: 'var(--lp-btn-bg, #2F2520)',
                color: 'var(--lp-btn-text, #FAF8F3)',
                borderRadius: '12px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Back to Login →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ backgroundColor: 'var(--lp-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicNavbar activePage="login" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 1.25rem 3rem 1.25rem' }}>
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              backgroundColor: 'var(--lp-surface)',
              borderRadius: '24px',
              border: '1px solid var(--lp-border)',
              padding: '3rem 2.5rem',
              boxShadow: 'var(--card-shadow)',
              textAlign: 'center',
            }}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.5rem auto' }}>
              🎉
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.75rem', fontFamily: 'Cinzel, serif' }}>
              Welcome to {invitation?.organization_name}!
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
              Your provider account has been successfully created and approved.<br />
              You are now an active provider member of <strong>{invitation?.organization_name}</strong>.
            </p>
            <Link
              to="/login"
              style={{
                display: 'inline-block',
                padding: '0.85rem 2rem',
                backgroundColor: 'var(--color-warning)',
                color: '#FAF8F3',
                borderRadius: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: '1rem',
              }}
            >
              Sign In to Provider Portal →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--lp-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar activePage="login" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 1.25rem 3rem 1.25rem' }}>
        <div
          style={{
            width: '100%',
            maxWidth: '560px',
            backgroundColor: 'var(--lp-surface)',
            borderRadius: '24px',
            border: '1px solid var(--lp-border)',
            padding: '2.5rem',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ display: 'inline-block', backgroundColor: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '9999px', padding: '0.2rem 0.85rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-accent)', marginBottom: '0.75rem' }}>
              📩 Manager Invitation
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 0.5rem 0', fontFamily: 'Cinzel, serif' }}>
              Join {invitation?.organization_name}
            </h2>
            <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.9rem', margin: 0 }}>
              You were invited to join as a Service Provider for <strong>{invitation?.email}</strong>.
            </p>
          </div>

          {submitError && (
            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: '12px', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  First Name *
                </label>
                <input
                  name="first_name"
                  type="text"
                  className="form-control"
                  placeholder="Dr. Sarah"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.first_name && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.first_name.join(' ')}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  Last Name *
                </label>
                <input
                  name="last_name"
                  type="text"
                  className="form-control"
                  placeholder="Jenkins"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.last_name && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.last_name.join(' ')}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                Email Address
              </label>
              <input
                type="email"
                className="form-control"
                value={invitation?.email || ''}
                disabled
                style={{ backgroundColor: 'var(--lp-bg-subtle)', color: 'var(--lp-text-subtle)', cursor: 'not-allowed' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)' }}>
                  Create Password *
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', color: 'var(--lp-accent)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {showPassword ? 'Hide' : 'Show'}
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
              />
              {fieldErrors.password && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.password.join(' ')}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
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
              />
              {fieldErrors.password_confirm && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.password_confirm.join(' ')}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.85rem',
                backgroundColor: 'var(--color-warning)',
                color: '#FAF8F3',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(176, 109, 46, 0.2)',
              }}
            >
              {submitting ? 'Accepting Invitation...' : 'Accept Invitation & Complete Registration'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
