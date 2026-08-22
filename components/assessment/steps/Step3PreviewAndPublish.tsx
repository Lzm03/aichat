import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Edit3, ChevronDown, Save, Rocket, ArrowLeft, PlusCircle, X, Search, Eye, LoaderCircle, FolderPlus, CheckCircle2 } from 'lucide-react';
import { API_BASE } from '../../../utils/api';

interface Step3PreviewAndPublishProps {
  onPrev: () => void;
  onPublish: () => void;
  initialQuiz?: {
    id: string;
    title: string;
    botId: string;
    targetGrade: string;
    questionCount: number;
    questionTypeMode: string;
  } | null;
  initialQuestions?: Array<{
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
  }>;
}

const QUESTION_TYPE_OPTIONS = ['多項選擇題', '填充題', '判斷題', '簡答題', '論述題'];

type QuestionBankSummary = {
  id: string;
  title: string;
  questionCount: number;
  createdAt?: string;
  updatedAt?: string;
};

const mockQuestions = [
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
    content: '你認為桃花源是一個理想的社會嗎？請結合文本説明你的觀點。',
    answer: '(自由作答，需結合文本中「黃髮垂髫，並怡然自樂」等描述進行評價)'
  },
  {
    id: 4,
    type: '多項選擇題',
    cognitiveLevel: '應用',
    levelColor: 'bg-amber-100 text-amber-700',
    content: '下列哪一個成語最適合用來形容桃花源的環境？',
    options: ['A. 豁然開朗', 'B. 世外桃源', 'C. 阡陌交通', 'D. 落英繽紛'],
    answer: 'B. 世外桃源'
  },
  {
    id: 5,
    type: '填充題',
    cognitiveLevel: '記憶',
    levelColor: 'bg-blue-100 text-blue-700',
    content: '芳草鮮美，__________。',
    answer: '落英繽紛'
  }
];

