import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Flag, ChevronUp, ChevronDown, CheckCircle2, XCircle, AlertTriangle, HeartPulse, MessageSquareWarning, ShieldAlert, HelpCircle, Archive } from 'lucide-react';
import { SubjectiveQuestionCard } from './SubjectiveQuestionCard';

interface GradingDetailViewProps {
  onBack: () => void;
}

const mockStudents = [
  { id: 1, name: '陳小明', status: 'pendingConfirm', anomalyType: 'wellbeing', time: '10-25 14:30' },
  { id: 2, name: '林美玲', status: 'pendingConfirm', anomalyType: 'academic', time: '10-25 14:35' },
  { id: 3, name: '張建國', status: 'pendingConfirm', anomalyType: 'inappropriate', time: '10-25 14:40' },
  { id: 4, name: '李家豪', status: 'pendingConfirm', anomalyType: 'privacy', time: '10-25 14:20' },
  { id: 5, name: '王大文', status: 'pendingConfirm', anomalyType: 'effort', time: '10-25 14:15' },
  { id: 6, name: '趙宇軒', status: 'pendingGrading', anomalyType: undefined, time: '10-25 14:10' },
  { id: 7, name: '黃心穎', status: 'completed', anomalyType: undefined, time: '10-25 14:05' },
  { id: 8, name: '吳浩然', status: 'completed', anomalyType: undefined, time: '10-25 14:00' },
];

const anomalyConfig: Record<string, any> = {
  wellbeing: {
    theme: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', borderLeft: 'border-l-rose-500', flag: 'text-rose-500' },
    icon: HeartPulse,
    title: '🚨 關懷提示',
    message: '系統留意到作答中包含較為負面或不安的情緒描寫，建議進一步關注學生的身心狀況。'
  },
  academic: {
    theme: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', borderLeft: 'border-l-amber-500', flag: 'text-amber-500' },
    icon: AlertTriangle,
    title: '⚠️ 學術提示',
    message: '此份作答的語言特徵異常，可能包含非原創或 AI 生成內容，建議核實。'
  },
  inappropriate: {
    theme: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', borderLeft: 'border-l-orange-500', flag: 'text-orange-500' },
    icon: MessageSquareWarning,
    title: '⚠️ 內容提示',
    message: '作答中疑似包含攻擊性或不適宜的詞彙，請檢視內容並酌情引導。'
  },
  privacy: {
    theme: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', borderLeft: 'border-l-blue-500', flag: 'text-blue-500' },
    icon: ShieldAlert,
    title: '🛡️ 私隱提示',
    message: '作答中疑似包含敏感的個人或家庭私隱資訊，請妥善保護數據。'
  },
  effort: {
    theme: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', borderLeft: 'border-l-slate-500', flag: 'text-slate-500' },
    icon: HelpCircle,
    title: '💡 狀態提示',
    message: '作答內容與題目嚴重偏離或出現無意義字元，可能反映學生遇到學習困難。'
  }
};

