import { uiTemplate, uiText } from '../utils/uiI18n';
import React, { useEffect, useRef, useState } from 'react';
import { Icons } from '../components/icons';
import { ArrowRight, ChevronRight } from 'lucide-react';
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

/** 總覽聚合（docs/learning-report-overview.md）：行為 KPI＋需要你跟進，唔重複智能評測 */
type OverviewData = {
  period: string;
  participation: {
    activeStudents: number;
    noInteractionStudents: number;
    meaninglessMessages: number;
    studentMessageTotal: number;
  };
  classAlerts: Array<{ classId: string; className: string | null; noInteractionStudents: number }>;
  /** 全部未有互動嘅班數（classAlerts 係 cap 3 條後嘅頭三位） */
  classAlertsTotal: number;
  wellbeingOpen: number;
  anomalyOpen: number;
  /** 知識點掌握增長：期內首次掌握新知識點嘅學生數（自己發佈嘅 Bot × roster） */
  masteryStudents: number;
};

/** 課堂參與 tab 每組一行（participation route 契約） */
type ParticipationRow = {
  id: string;
  name: string | null;
  /** 行所屬 Bot（topic 維度由 character_topics 帶出）；null = 主知識庫／已刪 → 唔可撳 */
  botId?: string | null;
  studentMessageTotal: number;
  effectiveQuestions: number;
  meaninglessMessages: number;
  substantiveMessages: number;
  activeStudents: number;
  noInteractionStudents: number;
  noInteractionNames: string[];
};

type ParticipationDimension = 'class' | 'bot' | 'topic';

const overviewPath = (period: ReportPeriod) =>
  `/api/teachers/me/learning-overview?period=${period}`;
const participationPath = (period: ReportPeriod, dimension: ParticipationDimension) =>
  `/api/teachers/me/participation?period=${period}&dimension=${dimension}`;

