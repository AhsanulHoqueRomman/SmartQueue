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
                      ? '#5F7A70'
                      : isActive
                      ? '#2F2520'
                      : '#F3F0EA',
                    color: isCompleted || isActive ? '#FAF8F3' : '#78716C',
                    border: isActive
                      ? '2px solid #2F2520'
                      : isCompleted
                      ? '2px solid #5F7A70'
                      : '2px solid #E6E1D9',
                    boxShadow: isActive ? '0 4px 12px rgba(47, 37, 32, 0.2)' : 'none'
                  }}
                >
                  {isCompleted ? '✓' : stepNum}
                </div>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 700 : isCompleted ? 600 : 500,
                    color: isActive ? '#211C19' : isCompleted ? '#5F7A70' : '#78716C',
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
                    background: stepNum < currentStep ? '#5F7A70' : '#E6E1D9',
                    transition: 'background 0.3s ease'
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#5F7A70' }}>
        Step {currentStep} of {steps.length}: {steps[currentStep - 1]}
      </div>
    </div>
  );
};

export default RegistrationProgress;
