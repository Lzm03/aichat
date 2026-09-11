import { uiText } from '../utils/uiI18n';
import React from 'react';
import { StudentLearningReportCard } from '../components/dashboard/StudentLearningReportCard';
import { AbilityTrackingReport } from '../components/dashboard/AbilityTrackingReport';
import { AssessmentQualityList } from '../components/assessment/AssessmentQualityList';

type LearningReportPageProps = {
  onOpenQuizQuality: (quizId: string) => void;
  onCreateQuiz: () => void;
};

export const LearningReportPage: React.FC<LearningReportPageProps> = ({ onOpenQuizQuality, onCreateQuiz }) => {
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{uiText("學習報告")}</h1>
        <p className="text-slate-500">{uiText("追蹤學生能力表現、測驗質量與學習狀態。")}</p>
      </div>

      {/* 能力追蹤報告（由 Dashboard 搬入，內容不變） */}
      <StudentLearningReportCard />

      {/* 下排：Bloom 六層級視角（較寬）＋ 評測質量總覽（較窄） */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,6fr)_minmax(300px,4fr)]">
        <AbilityTrackingReport onCreateQuiz={onCreateQuiz} />
        <AssessmentQualityList onOpenQuiz={onOpenQuizQuality} />
      </div>
    </div>
  );
};
