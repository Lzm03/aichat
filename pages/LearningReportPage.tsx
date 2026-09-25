import { uiTemplate, uiText } from '../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { Icons } from '../components/icons';
import { ArrowRight } from 'lucide-react';
import { loadTeacherData, peekTeacherData } from '../utils/teacher-data-cache';
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

/** 總覽聚合（docs/learning-report-overview.md）：行為 KPI＋亮點，唔重複智能評測 */
type OverviewData = {
  period: string;
  participation: {
    activeStudents: number;
    noInteractionStudents: number;
    meaninglessMessages: number;
    studentMessageTotal: number;
  };
  classAlerts: Array<{ classId: string; className: string | null; noInteractionStudents: number }>;
  wellbeingOpen: number;
  anomalyOpen: number;
  updates: {
    abilityReportsToday: number;
    knowledgeStudentsToday: number;
    quizReportsGraded7d: number;
  };
  today: { activeStudents: number; noInteractionStudents: number };
};

const overviewPath = (period: ReportPeriod) =>
  `/api/teachers/me/learning-overview?period=${period}`;

export const LearningReportPage: React.FC<LearningReportPageProps> = ({ onOpenQuizQuality, onCreateQuiz }) => {
  const [tab, setTab] = useState<LearningTab>('overview');
  const [period, setPeriod] = useState<ReportPeriod>('30d');
  const [overview, setOverview] = useState<OverviewData | null>(() =>
    peekTeacherData<OverviewData>(overviewPath('30d'))
  );
  const [overviewFailed, setOverviewFailed] = useState(false);

  const loadOverview = (force = false) => {
    loadTeacherData<OverviewData>(overviewPath(period), force ? 0 : undefined)
      .then((data) => {
        setOverview(data);
        setOverviewFailed(false);
      })
      .catch(() => setOverviewFailed(true));
  };
  useEffect(() => {
    loadOverview();
    // period 變先重攞；loadOverview 每次 render 都新，唔入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // KPI 行：學生行為四卡。撳卡跳去對應 tab（設計：docs/learning-report-overview.md）
  const meaninglessRatio = overview
    ? overview.participation.studentMessageTotal > 0
      ? Math.round(
          (overview.participation.meaninglessMessages * 100) /
            overview.participation.studentMessageTotal
        )
      : 0
    : null;
  const kpis: Array<{
    key: string;
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    chipClass: string;
    iconClass: string;
    alert?: boolean;
    onClick: () => void;
  }> = [
    {
      key: 'active',
      label: '有實質互動學生',
      value: overview?.participation.activeStudents ?? '—',
      icon: Icons.users,
      chipClass: 'bg-sky-50',
      iconClass: 'text-sky-600',
      onClick: () => setTab('participation'),
    },
    {
      key: 'followup',
      label: '需要你跟進學生',
      value: overview?.participation.noInteractionStudents ?? '—',
      icon: Icons.bell,
      chipClass: 'bg-amber-50',
      iconClass: 'text-amber-600',
      onClick: () => setTab('participation'),
    },
    {
      key: 'ratio',
      label: '無意義訊息比例',
      value: meaninglessRatio === null ? '—' : `${meaninglessRatio}%`,
      icon: Icons.chart,
      chipClass: 'bg-violet-50',
      iconClass: 'text-violet-600',
      onClick: () => setTab('participation'),
    },
    {
      key: 'anomaly',
      label: '待處理異常對話',
      value: overview?.anomalyOpen ?? '—',
      icon: Icons.messageSquareWarning,
      chipClass: 'bg-rose-50',
      iconClass: 'text-rose-600',
      alert: (overview?.anomalyOpen ?? 0) > 0,
      onClick: () => setTab('chat'),
    },
  ];

  // 需要你跟進：班級提醒（最多 3 條，後端已排）＋情緒困擾提醒
  const followUps: React.ReactNode[] = [];
  if (overview) {
    for (const alert of overview.classAlerts) {
      followUps.push(
        <li key={`class-${alert.classId}`} className="flex items-start gap-3">
          <span className="mt-0.5 text-amber-500">●</span>
          <span>
            {uiTemplate(
              "{0}有 {1} 位學生未有互動",
              alert.className ?? uiText("未分組"),
              alert.noInteractionStudents
            )}
          </span>
        </li>
      );
    }
    if (overview.wellbeingOpen > 0) {
      followUps.push(
        <li key="wellbeing" className="flex items-start gap-3">
          <span className="mt-0.5 text-purple-500">●</span>
          <span>{uiTemplate("有 {0} 條情緒困擾訊息待處理", overview.wellbeingOpen)}</span>
        </li>
      );
    }
  }

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
      {/* 頁名（學習報告）已經喺 topbar 出現，內頁唔再重複一次；只留一句用途說明。 */}
      <p className="text-slate-500">{uiText("追蹤學生能力表現、測驗質量與學習狀態。")}</p>

      {/* 分頁列：跟智能評測頁嘅 tab bar。時間範圍只喺用到嘅分頁出現，唔做無作用嘅控制項。
          overflow-y-hidden 唔可以省：只寫 overflow-x-auto 時 overflow-y 會計成 auto，
          呢行就變成垂直 scroll container。而行高（52px）啱啱好等於時間範圍 pills 嘅
          36px + mb-4（16px），零餘裕——所以任何 sub-pixel 捨入，或者窄螢幕時橫向
          scrollbar 佔走高度，都會喺分頁位置走出嗰對 ▲▼（2026-09-25 用戶報）。
          橫向捲動照留，窄螢幕仲捲得到；shrink-0 做保險，唔可以被壓扁到 clipping 標籤。 */}
      <div className="flex shrink-0 items-center gap-7 overflow-x-auto overflow-y-hidden border-b border-slate-200 text-sm font-bold text-slate-400">
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
        {(tab === 'overview' || tab === 'ability') && (
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

      {/* 總覽：行為 KPI ＋ 亮點 ＋ 快速入口（docs/learning-report-overview.md） */}
      {tab === 'overview' && (
        <div className="space-y-8">
          {overviewFailed ? (
            <div className="rounded-[24px] border border-slate-100 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">{uiText("載入總覽失敗，請稍後再試。")}</p>
              <button
                type="button"
                onClick={() => loadOverview(true)}
                className="mt-3 rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                {uiText("重試")}
              </button>
            </div>
          ) : (
            <>
              {/* KPI 行：四卡跟頁面時間範圍；待處理異常 > 0 用警示色 */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpis.map((kpi) => (
                  <button
                    key={kpi.key}
                    type="button"
                    onClick={kpi.onClick}
                    className="flex items-center gap-4 rounded-[24px] border border-slate-100 bg-white p-5 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kpi.chipClass}`}>
                      <kpi.icon className={`h-6 w-6 ${kpi.iconClass}`} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-2xl font-black ${kpi.alert ? 'text-rose-600' : 'text-slate-900'}`}
                      >
                        {kpi.value}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                        {uiText(kpi.label)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {/* 亮點區：最近動態（規則推導，零 LLM）＋需要你跟進 */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-[24px] border border-slate-100 bg-white p-6">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">{uiText("最近動態")}</h2>
                  <ul className="space-y-3 text-sm leading-6 text-slate-600">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5">📄</span>
                      <span>{uiTemplate("今日生成咗 {0} 份能力追蹤報告", overview?.updates.abilityReportsToday ?? 0)}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5">🧠</span>
                      <span>{uiTemplate("今日 {0} 位學生的知識點掌握有新進展", overview?.updates.knowledgeStudentsToday ?? 0)}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5">💬</span>
                      <span>{uiTemplate("今日有 {0} 位學生有實質互動，{1} 位需要你跟進", overview?.today.activeStudents ?? 0, overview?.today.noInteractionStudents ?? 0)}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5">📊</span>
                      <span>{uiTemplate("最近 7 日生成咗 {0} 份測驗質量報告", overview?.updates.quizReportsGraded7d ?? 0)}</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-[24px] border border-slate-100 bg-white p-6">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">{uiText("需要你跟進")}</h2>
                  {followUps.length > 0 ? (
                    <ul className="space-y-3 text-sm leading-6 text-slate-600">{followUps}</ul>
                  ) : (
                    <p className="text-sm text-slate-500">{uiText("暫時冇需要跟進嘅事項")}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 快速入口（保留原 4 張，唔重複智能評測） */}
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
