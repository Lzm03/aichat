import React, { useState } from 'react';
import { AssessmentStepper } from '../shared/AssessmentStepper';
import { Icons } from '../icons';
import { Step1TextAndGrade } from './steps/Step1TextAndGrade';
import { Step3PreviewAndPublish } from './steps/Step3PreviewAndPublish';
import { API_BASE } from '../../utils/api';

interface AssessmentWizardProps {
  onBack: () => void;
  draftId?: string | null;
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
  preferredQuestionTypes?: string[];
  questionTypeDistribution?: Array<{ key: string; label?: string; count: number }>;
  sourceText?: string;
};

export const AssessmentWizard: React.FC<AssessmentWizardProps> = ({ onBack, draftId = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [generatedQuiz, setGeneratedQuiz] = useState<GeneratedQuiz | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [isDraftMode, setIsDraftMode] = useState(Boolean(draftId));

  React.useEffect(() => {
    if (!draftId) return;
    let active = true;
    setLoadingDraft(true);
    fetch(`${API_BASE}/api/quizzes/${draftId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.quiz) {
          setIsDraftMode(true);
          setGeneratedQuiz(data.quiz);
          setGeneratedQuestions(Array.isArray(data.questions) ? data.questions : []);
          setCurrentStep(2);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingDraft(false);
      });
    return () => {
      active = false;
    };
  }, [draftId]);

  const handleNext = () => {
    if (currentStep < 2) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handlePublish = () => {
    onBack();
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-6 transition-colors self-start">
        <Icons.back className="w-4 h-4 mr-2" />
        返回智能評測
      </button>

      <AssessmentStepper currentStep={currentStep} isDraftMode={isDraftMode} />

      <div className="mt-2 flex-1 flex flex-col">
        {loadingDraft ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            正在載入草稿內容...
          </div>
        ) : null}
        {!loadingDraft && currentStep === 1 && (
          <Step1TextAndGrade
            onGenerated={(payload) => {
              setIsDraftMode(false);
              setGeneratedQuiz(payload.quiz);
              setGeneratedQuestions(payload.questions);
              handleNext();
            }}
            onDraftImported={(payload) => {
              setIsDraftMode(true);
              setGeneratedQuiz(payload.quiz);
              setGeneratedQuestions(payload.questions);
              handleNext();
            }}
            onDraftModeChange={setIsDraftMode}
          />
        )}
        {!loadingDraft && currentStep === 2 && (
          <Step3PreviewAndPublish
            onPrev={handlePrev}
            onPublish={handlePublish}
            showPublishAction={!isDraftMode}
            initialQuiz={generatedQuiz}
            initialQuestions={generatedQuestions}
          />
        )}
      </div>
    </div>
  );
};
