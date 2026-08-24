// 學科分類 enum（兩層結構的層 1——細分學科；對接文件「學科分類建議」定稿）
// 顏色沿用 UI Pack 學科色；層 2（STEM 大類）由後端自動映射，前端不顯示
export type SubjectOption = {
  value: string;
  label: string;
  color: string;
};

export const SUBJECT_OPTIONS: SubjectOption[] = [
  { value: "chinese", label: "語文（中文）", color: "#F43F5E" },
  { value: "english", label: "英文", color: "#3B82F6" },
  { value: "math", label: "數學", color: "#8B5CF6" },
  { value: "science", label: "科學", color: "#10B981" },
  { value: "tech", label: "科技/編程", color: "#F59E0B" },
  { value: "humanities", label: "常識/人文", color: "#14B8A6" },
  { value: "other", label: "藝術/其他", color: "linear-gradient(135deg, #F472B6, #A855F7)" },
];

export function subjectColorOf(subject: string): string {
  return SUBJECT_OPTIONS.find((option) => option.label === subject || option.value === subject)?.color ?? "#94A3B8";
}
