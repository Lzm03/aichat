import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../components/icons';
import { IosToggle } from '../components/shared/IosToggle';

const QuickActions = () => (
  <div className="md:col-span-2 bg-white p-4 md:p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col justify-center">
    <h3 className="text-lg font-bold text-[#1E293B] mb-4">快捷操作</h3>
    <div className="grid grid-cols-2 gap-4">
      <button className="p-4 rounded-xl text-white font-semibold bg-indigo-500 hover:bg-indigo-600 transition-all flex items-center justify-center space-x-2 text-sm md:text-base">
        <Icons.add className="w-5 h-5"/> <span>創建新任務</span>
      </button>
      <button className="p-4 rounded-xl text-white font-semibold bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center justify-center space-x-2 text-sm md:text-base">
        <Icons.bot className="w-5 h-5"/> <span>喚醒 AI 助教</span>
      </button>
    </div>
  </div>
);

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


const StudentLearningReport = () => {
  const [timePeriod, setTimePeriod] = useState<'7d' | '30d'>('7d');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // FIX: Use 'as const' to ensure TypeScript infers the narrowest possible type for `trend.type`,
  // matching the expected union type in the TrendListItem component.
  const reportData = {
    '7d': { 
      progress: '82%', 
      engagement: '高', 
      completion: '95%', 
      trends: [
        { type: 'positive', text: '李逸朗同學在「英文口語」練習中互動頻繁。' },
        { type: 'neutral', text: '整體任務完成率穩定。' }
      ]
    },
    '30d': { 
      progress: '75%', 
      engagement: '中等', 
      completion: '89%', 
      trends: [
        { type: 'warning', text: '黃俊傑同學的數學單元互動活躍度偏低。' },
        { type: 'positive', text: '大部分學生已適應AI助教。' }
      ]
    },
  } as const;

  const currentData = reportData[timePeriod];

  const handleGenerateReport = () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsGenerating(false), 1000);
          return 100;
        }
        return prev + Math.random() * 20;
      });
    }, 200);
  };
  
  const GenerateButton = () => (
    !isGenerating ? (
      <button 
        onClick={handleGenerateReport}
        className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center space-x-2 hover:bg-indigo-700 transition-colors"
      >
        <Icons.download className="w-4 h-4" />
        <span>生成詳細報告</span>
      </button>
    ) : (
      <div className="w-full">
        <p className="text-center text-sm font-medium text-indigo-700 mb-1">報告生成中... {Math.round(progress)}%</p>
        <div className="w-full bg-slate-200 rounded-full h-2.5">
          <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-200" style={{ width: `${progress}%` }}></div>
        </div>
      </div>
    )
  );

  return (
    <>
      <div className="md:col-span-2 bg-white p-4 md:p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <h3 className="text-lg font-bold text-[#1E293B] flex items-center shrink-0">
            <Icons.report className="w-5 h-5 mr-2 text-indigo-500" />
            學生基礎學習報告
          </h3>
          <div className="bg-slate-100 p-1 rounded-full flex items-center text-xs font-semibold w-full md:w-auto">
            <button onClick={() => setTimePeriod('7d')} className={`w-1/2 md:w-auto px-3 py-1 rounded-full transition-all ${timePeriod === '7d' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>
              <Icons.clock className="w-3 h-3 inline mr-1" />過去 7 日
            </button>
            <button onClick={() => setTimePeriod('30d')} className={`w-1/2 md:w-auto px-3 py-1 rounded-full transition-all ${timePeriod === '30d' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>
              過去一個月
            </button>
          </div>
        </div>
        
        <div className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-4 px-4 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 mb-4">
          <MetricCard title="平均學習進度" value={currentData.progress} className="flex-shrink-0 w-[85%] sm:w-[45%] snap-center md:w-auto mr-4 md:mr-0"/>
          <MetricCard title="AI 互動活躍度" value={currentData.engagement} className="flex-shrink-0 w-[85%] sm:w-[45%] snap-center md:w-auto mr-4 md:mr-0"/>
          <MetricCard title="任務完成率" value={currentData.completion} className="flex-shrink-0 w-[85%] sm:w-[45%] snap-center md:w-auto"/>
        </div>

        <div className="space-y-2 pb-24 md:pb-0">
          <p className="text-xs font-bold text-slate-700">AI 趨勢摘要：</p>
          <ul className="space-y-2">
            {currentData.trends.map((trend, index) => (
              <TrendListItem key={index} type={trend.type} text={trend.text} />
            ))}
          </ul>
        </div>
        
        <div className="mt-auto hidden md:block">
          <GenerateButton />
        </div>
      </div>
      {createPortal(
        <div className="md:hidden fixed bottom-6 inset-x-4 z-30 p-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/30">
          <GenerateButton />
        </div>,
        document.body
      )}
    </>
  );
};


const TaskCalendar = () => (
  <div className="md:col-span-3 bg-white p-4 md:p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] min-h-[300px] md:min-h-0">
     <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-[#1E293B]">日程概覽</h3>
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-slate-500">課程表</span>
        <IosToggle />
        <span className="font-medium text-indigo-600">任務截止日</span>
      </div>
    </div>
    <div className="text-center text-slate-400 pt-16">日曆視圖 placeholder</div>
  </div>
);

const ResourceRing = () => (
  <div className="md:col-span-1 bg-white p-4 md:p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center min-h-[300px] md:min-h-0">
    <h3 className="text-lg font-bold text-[#1E293B] mb-4">資源監控</h3>
    <div className="relative w-32 h-32">
        <svg className="w-full h-full" viewBox="0 0 36 36">
            <path className="text-slate-200" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
            <path className="text-indigo-500" strokeWidth="3" strokeDasharray="78, 100" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold text-indigo-600">78%</div>
    </div>
    <p className="text-xs text-slate-500 mt-2">本月 AI 算力剩餘</p>
  </div>
);

export const Dashboard: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-6 h-full">
      <div className="md:col-span-2 md:row-span-2">
        <StudentLearningReport />
      </div>
      <div className="md:col-span-2">
        <QuickActions />
      </div>
      <TaskCalendar />
      <ResourceRing />
    </div>
  );
};
