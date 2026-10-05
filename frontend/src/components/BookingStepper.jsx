import React from 'react';

export default function BookingStepper({ steps, currentStep, onStepClick }) {
  return (
    <div className="stepper-container">
      {/* Desktop & Tablet Stepper */}
      <div className="stepper-desktop">
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isClickable = isCompleted && onStepClick;

          let circleClass = 'stepper-circle-upcoming';
          if (isCompleted) circleClass = 'stepper-circle-completed';
          else if (isActive) circleClass = 'stepper-circle-active';

          let labelClass = 'stepper-label-upcoming';
          if (isCompleted) labelClass = 'stepper-label-completed';
          else if (isActive) labelClass = 'stepper-label-active';

          return (
            <React.Fragment key={step.id || stepNum}>
              {/* Connector line between steps */}
              {idx > 0 && (
                <div
                  className={`stepper-connector ${
                    idx < currentStep ? 'stepper-connector-completed' : ''
                  }`}
                />
              )}

              {/* Step Item */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick(stepNum)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className="stepper-item"
              >
                {/* Circle Badge */}
                <div className={`stepper-circle ${circleClass}`}>
                  {isCompleted ? (
                    <svg style={{ width: '16px', height: '16px', strokeWidth: 3 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </div>

                {/* Step Label */}
                <span className={`stepper-label ${labelClass}`}>
                  {step.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Compact Stepper */}
      <div className="stepper-mobile">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="stepper-mobile-badge">
            {currentStep}
          </div>
          <div className="stepper-mobile-info">
            <span className="stepper-mobile-step-num">
              Step {currentStep} of {steps.length}
            </span>
            <span className="stepper-mobile-step-title">
              {steps[currentStep - 1]?.label}
            </span>
          </div>
        </div>

        {/* Progress Pills */}
        <div className="stepper-mobile-pills">
          {steps.map((_, idx) => {
            const stepNum = idx + 1;
            let pillClass = 'stepper-mobile-pill-upcoming';
            if (stepNum === currentStep) pillClass = 'stepper-mobile-pill-active';
            else if (stepNum < currentStep) pillClass = 'stepper-mobile-pill-completed';

            return (
              <div
                key={stepNum}
                className={`stepper-mobile-pill ${pillClass}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
