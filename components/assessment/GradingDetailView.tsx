import { uiText } from '../../utils/uiI18n';
import React, { useEffect, useMemo, useState } from 'react';
import { Flag, HeartPulse, AlertTriangle, MessageSquareWarning, ShieldAlert, HelpCircle, Download } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { downloadAssessmentResultsCsv } from '../../utils/assessment-csv';
import { Icons } from '../icons';

interface GradingDetailViewProps {
  quizId: string;
  onBack: () => void;
}

const anomalyConfig: Record<string, { title: string; message: string; icon: any; tone: string }> = {
  wellbeing: { title: '🚨 關懷提示', message: '系統留意到作答中包含較為負面或不安的情緒描寫，建議進一步關注學生的身心狀況。', icon: HeartPulse, tone: 'rose' },
  academic: { title: '⚠️ 學術提示', message: '此份作答語言特徵異常，建議老師進一步核實是否存在非原創內容。', icon: AlertTriangle, tone: 'amber' },
  inappropriate: { title: '⚠️ 內容提示', message: '作答中疑似包含攻擊性或不適宜詞彙，建議老師查看。', icon: MessageSquareWarning, tone: 'orange' },
  privacy: { title: '🛡️ 私隱提示', message: '作答中可能出現敏感個資，建議老師妥善處理。', icon: ShieldAlert, tone: 'blue' },
  effort: { title: '💡 狀態提示', message: '作答內容偏短或偏離題意，學生可能尚未真正投入作答。', icon: HelpCircle, tone: 'slate' },
};

export const GradingDetailView: React.FC<GradingDetailViewProps> = ({ quizId, onBack }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API_BASE}/api/quizzes/${quizId}/grading-detail`)
      .then((res) => res.json())
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setCurrentStudentIdx(0);
      })
      .catch(() => {
        if (!active) return;
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quizId, publishing]);

  const students = Array.isArray(data?.students) ? data.students : [];
  const currentStudent = students[currentStudentIdx] || null;
  const activeAnomalyKey = currentStudent?.anomalyFlags?.[0];
  const activeAnomaly = activeAnomalyKey ? anomalyConfig[activeAnomalyKey] : null;

  const progress = useMemo(() => {
    const total = Math.max(1, Number(data?.metrics?.totalStudents || 0));
    const completed = Number(data?.metrics?.completed || 0);
    return `${Math.round((completed / total) * 100)}%`;
  }, [data]);

  const publishGrades = async () => {
    setPublishing(true);
    try {
      await fetch(`${API_BASE}/api/quizzes/${quizId}/grading/publish`, { method: 'POST' });
    } finally {
      setPublishing(false);
    }
  };

  const formatCorrectAnswer = (answer: any) => {
    const raw = String(answer.correctAnswer || '').trim();
    if (!raw) return '開放式答案';
    const options = Array.isArray(answer.options) ? answer.options : [];
    const match = raw.match(/^([A-D])(?:[.．、]|\s|$)/i);
    if (!match) return raw;
    const option = options.find((item: string) => item.trim().startsWith(`${match[1].toUpperCase()}.`));
    return option || raw;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex overflow-hidden">
      <div className="w-[280px] bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm z-10">
        <div className="p-4 border-b border-slate-100">
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 mb-3 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />{uiText("返回工作台")}</button>
          <h2 className="font-bold text-slate-800 leading-tight">{data?.quiz?.title || uiText('測驗詳情')}</h2>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {loading ? <div className="p-4 text-sm text-slate-400">{uiText("正在載入學生作答...")}</div> : null}
          {students.map((student: any, idx: number) => {
            const isActive = idx === currentStudentIdx;
            const statusText =
              student.status === 'pending_confirm' ? '待確認' : student.status === 'pending_grading' ? '待批改' : '已完成';
            const statusClass =
              student.status === 'pending_confirm'
                ? 'bg-purple-100 text-purple-700'
                : student.status === 'pending_grading'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-emerald-100 text-emerald-700';
            return (
              <div
                key={student.attemptId}
                onClick={() => setCurrentStudentIdx(idx)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                  isActive ? 'bg-indigo-50 border border-indigo-100 shadow-sm' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${student.status === 'completed' ? 'bg-emerald-500' : student.status === 'pending_confirm' ? 'bg-purple-500' : 'bg-slate-400'}`} />
                  <span className={`font-bold ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{student.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusClass}`}>{uiText(statusText)}</span>
                  {student.anomalyFlags?.length ? <Flag className="w-3.5 h-3.5 text-rose-500" /> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
            <span>{uiText("批改進度")}</span>
            <span>{data?.metrics?.completed || 0} / {data?.metrics?.totalStudents || 0}{uiText(" 人")}</span>
          </div>
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: progress }} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC]">
        <div className="p-6 border-b border-slate-100 bg-white flex items-center justify-between">
          <div>
            <div className="text-[25px] font-black leading-tight text-slate-900">{currentStudent?.name || uiText('學生')}</div>
            <div className="mt-2 text-sm font-semibold text-slate-400">{uiText("提交於 ")}{currentStudent?.submittedAt ? new Date(currentStudent.submittedAt).toISOString().slice(5, 16).replace('T', ' ') : '--'}</div>
          </div>
          <div className="rounded-full bg-indigo-50 px-4 py-2 text-base font-black text-indigo-600">{uiText("總分 ")}{currentStudent?.score || 0} / {currentStudent?.totalPoints || 0}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeAnomaly ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
              <div className="flex items-center gap-2 text-xl font-black">{uiText(activeAnomaly.title)}</div>
              <div className="mt-2 text-base font-medium leading-7">{uiText(activeAnomaly.message)}</div>
            </div>
          ) : null}

          {currentStudent?.answers?.map((answer: any, index: number) => (
            <div key={`${answer.questionId}-${index}`} className="rounded-[28px] border border-slate-100 bg-white p-7 shadow-sm">
              <div className="text-[16px] font-black leading-8 text-slate-900">{index + 1}. {answer.question}</div>
              <div className={`mt-4 rounded-2xl border px-5 py-4 text-base font-bold ${
                answer.isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}>
                <div>{uiText("學生作答：")}{answer.studentAnswer || uiText('未作答')}</div>
                <div className="mt-2">{uiText("正確答案：")}{formatCorrectAnswer(answer)}</div>
                <div className="mt-2 text-right text-2xl font-black">{answer.score} / {answer.maxScore}</div>
              </div>
              {answer.feedback ? <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium leading-7 text-slate-600">{uiText("AI 評語：")}{answer.feedback}</div> : null}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 bg-white p-5 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-500">{uiText("本次平均分 ")}{data?.metrics?.averageScore || 0}{uiText(" · 異常標記 ")}{data?.metrics?.anomalyCount || 0}</div>
          <div className="flex gap-3">
            <button
              onClick={() => downloadAssessmentResultsCsv(data)}
              disabled={!students.length}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-3 text-sm font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />{uiText("匯出 CSV")}</button>
            <button className="rounded-full border border-slate-200 bg-white px-7 py-3 text-sm font-black text-slate-600">{uiText("儲存草稿")}</button>
            <button onClick={() => void publishGrades()} disabled={publishing} className="rounded-full bg-indigo-600 px-7 py-3 text-sm font-black text-white disabled:opacity-60">
              {publishing ? uiText('發佈中...') : uiText('批量發佈成績')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
