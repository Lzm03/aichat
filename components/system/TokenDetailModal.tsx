import React from 'react';
import { motion } from 'framer-motion';
export interface ProviderUsage {
  provider: string;
  status: "ok" | "warning" | "error" | "unsupported";
  remaining?: number | null;
  total?: number | null;
  unit?: string;
  message?: string;
  checkedAt: string;
}

interface TokenDetailModalProps {
  providers: ProviderUsage[];
  loading: boolean;
  error?: string | null;
}

const colorByStatus: Record<ProviderUsage["status"], string> = {
  ok: "text-emerald-600",
  warning: "text-amber-600",
  error: "text-rose-600",
  unsupported: "text-slate-500",
};

const labelByStatus: Record<ProviderUsage["status"], string> = {
  ok: "正常",
  warning: "需配置",
  error: "接口異常",
  unsupported: "不支援",
};

export const TokenDetailModal: React.FC<TokenDetailModalProps> = ({ providers, loading, error }) => {
  const fmt = (v?: number | null) =>
    typeof v === "number" ? v.toFixed(2) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="absolute top-full right-0 mt-2 w-96 bg-white rounded-3xl shadow-lg border border-slate-200/80 z-30 p-4 origin-top-right"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800">第三方 API 額度監控</h3>
      </div>

      <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2 -mr-2">
        {loading ? (
          <div className="text-sm text-slate-500">正在更新配額資料...</div>
        ) : (
          <ul className="space-y-3">
            {providers.map((p) => (
              <li key={p.provider} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">{p.provider}</p>
                  <span className={`text-xs font-semibold ${colorByStatus[p.status]}`}>
                    {labelByStatus[p.status]}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {fmt(p.remaining) !== null
                    ? `剩餘：${fmt(p.remaining)}${p.unit ? ` ${p.unit}` : ""}`
                    : "剩餘：未知"}
                  {fmt(p.total) !== null
                    ? ` / 總額：${fmt(p.total)}${p.unit ? ` ${p.unit}` : ""}`
                    : ""}
                </div>
                {p.message ? (
                  <div className="mt-1 text-xs text-slate-500">{p.message}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-slate-400">
                  更新：{new Date(p.checkedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && providers.length === 0 ? (
          <div className="text-sm text-slate-500">
            尚無可用資料
            {error ? <div className="mt-1 text-xs text-rose-500">錯誤：{error}</div> : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};
