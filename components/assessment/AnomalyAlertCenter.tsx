import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, HeartPulse, HelpCircle, MessageSquareWarning, ShieldAlert, ShieldCheck } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Icons } from '../icons';

export type AnomalyFlagType = 'wellbeing' | 'academic' | 'inappropriate' | 'privacy' | 'effort';
export type AnomalyFlagStatus = 'open' | 'resolved' | 'dismissed';

export type AnomalyFlag = {
  type: AnomalyFlagType;
  questionIndex: number | null;
  questionId: string;
  excerpt: string;
  reason: string;
  status: AnomalyFlagStatus;
  teacherComment: string;
  resolvedAt: string | null;
};

type AlertCenterStudent = {
  id: string;
  attemptId: string;
  name: string;
  anomalyFlags: AnomalyFlag[];
  answers: Array<{ questionIndex: number; question: string; studentAnswer: string }>;
};

type AnomalyAlertCenterProps = {
  quizId: string;
  students: AlertCenterStudent[];
  loading: boolean;
  focusStudentId?: string | null;
  onFocusConsumed?: () => void;
  onFlagsUpdated: (attemptId: string, flags: AnomalyFlag[]) => void;
};

const TYPE_ORDER: AnomalyFlagType[] = ['wellbeing', 'inappropriate', 'academic', 'privacy', 'effort'];

const TYPE_CONFIG: Record<AnomalyFlagType, { label: string; alertTitle: string; icon: any; banner: string; text: string; chip: string }> = {
  wellbeing: {
    label: '身心安全', alertTitle: '🚨 關懷提示', icon: HeartPulse,
    banner: 'bg-rose-50 border-rose-200', text: 'text-rose-700', chip: 'bg-rose-100 text-rose-800',
  },
  academic: {
    label: '非原創/AI', alertTitle: '⚠️ 學術提示', icon: AlertTriangle,
    banner: 'bg-amber-50 border-amber-200', text: 'text-amber-700', chip: 'bg-amber-100 text-amber-800',
  },
  inappropriate: {
    label: '不當言論', alertTitle: '⚠️ 內容提示', icon: MessageSquareWarning,
    banner: 'bg-orange-50 border-orange-200', text: 'text-orange-700', chip: 'bg-orange-100 text-orange-800',
  },
  privacy: {
    label: '私隱洩漏', alertTitle: '🛡️ 私隱提示', icon: ShieldAlert,
    banner: 'bg-blue-50 border-blue-200', text: 'text-blue-700', chip: 'bg-blue-100 text-blue-800',
  },
  effort: {
    label: '敷衍/偏題', alertTitle: '💡 狀態提示', icon: HelpCircle,
    banner: 'bg-slate-100 border-slate-200', text: 'text-slate-600', chip: 'bg-slate-200 text-slate-800',
  },
};

const STATUS_CONFIG: Record<AnomalyFlagStatus, { label: string; pill: string }> = {
  open: { label: '待處理', pill: 'bg-amber-100 text-amber-700' },
  resolved: { label: '已處理', pill: 'bg-emerald-100 text-emerald-700' },
  dismissed: { label: '已排除', pill: 'bg-slate-200 text-slate-600' },
};

const REASON_LABELS: Record<string, string> = {
  'wellbeing-distress-terms': "作答中出現與情緒困擾相關的詞語。",
  'effort-filler-terms': "作答中出現無意義字元或敷衍內容。",
  'effort-blank-answer': "填充題留空或答案過短。",
  'privacy-personal-info': "作答中出現疑似個人私隱資料。",
  'academic-ai-generated': "作答中出現疑似 AI 生成語句特徵。",
  'inappropriate-offensive-terms': "作答中出現攻擊性或不適宜詞彙。",
  'legacy': "歷史警示（偵測規則已更新）。",
};

type AlertEntry = {
  key: string;
  student: AlertCenterStudent;
  flag: AnomalyFlag;
  flagIndex: number;
};

