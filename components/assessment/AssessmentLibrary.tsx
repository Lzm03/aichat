import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Search, BookOpen, Download, Share2, X, ChevronRight, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/api';

interface AssessmentLibraryProps {
  onBack: () => void;
}

type LibraryQuestion = {
  id: string | number;
  type: string;
  cognitiveLevel: string;
  levelColor: string;
  content: string;
  options?: string[];
  answer: string;
};

type QuestionBank = {
  id: string;
  title: string;
  questionCount: number;
  createdAt?: string;
  updatedAt?: string;
  questions?: LibraryQuestion[];
};

const QuestionCard = ({ q, index }: { q: LibraryQuestion; index: number }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
    <div className="flex gap-2 mb-4">
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${q.levelColor || 'bg-slate-100 text-slate-700'}`}>
        {q.cognitiveLevel}
      </span>
      <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
        {q.type}
      </span>
    </div>

    <p className="text-slate-800 font-medium mb-4 text-lg leading-relaxed">
      <span className="text-slate-400 mr-2">{index + 1}.</span>
      {q.content}
    </p>

    {q.options?.length ? (
      <div className="space-y-2 mb-6 ml-6">
        {q.options.map((opt: string) => (
          <div key={opt} className="px-4 py-2.5 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-100">
            {opt}
          </div>
        ))}
      </div>
    ) : null}

    <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 border border-slate-100">
      <span className="font-bold text-slate-700 mr-2">參考答案：</span>
      {q.answer}
    </div>
  </div>
);

export const AssessmentLibrary: React.FC<AssessmentLibraryProps> = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingBanks(true);
    fetch(`${API_BASE}/api/quizzes/question-banks?includeQuestions=1`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const next = Array.isArray(data?.banks) ? data.banks : [];
        setBanks(next);
      })
      .catch(() => {
        if (!active) return;
        setBanks([]);
      })
      .finally(() => {
        if (active) setLoadingBanks(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredBanks = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return banks;
    return banks.filter((bank) => String(bank.title || '').toLowerCase().includes(keyword));
  }, [banks, searchQuery]);

  const handleDeleteBank = async (bankId: string) => {
    setDeletingBankId(bankId);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/question-banks/${bankId}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '刪除題庫失敗，請稍後再試。'));
      }
      setBanks((prev) => prev.filter((bank) => bank.id !== bankId));
      setSelectedBank((prev) => (prev?.id === bankId ? null : prev));
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingBankId(null);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-2 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />
            返回指揮艙
          </button>
          <h1 className="text-2xl font-bold text-slate-800">歷史題庫</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜尋題庫名稱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full md:w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loadingBanks ? (
          <div className="col-span-full rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">
            正在載入題庫...
          </div>
        ) : filteredBanks.length ? (
          filteredBanks.map((item) => (
            <motion.div
              key={item.id}
              whileHover={{ y: -4 }}
              onClick={() => setSelectedBank(item)}
              className="bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100 cursor-pointer flex flex-col h-full transition-shadow hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                    題庫
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteBank(item.id);
                    }}
                    disabled={deletingBankId === item.id}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-6 flex-1">
                <h3 className="text-lg font-bold text-slate-800 line-clamp-2">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">
                  最近更新 {item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : '--'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 font-medium">共 {item.questionCount} 題</span>
                  <span className="text-xs text-slate-400">{item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : ''}</span>
                </div>
                <span className="text-sm font-bold text-indigo-600 flex items-center gap-1 transition-transform">
                  查看完整題目 <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">
            還沒有題庫，先從測驗預覽把題目加入題庫吧。
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedBank ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-4xl h-[85vh] bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedBank.title}</h2>
                  <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                    <span>題庫</span>
                    <span>•</span>
                    <span>共 {selectedBank.questionCount} 題</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                    <Download className="w-4 h-4" />
                    下載 PDF
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm">
                    <Share2 className="w-4 h-4" />
                    分享題庫
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedBank && void handleDeleteBank(selectedBank.id)}
                    disabled={deletingBankId === selectedBank.id}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    刪除題庫
                  </button>
                  <button
                    onClick={() => setSelectedBank(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors ml-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
                {selectedBank.questions?.length ? (
                  selectedBank.questions.map((q, index) => (
                    <QuestionCard key={`${selectedBank.id}-${q.id}-${index}`} q={q} index={index} />
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                    <p>此題庫暫無題目</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
