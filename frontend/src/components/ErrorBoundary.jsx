import React from 'react';
import { useLocation } from 'react-router-dom';

export class ErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught React ErrorBoundary caught an exception:', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.locationKey !== this.props.locationKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: 'var(--lp-bg, #0B0F17)',
            color: 'var(--lp-text, #E2E8F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: 'var(--lp-surface, #141B2D)',
              border: '1px solid var(--lp-border, #1E293B)',
              borderRadius: '20px',
              padding: '2.5rem',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                fontSize: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem auto',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              ⚠️
            </div>

            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                marginBottom: '0.75rem',
                fontFamily: 'Cinzel, serif',
                color: 'var(--lp-text, #F8FAFC)',
              }}
            >
              Something Went Wrong
            </h1>

            <p
              style={{
                fontSize: '0.95rem',
                color: 'var(--lp-text-subtle, #94A3B8)',
                lineHeight: 1.6,
                marginBottom: '2rem',
              }}
            >
              An unexpected application error occurred while loading this view. You can return to the dashboard or attempt to reload the view.
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  this.handleReset();
                  window.location.reload();
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--lp-bg-subtle, #1E293B)',
                  color: 'var(--lp-text, #F8FAFC)',
                  border: '1px solid var(--lp-border, #334155)',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                🔄 Try Again
              </button>

              <a
                href="/dashboard"
                onClick={this.handleReset}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--lp-accent, #0EA5E9)',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                🏠 Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props) {
  const location = useLocation();
  return <ErrorBoundaryClass {...props} locationKey={location.pathname} />;
}

export default ErrorBoundary;
