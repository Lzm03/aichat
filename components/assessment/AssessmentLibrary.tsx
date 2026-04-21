import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Search, Filter, BookOpen, Download, Share2, X, ChevronRight, ChevronDown, PlusCircle, CheckCircle2 } from 'lucide-react';

interface AssessmentLibraryProps {
  onBack: () => void;
}

const mockLibraryData = [
  {
    id: 1,
    title: '中三古文練習 - 桃花源記',
    subject: '中文',
    grade: 'S3',
    date: '2023-10-25',
    questionCount: 5,
    status: '已發佈',
    usageHistory: [
      { date: '2023-10-25', class: 'S3A', avgScore: '82/100', correctRate: '78%' },
      { date: '2023-10-26', class: 'S3B', avgScore: '75/100', correctRate: '65%' }
    ],
    questions: [
      {
        id: 1,
        type: '多項選擇題',
        cognitiveLevel: '記憶',
        levelColor: 'bg-blue-100 text-blue-700',
        content: '《桃花源記》的作者是誰？',
        options: ['A. 李白', 'B. 陶淵明', 'C. 杜甫', 'D. 蘇軾'],
        answer: 'B. 陶淵明'
      },
      {
        id: 2,
        type: '簡答題',
        cognitiveLevel: '理解',
        levelColor: 'bg-emerald-100 text-emerald-700',
        content: '請簡述桃花源中的居民為何「不知有漢，無論魏晉」？',
        answer: '因為他們的祖先為了躲避秦朝的戰亂而來到這個與世隔絕的地方，之後就再也沒有出去過，所以不知道外界朝代的更迭。'
      },
      {
        id: 3,
        type: '論述題',
        cognitiveLevel: '評價',
        levelColor: 'bg-red-100 text-red-700',
        content: '你認為桃花源是一個理想的社會嗎？請結合文本說明你的觀點。',
        answer: '(自由作答，需結合文本中「黃髮垂髫，並怡然自樂」等描述進行評價)'
      }
    ]
  },
  {
    id: 2,
    title: '常識科期中模擬考',
    subject: '常識',
    grade: 'P5',
    date: '2023-10-20',
    questionCount: 15,
    status: '已發佈',
    questions: []
  },
  {
    id: 3,
    title: '英文閱讀理解 Week 4',
    subject: '英文',
    grade: 'S1',
    date: '2023-10-18',
    questionCount: 10,
    status: '已發佈',
    questions: []
  },
  {
    id: 4,
    title: '數學代數基礎',
    subject: '數學',
    grade: 'S2',
    date: '2023-10-15',
    questionCount: 20,
    status: '已發佈',
    questions: []
  },
  {
    id: 5,
    title: '物理力學單元測驗',
    subject: '物理',
    grade: 'S4',
    date: '2023-10-10',
    questionCount: 12,
    status: '已發佈',
    questions: []
  }
];

const QuestionCard = ({ q, index }: { q: any, index: number, key?: React.Key }) => {
  const [isAdded, setIsAdded] = useState(false);

  const handleAdd = () => {
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex gap-2 mb-4">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${q.levelColor || 'bg-slate-100 text-slate-700'}`}>
          {q.cognitiveLevel}
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
          {q.type}
        </span>
      </div>
      
      <p className="text-slate-800 font-medium mb-4 text-lg leading-relaxed">
        <span className="text-slate-400 mr-2">{index + 1}.</span>
        {q.content}
      </p>
      
      {q.options && (
        <div className="space-y-2 mb-6 ml-6">
          {q.options.map((opt: string) => (
            <div key={opt} className="px-4 py-2.5 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-100">
              {opt}
            </div>
          ))}
        </div>
      )}
      
      <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 border border-slate-100">
        <span className="font-bold text-slate-700 mr-2">參考答案：</span> 
        {q.answer}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 mt-4 pt-4">
        <button className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">
          <Share2 className="w-4 h-4" />
          分享此題
        </button>
        <button 
          onClick={handleAdd}
          disabled={isAdded}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
            isAdded 
              ? 'bg-emerald-50 text-emerald-600 cursor-default' 
              : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
          }`}
        >
          {isAdded ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              已加入
            </>
          ) : (
            <>
              <PlusCircle className="w-4 h-4" />
              加入科目題庫
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export const AssessmentLibrary: React.FC<AssessmentLibraryProps> = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState<any | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-2 transition-colors">
            <Icons.back className="w-4 h-4 mr-2" />
            返回指揮艙
          </button>
          <h1 className="text-2xl font-bold text-slate-800">歷史題庫</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜尋測驗名稱..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full md:w-64"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4" />
            篩選
          </button>
        </div>
      </div>

      {/* Library Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockLibraryData.map((item) => (
          <motion.div
            key={item.id}
            whileHover={{ y: -4 }}
            onClick={() => {
              setSelectedAssessment(item);
              setIsHistoryExpanded(false);
            }}
            className="bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100 cursor-pointer flex flex-col h-full transition-shadow hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                {item.status}
              </span>
            </div>
            
            <div className="mb-6 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{item.grade}</span>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{item.subject}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 line-clamp-2">{item.title}</h3>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
              <div className="flex flex-col">
                <span className="text-xs text-slate-400 font-medium">共 {item.questionCount} 題</span>
                <span className="text-xs text-slate-400">{item.date}</span>
              </div>
              <span className="text-sm font-bold text-indigo-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                查看完整題目 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedAssessment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-4xl h-[85vh] bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedAssessment.title}</h2>
                  <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                    <span>{selectedAssessment.grade}</span>
                    <span>•</span>
                    <span>{selectedAssessment.subject}</span>
                    <span>•</span>
                    <span>共 {selectedAssessment.questionCount} 題</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                    <Download className="w-4 h-4" />
                    下載 PDF
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm">
                    <Share2 className="w-4 h-4" />
                    派發給其他班級
                  </button>
                  <button 
                    onClick={() => setSelectedAssessment(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors ml-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
                {/* Usage History Section */}
                {selectedAssessment.usageHistory && selectedAssessment.usageHistory.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <button 
                      onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                      className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 font-bold text-slate-700">
                        <span>📈 歷史出題記錄</span>
                        <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">共 {selectedAssessment.usageHistory.length} 次</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isHistoryExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isHistoryExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 border-t border-slate-100">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left text-slate-600">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
                                  <tr>
                                    <th className="px-4 py-3 font-bold rounded-l-lg">發佈日期</th>
                                    <th className="px-4 py-3 font-bold">使用班級</th>
                                    <th className="px-4 py-3 font-bold">平均得分</th>
                                    <th className="px-4 py-3 font-bold rounded-r-lg">答對/得分率</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedAssessment.usageHistory.map((history: any, idx: number) => (
                                    <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                      <td className="px-4 py-3 font-medium text-slate-700">{history.date}</td>
                                      <td className="px-4 py-3">
                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-bold text-xs">{history.class}</span>
                                      </td>
                                      <td className="px-4 py-3 font-medium">{history.avgScore}</td>
                                      <td className="px-4 py-3">
                                        <span className="text-emerald-600 font-bold">{history.correctRate}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {selectedAssessment.questions && selectedAssessment.questions.length > 0 ? (
                  selectedAssessment.questions.map((q: any, index: number) => (
                    <QuestionCard key={q.id} q={q} index={index} />
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                    <p>此測驗暫無題目詳情資料</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
