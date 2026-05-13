import React from "react";
import type { FeatureEntitlement } from "../../hooks/useFeatureEntitlements";

const PRIMARY_FEATURE_KEYS = new Set(["bot_publish", "chat_messages"]);

export const FeatureLimitPanel: React.FC<{
  features: FeatureEntitlement[];
  compact?: boolean;
  dropdown?: boolean;
}> = ({ features, compact = false, dropdown = false }) => {
  const visibleFeatures = features.filter((feature) => PRIMARY_FEATURE_KEYS.has(feature.key));
  if (!visibleFeatures.length) return null;

  return (
    <div className={`${dropdown ? "w-full rounded-[24px] border border-slate-200/80 bg-white/95 p-4 shadow-lg backdrop-blur-md sm:w-[360px]" : `rounded-3xl border border-slate-200 bg-white ${compact ? "p-4" : "p-6"} shadow-sm`}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={`${compact ? "mt-1 text-base" : "mt-2 text-lg"} font-bold text-slate-900`}>
            免費版功能次數
          </h3>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${dropdown ? "grid-cols-1 max-h-[420px] overflow-y-auto pr-1" : compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {visibleFeatures.map((feature) => (
          <div
            key={feature.key}
            className={`rounded-2xl border p-4 ${
              feature.locked ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-slate-50/70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-800">{feature.label}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{feature.description}</div>
              </div>
              <div className={`rounded-full px-2 py-1 text-xs font-bold ${feature.locked ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                {feature.unlimited ? "無限制" : `${feature.used}/${feature.limit}`}
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className={`h-full rounded-full ${feature.locked ? "bg-rose-500" : "bg-indigo-500"}`}
                style={{ width: `${feature.unlimited ? 100 : Math.min(100, (feature.used / Math.max(feature.limit, 1)) * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-xs font-medium text-slate-600">
              {feature.unlimited ? "此帳戶無限制" : `已用 ${feature.used} / ${feature.limit} ${feature.countUnit}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
