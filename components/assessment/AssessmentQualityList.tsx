import { uiText } from '../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, ChevronRight } from 'lucide-react';
import { API_BASE } from '../../utils/api';

type QualitySummary = {
  id: string;
  title: string;
  subject?: string;
  date?: string;
  totalStudents?: number;
  submitted?: number;
  completed?: number;
  pendingConfirm?: number;
  pendingGrading?: number;
  averageScore?: number;
};

type AssessmentQualityListProps = {
  onOpenQuiz: (quizId: string) => void;
};

/** 評測質量總覽：測驗列表，點擊跳去智能評測並直開該測驗嘅質量分析 Drawer。 */
export const AssessmentQualityList: React.FC<AssessmentQualityListProps> = ({ onOpenQuiz }) => {
  const [summaries, setSummaries] = useState<QualitySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSummaries(Array.isArray(data?.quizzes) ? data.quizzes : []);
      })
      .catch(() => {
        if (!cancelled) setSummaries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white p-4 md:p-6 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col h-full border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center">
            <BarChart2 className="w-5 h-5 mr-2 text-indigo-500" />{uiText("評測質量總覽")}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">{uiText("點擊測驗查看本次測驗平均分、AI 與教師分數差異、教師修改率與異常作答標記。")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 min-h-[200px] flex items-center justify-center text-sm font-semibold text-slate-400">{uiText("正在載入…")}</div>
      ) : summaries.length ? (
        <div className="space-y-3 flex-1">
          {summaries.map((summary) => {
            const avg = Number(summary.averageScore || 0).toFixed(1);
            return (
              <motion.button
                key={summary.id}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenQuiz(summary.id)}
                className="w-full p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-all duration-200 group flex items-center justify-between text-left"
              >
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors truncate">{summary.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{summary.date ? new Date(summary.date).toISOString().slice(5, 10) : '--'}</span>
                    <span>{uiText("平均 ")}{avg}{uiText(" 分")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {Number(summary.pendingGrading) > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded-md bg-amber-50 text-amber-600">{uiText("待批改")} {summary.pendingGrading}</span>
                  )}
                  <span className="text-xs font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-600">{uiText("已完成 ")}{summary.submitted ?? summary.completed}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                </div>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-[200px] flex items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white text-sm font-semibold text-slate-400">
          {uiText("還沒有已發佈的測驗")}
        </div>
      )}
    </div>
  );
};
