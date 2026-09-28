import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { contactService } from '../../services/contactService';
import '../../styles/ContactPage.css';

/* ─── Tiny SVG Icon Components ─────────────────────────────────────────── */
const IconEnvelope = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const SK = {
  bg: '#FAF8F3',
  surface: '#FFFFFF',
  border: '#E6E1D9',
  espresso: '#2F2520',
  text: '#211C19',
  muted: '#78716C',
  sage: '#5F7A70',
  danger: '#B4534B',
  success: '#4F7A5A',
};

const SUBJECT_OPTIONS = [
  'General Inquiry',
  'Appointment Help',
  'Billing Question',
  'Technical Issue',
  'Account Support',
  'Partner / Provider',
  'Other',
];

function buildName(user) {
  if (!user) return '';
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return '';
}

export function ContactPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const prefillName = buildName(user);
  const prefillEmail = user?.email || '';

  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('General Inquiry');
  const [message, setMessage] = useState('');

  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [submitError, setSubmitError] = useState(null);
  const [touched, setTouched] = useState({});

  const isSubmitting = status === 'submitting';

  const validate = (field) => {
    const trimmed = (field === 'name' ? name : field === 'email' ? email : field === 'subject' ? subject : field === 'message' ? message : null) || '';
    const val = trimmed.trim();
    if (field === 'name') return val.length === 0 ? 'Name is required.' : null;
    if (field === 'email') {
      if (val.length === 0) return 'Email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Enter a valid email address.';
      return null;
    }
    if (field === 'subject') return val.length === 0 ? 'Subject is required.' : null;
    if (field === 'message') {
      if (val.length === 0) return 'Message is required.';
      if (val.length > 5000) return 'Message must be 5000 characters or fewer.';
      return null;
    }
    return null;
  };

  const globalErrors = (() => {
    const errs = {};
    ['name', 'email', 'subject', 'message'].forEach((f) => {
      const e = validate(f);
      if (e) errs[f] = e;
    });
    return errs;
  })();

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const errs = {};
    ['name', 'email', 'subject', 'message'].forEach((f) => {
      const err = validate(f);
      if (err) errs[f] = err;
    });

    if (Object.keys(errs).length > 0) {
      setTouched({ name: true, email: true, subject: true, message: true });
      setSubmitError('Please fix the highlighted fields and try again.');
      return;
    }

    setStatus('submitting');

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        subject: subject.trim(),
        message: message.trim(),
      };

      await contactService.submit(payload);

      setStatus('success');
      showSuccess('Your message has been sent. We’ll get back to you as soon as possible.');

      // Reset only the fields that a visitor would normally fill.
      // Logged-in users keep their prefilled name/email so they can send again quickly.
      if (!user) {
        setName('');
      }
      setPhone('');
      setMessage('');
    } catch (err) {
      setStatus('error');

      const httpStatus = err?.response?.status;
      const data = err?.response?.data;

      if (httpStatus === 429) {
        setSubmitError('Too many requests. Please wait a moment and try again.');
        showError('Too many requests. Please wait and try again.');
      } else if (httpStatus === 400 && data) {
        // Field-level validation errors from the API
        const firstField = Object.keys(data)[0];
        const firstMsg = Array.isArray(data[firstField])
          ? data[firstField][0]
          : 'Please check the highlighted fields.';
        setSubmitError(firstMsg);
        showError(firstMsg);
      } else {
        // Network error or server error
        setSubmitError('We could not send your message. Please check your connection and try again.');
        showError('We could not send your message. Please try again.');
      }
    }
  };

  const fieldError = (field) => touched[field] ? globalErrors[field] : null;

  return (
    <div className="cp-root">
      {/* ── Top Navigation ─────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a
            href="/"
            className="lp-brand"
            onClick={(e) => {
              if (window.location.pathname === '/contact') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <span className="lp-brand-mark">
              <IconEnvelope />
            </span>
            <span className="lp-brand-name">SmartQueue</span>
          </a>

          <nav className="lp-nav-links">
            <a href="/organizations" className="lp-nav-link">Organizations</a>
            <a href="/search" className="lp-nav-link">Search</a>
            <a href="/#how-it-works" className="lp-nav-link">How it works</a>
            <a href="/#why-smartqueue" className="lp-nav-link">Why SmartQueue</a>
          </nav>

          <div className="lp-nav-cta">
            {user ? (
              <a href="/dashboard" className="lp-btn-primary">
                Dashboard →
              </a>
            ) : (
              <>
                <a href="/login" className="lp-btn-ghost">Sign in</a>
                <a href="/register" className="lp-btn-primary">Get started</a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Page Content ──────────────────────────────────────────────── */}
      <main
        style={{
          background: SK.bg,
          minHeight: '100vh',
          paddingTop: '5.5rem',
          paddingBottom: '4rem',
          overflowX: 'clip',
        }}
      >
        <div
          className="container"
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            padding: '0 1.5rem',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span
              style={{
                color: SK.sage,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Get in touch
            </span>
            <h1
              style={{
                fontSize: 'clamp(1.875rem, 4vw, 2.5rem)',
                fontFamily: "'Cinzel', serif",
                fontWeight: 800,
                color: SK.espresso,
                marginTop: '0.35rem',
                marginBottom: '0.5rem',
                letterSpacing: '-0.02em',
              }}
            >
              Contact Us
            </h1>
            <p
              style={{
                color: SK.muted,
                fontSize: '0.975rem',
                maxWidth: '480px',
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              Have a question or need support? Fill out the form and our team will get back to you as soon as possible.
            </p>
          </div>

          {/* Success State */}
          {status === 'success' && (
            <div
              className="cp-card cp-success-card"
              role="status"
              aria-live="polite"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ color: SK.success, display: 'flex', alignItems: 'center' }}>
                  <IconCheck />
                </span>
                <h2
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: SK.success,
                    margin: 0,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  Message sent
                </h2>
              </div>
              <p style={{ color: SK.muted, fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
                Thanks for reaching out, {name || 'there'}. We’ve received your message and will reply to{' '}
                <strong style={{ color: SK.text }}>{email}</strong> soon.
              </p>
              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="lp-btn-primary"
                  onClick={() => {
                    setStatus('idle');
                    if (!user) setName('');
                    setPhone('');
                    setMessage('');
                    setTouched({});
                  }}
                >
                  Send another message
                </button>
                <a href="/" className="lp-btn-outline-light">
                  Back to home
                </a>
              </div>
            </div>
          )}

          {/* Form */}
          {status !== 'success' && (
            <form
              className="cp-card"
              onSubmit={handleSubmit}
              noValidate
              style={{
                background: SK.surface,
                borderRadius: '16px',
                border: `1px solid ${SK.border}`,
                padding: '2rem',
                boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
              }}
            >
              {/* Submit error banner */}
              {submitError && (
                <div
                  className="cp-field-error"
                  role="alert"
                  aria-live="polite"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.75rem 1rem',
                    background: '#FDF2F2',
                    border: '1px solid #F5C6C6',
                    borderRadius: '10px',
                    color: '#8C2B2B',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '1.25rem',
                  }}
                >
                  <span style={{ color: '#B4534B', display: 'flex', alignItems: 'center' }}>
                    <IconAlert />
                  </span>
                  {submitError}
                </div>
              )}

              {/* Name */}
              <div style={{ marginBottom: '1.1rem' }}>
                <label
                  htmlFor="cp-name"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: SK.text,
                    marginBottom: '0.35rem',
                  }}
                >
                  Name *
                </label>
                <input
                  id="cp-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => handleBlur('name')}
                  disabled={isSubmitting}
                  aria-invalid={fieldError('name') ? 'true' : 'false'}
                  aria-describedby={fieldError('name') ? 'cp-name-error' : undefined}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.95rem',
                    color: SK.text,
                    background: SK.surface,
                    border: `1px solid ${fieldError('name') ? SK.danger : SK.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: fieldError('name') ? '0 0 0 3px rgba(180, 83, 75, 0.12)' : 'none',
                  }}
                />
                {fieldError('name') && (
                  <p
                    id="cp-name-error"
                    style={{
                      margin: '0.35rem 0 0 0',
                      fontSize: '0.8rem',
                      color: SK.danger,
                      fontWeight: 600,
                    }}
                  >
                    {fieldError('name')}
                  </p>
                )}
              </div>

              {/* Email */}
              <div style={{ marginBottom: '1.1rem' }}>
                <label
                  htmlFor="cp-email"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: SK.text,
                    marginBottom: '0.35rem',
                  }}
                >
                  Email *
                </label>
                <input
                  id="cp-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  disabled={isSubmitting}
                  aria-invalid={fieldError('email') ? 'true' : 'false'}
                  aria-describedby={fieldError('email') ? 'cp-email-error' : undefined}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.95rem',
                    color: SK.text,
                    background: SK.surface,
                    border: `1px solid ${fieldError('email') ? SK.danger : SK.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: fieldError('email') ? '0 0 0 3px rgba(180, 83, 75, 0.12)' : 'none',
                  }}
                />
                {fieldError('email') && (
                  <p
                    id="cp-email-error"
                    style={{
                      margin: '0.35rem 0 0 0',
                      fontSize: '0.8rem',
                      color: SK.danger,
                      fontWeight: 600,
                    }}
                  >
                    {fieldError('email')}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div style={{ marginBottom: '1.1rem' }}>
                <label
                  htmlFor="cp-phone"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: SK.text,
                    marginBottom: '0.35rem',
                  }}
                >
                  Phone <span style={{ color: SK.muted, fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="cp-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.95rem',
                    color: SK.text,
                    background: SK.surface,
                    border: `1px solid ${SK.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    transition: 'border-color 0.15s ease',
                  }}
                  placeholder="+1 234 567 8900"
                />
              </div>

              {/* Subject */}
              <div style={{ marginBottom: '1.1rem' }}>
                <label
                  htmlFor="cp-subject"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: SK.text,
                    marginBottom: '0.35rem',
                  }}
                >
                  Subject *
                </label>
                <select
                  id="cp-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onBlur={() => handleBlur('subject')}
                  disabled={isSubmitting}
                  aria-invalid={fieldError('subject') ? 'true' : 'false'}
                  aria-describedby={fieldError('subject') ? 'cp-subject-error' : undefined}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.95rem',
                    color: SK.text,
                    background: SK.surface,
                    border: `1px solid ${fieldError('subject') ? SK.danger : SK.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    appearance: 'none',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: fieldError('subject') ? '0 0 0 3px rgba(180, 83, 75, 0.12)' : 'none',
                  }}
                >
                  {SUBJECT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {fieldError('subject') && (
                  <p
                    id="cp-subject-error"
                    style={{
                      margin: '0.35rem 0 0 0',
                      fontSize: '0.8rem',
                      color: SK.danger,
                      fontWeight: 600,
                    }}
                  >
                    {fieldError('subject')}
                  </p>
                )}
              </div>

              {/* Message */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="cp-message"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: SK.text,
                    marginBottom: '0.35rem',
                  }}
                >
                  Message *
                </label>
                <textarea
                  id="cp-message"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onBlur={() => handleBlur('message')}
                  disabled={isSubmitting}
                  aria-invalid={fieldError('message') ? 'true' : 'false'}
                  aria-describedby={fieldError('message') ? 'cp-message-error' : undefined}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.95rem',
                    color: SK.text,
                    background: SK.surface,
                    border: `1px solid ${fieldError('message') ? SK.danger : SK.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: '120px',
                    lineHeight: 1.6,
                    fontFamily: "'Outfit', sans-serif",
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: fieldError('message') ? '0 0 0 3px rgba(180, 83, 75, 0.12)' : 'none',
                  }}
                  placeholder="Tell us how we can help..."
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.35rem',
                  }}
                >
                  {fieldError('message') && (
                    <p
                      id="cp-message-error"
                      style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: SK.danger,
                        fontWeight: 600,
                      }}
                    >
                      {fieldError('message')}
                    </p>
                  )}
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '0.75rem',
                      color: message.length > 4500 ? SK.danger : SK.muted,
                      fontWeight: 600,
                    }}
                  >
                    {message.length} / 5000
                  </span>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="lp-btn-primary lp-btn-lg"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '0.85rem 1.5rem',
                  background: isSubmitting ? SK.muted : SK.espresso,
                  color: SK.surface,
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: isSubmitting ? 'none' : '0 4px 12px rgba(47, 37, 32, 0.15)',
                  opacity: isSubmitting ? 0.85 : 1,
                  transition: 'background-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {isSubmitting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        width: '16px',
                        height: '16px',
                        animation: 'cp-spin 0.8s linear infinite',
                      }}
                    >
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <IconSend />
                    Send message
                  </span>
                )}
              </button>

              <p
                style={{
                  margin: '1.1rem 0 0 0',
                  fontSize: '0.8rem',
                  color: SK.muted,
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                We’ll only use your information to respond to this inquiry.
              </p>
            </form>
          )}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <a href="/" className="lp-brand">
              <span className="lp-brand-mark lp-brand-mark--sm">
                <IconEnvelope />
              </span>
              <span className="lp-brand-name">SmartQueue</span>
            </a>
            <p className="lp-footer-tagline">
              Multi-tenant appointment & queue management SaaS platform.
            </p>
          </div>
          <div
            className="lp-footer-links"
            style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}
          >
            <a
              href="/contact"
              className="lp-footer-link"
              style={{ fontWeight: 700, color: SK.sage }}
            >
              Contact Us
            </a>
            <a
              href={`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'}/api/docs/`}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-footer-link"
              style={{ fontWeight: 600 }}
            >
              API Docs
            </a>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span className="lp-footer-copy">© {new Date().getFullYear()} SmartQueue. All rights reserved.</span>
        </div>
      </footer>

      {/* Page entrance animation (respects reduced motion) */}
      <style>{`
        @keyframes cp-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .cp-root *,
          .cp-root *::before,
          .cp-root *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

export default ContactPage;
