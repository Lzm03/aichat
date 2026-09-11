import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../icons';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, ChevronRight, Target } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { downloadAbilityReportCsv } from '../../utils/assessment-csv';

// Bloom 六層級：固定順序 + 分類色（每層係獨立類別，顏色跟實體不跟排名）
const BLOOM_LEVELS = [
  { key: 'remember', label: '記憶', color: 'bg-blue-500' },
  { key: 'understand', label: '理解', color: 'bg-emerald-500' },
  { key: 'apply', label: '應用', color: 'bg-amber-500' },
  { key: 'analyze', label: '分析', color: 'bg-purple-500' },
  { key: 'evaluate', label: '評價', color: 'bg-rose-500' },
  { key: 'create', label: '創造', color: 'bg-sky-500' },
] as const;

type ClassLevel = {
  key: string;
  value: number;
  answered: number;
  correct: number;
};

type AbilityStudent = {
  studentId: string;
  name: string;
  avatar: string;
  recent: Record<string, number>;
  past: Record<string, number> | null;
};

type AbilityReport = {
  period: '30d' | 'all';
  generatedAt?: string;
  classLevels: ClassLevel[];
  students: AbilityStudent[];
};

type AbilityTrackingReportProps = {
  onCreateQuiz?: () => void;
};

// 雷達圖 tooltip：跟項目設計系統（rounded-xl、slate 色系、shadow-card）
const BloomRadarTooltip = ({ active, payload }: any) => {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || '#6366f1' }} />
          <span className="text-xs font-semibold text-slate-500">{entry.name}</span>
          <span className="text-xs font-black text-slate-800">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
};

