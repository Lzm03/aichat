import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, BarChart2, HelpCircle, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Icons } from '../icons';
import { GradingDetailView } from './GradingDetailView';
import { InfoTipModal } from '../system/InfoTipModal';

interface GradingWorkspaceHomeProps {
  onBack: () => void;
  onGoToWorkshop?: () => void;
}

type QuizSummary = {
  id: string;
  title: string;
  subject: string;
  date: string;
  totalStudents: number;
  pendingGrading: number;
  pendingConfirm: number;
  completed: number;
};

export const GradingWorkspaceHome: React.FC<GradingWorkspaceHomeProps> = ({ onBack, onGoToWorkshop }) => {
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const loadQuizzes = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then((res) => res.json())
      .then((data) => {
        setQuizzes(Array.isArray(data?.quizzes) ? data.quizzes : []);
      })
      .catch(() => {
        setQuizzes([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadQuizzes();
    const refresh = () => {
      if (document.visibilityState === 'visible') loadQuizzes();
    };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [loadQuizzes, selectedQuizId]);

  const sortedQuizzes = useMemo(
    () =>
      [...quizzes].sort((a, b) => {
        const aActive = a.pendingGrading > 0 || a.pendingConfirm > 0;
        const bActive = b.pendingGrading > 0 || b.pendingConfirm > 0;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return +new Date(b.date) - +new Date(a.date);
      }),
    [quizzes]
  );

  const activeQuizzesCount = sortedQuizzes.filter((quiz) => quiz.pendingGrading > 0 || quiz.pendingConfirm > 0).length;
  const totalPendingStudents = sortedQuizzes.reduce((sum, quiz) => sum + quiz.pendingGrading + quiz.pendingConfirm, 0);

  const handleDeleteQuiz = async (quizId: string) => {
    setDeletingQuizId(quizId);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${quizId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('刪除測驗失敗');
      }
      setQuizzes((prev) => prev.filter((quiz) => quiz.id !== quizId));
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingQuizId(null);
    }
  };

  if (selectedQuizId) {
    return <GradingDetailView quizId={selectedQuizId} onBack={() => setSelectedQuizId(null)} />;
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-2 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />
            返回智能評測
          </button>
          <h1 className="text-2xl font-bold text-slate-800">智能批改工作台</h1>
        </div>
        <button type="button" aria-label="AI 批改説明" onClick={() => setShowHelp(true)} className="text-indigo-500"><HelpCircle className="h-5 w-5" /></button>
      </div>

      {sortedQuizzes.length > 0 ? <div className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 text-rose-600" />
        </div>
        <span className="font-bold">{activeQuizzesCount} 份測驗待處理 · 共 {totalPendingStudents} 份學生作答</span>
      </div> : null}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">正在載入批改資料...</div>
        ) : null}

        {!loading && !sortedQuizzes.length ? (
          <div className="mx-auto mt-8 w-full max-w-[720px] rounded-[28px] border border-slate-100 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-10">
            <h2 className="text-xl font-extrabold text-slate-950">還沒有測驗，兩步驟就能開始批改</h2>
            <p className="mt-1.5 text-[13px] text-slate-400">完成後，學生作答會自動出現在這裡讓你確認分數</p>
            <div className="mt-6 space-y-[18px]">
              <div className="flex items-start gap-3.5"><span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[13px] font-extrabold text-indigo-600">1</span><div><div className="text-sm font-bold text-slate-800">到「機器人角色」幫角色加上題目</div><div className="mt-1 text-[13px] leading-6 text-slate-400">上傳課文或題目，AI 會自動整理成測驗，不用自己一題一題輸入。</div></div></div>
              <div className="flex items-start gap-3.5"><span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[13px] font-extrabold text-indigo-600">2</span><div><div className="text-sm font-bold text-slate-800">發布給班級，等學生作答</div><div className="mt-1 text-[13px] leading-6 text-slate-400">學生答完後會自動送到這裡，AI 先批改一次，你只需要確認或調整分數即可。</div></div></div>
            </div>
            <button type="button" onClick={onGoToWorkshop} className="mt-7 rounded-[14px] bg-indigo-600 px-[22px] py-3 text-sm font-bold text-white transition hover:bg-indigo-700">前往機器人角色設定題目</button>
          </div>
        ) : null}

        {!loading &&
          sortedQuizzes.map((quiz, index) => {
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
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{quiz.subject}</span>
                    <span className="text-xs text-slate-400">{quiz.date ? new Date(quiz.date).toISOString().slice(0, 10) : ''}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">{quiz.title}</h3>
                </div>

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

                <div className="shrink-0 w-full md:w-auto flex items-center justify-end gap-3">
                  <button
                    onClick={() => void handleDeleteQuiz(quiz.id)}
                    disabled={deletingQuizId === quiz.id}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedQuizId(quiz.id)}
                    className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors shadow-sm ${
                      isCompleted
                        ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        : quiz.pendingConfirm > 0
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isCompleted ? <BarChart2 className="w-4 h-4" /> : null}
                    {isCompleted ? '查看報告' : quiz.pendingConfirm > 0 ? '去確認' : '開始批改'}
                    {!isCompleted ? <ArrowRight className="w-4 h-4" /> : null}
                  </button>
                </div>
              </motion.div>
            );
          })}
      </div>
      <InfoTipModal open={showHelp} title="AI 批改怎麼運作" body="學生作答後，AI 會先自動評分並給出建議分數，例如選擇題直接判對錯、簡答題會給參考理由。你可以直接採用，也能手動調整後再確認送出。" onClose={() => setShowHelp(false)} />
    </div>
  );
};
