/** 主題版本分類標籤：預設四款 + 帳戶自訂（docs/knowledge-map-topic-versions.md 第 3 節） */
export const TOPIC_CATEGORY_PRESETS = ["單元課本", "補充講義", "課外延伸", "題庫對應"] as const;

export const MAX_CUSTOM_CATEGORY_LABELS = 10;

const PRESET_TONES: Record<string, string> = {
  單元課本: "bg-indigo-50 text-indigo-600",
  補充講義: "bg-emerald-50 text-emerald-600",
  課外延伸: "bg-amber-50 text-amber-600",
  題庫對應: "bg-rose-50 text-rose-600",
};

/** 分類 badge 配色；自訂標籤一律 slate */
export function topicCategoryTone(category: string): string {
  return PRESET_TONES[category] || "bg-slate-100 text-slate-600";
}
