import React from 'react';
import { Icons } from '../icons';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick: (step: number) => void;
  maxReachableStep?: number;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onStepClick,
  maxReachableStep = 1,
}) => {
  return (
    <div className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:px-5">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < maxReachableStep;
          const isActive = currentStep === stepNumber;
          const isEnabled = stepNumber <= maxReachableStep;

          return (
            <React.Fragment key={step}>
              <div className="flex-1 flex flex-col items-center">
                <button 
                  onClick={() => isEnabled && onStepClick(stepNumber)}
                  disabled={!isEnabled}
                  className="group flex flex-col items-center px-1 text-center disabled:cursor-default"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${
                    isCompleted ? 'bg-indigo-600 group-hover:bg-indigo-700' : isActive ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'bg-slate-100'
                  }`}>
                    {isCompleted ? <Icons.success className="h-5 w-5 text-white" /> : <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>{stepNumber}</span>}
                  </div>
                  <p className={`mt-2 hidden w-20 text-[11px] font-semibold transition-colors sm:block ${isActive ? 'text-indigo-600' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>{step}</p>
                </button>
              </div>
              {index < steps.length - 1 && (
                <div className={`mt-4 h-0.5 flex-1 transition-colors duration-500 ${isCompleted || isActive ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
