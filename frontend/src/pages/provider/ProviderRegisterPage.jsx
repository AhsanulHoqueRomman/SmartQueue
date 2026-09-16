import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import organizationService from '../../services/organizationService';
import { RegistrationProgress } from '../../components/registration/RegistrationProgress';
import { PublicNavbar } from '../../components/PublicNavbar';

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

    // Step 3: Org
    organization_id: '',
  });

  const [publicOrgs, setPublicOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
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
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
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
      const res = await registerProvider(formData);
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
              maxWidth: '560px',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              border: '1px solid #E6E1D9',
              padding: '3rem 2.5rem',
              boxShadow: '0 12px 40px rgba(47, 37, 32, 0.06)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#FEF3C7',
                color: '#B06D2E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                margin: '0 auto 1.5rem auto',
              }}
            >
              ⏳
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#211C19', margin: '0 0 0.75rem 0', fontFamily: 'Cinzel, serif' }}>
              Application Submitted
            </h2>
            <p style={{ color: '#78716C', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Your provider profile has been created.<br />
              Your organization membership for <strong>{selectedOrgObj?.name || 'the selected organization'}</strong> is waiting for approval.
            </p>
            <div style={{ backgroundColor: '#FAF8F3', borderRadius: '12px', border: '1px solid #E6E1D9', padding: '1rem', fontSize: '0.875rem', color: '#5F7A70', marginBottom: '2rem' }}>
              ℹ️ You'll be able to access provider tools once your membership is approved by the organization manager.
            </div>
            <button
              onClick={() => navigate('/provider/dashboard')}
              style={{
                padding: '0.85rem 2rem',
                backgroundColor: '#2F2520',
                color: '#FAF8F3',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Go to Provider Portal →
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <div style={{ display: 'inline-block', backgroundColor: '#FAF8F3', border: '1px solid #E6E1D9', borderRadius: '9999px', padding: '0.2rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: '#B06D2E', marginBottom: '0.5rem' }}>
            🩺 Provider Registration
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#211C19', margin: '0 0 0.35rem 0', fontFamily: 'Cinzel, serif' }}>
            Join as a Service Provider
          </h2>
          <p style={{ color: '#78716C', fontSize: '0.9rem', margin: 0 }}>
            Manage appointments, service schedules, and queue telemetry.
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

        <form onSubmit={step === 4 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
          {/* STEP 1 — Account Details */}
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
                    placeholder="Dr. Sarah"
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
                    placeholder="Jenkins"
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
                  Email Address *
                </label>
                <input
                  name="email"
                  type="email"
                  className="form-control"
                  placeholder="sarah.jenkins@provider.com"
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
                  placeholder="+1 555-0188"
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

          {/* STEP 2 — Professional Profile */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                  Professional Title
                </label>
                <input
                  name="title"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Senior Dermatologist / Lead Stylist"
                  value={formData.title}
                  onChange={handleChange}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                  Professional Bio / Specialization Summary
                </label>
                <textarea
                  name="bio"
                  rows={4}
                  className="form-control"
                  placeholder="Describe your qualifications, expertise, or background..."
                  value={formData.bio}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          {/* STEP 3 — Organization Selection */}
          {step === 3 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Select Organization to Apply / Join (Optional)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Search clinics or organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ marginBottom: '1rem' }}
              />

              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid #E6E1D9',
                  borderRadius: '12px',
                  padding: '0.5rem',
                  backgroundColor: '#FAF8F3',
                  marginBottom: '1.25rem',
                }}
              >
                <div
                  onClick={() => setFormData((prev) => ({ ...prev, organization_id: '' }))}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formData.organization_id === '' ? '#FFFFFF' : 'transparent',
                    border: formData.organization_id === '' ? '1.5px solid #B06D2E' : '1px solid transparent',
                    marginBottom: '0.35rem',
                  }}
                >
                  <strong style={{ display: 'block', color: '#211C19', fontSize: '0.9rem' }}>
                    🌐 Skip Organization Selection for Now
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#78716C' }}>
                    You can join or be invited to an organization after account creation.
                  </span>
                </div>

                {filteredOrgs.map((org) => (
                  <div
                    key={org.id}
                    onClick={() => setFormData((prev) => ({ ...prev, organization_id: org.id }))}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: String(formData.organization_id) === String(org.id) ? '#FFFFFF' : 'transparent',
                      border: String(formData.organization_id) === String(org.id) ? '1.5px solid #B06D2E' : '1px solid transparent',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <strong style={{ display: 'block', color: '#211C19', fontSize: '0.9rem' }}>
                      🏥 {org.name}
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#78716C' }}>
                      {org.address || 'SmartQueue Registered Partner'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4 — Review */}
          {step === 4 && (
            <div>
              <div style={{ backgroundColor: '#FAF8F3', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#B06D2E', marginBottom: '0.5rem' }}>
                  Account Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem', color: '#211C19', marginBottom: '1.25rem' }}>
                  <div><strong>Name:</strong> {formData.first_name} {formData.last_name}</div>
                  <div><strong>Email:</strong> {formData.email}</div>
                  <div><strong>Phone:</strong> {formData.phone_number || 'N/A'}</div>
                </div>

                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#B06D2E', marginBottom: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #E6E1D9' }}>
                  Professional Profile
                </div>
                <div style={{ fontSize: '0.9rem', color: '#211C19', marginBottom: '1.25rem' }}>
                  <div><strong>Title:</strong> {formData.title || 'Service Provider'}</div>
                  <div style={{ marginTop: '0.35rem' }}><strong>Bio:</strong> {formData.bio || 'None provided'}</div>
                </div>

                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#B06D2E', marginBottom: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #E6E1D9' }}>
                  Selected Organization Application
                </div>
                <div style={{ fontSize: '0.9rem', color: '#211C19' }}>
                  <div>
                    <strong>Organization:</strong>{' '}
                    {selectedOrgObj ? selectedOrgObj.name : 'None selected (Independent Account)'}
                  </div>
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

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                style={{
                  marginLeft: 'auto',
                  padding: '0.85rem 1.75rem',
                  backgroundColor: '#B06D2E',
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
                  backgroundColor: '#B06D2E',
                  color: '#FAF8F3',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(176, 109, 46, 0.2)',
                }}
                disabled={submitting}
              >
                {submitting ? 'Submitting Application...' : 'Submit Provider Registration'}
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

export default ProviderRegisterPage;
