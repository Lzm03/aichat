import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, BookOpen, Bot, ClipboardList, Flame, HelpCircle, LogOut, Medal, Palette, Sparkles } from "lucide-react";
import { clearAuthSession, type StoredAuthUser } from "../utils/auth";
import { API_BASE } from "../utils/api";
import { PublishSuccessModal } from "../components/workshop/PublishSuccessModal";
import { InfoTipModal } from "../components/system/InfoTipModal";

type StudentHomeProps = {
  currentUser: StoredAuthUser;
};

type SharedBot = {
  id: string;
  name: string;
  subject?: string;
  avatarUrl?: string;
  interactions?: number;
  teacherName?: string;
  hasPendingQuiz?: boolean;
};

const navItems = [
  { label: "星際地圖", icon: BookOpen, active: true },
  { label: "今日任務", icon: ClipboardList },
  { label: "創意實驗室", icon: Palette },
  { label: "成就", icon: Medal },
];

export const StudentHome: React.FC<StudentHomeProps> = ({ currentUser }) => {
  const displayName = currentUser.fullName || "同學";
  const initial = displayName.trim().slice(0, 2).toUpperCase();
  const [companions, setCompanions] = useState<SharedBot[]>([]);
  const [selectedBot, setSelectedBot] = useState<SharedBot | null>(null);
  const [loadingBots, setLoadingBots] = useState(true);
  const [activeTip, setActiveTip] = useState<"companions" | "tokens" | null>(null);

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

  const logout = () => {
    clearAuthSession();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen w-full bg-[#f7f8fb] text-slate-800">
      <header className="flex min-h-[76px] w-full items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-3 sm:min-h-[88px] sm:px-6 lg:px-9">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="hidden text-3xl xs:block sm:block" aria-hidden="true">🚀</div>
          <div>
            <h1 className="truncate text-base font-black tracking-tight sm:text-lg">嗨，{displayName}！</h1>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 sm:gap-2 sm:text-xs">
              <span>今日還有 2 個任務</span>
              <button className="rounded-md bg-indigo-600 px-2 py-1 font-bold text-white transition hover:bg-indigo-700">查看</button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-5">
          <div className="hidden items-center gap-1 text-orange-500 md:flex">
            <Flame className="h-6 w-6 fill-orange-400" />
            <sup className="-ml-2 -mt-5 text-xs font-black">12</sup>
          </div>
          <div className="hidden items-center gap-1.5 lg:flex">
            <div className="rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tokens</div>
              <div className="text-sm font-black text-slate-600">{currentUser.quota?.remaining ?? 750} <span className="text-slate-300">/ {currentUser.quota?.monthlyLimit ?? 1000}</span></div>
            </div>
            <button type="button" aria-label="Token 額度說明" onClick={() => setActiveTip("tokens")} className="text-slate-400 transition hover:text-indigo-600"><HelpCircle className="h-[18px] w-[18px]" /></button>
          </div>
          <button aria-label="通知" className="hidden rounded-full p-2 text-amber-400 transition hover:bg-amber-50 sm:block"><Bell className="h-5 w-5 fill-amber-300" /></button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-black text-white shadow-lg shadow-indigo-200 sm:h-10 sm:w-10 sm:text-xs">
            {initial}
          </div>
          <button onClick={logout} aria-label="登出" title="登出" className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:p-2">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-4 pb-32 pt-7 sm:px-6">
        <div className="mb-[18px] flex items-center gap-2">
          <h2 className="text-[19px] font-extrabold text-slate-950">選擇一位學習夥伴</h2>
          <button type="button" aria-label="學習夥伴說明" onClick={() => setActiveTip("companions")} className="text-indigo-500"><HelpCircle className="h-5 w-5" /></button>
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
              className="group flex min-h-[320px] flex-col rounded-[28px] border border-slate-100 bg-white p-[26px] text-left shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:border-indigo-200 hover:shadow-[0_18px_45px_rgba(79,70,229,0.12)]"
            >
              <div className="flex items-start justify-between">
                <div className="bot-avatar-pulse relative flex h-[130px] w-[130px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-700 text-white">
                  {companion.avatarUrl ? <img src={companion.avatarUrl} alt="" className="bot-avatar-breathe h-full w-full rounded-full border-4 border-white object-cover shadow-md" /> : <Bot className="h-12 w-12" />}
                </div>
                {companion.hasPendingQuiz ? (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[9px] font-bold text-amber-600 sm:px-2 sm:text-[10px]">測試題</span>
                ) : null}
              </div>
              <h2 className="mt-4 truncate text-lg font-extrabold text-slate-950">{companion.name}</h2>
              <span className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-500">{companion.subject || "未分類"}</span>
              <div className="mt-auto border-t border-slate-100 pt-4 text-[13px] text-slate-400">今日互動 {companion.interactions || 0} 次</div>
            </motion.button>
          ))}
        </div>

        <div className="mx-auto mt-6 flex items-center justify-center gap-2 rounded-[20px] border border-dashed border-indigo-200 bg-indigo-50 px-4 py-3.5 text-center text-[13px] text-indigo-500">
          <Sparkles className="h-4 w-4" />
          {loadingBots ? "正在載入老師分享的 AI Bot..." : companions.length ? "選擇一位學習夥伴，開始今天的冒險" : "老師尚未分享 AI Bot 給你"}
        </div>
      </main>

      <nav className="fixed bottom-3 left-1/2 z-20 flex w-[calc(100%-24px)] max-w-[370px] -translate-x-1/2 items-center justify-between gap-0.5 rounded-[26px] border border-slate-200 bg-white/95 p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur sm:bottom-6 sm:w-auto sm:max-w-none sm:gap-1 sm:rounded-[30px] sm:p-2">
        {navItems.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[9px] font-bold transition sm:min-w-[72px] sm:flex-none sm:rounded-[22px] sm:px-3 sm:text-[10px] md:min-w-[82px] ${
              active ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      <PublishSuccessModal
        isOpen={Boolean(selectedBot)}
        onClose={() => setSelectedBot(null)}
        botConfig={selectedBot}
        isSharedView={true}
        onEdit={() => {}}
        onDelete={() => {}}
      />
      <InfoTipModal
        open={Boolean(activeTip)}
        title={activeTip === "tokens" ? "Token 額度是什麼" : "如何選擇學習夥伴"}
        body={activeTip === "tokens" ? "Token 代表你還能與 AI 夥伴對話的額度。實際使用量會按對話內容計算，用完時可以請老師調整方案。" : "點擊任一張卡片即可開始與這位 AI 夥伴聊天。頭像會依老師設定呈現，讓你先感受它的個性再開始對話。"}
        onClose={() => setActiveTip(null)}
      />
    </div>
  );
};
