import { uiText } from '../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../components/icons';
import { ArrowRight, CopyPlus, PenTool } from 'lucide-react';
import { AssessmentWizard } from '../components/assessment/AssessmentWizard';
import { AssessmentLibrary } from '../components/assessment/AssessmentLibrary';
import { GradingWorkspaceHome } from '../components/assessment/GradingWorkspaceHome';
import { AssessmentQualityCard } from '../components/assessment/AssessmentQualityCard';
import { AnomalyAlertsOverview } from '../components/assessment/AnomalyAlertsOverview';
import { MyQuizzesView } from '../components/assessment/MyQuizzesView';
import { PublishedQuizDetailDrawer, type PublishedQuizSummary } from '../components/assessment/PublishedQuizDetailDrawer';
import { API_BASE } from '../utils/api';

type TopTab = 'overview' | 'quizzes' | 'library' | 'grading' | 'quality';
type QualitySubTab = 'performance' | 'alerts';

type AssessmentPageProps = {
  onNavigateToWorkshop?: () => void;
  initialView?: 'dashboard' | 'wizard';
  // Deep-link：由學習報告跳入，自動開指定測驗嘅 Drawer
  initialQuizId?: string | null;
  initialDrawerTab?: 'results' | 'quality';
  onQuizDeepLinkConsumed?: () => void;
};

const TOP_TABS: { key: TopTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview', label: '總覽', icon: Icons.dashboard },
  { key: 'quizzes', label: '我的測驗', icon: Icons.clipboardList },
  { key: 'library', label: '題庫', icon: Icons.task },
  { key: 'grading', label: '批改', icon: Icons.tasks },
  { key: 'quality', label: '質量分析', icon: Icons.report },
];

const QUICK_LINKS: {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  chipClass: string;
  iconClass: string;
  accent?: boolean;
  onClick: (handlers: {
    openWizard: () => void;
    goQuizzes: () => void;
    goLibrary: () => void;
    goGrading: () => void;
    goQuality: () => void;
    goWorkshop: () => void;
  }) => void;
}[] = [
  {
    key: 'create',
    label: '新建測驗',
    description: '建立 AI 評測並自動批改',
    icon: CopyPlus,
    accent: true,
    chipClass: 'bg-white/20',
    iconClass: 'text-white',
    onClick: (h) => h.openWizard(),
  },
  {
    key: 'quizzes',
    label: '我的測驗',
    description: '管理草稿與已發佈的測驗',
    icon: Icons.clipboardList,
    chipClass: 'bg-emerald-50 text-emerald-600',
    iconClass: 'text-emerald-600',
    onClick: (h) => h.goQuizzes(),
  },
  {
    key: 'library',
    label: '題庫',
    description: '查看並整理你的歷史題庫',
    icon: Icons.task,
    chipClass: 'bg-sky-50 text-sky-600',
    iconClass: 'text-sky-600',
    onClick: (h) => h.goLibrary(),
  },
  {
    key: 'grading',
    label: '批改',
    description: '確認 AI 評分與發布成績',
    icon: PenTool,
    chipClass: 'bg-rose-50 text-rose-600',
    iconClass: 'text-rose-600',
    onClick: (h) => h.goGrading(),
  },
  {
    key: 'quality',
    label: '質量分析',
    description: '檢視測驗質量與 AI 異常警示',
    icon: Icons.report,
    chipClass: 'bg-violet-50 text-violet-600',
    iconClass: 'text-violet-600',
    onClick: (h) => h.goQuality(),
  },
  {
    key: 'workshop',
    label: 'AI 工作坊',
    description: '管理 AI 夥伴角色',
    icon: Icons.bot,
    chipClass: 'bg-amber-50 text-amber-600',
    iconClass: 'text-amber-600',
    onClick: (h) => h.goWorkshop(),
  },
];

const QUALITY_SUB_TABS: { key: QualitySubTab; label: string }[] = [
  { key: 'performance', label: '題目表現' },
  { key: 'alerts', label: 'AI 異常警示' },
];

/** grading-summary 物件 → Drawer 所需 shape（缺漏欄位補 fallback） */
const toPublishedQuizSummary = (summary: any): PublishedQuizSummary => ({
  id: String(summary.id),
  title: String(summary.title || '未命名測驗'),
  questionCount: Number(summary.questionCount || 0),
  botId: String(summary.botId || ''),
  botName: String(summary.botName || '--'),
  botSubject: String(summary.subject || ''),
  publishedAt: summary.publishedAt || summary.date,
  gradingCompletedAt: summary.gradingCompletedAt,
  totalStudents: Number(summary.totalStudents || 0),
  submitted: Number(summary.submitted || 0),
  completed: Number(summary.completed || 0),
  pendingConfirm: Number(summary.pendingConfirm || 0),
  pendingGrading: Number(summary.pendingGrading || 0),
  averageScore: Number(summary.averageScore || 0),
  progress: Number(summary.totalStudents) > 0 ? Number(summary.submitted || 0) / Number(summary.totalStudents) : 0,
});

