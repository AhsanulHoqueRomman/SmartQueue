import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { RegistrationProgress } from '../../components/registration/RegistrationProgress';
import { PublicNavbar } from '../../components/PublicNavbar';

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
          maxWidth: '640px',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: '1px solid #E6E1D9',
          padding: '2.5rem',
          boxShadow: '0 12px 40px rgba(47, 37, 32, 0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
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
          <div style={{ display: 'inline-block', backgroundColor: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '9999px', padding: '0.2rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: '#2F2520', marginBottom: '0.5rem' }}>
            🏢 Manager Registration
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#211C19', margin: '0 0 0.35rem 0', fontFamily: 'Cinzel, serif' }}>
            Create Organization & Account
          </h2>
          <p style={{ color: '#78716C', fontSize: '0.9rem', margin: 0 }}>
            Set up your organization and manage team operations.
          </p>
        </div>

        <RegistrationProgress steps={steps} currentStep={step} />

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

        <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
          {/* STEP 1 — Personal Information */}
          {step === 1 && (
            <div>
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
                  Work Email Address *
                </label>
                <input
                  name="email"
                  type="email"
                  className="form-control"
                  placeholder="manager@organization.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
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
                />
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
                />
                {fieldErrors.password_confirm && (
                  <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.password_confirm.join(' ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2 — Organization Information */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                  Organization Name *
                </label>
                <input
                  name="organization_name"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Apex Health & Beauty Clinic"
                  value={formData.organization_name}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.organization_name && (
                  <div style={{ color: '#B4534B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.organization_name.join(' ')}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                  Organization Category
                </label>
                <select
                  name="organization_type"
                  className="form-control"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                    Organization Phone
                  </label>
                  <input
                    name="organization_phone"
                    type="tel"
                    className="form-control"
                    placeholder="+1 555-0199"
                    value={formData.organization_phone}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                    Organization Email
                  </label>
                  <input
                    name="organization_email"
                    type="email"
                    className="form-control"
                    placeholder="contact@org.com"
                    value={formData.organization_email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                  Address & City
                </label>
                <input
                  name="address"
                  type="text"
                  className="form-control"
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
              <div style={{ backgroundColor: '#FAF8F3', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#5F7A70', marginBottom: '0.5rem' }}>
                  Personal Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem', color: '#211C19', marginBottom: '1.25rem' }}>
                  <div><strong>Name:</strong> {formData.first_name} {formData.last_name}</div>
                  <div><strong>Email:</strong> {formData.email}</div>
                  <div><strong>Phone:</strong> {formData.phone_number || 'N/A'}</div>
                </div>

                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#5F7A70', marginBottom: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #E6E1D9' }}>
                  Organization Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem', color: '#211C19' }}>
                  <div><strong>Name:</strong> {formData.organization_name}</div>
                  <div><strong>Category:</strong> {formData.organization_type}</div>
                  <div><strong>Org Phone:</strong> {formData.organization_phone || 'N/A'}</div>
                  <div><strong>Address:</strong> {formData.address || 'N/A'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1.75rem' }}>
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  padding: '0.85rem 1.25rem',
                  backgroundColor: '#FAF8F3',
                  color: '#211C19',
                  border: '1px solid #E6E1D9',
                  borderRadius: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                style={{
                  marginLeft: 'auto',
                  padding: '0.85rem 1.75rem',
                  backgroundColor: '#2F2520',
                  color: '#FAF8F3',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  backgroundColor: '#2F2520',
                  color: '#FAF8F3',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(47, 37, 32, 0.2)',
                }}
                disabled={submitting}
              >
                {submitting ? 'Creating Organization...' : 'Create Organization & Account'}
              </button>
            )}
          </div>
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

export default ManagerRegisterPage;
