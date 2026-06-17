import React, { useState } from 'react';
import { AssessmentStepper } from '../shared/AssessmentStepper';
import { Icons } from '../icons';
import { Step1TextAndGrade } from './steps/Step1TextAndGrade';
import { Step3PreviewAndPublish } from './steps/Step3PreviewAndPublish';

interface AssessmentWizardProps {
  onBack: () => void;
}

type GeneratedQuestion = {
  id: number | string;
  type: string;
  cognitiveLevel: string;
  levelColor: string;
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  points?: number;
  difficulty?: string;
};

type GeneratedQuiz = {
  id: string;
  title: string;
  botId: string;
  targetGrade: string;
  questionCount: number;
  questionTypeMode: string;
};

export const AssessmentWizard: React.FC<AssessmentWizardProps> = ({ onBack }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [generatedQuiz, setGeneratedQuiz] = useState<GeneratedQuiz | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);

  const handleNext = () => {
    if (currentStep < 2) setCurrentStep(prev => prev + 1);
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
        {currentStep === 1 && (
          <Step1TextAndGrade
            onGenerated={(payload) => {
              setGeneratedQuiz(payload.quiz);
              setGeneratedQuestions(payload.questions);
              handleNext();
            }}
          />
        )}
        {currentStep === 2 && (
          <Step3PreviewAndPublish
            onPrev={handlePrev}
            onPublish={handlePublish}
            initialQuiz={generatedQuiz}
            initialQuestions={generatedQuestions}
          />
        )}
      </div>
    </div>
  );
};
