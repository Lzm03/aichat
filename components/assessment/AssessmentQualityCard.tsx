import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { ChevronRight, BarChart2, Download, ChevronDown, ChevronUp, Flag, ArrowUpDown } from 'lucide-react';

const mockSummaries = [
  { id: 1, title: '中三古文練習 - 桃花源記', date: '10-25', avgScore: '78.5', diff: '+0.8' },
  { id: 2, title: '現代文閱讀 - 故鄉', date: '10-20', avgScore: '82.0', diff: '-0.2' },
];

const mockDetails = [
  { id: 'Q1', type: '多項選擇題', bloom: '記憶', aiScore: 2, teacherScore: 2, diff: 0 },
  { id: 'Q2', type: '簡答題', bloom: '理解', aiScore: 3, teacherScore: 4, diff: 1 },
  { id: 'Q3', type: '論述題', bloom: '評價', aiScore: 2, teacherScore: 5, diff: 3 },
  { id: 'Q4', type: '簡答題', bloom: '分析', aiScore: 4, teacherScore: 3, diff: -1 },
];

export const AssessmentQualityCard = () => {
  const [selectedAssessment, setSelectedAssessment] = useState<any | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const sortedDetails = [...mockDetails].sort((a, b) => {
    return sortOrder === 'desc' ? Math.abs(b.diff) - Math.abs(a.diff) : Math.abs(a.diff) - Math.abs(b.diff);
  });

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
          {mockSummaries.map(summary => (
            <div 
              key={summary.id}
              onClick={() => setSelectedAssessment(summary)}
              className="p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-all group flex items-center justify-between"
            >
              <div>
                <h4 className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">{summary.title}</h4>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>{summary.date}</span>
                  <span>平均 {summary.avgScore} 分</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                  summary.diff.startsWith('+') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  偏差 {summary.diff}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
              </div>
            </div>
          ))}
        </div>
      </div>

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
              className="w-full max-w-5xl max-h-[90vh] bg-slate-50 rounded-[24px] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedAssessment.title} - 質量分析</h2>
                  <p className="text-sm text-slate-500 mt-1">發佈日期: {selectedAssessment.date}</p>
                </div>
                <button 
                  onClick={() => setSelectedAssessment(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <Icons.close className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* 4 Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">本次測驗平均分</span>
                    <div className="text-3xl font-black text-slate-800 mt-2">{selectedAssessment.avgScore}</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">AI 與教師分數差異</span>
                    <div className={`text-3xl font-black mt-2 ${selectedAssessment.diff.startsWith('+') ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {selectedAssessment.diff}
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">教師修改率</span>
                    <div className="text-3xl font-black text-indigo-600 mt-2">34%</div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500">異常作答標記</span>
                    <div className="text-3xl font-black text-amber-500 mt-2 flex items-center gap-2">
                      5 <Flag className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                {/* Collapsible Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <button 
                      onClick={() => setIsTableExpanded(!isTableExpanded)}
                      className="flex items-center gap-2 font-bold text-slate-700 hover:text-indigo-600 transition-colors"
                    >
                      <span>📝 題目得分明細</span>
                      {isTableExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 transition-colors">
                      <Download className="w-4 h-4" />
                      匯出 CSV
                    </button>
                  </div>

                  <AnimatePresence>
                    {isTableExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left text-slate-600">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                              <tr>
                                <th className="px-4 py-3 font-bold">題目 ID</th>
                                <th className="px-4 py-3 font-bold">題型</th>
                                <th className="px-4 py-3 font-bold">布魯姆層級</th>
                                <th className="px-4 py-3 font-bold text-center">AI 分數</th>
                                <th className="px-4 py-3 font-bold text-center">教師最終分數</th>
                                <th className="px-4 py-3 font-bold text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}>
                                  <div className="flex items-center justify-center gap-1">
                                    差值
                                    <ArrowUpDown className="w-3 h-3" />
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedDetails.map((detail) => {
                                const isHighDiff = Math.abs(detail.diff) >= 2;
                                return (
                                  <tr key={detail.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors ${isHighDiff ? 'bg-rose-50/30' : ''}`}>
                                    <td className="px-4 py-3 font-medium text-slate-800">{detail.id}</td>
                                    <td className="px-4 py-3">{detail.type}</td>
                                    <td className="px-4 py-3">
                                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold">{detail.bloom}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium">{detail.aiScore}</td>
                                    <td className="px-4 py-3 text-center font-bold text-indigo-600">{detail.teacherScore}</td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`font-bold px-2 py-1 rounded-md ${
                                        detail.diff > 0 ? 'text-emerald-600 bg-emerald-50' : 
                                        detail.diff < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-400'
                                      }`}>
                                        {detail.diff > 0 ? `+${detail.diff}` : detail.diff}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
