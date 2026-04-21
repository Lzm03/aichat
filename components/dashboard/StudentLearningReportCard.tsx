import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Target, ArrowLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

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

const radarData = [
  { subject: '記憶', A: 90, fullMark: 100 },
  { subject: '理解', A: 85, fullMark: 100 },
  { subject: '應用', A: 80, fullMark: 100 },
  { subject: '分析', A: 30, fullMark: 100 },
  { subject: '評價', A: 40, fullMark: 100 },
  { subject: '創造', A: 50, fullMark: 100 },
];

export const StudentLearningReportCard = () => {
  const [viewLevel, setViewLevel] = useState<'overview' | 'class' | 'student'>('overview');
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [selectedBloom, setSelectedBloom] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(studentData[0]);

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
    </motion.div>
  );
};
