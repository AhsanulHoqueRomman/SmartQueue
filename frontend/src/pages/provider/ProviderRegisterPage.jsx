import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import organizationService from '../../services/organizationService';
import { RegistrationProgress } from '../../components/registration/RegistrationProgress';
import { ScheduleEditor } from '../../components/ScheduleEditor';
import { initialSchedule } from '../../utils/scheduleDraft';
import { PublicNavbar } from '../../components/PublicNavbar';
import '../../styles/AuthPages.css';

export const ProviderRegisterPage = () => {
  const [step, setStep] = useState(1);
  const steps = ['Account Details', 'Professional Profile', 'Organization', 'Review'];

  const [formData, setFormData] = useState({
    // Step 1: Account
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    password: '',
    password_confirm: '',

    // Step 2: Profile
    title: '',
    bio: '',
    average_service_minutes: '',

    // Step 3: Org
    organization_id: '',
    initial_schedule: initialSchedule(),
  });

  const [publicOrgs, setPublicOrgs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedPending, setSubmittedPending] = useState(false);

  const { registerProvider } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    organizationService.getOrganizations()
      .then((data) => {
        const list = Array.isArray(data) ? data : data.results || [];
        setPublicOrgs(list);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep1 = () => {
    setFieldErrors({});
    setError(null);
    const errs = {};

    if (!formData.first_name) errs.first_name = ['First name is required.'];
    if (!formData.last_name) errs.last_name = ['Last name is required.'];
    if (!formData.email) errs.email = ['Email address is required.'];
    if (!formData.password) errs.password = ['Password is required.'];
    if (formData.password !== formData.password_confirm) {
      errs.password_confirm = ['Passwords do not match.'];
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2) {
      const average = Number(formData.average_service_minutes);
      if (formData.average_service_minutes !== '' && (!Number.isInteger(average) || average < 1)) {
        setFieldErrors({ average_service_minutes: ['Enter a positive whole number of minutes.'] });
        return;
      }
      setFieldErrors({});
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const average = Number(formData.average_service_minutes);
    if (formData.organization_id && (!Number.isInteger(average) || average < 1)) {
      setFieldErrors({ average_service_minutes: ['Enter a positive whole number of minutes for your organization provider profile.'] });
      setStep(2);
      return;
    }
    setSubmitting(true);

    try {
      const payload = { ...formData };
      payload.average_service_minutes = Number(formData.average_service_minutes);
      if (!payload.organization_id) {
        delete payload.initial_schedule;
        delete payload.average_service_minutes;
      }
      const res = await registerProvider(payload);
      if (res.is_pending_approval) {
        setSubmittedPending(true);
      } else {
        navigate('/provider/dashboard', { replace: true });
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

  const filteredOrgs = publicOrgs.filter((org) =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (org.slug && org.slug.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedOrgObj = publicOrgs.find((o) => String(o.id) === String(formData.organization_id));

  if (submittedPending) {
    return (
      <div className="auth-page">
        <PublicNavbar activePage="register" />
        <main className="auth-page__main animate-page-entrance">
          <div className="auth-page__content-wrap">
            <div className="auth-card">
              <div className="auth-page__status-card">
                <div className="auth-page__status-icon auth-page__status-icon--warning" aria-hidden="true">
                  ⏳
                </div>
                <h1 className="auth-page__status-title">Application Submitted</h1>
                <p className="auth-page__status-desc">
                  Your provider profile has been created.<br />
                  Your organization membership for <strong>{selectedOrgObj?.name || 'the selected organization'}</strong> is waiting for approval.
                </p>
                <div className="auth-page__banner auth-page__banner--info" style={{ textAlign: 'left', marginBottom: '1.75rem' }}>
                  <span aria-hidden="true">ℹ️</span>
                  <span>You will be able to access organization provider tools once your membership is approved by the facility manager.</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/provider/dashboard')}
                  className="auth-page__submit-btn auth-page__submit-btn--provider"
                >
                  Go to Provider Portal →
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <PublicNavbar activePage="register" />
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
                  🩺 Provider Registration
                </span>
              </div>
              <h1 className="auth-page__title">Join as a Service Provider</h1>
              <p className="auth-page__subtitle">
                Manage appointments, service schedules, and queue telemetry.
              </p>
            </div>

            <RegistrationProgress steps={steps} currentStep={step} />

            {error && (
              <div className="auth-page__banner auth-page__banner--danger" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={step === 4 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="auth-page__form" noValidate>
              {/* STEP 1 — Account Details */}
              {step === 1 && (
                <div>
                  <div className="auth-page__field-row">
                    <div>
                      <label className="auth-page__label" htmlFor="prov-first-name">
                        First Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="prov-first-name"
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
                      <label className="auth-page__label" htmlFor="prov-last-name">
                        Last Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="prov-last-name"
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
                    <label className="auth-page__label" htmlFor="prov-email">
                      Email Address <span className="auth-page__label-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="prov-email"
                      name="email"
                      type="email"
                      className={`auth-page__input ${fieldErrors.email ? 'auth-page__input--error' : ''}`}
                      placeholder="sarah.jenkins@provider.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
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
                    <label className="auth-page__label" htmlFor="prov-phone">
                      Phone Number
                    </label>
                    <input
                      id="prov-phone"
                      name="phone_number"
                      type="tel"
                      className="auth-page__input"
                      placeholder="+1 555-0188"
                      value={formData.phone_number}
                      onChange={handleChange}
                      autoComplete="tel"
                    />
                  </div>

                  <div className="auth-page__field-group">
                    <div className="auth-page__label-wrapper">
                      <label className="auth-page__label" htmlFor="prov-password">
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
                      id="prov-password"
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
                    <label className="auth-page__label" htmlFor="prov-password-confirm">
                      Confirm Password <span className="auth-page__label-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="prov-password-confirm"
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
                </div>
              )}

              {/* STEP 2 — Professional Profile */}
              {step === 2 && (
                <div>
                  <div className="auth-page__field-group">
                    <label className="auth-page__label" htmlFor="prov-title">
                      Professional Title
                    </label>
                    <input
                      id="prov-title"
                      name="title"
                      type="text"
                      className="auth-page__input"
                      placeholder="e.g. Senior Dermatologist / Lead Consultant"
                      value={formData.title}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="auth-page__field-group">
                    <label className="auth-page__label" htmlFor="prov-bio">
                      Professional Bio / Specialization Summary
                    </label>
                    <textarea
                      id="prov-bio"
                      name="bio"
                      rows={4}
                      className="auth-page__textarea"
                      placeholder="Describe your qualifications, expertise, or background..."
                      value={formData.bio}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="auth-page__field-group">
                    <label className="auth-page__label" htmlFor="prov-avg-time">
                      Average service time (minutes)
                    </label>
                    <input
                      id="prov-avg-time"
                      type="number"
                      min="1"
                      step="1"
                      name="average_service_minutes"
                      className={`auth-page__input ${fieldErrors.average_service_minutes ? 'auth-page__input--error' : ''}`}
                      placeholder="e.g. 15"
                      value={formData.average_service_minutes}
                      onChange={handleChange}
                      aria-invalid={Boolean(fieldErrors.average_service_minutes)}
                    />
                    <p className="auth-page__field-hint">
                      Required when joining an organization. One planning average for that provider queue, not a fixed consultation timer. If you skip organization selection, configure the average when your provider profile is created.
                    </p>
                    {fieldErrors.average_service_minutes && (
                      <div className="auth-page__field-error" role="alert">
                        {fieldErrors.average_service_minutes[0]}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3 — Organization Selection */}
              {step === 3 && (
                <div>
                  <label className="auth-page__label" htmlFor="org-search-input" style={{ marginBottom: '0.45rem' }}>
                    Select Organization to Apply / Join (Optional)
                  </label>
                  <input
                    id="org-search-input"
                    type="text"
                    className="auth-page__input"
                    placeholder="Search clinics or facilities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ marginBottom: '1rem' }}
                  />

                  <div className="auth-page__org-list">
                    <div
                      onClick={() => setFormData((prev) => ({ ...prev, organization_id: '' }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFormData((prev) => ({ ...prev, organization_id: '' }));
                        }
                      }}
                      className={`auth-page__org-item ${formData.organization_id === '' ? 'auth-page__org-item--selected' : ''}`}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="auth-page__org-item-name">
                        🌐 Skip Organization Selection for Now
                      </span>
                      <span className="auth-page__org-item-sub">
                        You can join or be invited to an organization after account creation.
                      </span>
                    </div>

                    {filteredOrgs.map((org) => {
                      const isSelected = String(formData.organization_id) === String(org.id);
                      return (
                        <div
                          key={org.id}
                          onClick={() => setFormData((prev) => ({ ...prev, organization_id: org.id }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setFormData((prev) => ({ ...prev, organization_id: org.id }));
                            }
                          }}
                          className={`auth-page__org-item ${isSelected ? 'auth-page__org-item--selected' : ''}`}
                          role="button"
                          tabIndex={0}
                        >
                          <span className="auth-page__org-item-name">
                            🏥 {org.name}
                          </span>
                          <span className="auth-page__org-item-sub">
                            {org.address || 'QueueTurn Registered Facility'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 4 — Schedule Editor (if organization selected) */}
              {step === 4 && formData.organization_id && (
                <div className="auth-page__schedule-wrap">
                  <h3 className="auth-page__title" style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
                    Initial Working Schedule
                  </h3>
                  <p className="auth-page__subtitle" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                    Your organization manager reviews this schedule with your application before it becomes bookable. Working hours must end by 10 PM.
                  </p>
                  <ScheduleEditor
                    days={formData.initial_schedule}
                    onChange={(days) => setFormData((prev) => ({ ...prev, initial_schedule: days }))}
                  />
                </div>
              )}

              {/* STEP 4 — Review Summary */}
              {step === 4 && (
                <div>
                  <div className="auth-page__summary-box">
                    <div className="auth-page__summary-header">
                      Account Information
                    </div>
                    <div className="auth-page__summary-grid">
                      <div><strong>Name:</strong> {formData.first_name} {formData.last_name}</div>
                      <div><strong>Email:</strong> {formData.email}</div>
                      <div><strong>Phone:</strong> {formData.phone_number || 'N/A'}</div>
                    </div>

                    <div className="auth-page__summary-divider" />

                    <div className="auth-page__summary-header">
                      Professional Profile
                    </div>
                    <div style={{ fontSize: '0.9375rem', color: 'var(--lp-text)' }}>
                      <div><strong>Title:</strong> {formData.title || 'Service Provider'}</div>
                      <div style={{ marginTop: '0.35rem' }}><strong>Bio:</strong> {formData.bio || 'None provided'}</div>
                      {formData.organization_id && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <strong>Average Service Time:</strong> {formData.average_service_minutes} minutes
                        </div>
                      )}
                    </div>

                    <div className="auth-page__summary-divider" />

                    <div className="auth-page__summary-header">
                      Selected Organization Application
                    </div>
                    <div style={{ fontSize: '0.9375rem', color: 'var(--lp-text)' }}>
                      <div>
                        <strong>Organization:</strong>{' '}
                        {selectedOrgObj ? selectedOrgObj.name : 'None selected (Independent Account)'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="auth-page__actions">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="auth-page__secondary-btn"
                  >
                    ← Back
                  </button>
                ) : <div />}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="auth-page__submit-btn auth-page__submit-btn--provider"
                    style={{ width: 'auto', padding: '0.85rem 2rem' }}
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="auth-page__submit-btn auth-page__submit-btn--provider"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting Application...' : 'Submit Provider Registration'}
                  </button>
                )}
              </div>
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
    </div>
  );
};

export default ProviderRegisterPage;
