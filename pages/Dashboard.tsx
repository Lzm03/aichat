'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../components/icons';
import { IosToggle } from '../components/shared/IosToggle';
import { Sparkles, Zap } from 'lucide-react';

import { AssessmentQualityCard } from '../components/assessment/AssessmentQualityCard';
import { StudentLearningReportCard } from '../components/dashboard/StudentLearningReportCard';

const QuickActions = () => {
  const handleWeaknessClick = () => {
    alert('進入「針對薄弱點出題」流程 (待建設)...');
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col justify-center border border-slate-100">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center">
        <Zap className="w-5 h-5 mr-2 text-amber-500" />
        快捷操作
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button className="p-4 rounded-2xl text-slate-700 font-bold bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-all flex flex-col items-center justify-center gap-3 text-sm group">
          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Icons.add className="w-5 h-5"/>
          </div>
          <span>創建新任務</span>
        </button>
        <button className="p-4 rounded-2xl text-slate-700 font-bold bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-all flex flex-col items-center justify-center gap-3 text-sm group">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Icons.bot className="w-5 h-5"/>
          </div>
          <span>喚醒 AI 助教</span>
        </button>
        <button 
          onClick={handleWeaknessClick}
          className="p-4 rounded-2xl text-white font-bold bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg hover:shadow-indigo-500/30 transition-all flex flex-col items-center justify-center gap-2 text-sm relative overflow-hidden group border border-indigo-400/50"
        >
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform relative z-10">
            <Sparkles className="w-5 h-5 text-white"/>
          </div>
          <div className="relative z-10 flex flex-col items-center text-center">
            <span>針對薄弱點出題</span>
            <span className="text-[10px] font-medium text-indigo-100 mt-1 opacity-90 leading-tight">系統已預選<br/>「評價」層級</span>
          </div>
        </button>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{title: string, value: string, className?: string}> = ({ title, value, className }) => (
  <div className={`bg-slate-50/80 p-4 rounded-2xl shadow-sm ${className}`}>
    <p className="text-xs text-slate-500">{title}</p>
    <p className="text-xl font-bold text-slate-800">{value}</p>
  </div>
);

const TrendListItem: React.FC<{type: 'positive' | 'neutral' | 'warning', text: string}> = ({ type, text }) => {
  const colorMap = {
    positive: 'bg-emerald-500',
    neutral: 'bg-slate-500',
    warning: 'bg-amber-500',
  };
  return (
    <li className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
      <div className={`w-2 h-2 rounded-full shrink-0 ${colorMap[type]}`}></div>
      <p className="text-xs text-slate-600">{text}</p>
    </li>
  );
};

const HeroBanner = () => (
  <div className="w-full aspect-[4/1] rounded-[32px] overflow-hidden relative mb-6 shadow-md group">
    <img 
      src="https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=2560&auto=format&fit=crop" 
      alt="AI Dashboard Hero" 
      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
    />
    <div className="absolute inset-0 bg-gradient-to-r from-slate-900/60 to-transparent flex flex-col justify-center p-8 md:p-12">
      <div className="max-w-2xl text-white space-y-4">
        <h2 className="text-2xl md:text-4xl font-bold tracking-tight">早安，李老師 👋</h2>
        <div className="bg-indigo-50/90 backdrop-blur-sm text-indigo-700 rounded-xl p-3 inline-block shadow-sm">
          <p className="text-sm font-medium">
            ✨ 本週 <span className="font-bold bg-white px-1.5 py-0.5 rounded-md mx-0.5 shadow-sm">2</span> 份測驗已批改完成 · 
            <span className="font-bold bg-white px-1.5 py-0.5 rounded-md mx-0.5 shadow-sm">3</span> 名學生在「分析」層級持續落後 · 
            <span className="font-bold bg-white px-1.5 py-0.5 rounded-md mx-0.5 shadow-sm">1</span> 份 AI 評分偏差較高
          </p>
        </div>
      </div>
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  return (
    <div className="h-full flex flex-col pb-32 md:pb-0">
      <HeroBanner />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        <div className="md:col-span-1">
          <StudentLearningReportCard />
        </div>
        <div className="md:col-span-1 flex flex-col gap-6">
          <AssessmentQualityCard />
          <QuickActions />
        </div>
      </div>
    </div>
  );
};
