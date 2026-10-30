import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { RegistrationProgress } from '../../components/registration/RegistrationProgress';
import { PublicNavbar } from '../../components/PublicNavbar';
import AuthFooter from '../../components/AuthFooter';
import '../../styles/AuthPages.css';

export const ManagerRegisterPage = () => {
  const [step, setStep] = useState(1);
  const steps = ['Personal Info', 'Organization', 'Review & Create'];

  const [formData, setFormData] = useState({
    // Step 1: User Info
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    password: '',
    password_confirm: '',

    // Step 2: Organization Info
    organization_name: '',
    organization_type: 'Healthcare',
    description: '',
    organization_phone: '',
    organization_email: '',
    address: '',
    city: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { registerManager } = useAuth();
  const navigate = useNavigate();

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

  const validateStep2 = () => {
    setFieldErrors({});
    setError(null);
    const errs = {};

    if (!formData.organization_name) errs.organization_name = ['Organization name is required.'];

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await registerManager(formData);
      navigate('/manager/dashboard', { replace: true });
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
                <span className="auth-page__badge auth-page__badge--espresso">
                  🏢 Manager Registration
                </span>
              </div>
              <h1 className="auth-page__title">Create Organization & Account</h1>
              <p className="auth-page__subtitle">
                Set up your facility organization and manage team operations.
              </p>
            </div>

            <RegistrationProgress steps={steps} currentStep={step} />

            {error && (
              <div className="auth-page__banner auth-page__banner--danger" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="auth-page__form" noValidate>
              {/* STEP 1 — Personal Information */}
              {step === 1 && (
                <div>
                  <div className="auth-page__field-row">
                    <div>
                      <label className="auth-page__label" htmlFor="mgr-first-name">
                        First Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="mgr-first-name"
                        name="first_name"
                        type="text"
                        className={`auth-page__input ${fieldErrors.first_name ? 'auth-page__input--error' : ''}`}
                        placeholder="Jane"
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
                      <label className="auth-page__label" htmlFor="mgr-last-name">
                        Last Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="mgr-last-name"
                        name="last_name"
                        type="text"
                        className={`auth-page__input ${fieldErrors.last_name ? 'auth-page__input--error' : ''}`}
                        placeholder="Doe"
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
                    <label className="auth-page__label" htmlFor="mgr-email">
                      Work Email Address <span className="auth-page__label-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="mgr-email"
                      name="email"
                      type="email"
                      className={`auth-page__input ${fieldErrors.email ? 'auth-page__input--error' : ''}`}
                      placeholder="manager@organization.com"
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
                    <label className="auth-page__label" htmlFor="mgr-phone">
                      Phone Number
                    </label>
                    <input
                      id="mgr-phone"
                      name="phone_number"
                      type="tel"
                      className="auth-page__input"
                      placeholder="+1 555-0192"
                      value={formData.phone_number}
                      onChange={handleChange}
                      autoComplete="tel"
                    />
                  </div>

                  <div className="auth-page__field-group">
                    <div className="auth-page__label-wrapper">
                      <label className="auth-page__label" htmlFor="mgr-password">
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
                      id="mgr-password"
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
                    <label className="auth-page__label" htmlFor="mgr-password-confirm">
                      Confirm Password <span className="auth-page__label-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="mgr-password-confirm"
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

              {/* STEP 2 — Organization Information */}
              {step === 2 && (
                <div>
                  <div className="auth-page__field-group">
                    <label className="auth-page__label" htmlFor="org-name">
                      Organization Name <span className="auth-page__label-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="org-name"
                      name="organization_name"
                      type="text"
                      className={`auth-page__input ${fieldErrors.organization_name ? 'auth-page__input--error' : ''}`}
                      placeholder="e.g. Apex Health & Beauty Clinic"
                      value={formData.organization_name}
                      onChange={handleChange}
                      required
                      aria-invalid={Boolean(fieldErrors.organization_name)}
                    />
                    {fieldErrors.organization_name && (
                      <div className="auth-page__field-error" role="alert">
                        {fieldErrors.organization_name.join(' ')}
                      </div>
                    )}
                  </div>

                  <div className="auth-page__field-group">
                    <label className="auth-page__label" htmlFor="org-type">
                      Organization Category
                    </label>
                    <select
                      id="org-type"
                      name="organization_type"
                      className="auth-page__select"
                      value={formData.organization_type}
                      onChange={handleChange}
                    >
                      <option value="Healthcare">Healthcare & Diagnostics</option>
                      <option value="Salon & Beauty">Salon & Beauty Spa</option>
                      <option value="Corporate Consulting">Corporate & Legal Consulting</option>
                      <option value="Repair & Service">Repair & Auto Service</option>
                      <option value="Other">Other Service Center</option>
                    </select>
                  </div>

                  <div className="auth-page__field-row">
                    <div>
                      <label className="auth-page__label" htmlFor="org-phone">
                        Organization Phone
                      </label>
                      <input
                        id="org-phone"
                        name="organization_phone"
                        type="tel"
                        className="auth-page__input"
                        placeholder="+1 555-0199"
                        value={formData.organization_phone}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <label className="auth-page__label" htmlFor="org-email">
                        Organization Email
                      </label>
                      <input
                        id="org-email"
                        name="organization_email"
                        type="email"
                        className="auth-page__input"
                        placeholder="contact@org.com"
                        value={formData.organization_email}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div className="auth-page__field-group">
                    <label className="auth-page__label" htmlFor="org-address">
                      Address & City
                    </label>
                    <input
                      id="org-address"
                      name="address"
                      type="text"
                      className="auth-page__input"
                      placeholder="123 Health Ave, Suite 400, Dhaka"
                      value={formData.address}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* STEP 3 — Review & Create */}
              {step === 3 && (
                <div>
                  <div className="auth-page__summary-box">
                    <div className="auth-page__summary-header">
                      Personal Information
                    </div>
                    <div className="auth-page__summary-grid">
                      <div><strong>Name:</strong> {formData.first_name} {formData.last_name}</div>
                      <div><strong>Email:</strong> {formData.email}</div>
                      <div><strong>Phone:</strong> {formData.phone_number || 'N/A'}</div>
                    </div>

                    <div className="auth-page__summary-divider" />

                    <div className="auth-page__summary-header">
                      Organization Details
                    </div>
                    <div className="auth-page__summary-grid">
                      <div><strong>Name:</strong> {formData.organization_name}</div>
                      <div><strong>Category:</strong> {formData.organization_type}</div>
                      <div><strong>Org Phone:</strong> {formData.organization_phone || 'N/A'}</div>
                      <div><strong>Address:</strong> {formData.address || 'N/A'}</div>
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

                {step < 3 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="auth-page__submit-btn"
                    style={{ width: 'auto', padding: '0.85rem 2rem' }}
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="auth-page__submit-btn"
                    disabled={submitting}
                  >
                    {submitting ? 'Creating Organization...' : 'Create Organization & Account'}
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
      <AuthFooter />
    </div>
  );
};

export default ManagerRegisterPage;
