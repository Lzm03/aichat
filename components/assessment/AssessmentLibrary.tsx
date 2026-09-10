import { uiText } from '../../utils/uiI18n';
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Search, BookOpen, Download, Share2, X, ChevronRight, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { QuestionCard, type LibraryQuestion } from './QuestionCard';

interface AssessmentLibraryProps {
  onBack: () => void;
}

type QuestionBank = {
  id: string;
  title: string;
  questionCount: number;
  createdAt?: string;
  updatedAt?: string;
  questions?: LibraryQuestion[];
};

export const AssessmentLibrary: React.FC<AssessmentLibraryProps> = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');

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

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string
    );

  const questionsText = (bank: QuestionBank) =>
    (bank.questions || [])
      .map((q, index) => {
        const parts = [`${index + 1}. ${q.content}`];
        if (Array.isArray(q.options) && q.options.length) q.options.forEach((opt) => parts.push(opt));
        parts.push(`${uiText("參考答案：")}${q.answer}`);
        return parts.join('\n');
      })
      .join('\n\n');

  // 用獨立列印視窗（儲存為 PDF 由瀏覽器提供），避免印出成個 app
  const handleDownloadPdf = () => {
    if (!selectedBank) return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setActionError(uiText("無法開啟列印視窗，請允許彈出視窗後再試。"));
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(selectedBank.title)}</title>
<style>body{font-family:system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;padding:40px;color:#1e293b}h1{font-size:22px;margin:0 0 4px}p.meta{color:#64748b;font-size:13px;margin:0 0 24px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.9}</style></head>
<body><h1>${escapeHtml(selectedBank.title)}</h1><p class="meta">${uiText("共 ")}${selectedBank.questionCount}${uiText(" 題")} · ${new Date().toISOString().slice(0, 10)}</p><pre>${escapeHtml(questionsText(selectedBank))}</pre></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleCopyAll = async () => {
    if (!selectedBank) return;
    const text = `${selectedBank.title}\n\n${questionsText(selectedBank)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 非安全環境（iPad Safari 等）fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-2 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />{uiText("返回總覽")}</button>
          <h1 className="text-2xl font-bold text-slate-800">{uiText("歷史題庫")}</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={uiText("搜尋題庫名稱...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full md:w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loadingBanks ? (
          <div className="col-span-full rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入題庫...")}</div>
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
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">{uiText("題庫")}</span>
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
                <p className="mt-2 text-sm text-slate-400">{uiText("最近更新 ")}{item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : '--'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 font-medium">{uiText("共 ")}{item.questionCount}{uiText(" 題")}</span>
                  <span className="text-xs text-slate-400">{item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : ''}</span>
                </div>
                <span className="text-sm font-bold text-indigo-600 flex items-center gap-1 transition-transform">{uiText("查看完整題目 ")}<ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">{uiText("還沒有題庫，先從測驗預覽把題目加入題庫吧。")}</div>
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
                    <span>{uiText("題庫")}</span>
                    <span>•</span>
                    <span>{uiText("共 ")}{selectedBank.questionCount}{uiText(" 題")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={!selectedBank.questions?.length}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />{uiText("下載 PDF")}</button>
                  <button
                    type="button"
                    onClick={() => { setShareOpen(true); setActionError(''); }}
                    disabled={!selectedBank.questions?.length}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Share2 className="w-4 h-4" />{uiText("分享題庫")}</button>
                  <button
                    type="button"
                    onClick={() => selectedBank && void handleDeleteBank(selectedBank.id)}
                    disabled={deletingBankId === selectedBank.id}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />{uiText("刪除題庫")}</button>
                  <button
                    onClick={() => setSelectedBank(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors ml-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {actionError ? (
                <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 text-sm font-bold text-rose-600">{actionError}</div>
              ) : null}

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
                {selectedBank.questions?.length ? (
                  selectedBank.questions.map((q, index) => (
                    <QuestionCard key={`${selectedBank.id}-${q.id}-${index}`} q={q} index={index} />
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                    <p>{uiText("此題庫暫無題目")}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {shareOpen && selectedBank ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShareOpen(false)}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md bg-white rounded-[24px] shadow-2xl p-6"
            >
              <h3 className="text-lg font-bold text-slate-800">{uiText("分享題庫")}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{uiText("複製全部題目（含答案）後，可貼到任何地方分享。")}</p>
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                {selectedBank.title}
                <span className="ml-2 text-xs font-semibold text-slate-400">{uiText("共 ")}{selectedBank.questionCount}{uiText(" 題")}</span>
              </div>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
                >
                  {uiText("關閉")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAll()}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
                >
                  {copied ? uiText("已複製") : uiText("複製全部題目")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
