import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, X, CheckCircle2, XCircle, ShieldAlert, ChevronDown } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Icons } from '../icons';
import { QuestionCard, type LibraryQuestion } from './QuestionCard';
import { AnomalyAlertCenter, type AnomalyFlag } from './AnomalyAlertCenter';

export type PublishedQuizSummary = {
  id: string;
  title: string;
  questionCount: number;
  botId: string;
  botName: string;
  botSubject: string;
  publishedAt?: string;
  gradingCompletedAt?: string | null;
  totalStudents: number;
  submitted: number;
  completed: number;
  pendingConfirm: number;
  pendingGrading: number;
  averageScore: number;
  progress: number;
};

export type DrawerTab = 'preview' | 'results' | 'quality';
/** detail = 測驗管理語境（我的測驗，3 tabs）；alerts = 質量分析語境（純異常警示視圖，無 tab bar） */
export type DrawerMode = 'detail' | 'alerts';

type StudentRow = {
  id: string;
  attemptId: string;
  name: string;
  submittedAt?: string;
  status: string;
  anomalyFlags: AnomalyFlag[];
  score: number;
  totalPoints: number;
  answers: Array<{
    questionIndex: number;
    question: string;
    options: string[];
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    score: number;
    aiScore: number;
    maxScore: number;
    feedback: string;
  }>;
};

type GradingDetail = {
  quiz?: { id: string; title: string; questionCount: number; updatedAt?: string };
  metrics?: {
    totalStudents: number;
    pendingGrading: number;
    pendingConfirm: number;
    completed: number;
    averageScore: number;
    anomalyCount: number;
  };
  students?: StudentRow[];
};

type PublishedQuizDetailDrawerProps = {
  open: boolean;
  quiz: PublishedQuizSummary | null;
  onClose: () => void;
  onDuplicated: () => void;
  initialTab?: DrawerTab;
  mode?: DrawerMode;
};

const STATUS_PILL: Record<string, string> = {
  pending_grading: 'bg-amber-50 text-amber-600',
  pending_confirm: 'bg-purple-50 text-purple-600',
  completed: 'bg-emerald-50 text-emerald-600',
};

const STATUS_LABEL: Record<string, string> = {
  pending_grading: '待批改',
  pending_confirm: '待確認',
  completed: '已完成',
};

const DRAWER_TABS: { key: DrawerTab; label: string }[] = [
  { key: 'preview', label: '題目預覽' },
  { key: 'results', label: '成績結果' },
  { key: 'quality', label: '質量分析' },
];

const formatDate = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : '--');