/** 異常警示中心：質量分析 tab 主體，按型別分組、可篩選、可處理。 */
export const AnomalyAlertCenter: React.FC<AnomalyAlertCenterProps> = ({
  quizId,
  students,
  loading,
  focusStudentId,
  onFocusConsumed,
  onFlagsUpdated,
}) => {
  const [typeFilter, setTypeFilter] = useState<AnomalyFlagType | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [patchingKey, setPatchingKey] = useState<string | null>(null);
  const [resolveCommentFor, setResolveCommentFor] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const alerts: AlertEntry[] = useMemo(
    () =>
      students.flatMap((student) =>
        (student.anomalyFlags || []).map((flag, flagIndex) => ({
          key: `${student.attemptId}:${flagIndex}`,
          student,
          flag,
          flagIndex,
        }))
      ),
    [students]
  );

  const filtered = alerts.filter(({ flag }) => {
    if (typeFilter !== 'all' && flag.type !== typeFilter) return false;
    if (openOnly && flag.status !== 'open') return false;
    return true;
  });

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    entries: filtered.filter(({ flag }) => flag.type === type),
  })).filter((group) => group.entries.length > 0);

  const countFor = (type: AnomalyFlagType | 'all') =>
    alerts.filter(({ flag }) => type === 'all' || flag.type === type).length;

  // Jump from results tab: reveal the student's open alerts and scroll to the first card
  useEffect(() => {
    if (!focusStudentId) return;
    const studentAlerts = alerts.filter(({ student, flag }) => student.id === focusStudentId && flag.status === 'open');
    if (studentAlerts.length) {
      setTypeFilter('all');
      setOpenOnly(true);
      const first = studentAlerts[0];
      setHighlightedKey(first.key);
      window.setTimeout(() => {
        containerRef.current
          ?.querySelector<HTMLElement>(`[data-alert-key="${first.key}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      window.setTimeout(() => setHighlightedKey(null), 2200);
    }
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStudentId]);

  const patchFlag = async (entry: AlertEntry, status: 'resolved' | 'dismissed', teacherComment = '') => {
    const { student, flagIndex } = entry;
    const original = student.anomalyFlags;
    setPatchingKey(entry.key);
    setError('');
    // Optimistic update; revert on any failure
    const next = original.map((flag, index) =>
      index === flagIndex
        ? { ...flag, status, teacherComment: teacherComment || flag.teacherComment, resolvedAt: new Date().toISOString() }
        : flag
    );
    onFlagsUpdated(student.attemptId, next);
    try {
      const response = await fetch(
        `${API_BASE}/api/quizzes/${quizId}/attempts/${student.attemptId}/anomalies/${flagIndex}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, teacherComment }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || uiText("更新異常警示失敗，請稍後再試。")));
      onFlagsUpdated(student.attemptId, Array.isArray(data.anomalyFlags) ? data.anomalyFlags : next);
      setResolveCommentFor(null);
      setCommentDrafts((prev) => {
        const rest = { ...prev };
        delete rest[entry.key];
        return rest;
      });
    } catch (err) {
      onFlagsUpdated(student.attemptId, original);
      setError(err instanceof Error ? err.message : uiText("更新異常警示失敗，請稍後再試。"));
    } finally {
      setPatchingKey(null);
    }
  };

  const answerFor = (entry: AlertEntry) => {
    const { flag, student } = entry;
    if (flag.questionIndex === null) return '';
    return student.answers?.find((answer) => Number(answer.questionIndex) === Number(flag.questionIndex))?.studentAnswer || '';
  };

  const renderAnswer = (entry: AlertEntry) => {
    const answer = answerFor(entry);
    const excerpt = (entry.flag.excerpt || '').trim();
    if (!answer) {
      return <span className="text-slate-400">{uiText("未作答")}</span>;
    }
    if (!excerpt) return <span className="line-clamp-3">{answer}</span>;
    const idx = answer.indexOf(excerpt);
    const lowerIdx = idx >= 0 ? idx : answer.toLowerCase().indexOf(excerpt.toLowerCase());
    if (lowerIdx < 0) return <span className="line-clamp-3">{answer}</span>;
    return (
      <span>
        {answer.slice(0, lowerIdx)}
        <mark className="rounded bg-rose-100 px-0.5 font-semibold text-rose-700">
          {answer.slice(lowerIdx, lowerIdx + excerpt.length)}
        </mark>
        {answer.slice(lowerIdx + excerpt.length)}
      </span>
    );
  };

  const hasAnyAlert = alerts.length > 0;

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${
            typeFilter === 'all' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {uiText("全部")} {countFor('all') > 0 ? `(${countFor('all')})` : ''}
        </button>
        {TYPE_ORDER.map((type) => {
          const config = TYPE_CONFIG[type];
          const count = countFor(type);
          if (!count) return null;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${
                typeFilter === type ? `${config.chip} border-transparent` : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {uiText(config.label)} ({count})
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenOnly((prev) => !prev)}
          className={`ml-auto rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${
            openOnly ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {uiText("只看待處理")}
        </button>
      </div>

      {error ? <p className="text-xs font-bold text-rose-500">{error}</p> : null}

      {loading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入異常警示...")}</div>
      ) : !hasAnyAlert ? (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center">
          <Icons.bot className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">{uiText("此測驗暫無異常警示")}</p>
          <p className="mt-1 text-xs text-slate-400">{uiText("所有作答均未觸發異常警示，系統會持續監察學生的作答情況。")}</p>
        </div>
      ) : grouped.length ? (
        grouped.map((group) => {
          const config = TYPE_CONFIG[group.type];
          const GroupIcon = config.icon;
          return (
            <div key={group.type} className="space-y-2">
              <div className="flex items-center gap-2 pt-1">
                <GroupIcon className={`h-4 w-4 ${config.text}`} />
                <span className={`text-sm font-bold ${config.text}`}>{uiText(config.label)}</span>
                <span className="text-xs font-bold text-slate-400">{group.entries.length}</span>
              </div>
              {group.entries.map((entry) => {
                const statusConfig = STATUS_CONFIG[entry.flag.status];
                const isPatching = patchingKey === entry.key;
                const isResolving = resolveCommentFor === entry.key;
                const isHighlighted = highlightedKey === entry.key;
                return (
                  <div
                    key={entry.key}
                    data-alert-key={entry.key}
                    className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 ${entry.flag.status === 'open' ? `${config.banner} border-l-4` : 'border-slate-100'} ${isHighlighted ? 'ring-2 ring-indigo-400' : ''}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800">{entry.student.name}</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${config.chip}`}>{uiText(config.alertTitle)}</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${statusConfig.pill}`}>{uiText(statusConfig.label)}</span>
                      </div>
                      {entry.flag.questionIndex !== null ? (
                        <span className="text-xs font-bold text-slate-400">{uiTemplate("第 {0} 題", Number(entry.flag.questionIndex) + 1)}</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">{uiText("整份作答")}</span>
                      )}
                    </div>

                    {entry.flag.questionIndex !== null && (() => {
                      const question = entry.student.answers?.find((item) => Number(item.questionIndex) === Number(entry.flag.questionIndex))?.question;
                      return question ? (
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
                          <span className="mr-1 text-slate-400">{uiText("題目")}：</span>
                          {question}
                        </p>
                      ) : null;
                    })()}

                    <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">{uiText("學生作答")}</span>
                      {renderAnswer(entry)}
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      <span className="font-bold text-slate-600">{uiText("判斷依據")}：</span>
                      {uiText(REASON_LABELS[entry.flag.reason] || entry.flag.reason)}
                    </p>

                    {entry.flag.status !== 'open' && (
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        {entry.flag.teacherComment ? (
                          <p><span className="font-bold text-slate-600">{uiText("教師備註")}：</span>{entry.flag.teacherComment}</p>
                        ) : null}
                        {entry.flag.resolvedAt ? (
                          <p><span className="font-bold text-slate-600">{uiText("處理時間")}：</span>{new Date(entry.flag.resolvedAt).toISOString().slice(0, 16).replace('T', ' ')}</p>
                        ) : null}
                      </div>
                    )}

                    {entry.flag.status === 'open' && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        {isResolving ? (
                          <div className="space-y-2">
                            <textarea
                              value={commentDrafts[entry.key] || ''}
                              onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                              placeholder={uiText("教師備註（選填）")}
                              rows={2}
                              className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isPatching}
                                onClick={() => void patchFlag(entry, 'resolved', commentDrafts[entry.key] || '')}
                                className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {isPatching ? uiText("處理中") : uiText("確認")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setResolveCommentFor(null)}
                                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
                              >
                                {uiText("取消")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isPatching}
                              onClick={() => setResolveCommentFor(isResolving ? null : entry.key)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />{uiText("標記已處理")}
                            </button>
                            <button
                              type="button"
                              disabled={isPatching}
                              onClick={() => void patchFlag(entry, 'dismissed')}
                              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              <ShieldCheck className="h-4 w-4" />{uiText("確認無礙")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      ) : (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-bold text-slate-500">{uiText("沒有符合篩選條件的警示")}</p>
        </div>
      )}
    </div>
  );
};
