import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import organizationService from '../services/organizationService';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { initialSchedule } from '../utils/scheduleDraft';
import { PublicNavbar } from '../components/PublicNavbar';
import '../styles/AuthPages.css';

export const AcceptInvitationPage = () => {
  const { token } = useParams();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [applicationStatus, setApplicationStatus] = useState(null);

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
      const result = await organizationService.acceptInvitation(token, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        password: formData.password,
        initial_schedule: schedule,
      });
      setApplicationStatus(result.application_status);
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
      <div className="auth-page">
        <PublicNavbar activePage="login" />
        <main className="auth-page__main animate-page-entrance">
          <div className="auth-page__content-wrap">
            <div className="auth-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }} aria-hidden="true">⏳</div>
              <h1 className="auth-page__title" style={{ fontSize: '1.35rem' }}>
                Validating invitation link...
              </h1>
              <p className="auth-page__subtitle">
                Connecting to QueueTurn security services.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (invitationError) {
    return (
      <div className="auth-page">
        <PublicNavbar activePage="login" />
        <main className="auth-page__main animate-page-entrance">
          <div className="auth-page__content-wrap">
            <div className="auth-card">
              <div className="auth-page__status-card">
                <div className="auth-page__status-icon auth-page__status-icon--danger" aria-hidden="true">
                  ⚠️
                </div>
                <h1 className="auth-page__status-title">Invitation Link Invalid</h1>
                <p className="auth-page__status-desc">
                  {invitationError}
                </p>
                <Link
                  to="/login"
                  className="auth-page__submit-btn"
                  style={{ textDecoration: 'none' }}
                >
                  Back to Login →
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-page">
        <PublicNavbar activePage="login" />
        <main className="auth-page__main animate-page-entrance">
          <div className="auth-page__content-wrap">
            <div className="auth-card">
              <div className="auth-page__status-card">
                <div className="auth-page__status-icon auth-page__status-icon--success" aria-hidden="true">
                  🎉
                </div>
                <h1 className="auth-page__status-title">
                  Welcome to {invitation?.organization_name}!
                </h1>
                <p className="auth-page__status-desc">
                  {applicationStatus === 'APPROVED'
                    ? 'Your provider account is approved.'
                    : 'Your account and initial schedule have been submitted for organization manager approval. Operational access begins after approval.'}
                </p>
                <Link
                  to="/login"
                  className="auth-page__submit-btn auth-page__submit-btn--provider"
                  style={{ textDecoration: 'none' }}
                >
                  Sign In to Provider Portal →
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <PublicNavbar activePage="login" />
      <main className="auth-page__main animate-page-entrance">
        <div className="auth-page__content-wrap auth-page__content-wrap--wide">
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
                <span className="auth-page__badge auth-page__badge--warning">
                  📩 Manager Invitation
                </span>
              </div>
              <h1 className="auth-page__title">Join {invitation?.organization_name}</h1>
              <p className="auth-page__subtitle">
                You were invited to join as a Service Provider for <strong>{invitation?.email}</strong>.
              </p>
            </div>

            {submitError && (
              <div className="auth-page__banner auth-page__banner--danger" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-page__form" noValidate>
              <div className="auth-page__field-row">
                <div>
                  <label className="auth-page__label" htmlFor="inv-first-name">
                    First Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="inv-first-name"
                    name="first_name"
                    type="text"
                    className={`auth-page__input ${fieldErrors.first_name ? 'auth-page__input--error' : ''}`}
                    placeholder="Dr. Sarah"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
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
                  <label className="auth-page__label" htmlFor="inv-last-name">
                    Last Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="inv-last-name"
                    name="last_name"
                    type="text"
                    className={`auth-page__input ${fieldErrors.last_name ? 'auth-page__input--error' : ''}`}
                    placeholder="Jenkins"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
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
                <label className="auth-page__label" htmlFor="inv-email">
                  Email Address
                </label>
                <input
                  id="inv-email"
                  type="email"
                  className="auth-page__input auth-page__input--disabled"
                  value={invitation?.email || ''}
                  disabled
                />
              </div>

              <div className="auth-page__field-group">
                <div className="auth-page__label-wrapper">
                  <label className="auth-page__label" htmlFor="inv-password">
                    Create Password <span className="auth-page__label-required" aria-hidden="true">*</span>
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
                  id="inv-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`auth-page__input ${fieldErrors.password ? 'auth-page__input--error' : ''}`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
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
                <label className="auth-page__label" htmlFor="inv-password-confirm">
                  Confirm Password <span className="auth-page__label-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="inv-password-confirm"
                  name="password_confirm"
                  type={showPassword ? 'text' : 'password'}
                  className={`auth-page__input ${fieldErrors.password_confirm ? 'auth-page__input--error' : ''}`}
                  placeholder="••••••••"
                  value={formData.password_confirm}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.password_confirm)}
                />
                {fieldErrors.password_confirm && (
                  <div className="auth-page__field-error" role="alert">
                    {fieldErrors.password_confirm.join(' ')}
                  </div>
                )}
              </div>

              <div className="auth-page__schedule-wrap">
                <h3 className="auth-page__title" style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
                  Initial Weekly Schedule
                </h3>
                <p className="auth-page__subtitle" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  These working hours require organization manager approval before taking live bookings.
                </p>
                <ScheduleEditor days={schedule} onChange={setSchedule} />
                {fieldErrors.initial_schedule && (
                  <div className="auth-page__field-error" role="alert">
                    {JSON.stringify(fieldErrors.initial_schedule)}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="auth-page__submit-btn auth-page__submit-btn--provider"
              >
                {submitting ? 'Accepting Invitation...' : 'Accept Invitation & Complete Registration'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AcceptInvitationPage;