const getAnswersForStudent = (anomalyType: string | undefined): any[] => {
  const baseAnswers = [
    {
      id: 1,
      type: 'objective',
      question: '《桃花源記》的作者是誰？',
      studentAnswer: 'B. 陶淵明',
      correctAnswer: 'B. 陶淵明',
      isCorrect: true,
      score: 2,
      maxScore: 2,
    },
    {
      id: 2,
      type: 'objective',
      question: '下列哪一個成語最適合用來形容桃花源的環境？',
      studentAnswer: 'A. 豁然開朗',
      correctAnswer: 'B. 世外桃源',
      isCorrect: false,
      score: 0,
      maxScore: 2,
    }
  ];

  let subjectiveAnswer = {
    id: 3,
    type: 'subjective',
    question: '你認為桃花源是一個理想的社會嗎？請結合文本說明你的觀點。',
    studentAnswer: '我覺得是一個理想的社會，因為裡面的人都很開心，沒有戰爭。文本裡面說「黃髮垂髫，並怡然自樂」，代表老人和小孩都過得很好。',
    aiDraft: {
      score: 4,
      maxScore: 5,
      comment: '觀點明確，能準確引用文本「黃髮垂髫，並怡然自樂」來支持論點。若能進一步對比當時的社會背景（如戰亂），論述會更完整。',
      reasoning: '學生理解文本核心意涵，並能正確引用原文。但缺乏深度的背景對比分析，故給予 4 分。'
    }
  };

  if (anomalyType === 'wellbeing') {
    subjectiveAnswer.studentAnswer = '最近覺得壓力很大，活著好像沒什麼意義，根本不想寫作業...桃花源大概就是死後的世界吧。';
    subjectiveAnswer.aiDraft = {
      score: 0, maxScore: 5,
      comment: '作答內容未能針對題目進行有效論述，請老師進一步了解學生的學習狀況或給予適當引導。',
      reasoning: '根據系統偵測，此作答觸發了「身心安全」的異常警示，因此暫不給予常規評分，建議由教師人工介入處理。'
    };
  } else if (anomalyType === 'academic') {
    subjectiveAnswer.studentAnswer = 'In conclusion, the social structure of Peach Blossom Spring represents an idealized utopian society, characterized by egalitarianism and harmony with nature. 總之這是一個理想社會。';
    subjectiveAnswer.aiDraft = {
      score: 0, maxScore: 5,
      comment: '作答內容未能針對題目進行有效論述，請老師進一步了解學生的學習狀況或給予適當引導。',
      reasoning: '根據系統偵測，此作答觸發了「非原創/AI」的異常警示，因此暫不給予常規評分，建議由教師人工介入處理。'
    };
  } else if (anomalyType === 'inappropriate') {
    subjectiveAnswer.studentAnswer = '這題目真的有夠蠢，不想寫，出題的老師腦袋有洞吧。桃花源就是個騙局。';
    subjectiveAnswer.aiDraft = {
      score: 0, maxScore: 5,
      comment: '作答內容未能針對題目進行有效論述，請老師進一步了解學生的學習狀況或給予適當引導。',
      reasoning: '根據系統偵測，此作答觸發了「不當言論」的異常警示，因此暫不給予常規評分，建議由教師人工介入處理。'
    };
  } else if (anomalyType === 'privacy') {
    subjectiveAnswer.studentAnswer = '我家附近也有一個公園有很漂亮的風景，我們家住在九龍旺角彌敦道123號……';
    subjectiveAnswer.aiDraft = {
      score: 0, maxScore: 5,
      comment: '作答內容未能針對題目進行有效論述，請老師進一步了解學生的學習狀況或給予適當引導。',
      reasoning: '根據系統偵測，此作答觸發了「私隱洩漏」的異常警示，因此暫不給予常規評分，建議由教師人工介入處理。'
    };
  } else if (anomalyType === 'effort') {
    subjectiveAnswer.studentAnswer = 'asdfasdfasdf 不知道 不知道 不知道';
    subjectiveAnswer.aiDraft = {
      score: 0, maxScore: 5,
      comment: '作答內容未能針對題目進行有效論述，請老師進一步了解學生的學習狀況或給予適當引導。',
      reasoning: '根據系統偵測，此作答觸發了「敷衍/偏題」的異常警示，因此暫不給予常規評分，建議由教師人工介入處理。'
    };
  }

  return [...baseAnswers, subjectiveAnswer];
};

