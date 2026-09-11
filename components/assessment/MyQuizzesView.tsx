import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Edit3, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Icons } from '../icons';
import { PlatformDialog } from '../system/PlatformDialog';
import { usePlatformDialog } from '../../hooks/usePlatformDialog';
import { PublishedQuizDetailDrawer, type PublishedQuizSummary, type DrawerTab } from './PublishedQuizDetailDrawer';

type MyQuizzesViewProps = {
  onEditDraft: (draftId: string) => void;
  initialSubTab?: 'drafts' | 'published';
  // Deep-link：由學習報告跳入，自動開指定測驗嘅 Drawer
  initialQuizId?: string | null;
  initialDrawerTab?: 'results' | 'quality';
  onDeepLinkConsumed?: () => void;
};

type DraftSummary = {
  id: string;
  title: string;
  date: string;
  questionCount: number;
};

const SUB_TABS = [
  { key: 'drafts', label: '草稿' },
  { key: 'published', label: '已發佈' },
] as const;

/** 全部已交作答已發佈成績 = 批改完成（歸納） */
const isQuizGraded = (item: PublishedQuizSummary) =>
  Number(item.pendingGrading || 0) === 0 && Number(item.pendingConfirm || 0) === 0 && Number(item.completed || 0) > 0;

export const MyQuizzesView: React.FC<MyQuizzesViewProps> = ({
  onEditDraft,
  initialSubTab = 'published',
  initialQuizId = null,
  initialDrawerTab,
  onDeepLinkConsumed,
}) => {
  const [subTab, setSubTab] = useState<'drafts' | 'published'>(initialSubTab);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [published, setPublished] = useState<PublishedQuizSummary[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedLoaded, setPublishedLoaded] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [detailQuiz, setDetailQuiz] = useState<PublishedQuizSummary | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<DrawerTab>('preview');
  const deepLinkAttempted = useRef(false);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();

  const loadDrafts = useCallback(() => {
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
  }, []);

  const loadPublished = useCallback(() => {
    setPublishedLoading(true);
    fetch(`${API_BASE}/api/quizzes/published`)
      .then((res) => res.json())
      .then((data) => {
        const items = Array.isArray(data?.quizzes) ? data.quizzes : [];
        // 未完成批改嘅測驗置頂，已完成歸納嘅排後（stable sort 保留服務端順序）
        setPublished([...items].sort((a: PublishedQuizSummary, b: PublishedQuizSummary) => {
          const aActive = !isQuizGraded(a);
          const bActive = !isQuizGraded(b);
          return aActive === bActive ? 0 : aActive ? -1 : 1;
        }));
      })
      .catch(() => setPublished([]))
      .finally(() => {
        setPublishedLoading(false);
        setPublishedLoaded(true);
      });
  }, []);

  useEffect(() => {
    loadDrafts();
    loadPublished();
  }, [loadDrafts, loadPublished]);

  // Deep-link：等已發佈列表載入後搵目標測驗；搵到開 Drawer，搵唔到提示；只執行一次
  useEffect(() => {
    if (!initialQuizId || !publishedLoaded || deepLinkAttempted.current) return;
    deepLinkAttempted.current = true;
    const target = published.find((quiz) => String(quiz.id) === String(initialQuizId));
    if (target) {
      setDetailInitialTab(initialDrawerTab ?? 'results');
      setDetailQuiz(target);
    } else {
      showAlert({
        title: uiText("找不到此測驗"),
        message: uiText("找不到此測驗，可能已被刪除或尚未發佈。"),
        confirmText: uiText("知道了"),
      });
    }
    onDeepLinkConsumed?.();
  }, [initialQuizId, publishedLoaded, published, initialDrawerTab, onDeepLinkConsumed, showAlert]);

  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${draftId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('刪除草稿失敗');
      }
      setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingDraftId(null);
    }
  };

  const handleDuplicated = (quiz: PublishedQuizSummary) => {
    setDetailQuiz(null);
    setSubTab('drafts');
    void loadDrafts();
    showAlert({
      title: uiText("已複製為草稿"),
      message: uiTemplate("已將「{0}」複製為草稿。", quiz.title),
      confirmText: uiText("知道了"),
    });
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab pills */}
      <div className="flex flex-wrap items-center gap-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 ${
              subTab === tab.key
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {uiText(tab.label)}
          </button>
        ))}
      </div>

      {subTab === 'drafts' && (
        <div className="space-y-3">
          {draftsLoading ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入草稿...")}</div>
          ) : drafts.length ? (
            drafts.map((draft) => (
              <div
                key={draft.id}
                onClick={() => onEditDraft(draft.id)}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all cursor-pointer hover:border-indigo-100 hover:bg-indigo-50/30 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">{uiText("草稿")}</span>
                    <span className="text-xs text-slate-400">{draft.date}</span>
                  </div>
                  <h3 className="truncate font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">{draft.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{draft.questionCount}{uiText(" 題")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">{uiText("還沒有草稿")}</div>
          )}
        </div>
      )}

      {subTab === 'published' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {publishedLoading ? (
            <div className="col-span-full rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入已發佈測驗...")}</div>
          ) : published.length ? (
            published.map((item) => (
              <motion.div
                key={item.id}
                whileHover={{ y: -4 }}
                onClick={() => {
                  setDetailInitialTab('preview');
                  setDetailQuiz(item);
                }}
                className="bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100 cursor-pointer flex flex-col h-full transition-shadow hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                      <Icons.bot className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{uiText("綁定 Bot")}</span>
                      <p className="truncate text-sm font-bold text-slate-700">{item.botName}</p>
                    </div>
                  </div>
                  {item.botSubject ? (
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full shrink-0">{uiText(item.botSubject)}</span>
                  ) : null}
                  {isQuizGraded(item) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />{uiText("已完成批改")}
                    </span>
                  ) : null}
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800 line-clamp-2">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {item.questionCount}{uiText(" 題")} · {uiText("發佈日期")} {item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : '--'}
                    {isQuizGraded(item) && item.gradingCompletedAt ? (
                      <span className="font-bold text-emerald-600"> · {uiText("完成批改")} {new Date(item.gradingCompletedAt).toISOString().slice(5, 10)}</span>
                    ) : null}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-400">{uiText("完成進度")}</span>
                    <span className="text-slate-600">{item.submitted}/{item.totalStudents}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">{uiText("還沒有已發佈的測驗")}</div>
          )}
        </div>
      )}

      <PublishedQuizDetailDrawer
        open={Boolean(detailQuiz)}
        quiz={detailQuiz}
        onClose={() => setDetailQuiz(null)}
        onDuplicated={() => {
          if (detailQuiz) handleDuplicated(detailQuiz);
        }}
        initialTab={detailInitialTab}
      />
      <PlatformDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        tone={dialog.tone}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm || undefined}
      />
    </div>
  );
};
