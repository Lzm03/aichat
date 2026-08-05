import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, BarChart2, ChevronDown, ChevronRight, ChevronUp, Download, Flag } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { downloadAssessmentResultsCsv } from '../../utils/assessment-csv';
import { Icons } from '../icons';

export const AssessmentQualityCard = () => {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const loadSummaries = useCallback(() => {
    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then((res) => res.json())
      .then((data) => setSummaries(Array.isArray(data?.quizzes) ? data.quizzes : []))
      .catch(() => setSummaries([]));
  }, []);

  useEffect(() => {
    loadSummaries();
    const refresh = () => {
      if (document.visibilityState === 'visible') loadSummaries();
    };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [loadSummaries]);

  useEffect(() => {
    if (!selectedAssessment?.id) return;
    fetch(`${API_BASE}/api/quizzes/${selectedAssessment.id}/grading-detail`)
      .then((res) => res.json())
      .then((data) => setDetails(data))
      .catch(() => setDetails(null));
  }, [selectedAssessment]);

  const sortedRows = useMemo(() => {
    const rows = Array.isArray(details?.students)
      ? details.students.flatMap((student: any) =>
          (student.answers || []).map((answer: any) => ({
            id: `Q${answer.questionIndex + 1}`,
            type: answer.type,
            bloom: answer.cognitiveLevel,
            aiScore: answer.aiScore,
            teacherScore: answer.score,
            diff: Number(answer.score || 0) - Number(answer.aiScore || 0),
          }))
        )
      : [];
    return rows.sort((a, b) => (sortOrder === 'desc' ? Math.abs(b.diff) - Math.abs(a.diff) : Math.abs(a.diff) - Math.abs(b.diff)));
  }, [details, sortOrder]);

  return (
    <>
      <div className="bg-white p-4 md:p-6 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col h-full border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center">
            <BarChart2 className="w-5 h-5 mr-2 text-indigo-500" />
            評測質量總覽
          </h3>
        </div>

        <div className="space-y-3 flex-1">
          {summaries.slice(0, 4).map((summary) => {
            const avg = Number(summary.averageScore || 0).toFixed(1);
            return (
              <div
                key={summary.id}
                onClick={() => setSelectedAssessment(summary)}
                className="p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-all group flex items-center justify-between"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">{summary.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{summary.date ? new Date(summary.date).toISOString().slice(5, 10) : '--'}</span>
                    <span>平均 {avg} 分</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-600">已完成 {summary.submitted ?? summary.completed}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selectedAssessment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="w-full max-w-5xl max-h-[90vh] bg-slate-50 rounded-[24px] shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedAssessment.title} - 質量分析</h2>
                  <p className="text-sm text-slate-500 mt-1">發佈日期: {selectedAssessment.date ? new Date(selectedAssessment.date).toISOString().slice(5, 10) : '--'}</p>
                </div>
                <button onClick={() => { setSelectedAssessment(null); setDetails(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                  <Icons.close className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">本次測驗平均分</span>
                    <div className="text-3xl font-black text-slate-800 mt-2">{details?.metrics?.averageScore || 0}</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">AI 與教師分數差異</span>
                    <div className="text-3xl font-black mt-2 text-rose-600">{sortedRows.length ? `+${Math.max(...sortedRows.map((row) => Math.abs(row.diff))).toFixed(1)}` : '+0.0'}</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">教師修改率</span>
                    <div className="text-3xl font-black text-indigo-600 mt-2">
                      {sortedRows.length ? `${Math.round((sortedRows.filter((row) => row.diff !== 0).length / sortedRows.length) * 100)}%` : '0%'}
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">異常作答標記</span>
                    <div className="text-3xl font-black text-amber-500 mt-2 flex items-center gap-2">
                      {details?.metrics?.anomalyCount || 0} <Flag className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <button onClick={() => setIsTableExpanded(!isTableExpanded)} className="flex items-center gap-2 font-bold text-slate-700 hover:text-indigo-600 transition-colors">
                      <span>📝 題目得分明細</span>
                      {isTableExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => downloadAssessmentResultsCsv(details)}
                      disabled={!details?.students?.length}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="w-4 h-4" />
                      匯出 CSV
                    </button>
                  </div>

                  {isTableExpanded ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 font-bold">題目 ID</th>
                            <th className="px-4 py-3 font-bold">題型</th>
                            <th className="px-4 py-3 font-bold">布魯姆層級</th>
                            <th className="px-4 py-3 font-bold text-center">AI 分數</th>
                            <th className="px-4 py-3 font-bold text-center">教師最終分數</th>
                            <th className="px-4 py-3 font-bold text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}>
                              <div className="flex items-center justify-center gap-1">差值 <ArrowUpDown className="w-3 h-3" /></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRows.map((detail) => (
                            <tr key={`${detail.id}-${detail.type}-${detail.bloom}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-800">{detail.id}</td>
                              <td className="px-4 py-3">{detail.type}</td>
                              <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold">{detail.bloom}</span></td>
                              <td className="px-4 py-3 text-center font-medium">{detail.aiScore}</td>
                              <td className="px-4 py-3 text-center font-bold text-indigo-600">{detail.teacherScore}</td>
                              <td className="px-4 py-3 text-center"><span className={`font-bold px-2 py-1 rounded-md ${detail.diff > 0 ? 'text-emerald-600 bg-emerald-50' : detail.diff < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-400'}`}>{detail.diff > 0 ? `+${detail.diff}` : detail.diff}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
