import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Target, ArrowLeft, ChevronRight, AlertCircle, BookOpen, CheckCircle2, Sparkles, X } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { readAuthSession } from '../../utils/auth';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

// Mock Data
const classList = [
  { id: 'c1', name: '中三甲', lastDate: '2023-10-25', avgScore: 78.5, weakness: '分析' },
  { id: 'c2', name: '中三乙', lastDate: '2023-10-22', avgScore: 72.0, weakness: '評價' },
  { id: 'c3', name: '中四理', lastDate: '2023-10-20', avgScore: 81.5, weakness: '創造' },
];

const bloomData = [
  { level: '記憶', score: 85, color: '#3b82f6' },
  { level: '理解', score: 78, color: '#10b981' },
  { level: '應用', score: 72, color: '#f59e0b' },
  { level: '分析', score: 45, color: '#f97316' },
  { level: '評價', score: 38, color: '#f43f5e' },
  { level: '創造', score: 35, color: '#a855f7' },
];

const studentData = [
  { id: 's1', name: '李逸朗', scoreRate: 30, diff: -15, avatar: '李' },
  { id: 's2', name: '黃俊傑', scoreRate: 35, diff: -10, avatar: '黃' },
  { id: 's3', name: '陳小明', scoreRate: 42, diff: -3, avatar: '陳' },
  { id: 's4', name: '林美玲', scoreRate: 55, diff: 10, avatar: '林' },
];

const classAssessmentRows = [
  { id: '03', name: '學生 03', mastery: 92, output: 'L3', outputText: '深入連結', interaction: 'Y3 深入探索', rounds: 8, mode: '主動輸入', status: 'knowledge', statusText: '知識溢出' },
  { id: '04', name: '學生 04', mastery: 92, output: 'L3', outputText: '深入連結', interaction: 'Y3 深入探索', rounds: 8, mode: '主動輸入', status: 'knowledge', statusText: '知識溢出' },
  { id: '13', name: '學生 13', mastery: 92, output: 'L3', outputText: '深入連結', interaction: 'Y3 深入探索', rounds: 8, mode: '主動輸入', status: 'knowledge', statusText: '知識溢出' },
  { id: '14', name: '學生 14', mastery: 92, output: 'L3', outputText: '深入連結', interaction: 'Y3 深入探索', rounds: 8, mode: '主動輸入', status: 'knowledge', statusText: '知識溢出' },
  { id: '23', name: '學生 23', mastery: 91, output: 'L3', outputText: '深入連結', interaction: 'Y3 深入探索', rounds: 8, mode: '主動輸入', status: 'normal', statusText: '正常探索' },
  { id: '08', name: '學生 08', mastery: 74, output: 'L2', outputText: '正確回憶', interaction: 'Y2 持續互動', rounds: 5, mode: '引導回答', status: 'warning', statusText: '卡關預警' },
  { id: '17', name: '學生 17', mastery: 68, output: 'L1', outputText: '簡短回應', interaction: 'Y1 初步參與', rounds: 3, mode: '被動回覆', status: 'warning', statusText: '卡關預警' },
];

const knowledgeTracking = [
  { level: 'L1 基礎事實', state: '已掌握', note: '學生能正確回答', detail: '出生地、求學經歷、行醫經歷', tone: 'green' },
  { level: 'L2 理解關聯', state: '已掌握', note: '學生能正確回答', detail: '棄醫從革原因、上書李鴻章、建立興中會', tone: 'green' },
  { level: 'L3 深度遷移', state: '深度理解', note: '已建立知識網絡，形成關聯', detail: '三民主義內涵、革命對後世影響', tone: 'blue' },
];

const radarData = [
  { subject: '記憶', A: 90, fullMark: 100 },
  { subject: '理解', A: 85, fullMark: 100 },
  { subject: '應用', A: 80, fullMark: 100 },
  { subject: '分析', A: 30, fullMark: 100 },
  { subject: '評價', A: 40, fullMark: 100 },
  { subject: '創造', A: 50, fullMark: 100 },
];

