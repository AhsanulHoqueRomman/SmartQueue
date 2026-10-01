import React from 'react';

export const RegistrationProgress = ({ steps = [], currentStep = 1 }) => {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyKeyword: 'space-between',
          position: 'relative',
          gap: '0.5rem'
        }}
      >
        {steps.map((stepTitle, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <React.Fragment key={idx}>
              {/* Step Circle & Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 2 }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    transition: 'all 0.3s ease',
                    background: isCompleted
                      ? 'var(--lp-accent)'
                      : isActive
                      ? 'var(--lp-btn-bg, #2F2520)'
                      : 'var(--lp-bg-subtle)',
                    color: isCompleted || isActive ? '#FAF8F3' : 'var(--lp-text-subtle)',
                    border: isActive
                      ? '2px solid var(--lp-btn-bg, #2F2520)'
                      : isCompleted
                      ? '2px solid var(--lp-accent)'
                      : '2px solid var(--lp-border)',
                    boxShadow: isActive ? '0 4px 12px rgba(47, 37, 32, 0.2)' : 'none'
                  }}
                >
                  {isCompleted ? '✓' : stepNum}
                </div>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 700 : isCompleted ? 600 : 500,
                    color: isActive ? 'var(--lp-text)' : isCompleted ? 'var(--lp-accent)' : 'var(--lp-text-subtle)',
                    display: 'none',
                    whiteSpace: 'nowrap'
                  }}
                  className="sm:inline"
                >
                  {stepTitle}
                </span>
              </div>

              {/* Connecting Line */}
              {idx < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    background: stepNum < currentStep ? 'var(--lp-accent)' : 'var(--lp-border)',
                    transition: 'background 0.3s ease'
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-accent)' }}>
        Step {currentStep} of {steps.length}: {steps[currentStep - 1]}
      </div>
    </div>
  );
};

export default RegistrationProgress;
