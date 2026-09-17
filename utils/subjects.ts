// 學科分類：工作坊（知識與教學設定）同客制化申請頁共用同一份清單。
// 過往兩邊各自維護（工作坊 7 項、申請頁 9 項），今次統一由呢度派生，避免再走散。
//
// value：穩定 id，只用於程式內部比對
// label：實際寫入 bots.subject 嘅值（中文），改動會影響舊資料顯示
// color：只准 6 位 flat hex —— UI chip 用 `${color}1A` 加 alpha 做底色，唔支援漸變
export type SubjectOption = {
  value: string;
  label: string;
  color: string;
};

export const SUBJECT_OPTIONS: SubjectOption[] = [
  { value: "chinese-language", label: "中國語文", color: "#F43F5E" },
  { value: "chinese-history", label: "中國歷史 · 歷史科", color: "#F59E0B" },
  { value: "english-language", label: "英國語文 (English Language)", color: "#3B82F6" },
  { value: "mathematics-logic", label: "數學科 · 邏輯思維", color: "#8B5CF6" },
  { value: "primary-gs-interdisciplinary", label: "小學常識科 · 跨學科", color: "#22C55E" },
  { value: "stem-science", label: "科學 · STEM · 創科教育", color: "#06B6D4" },
  { value: "citizenship-civic", label: "公民與社會發展科 (CS) · 德育及公民教育", color: "#14B8A6" },
  { value: "sen-inclusion", label: "SEN 特殊教育 · 社交與情緒共融", color: "#D946EF" },
  { value: "campus-library-career", label: "校園導覽 · 圖書館 · 升學規劃", color: "#64748B" },
];

// 舊 7 項分類嘅 label / value，舊 bot 靠呢度映射到新調色盤而唔會跌灰色。
// 刻意唔保留舊色家族：一套調色盤好過兩套並存（例：amber 而家係中國歷史科，
// 若果科技/編程照留 #F59E0B 就會同歷史科撞色，睇落似同一科）。
const LEGACY_SUBJECT_COLORS: Record<string, string> = {
  "語文（中文）": "#F43F5E",
  chinese: "#F43F5E",
  "英文": "#3B82F6",
  english: "#3B82F6",
  "數學": "#8B5CF6",
  math: "#8B5CF6",
  "科學": "#06B6D4",
  science: "#06B6D4",
  "科技/編程": "#06B6D4",
  tech: "#06B6D4",
  "常識/人文": "#22C55E",
  humanities: "#22C55E",
  "藝術/其他": "#D946EF",
  other: "#D946EF",
  // 以下三個唔屬舊 7 分類，係實際資料入面出現過嘅自由文字（本地 DB：歷史 ×5、
  // STEM／工藝 ×2；preview mock 學生清單：語文）。但凡查唔到都會跌落灰色，
  // 呢度只係見到幾多補幾多 —— 唔可能窮舉，灰色 fallback 仍然係常態。
  "語文": "#F43F5E",
  "歷史": "#F59E0B",
  "STEM／工藝": "#06B6D4",
};

export function subjectOptionOf(subject: string): SubjectOption | undefined {
  return SUBJECT_OPTIONS.find((option) => option.label === subject || option.value === subject);
}

export function subjectColorOf(subject: string): string {
  return subjectOptionOf(subject)?.color ?? LEGACY_SUBJECT_COLORS[subject] ?? "#94A3B8";
}
