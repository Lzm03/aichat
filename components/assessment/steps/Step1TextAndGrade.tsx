import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, Settings2, Lightbulb, ArrowRight, BookOpen, X, Bot, LoaderCircle } from 'lucide-react';
import { API_BASE } from '../../../utils/api';

interface PublishBotOption {
  id: string;
  name: string;
  subject?: string;
  isVisible?: boolean;
}

type GeneratedQuestion = {
  id: number | string;
  type: string;
  cognitiveLevel: string;
  levelColor: string;
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  points?: number;
  difficulty?: string;
};

type GeneratedQuizPayload = {
  quiz: {
    id: string;
    title: string;
    botId: string;
    targetGrade: string;
    questionCount: number;
    questionTypeMode: string;
    sourceText?: string;
  };
  questions: GeneratedQuestion[];
};

interface Step1TextAndGradeProps {
  onGenerated: (payload: GeneratedQuizPayload) => void;
}

const mockHistoryTexts = [
  { id: 1, title: '中三古文練習 - 桃花源記', content: '晉太元中，武陵人捕魚為業。緣溪行，忘路之遠近。忽逢桃花林，夾岸數百步，中無雜樹，芳草鮮美，落英繽紛。漁人甚異之，復前行，欲窮其林。\n\n林盡水源，便得一山，山有小口，彷彿若有光。便捨船，從口入。初極狹，才通人。復行數十步，豁然開朗。土地平曠，屋舍儼然，有良田美池桑竹之屬。阡陌交通，雞犬相聞。其中往來種作，男女衣著，悉如外人。黃髮垂髫，並怡然自樂。' },
  { id: 2, title: '現代文閱讀 - 故鄉', content: '我冒了嚴寒，回到相隔二千餘里，別了二十餘年的故鄉去。\n\n時候既然是深冬；漸近故鄉時，天氣又陰晦了，冷風吹進船艙中，嗚嗚的響，從篷隙向外一望，蒼黃的天底下，遠近橫著幾個蕭索的荒村，沒有一些活氣。我的心禁不住悲涼起來了。\n\n阿！這不是我二十年來時時記得的故鄉？' }
];

const DEFAULT_QUESTION_COUNT_BY_GRADE: Record<string, number> = {
  'P1-P3': 5,
  'P4-P6': 8,
  'S1-S3': 10,
  'S4-S6': 12,
};