export const LearningReportPage: React.FC<LearningReportPageProps> = ({ onOpenQuizQuality, onCreateQuiz }) => {
  const [tab, setTab] = useState<LearningTab>('overview');
  const [period, setPeriod] = useState<ReportPeriod>('30d');
  const [overview, setOverview] = useState<OverviewData | null>(() =>
    peekTeacherData<OverviewData>(overviewPath('30d'))
  );
  const [overviewFailed, setOverviewFailed] = useState(false);

  // ---- 總覽數據：入 tab／切 period 即攞；開住總覽時 15 秒輪詢（同紅點同一節奏），
  // 處理完異常（FlaggedChatSummaryCard dispatch event）即時重攞 → 跟進項即刻消失。
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
  useEffect(() => {
    if (tab !== 'overview') return;
    const interval = window.setInterval(() => loadOverview(), 15_000);
    const onFlaggedResolved = () => loadOverview();
    window.addEventListener('chopreality:flagged-count-refresh', onFlaggedResolved);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('chopreality:flagged-count-refresh', onFlaggedResolved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ---- 課堂參與 tab 數據
  const [dimension, setDimension] = useState<ParticipationDimension>('class');
  const [participationRows, setParticipationRows] = useState<ParticipationRow[] | null>(() =>
    peekTeacherData<{ rows: ParticipationRow[] }>(participationPath('30d', 'class'))?.rows ?? null
  );
  const [participationFailed, setParticipationFailed] = useState(false);
  const loadParticipation = (force = false) => {
    loadTeacherData<{ rows: ParticipationRow[] }>(
      participationPath(period, dimension),
      force ? 0 : undefined
    )
      .then((data) => {
        setParticipationRows(data.rows || []);
        setParticipationFailed(false);
      })
      .catch(() => setParticipationFailed(true));
  };
  useEffect(() => {
    if (tab !== 'participation') return;
    loadParticipation();
    const interval = window.setInterval(() => loadParticipation(), 15_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period, dimension]);

  // 未有互動名單 popover：純統計（未有互動嘅學生根本冇對話可睇），撳名顯示姓名＋班級
  const [popStudent, setPopStudent] = useState<{ name: string; className: string | null; x: number; y: number } | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) setPopStudent(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // 課堂參與 bot／topic 行撳入 → 學生能力 tab 預選該 Bot 嘅能力追蹤報告（deep-link，
  // card mount 後經 onInitialBotIdConsumed 清走，唔會鎖死之後嘅選擇）
  const [abilityInitialBotId, setAbilityInitialBotId] = useState<string | null>(null);
  const jumpToAbilityReport = (botId: string | null | undefined) => {
    if (!botId) return;
    setAbilityInitialBotId(botId);
    setTab('ability');
  };

  // KPI 行：學生行為四卡＋固定定義小字。撳卡跳去對應 tab（docs/learning-report-overview.md）
  // 分母 0（期內冇訊息）＝冇數據 → 出「—」唔出 0%（0% 會誤導成「全班都實質」）
  const meaninglessRatio = overview
    ? overview.participation.studentMessageTotal > 0
      ? Math.round(
          (overview.participation.meaninglessMessages * 100) /
            overview.participation.studentMessageTotal
        )
      : null
    : null;
  const kpis: Array<{
    key: string;
    label: string;
    definition: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    chipClass: string;
    iconClass: string;
    alert?: boolean;
    redDot?: boolean;
    onClick: () => void;
  }> = [
    {
      key: 'mastery',
      label: '知識點掌握增長',
      definition: '發佈 Bot 後，與 Bot 對話並首次掌握新知識點的學生數（期內）',
      value: overview?.masteryStudents ?? '—',
      icon: Icons.brain,
      chipClass: 'bg-violet-50',
      iconClass: 'text-violet-600',
      onClick: () => setTab('ability'),
    },
    {
      key: 'followup',
      label: '需要你跟進學生',
      definition: '期內沒有實質對話的學生數',
      value: overview?.participation.noInteractionStudents ?? '—',
      icon: Icons.bell,
      chipClass: 'bg-amber-50',
      iconClass: 'text-amber-600',
      onClick: () => setTab('participation'),
    },
    {
      key: 'ratio',
      label: '無意義訊息比例',
      definition: '全部對話中簡短回應（如「哦」「唔知」）所佔比例',
      value: meaninglessRatio === null ? '—' : `${meaninglessRatio}%`,
      icon: Icons.chart,
      chipClass: 'bg-violet-50',
      iconClass: 'text-violet-600',
      onClick: () => setTab('participation'),
    },
    {
      key: 'anomaly',
      label: '待處理異常對話',
      definition: '待處理的異常對話數，與左側紅點一致',
      value: overview?.anomalyOpen ?? '—',
      icon: Icons.messageSquareWarning,
      chipClass: 'bg-rose-50',
      iconClass: 'text-rose-600',
      alert: (overview?.anomalyOpen ?? 0) > 0,
      redDot: (overview?.anomalyOpen ?? 0) > 0,
      onClick: () => setTab('chat'),
    },
  ];

  // 需要你跟進：班級提醒（後端 cap 3 條、按人數排）＋情緒困擾提醒；可撳跳轉
  const followUps: React.ReactNode[] = [];
  if (overview) {
    for (const alert of overview.classAlerts) {
      followUps.push(
        <li key={`class-${alert.classId}`}>
          <button
            type="button"
            onClick={() => setTab('participation')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <span className="mt-0.5 shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-600">
              {uiText("班級")}
            </span>
            <span className="min-w-0 flex-1">
              {uiTemplate(
                "{0}有 {1} 位學生未有互動",
                alert.className ?? uiText("未分組"),
                alert.noInteractionStudents
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        </li>
      );
    }
    if (overview.wellbeingOpen > 0) {
      followUps.push(
        <li key="wellbeing">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <span className="mt-0.5 shrink-0 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-600">
              {uiText("情緒困擾")}
            </span>
            <span className="min-w-0 flex-1">
              {uiTemplate("有 {0} 條情緒困擾訊息待處理", overview.wellbeingOpen)}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        </li>
      );
    }
    const overflowCount = overview.classAlertsTotal - overview.classAlerts.length;
    if (overflowCount > 0) {
      followUps.push(
        <li key="overflow">
          <button
            type="button"
            onClick={() => setTab('participation')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs text-slate-400 transition hover:bg-slate-50"
          >
            <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-400">
              {uiText("更多")}
            </span>
            <span className="min-w-0 flex-1">
              {uiTemplate("仲有 {0} 班有學生未有互動", overflowCount)}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        </li>
      );
    }
  }

  // 快速入口卡：跟智能評測頁 QUICK_LINKS 嘅樣式。四張卡排 2×2。
  // 「對話紀錄」卡用玫瑰漸變實色突出（用戶要求：異常係老師最要即刻睇嘅嘢）。
  // 唔重複智能評測 KPI；「新建測驗」入口 Dashboard 同智能評測頁已有。
  const quickLinks: {
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    chipClass: string;
    iconClass: string;
    cardClass: string;
    onClick: () => void;
  }[] = [
    {
      key: 'participation',
      label: '課堂參與',
      description: '了解每班的課堂參與情況',
      icon: Icons.classes,
      chipClass: 'bg-sky-50',
      iconClass: 'text-sky-600',
      cardClass: 'border-slate-100 bg-white',
      onClick: () => setTab('participation'),
    },
    {
      key: 'ability',
      label: '學生能力',
      description: '能力追蹤、Bloom 六層級與知識點掌握',
      icon: Icons.brain,
      chipClass: 'bg-violet-50',
      iconClass: 'text-violet-600',
      cardClass: 'border-slate-100 bg-white',
      onClick: () => setTab('ability'),
    },
    {
      key: 'chat',
      label: '對話紀錄',
      description: '覆核異常對話並跟進學生',
      icon: Icons.messageSquareWarning,
      chipClass: 'bg-rose-100',
      iconClass: 'text-rose-600',
      cardClass: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-rose-100',
      onClick: () => setTab('chat'),
    },
    {
      key: 'quality',
      label: '測驗質量',
      description: '檢視測驗質量與 AI 異常警示',
      icon: Icons.report,
      chipClass: 'bg-emerald-50',
      iconClass: 'text-emerald-600',
      cardClass: 'border-slate-100 bg-white',
      onClick: () => setTab('quality'),
    },
  ];

  // 課堂參與每組一行：組名＋四指標；class 維度多一個未有互動名單（撳名出姓名班級 popover）。
  // bot／topic 維度嘅行可撳 → 跳去該 Bot 嘅能力追蹤報告（topic 經 character_topics
  // 映射所屬 Bot；主知識庫／已刪話題 botId null → 唔可撳）
  const renderParticipationRow = (row: ParticipationRow, rowIndex: number) => {
    const ratio =
      row.studentMessageTotal > 0
        ? `${Math.round((row.meaninglessMessages * 100) / row.studentMessageTotal)}%`
        : '—';
    // name null 喺唔同維度意思唔同：topic 嘅 '' = 主知識庫；class／bot 先係未分組
    const displayName =
      row.name ?? (dimension === 'topic' ? uiText("主知識庫") : uiText("未分組"));
    const jumpable = dimension !== 'class' && Boolean(row.botId);
    return (
      <div
        key={`${row.id}-${rowIndex}`}
        role={jumpable ? 'button' : undefined}
        tabIndex={jumpable ? 0 : undefined}
        onClick={jumpable ? () => jumpToAbilityReport(row.botId) : undefined}
        onKeyDown={
          jumpable
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  jumpToAbilityReport(row.botId);
                }
              }
            : undefined
        }
        className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)] ${jumpable ? 'cursor-pointer transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg' : ''}`}
      >
        <span className="min-w-[88px] text-[15px] font-black text-slate-900">
          {displayName}
        </span>
        <span className="text-xs text-slate-400">
          <b className="block text-[15px] font-bold text-slate-900 tabular-nums">{row.studentMessageTotal}</b>
          {uiText("訊息總數")}
        </span>
        <span
          className="text-xs text-slate-400"
          title={uiText("學生主動提出、同學習內容相關的提問；由 AI 自動判斷（每 3 輪對話判斷一次），判斷不到時以訊息長度估算")}
        >
          <b className="block text-[15px] font-bold text-slate-900 tabular-nums">{row.effectiveQuestions}</b>
          {uiText("有效提問")}
        </span>
        <span className="text-xs text-slate-400">
          <b className="block text-[15px] font-bold text-slate-900 tabular-nums">{ratio}</b>
          {uiText("無意義比例")}
        </span>
        <span className="text-xs text-slate-400">
          <b className="block text-[15px] font-bold text-slate-900 tabular-nums">{row.activeStudents}</b>
          {uiText("活躍學生")}
        </span>
        {dimension === 'class' && row.noInteractionStudents > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
              {row.noInteractionStudents} {uiText("未有互動")}
            </span>
            <span className="text-xs text-slate-500">
              {row.noInteractionNames.map((name, index) => (
                <React.Fragment key={name}>
                  {index > 0 && '、'}
                  <button
                    type="button"
                    onClick={(event) =>
                      setPopStudent({
                        name,
                        className: row.name ?? uiText("未分組"),
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }
                    className="text-indigo-600 underline decoration-dotted underline-offset-2 hover:text-indigo-700"
                  >
                    {name}
                  </button>
                </React.Fragment>
              ))}
            </span>
          </span>
        )}
        {jumpable && (
          <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-300" />
        )}
      </div>
    );
  };

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
        {(tab === 'overview' || tab === 'participation' || tab === 'ability') && (
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

      {/* 總覽：行為 KPI ＋ 需要你跟進 ＋ 快速入口（docs/learning-report-overview.md） */}
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
              {/* KPI 行：四卡跟頁面時間範圍；每卡有固定定義小字；待處理異常 > 0 加紅點 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi) => (
                  <button
                    key={kpi.key}
                    type="button"
                    onClick={kpi.onClick}
                    className="flex flex-col gap-3 rounded-[24px] border border-slate-100 bg-white p-5 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kpi.chipClass}`}>
                        <kpi.icon className={`h-6 w-6 ${kpi.iconClass}`} />
                      </span>
                      <span
                        className={`flex items-center gap-2 text-2xl font-black tabular-nums ${kpi.alert ? 'text-rose-600' : 'text-slate-900'}`}
                      >
                        {kpi.redDot && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />}
                        {kpi.value}
                      </span>
                    </span>
                    <span className="block text-xs font-semibold text-slate-500">{uiText(kpi.label)}</span>
                    <span className="block text-[11.5px] leading-relaxed text-slate-400">
                      {uiText(kpi.definition)}
                    </span>
                  </button>
                ))}
              </div>

              {/* 需要你跟進：可撳跳轉（班級 → 課堂參與；情緒困擾 → 對話紀錄） */}
              <div className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
                <h2 className="text-lg font-bold text-slate-800">{uiText("需要你跟進")}</h2>
                <p className="mt-1 text-xs text-slate-400">{uiText("撳一下可前往對應位置處理")}</p>
                {followUps.length > 0 ? (
                  <ul className="mt-2 divide-y divide-slate-100">{followUps}</ul>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">{uiText("暫時冇需要跟進嘅事項")}</p>
                )}
              </div>
            </>
          )}

          {/* 快速入口（保留原 4 張；對話紀錄卡玫瑰漸變突出） */}
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">{uiText("快速入口")}</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {quickLinks.map((link) => (
                <button
                  key={link.key}
                  type="button"
                  onClick={link.onClick}
                  className={`group relative flex min-h-[140px] items-center gap-5 overflow-hidden rounded-[28px] border p-6 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-xl ${link.cardClass}`}
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

      {/* 課堂參與：班級／按 Bot／按話題切換＋每組指標＋未有互動名單（docs/class-participation.md） */}
      {tab === 'participation' && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 text-xs font-semibold">
            {(
              [
                { key: 'class', label: '班級' },
                { key: 'bot', label: '按 Bot' },
                { key: 'topic', label: '按話題' },
              ] as Array<{ key: ParticipationDimension; label: string }>
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setDimension(item.key)}
                className={`rounded-full px-4 py-1.5 transition-all ${dimension === item.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {uiText(item.label)}
              </button>
            ))}
          </div>

          {participationFailed ? (
            <div className="rounded-[24px] border border-slate-100 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">{uiText("載入課堂參與失敗，請稍後再試。")}</p>
              <button
                type="button"
                onClick={() => loadParticipation(true)}
                className="mt-3 rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                {uiText("重試")}
              </button>
            </div>
          ) : participationRows && participationRows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              {uiText("此時間範圍內暫無對話紀錄")}
            </div>
          ) : (
            <div className="space-y-3">
              {(participationRows ?? []).map((row, index) => renderParticipationRow(row, index))}
            </div>
          )}
        </div>
      )}

      {/* 學生能力：兩張列表卡並排，Bloom 六層級全闊——三張豎排會又長又擠 */}
      {tab === 'ability' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
            <StudentLearningReportCard
              initialBotId={abilityInitialBotId ?? undefined}
              onInitialBotIdConsumed={() => setAbilityInitialBotId(null)}
            />
            <TeacherProgressOverview />
          </div>
          <AbilityTrackingReport period={period} onCreateQuiz={onCreateQuiz} />
        </div>
      )}

      {/* 對話紀錄：異常對話卡自帶分頁，唔加高度限制 */}
      {tab === 'chat' && <FlaggedChatSummaryCard />}

      {/* 測驗質量 */}
      {tab === 'quality' && <AssessmentQualityList onOpenQuiz={onOpenQuizQuality} />}

      {/* 未有互動名單 popover：純統計，撳名顯示姓名＋班級（用戶決定：未有互動＝冇對話可睇） */}
      {popStudent && (
        <div
          ref={popRef}
          className="fixed z-50 min-w-[150px] rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
          style={{
            top: Math.min(popStudent.y + 10, window.innerHeight - 120),
            left: Math.min(popStudent.x, window.innerWidth - 180),
          }}
        >
          <p className="text-sm font-black text-slate-900">{popStudent.name}</p>
          <p className="mt-1 text-xs text-slate-400">
            {uiText("班級")}：{popStudent.className}
          </p>
        </div>
      )}
    </div>
  );
};
