import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { API_BASE } from "../../utils/api";

// 學生 headbar Token 點開的消耗記錄彈窗（移植 3001 TokenModal）：
// 過去一小時 / 一日 / 七日 tab；1h 只顯示當小時、1d = 1h+1d、7d = 全部。
// 介面語言先純中文，後續併入 i18n 字典。

type TokenPeriod = "1h" | "1d" | "7d";

type TokenLog = {
  id: string;
  action: string;
  tokens: number; // 正＝消耗、負＝發放
  time: string;
  period: TokenPeriod;
};

const buildMockLogs = (): TokenLog[] => {
  const now = new Date();
  const at = (hoursAgo: number) => {
    const d = new Date(now.getTime() - hoursAgo * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return [
    { id: "l1", action: "與「成語大王」對話", tokens: 32, time: at(0.2), period: "1h" },
    { id: "l2", action: "與「數學小精靈」對話", tokens: 45, time: at(0.8), period: "1h" },
    { id: "l3", action: "與「英語故事屋」對話", tokens: 58, time: at(18), period: "1d" },
    { id: "l4", action: "與「科學探險號」對話", tokens: 40, time: at(26), period: "1d" },
    { id: "l5", action: "每日登錄獎勵", tokens: -100, time: at(30), period: "7d" },
    { id: "l6", action: "完成「數學小精靈」測驗", tokens: 25, time: at(52), period: "7d" },
    { id: "l7", action: "與「古詩小助手」對話", tokens: 66, time: at(100), period: "7d" },
  ];
};

type TokenHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  quota?: { remaining?: number; monthlyLimit?: number } | null;
};

export const TokenHistoryModal: React.FC<TokenHistoryModalProps> = ({ isOpen, onClose, quota }) => {
  const [tokenTab, setTokenTab] = useState<TokenPeriod>("1h");
  const [logs, setLogs] = useState<TokenLog[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLogs(buildMockLogs());
    fetch(`${API_BASE}/api/student/token-logs`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "載入失敗");
        setLogs(Array.isArray(data?.logs) ? data.logs : buildMockLogs());
      })
      .catch(() => {
        // 後端未就緒 → 保留 mock
      });
  }, [isOpen]);

  const filteredLogs = logs.filter((log) => {
    if (tokenTab === "1h") return log.period === "1h";
    if (tokenTab === "1d") return log.period === "1h" || log.period === "1d";
    return true;
  });

  const remaining = quota?.remaining ?? 750;
  const monthlyLimit = quota?.monthlyLimit ?? 1000;

  const tabs: [TokenPeriod, string][] = [
    ["1h", "過去一小時"],
    ["1d", "過去一日"],
    ["7d", "過去七日"],
  ];

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-modal-title"
            className="relative w-full max-w-[450px] overflow-hidden rounded-[24px] bg-[var(--bg-card)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* 頭部：標題 + 剩餘額度 + 關閉 */}
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-5">
              <div>
                <h3 id="token-modal-title" className="text-lg font-black text-[var(--text-main)]">Token 消耗記錄</h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">剩餘可用：{remaining} / {monthlyLimit}</p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] transition hover:text-[var(--text-main)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* tab 切換 */}
            <div className="flex gap-2 bg-[var(--bg-app)] px-6 py-3">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTokenTab(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    tokenTab === id
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 記錄列表 */}
            <div className="max-h-[300px] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <p className="px-6 py-10 text-center text-xs text-[var(--text-faint)]">該時段沒有記錄</p>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-3 transition-colors last:border-b-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[var(--text-body)]">{log.action}</p>
                      <p className="text-[11px] text-[var(--text-faint)]">{log.time}</p>
                    </div>
                    <span
                      className={`shrink-0 pl-3 text-[13px] font-bold ${log.tokens > 0 ? "text-[#F43F5E]" : "text-[#10B981]"}`}
                    >
                      {log.tokens > 0 ? `-${log.tokens}` : `+${-log.tokens}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
