import { uiText } from '../utils/uiI18n';
import React, { useState } from 'react';
import { Icons } from '../components/icons';
import { ArrowRight } from 'lucide-react';
import { StudentLearningReportCard } from '../components/dashboard/StudentLearningReportCard';
import { FlaggedChatSummaryCard } from '../components/dashboard/FlaggedChatSummaryCard';
import { AbilityTrackingReport, type ReportPeriod } from '../components/dashboard/AbilityTrackingReport';
import { AssessmentQualityList } from '../components/assessment/AssessmentQualityList';
import { TeacherProgressOverview } from '../components/dashboard/TeacherProgressOverview';

type LearningTab = 'overview' | 'participation' | 'ability' | 'chat' | 'quality';

type LearningReportPageProps = {
  onOpenQuizQuality: (quizId: string) => void;
  onCreateQuiz: () => void;
};

const TOP_TABS: { key: LearningTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview', label: '總覽', icon: Icons.dashboard },
  { key: 'participation', label: '課堂參與', icon: Icons.classes },
  { key: 'ability', label: '學生能力', icon: Icons.brain },
  { key: 'chat', label: '對話紀錄', icon: Icons.messageSquareWarning },
  { key: 'quality', label: '測驗質量', icon: Icons.report },
];

/** 頁面層級時間範圍（規格：30／90／全期），一個選擇器控制成頁 */
const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: '30d', label: '過去一個月' },
  { key: '90d', label: '過去三個月' },
  { key: 'all', label: '全期' },
];

export const LearningReportPage: React.FC<LearningReportPageProps> = ({ onOpenQuizQuality, onCreateQuiz }) => {
  const [tab, setTab] = useState<LearningTab>('overview');
  const [period, setPeriod] = useState<ReportPeriod>('30d');

  // 快速入口卡：跟智能評測頁 QUICK_LINKS 嘅樣式。四張卡排 2×2，冇 accent 卡。
  // 唔放 KPI 卡——已發佈測驗／待批改／已完成批改喺智能評測頁已有，異常紀錄亦有 Sidebar 紅點。
  // 「新建測驗」入口唔喺呢頁重複（Dashboard 同智能評測頁已有）。
  const quickLinks: {
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    chipClass: string;
    iconClass: string;
    onClick: () => void;
  }[] = [
    {
      key: 'participation',
      label: '課堂參與',
      description: '了解每班的課堂參與情況',
      icon: Icons.classes,
      chipClass: 'bg-sky-50',
      iconClass: 'text-sky-600',
      onClick: () => setTab('participation'),
    },
    {
      key: 'ability',
      label: '學生能力',
      description: '能力追蹤、Bloom 六層級與知識點掌握',
      icon: Icons.brain,
      chipClass: 'bg-violet-50',
      iconClass: 'text-violet-600',
      onClick: () => setTab('ability'),
    },
    {
      key: 'chat',
      label: '對話紀錄',
      description: '覆核異常對話並跟進學生',
      icon: Icons.messageSquareWarning,
      chipClass: 'bg-rose-50',
      iconClass: 'text-rose-600',
      onClick: () => setTab('chat'),
    },
    {
      key: 'quality',
      label: '測驗質量',
      description: '檢視測驗質量與 AI 異常警示',
      icon: Icons.report,
      chipClass: 'bg-emerald-50',
      iconClass: 'text-emerald-600',
      onClick: () => setTab('quality'),
    },
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{uiText("學習報告")}</h1>
        <p className="text-slate-500">{uiText("追蹤學生能力表現、測驗質量與學習狀態。")}</p>
      </div>

      {/* 分頁列：跟智能評測頁嘅 tab bar。時間範圍只喺用到嘅分頁出現，唔做無作用嘅控制項 */}
      <div className="flex items-center gap-7 overflow-x-auto border-b border-slate-200 text-sm font-bold text-slate-400">
        {TOP_TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex shrink-0 items-center gap-2 px-1 pb-4 transition ${tab === item.key ? 'border-b-2 border-indigo-600 text-indigo-600' : 'hover:text-slate-700'}`}
          >
            <item.icon className="w-4 h-4" />
            {uiText(item.label)}
          </button>
        ))}
        {tab === 'ability' && (
          <div className="ml-auto mb-4 flex shrink-0 items-center rounded-full bg-slate-100 p-1 text-xs font-semibold">
            {PERIODS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriod(item.key)}
                className={`px-4 py-1.5 rounded-full transition-all ${period === item.key ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {uiText(item.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 總覽：快速入口（KPI 數字等課堂參與數據上線先加） */}
      {tab === 'overview' && (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">{uiText("快速入口")}</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {quickLinks.map((link) => (
              <button
                key={link.key}
                type="button"
                onClick={link.onClick}
                className="group relative flex min-h-[140px] items-center gap-5 overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-xl"
              >
                <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${link.chipClass}`}>
                  <link.icon className={`h-7 w-7 ${link.iconClass}`} />
                </span>
                <span className="relative min-w-0">
                  <span className="block text-lg font-black text-slate-900">{uiText(link.label)}</span>
                  <span className="mt-1 block text-sm text-slate-500">{uiText(link.description)}</span>
                </span>
                <ArrowRight className="relative ml-auto h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 課堂參與：規格第一期。參與度判斷後端未上線，故只出準備中說明，唔放假數字 */}
      {tab === 'participation' && (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <Icons.classes className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-black text-slate-900">{uiText("課堂參與分析準備中")}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
            {uiText("完成後，你可以在這裡一眼看到每班的參與情況：哪些學生有實質互動、哪些學生需要你跟進。")}
          </p>
          <p className="mt-3 text-xs text-slate-400">{uiText("目前可先在其他分頁查看學生能力、對話紀錄與測驗質量報告。")}</p>
        </div>
      )}

      {/* 學生能力：兩張列表卡並排，Bloom 六層級全闊——三張豎排會又長又擠 */}
      {tab === 'ability' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
            <StudentLearningReportCard />
            <TeacherProgressOverview />
          </div>
          <AbilityTrackingReport period={period} onCreateQuiz={onCreateQuiz} />
        </div>
      )}

      {/* 對話紀錄：異常對話卡自帶分頁，唔加高度限制 */}
      {tab === 'chat' && <FlaggedChatSummaryCard />}

      {/* 測驗質量 */}
      {tab === 'quality' && <AssessmentQualityList onOpenQuiz={onOpenQuizQuality} />}
    </div>
  );
};
