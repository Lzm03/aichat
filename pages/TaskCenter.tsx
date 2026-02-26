import React, { useState } from 'react';
import { Icons } from '../components/icons';

type Tab = 'inProgress' | 'toReview' | 'archived';

const tasks = {
  inProgress: [
    { id: 1, title: '英文作文：我的夢想', submitted: 24, total: 30 },
    { id: 2, title: '數學單元五測驗', submitted: 15, total: 28 },
  ],
  toReview: [
    { id: 3, title: '中文閱讀理解練習', aiSuggestion: true },
    { id: 4, title: '科學實驗報告', aiSuggestion: false },
  ],
  archived: [
    { id: 5, title: '歷史專題研習' },
  ]
};

// FIX: Define props interface and use React.FC to correctly handle the 'key' prop.
interface TaskItemInProgressProps {
  title: string;
  submitted: number;
  total: number;
}
const TaskItemInProgress: React.FC<TaskItemInProgressProps> = ({ title, submitted, total }) => (
  <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200/80">
    <div className="flex items-center space-x-4">
      <div className="p-3 bg-indigo-50 rounded-lg"><Icons.task className="w-5 h-5 text-indigo-500"/></div>
      <span className="font-medium text-slate-700">{title}</span>
    </div>
    <div className="flex items-center space-x-3 text-sm">
      <div className="relative w-10 h-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path className="text-slate-200" strokeWidth="4" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
            <path className="text-emerald-500" strokeWidth="4" strokeDasharray={`${(submitted/total)*100}, 100`} strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
        </svg>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold">{Math.round((submitted/total)*100)}%</span>
      </div>
      <span className="text-slate-500">{submitted}/{total} 人已提交</span>
    </div>
  </div>
);

// FIX: Define props interface and use React.FC to correctly handle the 'key' prop.
interface TaskItemToReviewProps {
  title: string;
  aiSuggestion: boolean;
}
const TaskItemToReview: React.FC<TaskItemToReviewProps> = ({ title, aiSuggestion }) => (
  <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200/80">
    <div className="flex items-center space-x-4">
      <div className="p-3 bg-amber-50 rounded-lg"><Icons.task className="w-5 h-5 text-amber-500"/></div>
      <span className="font-medium text-slate-700">{title}</span>
    </div>
    <div className="flex items-center space-x-3 text-sm">
      {aiSuggestion && <span className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-md">AI 建議已生成</span>}
      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
    </div>
  </div>
);

export const TaskCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('toReview');
  
  const tabs: {id: Tab, label: string, count: number}[] = [
    { id: 'inProgress', label: '進行中', count: tasks.inProgress.length },
    { id: 'toReview', label: '待批閱', count: tasks.toReview.length },
    { id: 'archived', label: '已歸檔', count: tasks.archived.length },
  ]
  
  return (
    <div>
      <div className="mb-6 bg-slate-200/80 p-1.5 rounded-xl flex items-center max-w-sm">
        {tabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-300/50'}`}
          >
            {tab.label} <span className={`ml-1 px-2 py-0.5 rounded-md text-xs ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-300/80 text-slate-600'}`}>{tab.count}</span>
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {activeTab === 'inProgress' && tasks.inProgress.map(task => <TaskItemInProgress key={task.id} {...task} />)}
        {activeTab === 'toReview' && tasks.toReview.map(task => <TaskItemToReview key={task.id} {...task} />)}
        {activeTab === 'archived' && <p className="text-slate-500 text-center py-8">已歸檔任務列表為空。</p>}
      </div>
    </div>
  );
};
