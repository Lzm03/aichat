import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Icons } from '../icons';

type LearningReportEntryCardProps = {
  onClick: () => void;
};

/** Dashboard 輕量入口卡：只顯示待批改 KPI，完整報告喺「學習報告」頁。 */
export const LearningReportEntryCard: React.FC<LearningReportEntryCardProps> = ({ onClick }) => {
  const [pendingGrading, setPendingGrading] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const quizzes = Array.isArray(data?.quizzes) ? data.quizzes : [];
        const total = quizzes.reduce((sum: number, quiz: any) => sum + Number(quiz.pendingGrading || 0), 0);
        setPendingGrading(total);
      })
      .catch(() => {
        if (!cancelled) setPendingGrading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-[168px] items-center gap-5 overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="absolute right-0 top-0 h-28 w-28 translate-x-6 -translate-y-6 rounded-full bg-violet-100/80 blur-2xl" aria-hidden="true" />
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icons.report className="h-7 w-7" />
      </span>
      <span className="relative min-w-0">
        <span className="block text-lg font-black text-slate-900">{uiText("學習報告")}</span>
        <span className="mt-1 block text-sm text-slate-500">
          {pendingGrading === null
            ? uiText("學生能力與測驗質量總覽")
            : pendingGrading > 0
            ? uiTemplate("待批改 {0} 份 · 查看完整報告", pendingGrading)
            : uiText("查看完整報告")}
        </span>
      </span>
      <ArrowRight className="relative ml-auto h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" />
    </button>
  );
};