export const PublishedQuizDetailDrawer: React.FC<PublishedQuizDetailDrawerProps> = ({
  open,
  quiz,
  onClose,
  onDuplicated,
  initialTab = 'preview',
  mode = 'detail',
}) => {
  const isAlertsMode = mode === 'alerts';
  const [activeTab, setActiveTab] = useState<DrawerTab>('preview');
  const [questions, setQuestions] = useState<LibraryQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [detail, setDetail] = useState<GradingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [alertFocusStudentId, setAlertFocusStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !quiz) return;
    setActiveTab(initialTab);
    setExpandedStudentId(null);
    setDuplicateError('');

    let active = true;
    if (isAlertsMode) {
      setQuestions([]);
      setQuestionsLoading(false);
    } else {
      setQuestionsLoading(true);
      fetch(`${API_BASE}/api/quizzes/${quiz.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          setQuestions(Array.isArray(data?.questions) ? data.questions : []);
        })
        .catch(() => {
          if (!active) return;
          setQuestions([]);
        })
        .finally(() => {
          if (active) setQuestionsLoading(false);
        });
    }

    setDetailLoading(true);
    fetch(`${API_BASE}/api/quizzes/${quiz.id}/grading-detail`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setDetail(data);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, quiz]);

  const handleDuplicate = async () => {
    if (!quiz || duplicating) return;
    setDuplicating(true);
    setDuplicateError('');
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${quiz.id}/duplicate`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '複製草稿失敗，請稍後再試。'));
      }
      onDuplicated();
    } catch (error) {
      setDuplicateError(error instanceof Error ? error.message : uiText("複製草稿失敗，請稍後再試。"));
    } finally {
      setDuplicating(false);
    }
  };

  const metrics = detail?.metrics;
  const students = detail?.students || [];

  const openAnomalyCount = students.reduce(
    (sum, student) => sum + (student.anomalyFlags || []).filter((flag) => flag.status === 'open').length,
    0
  );

  const updateStudentFlags = (attemptId: string, flags: AnomalyFlag[]) => {
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            students: prev.students?.map((student) =>
              String(student.attemptId) === attemptId ? { ...student, anomalyFlags: flags } : student
            ),
          }
        : prev
    );
  };

  return (
    <AnimatePresence>
      {open && quiz ? (
        <div className="fixed inset-0 z-[95] pointer-events-none">
          <div className="absolute inset-0 bg-slate-950/10" aria-hidden="true" />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="absolute right-0 top-0 h-full w-[min(720px,100vw)] border-l border-slate-200 bg-slate-50 shadow-2xl pointer-events-auto"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-slate-800">{quiz.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{uiText("發佈日期")} {formatDate(quiz.publishedAt)}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icons.bot className="h-3.5 w-3.5 text-indigo-500" />
                      {uiText("綁定 Bot")}：{quiz.botName}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tabs（alerts 模式唔顯示，純警示視圖） */}
              {!isAlertsMode ? (
                <div className="flex gap-6 border-b border-slate-100 bg-white px-6 text-sm font-bold text-slate-400">
                  {DRAWER_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-1 py-3 transition ${activeTab === tab.key ? 'border-b-2 border-indigo-600 text-indigo-600' : 'hover:text-slate-700'}`}
                    >
                      {uiText(tab.label)}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                {!isAlertsMode && activeTab === 'preview' && (
                  <div className="space-y-4">
                    {questionsLoading ? (
                      <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入題目...")}</div>
                    ) : questions.length ? (
                      questions.map((q, index) => <QuestionCard key={`${quiz.id}-${q.id}-${index}`} q={q} index={index} />)
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("此測驗暫無題目")}</div>
                    )}
                  </div>
                )}

                {!isAlertsMode && activeTab === 'results' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("平均分")}</span>
                        <div className="mt-1 text-2xl font-black text-slate-800">{metrics?.averageScore ?? '--'}</div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("待批改")}</span>
                        <div className="mt-1 text-2xl font-black text-amber-500">{metrics?.pendingGrading ?? '--'}</div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("待確認")}</span>
                        <div className="mt-1 text-2xl font-black text-purple-500">{metrics?.pendingConfirm ?? '--'}</div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("已完成")}</span>
                        <div className="mt-1 text-2xl font-black text-emerald-500">{metrics?.completed ?? '--'}</div>
                      </div>
                    </div>

                    {detailLoading ? (
                      <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入成績...")}</div>
                    ) : students.length ? (
                      <div className="space-y-2">
                        {students.map((student) => {
                          const expanded = expandedStudentId === student.id;
                          const flags = (student.anomalyFlags || []).filter((flag) => flag.status === 'open').length;
                          return (
                            <div key={student.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setExpandedStudentId(expanded ? null : student.id)}
                                className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50/60"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-slate-800">{student.name}</span>
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_PILL[student.status] || 'bg-slate-100 text-slate-600'}`}>
                                      {uiText(STATUS_LABEL[student.status] || student.status)}
                                    </span>
                                    {flags > 0 ? (
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        title={uiText("查看異常警示")}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setAlertFocusStudentId(student.id);
                                          setActiveTab('quality');
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setAlertFocusStudentId(student.id);
                                            setActiveTab('quality');
                                          }
                                        }}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-rose-500 transition hover:bg-rose-50"
                                      >
                                        <ShieldAlert className="h-3.5 w-3.5" />
                                        {flags}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {uiText("提交於")} {formatDate(student.submittedAt)}
                                  </p>
                                </div>
                                <span className="text-sm font-bold text-slate-600 shrink-0">
                                  {student.score}{uiText(" / ")}{student.totalPoints}
                                </span>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                              </button>

                              {expanded ? (
                                <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-4">
                                  {student.answers.length ? (
                                    student.answers.map((answer) => (
                                      <div key={`${student.id}-${answer.questionIndex}`} className="rounded-xl border border-slate-100 bg-white p-4">
                                        <div className="flex items-start justify-between gap-3">
                                          <p className="text-sm font-medium text-slate-800 leading-relaxed">
                                            <span className="text-slate-400 mr-1">{answer.questionIndex + 1}.</span>
                                            {answer.question}
                                          </p>
                                          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold ${answer.isCorrect ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {answer.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                            {answer.score}/{answer.maxScore}
                                          </span>
                                        </div>
                                        <div className="mt-3 space-y-2 text-sm">
                                          <p className="text-slate-500">
                                            <span className="font-bold text-slate-600">{uiText("學生作答")}：</span>
                                            {answer.studentAnswer ? answer.studentAnswer : <span className="text-slate-400">{uiText("未作答")}</span>}
                                          </p>
                                          <p className="text-slate-500">
                                            <span className="font-bold text-slate-600">{uiText("正確答案")}：</span>
                                            {answer.correctAnswer}
                                          </p>
                                          {answer.feedback ? (
                                            <p className="rounded-lg bg-indigo-50/60 p-3 text-slate-600">
                                              <span className="font-bold text-indigo-600">{uiText("AI 評語")}：</span>
                                              {answer.feedback}
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm font-semibold text-slate-400">{uiText("沒有學生作答紀錄")}</p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("沒有學生作答紀錄")}</div>
                    )}
                  </div>
                )}

                {(isAlertsMode || activeTab === 'quality') && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("平均分")}</span>
                        <div className="mt-1 text-2xl font-black text-slate-800">{metrics?.averageScore ?? '--'}</div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("待處理異常")}</span>
                        <div className="mt-1 text-2xl font-black text-amber-500 flex items-center gap-1.5">
                          {detail ? openAnomalyCount : (metrics?.anomalyCount ?? '--')}
                          <ShieldAlert className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("待批改")}</span>
                        <div className="mt-1 text-2xl font-black text-amber-500">{metrics?.pendingGrading ?? '--'}</div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400">{uiText("已完成")}</span>
                        <div className="mt-1 text-2xl font-black text-emerald-500">{metrics?.completed ?? '--'}</div>
                      </div>
                    </div>
                    {!isAlertsMode ? (
                      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                        <p className="text-sm font-bold text-slate-700">{uiTemplate("完成進度：{0} / {1} 份作答", quiz.submitted, quiz.totalStudents)}</p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.round(quiz.progress * 100)}%` }} />
                        </div>
                      </div>
                    ) : null}
                    <AnomalyAlertCenter
                      quizId={quiz.id}
                      students={students}
                      loading={detailLoading}
                      focusStudentId={alertFocusStudentId}
                      onFocusConsumed={() => setAlertFocusStudentId(null)}
                      onFlagsUpdated={updateStudentFlags}
                    />
                  </div>
                )}
              </div>

              {/* Footer：複製為草稿係題目預覽語境嘅動作，成績結果／質量分析／alerts 模式唔顯示 */}
              <div className="flex items-center gap-3 border-t border-slate-100 bg-white px-6 py-4">
                {!isAlertsMode && activeTab === 'preview' && duplicateError ? (
                  <p className="text-xs font-bold text-rose-500 mr-auto">{duplicateError}</p>
                ) : <span className="mr-auto" />}
                {!isAlertsMode && activeTab === 'preview' ? (
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={duplicating}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" />
                    {duplicating ? uiText("複製中...") : uiText("複製為草稿")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {uiText("關閉")}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
