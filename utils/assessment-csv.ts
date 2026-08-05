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
  const quizTitle = String(data?.quiz?.title || '未命名測驗');
  const rows = students.flatMap((student) => {
    const answers = Array.isArray(student.answers) && student.answers.length ? student.answers : [{}];
    const totalPoints = Number(student.totalPoints || 0);
    const score = Number(student.score || 0);
    const percent = totalPoints > 0 ? Number(((score / totalPoints) * 100).toFixed(1)) : 0;
    const submittedAt = student.submittedAt
      ? new Date(student.submittedAt).toLocaleString('zh-HK', { hour12: false })
      : '';

    return answers.map((answer, index) => [
      quizTitle,
      student.name || '學生',
      submittedAt,
      STATUS_LABELS[String(student.status || '')] || student.status || '',
      score,
      totalPoints,
      percent,
      Number(answer.questionIndex ?? index) + 1,
      answer.type || '',
      answer.cognitiveLevel || '',
      answer.question || '',
      answer.studentAnswer || '',
      answer.correctAnswer || '',
      Number(answer.aiScore || 0),
      Number(answer.score || 0),
      Number(answer.maxScore || 0),
      answer.isCorrect ? '是' : '否',
      answer.feedback || '',
      Array.isArray(student.anomalyFlags) ? student.anomalyFlags.join('、') : '',
    ]);
  });

  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(quizTitle)}-批改成果.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