export const StudentLearningReportCard = () => {
  const canViewClassAssessmentDetail =
    readAuthSession()?.user?.email?.trim().toLowerCase() === 'lzm200303@gmail.com';
  const [viewLevel, setViewLevel] = useState<'overview' | 'class' | 'student'>('overview');
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [selectedBloom, setSelectedBloom] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(studentData[0]);
  const [isClassDetailOpen, setIsClassDetailOpen] = useState(false);
  const [detailFilter, setDetailFilter] = useState<'all' | 'warning' | 'knowledge' | 'normal'>('all');
  const [selectedDetailStudent, setSelectedDetailStudent] = useState<any | null>(null);
  useBodyScrollLock(isClassDetailOpen);

  const handleClassClick = (cls: any) => {
    setSelectedClass(cls);
    setViewLevel('class');
  };

  const handleBloomClick = (data: any) => {
    setSelectedBloom(data.level);
    setViewLevel('student');
  };

  const handleBackToOverview = () => {
    setViewLevel('overview');
    setSelectedClass(null);
  };

  const handleBackToClass = () => {
    setViewLevel('class');
    setSelectedBloom(null);
  };

  const filteredAssessmentRows = classAssessmentRows.filter((row) => detailFilter === 'all' || row.status === detailFilter);

  const openClassDetail = () => {
    if (!canViewClassAssessmentDetail) return;
    setSelectedDetailStudent(null);
    setIsClassDetailOpen(true);
  };

  return (
    <motion.div 
      layout
      className="bg-white p-4 md:p-6 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col border border-slate-100 overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {viewLevel === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-[#1E293B] flex items-center shrink-0">
                <Target className="w-5 h-5 mr-2 text-indigo-500" />
                能力追蹤報告
              </h3>
            </div>
            <div className="space-y-3 flex-1">
              {classList.map(cls => (
                <div key={cls.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                      {cls.name.substring(0, 2)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{cls.name}</h4>
                      <p className="text-xs text-slate-500 mt-1">上次測驗: {cls.lastDate} · 平均 {cls.avgScore} 分</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-600 text-xs font-bold">
                      <AlertCircle className="w-3 h-3" />
                      薄弱點: {cls.weakness}
                    </span>
                    <button 
                      onClick={() => handleClassClick(cls)}
                      className="flex items-center gap-1 text-sm font-bold text-slate-400 group-hover:text-indigo-600 transition-colors"
                    >
                      查看 <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {canViewClassAssessmentDetail && (
              <button
                type="button"
                onClick={openClassDetail}
                className="mt-4 w-full rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900">全班評估明細表</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">深度檢視學生知識點交互狀態與品質</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-indigo-400" />
                </div>
              </button>
            )}
          </motion.div>
        )}

        {viewLevel === 'class' && (
          <motion.div
            key="class"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <button 
                onClick={handleBackToOverview}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                返回所有班級
              </button>
              <div className="flex items-center gap-2">
                <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium">
                  <option>最近一次測驗</option>
                  <option>過去一個月</option>
                </select>
                <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium">
                  <option>對比歷史平均</option>
                  <option>對比年級平均</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-bold text-slate-800 text-lg">{selectedClass?.name} - 認知層級得分率</h4>
              <p className="text-sm text-slate-500">點擊雷達圖外圍標籤查看該層級的學生名單</p>
            </div>

            <div className="flex-1 min-h-[300px] w-full mb-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={bloomData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis 
                    dataKey="level" 
                    tick={(props) => {
                      const { payload, x, y, textAnchor, stroke } = props;
                      return (
                        <g className="cursor-pointer hover:opacity-70 transition-opacity" onClick={() => handleBloomClick({ level: payload.value })}>
                          <text stroke={stroke} x={x} y={y} className="fill-slate-700 text-sm font-bold" textAnchor={textAnchor}>{payload.value}</text>
                        </g>
                      );
                    }} 
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar 
                    name="得分率" 
                    dataKey="score" 
                    stroke="#6366f1" 
                    fill="#818cf8" 
                    fillOpacity={0.6} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: '#4f46e5', fontWeight: 'bold' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <button 
              onClick={() => alert('喚醒 AI 助教：為您深入分析「評價」與「創造」層級的教學策略...')}
              className="mt-auto w-full bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-xl p-4 text-left transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="text-xl">💡</div>
                <div>
                  <p className="text-sm font-bold text-purple-900 mb-1">AI 洞察</p>
                  <p className="text-sm text-purple-700 leading-relaxed">
                    全班在「評價」與「創造」層級得分率均低於 40%，建議近期課堂增加開放討論環節。
                  </p>
                </div>
              </div>
            </button>
          </motion.div>
        )}

        {viewLevel === 'student' && (
          <motion.div
            key="student"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex items-center mb-6">
              <button 
                onClick={handleBackToClass}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                返回班級視圖
              </button>
              <div className="ml-auto">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold">
                  層級：{selectedBloom}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
              {/* Left Column: Student List */}
              <div className="md:col-span-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 max-h-[400px]">
                <h4 className="text-sm font-bold text-slate-500 mb-2 px-1">需關注學生 (由低至高)</h4>
                {studentData.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                      selectedStudent?.id === student.id 
                        ? 'bg-indigo-50 border border-indigo-200 shadow-sm' 
                        : 'bg-slate-50 border border-transparent hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      selectedStudent?.id === student.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {student.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm truncate ${selectedStudent?.id === student.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {student.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-medium text-slate-500">得分率 {student.scoreRate}%</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${student.diff < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {student.diff > 0 ? '+' : ''}{student.diff}%
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Right Column: Radar Chart & Insight */}
              <div className="md:col-span-2 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-2xl p-4 flex flex-col items-center justify-center flex-1 min-h-[250px] border border-slate-100">
                  <h4 className="text-sm font-bold text-slate-700 mb-2">{selectedStudent?.name} - 能力輪廓</h4>
                  <div className="w-full h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="近期表現" dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-800 mb-1">個人學習分析</p>
                      <p className="text-sm text-amber-700 leading-relaxed">
                        該學生在「{selectedBloom}」與「評價」層級均低於班級平均 20%，建議在課後指派針對性的基礎概念鞏固練習。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canViewClassAssessmentDetail && isClassDetailOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            className="fixed inset-0 z-[120] bg-slate-950/35 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="absolute inset-3 overflow-hidden rounded-[28px] bg-white shadow-2xl md:inset-6"
            >
              <div className="relative h-full">
                <div className={`h-full min-w-0 overflow-y-auto transition duration-300 ${
                  selectedDetailStudent ? 'pointer-events-none blur-[0.5px] brightness-95' : ''
                }`}>
                  <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-black tracking-tight text-slate-900">全班評估明細表</h2>
                        <p className="mt-1 text-sm font-medium text-slate-500">深度檢視學生的知識點交互狀態與品質</p>
                      </div>
                      {!selectedDetailStudent && (
                        <button
                          type="button"
                          onClick={() => setIsClassDetailOpen(false)}
                          className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6 px-6 py-6">
                    <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-5 lg:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                          <Sparkles className="h-4 w-4 text-indigo-500" />
                          輸出品質評級說明
                        </div>
                        <p className="mt-2 text-sm text-slate-500">依學生回答的完整度、關聯性與思考深度綜合評估。</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {['L0: 偏離主題', 'L1: 簡短回應', 'L2: 正確回憶', 'L3: 深入連結'].map((item) => (
                            <span key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{item}</span>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                        <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          互動深度說明
                        </div>
                        <p className="mt-2 text-sm text-slate-500">反映學生在本次學習中主動探索與持續參與的程度。</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {['Y1: 初步參與', 'Y2: 持續互動', 'Y3: 深入探索', 'Y4: 高度投入'].map((item) => (
                            <span key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {[
                        { key: 'all', label: '全部學生 (30)' },
                        { key: 'warning', label: '🚨 卡關預警 (3)' },
                        { key: 'knowledge', label: '✨ 知識溢出 (6)' },
                        { key: 'normal', label: '✅ 正常探索 (21)' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setDetailFilter(item.key as any)}
                          className={`rounded-xl border px-5 py-3 text-sm font-black transition ${
                            detailFilter === item.key
                              ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                      <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1.1fr_1fr_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm font-black text-slate-500">
                        <span>學生</span>
                        <span>總掌握度 ▼</span>
                        <span>輸出品質</span>
                        <span>互動深度</span>
                        <span>參與模式</span>
                        <span>狀態</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {filteredAssessmentRows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelectedDetailStudent(row)}
                            className="grid w-full grid-cols-[1.2fr_0.8fr_1fr_1.1fr_1fr_1fr] items-center gap-4 px-5 py-5 text-left transition hover:bg-indigo-50/40"
                          >
                            <span className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-sm font-black text-indigo-600">{row.id}</span>
                              <span className="font-black text-slate-800">{row.name}</span>
                            </span>
                            <span className="text-lg font-black text-slate-800">{row.mastery}%</span>
                            <span className="font-bold text-slate-700"><b className="mr-2 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{row.output}</b>{row.outputText}</span>
                            <span className="font-bold text-slate-700">{row.interaction}<br /><small className="font-semibold text-slate-400">({row.rounds}輪)</small></span>
                            <span className="w-fit rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700">{row.mode}</span>
                            <span className={`font-black ${row.status === 'warning' ? 'text-rose-600' : row.status === 'knowledge' ? 'text-emerald-600' : 'text-slate-500'}`}>{row.statusText}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {selectedDetailStudent && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-10 bg-slate-900/8"
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {selectedDetailStudent && (
                    <motion.aside
                      initial={{ x: 460, opacity: 0.9 }}
                      animate={{ x: 0 }}
                      exit={{ x: 460, opacity: 0.9 }}
                      transition={{ type: "spring", stiffness: 260, damping: 30 }}
                      className="absolute inset-y-0 right-0 z-20 w-full overflow-y-auto border-l border-slate-100 bg-white shadow-[-18px_0_40px_rgba(15,23,42,0.18)] md:w-[460px]"
                    >
                      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-6">
                        <div>
                          <h3 className="text-xl font-black text-slate-900">{selectedDetailStudent.name} — 知識掌握追蹤</h3>
                          <p className="mt-1 text-sm font-bold text-slate-500">總掌握度 {selectedDetailStudent.mastery}%</p>
                        </div>
                        <button type="button" onClick={() => setSelectedDetailStudent(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="space-y-5 p-6">
                        {knowledgeTracking.map((item) => (
                          <div key={item.level} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                            <h4 className="font-black text-slate-900">【{item.level}】</h4>
                            <div className="mt-4 flex items-start gap-3">
                              <span className={`mt-1 h-3 w-3 rounded-full ${item.tone === 'green' ? 'bg-emerald-400' : 'bg-indigo-500'} shadow-[0_0_0_4px_rgba(99,102,241,0.08)]`} />
                              <div>
                                <p className="font-black text-slate-800">{item.state} <span className="text-sm font-medium text-slate-400">({item.note})</span></p>
                                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{item.detail}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