export const Step3PreviewAndPublish: React.FC<Step3PreviewAndPublishProps> = ({
  onPrev,
  onPublish,
  initialQuiz,
  initialQuestions = [],
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState(initialQuiz?.title || 'AI 測驗草稿');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedHistoryQuestions, setSelectedHistoryQuestions] = useState<number[]>([]);
  const [questions, setQuestions] = useState(initialQuestions.length ? initialQuestions : mockQuestions);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [typeSelections, setTypeSelections] = useState<Record<string, string>>({});
  const [rewritingQuestionId, setRewritingQuestionId] = useState<string | number | null>(null);
  const [openTypePickerId, setOpenTypePickerId] = useState<string | number | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | number | null>(null);
  const [typeEditingQuestionId, setTypeEditingQuestionId] = useState<string | number | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, { content: string; options: string[]; answer: string }>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | number | null>(null);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankModalStep, setBankModalStep] = useState<'list' | 'create'>('list');
  const [questionBanks, setQuestionBanks] = useState<QuestionBankSummary[]>([]);
  const [loadingQuestionBanks, setLoadingQuestionBanks] = useState(false);
  const [activeBankQuestionId, setActiveBankQuestionId] = useState<string | number | null>(null);
  const [creatingBank, setCreatingBank] = useState(false);
  const [savingBankQuestionId, setSavingBankQuestionId] = useState<string | number | null>(null);
  const [newBankTitle, setNewBankTitle] = useState('');
  const [bankSuccessMessage, setBankSuccessMessage] = useState('');

  useEffect(() => {
    setTypeSelections(
      questions.reduce<Record<string, string>>((acc, question) => {
        acc[String(question.id)] = question.type;
        return acc;
      }, {})
    );
  }, [questions]);

  const mockHistoryAssessments = [
    {
      id: 'h1',
      title: '中二古文測驗 (去年)',
      questions: [
        { id: 101, content: '解釋「黃髮垂髫」的意思。', cognitiveLevel: '理解', levelColor: 'bg-emerald-100 text-emerald-700', type: '簡答題' },
        { id: 102, content: '桃花源記中，漁人離開時做了什麼記號？', cognitiveLevel: '記憶', levelColor: 'bg-blue-100 text-blue-700', type: '多項選擇題' }
      ]
    },
    {
      id: 'h2',
      title: '期中考 - 閲讀理解',
      questions: [
        { id: 201, content: '比較桃花源與現實社會的差異。', cognitiveLevel: '分析', levelColor: 'bg-orange-100 text-orange-700', type: '論述題' }
      ]
    }
  ];

  const handleToggleHistoryQuestion = (id: number) => {
    setSelectedHistoryQuestions(prev => 
      prev.includes(id) ? prev.filter(qId => qId !== id) : [...prev, id]
    );
  };

  const handleAddHistoryQuestions = () => {
    const newQuestions = mockHistoryAssessments.flatMap(a => a.questions)
      .filter(q => selectedHistoryQuestions.includes(q.id))
      .map(q => ({ ...q, isFromHistory: true, answer: '歷史題庫參考答案' }));
    
    setQuestions([...questions, ...newQuestions]);
    setIsDrawerOpen(false);
    setSelectedHistoryQuestions([]);
  };

  const visibleQuestions = isExpanded ? questions : questions.slice(0, 2);

  const handlePublishQuiz = async () => {
    if (!initialQuiz?.id) {
      onPublish();
      return;
    }
    setPublishError('');
    setIsPublishing(true);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${initialQuiz.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '發佈測驗失敗，請稍後再試。'));
      }
      onPublish();
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '發佈測驗失敗，請稍後再試。');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!initialQuiz?.id) return;
    setPublishError('');
    setIsSavingDraft(true);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${initialQuiz.id}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '儲存草稿失敗，請稍後再試。'));
      }
      setDraftSaved(true);
      window.setTimeout(() => setDraftSaved(false), 2200);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '儲存草稿失敗，請稍後再試。');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleRewriteQuestionType = async (questionId: string | number) => {
    if (!initialQuiz?.id) return;
    const targetType = typeSelections[String(questionId)];
    if (!targetType) return;
    setPublishError('');
    setRewritingQuestionId(questionId);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${initialQuiz.id}/questions/${questionId}/rewrite-type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '修改題型失敗，請稍後再試。'));
      }
      const nextQuestion = data?.question
        ? {
            ...data.question,
            options: Array.isArray(data.question.options) ? data.question.options : undefined,
          }
        : null;
      setQuestions((prev) =>
        prev.map((question: any) => (String(question.id) === String(questionId) && nextQuestion ? nextQuestion : question))
      );
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '修改題型失敗，請稍後再試。');
    } finally {
      setRewritingQuestionId(null);
    }
  };

  const handleStartTypeEditing = (question: any, options?: { openPicker?: boolean }) => {
    setTypeEditingQuestionId(question.id);
    setTypeSelections((prev) => ({
      ...prev,
      [String(question.id)]: prev[String(question.id)] || question.type,
    }));
    setEditingQuestionId(null);
    setOpenTypePickerId(options?.openPicker ? question.id : null);
  };

  const handleStartEditing = (question: any) => {
    setEditingQuestionId(question.id);
    setQuestionDrafts((prev) => ({
      ...prev,
      [String(question.id)]: {
        content: question.content || "",
        options: Array.isArray(question.options) ? question.options : [],
        answer: question.answer || "",
      },
    }));
    setTypeEditingQuestionId(null);
    setOpenTypePickerId(null);
  };

  const handleCancelEditing = (question: any) => {
    setEditingQuestionId(null);
    setTypeSelections((prev) => ({
      ...prev,
      [String(question.id)]: question.type,
    }));
  };

  const handleCancelTypeEditing = (question: any) => {
    setTypeEditingQuestionId(null);
    setOpenTypePickerId(null);
    setTypeSelections((prev) => ({
      ...prev,
      [String(question.id)]: question.type,
    }));
  };

  const handleSaveQuestion = async (question: any) => {
    if (!initialQuiz?.id) return;
    const draft = questionDrafts[String(question.id)];
    if (!draft) return;

    setPublishError('');
    setSavingQuestionId(question.id);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${initialQuiz.id}/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: draft.content,
          options: draft.options,
          answer: draft.answer,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '修改題目失敗，請稍後再試。'));
      }

      const nextQuestion = data?.question
        ? {
            ...data.question,
            options: Array.isArray(data.question.options) ? data.question.options : undefined,
          }
        : null;
      setQuestions((prev) =>
        prev.map((item: any) => (String(item.id) === String(question.id) && nextQuestion ? nextQuestion : item))
      );
      setEditingQuestionId(null);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '修改題目失敗，請稍後再試。');
    } finally {
      setSavingQuestionId(null);
    }
  };

  const handleConfirmEditing = async (question: any) => {
    await handleRewriteQuestionType(question.id);
    setTypeEditingQuestionId(null);
    setOpenTypePickerId(null);
  };

  const loadQuestionBanks = async () => {
    setLoadingQuestionBanks(true);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/question-banks`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '載入題庫失敗，請稍後再試。'));
      }
      setQuestionBanks(Array.isArray(data?.banks) ? data.banks : []);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '載入題庫失敗，請稍後再試。');
    } finally {
      setLoadingQuestionBanks(false);
    }
  };

  const openBankModal = (questionId: string | number) => {
    if (isBankModalOpen && String(activeBankQuestionId) === String(questionId)) {
      setIsBankModalOpen(false);
      setBankModalStep('list');
      setNewBankTitle('');
      setBankSuccessMessage('');
      return;
    }
    setActiveBankQuestionId(questionId);
    setIsBankModalOpen(true);
    setBankModalStep('list');
    setNewBankTitle('');
    setBankSuccessMessage('');
    void loadQuestionBanks();
  };

  const handleAttachQuestionToBank = async (bankId: string, questionId: string | number) => {
    if (!initialQuiz?.id) return;
    setPublishError('');
    setBankSuccessMessage('');
    setSavingBankQuestionId(questionId);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/question-banks/${bankId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: initialQuiz.id,
          questionId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '加入題庫失敗，請稍後再試。'));
      }
      setBankSuccessMessage(data?.duplicated ? '這道題已經在該題庫中了。' : '題目已加入題庫。');
      await loadQuestionBanks();
      window.setTimeout(() => {
        setIsBankModalOpen(false);
        setBankSuccessMessage('');
      }, 900);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '加入題庫失敗，請稍後再試。');
    } finally {
      setSavingBankQuestionId(null);
    }
  };

  const handleCreateBankAndAttach = async () => {
    if (!activeBankQuestionId) return;
    const title = newBankTitle.trim();
    if (!title) {
      setPublishError('請先輸入題庫名稱。');
      return;
    }
    setPublishError('');
    setCreatingBank(true);
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/question-banks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '建立題庫失敗，請稍後再試。'));
      }
      const createdBankId = String(data?.bank?.id || '');
      if (!createdBankId) {
        throw new Error('建立題庫失敗，請稍後再試。');
      }
      setQuestionBanks((prev) => [data.bank, ...prev]);
      await handleAttachQuestionToBank(createdBankId, activeBankQuestionId);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '建立題庫失敗，請稍後再試。');
    } finally {
      setCreatingBank(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full flex flex-col space-y-6"
    >
      {/* 頂部狀態概覽 */}
      <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-emerald-600" />
        </div>
        <span className="font-bold">✨ AI 已成功為您生成 {questions.length} 道題目</span>
      </div>

      {/* 題目預覽卡片 */}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {visibleQuestions.map((q: any, index: number) => (
            <motion.div 
              key={q.id}
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="bg-white rounded-[24px] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100 overflow-visible relative"
            >
              {q.isFromHistory && (
                <div className="absolute top-0 right-0 bg-emerald-50 text-emerald-600 text-xs font-bold px-3 py-1 rounded-bl-xl border-b border-l border-emerald-100">
                  ✨ 來自歷史題庫
                </div>
              )}
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${q.levelColor}`}>{q.cognitiveLevel}</span>
                  {typeEditingQuestionId === q.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenTypePickerId((prev) => (prev === q.id ? null : q.id))}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                        >
                          <span>{typeSelections[String(q.id)] || q.type}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openTypePickerId === q.id ? 'rotate-180' : ''}`} />
                        </button>
                        {openTypePickerId === q.id ? (
                          <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                            {QUESTION_TYPE_OPTIONS.map((option) => {
                              const active = (typeSelections[String(q.id)] || q.type) === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    setTypeSelections((prev) => ({
                                      ...prev,
                                      [String(q.id)]: option,
                                    }));
                                    setOpenTypePickerId(null);
                                  }}
                                  className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${
                                    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleConfirmEditing(q)}
                        disabled={rewritingQuestionId === q.id}
                        className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {rewritingQuestionId === q.id ? '修改中...' : '確定更改'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelTypeEditing(q)}
                        className="rounded-lg bg-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-300"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartTypeEditing(q, { openPicker: true })}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                    >
                      {q.type}
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleStartEditing(q)}
                  className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  編輯題目
                </button>
              </div>
              {editingQuestionId === q.id ? (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">題目內容</label>
                    <textarea
                      value={questionDrafts[String(q.id)]?.content || ''}
                      onChange={(e) =>
                        setQuestionDrafts((prev) => ({
                          ...prev,
                          [String(q.id)]: {
                            content: e.target.value,
                            options: prev[String(q.id)]?.options || [],
                            answer: prev[String(q.id)]?.answer || '',
                          },
                        }))
                      }
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white"
                    />
                  </div>

                  {Array.isArray(questionDrafts[String(q.id)]?.options) && questionDrafts[String(q.id)]!.options.length > 0 ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-700">選項內容</label>
                      {questionDrafts[String(q.id)]!.options.map((opt, optionIndex) => (
                        <input
                          key={`${q.id}-option-${optionIndex}`}
                          type="text"
                          value={opt}
                          onChange={(e) =>
                            setQuestionDrafts((prev) => ({
                              ...prev,
                              [String(q.id)]: {
                                content: prev[String(q.id)]?.content || '',
                                options: (prev[String(q.id)]?.options || []).map((item, idx) =>
                                  idx === optionIndex ? e.target.value : item
                                ),
                                answer: prev[String(q.id)]?.answer || '',
                              },
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
                        />
                      ))}
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">參考答案</label>
                    <textarea
                      value={questionDrafts[String(q.id)]?.answer || ''}
                      onChange={(e) =>
                        setQuestionDrafts((prev) => ({
                          ...prev,
                          [String(q.id)]: {
                            content: prev[String(q.id)]?.content || '',
                            options: prev[String(q.id)]?.options || [],
                            answer: e.target.value,
                          },
                        }))
                      }
                      rows={2}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => handleCancelEditing(q)}
                      className="rounded-xl bg-slate-200 px-5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-300"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveQuestion(q)}
                      disabled={savingQuestionId === q.id}
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {savingQuestionId === q.id ? '保存中...' : '保存修改'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-slate-800 font-medium mb-4 text-lg leading-relaxed">
                    <span className="text-slate-400 mr-2">{q.id}.</span>
                    {q.content}
                  </p>

                  {q.options && (
                    <div className="space-y-2 mb-6 ml-6">
                      {q.options.map(opt => (
                        <div key={opt} className="px-4 py-2.5 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-100">{opt}</div>
                      ))}
                    </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 mb-6 border border-slate-100">
                    <span className="font-bold text-slate-700 mr-2">參考答案：</span>
                    {q.answer}
                  </div>
                </>
              )}
              
              <div className="flex items-center pt-4 border-t border-slate-100">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => openBankModal(q.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    添加到題庫
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isBankModalOpen && activeBankQuestionId === q.id ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isBankModalOpen && activeBankQuestionId === q.id ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        className="absolute left-0 top-full z-30 mt-2.5 w-[200px] max-w-[calc(100vw-40px)]"
                      >
                        {bankModalStep === 'list' ? (
                          <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_16px_30px_rgba(15,23,42,0.12)]">
                            <button
                              type="button"
                              onClick={() => setBankModalStep('create')}
                              className="flex items-center gap-2 text-[12px] font-bold text-indigo-600 transition hover:text-indigo-700"
                            >
                              <PlusCircle className="h-4 w-4 shrink-0" />
                              新建題庫
                            </button>

                            <div className="my-3 h-px bg-slate-100" />

                            <div className="space-y-3">
                              {loadingQuestionBanks ? (
                                <div className="text-[11px] font-semibold text-slate-400">載入題庫中...</div>
                              ) : questionBanks.length ? (
                                questionBanks.map((bank) => (
                                  <button
                                    key={bank.id}
                                    type="button"
                                    onClick={() => activeBankQuestionId && void handleAttachQuestionToBank(bank.id, activeBankQuestionId)}
                                    disabled={savingBankQuestionId === activeBankQuestionId}
                                    className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-bold text-slate-700 transition hover:text-indigo-600 disabled:opacity-60"
                                  >
                                    <span className="truncate">{bank.title}</span>
                                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">{bank.questionCount} 題</span>
                                  </button>
                                ))
                              ) : (
                                <div className="rounded-2xl bg-slate-50 px-3 py-4 text-[11px] font-medium leading-5 text-slate-400">
                                  目前還沒有題庫，先建立第一個題庫吧。
                                </div>
                              )}
                            </div>

                            {bankSuccessMessage ? (
                              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                {bankSuccessMessage}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_16px_30px_rgba(15,23,42,0.12)]">
                            <input
                              type="text"
                              value={newBankTitle}
                              onChange={(e) => setNewBankTitle(e.target.value)}
                              placeholder="輸入新題庫名稱..."
                              className="w-full rounded-[16px] border-[3px] border-indigo-500 px-3.5 py-3 text-[12px] font-bold text-slate-700 outline-none placeholder:text-slate-300"
                            />

                            <div className="mt-3 flex gap-2.5">
                              <button
                                type="button"
                                onClick={() => void handleCreateBankAndAttach()}
                                disabled={creatingBank}
                                className="flex-1 rounded-[14px] bg-indigo-400 px-3 py-2.5 text-[12px] font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                              >
                                {creatingBank ? '確認中...' : '確認'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setBankModalStep('list')}
                                className="flex-1 rounded-[14px] bg-slate-100 px-3 py-2.5 text-[12px] font-bold text-slate-600 transition hover:bg-slate-200"
                              >
                                返回
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* 從歷史題庫挑選題目按鈕 */}
        <button 
          onClick={() => setIsDrawerOpen(true)}
          className="w-full border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-slate-500 hover:text-indigo-600 rounded-[24px] p-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer group"
        >
          <PlusCircle className="w-8 h-8 opacity-50 group-hover:opacity-100 transition-opacity" />
          <span className="font-bold">➕ 從歷史題庫挑選題目 (混合出題)</span>
        </button>
      </div>

      {/* 折疊邏輯按鈕 */}
      {!isExpanded && questions.length > 2 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center mt-2 relative z-10"
        >
          <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent -z-10"></div>
          <button 
            onClick={() => setIsExpanded(true)} 
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-indigo-600 shadow-sm transition-all hover:shadow-md"
          >
            <ChevronDown className="w-4 h-4" /> 
            展開其餘 {questions.length - 2} 題
          </button>
        </motion.div>
      )}

      {/* 底部發佈模塊 */}
      <div className="mt-8 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-[24px] p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div className="flex-1">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 block">測驗名稱</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="w-full text-2xl md:text-3xl font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none transition-colors pb-2 placeholder:text-slate-300"
              placeholder="輸入測驗名稱..."
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button 
              onClick={onPrev} 
              className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </button>
            <button 
              onClick={() => setIsPreviewOpen(true)}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
            >
              <Eye className="w-4 h-4" /> 
              預覽
            </button>
            <button onClick={() => void handleSaveDraft()} disabled={isSavingDraft} className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-slate-700 bg-white/80 backdrop-blur-sm border border-slate-200 hover:bg-white transition-all shadow-sm active:scale-95 disabled:opacity-60">
              <Save className="w-4 h-4" />
              {isSavingDraft ? '儲存中...' : draftSaved ? '已儲存草稿' : '儲存草稿'}
            </button>
            <button 
              onClick={() => void handlePublishQuiz()}
              disabled={isPublishing}
              className="flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200/50 hover:-translate-y-0.5 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isPublishing ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {isPublishing ? '發佈中...' : '立即發佈'}
            </button>
          </div>
        </div>
        {publishError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {publishError}
          </div>
        ) : null}
        {draftSaved ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            草稿已保留，回到智能評測首頁後會出現在草稿箱。
          </div>
        ) : null}
      </div>

      {/* 右側滑出面板 (History Question Picker Drawer) */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* 遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            
            {/* 面板本體 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* 面板頭部 */}
              <div className="p-6 border-b border-slate-100 flex flex-col gap-4 bg-white z-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-800">挑選歷史題目</h3>
                  <button 
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="搜尋題目內容或標籤..." 
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* 面板主體 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {mockHistoryAssessments.map(assessment => (
                  <div key={assessment.id} className="space-y-3">
                    <h4 className="font-bold text-slate-700 flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
                      {assessment.title}
                    </h4>
                    <div className="space-y-2">
                      {assessment.questions.map(q => (
                        <label 
                          key={q.id} 
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedHistoryQuestions.includes(q.id) 
                              ? 'border-indigo-500 bg-indigo-50/30' 
                              : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedHistoryQuestions.includes(q.id)}
                            onChange={() => handleToggleHistoryQuestion(q.id)}
                            className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 accent-indigo-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${q.levelColor}`}>
                                {q.cognitiveLevel}
                              </span>
                              <span className="text-xs text-slate-500">{q.type}</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{q.content}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* 面板底部 */}
              <div className="p-6 border-t border-slate-100 bg-white shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">
                    已選擇 <strong className="text-indigo-600 text-lg">{selectedHistoryQuestions.length}</strong> 題
                  </span>
                </div>
                <button 
                  onClick={handleAddHistoryQuestions}
                  disabled={selectedHistoryQuestions.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                >
                  <PlusCircle className="w-5 h-5" />
                  加入至當前測驗
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* 學生視角預覽彈窗 (Student Preview Modal) */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-3xl bg-slate-50 h-[90vh] rounded-[24px] overflow-hidden flex flex-col shadow-2xl"
            >
              {/* 彈窗頭部 */}
              <div className="bg-white p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <Eye className="w-5 h-5 text-indigo-500" />
                  <span>學生端視角預覽：{title || '未命名測驗'}</span>
                </div>
                <button 
                  onClick={() => setIsPreviewOpen(false)}
                  className="flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                  退出預覽
                </button>
              </div>

              {/* 彈窗主體 (Mock Student Interface) */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
                {questions.map((q: any, index: number) => (
                  <div key={q.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <p className="text-slate-800 font-medium mb-6 text-lg leading-relaxed">
                      <span className="text-slate-400 mr-2">{index + 1}.</span>
                      {q.content}
                    </p>
                    
                    {/* 客觀題渲染 */}
                    {q.options ? (
                      <div className="space-y-3 ml-6">
                        {q.options.map((opt: string, optIndex: number) => (
                          <label key={optIndex} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                            <input 
                              type="radio" 
                              name={`question-${q.id}`} 
                              className="w-5 h-5 text-indigo-600 border-slate-300 focus:ring-indigo-500 accent-indigo-600"
                            />
                            <span className="text-slate-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      /* 主觀題渲染 */
                      <div className="ml-6 relative">
                        <textarea 
                          placeholder="請在此輸入你的答案..."
                          className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                        <div className="absolute bottom-3 right-3 text-xs font-medium text-slate-400">
                          0 / 500 字
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 彈窗底部 */}
              <div className="bg-white p-6 border-t border-slate-100 shrink-0 flex justify-end">
                <button 
                  disabled
                  className="px-8 py-3 rounded-full text-sm font-bold text-white bg-indigo-600 opacity-50 cursor-not-allowed shadow-sm"
                >
                  提交試卷
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
