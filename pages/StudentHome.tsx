import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BookOpen, Bot, ClipboardList, Flame, HelpCircle, Medal, Sparkles } from "lucide-react";
import type { StoredAuthUser } from "../utils/auth";
import { API_BASE } from "../utils/api";
import { getAvatarColor } from "../utils/avatarColor";
import { PublishSuccessModal } from "../components/workshop/PublishSuccessModal";
import { InfoTipModal } from "../components/system/InfoTipModal";
import { UserMenu } from "../components/layout/UserMenu";

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

// 學生首頁 i18n 字典：繁體中文（預設）與英文
type StudentHomeStrings = {
  greeting: (name: string) => string;
  tasksLeft: string;
  view: string;
  tokenHelp: string;
  bell: string;
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
  tokenTipTitle: string;
  tokenTipBody: string;
  companionTipTitle: string;
  companionTipBody: string;
};

const T: Record<"zh-HK" | "en", StudentHomeStrings> = {
  "zh-HK": {
    greeting: (name) => `嗨，${name}！`,
    tasksLeft: "今日還有 2 個任務",
    view: "查看",
    tokenHelp: "Token 額度說明",
    bell: "通知",
    chooseCompanion: "選擇一位學習夥伴",
    companionHelp: "學習夥伴說明",
    quizBadge: "測試題",
    uncategorized: "未分類",
    todayInteractions: (n) => `今日互動 ${n} 次`,
    loadingBots: "正在載入老師分享的 AI Bot...",
    startAdventure: "選擇一位學習夥伴，開始今天的冒險",
    noBots: "老師尚未分享 AI Bot 給你",
    starMap: "星際地圖",
    todayTasks: "今日任務",
    achievements: "我的成就",
    tokenTipTitle: "Token 額度是什麼",
    tokenTipBody: "Token 代表你還能與 AI 夥伴對話的額度。實際使用量會按對話內容計算，用完時可以請老師調整方案。",
    companionTipTitle: "如何選擇學習夥伴",
    companionTipBody: "點擊任一張卡片即可開始與這位 AI 夥伴聊天。頭像會依老師設定呈現，讓你先感受它的個性再開始對話。",
  },
  en: {
    greeting: (name) => `Hi, ${name}!`,
    tasksLeft: "2 tasks left today",
    view: "View",
    tokenHelp: "Token balance info",
    bell: "Notifications",
    chooseCompanion: "Choose a study buddy",
    companionHelp: "Study buddy info",
    quizBadge: "Quiz",
    uncategorized: "Uncategorized",
    todayInteractions: (n) => `${n} interactions today`,
    loadingBots: "Loading AI buddies shared by your teacher...",
    startAdventure: "Pick a buddy and start today's adventure",
    noBots: "Your teacher hasn't shared any AI buddies with you",
    starMap: "Star Map",
    todayTasks: "Today's Tasks",
    achievements: "Achievements",
    tokenTipTitle: "What are Tokens?",
    tokenTipBody: "Tokens are your quota for chatting with AI buddies. Usage is calculated by conversation length, and your teacher can adjust your plan when it runs out.",
    companionTipTitle: "How do I pick a buddy?",
    companionTipBody: "Tap any card to start chatting with that AI buddy. The avatar follows your teacher's settings, so you can feel its personality before diving in.",
  },
};

// 只取字典中純字串的 key（排除 greeting/todayInteractions 這類函數型）
type StudentHomeStringKey = { [K in keyof StudentHomeStrings]: StudentHomeStrings[K] extends string ? K : never }[keyof StudentHomeStrings];

const navItems: { labelKey: StudentHomeStringKey; icon: React.ComponentType<{ className?: string }>; active?: boolean }[] = [
  { labelKey: "starMap", icon: BookOpen, active: true },
  { labelKey: "todayTasks", icon: ClipboardList },
  { labelKey: "achievements", icon: Medal },
];