export const GradingDetailView: React.FC<GradingDetailViewProps> = ({ onBack }) => {
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0);
  const [editedScores, setEditedScores] = useState<Record<string, number>>({});
  const [isPublished, setIsPublished] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  
  const currentStudent = mockStudents[currentStudentIdx];
  const currentAnswers = getAnswersForStudent(currentStudent.anomalyType);

  const handlePrev = () => {
    if (currentStudentIdx > 0) setCurrentStudentIdx(prev => prev - 1);
  };

  const handleNext = () => {
    if (currentStudentIdx < mockStudents.length - 1) setCurrentStudentIdx(prev => prev + 1);
  };

  const handleScoreChange = (questionId: number, newScore: number) => {
    setEditedScores(prev => ({
      ...prev,
      [`${currentStudent.id}-${questionId}`]: newScore
    }));
  };

  const completedCount = mockStudents.filter(s => s.status === 'completed').length;
  const totalCount = mockStudents.length;
  const progressPercent = (completedCount / totalCount) * 100;

  const activeAnomaly = currentStudent.anomalyType ? anomalyConfig[currentStudent.anomalyType] : null;
  const AnomalyIcon = activeAnomaly ? activeAnomaly.icon : null;

  // Calculate dynamic total score
  const totalScore = currentAnswers.reduce((acc, ans) => {
    if (ans.type === 'objective') return acc + ans.score;
    const key = `${currentStudent.id}-${ans.id}`;
    return acc + (editedScores[key] !== undefined ? editedScores[key] : (ans.aiDraft?.score || 0));
  }, 0);

  const maxTotalScore = currentAnswers.reduce((acc, ans) => acc + ans.maxScore, 0);

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex overflow-hidden">
      {/* Left Column: Student List */}
      <div className="w-[280px] bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm z-10">
        {/* Top: Quiz Title & Back */}
        <div className="p-4 border-b border-slate-100">
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 mb-3 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />
            返回工作台
          </button>
          <h2 className="font-bold text-slate-800 leading-tight">中三古文練習 - 桃花源記</h2>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {mockStudents.map((student, idx) => {
            const isActive = idx === currentStudentIdx;
            let statusColor = '';
            let statusText = '';
            if (student.status === 'pendingConfirm') {
              statusColor = isActive ? 'bg-purple-100 text-purple-700' : 'text-purple-600';
              statusText = '待確認';
            } else if (student.status === 'pendingGrading') {
              statusColor = isActive ? 'bg-slate-200 text-slate-700' : 'text-slate-500';
              statusText = '待批改';
            } else {
              statusColor = isActive ? 'bg-emerald-100 text-emerald-700' : 'text-emerald-600';
              statusText = '已完成';
            }

            const flagColor = student.anomalyType ? anomalyConfig[student.anomalyType].theme.flag : '';

            return (
              <div 
                key={student.id}
                onClick={() => setCurrentStudentIdx(idx)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                  isActive ? 'bg-indigo-50 border border-indigo-100 shadow-sm' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    student.status === 'pendingConfirm' ? 'bg-purple-500' :
                    student.status === 'pendingGrading' ? 'bg-slate-400' : 'bg-emerald-500'
                  }`} />
                  <span className={`font-bold ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{student.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    student.status === 'pendingConfirm' ? 'bg-purple-100 text-purple-700' :
                    student.status === 'pendingGrading' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {statusText}
                  </span>
                  {student.anomalyType && (
                    <Flag className={`w-3.5 h-3.5 ${flagColor}`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom: Progress */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
            <span>批改進度</span>
            <span>{completedCount} / {totalCount} 人</span>
          </div>
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* Right Column: Main Grading Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC]">
        <AnimatePresence mode="wait">
          {!isPublished ? (
            <motion.div 
              key="grading"
              className="flex-1 flex flex-col min-h-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Top Nav */}
              <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-slate-800">{currentStudent.name}</h2>
                  <span className="text-sm text-slate-400">提交於 {currentStudent.time}</span>
                  <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 pl-3 pr-4 py-1.5 rounded-full shadow-sm ml-2">
                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">總分</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-indigo-700 leading-none">{totalScore}</span>
                      <span className="text-sm font-bold text-indigo-400">/ {maxTotalScore}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <button 
                      onClick={handlePrev}
                      disabled={currentStudentIdx === 0}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp className="w-5 h-5" />
                    </button>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm">
                      上一位
                    </div>
                  </div>
                  <div className="relative group">
                    <button 
                      onClick={handleNext}
                      disabled={currentStudentIdx === mockStudents.length - 1}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm">
                      下一位
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8">
                <div className="max-w-4xl mx-auto space-y-6">
                  
                  {/* Anomaly Banner */}
                  {activeAnomaly && AnomalyIcon && (
                    <motion.div 
                      key={currentStudent.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl p-4 flex items-start gap-3 shadow-sm border-l-4 ${activeAnomaly.theme.bg} ${activeAnomaly.theme.border} ${activeAnomaly.theme.borderLeft}`}
                    >
                      <AnomalyIcon className={`w-5 h-5 shrink-0 mt-0.5 ${activeAnomaly.theme.text}`} />
                      <div>
                        <h3 className={`text-sm font-bold ${activeAnomaly.theme.text}`}>{activeAnomaly.title}</h3>
                        <p className={`text-sm mt-1 opacity-90 ${activeAnomaly.theme.text}`}>{activeAnomaly.message}</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Questions */}
                  {currentAnswers.map((ans, index) => {
                    const subjectiveKey = `${currentStudent.id}-${ans.id}`;
                    const currentSubjectiveScore = editedScores[subjectiveKey] !== undefined 
                      ? editedScores[subjectiveKey] 
                      : (ans.aiDraft?.score || 0);

                    return (
                      <div key={ans.id} className="bg-white rounded-[24px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] border border-slate-100">
                        <div className="flex gap-4">
                          <span className="text-lg font-bold text-slate-400 shrink-0">{index + 1}.</span>
                          <div className="flex-1">
                            <p className="text-lg font-medium text-slate-800 mb-4">{ans.question}</p>
                            
                            {ans.type === 'objective' ? (
                              // Objective Question
                              <div className={`p-4 rounded-xl flex items-center justify-between border ${
                                ans.isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
                              }`}>
                                <div className="flex items-center gap-3">
                                  {ans.isCorrect ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-red-500" />
                                  )}
                                  <div>
                                    <p className={`text-sm font-bold ${ans.isCorrect ? 'text-emerald-800' : 'text-red-800'}`}>
                                      學生作答：{ans.studentAnswer}
                                    </p>
                                    {!ans.isCorrect && (
                                      <p className="text-sm text-red-600 mt-1">正確答案：{ans.correctAnswer}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className={`text-xl font-bold ${ans.isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {ans.score}
                                  </span>
                                  <span className="text-sm text-slate-400"> / {ans.maxScore} 分</span>
                                </div>
                              </div>
                            ) : (
                              <SubjectiveQuestionCard 
                                key={`${currentStudent.id}-${ans.id}`}
                                index={index + 1}
                                question={ans.question}
                                studentAnswer={ans.studentAnswer}
                                aiDraft={ans.aiDraft!}
                                currentScore={currentSubjectiveScore}
                                onScoreChange={(newScore) => handleScoreChange(ans.id, newScore)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Bottom Spacing */}
                  <div className="h-8"></div>
                </div>
              </div>

              {/* Bottom Batch Publish Bar */}
              <div className="bg-white border-t border-slate-200 p-4 shrink-0 flex items-center justify-between shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.02)] z-10">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  已批改 {completedCount} / {totalCount} 份
                </div>
                <div className="flex items-center gap-3">
                  <button className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">
                    儲存草稿
                  </button>
                  <button 
                    onClick={() => setIsPublished(true)}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm transition-colors flex items-center gap-2"
                  >
                    批量發佈成績
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="summary"
              className="flex-1 flex items-center justify-center p-6"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="bg-white rounded-[24px] p-8 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] max-w-2xl w-full border border-slate-100">
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800">成績已成功發佈與推送！</h2>
                  <p className="text-slate-500 mt-2">系統已將成績與評語發送至學生端。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-center">
                    <span className="text-sm font-bold text-slate-500 block mb-1">本次平均分</span>
                    <div className="text-3xl font-black text-slate-800">78.5<span className="text-base font-bold text-slate-400 ml-1">分</span></div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-center">
                    <span className="text-sm font-bold text-slate-500 block mb-1">主觀題得分率</span>
                    <div className="text-3xl font-black text-slate-800">65<span className="text-base font-bold text-slate-400 ml-1">%</span></div>
                  </div>
                  <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100 text-center relative overflow-hidden">
                    <span className="text-sm font-bold text-indigo-600 block mb-1">AI 分數偏差</span>
                    <div className="text-3xl font-black text-indigo-700">±0.8<span className="text-base font-bold text-indigo-400 ml-1">分</span></div>
                    <p className="text-[10px] text-indigo-500 mt-2 font-medium">模型已記錄您的修改</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4 pt-6 border-t border-slate-100">
                  <button 
                    onClick={onBack} 
                    className="px-6 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    前往指揮艙查看報告
                  </button>
                  <button 
                    onClick={() => setIsArchived(true)}
                    disabled={isArchived}
                    className={`px-6 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 ${
                      isArchived 
                        ? 'bg-emerald-100 text-emerald-700 cursor-default' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md'
                    }`}
                  >
                    {isArchived ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        已歸檔
                      </>
                    ) : (
                      <>
                        <Archive className="w-5 h-5" />
                        歸檔到歷史題庫
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
