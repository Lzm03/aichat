import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../components/icons';
import { Edit3, FileText, Users, CheckCircle2, Clock, PenTool, AlertCircle, ArrowRight, ShieldAlert, Trash2 } from 'lucide-react';
import { AssessmentWizard } from '../components/assessment/AssessmentWizard';
import { AssessmentLibrary } from '../components/assessment/AssessmentLibrary';
import { GradingWorkspaceHome } from '../components/assessment/GradingWorkspaceHome';
import { AiAlertPlayground } from '../components/assessment/AiAlertPlayground';
import { API_BASE } from '../utils/api';

type QuestionBankSummary = {
  id: string;
  title: string;
  questionCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export const AssessmentPage: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'wizard' | 'library' | 'grading' | 'alerts'>('dashboard');
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; date: string; questionCount: number }>>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [questionBanks, setQuestionBanks] = useState<QuestionBankSummary[]>([]);
  const [questionBanksLoading, setQuestionBanksLoading] = useState(false);

  useEffect(() => {
    if (view !== 'dashboard') return;
    setDraftsLoading(true);
    fetch(`${API_BASE}/api/quizzes/drafts`)
      .then((res) => res.json())
      .then((data) => {
        const items = Array.isArray(data?.drafts) ? data.drafts : [];
        setDrafts(items.map((item: any) => ({
          id: String(item.id),
          title: String(item.title || '未命名測驗'),
          date: item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : '',
          questionCount: Number(item.questionCount || 0),
        })));
      })
      .catch(() => setDrafts([]))
      .finally(() => setDraftsLoading(false));
  }, [view]);

  useEffect(() => {
    if (view !== 'dashboard') return;
    setQuestionBanksLoading(true);
    fetch(`${API_BASE}/api/quizzes/question-banks`)
      .then((res) => res.json())
      .then((data) => {
        const items = Array.isArray(data?.banks) ? data.banks : [];
        setQuestionBanks(items.map((item: any) => ({
          id: String(item.id || ''),
          title: String(item.title || '未命名題庫'),
          questionCount: Number(item.questionCount || 0),
          createdAt: item.createdAt ? String(item.createdAt) : '',
          updatedAt: item.updatedAt ? String(item.updatedAt) : '',
        })));
      })
      .catch(() => setQuestionBanks([]))
      .finally(() => setQuestionBanksLoading(false));
  }, [view]);

  const visibleQuestionBanks = useMemo(() => questionBanks.slice(0, 2), [questionBanks]);

  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${draftId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('刪除草稿失敗');
      }
      setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
      if (selectedDraftId === draftId) {
        setSelectedDraftId(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingDraftId(null);
    }
  };

  if (view === 'wizard') {
    return <AssessmentWizard onBack={() => { setSelectedDraftId(null); setView('dashboard'); }} draftId={selectedDraftId} />;
  }

  if (view === 'library') {
    return <AssessmentLibrary onBack={() => setView('dashboard')} />;
  }

  if (view === 'grading') {
    return <GradingWorkspaceHome onBack={() => setView('dashboard')} />;
  }

  if (view === 'alerts') {
    return (
      <div className="h-full flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setView('dashboard')} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-2 transition-colors">
              <Icons.back className="w-4 h-4 mr-2" />
              返回智能評測
            </button>
            <h1 className="text-2xl font-bold text-slate-800">多維度 AI 異常警示展示</h1>
          </div>
        </div>
        <AiAlertPlayground />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">智能評測</h1>
          <p className="text-slate-500">運用 AI 技術快速生成測驗，並自動批改與分析學生表現。</p>
        </div>
        <button 
          onClick={() => setView('alerts')}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
        >
          <ShieldAlert className="w-4 h-4" />
          AI 警示展示
        </button>
      </div>

      {/* Bento Grid 2x2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Left: AI 出題精靈 */}
        <motion.div 
          onClick={() => setView('wizard')}
          whileHover={{ y: -4, boxShadow: '0 20px 25px -5px rgba(79, 70, 229, 0.1), 0 10px 10px -5px rgba(79, 70, 229, 0.04)' }}
          className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[24px] p-8 text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col justify-between relative overflow-hidden group cursor-pointer min-h-[280px]"
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
          
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm">
              <Icons.sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">AI 智能出題</h2>
            <p className="text-indigo-100 text-sm leading-relaxed mb-8">
              上傳教材或輸入主題，AI 將自動為您生成選擇題、填充題與問答題，大幅節省備課時間。
            </p>
          </div>
          
          <button className="relative z-10 w-full py-4 bg-white text-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors shadow-sm">
            <Icons.add className="w-5 h-5" />
            創建新測驗
          </button>
        </motion.div>

        {/* Top Right: 智能批改工作台 */}
        <motion.div 
          onClick={() => setView('grading')}
          whileHover={{ y: -4, boxShadow: '0 20px 25px -5px rgba(244, 63, 94, 0.1), 0 10px 10px -5px rgba(244, 63, 94, 0.04)' }}
          className="bg-gradient-to-br from-rose-500 to-rose-700 rounded-[24px] p-8 text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col justify-between relative overflow-hidden group cursor-pointer min-h-[280px]"
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <PenTool className="w-6 h-6 text-white" />
              </div>
              <div className="bg-amber-400 text-amber-900 font-bold px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 shadow-sm">
                <AlertCircle className="w-4 h-4" />
                12 份待批改
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">智能批改工作台</h2>
            <p className="text-rose-100 text-sm leading-relaxed mb-8">
              AI 輔助批改主觀題與作文，自動生成評語與得分建議，大幅提升批改效率。
            </p>
          </div>
          
          <button className="relative z-10 w-full py-4 bg-white text-rose-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-rose-50 transition-colors shadow-sm">
            進入批改
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>

        {/* Bottom Left: 草稿箱 */}
        <div className="bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              草稿箱
            </h2>
            <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
              {drafts.length} 份
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {draftsLoading ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-400">正在載入草稿...</div>
            ) : drafts.length ? drafts.slice(0, 4).map(draft => (
              <div
                key={draft.id}
                onClick={() => {
                  setSelectedDraftId(draft.id);
                  setView('wizard');
                }}
                className="group p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">
                      草稿
                    </span>
                    <span className="text-xs text-slate-400">{draft.date}</span>
                  </div>
                  <h3 className="font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">{draft.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{draft.questionCount} 題</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-indigo-600 group-hover:shadow-sm transition-all">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteDraft(draft.id);
                    }}
                    disabled={deletingDraftId === draft.id}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-white hover:text-rose-600 hover:shadow-sm transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm font-semibold text-slate-400">還沒有草稿</div>
            )}
          </div>
        </div>

        {/* Bottom Right: 歷史題庫 */}
        <div className="bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Icons.task className="w-5 h-5 text-slate-400" />
              歷史題庫
            </h2>
            <button 
              onClick={() => setView('library')}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              查看全部
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {questionBanksLoading ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-400">
                正在載入題庫...
              </div>
            ) : visibleQuestionBanks.length ? visibleQuestionBanks.map(item => (
              <div 
                key={item.id} 
                onClick={() => setView('library')}
                className="p-4 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-slate-700">{item.title}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ml-2 bg-indigo-100 text-indigo-700">
                    題庫
                  </span>
                </div>
                
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="w-3.5 h-3.5" />
                    <span>{item.questionCount} 題已收錄</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : '剛剛更新'}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm font-semibold text-slate-400">
                還沒有題庫，先到測驗預覽把題目加入題庫吧。
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
