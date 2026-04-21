import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../icons';
import { AlertCircle, ArrowRight, BarChart2 } from 'lucide-react';
import { GradingDetailView } from './GradingDetailView';

interface GradingWorkspaceHomeProps {
  onBack: () => void;
}

const mockQuizzes = [
  {
    id: 1,
    title: '中三古文練習 - 桃花源記',
    className: 'S3A 中文',
    date: '2023-10-25',
    pendingGrading: 0,
    pendingConfirm: 12,
    completed: 20,
  },
  {
    id: 2,
    title: '物理力學單元測驗',
    className: 'S4B 物理',
    date: '2023-10-24',
    pendingGrading: 15,
    pendingConfirm: 0,
    completed: 10,
  },
  {
    id: 3,
    title: '常識科期中模擬考',
    className: 'P5C 常識',
    date: '2023-10-20',
    pendingGrading: 5,
    pendingConfirm: 5,
    completed: 25,
  },
  {
    id: 4,
    title: '數學代數基礎',
    className: 'S2A 數學',
    date: '2023-10-15',
    pendingGrading: 0,
    pendingConfirm: 0,
    completed: 40,
  }
];

export const GradingWorkspaceHome: React.FC<GradingWorkspaceHomeProps> = ({ onBack }) => {
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);

  if (selectedQuizId !== null) {
    return <GradingDetailView onBack={() => setSelectedQuizId(null)} />;
  }

  // Sort: active first, completed last
  const sortedQuizzes = [...mockQuizzes].sort((a, b) => {
    const aActive = a.pendingGrading > 0 || a.pendingConfirm > 0;
    const bActive = b.pendingGrading > 0 || b.pendingConfirm > 0;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return 0;
  });

  const activeQuizzesCount = sortedQuizzes.filter(q => q.pendingGrading > 0 || q.pendingConfirm > 0).length;
  const totalPendingStudents = sortedQuizzes.reduce((acc, q) => acc + q.pendingGrading + q.pendingConfirm, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-2 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />
            返回智能評測
          </button>
          <h1 className="text-2xl font-bold text-slate-800">智能批改工作台</h1>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 text-rose-600" />
        </div>
        <span className="font-bold">
          {activeQuizzesCount} 份測驗待處理 · 共 {totalPendingStudents} 份學生作答
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4">
        {sortedQuizzes.map((quiz, index) => {
          const isCompleted = quiz.pendingGrading === 0 && quiz.pendingConfirm === 0;
          
          return (
            <motion.div
              key={quiz.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: isCompleted ? 0.7 : 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -2, opacity: 1, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}
              className={`bg-white rounded-[24px] p-6 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${isCompleted ? 'bg-slate-50/50' : 'shadow-sm'}`}
            >
              {/* Left: Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{quiz.className}</span>
                  <span className="text-xs text-slate-400">{quiz.date}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-800">{quiz.title}</h3>
              </div>

              {/* Middle: Status */}
              <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 min-w-[80px]">
                  <span className="text-xl font-bold text-slate-500">{quiz.pendingGrading}</span>
                  <span className="text-xs font-medium text-slate-400 mt-1">待批改</span>
                </div>
                
                <div className={`flex flex-col items-center justify-center p-3 rounded-xl min-w-[80px] ${quiz.pendingConfirm > 0 ? 'bg-purple-50 ring-1 ring-purple-100' : 'bg-slate-50'}`}>
                  <span className={`text-xl font-bold ${quiz.pendingConfirm > 0 ? 'text-purple-600' : 'text-slate-500'}`}>{quiz.pendingConfirm}</span>
                  <span className={`text-xs font-medium mt-1 ${quiz.pendingConfirm > 0 ? 'text-purple-500' : 'text-slate-400'}`}>待確認</span>
                </div>
                
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-50 min-w-[80px]">
                  <span className="text-xl font-bold text-emerald-600">{quiz.completed}</span>
                  <span className="text-xs font-medium text-emerald-500 mt-1">已完成</span>
                </div>
              </div>

              {/* Right: CTA */}
              <div className="shrink-0 w-full md:w-auto flex justify-end">
                {quiz.pendingConfirm > 0 ? (
                  <button 
                    onClick={() => setSelectedQuizId(quiz.id)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors shadow-sm"
                  >
                    去確認
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : quiz.pendingGrading > 0 ? (
                  <button 
                    onClick={() => setSelectedQuizId(quiz.id)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    開始批改
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm">
                    <BarChart2 className="w-4 h-4" />
                    查看報告
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
