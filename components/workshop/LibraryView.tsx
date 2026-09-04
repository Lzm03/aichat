import { uiText } from '../../utils/uiI18n';
import React, { useEffect, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { BotCard } from "./BotCard";
import { PublishSuccessModal } from "./PublishSuccessModal";
import { Icons } from "../icons";
import type { AiBot } from "../../types";
import { API_BASE } from "../../utils/api";
import type { FeatureEntitlement } from "../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../hooks/usePlatformDialog";
import { PlatformDialog } from "../system/PlatformDialog";
import { InfoTipModal } from "../system/InfoTipModal";
import { getTrialEndedPopupCopy } from "../../utils/trial-popup";
import { readAuthSession } from "../../utils/auth";
import { useTeacherLang, type TeacherLang } from "../../utils/teacherI18n";

interface LibraryViewProps {
  onStartCreation: () => void;
  onEditBot: (botId: string) => void;
  onDeleteBot: (botId: string) => void;
  createBotFeature?: FeatureEntitlement;
  chatMessagesFeature?: FeatureEntitlement;
  featureLoading?: boolean;
  searchQuery?: string;
}

type TipKey = "limit" | "subject" | null;

// 機器人庫 i18n 字典（教師端；文案對照表見 repo 外 教師端i18n文案-對照表.md）
const LIB_T: Record<TeacherLang, Record<string, string | ((arg: string) => string)>> = {
  "zh-HK": {
    tipLimitTitle: "免費版的機器人數量上限",
    tipLimitBody: "免費方案可建立的機器人角色數量有限。升級付費方案可取得更多角色席位及更高的對話用量。",
    tipLimitProBody: "PRO 方案的對話訊息不限量，機器人角色則按席位使用。如需更多席位，可直接聯絡客服協助加開。",
    tipSubjectTitle: "科目標籤顏色",
    tipSubjectBody: "顏色代表機器人所屬的科目，方便你在多個角色中快速分類。點擊卡片即可重新設定科目與顏色。",
    proBadge: "PRO 方案",
    heroTitle: "建立屬於您的 AI 夥伴",
    heroBody: "從角色外觀、知識庫、對話風格到教學情境，一次打造可立即投入課堂的 AI 機器人。",
    yourUsage: "你的方案用量",
    freeUsage: "免費版功能次數",
    botPersonas: "建立機器人角色",
    botPersonaSeats: "機器人角色席位",
    chatMessages: "對話訊息",
    unlimited: "無限制",
    proUnlimitedChat: "PRO 方案不限對話次數",
    seatsFull: (usage: string) => `機器人角色席位已用完（${usage}）。PRO 用戶可洽客服快速加開席位。`,
    contactSupport: "聯絡客服",
    limitReached: "已達機器人上限",
    addSeats: "洽客服可加開更多席位",
    createNewBot: "創建新機器人",
    startNextCompanion: "開始打造您的下一位 AI 夥伴",
    noBotsTitle: "還沒有機器人？三步驟就能上線",
    noBotsSub: "完成後即可分享給學生開始互動",
    stepAppearance: "設定角色外觀與聲音",
    stepKnowledge: "上傳知識庫內容與安全提示詞",
    stepPublish: "發布並分享連結給學生",
    noMatch: "找不到符合的 AI 機器人",
    noNameMatch: (query: string) => `沒有名稱包含「${query}」的機器人`,
    deleteFailedTitle: "刪除失敗",
    deleteFailedBody: "暫時無法刪除這個機器人，請稍後再試。",
    viewPlanAria: "查看方案説明",
    loading: "載入中",
    createUsedUp: "創建角色已用完",
  },
  en: {
    tipLimitTitle: "Free plan bot limit",
    tipLimitBody: "The free plan allows a limited number of bot personas. Upgrade to a paid plan for more persona seats and higher chat usage.",
    tipLimitProBody: "PRO plans offer unlimited chat messages, while bot personas are used by seat. Contact support to add more seats.",
    tipSubjectTitle: "Subject tag colors",
    tipSubjectBody: "Each color represents a bot's subject so you can sort personas quickly. Click a card to change its subject and color.",
    proBadge: "PRO Plan",
    heroTitle: "Build your own AI companion",
    heroBody: "From persona appearance, knowledge base and conversation style to teaching scenarios — build an AI bot that's classroom-ready in one go.",
    yourUsage: "Your plan usage",
    freeUsage: "Free plan usage",
    botPersonas: "Bot personas",
    botPersonaSeats: "Bot persona seats",
    chatMessages: "Chat messages",
    unlimited: "Unlimited",
    proUnlimitedChat: "PRO Plan: unlimited chat messages",
    seatsFull: (usage: string) => `Bot persona seats are full (${usage}). PRO users can contact support to add seats quickly.`,
    contactSupport: "Contact support",
    limitReached: "Bot limit reached",
    addSeats: "Contact support to add more seats",
    createNewBot: "Create new bot",
    startNextCompanion: "Start building your next AI companion",
    noBotsTitle: "No bots yet? Launch in 3 steps",
    noBotsSub: "Share it with students to start interacting",
    stepAppearance: "Set up the persona's appearance and voice",
    stepKnowledge: "Upload knowledge base content and safety prompts",
    stepPublish: "Publish and share the link with students",
    noMatch: "No matching AI bots",
    noNameMatch: (query: string) => `No bots with “${query}” in the name`,
    deleteFailedTitle: "Deletion failed",
    deleteFailedBody: "This bot can't be deleted right now. Please try again later.",
    viewPlanAria: "View plan details",
    loading: "Loading",
    createUsedUp: "Persona quota used up",
  },
};

const lt = (key: string, lang: TeacherLang): string => {
  const value = LIB_T[lang][key];
  return typeof value === "function" ? String(value) : String(value ?? LIB_T["zh-HK"][key] ?? "");
};

const ltf = (key: string, lang: TeacherLang) => LIB_T[lang][key] as (arg: string) => string;

function normalizeBots(data: any[]): AiBot[] {
  return data.map((raw: any) => ({
    id: raw.id, name: raw.name, subject: raw.subject, subjectColor: raw.subjectColor,
    avatarUrl: raw.avatarUrl, background: raw.background || "", animation: raw.animation || "",
    knowledgeBase: raw.knowledgeBase || "", securityPrompt: raw.securityPrompt || "",
    voiceId: raw.voiceId || "", openingMessage: raw.openingMessage || "",
    videoIdle: raw.videoIdle || "", videoThinking: raw.videoThinking || "", videoTalking: raw.videoTalking || "",
    interactions: raw.interactions, accuracy: raw.accuracy, isVisible: raw.isVisible,
    hasPublishedQuiz: Boolean(raw.hasPublishedQuiz), hasPendingQuiz: Boolean(raw.hasPendingQuiz),
    activeQuizId: raw.activeQuizId || "", activeQuizTitle: raw.activeQuizTitle || "",
  }));
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onStartCreation, onEditBot, onDeleteBot, createBotFeature, chatMessagesFeature,
  featureLoading = false, searchQuery = "",
}) => {
  const [bots, setBots] = useState<AiBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);
  const [selectedBot, setSelectedBot] = useState<AiBot | null>(null);
  const [tip, setTip] = useState<TipKey>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();
  const lang = useTeacherLang();
  const t = (key: string) => lt(key, lang);
  const tf = (key: string) => ltf(key, lang);

  useEffect(() => {
    const session = readAuthSession();
    const cacheKey = session ? `chopreality_bot_cache:${session.user.id}` : "";
    setBotsLoading(true);
    if (cacheKey) {
      try {
        const cached = window.sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) { setBots(parsed); setBotsLoading(false); }
        }
      } catch { /* ignore invalid cache */ }
    }
    fetch(`${API_BASE}/api/bots`)
      .then((res) => res.json())
      .then((data) => {
        const normalized = normalizeBots(Array.isArray(data) ? data : []);
        const ids = normalized.map((item) => item.id).filter(Boolean);
        if (!ids.length) return normalized;
        return fetch(`${API_BASE}/api/bots/interactions/today?ids=${encodeURIComponent(ids.join(","))}`)
          .then((res) => res.json())
          .then((payload) => normalized.map((item) => ({ ...item, interactions: Number(payload?.counts?.[item.id] || 0) })))
          .catch(() => normalized);
      })
      .then((next) => {
        setBots(next);
        if (cacheKey) window.sessionStorage.setItem(cacheKey, JSON.stringify(next));
      })
      .catch(() => setBots([]))
      .finally(() => setBotsLoading(false));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ botId?: string; hasPendingQuiz?: boolean }>).detail;
      if (!detail?.botId) return;
      setBots((current) => current.map((bot) => bot.id === detail.botId ? { ...bot, hasPendingQuiz: Boolean(detail.hasPendingQuiz) } : bot));
    };
    window.addEventListener("quiz-pending-changed", handler as EventListener);
    return () => window.removeEventListener("quiz-pending-changed", handler as EventListener);
  }, []);

  const normalizedSearchQuery = searchQuery.normalize("NFKC").trim().toLocaleLowerCase();
  const filteredBots = useMemo(() => normalizedSearchQuery
    ? bots.filter((bot) => String(bot.name || "").normalize("NFKC").toLocaleLowerCase().includes(normalizedSearchQuery))
    : bots, [bots, normalizedSearchQuery]);
  const creationLocked = featureLoading || botsLoading || Boolean(createBotFeature?.locked);
  const isPro = Boolean(createBotFeature?.unlimited || chatMessagesFeature?.unlimited || readAuthSession()?.user.plan?.toLowerCase().includes("pro"));
  const percent = (feature?: FeatureEntitlement) => feature?.unlimited ? 100 : Math.min(100, ((feature?.used || 0) / Math.max(feature?.limit || 1, 1)) * 100);
  const usageLabel = (feature?: FeatureEntitlement) => feature?.unlimited ? t("unlimited") : feature ? `${feature.used}/${feature.limit}` : t("loading");
  const startCreation = () => {
    if (featureLoading || botsLoading) return;
    if (createBotFeature?.locked) {
      showAlert({ title: t("createUsedUp"), message: getTrialEndedPopupCopy().message });
      return;
    }
    onStartCreation();
  };

  const editSelectedBot = () => {
    if (!selectedBot?.id) return;
    const botId = selectedBot.id;
    setSelectedBot(null);
    onEditBot(botId);
  };

  const deleteBot = async (botId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/bots/${botId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("刪除機器人失敗");
      const session = readAuthSession();
      const cacheKey = session ? `chopreality_bot_cache:${session.user.id}` : "";
      setBots((current) => {
        const next = current.filter((bot) => bot.id !== botId);
        if (cacheKey) window.sessionStorage.setItem(cacheKey, JSON.stringify(next));
        return next;
      });
      setSelectedBot(null);
      onDeleteBot(botId);
    } catch {
      showAlert({ title: t("deleteFailedTitle"), message: t("deleteFailedBody") });
    }
  };

  return (
    <div className="mx-auto max-w-[1080px] pb-14">
      <section className="mb-6 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="grid min-h-[220px] md:grid-cols-2">
          <div className="min-h-[200px] overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600">
            <img src="/ui-update/library-hero.webp" alt={uiText("Tomato Robot AI 夥伴")} className="h-full w-full object-cover" loading="lazy" />
          </div>
          <div className="flex flex-col justify-center gap-3 p-7 sm:p-8">
            {isPro ? <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-[11px] font-extrabold tracking-wide text-amber-800">{t("proBadge")}</span> : null}
            <h2 className="text-[30px] font-black leading-tight tracking-tight text-slate-950">{t("heroTitle")}</h2>
            <p className="text-[15px] leading-7 text-slate-600">{t("heroBody")}</p>
          </div>
        </div>
      </section>

      <section className="mb-7 rounded-[24px] border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-extrabold text-slate-950">{isPro ? t("yourUsage") : t("freeUsage")}</h3>
          <button type="button" aria-label={t("viewPlanAria")} onClick={() => setTip("limit")} className="text-indigo-500"><HelpCircle className="h-5 w-5" /></button>
        </div>
        <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px] font-bold text-slate-700"><span>{isPro ? t("botPersonaSeats") : t("botPersonas")}</span><span className="text-xs font-extrabold text-indigo-600">{usageLabel(createBotFeature)}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent(createBotFeature)}%` }} /></div>
          </div>
          <div className={`rounded-2xl border p-3.5 ${chatMessagesFeature?.unlimited ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-baseline justify-between gap-3 text-[13px] font-bold text-slate-700"><span>{t("chatMessages")}</span><span className={chatMessagesFeature?.unlimited ? "text-xs font-extrabold text-emerald-600" : "text-xs font-extrabold text-indigo-600"}>{chatMessagesFeature?.unlimited ? `✓ ${t("unlimited")}` : usageLabel(chatMessagesFeature)}</span></div>
            {chatMessagesFeature?.unlimited ? <div className="mt-2 text-xs text-lime-600">{t("proUnlimitedChat")}</div> : <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent(chatMessagesFeature)}%` }} /></div>}
          </div>
        </div>
        {isPro && createBotFeature?.locked && !bannerDismissed ? (
          <div className="mt-3.5 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-[13px] leading-6 text-indigo-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{tf("seatsFull")(usageLabel(createBotFeature))}</span>
            <div className="flex shrink-0 items-center gap-2"><a href="mailto:Mandy@chopreality.com" className="rounded-[10px] bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white">{t("contactSupport")}</a><button type="button" onClick={() => setBannerDismissed(true)} className="px-1 text-indigo-400">×</button></div>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <button type="button" onClick={startCreation} disabled={featureLoading || botsLoading} className={`group flex min-h-[340px] flex-col items-center justify-center rounded-[28px] border-2 border-dashed p-8 text-center transition ${creationLocked ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-85" : "border-slate-300 bg-white hover:-translate-y-1 hover:border-indigo-400 hover:bg-indigo-50/40"}`}>
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-indigo-50 text-[40px] font-light text-indigo-400">+</div>
          <p className="mt-[18px] text-lg font-extrabold text-slate-800">{createBotFeature?.locked ? t("limitReached") : t("createNewBot")}</p>
          <p className="mt-1 text-[13px] text-slate-400">{createBotFeature?.locked ? t("addSeats") : t("startNextCompanion")}</p>
          <p className="mt-3.5 text-xs font-extrabold text-indigo-500">{usageLabel(createBotFeature)}</p>
        </button>

        {!botsLoading && !normalizedSearchQuery && bots.length === 0 ? (
          <div className="flex min-h-[340px] flex-col justify-center rounded-[28px] border border-slate-100 bg-white p-8 md:col-span-1 xl:col-span-2">
            <h3 className="text-[17px] font-extrabold text-slate-950">{t("noBotsTitle")}</h3>
            <p className="mt-1 text-[13px] text-slate-400">{t("noBotsSub")}</p>
            <div className="mt-[18px] space-y-3">{[t("stepAppearance"), t("stepKnowledge"), t("stepPublish")].map((label, index) => <div key={label} className="flex items-center gap-3 text-[13px] text-slate-700"><span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-extrabold text-indigo-600">{index + 1}</span>{uiText(label)}</div>)}</div>
          </div>
        ) : null}

        {filteredBots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            onOpen={() => setSelectedBot(bot)}
            onEdit={() => onEditBot(bot.id)}
            onShowSubjectHelp={() => setTip("subject")}
          />
        ))}
        {!botsLoading && normalizedSearchQuery && filteredBots.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white px-6 text-center md:col-span-1 xl:col-span-2"><Icons.search className="h-7 w-7 text-slate-300" /><p className="mt-4 font-bold text-slate-700">{t("noMatch")}</p><p className="mt-1 text-sm text-slate-500">{tf("noNameMatch")(searchQuery.trim())}</p></div>
        ) : null}
      </div>

      {selectedBot ? (
        <PublishSuccessModal
          isOpen
          onClose={() => setSelectedBot(null)}
          botConfig={selectedBot}
          onEdit={editSelectedBot}
          onDelete={deleteBot}
        />
      ) : null}
      <InfoTipModal
        open={Boolean(tip)}
        title={tip ? t(tip === "limit" ? "tipLimitTitle" : "tipSubjectTitle") : ""}
        body={tip ? (tip === "limit" && isPro ? t("tipLimitProBody") : t(tip === "limit" ? "tipLimitBody" : "tipSubjectBody")) : ""}
        onClose={() => setTip(null)}
      />
      <PlatformDialog open={dialog.open} title={dialog.title} message={dialog.message} confirmText={dialog.confirmText} cancelText={dialog.cancelText} tone={dialog.tone} onClose={closeDialog} onConfirm={dialog.onConfirm || undefined} />
    </div>
  );
};