export const AssessmentPage: React.FC<AssessmentPageProps> = ({
  onNavigateToWorkshop,
  initialView = 'dashboard',
  initialQuizId = null,
  initialDrawerTab,
  onQuizDeepLinkConsumed,
}) => {
  const [topTab, setTopTab] = useState<TopTab>(initialQuizId ? 'quizzes' : 'overview');
  const [wizardOpen, setWizardOpen] = useState(initialView === 'wizard');
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [qualitySubTab, setQualitySubTab] = useState<QualitySubTab>('performance');
  const [quizzesSubTab, setQuizzesSubTab] = useState<'drafts' | 'published'>('published');
  // 質量分析入口開嘅已發佈測驗 Drawer（同 MyQuizzesView 嘅 Drawer 唔會同時開）
  const [qualityDrawerQuiz, setQualityDrawerQuiz] = useState<PublishedQuizSummary | null>(null);

  // 總覽 KPI 數據
  const [draftCount, setDraftCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [pendingResponses, setPendingResponses] = useState(0);
  const [bankQuestionCount, setBankQuestionCount] = useState(0);

  useEffect(() => {
    if (topTab !== 'overview') return;

    fetch(`${API_BASE}/api/quizzes/drafts`)
      .then((res) => res.json())
      .then((data) => setDraftCount(Array.isArray(data?.drafts) ? data.drafts.length : 0))
      .catch(() => setDraftCount(0));

    fetch(`${API_BASE}/api/quizzes/published`)
      .then((res) => res.json())
      .then((data) => setPublishedCount(Array.isArray(data?.quizzes) ? data.quizzes.length : 0))
      .catch(() => setPublishedCount(0));

    fetch(`${API_BASE}/api/teachers/me/grading-summary`)
      .then((res) => res.json())
      .then((data) => {
        const quizzes = Array.isArray(data?.quizzes) ? data.quizzes : [];
        setPendingResponses(quizzes.reduce((sum: number, quiz: any) => sum + Number(quiz.pendingGrading || 0) + Number(quiz.pendingConfirm || 0), 0));
      })
      .catch(() => setPendingResponses(0));

    fetch(`${API_BASE}/api/quizzes/question-banks`)
      .then((res) => res.json())
      .then((data) => {
        const banks = Array.isArray(data?.banks) ? data.banks : [];
        setBankQuestionCount(banks.reduce((sum: number, bank: any) => sum + Number(bank.questionCount || 0), 0));
      })
      .catch(() => setBankQuestionCount(0));
  }, [topTab]);

  const openWizard = () => {
    setSelectedDraftId(null);
    setWizardOpen(true);
  };

  const editDraft = (draftId: string) => {
    setSelectedDraftId(draftId);
    setWizardOpen(true);
  };

  if (wizardOpen) {
    return (
      <AssessmentWizard
        onBack={() => {
          setWizardOpen(false);
          setSelectedDraftId(null);
        }}
        draftId={selectedDraftId}
      />
    );
  }

  const kpiCards = [
    {
      key: 'published',
      label: '已發佈測驗',
      value: publishedCount,
      valueClass: 'text-indigo-600',
      onClick: () => {
        setQuizzesSubTab('published');
        setTopTab('quizzes');
      },
    },
    {
      key: 'pending',
      label: '待批改作答',
      value: pendingResponses,
      valueClass: 'text-rose-500',
      onClick: () => setTopTab('grading'),
    },
    {
      key: 'drafts',
      label: '草稿',
      value: draftCount,
      valueClass: 'text-amber-500',
      onClick: () => {
        setQuizzesSubTab('drafts');
        setTopTab('quizzes');
      },
    },
    {
      key: 'bank',
      label: '題庫題目',
      value: bankQuestionCount,
      valueClass: 'text-emerald-600',
      onClick: () => setTopTab('library'),
    },
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{uiText("智能評測")}</h1>
        <p className="text-slate-500">{uiText("運用 AI 技術快速生成測驗，並自動批改與分析學生表現。")}</p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-7 overflow-x-auto border-b border-slate-200 text-sm font-bold text-slate-400">
        {TOP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTopTab(tab.key)}
            className={`flex shrink-0 items-center gap-2 px-1 pb-4 transition ${topTab === tab.key ? 'border-b-2 border-indigo-600 text-indigo-600' : 'hover:text-slate-700'}`}
          >
            <tab.icon className="w-4 h-4" />
            {uiText(tab.label)}
          </button>
        ))}
      </div>

      {/* 總覽：KPI + 快速入口 */}
      {topTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <motion.button
                key={card.key}
                type="button"
                onClick={card.onClick}
                whileHover={{ y: -2 }}
                className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] text-left transition-shadow hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]"
              >
                <span className="text-xs font-bold text-slate-400">{uiText(card.label)}</span>
                <div className={`mt-2 text-3xl font-black ${card.valueClass}`}>{card.value}</div>
              </motion.button>
            ))}
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">{uiText("快速入口")}</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {QUICK_LINKS.map((link) => (
                <motion.button
                  key={link.key}
                  type="button"
                  whileHover={link.accent ? { y: -4 } : undefined}
                  whileTap={link.accent ? { scale: 0.97 } : undefined}
                  onClick={() =>
                    link.onClick({
                      openWizard,
                      goQuizzes: () => setTopTab('quizzes'),
                      goLibrary: () => setTopTab('library'),
                      goGrading: () => setTopTab('grading'),
                      goQuality: () => setTopTab('quality'),
                      goWorkshop: () => onNavigateToWorkshop?.(),
                    })
                  }
                  className={`group relative flex min-h-[140px] items-center gap-5 overflow-hidden rounded-[28px] border p-6 text-left ${
                    link.accent
                      ? 'border-[#4C71E0] bg-[#5681FF] shadow-[0_14px_32px_rgba(86,129,255,0.45)] transition-shadow hover:shadow-[0_24px_48px_-12px_rgba(86,129,255,0.65)]'
                      : 'border-slate-100 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-xl'
                  }`}
                >
                  <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${link.chipClass}`}>
                    <link.icon className={`h-7 w-7 ${link.iconClass}`} />
                  </span>
                  <span className="relative min-w-0">
                    <span className={`block text-lg font-black ${link.accent ? 'text-white' : 'text-slate-900'}`}>{uiText(link.label)}</span>
                    <span className={`mt-1 block text-sm ${link.accent ? 'text-white/85' : 'text-slate-500'}`}>{uiText(link.description)}</span>
                  </span>
                  <ArrowRight className={`relative ml-auto h-5 w-5 shrink-0 transition group-hover:translate-x-1 ${link.accent ? 'text-white/70 group-hover:text-white' : 'text-slate-300 group-hover:text-indigo-500'}`} />
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 我的測驗 */}
      {topTab === 'quizzes' && (
        <MyQuizzesView
          initialSubTab={quizzesSubTab}
          onEditDraft={editDraft}
          initialQuizId={initialQuizId}
          initialDrawerTab={initialDrawerTab}
          onDeepLinkConsumed={onQuizDeepLinkConsumed}
        />
      )}

      {/* 題庫 */}
      {topTab === 'library' && <AssessmentLibrary onBack={() => setTopTab('overview')} />}

      {/* 批改 */}
      {topTab === 'grading' && <GradingWorkspaceHome onBack={() => setTopTab('overview')} onGoToWorkshop={onNavigateToWorkshop} />}

      {/* 質量分析 */}
      {topTab === 'quality' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {QUALITY_SUB_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setQualitySubTab(tab.key)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 ${
                  qualitySubTab === tab.key
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {uiText(tab.label)}
              </button>
            ))}
          </div>
          {qualitySubTab === 'performance' ? (
            <AssessmentQualityCard onOpenQuizAlerts={(summary) => setQualityDrawerQuiz(toPublishedQuizSummary(summary))} />
          ) : (
            <AnomalyAlertsOverview onOpenQuiz={(summary) => setQualityDrawerQuiz(toPublishedQuizSummary(summary))} />
          )}
        </div>
      )}

      {/* 質量分析入口共用嘅已發佈測驗 Drawer（alerts 模式：純警示視圖，無 tab bar） */}
      <PublishedQuizDetailDrawer
        open={Boolean(qualityDrawerQuiz)}
        quiz={qualityDrawerQuiz}
        onClose={() => setQualityDrawerQuiz(null)}
        onDuplicated={() => {
          setQualityDrawerQuiz(null);
          setQuizzesSubTab('drafts');
          setTopTab('quizzes');
        }}
        initialTab="quality"
        mode="alerts"
      />
    </div>
  );
};
