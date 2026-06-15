import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { Target, ArrowLeft, ChevronRight, AlertCircle, BookOpen, CheckCircle2, Sparkles, X, BarChart3, ChevronDown } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { readAuthSession } from '../../utils/auth';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { API_BASE } from '../../utils/api';
import { parsePromptSource } from '../../utils/chat-prompt';

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

type AssessmentRow = (typeof classAssessmentRows)[number] & {
  studentId?: string;
  outputLevel?: number;
  interactionCode?: string;
  interactionText?: string;
  interactionDepth?: number;
  activeInputCount?: number;
  assistedInputCount?: number;
  directInputCount?: number;
  voiceInputCount?: number;
  guidedInputCount?: number;
  directInputChars?: number;
  activeInputRate?: number;
  assistedInputRate?: number;
};

type AssessmentCounts = {
  all: number;
  warning: number;
  knowledge: number;
  normal: number;
};

type SharedBotOption = {
  id: string;
  name: string;
  avatarUrl?: string;
  knowledgeBase?: string;
};

type KnowledgePoint = {
  label: string;
  score: number;
  completed: boolean;
};

type InteractionPoint = {
  name: string;
  x: number;
  y: number;
  status: string;
};

const getMasteryTone = (mastery: number) => {
  if (mastery >= 90) return { label: '已掌握', color: 'emerald', bar: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-100' };
  if (mastery >= 70) return { label: '接近掌握', color: 'blue', bar: 'bg-blue-500', soft: 'bg-blue-50 text-blue-700', ring: 'ring-blue-100' };
  if (mastery >= 40) return { label: '進行中', color: 'amber', bar: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700', ring: 'ring-amber-100' };
  return { label: '需要加強', color: 'rose', bar: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700', ring: 'ring-rose-100' };
};

const trackingToneConfig = {
  green: {
    dot: 'bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]',
    badge: 'bg-emerald-50 text-emerald-700',
    border: 'border-emerald-100',
    fill: 'from-emerald-500 to-emerald-400',
  },
  blue: {
    dot: 'bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]',
    badge: 'bg-indigo-50 text-indigo-700',
    border: 'border-indigo-100',
    fill: 'from-indigo-500 to-sky-400',
  },
} as const;

const radarData = [
  { subject: '記憶', A: 90, fullMark: 100 },
  { subject: '理解', A: 85, fullMark: 100 },
  { subject: '應用', A: 80, fullMark: 100 },
  { subject: '分析', A: 30, fullMark: 100 },
  { subject: '評價', A: 40, fullMark: 100 },
  { subject: '創造', A: 50, fullMark: 100 },
];

export const StudentLearningReportCard = () => {
  const currentRole = readAuthSession()?.user?.role;
  const canViewClassAssessmentDetail = currentRole === 'teacher' || currentRole === 'admin';
  const [viewLevel, setViewLevel] = useState<'overview' | 'report'>('overview');
  const [isClassDetailOpen, setIsClassDetailOpen] = useState(false);
  const [detailFilter, setDetailFilter] = useState<'all' | 'warning' | 'knowledge' | 'normal'>('all');
  const [selectedDetailStudent, setSelectedDetailStudent] = useState<any | null>(null);
  const [isRankingOpen, setIsRankingOpen] = useState(false);
  const [assessmentRows, setAssessmentRows] = useState<AssessmentRow[]>(classAssessmentRows);
  const [sharedBots, setSharedBots] = useState<SharedBotOption[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [interactionSummary, setInteractionSummary] = useState<{
    independentRate: number;
    assistedRate: number;
    averageFreeInputLength: number;
    averageBubbleDependency: number;
    points: InteractionPoint[];
  }>({
    independentRate: 45,
    assistedRate: 55,
    averageFreeInputLength: 21,
    averageBubbleDependency: 2.1,
    points: [],
  });
  const [assessmentCounts, setAssessmentCounts] = useState<AssessmentCounts>({
    all: classAssessmentRows.length,
    warning: classAssessmentRows.filter((row) => row.status === 'warning').length,
    knowledge: classAssessmentRows.filter((row) => row.status === 'knowledge').length,
    normal: classAssessmentRows.filter((row) => row.status === 'normal').length,
  });
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');
  const [rankingPriority, setRankingPriority] = useState<'active' | 'passive'>('active');
  const [assessmentSortDirection, setAssessmentSortDirection] = useState<'desc' | 'asc'>('desc');
  useBodyScrollLock(isClassDetailOpen || isRankingOpen);

  const filteredAssessmentRows = assessmentRows.filter((row) => detailFilter === 'all' || row.status === detailFilter);
  const sortedAssessmentRows = [...filteredAssessmentRows].sort((a, b) => {
    const aMastery = Number(a.mastery ?? 0);
    const bMastery = Number(b.mastery ?? 0);
    return assessmentSortDirection === 'desc' ? bMastery - aMastery : aMastery - bMastery;
  });
  const rankingRows = [...assessmentRows]
    .filter((row) => typeof row.mastery === 'number')
    .sort((a, b) => {
      const aActive = Number(a.activeInputRate ?? 0);
      const bActive = Number(b.activeInputRate ?? 0);
      const aAssisted = Number(a.assistedInputRate ?? 0);
      const bAssisted = Number(b.assistedInputRate ?? 0);
      return rankingPriority === 'active' ? bActive - aActive : bAssisted - aAssisted;
    });
  const selectedBot = useMemo(
    () => sharedBots.find((bot) => bot.id === selectedBotId) || sharedBots[0] || null,
    [sharedBots, selectedBotId]
  );
  const selectedBotKnowledge = useMemo(() => {
    const parsed = parsePromptSource({
      roleName: selectedBot?.name,
      knowledgeBase: selectedBot?.knowledgeBase || '',
    });
    const basicPoints = parsed.knowledgePoints.filter((item) => item.tier === 'basic_fact');
    const deepPoints = parsed.knowledgePoints.filter((item) => item.tier === 'deep_understanding');
    const backgroundSummary = parsed.characterBackground || parsed.knowledgeSummary || '目前尚未提供角色知識庫摘要。';
    const buildItem = (
      level: string,
      state: string,
      note: string,
      title: string,
      tone: keyof typeof trackingToneConfig,
      width: number
    ) => ({ level, state, note, title, tone, width });
    const outputRank: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
    const currentRank = outputRank[selectedDetailStudent?.output || 'L0'] ?? 0;
    const studentMastery = Number(selectedDetailStudent?.mastery || 0);
    const resolveStudentProgress = (levelRank: number) => {
      const gap = Math.max(0, currentRank - levelRank);
      const ahead = Math.max(0, levelRank - currentRank);
      let width = 0;
      if (gap > 0) {
        width = studentMastery + gap * 8;
      } else if (ahead === 0) {
        width = studentMastery - (levelRank === 3 ? 8 : 0);
      } else {
        const baseFactor = levelRank === 1 ? 0.78 : levelRank === 2 ? 0.62 : 0.38;
        width = studentMastery * baseFactor;
      }
      return Math.max(8, Math.min(100, Math.round(width)));
    };
    const resolveState = (width: number) => {
      if (width >= 95) return '已掌握';
      if (width >= 70) return '接近掌握';
      if (width >= 40) return '進行中';
      return '待加強';
    };
    const summary = [
      basicPoints[0]
        ? (() => {
            const width = resolveStudentProgress(1);
            return buildItem('L1 基礎事實', resolveState(width), basicPoints[0].assessmentCriteria || '可直接回憶基本資料', basicPoints[0].title, 'green', width);
          })()
        : buildItem('L1 基礎事實', '待加強', '請在角色知識庫中補充知識點分級', '目前尚未偵測到可用的基礎事實知識點', 'green', 12),
      deepPoints[0]
        ? (() => {
            const width = resolveStudentProgress(2);
            return buildItem('L2 理解關聯', resolveState(width), deepPoints[0].assessmentCriteria || '能把事實串成因果', deepPoints[0].title, 'green', width);
          })()
        : buildItem('L2 理解關聯', '待加強', '請在角色知識庫中補充知識點分級', '目前尚未偵測到可用的理解關聯知識點', 'green', 12),
      deepPoints[1]
        ? (() => {
            const width = resolveStudentProgress(3);
            return buildItem('L3 深度遷移', resolveState(width), deepPoints[1].assessmentCriteria || '已能跨段落建立關聯', deepPoints[1].title, 'blue', width);
          })()
        : buildItem('L3 深度遷移', '待加強', '請在角色知識庫中補充知識點分級', '目前尚未偵測到可用的深度遷移知識點', 'blue', 12),
    ];
    return { roleName: parsed.roleName || selectedBot?.name || '共享 Bot', backgroundSummary, basicPoints, deepPoints, summary };
  }, [selectedBot, selectedDetailStudent?.output, selectedDetailStudent?.mastery]);
  const selectedStudentLevel = selectedDetailStudent?.output || 'L0';
  const selectedStudentMastery = Number(selectedDetailStudent?.mastery || 0);
  const getStudentLevelWidth = (level: 'L1 基礎事實' | 'L2 理解關聯' | 'L3 深度遷移') => {
    const outputRank: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
    const currentRank = outputRank[selectedStudentLevel] ?? 0;
    if (level === 'L1 基礎事實') {
      if (currentRank >= 1) return Math.min(100, Math.max(18, selectedStudentMastery + 18));
      return Math.max(12, Math.min(55, Math.round(selectedStudentMastery * 0.7)));
    }
    if (level === 'L2 理解關聯') {
      if (currentRank >= 2) return Math.min(100, Math.max(22, selectedStudentMastery + 8));
      return Math.max(12, Math.min(70, Math.round(selectedStudentMastery * 0.8)));
    }
    if (currentRank >= 3) return Math.min(100, Math.max(28, selectedStudentMastery + 2));
    return Math.max(12, Math.min(72, Math.round(selectedStudentMastery * 0.55)));
  };
  const inputRate = interactionSummary.independentRate || 0;
  const assistedRate = interactionSummary.assistedRate || 0;
  const aiModeInsight = (() => {
    if (inputRate === 0 && assistedRate === 0) {
      return '本堂課目前尚未開始互動，班級還沒有累積足夠的輸入記錄，等學生開始回應後，這裡會依實際占比自動更新。';
    }
    if (inputRate > assistedRate) {
      return '本堂課整體互動偏向主動輸入。學生以直接回應為主，表示當前知識點能促使學生自行輸出，可適度提高挑戰度。';
    }
    if (inputRate < assistedRate) {
      return '本堂課整體互動偏向系統引導。學生較常依賴提示或引導回覆，表示當前知識點仍需要更多支架支持，建議先降低門檻，再逐步提高挑戰度。';
    }
    return '本堂課整體互動剛好平衡。學生直接回應與系統引導各佔一半，表示當前知識點能同時支撐自主輸出與適度提示，適合維持目前難度並觀察後續走向。';
  })();
  const topicNodes = knowledgePoints.length
    ? knowledgePoints
    : [
        { label: '知識點', score: 0, completed: false },
      ];
  const botAvatarFallback = 'https://api.dicebear.com/9.x/bottts/svg?seed=Chopreality';

  useEffect(() => {
    if (!canViewClassAssessmentDetail) return;
    let cancelled = false;
    setAssessmentLoading(true);
    setAssessmentError('');
    setSharedBots([]);
    setAssessmentRows(classAssessmentRows);
    const query = selectedBotId ? `?botId=${encodeURIComponent(selectedBotId)}` : '';
    fetch(`${API_BASE}/api/bots/teacher/assessment-report${query}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to load assessment report');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.sharedBots)) {
          const nextSharedBots = data.sharedBots.map((bot: any) => ({
            id: String(bot.id || ''),
            name: String(bot.name || 'AI Bot'),
            avatarUrl: bot.avatarUrl || bot.avatar_url || '',
            knowledgeBase: bot.knowledgeBase || bot.knowledge_base || '',
          })).filter((bot: SharedBotOption) => Boolean(bot.id));
          setSharedBots(nextSharedBots);
          if (!selectedBotId && data.sharedBots[0]?.id) {
            setSelectedBotId(String(data.sharedBots[0].id));
          }
        }
        if (data?.selectedBotId && !selectedBotId) {
          setSelectedBotId(String(data.selectedBotId));
        }
        if (Array.isArray(data?.rows)) {
          setAssessmentRows(data.rows);
        }
        if (data?.counts) {
          setAssessmentCounts({
            all: Number(data.counts.all || 0),
            warning: Number(data.counts.warning || 0),
            knowledge: Number(data.counts.knowledge || 0),
            normal: Number(data.counts.normal || 0),
          });
        }
        if (Array.isArray(data?.knowledgePoints)) {
          setKnowledgePoints(data.knowledgePoints);
        }
        if (data?.interactionSummary) {
          setInteractionSummary({
            independentRate: Number(data.interactionSummary.independentRate || 0),
            assistedRate: Number(data.interactionSummary.assistedRate || 0),
            averageFreeInputLength: Number(data.interactionSummary.averageFreeInputLength || 0),
            averageBubbleDependency: Number(data.interactionSummary.averageBubbleDependency || 0),
            points: Array.isArray(data.interactionSummary.points) ? data.interactionSummary.points : [],
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setAssessmentError(error instanceof Error ? error.message : 'Failed to load assessment report');
      })
      .finally(() => {
        if (!cancelled) setAssessmentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canViewClassAssessmentDetail, selectedBotId]);

  const openClassDetail = () => {
    if (!canViewClassAssessmentDetail) return;
    setSelectedDetailStudent(null);
    setIsClassDetailOpen(true);
  };

  const toggleRankingPriority = () => {
    setRankingPriority((current) => (current === 'active' ? 'passive' : 'active'));
  };

  const toggleAssessmentSort = () => {
    setAssessmentSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
  };

  const openBotReport = (botId: string) => {
    setSelectedBotId(botId);
    setViewLevel('report');
  };

  return (
    <motion.div 
      className="bg-white p-3.5 md:p-4 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col border border-slate-100 overflow-hidden"
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
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="flex items-center shrink-0 text-sm font-bold text-[#1E293B] md:text-base">
                <Target className="w-5 h-5 mr-2 text-indigo-500" />
                能力追蹤報告
              </h3>
            </div>
            <div className="space-y-2 flex-1">
              {sharedBots.length ? sharedBots.map((bot, index) => {
                const summaryRow = assessmentRows[index] || assessmentRows[0];
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => openBotReport(bot.id)}
                    className="flex min-h-[92px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-[0_2px_5px_rgba(15,23,42,0.04)] transition hover:border-indigo-200 hover:shadow-[0_18px_40px_rgba(79,70,229,0.10)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-indigo-50 text-indigo-600">
                        <img
                          src={bot.avatarUrl || botAvatarFallback}
                          alt={bot.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-black text-slate-900">{bot.name}</h4>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          上次測驗: 2023-10-25 · 平均 {summaryRow?.mastery ?? 0} 分
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] font-black text-rose-600 sm:inline-flex">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        薄弱點: {summaryRow?.outputText || '分析'}
                      </span>
                      <span className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-600">
                        查看報告
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                  目前沒有可顯示的共享 bot。
                </div>
              )}
            </div>
          </motion.div>
        )}

        {viewLevel === 'report' && (
          <motion.div
            key="report"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <button 
                onClick={() => setViewLevel('overview')}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors sm:text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </button>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-indigo-50">
                  <img
                    src={selectedBot?.avatarUrl || botAvatarFallback}
                    alt={selectedBot?.name || '共享 Bot'}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-black text-slate-600 sm:text-[11px]">
                  {selectedBot?.name || '共享 Bot'}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">班級思維自主指數</h4>
                  </div>
                </div>
                <div className="mt-3.5 h-3 w-full rounded-full bg-slate-200">
                  <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${inputRate}%` }} />
                </div>
                <div className="mt-2.5 flex flex-col gap-1 text-[11px] font-black sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-emerald-700">主動輸入 (Independent): {inputRate}%</span>
                  <span className="text-slate-500">系統引導 (Assisted): {assistedRate}%</span>
                </div>
                <button type="button" onClick={() => setIsRankingOpen(true)} className="mt-3 flex w-full items-center justify-center rounded-2xl bg-slate-50 px-4 py-2.5 text-center text-[11px] font-black text-slate-700">
                  學生排行榜 <ChevronRight className="ml-2 inline h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">班級知識覆蓋地圖</h4>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">展示全班各知識點的集體解鎖進度</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {topicNodes.map((item) => (
                    <div key={item.label} className="flex flex-col items-center rounded-2xl border border-transparent p-1 text-center">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-black ${item.completed ? 'bg-indigo-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                        {item.completed ? '✓' : '!'}
                      </div>
                      <div className="mt-2 text-[10px] font-black text-slate-700">{item.label}</div>
                      <div className="mt-1 text-xs font-black text-indigo-500">{item.score}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <Target className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">學習狀態分佈矩陣</h4>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
                  <div className="relative">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[11px] font-black text-slate-400">
                      總掌握度 (0-100%)
                    </div>
                  </div>
                  <div>
                    <div className="rounded-2xl border-2 border-dashed border-slate-100 bg-white p-2">
                      <div className="relative h-[240px] overflow-hidden rounded-[16px] border border-slate-100 bg-white pt-8 pr-3 pb-8 pl-8">
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                          <div className="bg-white" />
                          <div className="bg-emerald-50/35" />
                          <div className="bg-white" />
                          <div className="bg-rose-50/35" />
                        </div>
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0,transparent_49.8%,rgba(203,213,225,0.7)_49.8%,rgba(203,213,225,0.7)_50.2%,transparent_50.2%),linear-gradient(to_bottom,transparent_0,transparent_49.8%,rgba(203,213,225,0.7)_49.8%,rgba(203,213,225,0.7)_50.2%,transparent_50.2%)]" />
                        <div className="absolute left-2 top-2 z-10 text-[11px] font-black text-slate-400">高效學握區</div>
                        <div className="absolute right-2 top-2 z-10 text-[11px] font-black text-emerald-500">知識溢出</div>
                        <div className="absolute left-2 bottom-2 z-10 text-[11px] font-black text-slate-400">基礎/淺層參與區</div>
                        <div className="absolute right-2 bottom-2 z-10 text-[11px] font-black text-rose-400">無效卡關</div>
                        <div className="absolute inset-x-4 top-1/2 z-0 h-px -translate-y-1/2 bg-slate-200/90" />
                        <div className="absolute inset-y-4 left-1/2 z-0 w-px -translate-x-1/2 bg-slate-200/90" />
                        <div className="absolute left-8 top-8 bottom-8 right-3">
                          {interactionSummary.points.map((point) => {
                            const left = Math.min(94, Math.max(6, point.x));
                            const top = Math.min(94, Math.max(6, point.y));
                            const quadrantColor =
                              point.status === 'knowledge'
                                ? 'bg-emerald-500 border-emerald-200'
                                : point.status === 'warning'
                                  ? 'bg-rose-500 border-rose-200'
                                  : 'bg-slate-400 border-slate-200';
                            return (
                              <div
                                key={`${point.name}-${point.x}-${point.y}`}
                                title={point.name}
                                className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] ${quadrantColor}`}
                                style={{ left: `${left}%`, top: `${100 - top}%` }}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between px-2 text-[11px] font-black text-slate-400">
                        <span>低輪次</span>
                        <span className="text-slate-500">互動輪次</span>
                        <span>高輪次</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={openClassDetail}
                  className="mt-3.5 flex w-full items-center justify-center rounded-2xl bg-slate-50 px-4 py-2.5 text-center text-[11px] font-black text-slate-700"
                >
                  查看全班評估明細 <ChevronRight className="ml-2 inline h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRankingOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-slate-950/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="absolute inset-3 overflow-hidden rounded-[24px] bg-white shadow-2xl md:inset-8 lg:inset-12"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
                  <h2 className="text-sm font-black tracking-tight text-slate-900 sm:text-base">互動模式深度分析</h2>
                  <button
                    type="button"
                    onClick={() => setIsRankingOpen(false)}
                    className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <Sparkles className="h-4.5 w-4.5" />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 sm:text-base">AI 模式洞察</h3>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
                      <p className="text-[13px] font-semibold leading-relaxed text-slate-700 sm:text-sm">
                        {aiModeInsight}
                      </p>
                    </div>

                    <div className="mt-4 sm:mt-5">
                      <h4 className="mb-2 text-sm font-black text-slate-900 sm:text-sm">主動輸入/引導依賴佔比</h4>
                      <div className="relative h-6 w-full overflow-hidden rounded-full bg-slate-200">
                        {inputRate > 0 ? (
                          <div
                            className="flex h-full items-center justify-start whitespace-nowrap bg-emerald-500 px-2.5 text-[11px] font-black text-white sm:text-xs"
                            style={{ width: `${Math.max(0, Math.min(100, inputRate))}%` }}
                          >
                            {inputRate}%
                          </div>
                        ) : null}
                        {assistedRate > 0 ? (
                          <div
                            className="absolute inset-y-0 right-0 flex h-full items-center justify-end whitespace-nowrap bg-slate-200 px-2.5 text-[11px] font-black text-slate-500 sm:text-xs"
                            style={{ width: `${Math.max(0, Math.min(100, assistedRate))}%` }}
                          >
                            {assistedRate}%
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] font-black sm:text-xs">
                        <span className="text-emerald-700">主動輸入</span>
                        <span className="text-slate-500">系統引導</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-3.5">
                        <p className="text-[11px] font-black text-slate-500 sm:text-xs">平均自由輸入長度</p>
                        <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{interactionSummary.averageFreeInputLength || 0} <span className="text-xs font-bold text-slate-400 sm:text-sm">字</span></p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-3.5">
                        <p className="text-[11px] font-black text-slate-500 sm:text-xs">平均氣泡依賴次數</p>
                        <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{interactionSummary.averageBubbleDependency.toFixed(1)} <span className="text-xs font-bold text-slate-400 sm:text-sm">次/人</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
                      <h3 className="text-sm font-black text-slate-900 sm:text-base">主動輸入/引導依賴佔比排行榜</h3>
                      <button
                        type="button"
                        onClick={toggleRankingPriority}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black transition sm:px-3 sm:py-1.5 sm:text-[11px] ${
                          rankingPriority === 'active'
                            ? 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900'
                        }`}
                      >
                        <span className="text-[12px] leading-none sm:text-[13px]">☰</span>
                        {rankingPriority === 'active' ? '主動優先' : '被動優先'}
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {rankingRows.map((row, index) => {
                        const activeRate = Math.max(0, Math.min(100, Math.round(row.activeInputRate ?? 0)));
                        const assistedRate = Math.max(0, Math.min(100, Math.round(row.assistedInputRate ?? 0)));
                        const displayRate = rankingPriority === 'active' ? activeRate : assistedRate;
                        const modeLabel = rankingPriority === 'active' ? '輸入' : '依賴';
                        return (
                          <div
                            key={`${row.id}-${row.studentId || row.name}`}
                            className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5"
                          >
                            <div className="min-w-0 text-sm font-bold text-slate-700 sm:text-sm">
                              <span className="truncate block">{row.name}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full ${rankingPriority === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  style={{ width: `${displayRate}%` }}
                                />
                              </div>
                            </div>
                            <div className={`shrink-0 text-right text-[11px] font-bold sm:text-xs ${rankingPriority === 'active' ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {displayRate}% {modeLabel}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

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
              className="absolute inset-2 overflow-hidden rounded-[24px] bg-white shadow-2xl sm:inset-3 sm:rounded-[28px] md:inset-6"
            >
              <div className="relative h-full">
                <div className={`h-full min-w-0 overflow-y-auto transition duration-300 ${
                  selectedDetailStudent ? 'pointer-events-none blur-[0.5px] brightness-95' : ''
                }`}>
                  <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3.5 backdrop-blur sm:px-5 sm:py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="text-sm font-black tracking-tight text-slate-900 sm:text-base">全班評估明細表</h2>
                        <p className="mt-1 text-[11px] font-medium text-slate-500 sm:text-xs">深度檢視學生的知識點交互狀態與品質</p>
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

                  <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
                    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4 lg:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-black text-slate-800 sm:text-sm">
                          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                          輸出品質評級說明
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-500 sm:text-xs">依學生與 Bot 的聊天內容和角色知識庫匹配結果評估。</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['L0: 偏離主題', 'L1: 基礎事實', 'L2: 事實關聯', 'L3: 深度理解'].map((item) => (
                            <span key={item} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 sm:text-[11px]">{item}</span>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-800 sm:text-sm">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                          互動深度說明
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-500 sm:text-xs">反映學生在本次學習中主動探索與持續參與的程度。</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['Y1: 初步參與', 'Y2: 持續互動', 'Y3: 深入探索', 'Y4: 高度投入'].map((item) => (
                            <span key={item} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 sm:text-[11px]">{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                      {[
                        { key: 'all', label: `全部學生 (${assessmentCounts.all})` },
                        { key: 'warning', label: `卡關預警 (${assessmentCounts.warning})` },
                        { key: 'knowledge', label: `知識溢出 (${assessmentCounts.knowledge})` },
                        { key: 'normal', label: `正常探索 (${assessmentCounts.normal})` },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setDetailFilter(item.key as any)}
                          className={`rounded-xl border px-3 py-2.5 text-[11px] font-black transition sm:px-4 sm:py-2.5 sm:text-xs ${
                            detailFilter === item.key
                              ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {(assessmentLoading || assessmentError) && (
                      <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                        assessmentError
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-indigo-100 bg-indigo-50 text-indigo-700'
                      }`}>
                        {assessmentError ? `使用示例資料顯示：${assessmentError}` : '正在同步學生聊天與知識庫分析...'}
                      </div>
                    )}

                    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                      <div className="hidden grid-cols-[1.2fr_0.75fr_1fr_1.05fr_0.95fr_0.9fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] font-black text-slate-500 md:grid">
                        <span>學生</span>
                        <button
                          type="button"
                          onClick={toggleAssessmentSort}
                          className="flex items-center gap-1 text-left transition hover:text-slate-900"
                        >
                          <span>總掌握度</span>
                          <span>{assessmentSortDirection === 'desc' ? '▼' : '▲'}</span>
                        </button>
                        <span>輸出品質</span>
                        <span>互動深度</span>
                        <span>參與模式</span>
                        <span>狀態</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {sortedAssessmentRows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelectedDetailStudent(row)}
                            className="grid w-full grid-cols-2 items-start gap-3 px-4 py-3 text-left transition hover:bg-indigo-50/40 md:grid-cols-[1.2fr_0.75fr_1fr_1.05fr_0.95fr_0.9fr] md:items-center md:gap-3 md:px-4 md:py-3.5"
                          >
                            <span className="col-span-2 flex items-center gap-3 md:col-span-1">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-black text-indigo-600">{row.id}</span>
                              <span className="text-sm font-bold text-slate-800 sm:text-[15px]">{row.name}</span>
                            </span>
                            <span className="text-sm font-black text-slate-800 md:text-sm"><span className="mr-1 text-[10px] text-slate-400 md:hidden">掌握</span>{row.mastery}%</span>
                            <span className="text-[11px] font-semibold text-slate-700 sm:text-xs"><b className="mr-2 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">{row.output}</b>{row.outputText}</span>
                            <span className="text-[11px] font-semibold text-slate-700 sm:text-xs">{row.interaction}<br /><small className="font-medium text-slate-400">({row.rounds}輪{typeof row.interactionDepth === 'number' ? ` · ${row.interactionDepth}` : ''})</small></span>
                            <span className="w-fit rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{row.mode}</span>
                            <span className={`text-[11px] font-black sm:text-xs ${row.status === 'warning' ? 'text-rose-600' : row.status === 'knowledge' ? 'text-emerald-600' : 'text-slate-500'}`}>{row.statusText}</span>
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
                      className="absolute inset-y-0 right-0 z-20 w-full overflow-y-auto border-l border-slate-100 bg-white shadow-[-18px_0_40px_rgba(15,23,42,0.18)] sm:w-[460px]"
                    >
                      {(() => {
                        const mastery = Number(selectedDetailStudent.mastery || 0);
                        const tone = getMasteryTone(mastery);
                        return (
                          <>
                            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-4 sm:px-5 sm:py-5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="truncate text-xs font-black text-slate-900 sm:text-sm">{selectedDetailStudent.name} — 知識掌握追蹤</h3>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${tone.soft}`}>{tone.label}</span>
                                </div>
                                <p className="mt-1 text-[10px] font-semibold text-slate-500 sm:text-[11px]">總掌握度 {mastery}%</p>
                              </div>
                              <button type="button" onClick={() => setSelectedDetailStudent(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                <X className="h-4.5 w-4.5" />
                              </button>
                            </div>
                            <div className="space-y-4 px-4 py-4 sm:space-y-4.5 sm:px-5 sm:py-5">
                              <div className={`rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm ring-1 ${tone.ring}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[11px] font-black text-slate-500">整體狀態</p>
                                    <p className="mt-1 text-sm font-bold text-slate-900">{selectedDetailStudent.output} · {selectedDetailStudent.outputText}</p>
                                  </div>
                                  <div className={`rounded-2xl px-3 py-2 text-right ${tone.soft}`}>
                                    <div className="text-[10px] font-black uppercase tracking-wide">掌握度</div>
                                    <div className="text-lg font-black leading-none">{mastery}%</div>
                                  </div>
                                </div>
                                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200">
                                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${mastery}%` }} />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 shadow-sm">互動 {selectedDetailStudent.interaction}</span>
                                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 shadow-sm">{selectedDetailStudent.rounds} 輪對話</span>
                                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 shadow-sm">{selectedDetailStudent.mode}</span>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="text-[11px] font-black text-slate-900">知識掌握分層</h4>
                                    <p className="mt-1 text-[10px] font-medium text-slate-500">依據目前角色「{selectedBotKnowledge.roleName}」的知識庫內容自動整理。</p>
                                  </div>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 shadow-sm">L1 → L3</span>
                                </div>
                                <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{selectedBotKnowledge.backgroundSummary}</p>
                              </div>

                              {selectedBotKnowledge.summary.map((item) => (
                                <div key={item.level} className={`rounded-2xl border bg-white p-4 shadow-sm ${trackingToneConfig[item.tone].border}`}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <h4 className="text-[11px] font-black text-slate-900">【{item.level}】</h4>
                                      <p className="mt-1 text-[10px] font-medium text-slate-500">{item.note}</p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${trackingToneConfig[item.tone].badge}`}>
                                      {item.state}
                                    </span>
                                  </div>
                                  <div className="mt-3 flex items-start gap-2.5">
                                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${trackingToneConfig[item.tone].dot}`} />
                                    <div>
                                      <p className="text-[11px] font-bold text-slate-800">
                                        {item.title}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div className={`h-full rounded-full bg-gradient-to-r ${trackingToneConfig[item.tone].fill}`} style={{ width: `${getStudentLevelWidth(item.level as 'L1 基礎事實' | 'L2 理解關聯' | 'L3 深度遷移')}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
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
