'use client';

import React, { useEffect, useState } from 'react';
import { readAuthSession } from '../utils/auth';
import { API_BASE } from '../utils/api';

import { AssessmentQualityCard } from '../components/assessment/AssessmentQualityCard';
import { StudentLearningReportCard } from '../components/dashboard/StudentLearningReportCard';

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "早安";
  if (hour >= 11 && hour < 14) return "午安";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 24) return "晚上好";
  return "夜深了";
}

type DashboardSummary = {
  pendingGrading: number;
  pendingConfirm: number;
  completed: number;
};

const HeroBanner: React.FC<{
  teacherName: string;
  summary: DashboardSummary | null;
  loading: boolean;
}> = ({ teacherName, summary, loading }) => (
    <div className="relative mb-5 h-[210px] w-full overflow-hidden rounded-[24px] shadow-md group sm:mb-6 sm:h-auto sm:aspect-[4/1] sm:rounded-[32px]">
      <img 
      src="/Tomato_Robot.png" 
        alt="AI Dashboard Hero" 
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
    />
    <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-slate-950/70 via-slate-900/45 to-slate-900/10 p-5 sm:p-8 md:p-12">
      <div className="max-w-2xl space-y-3 text-white sm:space-y-4">
        <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl md:text-4xl">{getTimeGreeting()}，{teacherName}</h2>
        <div className="inline-block max-w-full rounded-2xl border border-white/18 bg-white/10 p-3 text-white shadow-sm backdrop-blur-[3px] sm:rounded-xl">
          {loading ? (
            <p className="text-sm font-semibold text-white/90">正在整理最新教學進度…</p>
          ) : summary ? (
            <div className="flex flex-col gap-2 text-sm font-semibold leading-snug text-white/90 sm:block">
              <span><span className="mx-0.5 rounded-md bg-white/18 px-1.5 py-0.5 font-black text-white shadow-sm">{summary.pendingGrading}</span> 份作答待批改</span>
              <span className="hidden sm:inline"> · </span>
              <span><span className="mx-0.5 rounded-md bg-white/18 px-1.5 py-0.5 font-black text-white shadow-sm">{summary.pendingConfirm}</span> 份待老師確認</span>
              <span className="hidden sm:inline"> · </span>
              <span><span className="mx-0.5 rounded-md bg-white/18 px-1.5 py-0.5 font-black text-white shadow-sm">{summary.completed}</span> 份作答已完成</span>
            </div>
          ) : (
            <p className="text-sm font-semibold leading-relaxed text-white/90">目前尚未有評測資料，發布測驗後會在此顯示最新進度。</p>
          )}
        </div>
      </div>
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const teacherName = readAuthSession()?.user?.fullName?.trim() || '老師';
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || '無法載入評測進度');
        return Array.isArray(data?.quizzes) ? data.quizzes : [];
      })
      .then((quizzes) => {
        if (cancelled || !quizzes.length) return;
        setSummary(quizzes.reduce((total: DashboardSummary, quiz: any) => ({
          pendingGrading: total.pendingGrading + Number(quiz.pendingGrading || 0),
          pendingConfirm: total.pendingConfirm + Number(quiz.pendingConfirm || 0),
          completed: total.completed + Number(quiz.completed || 0),
        }), { pendingGrading: 0, pendingConfirm: 0, completed: 0 }));
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full flex flex-col pb-32 md:pb-0">
      <HeroBanner teacherName={teacherName} summary={summary} loading={summaryLoading} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        <div className="md:col-span-1">
          <StudentLearningReportCard />
        </div>
        <div className="md:col-span-1 flex flex-col gap-6">
          <AssessmentQualityCard />
        </div>
      </div>
    </div>
  );
};
