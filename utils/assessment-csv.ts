import { uiText, uiLocale } from './uiI18n';

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
  submittedAt?: string;
  status?: string;
  score?: number;
  totalPoints?: number;
  anomalyFlags?: string[];
  answers?: AssessmentAnswer[];
};

type AssessmentExport = {
  quiz?: { title?: string };
  students?: AssessmentStudent[];
};

const STATUS_LABELS: Record<string, string> = {
  pending_grading: '待批改',
  pending_confirm: '待確認',
  completed: '已完成',
};

const csvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const safeFilename = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '評測結果';

export function downloadAssessmentResultsCsv(data: AssessmentExport | null | undefined) {
  const students = Array.isArray(data?.students) ? data.students : [];
  if (!students.length) return false;

  const headers = [
    '測驗', '學生', '提交時間', '批改狀態', '總得分', '總分', '得分百分比',
    '題號', '題型', '布魯姆層級', '題目', '學生答案', '正確答案',
    'AI 分數', '教師最終分數', '題目滿分', '是否正確', 'AI 評語', '異常標記',
  ];
  const quizTitle = String(data?.quiz?.title || uiText('未命名測驗'));
  const rows = students.flatMap((student) => {
    const answers = Array.isArray(student.answers) && student.answers.length ? student.answers : [{}];
    const totalPoints = Number(student.totalPoints || 0);
    const score = Number(student.score || 0);
    const percent = totalPoints > 0 ? Number(((score / totalPoints) * 100).toFixed(1)) : 0;
    const submittedAt = student.submittedAt
      ? new Date(student.submittedAt).toLocaleString(uiLocale(), { hour12: false })
      : '';

    return answers.map((answer, index) => [
      quizTitle,
      student.name || uiText('學生'),
      submittedAt,
      uiText(STATUS_LABELS[String(student.status || '')] || student.status || ''),
      score,
      totalPoints,
      percent,
      Number(answer.questionIndex ?? index) + 1,
      uiText(answer.type || ''),
      uiText(answer.cognitiveLevel || ''),
      answer.question || '',
      answer.studentAnswer || '',
      answer.correctAnswer || '',
      Number(answer.aiScore || 0),
      Number(answer.score || 0),
      Number(answer.maxScore || 0),
      uiText(answer.isCorrect ? '是' : '否'),
      answer.feedback || '',
      Array.isArray(student.anomalyFlags) ? student.anomalyFlags.join('、') : '',
    ]);
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

const BLOOM_CSV_LABELS = ['記憶', '理解', '應用', '分析', '評價', '創造'];
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
