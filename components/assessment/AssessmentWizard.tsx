import React, { useState } from 'react';
import { AssessmentStepper } from '../shared/AssessmentStepper';
import { Icons } from '../icons';
import { Step1TextAndGrade } from './steps/Step1TextAndGrade';
import { Step2CognitiveStrategy } from './steps/Step2CognitiveStrategy';
import { Step3PreviewAndPublish } from './steps/Step3PreviewAndPublish';

interface AssessmentWizardProps {
  onBack: () => void;
}

export const AssessmentWizard: React.FC<AssessmentWizardProps> = ({ onBack }) => {
  const [currentStep, setCurrentStep] = useState(1);

  const handleNext = () => {
    if (currentStep < 3) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handlePublish = () => {
    // 模擬發佈成功後返回首頁
    onBack();
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-6 transition-colors self-start">
        <Icons.back className="w-4 h-4 mr-2" />
        返回智能評測
      </button>

      <AssessmentStepper currentStep={currentStep} />

      <div className="mt-2 flex-1 flex flex-col">
        {currentStep === 1 && <Step1TextAndGrade onNext={handleNext} />}
        {currentStep === 2 && <Step2CognitiveStrategy onNext={handleNext} onPrev={handlePrev} />}
        {currentStep === 3 && <Step3PreviewAndPublish onPrev={handlePrev} onPublish={handlePublish} />}
      </div>
    </div>
  );
};
