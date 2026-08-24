import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icons } from "../components/icons";
import { API_BASE } from "../utils/api";
import { getAvatarColor } from "../utils/avatarColor";

// 今日任務頁（學生）：老師分享事件（最近 3 天）+ 待完成測驗挑戰。
// 介面語言先純中文（與帳戶中心/成就頁一致），後續再併入 i18n 字典。

type StudentTaskItem = {
  id: string;
  type: "share" | "quiz";
  teacherName: string;
  botId: string;
  botName: string;
  subject?: string;
  sharedAt: string; // ISO
};

// ---- mock 資料（接後端後由 /api/student/tasks 取代）----
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

const mockTasks: StudentTaskItem[] = [
  { id: "t1", type: "share", teacherName: "王老師", botId: "bot-chengyu", botName: "成語大王", subject: "語文", sharedAt: hoursAgo(2) },
  { id: "t2", type: "quiz", teacherName: "王老師", botId: "bot-math", botName: "數學小精靈", subject: "數學", sharedAt: hoursAgo(26) },
  { id: "t3", type: "share", teacherName: "李老師", botId: "bot-english", botName: "英語故事屋", subject: "英文", sharedAt: hoursAgo(50) },
  { id: "t4", type: "quiz", teacherName: "李老師", botId: "bot-science", botName: "科學探險號", subject: "科學", sharedAt: hoursAgo(30) },
  { id: "t5", type: "share", teacherName: "王老師", botId: "bot-poem", botName: "古詩小助手", subject: "語文", sharedAt: hoursAgo(96) },
];

// 分享事件只保留最近 3 天（HKT）；測驗條為待完成狀態，無時間窗
const THREE_DAYS_MS = 3 * 24 * 3600 * 1000;
const withinWindow = (iso: string) => now - new Date(iso).getTime() <= THREE_DAYS_MS;

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThatDay) / 86400000);
  if (diffDays <= 0) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `今天 ${hh}:${mm}`;
  }
  if (diffDays === 1) return "昨天";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

const JumpButton: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a
    href={href}
    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-110 active:scale-95"
  >
    {label}
    <Icons.right className="h-4 w-4" />
  </a>
);

export const StudentTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<StudentTaskItem[]>(mockTasks);

  useEffect(() => {
    fetch(`${API_BASE}/api/student/tasks`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "載入失敗");
        setTasks(Array.isArray(data?.tasks) ? data.tasks : mockTasks);
      })
      .catch(() => {
        // 後端未就緒 → 保留 mock
      });
  }, []);

  const quizTasks = tasks.filter((t) => t.type === "quiz");
  const shareTasks = tasks.filter((t) => t.type === "share" && withinWindow(t.sharedAt));
  const isEmpty = quizTasks.length === 0 && shareTasks.length === 0;

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

        {isEmpty ? (
          <div className="mt-16 flex flex-col items-center rounded-[24px] border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] px-6 py-14 text-center">
            <div className="text-4xl" aria-hidden="true">🎉</div>
            <p className="mt-4 text-sm font-bold text-[var(--text-main)]">暫時沒有新任務</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">去星際地圖找夥伴聊天吧</p>
            <a
              href="/"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-110 active:scale-95"
            >
              回星際地圖
            </a>
          </div>
        ) : (
          <>
            {/* ---- 待完成（測驗挑戰）---- */}
            {quizTasks.length > 0 && (
              <section className="mt-8">
                <h2 className="flex items-center gap-2 text-sm font-black text-[var(--text-main)]">
                  <span aria-hidden="true">📝</span> 待完成
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-text)]">{quizTasks.length}</span>
                </h2>
                <div className="mt-4 space-y-3">
                  {quizTasks.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.35 }}
                      className="flex flex-col gap-4 rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm" aria-hidden="true">📝</span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold leading-6 text-[var(--text-main)]">
                            「{item.botName}」有測試題等你挑戰！
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                            <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-[var(--text-body)]">{item.subject || "未分類"}</span>
                            <span>{item.teacherName} · {formatTime(item.sharedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <JumpButton href={`/?bot=${item.botId}`} label="去做測試" />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* ---- 老師分享（最近 3 天）---- */}
            {shareTasks.length > 0 && (
              <section className="mt-8">
                <h2 className="flex items-center gap-2 text-sm font-black text-[var(--text-main)]">
                  <span aria-hidden="true">🎁</span> 老師分享（最近 3 天）
                </h2>
                <div className="mt-4 space-y-3">
                  {shareTasks.map((item, index) => (
                    <motion.div
                      key={item.id}
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
                      <JumpButton href={`/?bot=${item.botId}`} label="開始對話" />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};
