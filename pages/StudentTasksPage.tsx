import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icons } from "../components/icons";
import { API_BASE } from "../utils/api";
import { getAvatarColor } from "../utils/avatarColor";

type StudentTaskItem = {
  id: string;
  taskKey: string;
  type: "share" | "quiz";
  teacherName: string;
  botId: string;
  botName: string;
  subject?: string;
  sharedAt: string;
  quizId?: string;
  quizTitle?: string;
  readAt?: string | null;
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThatDay) / 86400000);
  if (diffDays <= 0) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `今天 ${hours}:${minutes}`;
  }
  if (diffDays === 1) return "昨天";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

const JumpButton: React.FC<{ label: string; disabled?: boolean; onClick: () => void }> = ({
  label,
  disabled = false,
  onClick,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:cursor-wait disabled:opacity-60"
  >
    {disabled ? "正在開啟…" : label}
    <Icons.right className="h-4 w-4" />
  </button>
);

export const StudentTasksPage: React.FC = () => {
  const [pending, setPending] = useState<StudentTaskItem[]>([]);
  const [recentShares, setRecentShares] = useState<StudentTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingTaskKey, setOpeningTaskKey] = useState("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/student/tasks`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "載入失敗");
      setPending(Array.isArray(data?.pending) ? data.pending : []);
      setRecentShares(Array.isArray(data?.recentShares) ? data.recentShares : []);
    } catch (loadError) {
      setPending([]);
      setRecentShares([]);
      setError(loadError instanceof Error ? loadError.message : "載入今日任務失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const navigateToBot = (botId: string) => {
    window.location.assign(`/?bot=${encodeURIComponent(botId)}`);
  };

  const openPendingTask = async (item: StudentTaskItem) => {
    if (openingTaskKey) return;
    setOpeningTaskKey(item.taskKey);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/student/tasks/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: item.taskKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "更新任務狀態失敗");

      setPending((current) => current.filter((task) => task.taskKey !== item.taskKey));
      if (item.type === "share") {
        setRecentShares((current) => [
          { ...item, readAt: data?.readAt || new Date().toISOString() },
          ...current.filter((task) => task.taskKey !== item.taskKey),
        ]);
      }
      navigateToBot(item.botId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "開啟任務失敗");
      setOpeningTaskKey("");
    }
  };

  const isEmpty = !loading && !error && pending.length === 0 && recentShares.length === 0;

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-body)] transition hover:bg-[var(--bg-subtle)]"
        >
          <Icons.back className="h-4 w-4" />
          返回工作台
        </a>

        <h1 className="mt-6 text-3xl font-black tracking-tight text-[var(--text-main)]">📋 今日任務</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">老師給你的新消息與待完成挑戰</p>

        {error ? (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <span>{error}</span>
            <button type="button" onClick={() => void loadTasks()} className="shrink-0 font-bold underline underline-offset-4">重新載入</button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-16 flex items-center justify-center gap-3 text-sm font-semibold text-[var(--text-muted)]">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
            正在載入真實任務…
          </div>
        ) : null}

        {isEmpty ? (
          <div className="mt-16 flex flex-col items-center rounded-[24px] border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] px-6 py-14 text-center">
            <div className="text-4xl" aria-hidden="true">🎉</div>
            <p className="mt-4 text-sm font-bold text-[var(--text-main)]">暫時沒有新任務</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">老師新分享的 Bot 或測驗會顯示在這裡</p>
            <a href="/" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-110 active:scale-95">
              回星際地圖
            </a>
          </div>
        ) : null}

        {!loading && pending.length > 0 ? (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-black text-[var(--text-main)]">
              <span aria-hidden="true">📝</span> 待完成
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-text)]">{pending.length}</span>
            </h2>
            <div className="mt-4 space-y-3">
              {pending.map((item, index) => (
                <motion.div
                  key={item.taskKey}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06, duration: 0.35 }}
                  className="flex flex-col gap-4 rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm" aria-hidden="true">
                      {item.type === "quiz" ? "📝" : "🎁"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-6 text-[var(--text-main)]">
                        {item.type === "quiz"
                          ? `「${item.botName}」有新測試「${item.quizTitle || "知識測試"}」等你挑戰！`
                          : `${item.teacherName} 分享了新的 AI Bot「${item.botName}」給你`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-[var(--text-body)]">{item.subject || "未分類"}</span>
                        <span>{item.teacherName} · {formatTime(item.sharedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <JumpButton
                    label={item.type === "quiz" ? "去做測試" : "查看 Bot"}
                    disabled={openingTaskKey === item.taskKey}
                    onClick={() => void openPendingTask(item)}
                  />
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && recentShares.length > 0 ? (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-black text-[var(--text-main)]">
              <span aria-hidden="true">🎁</span> 老師分享（最近 3 天）
            </h2>
            <div className="mt-4 space-y-3">
              {recentShares.map((item, index) => (
                <motion.div
                  key={item.taskKey}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06, duration: 0.35 }}
                  className="flex flex-col gap-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
                      style={{ backgroundColor: getAvatarColor(item.teacherName) }}
                    >
                      {item.teacherName.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-6 text-[var(--text-main)]">
                        {item.teacherName} 分享了機器人「{item.botName}」給你
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="rounded-full bg-[var(--bg-subtle-2)] px-2.5 py-0.5 font-semibold text-[var(--text-body)]">{item.subject || "未分類"}</span>
                        <span>{formatTime(item.sharedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <JumpButton label="開始對話" onClick={() => navigateToBot(item.botId)} />
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
