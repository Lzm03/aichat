import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, HeartPulse, HelpCircle, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../../utils/api';

type AnomalyAlertsOverviewProps = {
  onOpenQuiz: (summary: any) => void;
};

const LEGEND = [
  {
    type: 'wellbeing',
    label: '身心安全',
    icon: HeartPulse,
    title: '🚨 關懷提示',
    message: '系統留意到作答中包含較為負面或不安的情緒描寫，建議進一步關注學生的身心狀況。',
    text: 'text-rose-700',
    chip: 'bg-rose-100',
  },
  {
    type: 'inappropriate',
    label: '不當言論',
    icon: MessageSquareWarning,
    title: '⚠️ 內容提示',
    message: '作答中疑似包含攻擊性或不適宜的詞彙，請檢視內容並酌情引導。',
    text: 'text-orange-700',
    chip: 'bg-orange-100',
  },
  {
    type: 'academic',
    label: '非原創/AI',
    icon: AlertTriangle,
    title: '⚠️ 學術提示',
    message: '此份作答的語言特徵異常，可能包含非原創或 AI 生成內容，建議核實。',
    text: 'text-amber-700',
    chip: 'bg-amber-100',
  },
  {
    type: 'privacy',
    label: '私隱洩漏',
    icon: ShieldAlert,
    title: '🛡️ 私隱提示',
    message: '作答中疑似包含敏感的個人或家庭私隱資訊，請妥善保護數據。',
    text: 'text-blue-700',
    chip: 'bg-blue-100',
  },
  {
    type: 'effort',
    label: '敷衍/偏題',
    icon: HelpCircle,
    title: '💡 狀態提示',
    message: '作答內容與題目嚴重偏離或出現無意義字元，可能反映學生遇到學習困難。',
    text: 'text-slate-600',
    chip: 'bg-slate-200',
  },
];

/** AI 異常警示 sub-tab：有待處理警示嘅測驗列表＋警示類型說明。 */
export const AnomalyAlertsOverview: React.FC<AnomalyAlertsOverviewProps> = ({ onOpenQuiz }) => {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then((res) => res.json())
      .then((data) => setSummaries(Array.isArray(data?.quizzes) ? data.quizzes : []))
      .catch(() => {
        setError(true);
        setSummaries([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const alertQuizzes = summaries
    .filter((summary) => Number(summary.anomalyCount || 0) > 0)
    .sort(
      (a, b) =>
        Number(b.anomalyCount) - Number(a.anomalyCount) ||
        new Date(b.publishedAt || b.date || 0).getTime() - new Date(a.publishedAt || a.date || 0).getTime()
    );

  const formatDate = (value?: string) => (value ? new Date(value).toISOString().slice(5, 10) : '--');

  return (
    <div className="space-y-6">
      {/* Quiz list with pending anomalies */}
      <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center text-lg font-bold text-slate-800">
            <ShieldAlert className="mr-2 h-5 w-5 text-rose-500" />{uiText("AI 異常警示中心")}
          </h3>
          {alertQuizzes.length > 0 ? (
            <span className="text-xs font-bold text-slate-400">{uiTemplate("共 {0} 份測驗有異常警示", alertQuizzes.length)}</span>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">{uiText("正在載入異常警示...")}</div>
        ) : error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm font-bold text-slate-500">{uiText("載入異常警示失敗")}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {uiText("重新載入")}
            </button>
          </div>
        ) : alertQuizzes.length ? (
          <div className="space-y-3">
            {alertQuizzes.map((summary) => (
              <div
                key={summary.id}
                onClick={() => onOpenQuiz(summary)}
                className="group flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 transition-all hover:border-rose-200 hover:bg-rose-50/40"
              >
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-bold text-slate-700 transition-colors group-hover:text-rose-700">{summary.title}</h4>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>{summary.botName || '--'}</span>
                    <span>{formatDate(summary.publishedAt || summary.date)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {Number(summary.anomalyCount || 0)} {uiText("待處理")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:text-rose-500" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">{uiText("暫時沒有異常警示")}</p>
            <p className="mt-1 text-xs text-slate-400">{uiText("所有測驗的作答均未觸發異常警示，系統會持續監察學生的作答情況。")}</p>
          </div>
        )}
      </div>

      {/* Alert type guide */}
      <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] md:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-800">{uiText("警示類型說明")}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{uiText("身心安全警示優先置頂，建議優先處理。")}</p>
        </div>
        <div className="space-y-3">
          {LEGEND.map((item) => {
            const IconComponent = item.icon;
            return (
              <div key={item.type} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.chip}`}>
                  <IconComponent className={`h-5 w-5 ${item.text}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700">
                    {uiText(item.label)} <span className={`ml-1 text-xs ${item.text}`}>{uiText(item.title)}</span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{uiText(item.message)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