export const StudentHome: React.FC<StudentHomeProps> = ({ currentUser }) => {
  const displayName = currentUser.fullName || "同學";
  const [companions, setCompanions] = useState<SharedBot[]>([]);
  const [selectedBot, setSelectedBot] = useState<SharedBot | null>(null);
  const [loadingBots, setLoadingBots] = useState(true);
  const [activeTip, setActiveTip] = useState<"companions" | "tokens" | null>(null);

  // 語言狀態：優先 localStorage 記住的上次選擇，其次用戶偏好，預設繁中
  const [lang, setLang] = useState<"zh-HK" | "en">(() => {
    const saved = localStorage.getItem("chopreality_ui_lang");
    if (saved === "en" || saved === "zh-HK") return saved;
    return currentUser.preferences?.experience?.language === "en" ? "en" : "zh-HK";
  });
  const t = <K extends keyof StudentHomeStrings>(key: K): StudentHomeStrings[K] => T[lang][key];
  const switchLang = (next: "zh-HK" | "en") => {
    setLang(next);
    localStorage.setItem("chopreality_ui_lang", next);
    document.documentElement.lang = next === "en" ? "en" : "zh-Hant";
  };

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
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] sm:gap-2 sm:text-xs">
              <span>{t("tasksLeft")}</span>
              <button className="rounded-md bg-indigo-600 px-2 py-1 font-bold text-white transition hover:bg-indigo-700">{t("view")}</button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-5">
          <div className="hidden items-center gap-1 text-orange-500 md:flex">
            <Flame className="h-6 w-6 fill-orange-400" />
            <sup className="-ml-2 -mt-5 text-xs font-black">12</sup>
          </div>
          <div className="hidden items-center gap-1.5 lg:flex">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle-2)] px-4 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Tokens</div>
              <div className="text-sm font-black text-[var(--text-body)]">{currentUser.quota?.remaining ?? 750} <span className="text-[var(--text-faint)]">/ {currentUser.quota?.monthlyLimit ?? 1000}</span></div>
            </div>
            <button type="button" aria-label={t("tokenHelp")} onClick={() => setActiveTip("tokens")} className="text-[var(--text-faint)] transition hover:text-[var(--accent-text)]"><HelpCircle className="h-[18px] w-[18px]" /></button>
          </div>
          {/* 語言切換：繁中 / English */}
          <div className="flex shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle-2)] p-0.5">
            <button type="button" onClick={() => switchLang("zh-HK")} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${lang === "zh-HK" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}>中</button>
            <button type="button" onClick={() => switchLang("en")} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${lang === "en" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}>EN</button>
          </div>
          <button aria-label={t("bell")} className="hidden rounded-full p-2 text-amber-400 transition hover:bg-amber-50 sm:block"><Bell className="h-5 w-5 fill-amber-300" /></button>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-label={currentUser.fullName || "Account"}
              className="overflow-hidden rounded-xl transition hover:ring-2 hover:ring-[var(--accent-border)]"
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-xl object-cover sm:h-10 sm:w-10"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="block h-9 w-9 rounded-xl sm:h-10 sm:w-10"
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
            <motion.button
              key={companion.id}
              type="button"
              onClick={() => setSelectedBot(companion)}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.35 }}
              whileHover={{ y: -5 }}
              className="group flex min-h-[320px] flex-col rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-[26px] text-left shadow-[var(--shadow-card)] transition hover:border-[var(--accent-border)] hover:shadow-[var(--shadow-card-hover)]"
            >
              <div className="flex items-start justify-between">
                <div className="bot-avatar-pulse relative flex h-[130px] w-[130px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-700 text-white">
                  {companion.avatarUrl ? <img src={companion.avatarUrl} alt="" className="bot-avatar-breathe h-full w-full rounded-full border-4 border-white object-cover shadow-md" /> : <Bot className="h-12 w-12" />}
                </div>
                {companion.hasPendingQuiz ? (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[9px] font-bold text-amber-600 sm:px-2 sm:text-[10px]">{t("quizBadge")}</span>
                ) : null}
              </div>
              <h2 className="mt-4 truncate text-lg font-extrabold text-[var(--text-main)]">{companion.name}</h2>
              <span className="mt-2 inline-block rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-text)]">{companion.subject || t("uncategorized")}</span>
              <div className="mt-auto border-t border-[var(--border-soft)] pt-4 text-[13px] text-[var(--text-faint)]">{t("todayInteractions")(companion.interactions || 0)}</div>
            </motion.button>
          ))}
        </div>

        <div className="mx-auto mt-6 flex items-center justify-center gap-2 rounded-[20px] border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3.5 text-center text-[13px] text-[var(--accent-text)]">
          <Sparkles className="h-4 w-4" />
          {loadingBots ? t("loadingBots") : companions.length ? t("startAdventure") : t("noBots")}
        </div>
      </main>

      <nav className="fixed bottom-3 left-1/2 z-20 flex w-[calc(100%-24px)] max-w-[370px] -translate-x-1/2 items-center justify-between gap-0.5 rounded-[26px] border border-[var(--border)] bg-[var(--bg-headbar)] p-1.5 shadow-[var(--shadow-nav)] backdrop-blur sm:bottom-6 sm:w-auto sm:max-w-none sm:gap-1 sm:rounded-[30px] sm:p-2">
        {navItems.map(({ labelKey, icon: Icon, active }) => (
          <button
            key={labelKey}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[9px] font-bold transition sm:min-w-[72px] sm:flex-none sm:rounded-[22px] sm:px-3 sm:text-[10px] md:min-w-[82px] ${
              active ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200" : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            <Icon className="h-5 w-5" />
            {t(labelKey)}
          </button>
        ))}
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
        title={activeTip === "tokens" ? t("tokenTipTitle") : t("companionTipTitle")}
        body={activeTip === "tokens" ? t("tokenTipBody") : t("companionTipBody")}
        onClose={() => setActiveTip(null)}
      />
    </div>
  );
};
