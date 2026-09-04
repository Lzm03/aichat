import { uiText, uiTemplate } from '../utils/uiI18n';
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Bot, ClipboardList, HelpCircle, Medal, Sparkles } from "lucide-react";
import type { StoredAuthUser } from "../utils/auth";
import { API_BASE } from "../utils/api";
import { getAvatarColor } from "../utils/avatarColor";
import { PublishSuccessModal } from "../components/workshop/PublishSuccessModal";
import { InfoTipModal } from "../components/system/InfoTipModal";
import { SequencePngPlayer } from "../components/workshop/SequencePngPlayer";
import { UserMenu } from "../components/layout/UserMenu";
import { useTeacherLang, setTeacherLang } from "../utils/teacherI18n";

type StudentHomeProps = {
  currentUser: StoredAuthUser;
};

type SharedBot = {
  id: string;
  name: string;
  subject?: string;
  avatarUrl?: string;
  background?: string;
  animation?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
  openingMessage?: string;
  videoIdle?: string;
  videoThinking?: string;
  videoTalking?: string;
  voiceId?: string;
  interactions?: number;
  teacherName?: string;
  hasPendingQuiz?: boolean;
};

type IdleSequenceManifest = {
  folderUrl: string;
  pattern?: string;
  frameCount: number;
  fps: number;
};

