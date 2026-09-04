import { uiText } from '../../utils/uiI18n';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Check, Edit2, RefreshCw, Save, X } from 'lucide-react';

interface SubjectiveQuestionCardProps {
  index: number;
  question: string;
  studentAnswer: string;
  aiDraft: {
    score: number;
    maxScore: number;
    comment: string;
    reasoning: string;
  };
  currentScore: number;
  onScoreChange: (score: number) => void;
}

export const SubjectiveQuestionCard: React.FC<SubjectiveQuestionCardProps> = ({
  index,
  question,
  studentAnswer,
  aiDraft,
  currentScore,
  onScoreChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [comment, setComment] = useState(aiDraft.comment);

  const handleSave = () => {
    // 數據埋點：用於後續靜默收集模型訓練數據
    // recordDifference(
    //   { comment: aiDraft.comment, score: aiDraft.score },
    //   { comment, score: currentScore }
    // );
    
    setIsEditing(false);
  };

  const handleCancel = () => {
    setComment(aiDraft.comment);
    onScoreChange(aiDraft.score); // 恢復為原始 AI 分數
    setIsEditing(false);
  };

  return (
    <motion.div 
      layout
      className="bg-white rounded-[24px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] border border-slate-100"
    >
      <motion.div layout className="flex gap-4">
        <span className="text-lg font-bold text-slate-400 shrink-0">{index}.</span>
        <div className="flex-1">
          <motion.p layout className="text-lg font-medium text-slate-800 mb-4">{question}</motion.p>
          
          <motion.div layout className="space-y-6">
            <motion.div layout className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{uiText("學生作答")}</span>
              <p className="text-slate-700 leading-relaxed">{studentAnswer}</p>
            </motion.div>

            <AnimatePresence mode="popLayout">
              {!isEditing ? (
                // 視圖 A：預設 AI 預批視圖 (Read-only State)
                <motion.div 
                  key="read-only"
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="bg-purple-50 rounded-2xl p-5 border border-purple-100 relative mt-8"
                >
                  <div className="absolute -top-3 left-5 bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-200 flex items-center gap-1.5 shadow-sm">
                    <Icons.sparkles className="w-3 h-3" />{uiText("AI 預批")}</div>
                  
                  <div className="flex justify-between items-start mb-4 mt-2">
                    <div className="flex-1 pr-6">
                      <span className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 block">{uiText("草擬評語")}</span>
                      <p className="text-purple-900 font-medium leading-relaxed">{comment}</p>
                    </div>
                    <div className="text-right shrink-0 bg-white px-4 py-2 rounded-xl shadow-sm border border-purple-100">
                      <span className="text-2xl font-bold text-purple-600">{currentScore}</span>
                      <span className="text-sm font-medium text-slate-400"> / {aiDraft.maxScore}{uiText(" 分")}</span>
                    </div>
                  </div>
                  
                  <div className="bg-white/60 p-3 rounded-xl">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">{uiText("判斷依據")}</span>
                    <p className="text-sm text-slate-500 leading-relaxed">{aiDraft.reasoning}</p>
                  </div>

                  {/* 操作列 */}
                  <div className="flex items-center gap-3 mt-5 pt-5 border-t border-purple-100/50">
                    <button className="flex items-center gap-2 bg-purple-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-purple-700 hover:shadow-md hover:shadow-purple-200 transition-all active:scale-95">
                      <Check className="w-4 h-4" />{uiText("批准")}</button>
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 border-2 border-purple-200 text-purple-600 px-6 py-2.5 rounded-full font-bold hover:bg-purple-100 transition-all active:scale-95"
                    >
                      <Edit2 className="w-4 h-4" />{uiText("修改評語")}</button>
                    <button className="flex items-center gap-2 text-slate-400 hover:text-purple-600 px-4 py-2.5 rounded-full font-medium transition-colors ml-auto">
                      <RefreshCw className="w-4 h-4" />{uiText("重新生成")}</button>
                  </div>
                </motion.div>
              ) : (
                // 視圖 B：編輯狀態 (Edit State)
                <motion.div 
                  key="edit"
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="mt-8 space-y-4"
                >
                  {/* 幽靈參考區 (Reference Area) */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative">
                    <div className="absolute -top-3 left-5 bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-full border border-slate-300 flex items-center gap-1.5 shadow-sm">
                      <Icons.sparkles className="w-3 h-3 text-slate-500" />{uiText("AI 原始草稿")}</div>
                    <div className="mt-2">
                      <p className="text-slate-400 text-sm leading-relaxed mb-3 line-clamp-2">{aiDraft.comment}</p>
                      <div className="bg-white/50 p-3 rounded-xl border border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">{uiText("判斷依據")}</span>
                        <p className="text-xs text-slate-400 leading-relaxed">{aiDraft.reasoning}</p>
                      </div>
                    </div>
                  </div>

                  {/* 實體輸入區 (Input Area) */}
                  <div className="bg-white rounded-2xl border-2 border-indigo-100 p-1 focus-within:border-indigo-500 transition-colors shadow-sm">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full min-h-[120px] p-4 bg-transparent resize-none outline-none text-slate-800 leading-relaxed"
                      placeholder={uiText("請輸入評語...")}
                      autoFocus
                    />
                    <div className="flex justify-end items-center p-3 bg-slate-50 rounded-xl border-t border-slate-100 gap-2 mt-2">
                      <span className="text-sm font-bold text-slate-500">{uiText("得分：")}</span>
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50">
                        <input 
                          type="number" 
                          value={currentScore}
                          onChange={(e) => onScoreChange(Number(e.target.value))}
                          className="w-16 py-1.5 px-3 text-center font-bold text-indigo-600 outline-none"
                          min={0}
                          max={aiDraft.maxScore}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-400">/ {aiDraft.maxScore}{uiText(" 分")}</span>
                    </div>
                  </div>

                  {/* 編輯操作列 */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button 
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full text-slate-500 font-bold hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-4 h-4" />{uiText("取消")}</button>
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-200 transition-all active:scale-95"
                    >
                      <Save className="w-4 h-4" />{uiText("完成並儲存")}</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};
