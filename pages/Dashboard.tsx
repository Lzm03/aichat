'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, CopyPlus, Users, ArrowRight } from 'lucide-react';
import { uiText, uiTemplate } from '../utils/uiI18n';
import { readAuthSession } from '../utils/auth';
import { useTeacherLang } from '../utils/teacherI18n';
import { API_BASE } from '../utils/api';
import { subjectColorOf } from '../utils/subjects';
import type { AiBot } from '../types';

import { AssessmentQualityCard } from '../components/assessment/AssessmentQualityCard';
import { StudentLearningReportCard } from '../components/dashboard/StudentLearningReportCard';
import { DemoNotice } from '../components/system/DemoNotice';

const WELCOME_T = {
  "zh-HK": "歡迎回到教學指揮艙，和學生們一起開啟今天的學習之旅！",
  en: "Welcome back to the Command Center. Let's start today's learning journey with your students!",
} as const;

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "早安";
  if (hour >= 11 && hour < 14) return "午安";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 24) return "晚上好";
  return "夜深了";
}

const HeroBanner: React.FC<{
  teacherName: string;
}> = ({ teacherName }) => {
  const lang = useTeacherLang();
  return (
    <div className="relative mb-5 h-[210px] w-full overflow-hidden rounded-[24px] shadow-md group sm:mb-6 sm:h-auto sm:aspect-[4/1] sm:rounded-[32px]">
      <img 
      src="/Tomato_Robot.webp"
        alt="AI Dashboard Hero" 
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
    />
    <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-slate-950/70 via-slate-900/45 to-slate-900/10 p-5 sm:p-8 md:p-12">
      <div className="max-w-2xl space-y-3 text-white sm:space-y-4">
        <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl md:text-4xl">{uiText(getTimeGreeting())}{lang === 'en' ? ', ' : '，'}{teacherName}</h2>
        <div className="inline-block max-w-full rounded-2xl border border-white/18 bg-white/10 p-3 text-white shadow-sm backdrop-blur-[3px] sm:rounded-xl">
          <p className="text-sm font-semibold leading-snug text-white/90">{WELCOME_T[lang]}</p>
        </div>
      </div>
    </div>
  </div>
  );
};

type DashboardProps = {
  onEditRecentBot: (botId: string) => void;
  onCreateBot: () => void;
  onCreateQuiz: () => void;
  onOpenSharing: () => void;
};

function formatRecentTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return uiText("剛剛更新");
  if (minutes < 60) return uiTemplate("{0} 分鐘前更新", minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return uiTemplate("{0} 小時前更新", hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return uiText("昨天更新");
  return uiTemplate("{0} 天前更新", days);
}

export const Dashboard: React.FC<DashboardProps> = ({
  onEditRecentBot,
  onCreateBot,
  onCreateQuiz,
  onOpenSharing,
}) => {
  const teacherName = readAuthSession()?.user?.fullName?.trim() || uiText('老師');
  const [bots, setBots] = useState<AiBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/bots`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const bots = Array.isArray(data) ? (data as AiBot[]) : [];
        const sorted = [...bots].sort((a, b) => {
          const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return bTime - aTime;
        });
        setBots(sorted.slice(0, 3));
        setBotsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBots([]);
          setBotsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recentBots = useMemo(() => bots, [bots]);
  const hasBots = recentBots.length > 0;
  const subjectColorRaw = recentBots[0]?.subject ? subjectColorOf(recentBots[0].subject) : "#94A3B8";
  const subjectColor = subjectColorRaw.includes("gradient") ? "#A855F7" : subjectColorRaw;

  return (
    <div className="h-full flex flex-col pb-32 md:pb-0">
      <DemoNotice />
      <HeroBanner teacherName={teacherName} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <article className="group relative min-h-[360px] overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] sm:p-7">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-indigo-100/70 blur-3xl transition-transform duration-500 group-hover:scale-125" aria-hidden="true" />
          <div className="relative flex h-full flex-col">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.04em] text-indigo-500">{uiText("最近編輯")}</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{uiText("最新 AI 夥伴")}</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{uiText("從你最近更新的 AI 夥伴開始，快速調整角色細節。")}</p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">AI Bot</span>
            </div>

            {botsLoading ? (
              <div className="mt-10 flex flex-1 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/70 text-sm font-semibold text-slate-400">
                {uiText("正在載入…")}
              </div>
            ) : hasBots ? (
              <div className="mt-auto grid gap-4 lg:grid-cols-3">
                {recentBots.map((bot) => (
                  <div key={bot.id} className="flex min-h-[280px] flex-col rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                    <div className="relative mx-auto h-28 w-28 shrink-0">
                      <img
                        src={bot.avatarUrl || "/avatars/bot-default.svg"}
                        alt={bot.name}
                        className="h-28 w-28 rounded-full border border-slate-100 object-cover"
                      />
                    </div>
                    <h3 className="mt-5 truncate text-lg font-black text-slate-950">{bot.name}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: `${subjectColor}1A`, color: subjectColor }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: subjectColor }} />
                        {uiText(bot.subject) || uiText("未分類")}
                      </span>
                      <span className="text-xs text-slate-400">{formatRecentTime(bot.updatedAt || bot.createdAt)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditRecentBot(bot.id)}
                      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 py-3 text-sm font-black text-indigo-600 transition hover:bg-indigo-100"
                    >
                      <Pencil className="h-4 w-4" />
                      {uiText("繼續編輯")}
                    </button>
                  </div>
                ))}
                {recentBots.length === 1 ? (
                  <button
                    type="button"
                    onClick={onCreateBot}
                    className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-5 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><CopyPlus className="h-5 w-5" /></span>
                    <span className="mt-2 text-sm font-black text-slate-700">{uiText("建立新角色")}</span>
                    <span className="mt-1 text-xs text-slate-400">{uiText("建立另一個 AI 夥伴")}</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-auto flex flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-2xl">🤖</div>
                <h3 className="mt-4 text-lg font-black text-slate-800">{uiText("仲未有 AI 夥伴")}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{uiText("建立第一個 AI 夥伴後，就可以喺呢度快速繼續編輯。")}</p>
                <button
                  type="button"
                  onClick={onCreateBot}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700"
                >
                  <CopyPlus className="h-4 w-4" />
                  {uiText("建立第一個 AI 夥伴")}
                </button>
              </div>
            )}
          </div>
        </article>

        <div className="grid gap-6">
          <button
            type="button"
            onClick={onCreateQuiz}
            className="group relative flex min-h-[168px] items-center gap-5 overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="absolute right-0 top-0 h-28 w-28 translate-x-6 -translate-y-6 rounded-full bg-emerald-100/80 blur-2xl" aria-hidden="true" />
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CopyPlus className="h-7 w-7" />
            </span>
            <span className="relative min-w-0">
              <span className="block text-lg font-black text-slate-900">{uiText("新建測驗")}</span>
              <span className="mt-1 block text-sm text-slate-500">{uiText("建立 AI 評測並自動批改")}</span>
            </span>
            <ArrowRight className="relative ml-auto h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" />
          </button>

          <button
            type="button"
            onClick={onOpenSharing}
            className="group relative flex min-h-[168px] items-center gap-5 overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 text-left shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="absolute right-0 top-0 h-28 w-28 translate-x-6 -translate-y-6 rounded-full bg-sky-100/80 blur-2xl" aria-hidden="true" />
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <Users className="h-7 w-7" />
            </span>
            <span className="relative min-w-0">
              <span className="block text-lg font-black text-slate-900">{uiText("學生與 Bot 分享")}</span>
              <span className="mt-1 block text-sm text-slate-500">{uiText("管理學生可以對話嘅 AI 夥伴")}</span>
            </span>
            <ArrowRight className="relative ml-auto h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" />
          </button>
        </div>
      </section>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2 flex-1">
        <StudentLearningReportCard />
        <AssessmentQualityCard />
      </div>
    </div>
  );
};