const StudentBotCard: React.FC<{
  companion: SharedBot;
  index: number;
  onOpen: () => void;
}> = ({ companion, index, onOpen }) => {
  const [isPreviewingIdle, setIsPreviewingIdle] = useState(false);
  const [idleVideoFailed, setIdleVideoFailed] = useState(false);
  const [idleSequence, setIdleSequence] = useState<IdleSequenceManifest | null>(null);
  const [idleSequenceFailed, setIdleSequenceFailed] = useState(false);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const idleVideoUrl = companion.videoIdle?.trim() || "";
  const isIdleSequence = /\/manifest\.json(?:\?|$)/i.test(idleVideoUrl);
  const canShowIdlePreview = Boolean(
    isPreviewingIdle &&
    idleVideoUrl &&
    (isIdleSequence ? idleSequence && !idleSequenceFailed : !idleVideoFailed)
  );

  useEffect(() => {
    setIdleVideoFailed(false);
    setIdleSequence(null);
    setIdleSequenceFailed(false);
  }, [idleVideoUrl]);

  useEffect(() => {
    if (!isPreviewingIdle || !isIdleSequence || idleSequence || idleSequenceFailed) return;
    let cancelled = false;
    fetch(idleVideoUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error("idle sequence manifest unavailable");
        return response.json();
      })
      .then((manifest) => {
        if (cancelled) return;
        if (!manifest?.folderUrl || !Number(manifest?.frameCount) || !Number(manifest?.fps)) {
          throw new Error("invalid idle sequence manifest");
        }
        setIdleSequence({
          folderUrl: String(manifest.folderUrl),
          pattern: String(manifest.pattern || "frame_%04d.png"),
          frameCount: Number(manifest.frameCount),
          fps: Number(manifest.fps),
        });
      })
      .catch(() => {
        if (!cancelled) setIdleSequenceFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [idleSequence, idleSequenceFailed, idleVideoUrl, isIdleSequence, isPreviewingIdle]);

  useEffect(() => {
    if (!isPreviewingIdle || !idleVideoUrl || isIdleSequence || idleVideoFailed) return;
    let animationFrame = 0;
    const keepIdleLooping = () => {
      const video = idleVideoRef.current;
      if (
        video &&
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.currentTime >= video.duration - 0.12
      ) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
      animationFrame = window.requestAnimationFrame(keepIdleLooping);
    };
    animationFrame = window.requestAnimationFrame(keepIdleLooping);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [idleVideoFailed, idleVideoUrl, isIdleSequence, isPreviewingIdle]);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setIsPreviewingIdle(true)}
      onMouseLeave={() => setIsPreviewingIdle(false)}
      onFocus={() => setIsPreviewingIdle(true)}
      onBlur={() => setIsPreviewingIdle(false)}
      data-idle-preview={idleVideoUrl ? "available" : "unavailable"}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      whileHover={{ y: -5 }}
      className="group flex min-h-[320px] flex-col rounded-[28px] border border-slate-100 bg-white p-[26px] text-left shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:border-indigo-200 hover:shadow-[0_18px_45px_rgba(79,70,229,0.12)]"
    >
      <div className="flex items-start justify-between">
        <div className="relative flex h-[130px] w-[130px] items-center justify-center overflow-hidden rounded-full bg-white text-indigo-500 shadow-md ring-1 ring-slate-100">
          {companion.avatarUrl ? (
            <img
              src={companion.avatarUrl}
              alt={companion.name}
              className={`h-full w-full rounded-full object-cover transition-opacity duration-200 ${canShowIdlePreview ? "opacity-0" : "opacity-100"}`}
            />
          ) : (
            <Bot className={`h-12 w-12 transition-opacity duration-200 ${canShowIdlePreview ? "opacity-0" : "opacity-100"}`} />
          )}
          {isPreviewingIdle && isIdleSequence && idleSequence && !idleSequenceFailed ? (
            <SequencePngPlayer
              folderUrl={idleSequence.folderUrl}
              pattern={idleSequence.pattern}
              frameCount={idleSequence.frameCount}
              fps={idleSequence.fps}
              active
              startWhenBuffered
              aria-label={uiTemplate("{0} 待機動畫", companion.name)}
              className="absolute inset-0 h-full w-full rounded-full bg-white object-contain"
            />
          ) : null}
          {isPreviewingIdle && !isIdleSequence && idleVideoUrl && !idleVideoFailed ? (
            <video
              ref={idleVideoRef}
              key={idleVideoUrl}
              src={idleVideoUrl}
              autoPlay
              muted
              playsInline
              preload="metadata"
              poster={companion.avatarUrl || undefined}
              aria-label={uiTemplate("{0} 待機動畫", companion.name)}
              onError={() => setIdleVideoFailed(true)}
              onEnded={(event) => {
                if (!isPreviewingIdle) return;
                event.currentTarget.currentTime = 0;
                void event.currentTarget.play().catch(() => undefined);
              }}
              className="absolute inset-0 h-full w-full rounded-full bg-white object-contain"
            />
          ) : null}
        </div>
        {companion.hasPendingQuiz ? (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[9px] font-bold text-amber-600 sm:px-2 sm:text-[10px]">{uiText("測試題")}</span>
        ) : null}
      </div>
      <h2 className="mt-4 truncate text-lg font-extrabold text-slate-950">{companion.name}</h2>
      <span className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-500">{uiText(companion.subject) || uiText("未分類")}</span>
      <div className="mt-auto border-t border-slate-100 pt-4 text-[13px] text-slate-400">{uiText("今日互動 ")}{companion.interactions || 0}{uiText(" 次")}</div>
    </motion.button>
  );
};

// 學生首頁 i18n 字典：繁體中文（預設）與英文
type StudentHomeStrings = {
  greeting: (name: string) => string;
  chooseCompanion: string;
  companionHelp: string;
  quizBadge: string;
  uncategorized: string;
  todayInteractions: (n: number) => string;
  loadingBots: string;
  startAdventure: string;
  noBots: string;
  starMap: string;
  todayTasks: string;
  achievements: string;
  companionTipTitle: string;
  companionTipBody: string;
};

const T: Record<"zh-HK" | "en", StudentHomeStrings> = {
  "zh-HK": {
    greeting: (name) => `嗨，${name}！`,
    chooseCompanion: "選擇一位學習夥伴",
    companionHelp: "學習夥伴說明",
    quizBadge: "測試題",
    uncategorized: "未分類",
    todayInteractions: (n) => `今日互動 ${n} 次`,
    loadingBots: "正在載入老師分享的 AI Bot...",
    startAdventure: "選擇一位學習夥伴，開始今天的冒險",
    noBots: "老師尚未分享 AI Bot 給你",
    starMap: "學習夥伴",
    todayTasks: "今日任務",
    achievements: "我的成就",
    companionTipTitle: "如何選擇學習夥伴",
    companionTipBody: "點擊任一張卡片即可開始與這位 AI 夥伴聊天。頭像會依老師設定呈現，讓你先感受它的個性再開始對話。",
  },
  en: {
    greeting: (name) => `Hi, ${name}!`,
    chooseCompanion: "Choose a study buddy",
    companionHelp: "Study buddy info",
    quizBadge: "Quiz",
    uncategorized: "Uncategorized",
    todayInteractions: (n) => `${n} interactions today`,
    loadingBots: "Loading AI buddies shared by your teacher...",
    startAdventure: "Pick a buddy and start today's adventure",
    noBots: "Your teacher hasn't shared any AI buddies with you",
    starMap: "Study buddy",
    todayTasks: "Today's Tasks",
    achievements: "Achievements",
    companionTipTitle: "How do I pick a buddy?",
    companionTipBody: "Tap any card to start chatting with that AI buddy. The avatar follows your teacher's settings, so you can feel its personality before diving in.",
  },
};

// 只取字典中純字串的 key（排除 greeting/todayInteractions 這類函數型）
type StudentHomeStringKey = { [K in keyof StudentHomeStrings]: StudentHomeStrings[K] extends string ? K : never }[keyof StudentHomeStrings];

const navItems: { labelKey: StudentHomeStringKey; icon: React.ComponentType<{ className?: string }>; active?: boolean; href?: string }[] = [
  { labelKey: "starMap", icon: BookOpen, active: true, href: "/" },
  { labelKey: "todayTasks", icon: ClipboardList, href: "/tasks" },
  { labelKey: "achievements", icon: Medal, href: "/achievements" },
];

export const StudentHome: React.FC<StudentHomeProps> = ({ currentUser }) => {
  const displayName = currentUser.fullName || "同學";
  const [companions, setCompanions] = useState<SharedBot[]>([]);
  const [selectedBot, setSelectedBot] = useState<SharedBot | null>(null);
  const [loadingBots, setLoadingBots] = useState(true);
  const [activeTip, setActiveTip] = useState<"companions" | null>(null);

  // 語言狀態：優先 localStorage 記住的上次選擇，其次用戶偏好，預設繁中
  const lang = useTeacherLang();
  const t = <K extends keyof StudentHomeStrings>(key: K): StudentHomeStrings[K] => T[lang][key];
  const switchLang = setTeacherLang;

  useEffect(() => {
    fetch(`${API_BASE}/api/bots/shared/with-me`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "載入失敗");
        setCompanions(Array.isArray(data) ? data : []);
      })
      .catch(() => setCompanions([]))
      .finally(() => setLoadingBots(false));
  }, []);

  useEffect(() => {
    const handlePendingQuizChange = (event: Event) => {
      const detail = (event as CustomEvent<{ botId?: string; hasPendingQuiz?: boolean }>).detail;
      if (!detail?.botId || typeof detail.hasPendingQuiz !== "boolean") return;
      setCompanions((current) => current.map((companion) => (
        companion.id === detail.botId
          ? { ...companion, hasPendingQuiz: detail.hasPendingQuiz }
          : companion
      )));
    };
    window.addEventListener("quiz-pending-changed", handlePendingQuizChange);
    return () => window.removeEventListener("quiz-pending-changed", handlePendingQuizChange);
  }, []);

  // 深鏈接：/?bot=<id>（今日任務頁「查看/去做測試」）→ 自動開該 bot 的對話彈窗
  useEffect(() => {
    if (companions.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const botId = params.get("bot");
    if (!botId) return;
    const target = companions.find((c) => c.id === botId);
    if (target) {
      setSelectedBot(target);
      params.delete("bot");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [companions]);

  // 用戶選單開關（點外關閉，模式與教師 Header 一致）
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-body)]">
      <header className="flex min-h-[76px] w-full items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-[var(--bg-headbar)] px-4 py-3 sm:min-h-[88px] sm:px-6 lg:px-9">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="hidden text-3xl xs:block sm:block" aria-hidden="true">🚀</div>
          <div>
            <h1 className="truncate text-base font-black tracking-tight sm:text-lg">{t("greeting")(displayName)}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* 語言切換：繁中 / English */}
          <div className="flex shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle-2)] p-1">
            <button type="button" onClick={() => switchLang("zh-HK")} className={`h-8 rounded-full px-3 text-xs font-bold transition ${lang === "zh-HK" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}>{uiText("中")}</button>
            <button type="button" onClick={() => switchLang("en")} className={`h-8 rounded-full px-3 text-xs font-bold transition ${lang === "en" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}>EN</button>
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-label={currentUser.fullName || "Account"}
              className="block h-10 w-10 shrink-0 overflow-hidden rounded-full transition hover:ring-2 hover:ring-[var(--accent-border)]"
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="block h-10 w-10 rounded-full"
                  style={{ backgroundColor: getAvatarColor(currentUser.id || currentUser.email) }}
                />
              )}
            </button>
            <AnimatePresence>
              {isUserMenuOpen && <UserMenu currentUser={currentUser} variant="student" />}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-4 pb-32 pt-7 sm:px-6">
        <div className="mb-[18px] flex items-center gap-2">
          <h2 className="text-[19px] font-extrabold text-[var(--text-main)]">{t("chooseCompanion")}</h2>
          <button type="button" aria-label={t("companionHelp")} onClick={() => setActiveTip("companions")} className="text-[var(--accent-text)]"><HelpCircle className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {companions.map((companion, index) => (
            <StudentBotCard
              key={companion.id}
              companion={companion}
              index={index}
              onOpen={() => setSelectedBot(companion)}
            />
          ))}
        </div>

        <div className="mx-auto mt-6 flex items-center justify-center gap-2 rounded-[20px] border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3.5 text-center text-[13px] text-[var(--accent-text)]">
          <Sparkles className="h-4 w-4" />
          {loadingBots ? t("loadingBots") : companions.length ? t("startAdventure") : t("noBots")}
        </div>
      </main>

      <nav className="fixed bottom-3 left-1/2 z-20 flex w-[calc(100%-24px)] max-w-[370px] -translate-x-1/2 items-center justify-between gap-0.5 rounded-[26px] border border-[var(--border)] bg-[var(--bg-headbar)] p-1.5 shadow-[var(--shadow-nav)] backdrop-blur sm:bottom-6 sm:w-auto sm:max-w-none sm:gap-1 sm:rounded-[30px] sm:p-2">
        {navItems.map(({ labelKey, icon: Icon, active, href }) => {
          const className = `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[9px] font-bold transition sm:min-w-[72px] sm:flex-none sm:rounded-[22px] sm:px-3 sm:text-[10px] md:min-w-[82px] ${
            active ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200" : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          }`;
          const inner = (
            <>
              <Icon className="h-5 w-5" />
              {t(labelKey)}
            </>
          );
          return href ? (
            <a key={labelKey} href={href} className={className}>
              {inner}
            </a>
          ) : (
            <button key={labelKey} className={className}>
              {inner}
            </button>
          );
        })}
      </nav>

      {selectedBot ? (
        <PublishSuccessModal
          isOpen
          onClose={() => setSelectedBot(null)}
          botConfig={selectedBot}
          isSharedView={true}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      ) : null}
      <InfoTipModal
        open={Boolean(activeTip)}
        title={t("companionTipTitle")}
        body={t("companionTipBody")}
        onClose={() => setActiveTip(null)}
      />
    </div>
  );
};