export const Step1TextAndGrade: React.FC<Step1TextAndGradeProps> = ({ onGenerated }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [grade, setGrade] = useState('P1-P3');
  const [questionCount, setQuestionCount] = useState(5);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [publishBots, setPublishBots] = useState<PublishBotOption[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [loadingBots, setLoadingBots] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);

  const handleImportHistory = (content: string) => {
    setText(content);
    setIsHistoryModalOpen(false);
  };

  const handleUploadDocument = async (file: File) => {
    setErrorMessage('');
    setIsUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/api/quizzes/source-text/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '文檔上傳失敗，請稍後再試。'));
      }
      setText(String(data?.text || ''));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '文檔上傳失敗，請稍後再試。');
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const getAiGuide = (selectedGrade: string) => {
    switch (selectedGrade) {
      case 'P1-P3':
        return '💡 AI 將自動限制高階認知層級，並簡化提問詞彙，適合初小學生。';
      case 'P4-P6':
        return '💡 AI 將平衡基礎理解與應用題型，適度增加推論性問題。';
      case 'S1-S3':
        return '💡 AI 將增加分析與評鑑題型，鼓勵學生進行批判性思考。';
      case 'S4-S6':
        return '💡 AI 將著重於高階認知層級，模擬公開試題型與深度。';
      default:
        return '💡 AI 將根據所選年級自動調整題目難度與認知層級。';
    }
  };

  useEffect(() => {
    let active = true;

    fetch(`${API_BASE}/api/teachers/me/available-quiz-bots`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const next = Array.isArray(data?.bots)
          ? data.bots
              .map((item: any) => ({
                id: String(item.id || ''),
                name: String(item.name || '未命名 Bot'),
                subject: item.subject ? String(item.subject) : '',
                isVisible: true,
              }))
              .filter((item: PublishBotOption) => item.id)
          : [];
        setPublishBots(next);
        setSelectedBotId((prev) => prev || String(next[0]?.id || ''));
      })
      .catch(() => {
        if (!active) return;
        setPublishBots([]);
      })
      .finally(() => {
        if (active) setLoadingBots(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleGenerate = async () => {
    const trimmedText = text.trim();
    if (!selectedBotId) {
      setErrorMessage('請先選擇要發布測驗的 AI Bot。');
      return;
    }
    if (!trimmedText) {
      setErrorMessage('請先輸入測驗文本。');
      return;
    }
    if (!grade) {
      setErrorMessage('請先選擇目標年級。');
      return;
    }
    if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 15) {
      setErrorMessage('請選擇有效的題目數量。');
      return;
    }
    setErrorMessage('');
    setIsGenerating(true);

    try {
      const response = await fetch(`${API_BASE}/api/quizzes/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botId: selectedBotId,
          sourceText: trimmedText,
          targetGrade: grade,
          questionCount,
          questionTypeMode: 'ai_auto',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || 'AI 題目生成失敗，請稍後再試。'));
      }

      onGenerated({
        quiz: {
          id: String(data?.quiz?.id || data?.quizId || ''),
          title: String(data?.quiz?.title || ''),
          botId: String(data?.quiz?.botId || selectedBotId),
          targetGrade: String(data?.quiz?.targetGrade || grade),
          questionCount: Number(data?.quiz?.questionCount || questionCount),
          questionTypeMode: String(data?.quiz?.questionTypeMode || 'ai_auto'),
          sourceText: trimmedText,
        },
        questions: Array.isArray(data?.questions) ? data.questions : [],
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 題目生成失敗，請稍後再試。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full flex flex-col space-y-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側：文本材料輸入區 */}
        <div className="lg:col-span-2 bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 shrink-0">
              <FileText className="w-5 h-5 text-indigo-500" />
              文本材料
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                type="button"
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full hover:bg-indigo-100 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">從歷史題庫導入</span>
                <span className="sm:hidden">題庫導入</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDocument}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 px-4 py-2 rounded-full hover:bg-slate-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadCloud className="w-4 h-4" />
                <span className="hidden sm:inline">{isUploadingDocument ? '文檔解析中...' : '上傳文檔'}</span>
                <span className="sm:hidden">{isUploadingDocument ? '解析中' : '上傳'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUploadDocument(file);
                  }
                  event.currentTarget.value = '';
                }}
              />
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="請在此貼上文章內容，或點擊右上角上傳文檔 (支援 PDF, DOCX, TXT)..."
            className="flex-1 min-h-[400px] w-full bg-slate-50 rounded-2xl p-6 text-slate-700 placeholder:text-slate-400 resize-none outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>

        {/* 右側：設定區 */}
        <div className="lg:col-span-1 bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col space-y-8">
          <div className="flex items-center gap-2 mb-2 border-b border-slate-100 pb-4">
            <Settings2 className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-800">測驗設定</h2>
          </div>

          {/* 區塊 A：發佈 Bot */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700">發佈到 Bot</label>
            <div className="relative">
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 pr-10 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium disabled:opacity-60"
                disabled={loadingBots || publishBots.length === 0}
              >
                {loadingBots && <option value="">載入 Bot 中...</option>}
                {!loadingBots && publishBots.length === 0 && <option value="">暫無可用 Bot</option>}
                {publishBots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}{bot.subject ? ` · ${bot.subject}` : ''}{bot.isVisible ? ' · 已分享' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-violet-50 text-violet-700 text-sm p-4 rounded-xl flex items-start gap-2 leading-relaxed"
            >
              <span className="shrink-0 mt-0.5"><Bot className="w-4 h-4 text-violet-500" /></span>
              <span>
                這裡只顯示目前帳戶已分享的 Bot，並可選擇本次測驗要發佈到哪個教學角色。
              </span>
            </motion.div>
          </div>

          {/* 區塊 B：目標年級 */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700">目標年級</label>
            <div className="relative">
              <select 
                value={grade}
                onChange={(e) => {
                  const nextGrade = e.target.value;
                  setGrade(nextGrade);
                  setQuestionCount(DEFAULT_QUESTION_COUNT_BY_GRADE[nextGrade] || 5);
                }}
                className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 pr-10 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium"
              >
                <option value="P1-P3">小一至小三 (P1-P3)</option>
                <option value="P4-P6">小四至小六 (P4-P6)</option>
                <option value="S1-S3">中一至中三 (S1-S3)</option>
                <option value="S4-S6">中四至中六 (S4-S6)</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            
            {/* AI 年級指引 */}
            <motion.div 
              key={grade}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-sky-50 text-sky-700 text-sm p-4 rounded-xl flex items-start gap-2 leading-relaxed"
            >
              <span className="shrink-0 mt-0.5"><Lightbulb className="w-4 h-4 text-sky-500" /></span>
              <span>{getAiGuide(grade)}</span>
            </motion.div>
          </div>

          {/* 區塊 C：題目數量 */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-700">題目數量</label>
              <div className="bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-lg text-sm">
                {questionCount} 題
              </div>
            </div>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="1" 
                max="15" 
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 font-medium px-1">
              <span>1</span>
              <span>15</span>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-medium leading-6 text-slate-500">
              這裡控制的是整份測驗的總題數。下一步後，AI 會根據目標年級與題目數量自動分配最適合的題型與內容。
            </div>
          </div>

        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {/* 底部導航 */}
      <div className="flex justify-end pt-4">
        <button 
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-8 py-3.5 rounded-full font-bold hover:shadow-lg hover:shadow-indigo-200/50 hover:-translate-y-0.5 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {isGenerating ? (
            <>
              <LoaderCircle className="w-5 h-5 animate-spin" />
              正在生成題目...
            </>
          ) : (
            <>
              下一步：預覽與發佈
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      {/* 歷史題庫導入 Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-white rounded-[24px] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  從歷史題庫導入
                </h3>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-slate-500 mb-4">請選擇您最近使用過的文本材料：</p>
                {mockHistoryTexts.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleImportHistory(item.content)}
                    className="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group"
                  >
                    <h4 className="font-bold text-slate-700 group-hover:text-indigo-700 transition-colors mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.content}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
