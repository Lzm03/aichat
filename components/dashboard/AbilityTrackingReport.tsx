import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { ChevronRight, Target, Users, User } from 'lucide-react';

const bloomData = [
  { level: '記憶', score: 85, color: 'bg-blue-500' },
  { level: '理解', score: 78, color: 'bg-emerald-500' },
  { level: '應用', score: 72, color: 'bg-amber-500' },
  { level: '分析', score: 65, color: 'bg-orange-500' },
  { level: '評價', score: 38, color: 'bg-rose-500' },
  { level: '創造', score: 35, color: 'bg-purple-500' },
];

const studentList = [
  { id: 1, name: '李逸朗', avatar: '李' },
  { id: 2, name: '黃俊傑', avatar: '黃' },
  { id: 3, name: '陳小明', avatar: '陳' },
  { id: 4, name: '林美玲', avatar: '林' },
];

const radarData = [
  { subject: '記憶', A: 90, B: 80, fullMark: 100 },
  { subject: '理解', A: 85, B: 75, fullMark: 100 },
  { subject: '應用', A: 80, B: 70, fullMark: 100 },
  { subject: '分析', A: 75, B: 60, fullMark: 100 },
  { subject: '評價', A: 60, B: 40, fullMark: 100 },
  { subject: '創造', A: 50, B: 30, fullMark: 100 },
];

export const AbilityTrackingReport = () => {
  const [timePeriod, setTimePeriod] = useState<'7d' | '30d'>('7d');
  const [viewMode, setViewMode] = useState<'class' | 'student'>('class');
  const [selectedStudent, setSelectedStudent] = useState(studentList[0]);

  const handleInsightClick = () => {
    alert('喚醒 AI 助教：為您深入分析「評價」與「創造」層級的教學策略...');
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col h-full border border-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h3 className="text-lg font-bold text-[#1E293B] flex items-center shrink-0">
          <Target className="w-5 h-5 mr-2 text-indigo-500" />
          能力追蹤報告
        </h3>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="bg-slate-100 p-1 rounded-full flex items-center text-xs font-semibold w-full sm:w-auto">
            <button 
              onClick={() => setTimePeriod('7d')} 
              className={`w-1/2 sm:w-auto px-4 py-1.5 rounded-full transition-all ${timePeriod === '7d' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              過去 7 日
            </button>
            <button 
              onClick={() => setTimePeriod('30d')} 
              className={`w-1/2 sm:w-auto px-4 py-1.5 rounded-full transition-all ${timePeriod === '30d' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              過去一個月
            </button>
          </div>
          <button className="w-full sm:w-auto px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1 shadow-sm">
            <Icons.download className="w-3 h-3" />
            一鍵生成詳細報告
          </button>
        </div>
      </div>

      {/* Segmented Control */}
      <div className="flex p-1 bg-slate-100 rounded-xl mb-6 w-full max-w-xs mx-auto md:mx-0">
        <button
          onClick={() => setViewMode('class')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${
            viewMode === 'class' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          班級視圖
        </button>
        <button
          onClick={() => setViewMode('student')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${
            viewMode === 'student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <User className="w-4 h-4" />
          學生視圖
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-[300px] mb-6">
        <AnimatePresence mode="wait">
          {viewMode === 'class' ? (
            <motion.div
              key="class-view"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4">
                {bloomData.map((item) => (
                  <div key={item.level} className="flex items-center gap-4">
                    <div className="w-12 text-sm font-bold text-slate-700 text-right shrink-0">{item.level}</div>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.score}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className={`h-full rounded-full ${item.color}`}
                      />
                    </div>
                    <div className="w-12 text-sm font-bold text-slate-500 shrink-0">{item.score}%</div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="student-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col md:flex-row gap-6 h-full"
            >
              {/* Student List */}
              <div className="w-full md:w-1/3 flex flex-col gap-2">
                {studentList.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                      selectedStudent.id === student.id 
                        ? 'bg-indigo-50 border border-indigo-200' 
                        : 'bg-slate-50 border border-transparent hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedStudent.id === student.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {student.avatar}
                    </div>
                    <span className={`font-bold text-sm ${selectedStudent.id === student.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {student.name}
                    </span>
                    {selectedStudent.id === student.id && (
                      <ChevronRight className="w-4 h-4 text-indigo-500 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
              
              {/* Radar Chart */}
              <div className="flex-1 bg-slate-50 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[250px]">
                <h4 className="text-sm font-bold text-slate-700 mb-2">{selectedStudent.name} - 能力輪廓</h4>
                <div className="flex items-center gap-4 mb-4 text-xs font-medium">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-indigo-500/80"></div>近期表現</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-300/80"></div>過往平均</div>
                </div>
                <div className="w-full h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="近期表現" dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
                      <Radar name="過往平均" dataKey="B" stroke="#cbd5e1" fill="#e2e8f0" fillOpacity={0.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom AI Insight */}
      <button 
        onClick={handleInsightClick}
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
    </div>
  );
};
