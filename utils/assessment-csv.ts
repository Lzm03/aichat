import { uiText } from './uiI18n';

type AssessmentAnswer = {
  questionIndex?: number;
  type?: string;
  cognitiveLevel?: string;
  question?: string;
  studentAnswer?: string;
  correctAnswer?: string;
  aiScore?: number;
  score?: number;
  maxScore?: number;
  isCorrect?: boolean;
  feedback?: string;
};

type AssessmentStudent = {
  name?: string;
  account?: string;
  className?: string;
  submittedAt?: string;
  status?: string;
  score?: number;
  totalPoints?: number;
  anomalyFlags?: string[];
  answers?: AssessmentAnswer[];
};

type AssessmentExport = {
  quiz?: { title?: string; publishedAt?: string };
  students?: AssessmentStudent[];
};

/** 布魯姆六層級，順序即等級數字：1=記憶 … 6=創造 */
const BLOOM_LEVEL_LABELS = ['記憶', '理解', '應用', '分析', '評價', '創造'];

/**
 * 學生嘅布魯姆層級評分 = 最高答啱嘅題目層級（數字 + 中文名）；
 * 冇答啱任何題 → null。能力追蹤卡同 CSV 匯出都用同一條規則，保證兩邊一致。
 */
export function computeBloomLevel(
  answers: Array<{ cognitiveLevel?: string; isCorrect?: boolean }> | undefined | null
): { level: number; label: string } | null {
  let bestIndex = -1;
  for (const answer of answers || []) {
    const index = BLOOM_LEVEL_LABELS.indexOf(String(answer?.cognitiveLevel || ''));
    if (index < 0 || !answer?.isCorrect) continue;
    if (index > bestIndex) bestIndex = index;
  }
  return bestIndex >= 0 ? { level: bestIndex + 1, label: BLOOM_LEVEL_LABELS[bestIndex] } : null;
}

const csvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const safeFilename = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '評測結果';

/** Excel 友善日期：本地時區 YYYY-MM-DD */
const formatLocalDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * 批改成果 CSV：每學生一行，欄位 [學生姓名, 班級, 測驗日期, 思維層級評分, 最終分數, 答對率]，
 * 保留 UTF-8 BOM + CRLF，可直接用 Excel 開啟提交科組。
 */
export function downloadAssessmentResultsCsv(data: AssessmentExport | null | undefined) {
  const students = Array.isArray(data?.students) ? data.students : [];
  if (!students.length) return false;

  const headers = ['學生姓名', '班級', '測驗日期', '思維層級評分', '最終分數', '答對率'];
  const quizTitle = String(data?.quiz?.title || uiText('未命名測驗'));
  const quizDate = data?.quiz?.publishedAt ? formatLocalDate(data.quiz.publishedAt) : '';

  const rows = students.map((student) => {
    const answers = Array.isArray(student.answers) ? student.answers : [];
    const answeredCount = answers.length;
    const correctCount = answers.filter((answer) => answer.isCorrect).length;
    const correctRate = answeredCount > 0 ? Number(((correctCount / answeredCount) * 100).toFixed(1)) : '';
    const bloom = computeBloomLevel(answers);
    return [
      student.name || uiText('學生'),
      student.className || '',
      quizDate,
      bloom ? `L${bloom.level} ${bloom.label}` : '—',
      answeredCount ? Number(student.score || 0) : '',
      correctRate,
    ];
  });

  const csv = `\uFEFF${[headers.map(uiText), ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(quizTitle)}-${uiText('批改成果')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

type AbilityExportLevel = {
  key: string;
  value: number;
  answered: number;
  correct: number;
};

type AbilityExportStudent = {
  studentId: string;
  name: string;
  recent: Record<string, number>;
  past: Record<string, number> | null;
};

type AbilityExport = {
  period: '30d' | 'all';
  classLevels?: AbilityExportLevel[];
  students?: AbilityExportStudent[];
};

const BLOOM_CSV_LABELS = BLOOM_LEVEL_LABELS;
const BLOOM_CSV_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

/** Export the Bloom ability report (class aggregate + per-student recent/past series). */
export function downloadAbilityReportCsv(data: AbilityExport | null | undefined) {
  const students = Array.isArray(data?.students) ? data.students : [];
  const classLevels = Array.isArray(data?.classLevels) ? data.classLevels : [];
  if (!students.length && !classLevels.length) return false;

  const twoSeries = data?.period !== 'all';
  const headers = ['學生', ...BLOOM_CSV_LABELS.flatMap((label) =>
    twoSeries ? [`${label}（${uiText('近期表現')}）`, `${label}（${uiText('過往平均')}）`] : [label]
  )];
  const levelValue = (levels: Record<string, number>, key: string) => Number(levels?.[key] ?? 0);

  const rows: (string | number)[][] = [];
  if (classLevels.length) {
    const classRow: (string | number)[] = [uiText('全班')];
    for (const key of BLOOM_CSV_KEYS) {
      const level = classLevels.find((item) => item.key === key);
      if (twoSeries) {
        classRow.push(Number(level?.value ?? 0), '');
      } else {
        classRow.push(Number(level?.value ?? 0));
      }
    }
    rows.push(classRow);
  }
  for (const student of students) {
    const row: (string | number)[] = [student.name || uiText('學生')];
    for (const key of BLOOM_CSV_KEYS) {
      if (twoSeries) {
        row.push(levelValue(student.recent, key), student.past ? levelValue(student.past, key) : '');
      } else {
        row.push(levelValue(student.recent, key));
      }
    }
    rows.push(row);
  }

  const csv = `﻿${[headers.map(uiText), ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${uiText('能力追蹤報告')}-${twoSeries ? uiText('過去一個月') : uiText('全期')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
