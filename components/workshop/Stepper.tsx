import React from 'react';
import { Icons } from '../icons';

interface StepperProps {
  steps: string[];
  currentStep: number;
  setCurrentStep: (step: number) => void;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep, setCurrentStep }) => {
  return (
    <div className="w-full bg-white p-2 sm:p-4 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)]">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isActive = currentStep === stepNumber;

          return (
            <React.Fragment key={step}>
              <div className="flex-1 flex flex-col items-center">
                <button 
                  onClick={() => isCompleted && setCurrentStep(stepNumber)}
                  disabled={!isCompleted && !isActive}
                  className="flex flex-col items-center text-center px-1 disabled:cursor-default group"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted ? 'bg-indigo-600 group-hover:bg-indigo-700' : isActive ? 'bg-indigo-600 ring-4 ring-indigo-200' : 'bg-slate-200'
                  }`}>
                    {isCompleted ? <Icons.success className="w-6 h-6 text-white" /> : <span className={`font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>{stepNumber}</span>}
                  </div>
                  <p className={`mt-2 text-xs w-20 font-medium transition-colors hidden sm:block ${isActive ? 'text-indigo-600' : isCompleted ? 'text-slate-700' : 'text-slate-500'}`}>{step}</p>
                </button>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 mt-5 transition-colors duration-500 ${isCompleted || isActive ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};