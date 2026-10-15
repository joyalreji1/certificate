import React from 'react';

interface StepperProps {
  currentStep: number;
}

export const Stepper: React.FC<StepperProps> = ({ currentStep }) => {
  const steps = [
    { num: 1, label: 'Upload Files' },
    { num: 2, label: 'Mapping & Validation' },
    { num: 3, label: 'Template Editor' },
    { num: 4, label: 'Sample Preview' },
    { num: 5, label: 'Generate & Results' }
  ];

  return (
    <div className="stepper" role="navigation" aria-label="Batch Creation Progress">
      {steps.map((step) => {
        const isCompleted = step.num < currentStep;
        const isActive = step.num === currentStep;

        return (
          <div
            key={step.num}
            className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="step-num">{isCompleted ? '✓' : step.num}</span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
};