export const AbilityTrackingReport: React.FC<AbilityTrackingReportProps> = ({ onCreateQuiz }) => {
  const [period, setPeriod] = useState<'30d' | 'all'>('30d');
  const [classId, setClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [report, setReport] = useState<AbilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // 班級列表（GET /api/bots/classes）；失敗時隱藏切換，預設全部學生
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/bots/classes`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.classes) ? data.classes : [];
        setClasses(list.map((item: any) => ({ id: String(item.id), name: String(item.name) })));
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReport = () => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const classParam = classId ? `&classId=${encodeURIComponent(classId)}` : '';
    fetch(`${API_BASE}/api/teachers/me/ability-report?period=${period}${classParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const classLevels = Array.isArray(data?.classLevels) ? data.classLevels : [];
        const students = Array.isArray(data?.students) ? data.students : [];
        setReport({ period: data?.period === 'all' ? 'all' : '30d', generatedAt: data?.generatedAt, classLevels, students });
        setSelectedStudentId((prev) => prev || students[0]?.studentId || null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    const cancel = loadReport();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, classId]);

  const students = report?.students || [];
  const selectedStudent = students.find((student) => student.studentId === selectedStudentId) || students[0] || null;

  const radarData = selectedStudent
    ? BLOOM_LEVELS.map((level) => ({
        subject: uiText(level.label),
        A: Number(selectedStudent.recent?.[level.key] ?? 0),
        B: selectedStudent.past ? Number(selectedStudent.past[level.key] ?? 0) : undefined,
      }))
    : [];

  return (
    <div className="bg-white p-4 md:p-6 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col h-full border border-slate-100">
      {/* Header：時間切換只影響此卡 */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#1E293B] flex items-center shrink-0">
            <Target className="w-5 h-5 mr-2 text-indigo-500" />{uiText("Bloom 六層級視角")}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">{uiText("Bloom 六層級來自已發佈測驗之作答，追蹤班級與學生的能力層級。")}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="bg-slate-100 p-1 rounded-full flex items-center text-xs font-semibold w-full sm:w-auto">
            <button
              onClick={() => setPeriod('30d')}
              className={`w-1/2 sm:w-auto px-4 py-1.5 rounded-full transition-all ${period === '30d' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >{uiText("過去一個月")}</button>
            <button
              onClick={() => setPeriod('all')}
              className={`w-1/2 sm:w-auto px-4 py-1.5 rounded-full transition-all ${period === 'all' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >{uiText("全期")}</button>
          </div>
          <button
            onClick={() => downloadAbilityReportCsv(report)}
            disabled={!report || (!report.classLevels.length && !report.students.length)}
            className="w-full sm:w-auto px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 shadow-sm"
          >
            <Icons.download className="w-3 h-3" />{uiText("匯出 CSV")}
          </button>
        </div>
      </div>

      {/* 班級切換（多班老師才顯示；班名係用戶資料，唔經 uiText） */}
      {classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setClassId(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${classId === null ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            {uiText("全部學生")}
          </button>
          {classes.map((item) => (
            <button
              key={item.id}
              onClick={() => setClassId(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${classId === item.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex-1 min-h-[320px] flex items-center justify-center text-sm font-semibold text-slate-400">{uiText('正在同步能力追蹤資料…')}</div>
      ) : error ? (
        <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center gap-3">
          <p className="text-sm font-semibold text-slate-500">{uiText('暫時無法載入能力追蹤資料，請稍後再試。')}</p>
          <button onClick={() => loadReport()} className="px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-100 transition-colors">
            {uiText("重試")}
          </button>
        </div>
      ) : !students.length && !(report?.classLevels || []).length ? (
        report?.period === '30d' ? (
          <div className="flex-1 min-h-[320px] flex items-center justify-center text-sm font-semibold text-slate-400 px-6 text-center">
            {uiText('此時間範圍暫無測驗作答，請嘗試切換至「全期」。')}
          </div>
        ) : (
          <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-2xl">🎯</div>
            <p className="text-sm font-black text-slate-800">{uiText("暫無 Bloom 能力數據")}</p>
            <p className="max-w-sm text-sm leading-6 text-slate-500">{uiText("Bloom 六層級來自已發佈測驗的作答。發佈測驗並收集學生作答後，此處將自動顯示班級與學生的能力分析。")}</p>
            {onCreateQuiz && (
              <button
                onClick={onCreateQuiz}
                className="mt-1 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
              >
                {uiText("去智能評測建立測驗")}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <p className="text-xs text-slate-400">{uiText("對話互動分析將於日後加入")}</p>
          </div>
        )
      ) : (
        <div className="space-y-5">
          {/* 班級六層級聚合 */}
          <div>
            <h4 className="text-sm font-black text-slate-900 mb-3">{uiText("班級六層級聚合")}</h4>
            <div className="space-y-3">
              {(report?.classLevels || []).map((level) => {
                const bloom = BLOOM_LEVELS.find((item) => item.key === level.key);
                if (!bloom) return null;
                const lowSample = Number(level.answered) < 5;
                return (
                  <div key={level.key} className="flex items-center gap-3">
                    <div className="w-12 text-sm font-bold text-slate-700 text-right shrink-0">{uiText(bloom.label)}</div>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${level.value}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`h-full rounded-full ${bloom.color}`}
                      />
                    </div>
                    <div className="w-12 text-sm font-bold text-slate-500 shrink-0">{level.value}%</div>
                    <div className={`w-24 text-right text-xs font-semibold shrink-0 ${lowSample ? 'text-amber-500' : 'text-slate-400'}`}>
                      {lowSample ? uiText("樣本不足") : uiTemplate("已作答 {0} 題", Number(level.answered))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* 學生能力輪廓 */}
          <div>
            <h4 className="text-sm font-black text-slate-900 mb-3">{uiText("學生能力輪廓")}</h4>
            <div className="flex flex-col md:flex-row gap-5">
              <div className="w-full md:w-56 shrink-0 flex flex-col gap-2">
                {students.map((student) => (
                  <motion.button
                    key={student.studentId}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedStudentId(student.studentId)}
                    className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left border ${
                      selectedStudent?.studentId === student.studentId
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-slate-50 border-transparent hover:bg-slate-100 hover:border-indigo-100 hover:shadow-[0_10px_24px_rgba(79,70,229,0.10)]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      selectedStudent?.studentId === student.studentId ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {student.avatar}
                    </div>
                    <span className={`font-bold text-sm truncate transition-colors ${selectedStudent?.studentId === student.studentId ? 'text-indigo-700' : 'text-slate-700 group-hover:text-indigo-600'}`}>
                      {student.name}
                    </span>
                    {selectedStudent?.studentId === student.studentId && (
                      <ChevronRight className="w-4 h-4 text-indigo-500 ml-auto shrink-0" />
                    )}
                  </motion.button>
                ))}
              </div>

              <div className="flex-1 bg-slate-50 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[280px]">
                {selectedStudent ? (
                  <>
                    <h5 className="text-sm font-bold text-slate-700 mb-2">{selectedStudent.name}{uiText(" - 能力輪廓")}</h5>
                    <div className="flex items-center gap-4 mb-4 text-xs font-medium">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-indigo-500/80"></div>{report?.period === 'all' ? uiText("全期表現") : uiText("近期表現")}</div>
                      {report?.period !== 'all' && (
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-300/80"></div>{uiText("過往平均")}</div>
                      )}
                    </div>
                    <div className="w-full h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                          <Tooltip content={<BloomRadarTooltip />} />
                          <Radar name={report?.period === 'all' ? uiText("全期表現") : uiText("近期表現")} dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
                          {report?.period !== 'all' && (
                            <Radar name={uiText("過往平均")} dataKey="B" stroke="#cbd5e1" fill="#e2e8f0" fillOpacity={0.5} />
                          )}
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-400">{uiText('尚未累積足夠的學生互動資料；學生開始對話後，能力追蹤會自動更新。')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Bottom AI Insight */}
          <div className="w-full bg-purple-50 border border-purple-100 rounded-xl p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="text-xl">💡</div>
              <div>
                <p className="text-sm font-bold text-purple-900 mb-1">{uiText("AI 洞察")}</p>
                <p className="text-sm text-purple-700 leading-relaxed">{uiText("全班在「評價」與「創造」層級得分率均低於 40%，建議近期課堂增加開放討論環節。")}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
