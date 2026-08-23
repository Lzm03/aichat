'use client';

import React from 'react';
import { readAuthSession } from '../utils/auth';
import { useTeacherLang } from '../utils/teacherI18n';

import { AssessmentQualityCard } from '../components/assessment/AssessmentQualityCard';
import { StudentLearningReportCard } from '../components/dashboard/StudentLearningReportCard';

const WELCOME_T = {
  "zh-HK": "歡迎回到教學指揮艙，和學生們一起開啟今天的學習之旅！",
  en: "Welcome back to the Command Center. Let's start today's learning journey with your students!",
} as const;

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "早安";
  if (hour >= 11 && hour < 14) return "午安";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 24) return "晚上好";
  return "夜深了";
}

const HeroBanner: React.FC<{ teacherName: string }> = ({ teacherName }) => (
    <div className="relative mb-5 h-[210px] w-full overflow-hidden rounded-[24px] shadow-md group sm:mb-6 sm:h-auto sm:aspect-[4/1] sm:rounded-[32px]">
      <img 
      src="/Tomato_Robot.webp" 
        alt="AI Dashboard Hero" 
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
    />
    <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-slate-950/70 via-slate-900/45 to-slate-900/10 p-5 sm:p-8 md:p-12">
      <div className="max-w-2xl space-y-3 text-white sm:space-y-4">
        <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl md:text-4xl">{getTimeGreeting()}，{teacherName}</h2>
        <div className="inline-block max-w-full rounded-2xl border border-white/18 bg-white/10 p-3 text-white shadow-sm backdrop-blur-[3px] sm:rounded-xl">
          <p className="text-sm font-semibold leading-snug text-white/90">{WELCOME_T[useTeacherLang()]}</p>
        </div>
      </div>
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const teacherName = readAuthSession()?.user?.fullName?.trim() || '老師';

  return (
    <div className="h-full flex flex-col pb-32 md:pb-0">
      <HeroBanner teacherName={teacherName} />
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
