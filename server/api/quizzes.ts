import crypto from "crypto";
import express from "express";
import { pool } from "../db.ts";
import { requireAuth, getAuthUser, ensurePlatformTables } from "../lib/platform-auth.ts";
import { getAI, getVertexAccessToken, getVertexAIConfig, isVertexAIEnabled } from "../lib/gemini-server.ts";

const router = express.Router();

type PreviewQuestion = {
  id: string | number;
  type: string;
  cognitiveLevel: string;
  levelColor: string;
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  points?: number;
  difficulty?: string;
};

type QuestionTypeKey = "mcq" | "fill" | "judge" | "short" | "essay";

type QuestionTypeDistributionItem = {
  key: QuestionTypeKey;
  label: string;
  count: number;
};

const GRADE_LABEL_MAP: Record<string, string> = {
  "P1-P3": "小一至小三",
  "P4-P6": "小四至小六",
  "S1-S3": "中一至中三",
  "S4-S6": "中四至中六",
};

const COGNITIVE_COLOR_MAP: Record<string, string> = {
  "記憶": "bg-blue-100 text-blue-700",
  "理解": "bg-emerald-100 text-emerald-700",
  "應用": "bg-amber-100 text-amber-700",
  "分析": "bg-orange-100 text-orange-700",
  "評價": "bg-red-100 text-red-700",
  "創造": "bg-fuchsia-100 text-fuchsia-700",
};

const QUESTION_TYPE_LABEL_MAP: Record<QuestionTypeKey, string> = {
  mcq: "多項選擇題",
  fill: "填充題",
  judge: "判斷題",
  short: "簡答題",
  essay: "論述題",
};

const QUESTION_TYPE_KEY_BY_LABEL: Record<string, QuestionTypeKey> = {
  多項選擇題: "mcq",
  填充題: "fill",
  判斷題: "judge",
  簡答題: "short",
  論述題: "essay",
};

export async function ensureQuizTables() {
  await ensurePlatformTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source_text TEXT NOT NULL,
      target_grade TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      question_type_mode TEXT NOT NULL DEFAULT 'ai_auto',
      preferred_question_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      question_type_distribution_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL,
      cognitive_level TEXT NOT NULL,
      question_text TEXT NOT NULL,
      options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL DEFAULT 1,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      order_index INTEGER NOT NULL DEFAULT 0,
      preview_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS quizzes_teacher_updated_idx ON quizzes(teacher_id, updated_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS quiz_questions_quiz_order_idx ON quiz_questions(quiz_id, order_index ASC);`);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS preferred_question_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS question_type_distribution_json JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      current_index INTEGER NOT NULL DEFAULT 0,
      answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      teacher_review_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      anomaly_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      score INTEGER NOT NULL DEFAULT 0,
      teacher_score INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL DEFAULT 0,
      result_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      teacher_status TEXT NOT NULL DEFAULT 'pending_grading',
      result_dismissed_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (quiz_id, student_id)
    );
  `);
  await pool.query(`
    ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS teacher_review_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS anomaly_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS teacher_score INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS teacher_status TEXT NOT NULL DEFAULT 'pending_grading',
    ADD COLUMN IF NOT EXISTS result_dismissed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS quiz_attempts_student_updated_idx ON quiz_attempts(student_id, updated_at DESC);`);
}

function cleanJsonPayload(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeQuestionType(input: string) {
  const value = String(input || "").trim();
  if (/^(選擇題|多選|单选|單選|multiple)/i.test(value)) return "多項選擇題";
  if (/^(簡答|short)/i.test(value)) return "簡答題";
  if (/^(填充|填空|fill)/i.test(value)) return "填充題";
  if (/^(論述|寫作|essay)/i.test(value)) return "論述題";
  if (/^(判斷|true\/false)/i.test(value)) return "判斷題";
  return value || "簡答題";
}

function normalizeQuestionTypeKey(input: string): QuestionTypeKey | null {
  const normalized = normalizeQuestionType(input);
  return QUESTION_TYPE_KEY_BY_LABEL[normalized] || null;
}

function normalizeCognitiveLevel(input: string) {
  const value = String(input || "").trim();
  if (!value) return "理解";
  if (/記憶|remember/i.test(value)) return "記憶";
  if (/理解|understand/i.test(value)) return "理解";
  if (/應用|apply/i.test(value)) return "應用";
  if (/分析|analyz/i.test(value)) return "分析";
  if (/評價|evaluate/i.test(value)) return "評價";
  if (/創造|create/i.test(value)) return "創造";
  return value;
}

function normalizeOptions(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((option) => String(option || "").trim())
    .filter(Boolean)
    .map((option, index) => {
      if (/^[A-D]\./.test(option)) return option;
      return `${String.fromCharCode(65 + index)}. ${option}`;
    });
}

function buildPreviewQuestion(raw: any, index: number): PreviewQuestion {
  const cognitiveLevel = normalizeCognitiveLevel(raw?.cognitiveLevel || raw?.bloomLevel || raw?.level);
  const type = normalizeQuestionType(raw?.type || raw?.questionType);
  const normalizedOptions = normalizeOptions(raw?.options);
  const options =
    type === "多項選擇題"
      ? normalizedOptions.slice(0, 4)
      : type === "判斷題"
      ? ["A. 正確", "B. 錯誤"]
      : [];
  const answer = String(raw?.answer || raw?.correctAnswer || "").trim();

  return {
    id: raw?.id || index + 1,
    type,
    cognitiveLevel,
    levelColor: COGNITIVE_COLOR_MAP[cognitiveLevel] || COGNITIVE_COLOR_MAP["理解"],
    content: String(raw?.content || raw?.questionText || "").trim(),
    options: options.length ? options : undefined,
    answer,
    explanation: String(raw?.explanation || "").trim(),
    points: Number(raw?.points || 1),
    difficulty: String(raw?.difficulty || "medium").trim() || "medium",
  };
}

async function askGeminiForQuiz(systemPrompt: string, userPrompt: string) {
  if (isVertexAIEnabled()) {
    const { project, location } = getVertexAIConfig();
    const accessToken = await getVertexAccessToken();
    const response = await fetch(
      `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      }
    );
    if (!response.ok) {
      throw new Error((await response.text()) || "Gemini request failed");
    }
    const data: any = await response.json();
    return String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: { systemInstruction: systemPrompt },
  });
  return String(response.text || "").trim();
}

async function rewriteQuizQuestionType(params: {
  sourceText: string;
  targetGrade: string;
  originalQuestion: PreviewQuestion;
  targetType: string;
}) {
  const targetType = normalizeQuestionType(params.targetType);
  const systemPrompt = `
你是一位資深中文科老師與測驗設計助手。
你的任務是保留原題的考核重點與文本依據，將題目改寫成指定題型。

請遵守：
- 語言：繁體中文
- 必須緊扣原文，不可脫離文本
- 保留原本大致相同的認知層級與考點
- 多項選擇題必須提供 4 個選項
- 判斷題 options 必須為 ["A. 正確", "B. 錯誤"]
- 非選擇題 options 回傳空陣列
- answer 必須可直接顯示
- explanation 需簡短且不可留空
- points 為正整數

只可回傳 JSON 物件，不要加任何額外說明。
  `.trim();

  const userPrompt = `
目標年級：${GRADE_LABEL_MAP[params.targetGrade] || params.targetGrade}
指定題型：${targetType}

原題資料：
${JSON.stringify(
    {
      type: params.originalQuestion.type,
      cognitiveLevel: params.originalQuestion.cognitiveLevel,
      content: params.originalQuestion.content,
      options: params.originalQuestion.options || [],
      answer: params.originalQuestion.answer,
      explanation: params.originalQuestion.explanation || "",
      points: params.originalQuestion.points || 1,
      difficulty: params.originalQuestion.difficulty || "medium",
    },
    null,
    2
  )}

文本內容：
${params.sourceText}

請回傳：
{
  "type": "${targetType}",
  "cognitiveLevel": "記憶 | 理解 | 應用 | 分析 | 評價 | 創造",
  "content": "題目內容",
  "options": ["選項1", "選項2"],
  "answer": "正確答案",
  "explanation": "簡短解析",
  "points": 1,
  "difficulty": "easy | medium | hard"
}
  `.trim();

  const raw = await askGeminiForQuiz(systemPrompt, userPrompt);
  return buildPreviewQuestion(JSON.parse(cleanJsonPayload(raw)), 0);
}

function buildQuizTitle(targetGrade: string, sourceText: string) {
  const gradeLabel = GRADE_LABEL_MAP[targetGrade] || targetGrade || "未分級";
  const firstLine = String(sourceText || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "AI 測驗";
  const trimmed = firstLine.length > 18 ? `${firstLine.slice(0, 18)}...` : firstLine;
  return `${gradeLabel} - ${trimmed}`;
}

function getRecommendedQuestionTypeKeys(targetGrade: string) {
  switch (targetGrade) {
    case "P1-P3":
      return ["mcq", "fill", "judge"] as QuestionTypeKey[];
    case "P4-P6":
      return ["mcq", "fill", "short"] as QuestionTypeKey[];
    case "S1-S3":
      return ["mcq", "fill", "short"] as QuestionTypeKey[];
    case "S4-S6":
      return ["mcq", "short", "essay"] as QuestionTypeKey[];
    default:
      return ["mcq", "fill", "short"] as QuestionTypeKey[];
  }
}

function buildQuestionTypeDistribution(targetGrade: string, questionCount: number, preferredKeys: QuestionTypeKey[]) {
  const keys = preferredKeys.length ? preferredKeys : getRecommendedQuestionTypeKeys(targetGrade);
  const safeCount = Math.max(1, questionCount);
  const base = Math.floor(safeCount / keys.length);
  let remainder = safeCount % keys.length;
  return keys.map((key) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return { key, label: QUESTION_TYPE_LABEL_MAP[key], count: base + extra };
  });
}

function normalizeDistribution(input: unknown, targetGrade: string, questionCount: number, preferredKeys: QuestionTypeKey[]) {
  if (!Array.isArray(input) || !input.length) {
    return buildQuestionTypeDistribution(targetGrade, questionCount, preferredKeys);
  }
  const items = input
    .map((item: any) => {
      const key = normalizeQuestionTypeKey(String(item?.key || item?.label || item?.type || ""));
      const count = Number(item?.count || 0);
      if (!key || !Number.isFinite(count) || count <= 0) return null;
      return { key, label: QUESTION_TYPE_LABEL_MAP[key], count };
    })
    .filter(Boolean) as QuestionTypeDistributionItem[];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!items.length || total !== questionCount) {
    return buildQuestionTypeDistribution(targetGrade, questionCount, preferredKeys);
  }
  return items;
}

async function recommendQuestionTypesWithGemini(targetGrade: string, questionCount: number) {
  const systemPrompt = [
    "你是香港學校老師的智能出題規劃助手。",
    "你要根據年級與總題數，推薦最合適的題型組合與各題型數量。",
    "只輸出 JSON，不要輸出 Markdown 或解釋。",
  ].join("\n");

  const userPrompt = `
目標年級：${GRADE_LABEL_MAP[targetGrade] || targetGrade}
總題數：${questionCount}

請回傳：
{
  "preferredQuestionTypes": ["mcq", "fill"],
  "questionTypeDistribution": [
    { "key": "mcq", "count": 2 },
    { "key": "fill", "count": 2 },
    { "key": "judge", "count": 1 }
  ]
}

規則：
- key 只可使用：mcq, fill, judge, short, essay
- 題型數量總和必須剛好等於 ${questionCount}
- 最多推薦 3 種題型
- 請優先考慮該年級最適合的題型難度
  `.trim();

  const raw = await askGeminiForQuiz(systemPrompt, userPrompt);
  const parsed = JSON.parse(cleanJsonPayload(raw));
  const preferredQuestionTypes = Array.isArray(parsed?.preferredQuestionTypes)
    ? parsed.preferredQuestionTypes.map((item: any) => normalizeQuestionTypeKey(String(item || ""))).filter(Boolean) as QuestionTypeKey[]
    : [];
  const questionTypeDistribution = normalizeDistribution(
    parsed?.questionTypeDistribution,
    targetGrade,
    questionCount,
    preferredQuestionTypes
  );

  return {
    preferredQuestionTypes: preferredQuestionTypes.length
      ? preferredQuestionTypes
      : questionTypeDistribution.map((item) => item.key),
    questionTypeDistribution,
  };
}

async function generateQuestionsByDistribution(params: {
  selectedBotName: string;
  sourceText: string;
  targetGrade: string;
  distribution: QuestionTypeDistributionItem[];
}) {
  const systemPrompt = [
    "你是香港學校老師的智能出題助手。",
    "請根據提供的文本、目標年級與指定題型，產生繁體中文測驗題目。",
    "你只能輸出合法 JSON，不能輸出 Markdown、說明、註解或多餘文字。",
  ].join("\n");

  const generatedQuestions: PreviewQuestion[] = [];

  for (const item of params.distribution) {
    const userPrompt = `
請依照以下條件產生測驗題目：
- Bot 名稱：${params.selectedBotName}
- 目標年級：${GRADE_LABEL_MAP[params.targetGrade] || params.targetGrade}
- 指定題型：${item.label}
- 此題型題目數量：${item.count}
- 語言：繁體中文

文本內容：
${params.sourceText}

請只回傳以下 JSON 物件：
{
  "questions": [
    {
      "type": "${item.label}",
      "cognitiveLevel": "記憶 | 理解 | 應用 | 分析 | 評價 | 創造",
      "content": "題目內容",
      "options": ["選項1", "選項2"],
      "answer": "正確答案",
      "explanation": "簡短解析",
      "points": 1,
      "difficulty": "easy | medium | hard"
    }
  ]
}

要求：
- questions 長度必須剛好等於 ${item.count}
- 所有題目都必須是 ${item.label}
- 多項選擇題要提供 4 個選項
- 判斷題 options 必須為 ["A. 正確", "B. 錯誤"]
- 非選擇題的 options 要回傳空陣列
- answer 必須具體可顯示
- explanation 可簡短但不能留空
- 題目內容不可脫離文本
    `.trim();

    const raw = await askGeminiForQuiz(systemPrompt, userPrompt);
    const parsed = JSON.parse(cleanJsonPayload(raw));
    const typedQuestions = Array.isArray(parsed?.questions)
      ? parsed.questions.map((question: any, index: number) =>
          buildPreviewQuestion({ ...question, type: item.label }, generatedQuestions.length + index)
        )
      : [];

    if (typedQuestions.length !== item.count) {
      throw new Error(`Gemini returned invalid count for ${item.label}`);
    }
    if (typedQuestions.some((question) => normalizeQuestionType(question.type) !== item.label)) {
      throw new Error(`Gemini returned invalid type for ${item.label}`);
    }

    generatedQuestions.push(...typedQuestions);
  }

  return generatedQuestions.map((question, index) => ({ ...question, id: index + 1 }));
}

async function generateQuestionsAuto(params: {
  selectedBotName: string;
  sourceText: string;
  targetGrade: string;
  questionCount: number;
}) {
  const systemPrompt = [
    "你是香港學校老師的智能出題助手。",
    "請根據提供的文本、目標年級與指定 Bot 產生繁體中文測驗題目。",
    "你只能輸出合法 JSON，不能輸出 Markdown、說明、註解或多餘文字。",
    "題目格式必須可直接用於教師端預覽頁。",
  ].join("\n");

  const userPrompt = `
請依照以下條件產生測驗題目：
- Bot 名稱：${params.selectedBotName}
- 目標年級：${GRADE_LABEL_MAP[params.targetGrade] || params.targetGrade}
- 題目數量：${params.questionCount}
- 題型模式：由你根據年級自動分配最適合的題型與題量
- 語言：繁體中文

文本內容：
${params.sourceText}

請只回傳以下 JSON 物件：
{
  "title": "測驗標題",
  "questions": [
    {
      "type": "多項選擇題 | 簡答題 | 填充題 | 論述題 | 判斷題",
      "cognitiveLevel": "記憶 | 理解 | 應用 | 分析 | 評價 | 創造",
      "content": "題目內容",
      "options": ["選項1", "選項2"],
      "answer": "正確答案",
      "explanation": "簡短解析",
      "points": 1,
      "difficulty": "easy | medium | hard"
    }
  ]
}

要求：
- questions 長度必須剛好等於 ${params.questionCount}
- 你需要自行決定最適合該年級的題型組合與每種題型數量
- title 需是一個適合作為老師測驗名稱的繁體中文標題，簡潔清楚
- 多項選擇題要提供 4 個選項
- 判斷題 options 必須為 ["A. 正確", "B. 錯誤"]
- 非選擇題的 options 要回傳空陣列
- answer 必須具體可顯示
- explanation 可簡短但不能留空
- 題目內容不可脫離文本
  `.trim();

  const raw = await askGeminiForQuiz(systemPrompt, userPrompt);
  const parsed = JSON.parse(cleanJsonPayload(raw));
  const questions = Array.isArray(parsed?.questions)
    ? parsed.questions.map((item: any, index: number) => buildPreviewQuestion(item, index))
    : [];
  return {
    title: String(parsed?.title || "").trim(),
    questions: questions.map((question, index) => ({ ...question, id: index + 1 })),
  };
}


type AttemptStatus = "pending" | "deferred" | "in_progress" | "completed";

async function listQuizQuestions(quizId: string) {
  const result = await pool.query(
    `SELECT id, preview_payload_json, correct_answer, points
     FROM quiz_questions
     WHERE quiz_id=$1
     ORDER BY order_index ASC, created_at ASC`,
    [quizId]
  );
  return result.rows.map((row, index) => ({
    id: String(row.id),
    preview: row.preview_payload_json || {},
    correctAnswer: String(row.correct_answer || ""),
    points: Number(row.points || 1),
    index,
  }));
}

function sanitizeQuestionForStudent(input: any, fallbackId?: string | number) {
  const preview = input?.preview || input || {};
  const options = Array.isArray(preview.options)
    ? preview.options.map((option: any) => String(option || "").trim()).filter(Boolean)
    : [];

  return {
    id: fallbackId ?? preview.id,
    type: String(preview.type || ""),
    cognitiveLevel: String(preview.cognitiveLevel || ""),
    levelColor: String(preview.levelColor || ""),
    content: String(preview.content || ""),
    ...(options.length ? { options } : {}),
  };
}

async function canUserAccessQuizBot(botId: string, user: { id: string; role?: string | null }) {
  const role = String(user.role || "");

  if (role === "admin") return true;

  if (role === "teacher") {
    const ownedQuiz = await pool.query(
      `SELECT 1
       FROM quizzes
       WHERE bot_id=$1 AND teacher_id=$2
       LIMIT 1`,
      [botId, user.id]
    );
    return Boolean(ownedQuiz.rowCount);
  }

  const sharedBot = await pool.query(
    `SELECT 1
     FROM bot_student_shares
     WHERE bot_id=$1 AND student_id=$2
     LIMIT 1`,
    [botId, user.id]
  );
  return Boolean(sharedBot.rowCount);
}

function buildQuizResult(score: number, totalPoints: number) {
  const safeTotal = Math.max(1, totalPoints);
  const percent = Math.round((score / safeTotal) * 100);
  if (percent >= 90) {
    return { grade: "A", title: "領航者 (Navigator)", message: "表現非常出色，你已經穩穩掌握這次的核心知識。", percent };
  }
  if (percent >= 75) {
    return { grade: "B", title: "探索者 (Explorer)", message: "整體掌握得不錯，再多一點練習就能更上一層樓。", percent };
  }
  if (percent >= 60) {
    return { grade: "C", title: "啟航者 (Voyager)", message: "別氣餒！這是學習的必經過程，我們再複習一下核心概念吧。", percent };
  }
  return { grade: "D", title: "練習者 (Builder)", message: "先把基礎打穩，我們一步一步把這次的知識補起來。", percent };
}

function normalizeAnswerForCompare(input: string) {
  return String(input || "")
    .trim()
    .replace(/^[A-Z]\s*[.．、]\s*/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function resolveObjectiveCorrectAnswer(correctAnswer: string, options: string[]) {
  const raw = String(correctAnswer || "").trim();
  const letterOnly = raw.match(/^([A-D])$/i);
  if (letterOnly) {
    return options.find((option) => option.trim().startsWith(`${letterOnly[1].toUpperCase()}.`)) || raw;
  }
  return raw;
}

function isObjectiveAnswerCorrect(studentAnswer: string, correctAnswer: string, options: string[]) {
  const normalizedStudent = normalizeAnswerForCompare(studentAnswer);
  const normalizedCorrect = normalizeAnswerForCompare(correctAnswer);
  if (normalizedStudent && normalizedStudent === normalizedCorrect) return true;
  const resolvedCorrect = resolveObjectiveCorrectAnswer(correctAnswer, options);
  return normalizedStudent === normalizeAnswerForCompare(resolvedCorrect);
}

function splitReferenceAnswerVariants(referenceAnswer: string) {
  return String(referenceAnswer || "")
    .split(/\r?\n|\/|／|或|;|；/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractReferenceKeywords(referenceAnswer: string) {
  return String(referenceAnswer || "")
    .split(/[，。！？、；：,.\s()（）「」『』【】]+/)
    .map((part) => normalizeAnswerForCompare(part))
    .filter((part) => part.length >= 2);
}

function bigramDiceCoefficient(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a === b ? 1 : 0;
  const aBigrams = new Map<string, number>();
  const bBigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    aBigrams.set(gram, (aBigrams.get(gram) || 0) + 1);
  }
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    bBigrams.set(gram, (bBigrams.get(gram) || 0) + 1);
  }
  let overlap = 0;
  aBigrams.forEach((count, gram) => {
    overlap += Math.min(count, bBigrams.get(gram) || 0);
  });
  return (2 * overlap) / ((a.length - 1) + (b.length - 1));
}

function fastGradeReferenceAnswer(referenceAnswer: string, answer: string, maxPoints: number) {
  const normalizedStudent = normalizeAnswerForCompare(answer);
  const variants = splitReferenceAnswerVariants(referenceAnswer)
    .map((variant) => ({
      raw: variant,
      normalized: normalizeAnswerForCompare(variant),
      keywords: extractReferenceKeywords(variant),
    }))
    .filter((variant) => variant.normalized || variant.keywords.length);

  if (!normalizedStudent || !variants.length) return null;

  for (const variant of variants) {
    if (variant.normalized && normalizedStudent === variant.normalized) {
      return {
        points: maxPoints,
        feedback: "答案正確，已完成快速評分。",
        gradedBy: "fast_exact",
      };
    }
    if (
      variant.normalized &&
      variant.normalized.length >= 2 &&
      (normalizedStudent.includes(variant.normalized) || variant.normalized.includes(normalizedStudent))
    ) {
      return {
        points: maxPoints,
        feedback: "答案與參考答案表述接近，已完成快速評分。",
        gradedBy: "fast_contains",
      };
    }
  }

  let bestKeywordRatio = 0;
  let bestSimilarity = 0;
  for (const variant of variants) {
    const matchedKeywords = variant.keywords.filter((keyword) => normalizedStudent.includes(keyword)).length;
    const keywordRatio = variant.keywords.length ? matchedKeywords / variant.keywords.length : 0;
    const similarity = variant.normalized ? bigramDiceCoefficient(normalizedStudent, variant.normalized) : 0;
    bestKeywordRatio = Math.max(bestKeywordRatio, keywordRatio);
    bestSimilarity = Math.max(bestSimilarity, similarity);
  }

  if (bestKeywordRatio >= 0.85 || bestSimilarity >= 0.88) {
    return {
      points: maxPoints,
      feedback: "答案與參考答案高度接近，已完成快速評分。",
      gradedBy: "fast_similarity_high",
    };
  }

  if (bestKeywordRatio >= 0.6 || bestSimilarity >= 0.72) {
    return {
      points: maxPoints,
      feedback: "答案核心內容相符，已完成快速評分。",
      gradedBy: "fast_similarity_mid",
    };
  }

  const hasAnyReferenceKeywords = variants.some((variant) => variant.keywords.length > 0);
  const clearlyIncorrect =
    (hasAnyReferenceKeywords && bestKeywordRatio === 0 && bestSimilarity <= 0.24) ||
    (bestKeywordRatio <= 0.15 && bestSimilarity <= 0.18);

  if (clearlyIncorrect) {
    return {
      points: 0,
      feedback: "答案與參考答案差異較大，已完成快速判分。",
      gradedBy: "fast_incorrect",
    };
  }

  return null;
}

async function gradeSubjectiveAnswer(question: any, answer: string) {
  const maxPoints = Number(question.points || 1);
  const referenceAnswer = String(question.correctAnswer || "").trim();
  const questionType = normalizeQuestionType(String(question.preview?.type || question.question_type || ""));
  if ((questionType === "填充題" || questionType === "簡答題") && referenceAnswer) {
    const fastResult = fastGradeReferenceAnswer(referenceAnswer, answer, maxPoints);
    if (fastResult) return fastResult;
  }
  const systemPrompt = "你是嚴謹但鼓勵學生的中文測驗評分老師。只輸出 JSON，不要 Markdown。";
  const userPrompt = `
請根據題目、參考答案與學生答案評分。
滿分：${maxPoints}
題目：${String(question.preview?.content || "")}
參考答案：${referenceAnswer || "沒有標準答案，請依題意評估。"}
學生答案：${answer}

輸出 JSON：
{"points": 0到${maxPoints}的數字, "feedback": "一句繁體中文簡短評語"}
`.trim();

  try {
    const raw = await askGeminiForQuiz(systemPrompt, userPrompt);
    const parsed = JSON.parse(cleanJsonPayload(raw));
    const points = Math.max(0, Math.min(maxPoints, Number(parsed?.points || 0)));
    return {
      points,
      feedback: String(parsed?.feedback || "").trim(),
      gradedBy: "gemini",
    };
  } catch {
    const expectedTerms = referenceAnswer
      .split(/[，。！？、；：\s]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);
    const matched = expectedTerms.filter((term) => answer.includes(term)).length;
    const ratio = expectedTerms.length ? matched / expectedTerms.length : (answer.length >= 12 ? 0.5 : 0);
    return {
      points: Math.round(maxPoints * Math.max(0, Math.min(1, ratio))),
      feedback: "已依參考答案關鍵內容完成初步評分。",
      gradedBy: "fallback",
    };
  }
}

async function getOrCreateAttempt(quizId: string, studentId: string, botId: string) {
  const existing = await pool.query(
    `SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 LIMIT 1`,
    [quizId, studentId]
  );
  if (existing.rowCount) return existing.rows[0];
  const created = await pool.query(
    `INSERT INTO quiz_attempts (id, quiz_id, student_id, bot_id, status)
     VALUES ($1,$2,$3,$4,'pending')
     RETURNING *`,
    [crypto.randomUUID(), quizId, studentId, botId]
  );
  return created.rows[0];
}

function detectAttemptAnomalies(questions: Array<{ preview: any }>, answers: any[]) {
  const flags = new Set<string>();
  const answerText = answers.map((item) => String(item?.answer || "")).join("\n");
  const lowerAnswerText = answerText.toLowerCase();
  if (/活著好像沒什麼意義|不想活|自殺|死後/.test(answerText)) flags.add("wellbeing");
  if (/asdf|不知道 不知道|亂寫|不想寫|有夠蠢/.test(answerText)) flags.add("effort");
  if (/住在|電話|地址|彌敦道|身份證/.test(answerText)) flags.add("privacy");
  if (/in conclusion|chatgpt|gemini|ai generated/.test(lowerAnswerText)) flags.add("academic");
  if (/腦袋有洞|白痴|垃圾|蠢/.test(answerText)) flags.add("inappropriate");
  const hasBlankQuestion = questions.some((item) => normalizeQuestionType(String(item.preview?.type || "")) === "填充題");
  if (hasBlankQuestion && answers.some((item) => String(item?.answer || "").trim().length <= 1)) {
    flags.add("effort");
  }
  return Array.from(flags);
}

function buildAttemptTeacherStatus(status: string, publishedAt?: string | null) {
  if (publishedAt) return "completed";
  if (status === "completed") return "pending_confirm";
  return "pending_grading";
}


function getNumberOrFallback(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(score: number, maxScore: number) {
  return Math.max(0, Math.min(Math.max(0, maxScore), score));
}

function recomputeAttemptScoresForPublish(
  attempt: any,
  questions: Array<{ id: string; preview: any; correctAnswer: string; points: number; index: number }>
) {
  const questionById = new Map(questions.map((question) => [String(question.id), question]));
  const answers = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
  const existingReview = Array.isArray(attempt.teacher_review_json) ? attempt.teacher_review_json : [];

  const normalizedAnswers = answers
    .map((answer: any, answerIndex: number) => {
      const fallbackIndex = getNumberOrFallback(answer?.questionIndex, answerIndex);
      const question = questionById.get(String(answer?.questionId || "")) || questions[fallbackIndex];
      if (!question) return null;

      const questionIndex = getNumberOrFallback(answer?.questionIndex, question.index ?? fallbackIndex);
      const maxScore = Number(question.points || 1);
      const options = Array.isArray(question.preview?.options) ? question.preview.options : [];
      const isObjective = options.length > 0;
      const reviewItem = existingReview.find(
        (item: any) => Number(item?.questionIndex) === questionIndex || String(item?.questionId || "") === String(question.id)
      );

      const recomputedPoints = isObjective
        ? isObjectiveAnswerCorrect(String(answer?.answer || ""), String(question.correctAnswer || ""), options)
          ? maxScore
          : 0
        : getNumberOrFallback(reviewItem?.finalPoints ?? answer?.points, 0);
      const points = clampScore(recomputedPoints, maxScore);

      return {
        ...answer,
        questionIndex,
        questionId: String(question.id),
        answer: String(answer?.answer || ""),
        isCorrect: isObjective ? points === maxScore : points >= maxScore,
        points,
        feedback: String(answer?.feedback || ""),
        gradedBy: isObjective ? "answer_key" : String(answer?.gradedBy || "teacher"),
      };
    })
    .filter(Boolean) as any[];

  const answerByQuestionId = new Map(normalizedAnswers.map((answer) => [String(answer.questionId), answer]));
  const teacherReview = questions.map((question, questionIndex) => {
    const answer = answerByQuestionId.get(String(question.id));
    const existing = existingReview.find(
      (item: any) => Number(item?.questionIndex) === questionIndex || String(item?.questionId || "") === String(question.id)
    );
    const maxScore = Number(question.points || 1);
    const finalPoints = clampScore(getNumberOrFallback(answer?.points ?? existing?.finalPoints, 0), maxScore);

    return {
      questionIndex,
      questionId: String(question.id),
      finalPoints,
      teacherComment: String(existing?.teacherComment || ""),
    };
  });

  const teacherScore = teacherReview.reduce((sum, item) => sum + Number(item.finalPoints || 0), 0);
  const totalPoints = questions.reduce((sum, question) => sum + Number(question.points || 1), 0);
  const result = buildQuizResult(teacherScore, totalPoints);

  return {
    normalizedAnswers,
    teacherReview,
    teacherScore,
    totalPoints,
    resultPayload: {
      ...result,
      score: result.percent,
      rawScore: teacherScore,
      totalPoints,
    },
  };
}

async function getActiveQuizForBot(botId: string, viewerId?: string | null) {
  await ensureQuizTables();
  const quizResult = await pool.query(
    `SELECT *
     FROM quizzes
     WHERE bot_id=$1 AND status='published'
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [botId]
  );
  if (!quizResult.rowCount) return null;

  const quiz = quizResult.rows[0];
  const questions = await listQuizQuestions(String(quiz.id));
  let attempt = null;

  if (viewerId) {
    const attemptResult = await pool.query(
      `SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 LIMIT 1`,
      [quiz.id, viewerId]
    );
    attempt = attemptResult.rows[0] || null;
  }

  if (attempt?.status === "completed" && attempt?.result_dismissed_at) {
    return {
      quiz: null,
      questions: [],
      currentQuestion: null,
      attempt: null,
      dismissed: true,
    };
  }

  return {
    quiz: {
      id: String(quiz.id),
      title: String(quiz.title || "知識測試"),
      botId: String(quiz.bot_id),
      targetGrade: String(quiz.target_grade || ""),
      questionCount: Number(quiz.question_count || questions.length),
      status: String(quiz.status || "draft"),
    },
    questions,
    currentQuestion: questions[Math.min(Number(attempt?.current_index || 0), questions.length - 1)]?.preview || null,
    attempt,
    dismissed: false,
  };
}

router.get("/quizzes/drafts", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await pool.query(
      `SELECT id, title, target_grade, question_count, updated_at, created_at
       FROM quizzes
       WHERE teacher_id=$1 AND status='draft'
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 20`,
      [user.id]
    );
    return res.json({
      drafts: result.rows.map((row) => ({
        id: String(row.id),
        title: String(row.title || "未命名測驗"),
        targetGrade: String(row.target_grade || ""),
        questionCount: Number(row.question_count || 0),
        updatedAt: row.updated_at || row.created_at,
      })),
    });
  } catch (error) {
    console.error("GET /quizzes/drafts Failed:", error);
    return res.status(500).json({ error: "Failed to load drafts" });
  }
});

router.get("/quizzes/:id", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const quizId = String(req.params.id || "").trim();
    const quizResult = await pool.query(
      `SELECT *
       FROM quizzes
       WHERE id=$1 AND teacher_id=$2
       LIMIT 1`,
      [quizId, user.id]
    );
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });
    const quiz = quizResult.rows[0];
    const questions = await listQuizQuestions(quizId);
    return res.json({
      quiz: {
        id: String(quiz.id),
        title: String(quiz.title || ""),
        botId: String(quiz.bot_id),
        targetGrade: String(quiz.target_grade || ""),
        questionCount: Number(quiz.question_count || questions.length),
        questionTypeMode: String(quiz.question_type_mode || "ai_auto"),
        preferredQuestionTypes: Array.isArray(quiz.preferred_question_types_json) ? quiz.preferred_question_types_json : [],
        questionTypeDistribution: Array.isArray(quiz.question_type_distribution_json) ? quiz.question_type_distribution_json : [],
        status: String(quiz.status || "draft"),
        sourceText: String(quiz.source_text || ""),
      },
      questions: questions.map((item, index) => ({ ...item.preview, id: index + 1 })),
    });
  } catch (error) {
    console.error("GET /quizzes/:id Failed:", error);
    return res.status(500).json({ error: "Failed to load quiz" });
  }
});

router.get("/teachers/me/available-quiz-bots", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const result = await pool.query(
      `SELECT DISTINCT b.id, b.name, b.subject, b.avatar_url
       FROM bot_student_shares s
       JOIN bots b ON b.id = s.bot_id
       WHERE s.teacher_id=$1
       ORDER BY b.name ASC`,
      [user.id]
    );

    return res.json({
      bots: result.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name || "未命名 Bot"),
        subject: String(row.subject || ""),
        avatarUrl: String(row.avatar_url || ""),
      })),
    });
  } catch (error) {
    console.error("GET /teachers/me/available-quiz-bots Failed:", error);
    return res.status(500).json({ error: "Failed to load available quiz bots" });
  }
});

router.post("/quizzes/recommend-question-types", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const targetGrade = String(req.body?.targetGrade || "").trim();
    const questionCount = Number(req.body?.questionCount || 0);
    if (!targetGrade) return res.status(400).json({ error: "請先選擇目標年級。" });
    if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 15) {
      return res.status(400).json({ error: "請選擇有效的題目數量。" });
    }

    const recommendation = await recommendQuestionTypesWithGemini(targetGrade, questionCount);
    return res.json({
      preferredQuestionTypes: recommendation.preferredQuestionTypes,
      questionTypeDistribution: recommendation.questionTypeDistribution,
    });
  } catch (error) {
    console.error("POST /quizzes/recommend-question-types Failed:", error);
    return res.status(500).json({ error: "AI 題型推薦失敗，請稍後再試。" });
  }
});

router.post("/quizzes/generate", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const botId = String(req.body?.botId || "").trim();
    const sourceText = String(req.body?.sourceText || "").trim();
    const targetGrade = String(req.body?.targetGrade || "").trim();
    const questionCount = Number(req.body?.questionCount || 0);
    const questionTypeMode = String(req.body?.questionTypeMode || "ai_auto").trim() || "ai_auto";
    const preferredQuestionTypes = Array.isArray(req.body?.preferredQuestionTypes)
      ? req.body.preferredQuestionTypes
          .map((item: any) => normalizeQuestionTypeKey(String(item || "")))
          .filter(Boolean) as QuestionTypeKey[]
      : [];
    const questionTypeDistribution = normalizeDistribution(
      req.body?.questionTypeDistribution,
      targetGrade,
      questionCount,
      preferredQuestionTypes
    );

    if (!botId) return res.status(400).json({ error: "請先選擇要發布測驗的 AI Bot。" });
    if (!sourceText) return res.status(400).json({ error: "請先輸入測驗文本。" });
    if (!targetGrade) return res.status(400).json({ error: "請先選擇目標年級。" });
    if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 15) {
      return res.status(400).json({ error: "請選擇有效的題目數量。" });
    }

    const botResult = await pool.query(
      `SELECT DISTINCT b.id, b.name, b.subject, b.avatar_url
       FROM bot_student_shares s
       JOIN bots b ON b.id = s.bot_id
       WHERE s.teacher_id=$1 AND s.bot_id=$2
       LIMIT 1`,
      [user.id, botId]
    );
    const selectedBot = botResult.rows[0];
    if (!selectedBot) {
      return res.status(400).json({ error: "請先選擇要發布測驗的 AI Bot。" });
    }

    const autoResult =
      questionTypeMode === "rule_based"
        ? null
        : await generateQuestionsAuto({
            selectedBotName: String(selectedBot.name || "AI Bot"),
            sourceText,
            targetGrade,
            questionCount,
          });
    const previewQuestions =
      questionTypeMode === "rule_based"
        ? await generateQuestionsByDistribution({
            selectedBotName: String(selectedBot.name || "AI Bot"),
            sourceText,
            targetGrade,
            distribution: questionTypeDistribution,
          })
        : autoResult?.questions || [];

    if (previewQuestions.length !== questionCount) {
      throw new Error("Gemini returned invalid question count");
    }
    if (previewQuestions.some((question) => !question.content || !question.answer)) {
      throw new Error("Gemini returned incomplete questions");
    }

    const quizId = crypto.randomUUID();
    const title =
      (questionTypeMode === "ai_auto" ? String(autoResult?.title || "").trim() : "") ||
      buildQuizTitle(targetGrade, sourceText);

    await pool.query(
      `INSERT INTO quizzes (
        id, bot_id, teacher_id, title, source_text, target_grade, question_count, question_type_mode,
        preferred_question_types_json, question_type_distribution_json, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'draft')`,
      [
        quizId,
        botId,
        user.id,
        title,
        sourceText,
        targetGrade,
        questionCount,
        questionTypeMode,
        JSON.stringify(preferredQuestionTypes),
        JSON.stringify(questionTypeDistribution),
      ]
    );

    for (let index = 0; index < previewQuestions.length; index += 1) {
      const question = previewQuestions[index];
      await pool.query(
        `INSERT INTO quiz_questions (
          id, quiz_id, question_type, cognitive_level, question_text, options_json,
          correct_answer, explanation, points, difficulty, order_index, preview_payload_json
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb)`,
        [
          crypto.randomUUID(),
          quizId,
          question.type,
          question.cognitiveLevel,
          question.content,
          JSON.stringify(question.options || []),
          question.answer,
          question.explanation || "",
          Number(question.points || 1),
          question.difficulty || "medium",
          index,
          JSON.stringify({ ...question, id: index + 1 }),
        ]
      );
    }

    return res.json({
      quizId,
      status: "draft",
      quiz: {
        id: quizId,
        title,
        botId,
        targetGrade,
        questionCount,
        questionTypeMode,
        preferredQuestionTypes,
        questionTypeDistribution,
      },
      selectedBot: {
        id: String(selectedBot.id),
        name: String(selectedBot.name || "未命名 Bot"),
        subject: String(selectedBot.subject || ""),
        avatarUrl: String(selectedBot.avatar_url || ""),
      },
      questions: previewQuestions.map((question, index) => ({ ...question, id: index + 1 })),
    });
  } catch (error: any) {
    console.error("POST /quizzes/generate Failed:", error);
    return res.status(500).json({ error: "AI 題目生成失敗，請稍後再試。" });
  }
});

router.patch("/quizzes/:id/draft", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const quizId = String(req.params.id || "").trim();
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "請輸入測驗名稱。" });
    const updated = await pool.query(
      `UPDATE quizzes
       SET title=$1, updated_at=NOW()
       WHERE id=$2 AND teacher_id=$3
       RETURNING id, title, status`,
      [title, quizId, user.id]
    );
    if (!updated.rowCount) return res.status(404).json({ error: "Quiz not found" });
    return res.json({
      ok: true,
      quiz: {
        id: String(updated.rows[0].id),
        title: String(updated.rows[0].title || ""),
        status: String(updated.rows[0].status || "draft"),
      },
    });
  } catch (error) {
    console.error("PATCH /quizzes/:id/draft Failed:", error);
    return res.status(500).json({ error: "儲存草稿失敗，請稍後再試。" });
  }
});

router.post("/quizzes/:id/questions/:questionId/rewrite-type", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const quizId = String(req.params.id || "").trim();
    const questionId = String(req.params.questionId || "").trim();
    const targetType = normalizeQuestionType(String(req.body?.targetType || "").trim());
    if (!quizId || !questionId || !targetType) {
      return res.status(400).json({ error: "缺少必要參數。" });
    }

    const quizResult = await pool.query(
      `SELECT id, teacher_id, source_text, target_grade
       FROM quizzes
       WHERE id=$1 AND teacher_id=$2`,
      [quizId, user.id]
    );
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });

    const displayOrderIndex = Number.isFinite(Number(questionId)) ? Math.max(0, Number(questionId) - 1) : -1;
    const questionResult = await pool.query(
      `SELECT id, question_type, cognitive_level, question_text, options_json, correct_answer, explanation, points, difficulty, order_index, preview_payload_json
       FROM quiz_questions
       WHERE quiz_id=$2 AND (id=$1 OR order_index=$3)`,
      [questionId, quizId, displayOrderIndex]
    );
    if (!questionResult.rowCount) return res.status(404).json({ error: "Question not found" });

    const quizRow = quizResult.rows[0];
    const questionRow = questionResult.rows[0];
    const originalQuestion = buildPreviewQuestion(
      {
        ...(questionRow.preview_payload_json || {}),
        id: Number(questionRow.order_index || 0) + 1,
        type: questionRow.question_type,
        cognitiveLevel: questionRow.cognitive_level,
        content: questionRow.question_text,
        options: questionRow.options_json,
        answer: questionRow.correct_answer,
        explanation: questionRow.explanation,
        points: questionRow.points,
        difficulty: questionRow.difficulty,
      },
      Number(questionRow.order_index || 0)
    );

    const rewritten = await rewriteQuizQuestionType({
      sourceText: String(quizRow.source_text || ""),
      targetGrade: String(quizRow.target_grade || ""),
      originalQuestion,
      targetType,
    });

    if (!rewritten.content || !rewritten.answer) {
      throw new Error("Gemini returned incomplete rewritten question");
    }

    const finalQuestion = {
      ...rewritten,
      id: Number(questionRow.order_index || 0) + 1,
      type: targetType,
    };

    await pool.query(
      `UPDATE quiz_questions
       SET question_type=$1,
           cognitive_level=$2,
           question_text=$3,
           options_json=$4::jsonb,
           correct_answer=$5,
           explanation=$6,
           points=$7,
           difficulty=$8,
           preview_payload_json=$9::jsonb
       WHERE id=$10 AND quiz_id=$11`,
      [
        finalQuestion.type,
        finalQuestion.cognitiveLevel,
        finalQuestion.content,
        JSON.stringify(finalQuestion.options || []),
        finalQuestion.answer,
        finalQuestion.explanation || "",
        Number(finalQuestion.points || 1),
        finalQuestion.difficulty || "medium",
        JSON.stringify(finalQuestion),
        String(questionRow.id),
        quizId,
      ]
    );

    return res.json({ ok: true, question: finalQuestion });
  } catch (error) {
    console.error("POST /quizzes/:id/questions/:questionId/rewrite-type Failed:", error);
    return res.status(500).json({ error: "修改題型失敗，請稍後再試。" });
  }
});

router.delete("/quizzes/:id", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const quizId = String(req.params.id || "").trim();
    const deleted = await pool.query(
      `DELETE FROM quizzes
       WHERE id=$1 AND teacher_id=$2
       RETURNING id`,
      [quizId, user.id]
    );
    if (!deleted.rowCount) return res.status(404).json({ error: "Quiz not found" });
    return res.json({ ok: true, id: quizId });
  } catch (error) {
    console.error("DELETE /quizzes/:id Failed:", error);
    return res.status(500).json({ error: "刪除測驗失敗，請稍後再試。" });
  }
});

router.post("/quizzes/:id/publish", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const quizId = String(req.params.id || "").trim();
    const updated = await pool.query(
      `UPDATE quizzes
       SET status='published', updated_at=NOW()
       WHERE id=$1 AND teacher_id=$2
       RETURNING id, bot_id, title, status`,
      [quizId, user.id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    const botId = String(updated.rows[0].bot_id);
    const studentShares = await pool.query(
      `SELECT student_id
       FROM bot_student_shares
       WHERE teacher_id=$1 AND bot_id=$2`,
      [user.id, botId]
    );
    for (const row of studentShares.rows) {
      await getOrCreateAttempt(quizId, String(row.student_id), botId);
    }
    return res.json({
      ok: true,
      quizId: String(updated.rows[0].id),
      botId,
      title: String(updated.rows[0].title || ""),
      status: String(updated.rows[0].status || "published"),
    });
  } catch (error) {
    console.error("POST /quizzes/:id/publish Failed:", error);
    return res.status(500).json({ error: "發佈測驗失敗，請稍後再試。" });
  }
});

router.get("/bots/:botId/active-quiz", requireAuth, async (req, res) => {
  try {
    const botId = String(req.params.botId || "").trim();
    if (!botId) return res.status(400).json({ error: "bot id is required" });

    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const canAccess = await canUserAccessQuizBot(botId, user);
    if (!canAccess) return res.status(403).json({ error: "quiz access denied" });

    const payload = await getActiveQuizForBot(botId, user.id);
    if (!payload) return res.json({ quiz: null });

    return res.json({
      quiz: payload.quiz,
      dismissed: Boolean((payload as any)?.dismissed),
      attempt: payload.attempt
        ? {
            id: String(payload.attempt.id),
            status: String(payload.attempt.status),
            currentIndex: Number(payload.attempt.current_index || 0),
            score: Number(payload.attempt.score || 0),
            totalPoints: Number(payload.attempt.total_points || 0),
            result: payload.attempt.result_payload_json || {},
          }
        : null,
      allQuestions: Array.isArray(payload.questions)
        ? payload.questions.map((item: any, index: number) => sanitizeQuestionForStudent(item, index + 1))
        : [],
      currentQuestion: payload.currentQuestion ? sanitizeQuestionForStudent(payload.currentQuestion) : null,
    });
  } catch (error) {
    console.error("GET /bots/:botId/active-quiz Failed:", error);
    return res.status(500).json({ error: "Failed to load active quiz" });
  }
});

router.post("/quizzes/:id/attempts/start", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const quizId = String(req.params.id || "").trim();
    const quizResult = await pool.query(`SELECT id, bot_id, title FROM quizzes WHERE id=$1 AND status='published' LIMIT 1`, [quizId]);
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });
    const quiz = quizResult.rows[0];
    const canAccess = await canUserAccessQuizBot(String(quiz.bot_id), user);
    if (!canAccess) return res.status(403).json({ error: "quiz access denied" });
    const forceRestart = Boolean(req.body?.restart);

    const questions = await listQuizQuestions(quizId);
    const attempt = await getOrCreateAttempt(quizId, user.id, String(quiz.bot_id));
    const updated = await pool.query(
      `UPDATE quiz_attempts
       SET status='in_progress',
           current_index=CASE
             WHEN $2::boolean THEN 0
             WHEN status IN ('pending', 'completed') THEN 0
             ELSE current_index
           END,
           started_at=CASE WHEN $2::boolean THEN NOW() ELSE COALESCE(started_at, NOW()) END,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [attempt.id, forceRestart]
    );
    const next = updated.rows[0];
    return res.json({
      quiz: {
        id: quizId,
        title: String(quiz.title || "知識測試"),
        questionCount: questions.length,
      },
      attempt: {
        id: String(next.id),
        status: String(next.status) as AttemptStatus,
        currentIndex: Number(next.current_index || 0),
      },
      allQuestions: questions.map((item, index) => sanitizeQuestionForStudent(item, index + 1)),
      currentQuestion: questions[Math.min(Number(next.current_index || 0), questions.length - 1)]
        ? sanitizeQuestionForStudent(questions[Math.min(Number(next.current_index || 0), questions.length - 1)])
        : null,
      totalQuestions: questions.length,
    });
  } catch (error) {
    console.error("POST /quizzes/:id/attempts/start Failed:", error);
    return res.status(500).json({ error: "開始測驗失敗，請稍後再試。" });
  }
});

router.post("/quizzes/:id/attempts/defer", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const quizId = String(req.params.id || "").trim();
    const quizResult = await pool.query(`SELECT id, bot_id FROM quizzes WHERE id=$1 AND status='published' LIMIT 1`, [quizId]);
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });
    const canAccess = await canUserAccessQuizBot(String(quizResult.rows[0].bot_id), user);
    if (!canAccess) return res.status(403).json({ error: "quiz access denied" });

    const attempt = await getOrCreateAttempt(quizId, user.id, String(quizResult.rows[0].bot_id));
    await pool.query(
      `UPDATE quiz_attempts SET status='deferred', updated_at=NOW() WHERE id=$1`,
      [attempt.id]
    );
    return res.json({ ok: true, status: "deferred" });
  } catch (error) {
    console.error("POST /quizzes/:id/attempts/defer Failed:", error);
    return res.status(500).json({ error: "稍後作答設定失敗，請稍後再試。" });
  }
});

router.post("/quizzes/:id/attempts/reset", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const quizId = String(req.params.id || "").trim();
    const quizResult = await pool.query(`SELECT id, bot_id FROM quizzes WHERE id=$1 AND status='published' LIMIT 1`, [quizId]);
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });

    const canAccess = await canUserAccessQuizBot(String(quizResult.rows[0].bot_id), user);
    if (!canAccess) return res.status(403).json({ error: "quiz access denied" });

    await pool.query(
      `UPDATE quiz_attempts
       SET status='pending', current_index=0, answers_json='[]'::jsonb, score=0, total_points=0,
           teacher_review_json='[]'::jsonb, anomaly_flags_json='[]'::jsonb, teacher_score=0,
           teacher_status='pending_grading', result_payload_json='{}'::jsonb, result_dismissed_at=NULL,
           published_at=NULL, started_at=NULL, completed_at=NULL, updated_at=NOW()
       WHERE quiz_id=$1 AND student_id=$2`,
      [quizId, user.id]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error("POST /quizzes/:id/attempts/reset Failed:", error);
    return res.status(500).json({ error: "重新作答失敗，請稍後再試。" });
  }
});

router.post("/quizzes/:id/attempts/answer", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const quizId = String(req.params.id || "").trim();
    const questionIndex = Number(req.body?.questionIndex || 0);
    const answer = String(req.body?.answer || "").trim();
    const quizResult = await pool.query(`SELECT id, bot_id, title FROM quizzes WHERE id=$1 AND status='published' LIMIT 1`, [quizId]);
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });
    const quiz = quizResult.rows[0];
    const canAccess = await canUserAccessQuizBot(String(quiz.bot_id), user);
    if (!canAccess) return res.status(403).json({ error: "quiz access denied" });

    const payload = await getActiveQuizForBot(String(quiz.bot_id), user.id).catch(() => null);
    const questions = await listQuizQuestions(quizId);
    const target = questions[questionIndex];
    if (!target) return res.status(400).json({ error: "題目不存在。" });
    const attempt = await getOrCreateAttempt(quizId, user.id, String(quiz.bot_id));
    const previousAnswers = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
    const nextAnswers = previousAnswers.filter((item: any) => Number(item?.questionIndex) !== questionIndex);
    const isObjective = Array.isArray(target.preview?.options) && target.preview.options.length > 0;
    const correct = isObjectiveAnswerCorrect(
      answer,
      target.correctAnswer,
      Array.isArray(target.preview?.options) ? target.preview.options : []
    );
    const subjectiveGrade = isObjective ? null : await gradeSubjectiveAnswer(target, answer);
    nextAnswers.push({
      questionIndex,
      questionId: target.id,
      answer,
      isCorrect: isObjective ? correct : Number(subjectiveGrade?.points || 0) >= Number(target.points || 1),
      points: isObjective ? (correct ? target.points : 0) : Number(subjectiveGrade?.points || 0),
      feedback: subjectiveGrade?.feedback || "",
      gradedBy: isObjective ? "answer_key" : subjectiveGrade?.gradedBy || "gemini",
    });
    nextAnswers.sort((a: any, b: any) => Number(a.questionIndex) - Number(b.questionIndex));

    const score = nextAnswers.reduce((sum: number, item: any) => sum + Number(item.points || 0), 0);
    const totalPoints = questions.reduce((sum, item) => sum + Number(item.points || 1), 0);
    const nextIndex = questionIndex + 1;
    const isCompleted = nextIndex >= questions.length;
    const result: ReturnType<typeof buildQuizResult> | null = isCompleted ? buildQuizResult(score, totalPoints) : null;
    const anomalyFlags = isCompleted ? detectAttemptAnomalies(questions, nextAnswers) : [];
    const teacherReview = nextAnswers.map((item: any) => ({
      questionIndex: Number(item.questionIndex),
      questionId: String(item.questionId || ""),
      finalPoints: Number(item.points || 0),
      teacherComment: "",
    }));
    const nextStatus = isCompleted ? "completed" : "in_progress";
    const teacherStatus = buildAttemptTeacherStatus(nextStatus, null);

    const updated = await pool.query(
      `UPDATE quiz_attempts
       SET status=$1,
           current_index=$2,
           answers_json=$3::jsonb,
           score=$4,
           total_points=$5,
           teacher_review_json=$6::jsonb,
           anomaly_flags_json=$7::jsonb,
           teacher_score=$8,
           teacher_status=$9,
           result_payload_json=$10::jsonb,
           completed_at=$11,
           result_dismissed_at=NULL,
           updated_at=NOW()
       WHERE id=$12
       RETURNING *`,
      [
        nextStatus,
        Math.min(nextIndex, questions.length - 1),
        JSON.stringify(nextAnswers),
        score,
        totalPoints,
        JSON.stringify(teacherReview),
        JSON.stringify(anomalyFlags),
        score,
        teacherStatus,
        JSON.stringify(result || {}),
        isCompleted ? new Date().toISOString() : null,
        attempt.id,
      ]
    );

    return res.json({
      ok: true,
      status: isCompleted ? "completed" : "in_progress",
      currentIndex: Number(updated.rows[0]?.current_index || 0),
      nextQuestion: !isCompleted && questions[nextIndex] ? sanitizeQuestionForStudent(questions[nextIndex]) : null,
      totalQuestions: questions.length,
      result: isCompleted
        ? {
            ...result,
            score: result?.percent || 0,
            rawScore: score,
            totalPoints,
            title: String(quiz.title || "知識測試"),
          }
        : null,
      quiz: payload?.quiz || {
        id: quizId,
        title: String(quiz.title || "知識測試"),
        botId: String(quiz.bot_id),
      },
    });
  } catch (error) {
    console.error("POST /quizzes/:id/attempts/answer Failed:", error);
    return res.status(500).json({ error: "提交答案失敗，請稍後再試。" });
  }
});

router.post("/quizzes/:id/attempts/dismiss-result", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const quizId = String(req.params.id || "").trim();
    const quizResult = await pool.query(`SELECT id, bot_id FROM quizzes WHERE id=$1 AND status='published' LIMIT 1`, [quizId]);
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });

    const canAccess = await canUserAccessQuizBot(String(quizResult.rows[0].bot_id), user);
    if (!canAccess) return res.status(403).json({ error: "quiz access denied" });

    await pool.query(
      `UPDATE quiz_attempts
       SET result_dismissed_at=NOW(), updated_at=NOW()
       WHERE quiz_id=$1 AND student_id=$2 AND status='completed'`,
      [quizId, user.id]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error("POST /quizzes/:id/attempts/dismiss-result Failed:", error);
    return res.status(500).json({ error: "完成結算失敗，請稍後再試。" });
  }
});

router.get("/teachers/me/grading-summary", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const result = await pool.query(
      `SELECT
        q.id,
        q.title,
        q.updated_at,
        b.subject,
        COUNT(*) FILTER (WHERE u.id IS NOT NULL)::int AS total_students,
        COUNT(*) FILTER (WHERE u.id IS NOT NULL AND a.teacher_status='pending_grading')::int AS pending_grading,
        COUNT(*) FILTER (WHERE u.id IS NOT NULL AND a.teacher_status='pending_confirm')::int AS pending_confirm,
        COUNT(*) FILTER (WHERE u.id IS NOT NULL AND a.teacher_status='completed')::int AS completed
       FROM quizzes q
       LEFT JOIN quiz_attempts a ON a.quiz_id=q.id
       LEFT JOIN users u ON u.id=a.student_id AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
       LEFT JOIN bots b ON b.id=q.bot_id
       WHERE q.teacher_id=$1 AND q.status='published'
       GROUP BY q.id, b.subject
       ORDER BY q.updated_at DESC, q.created_at DESC`,
      [user.id]
    );
    return res.json({
      quizzes: result.rows.map((row) => ({
        id: String(row.id),
        title: String(row.title || ""),
        subject: String(row.subject || "未分類"),
        date: row.updated_at,
        totalStudents: Number(row.total_students || 0),
        pendingGrading: Number(row.pending_grading || 0),
        pendingConfirm: Number(row.pending_confirm || 0),
        completed: Number(row.completed || 0),
      })),
    });
  } catch (error) {
    console.error("GET /teachers/me/grading-summary Failed:", error);
    return res.status(500).json({ error: "Failed to load grading summary" });
  }
});

router.get("/quizzes/:id/grading-detail", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const quizId = String(req.params.id || "").trim();
    const quizResult = await pool.query(
      `SELECT q.id, q.title, q.question_count, q.updated_at
       FROM quizzes q
       WHERE q.id=$1 AND q.teacher_id=$2
       LIMIT 1`,
      [quizId, user.id]
    );
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });
    const quiz = quizResult.rows[0];
    const questionRows = await listQuizQuestions(quizId);
    const attempts = await pool.query(
      `SELECT a.*, u.full_name
       FROM quiz_attempts a
       JOIN users u ON u.id=a.student_id
       WHERE a.quiz_id=$1
         AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
       ORDER BY
         CASE a.teacher_status
           WHEN 'pending_confirm' THEN 0
           WHEN 'pending_grading' THEN 1
           ELSE 2
         END,
         a.updated_at DESC`,
      [quizId]
    );
    const questionById = new Map(questionRows.map((row) => [String(row.id), row]));
    const students = attempts.rows.map((row) => {
      const answers = Array.isArray(row.answers_json) ? row.answers_json : [];
      const review = Array.isArray(row.teacher_review_json) ? row.teacher_review_json : [];
      const anomalyFlags = Array.isArray(row.anomaly_flags_json) ? row.anomaly_flags_json : [];
      const normalizedAnswers = answers.map((answer: any, index: number) => {
        const question = questionById.get(String(answer?.questionId || "")) || questionRows[index];
        const reviewItem = review.find((item: any) => Number(item?.questionIndex) === Number(answer?.questionIndex));
        const options = Array.isArray(question?.preview?.options) ? question.preview.options : [];
        const isObjective = options.length > 0;
        const recomputedCorrect = isObjective
          ? isObjectiveAnswerCorrect(String(answer?.answer || ""), String(question?.correctAnswer || ""), options)
          : Boolean(answer?.isCorrect);
        const recomputedScore = isObjective
          ? recomputedCorrect
            ? Number(question?.points || 1)
            : 0
          : Number(reviewItem?.finalPoints ?? answer?.points ?? 0);
        return {
          questionId: String(answer?.questionId || question?.id || index + 1),
          questionIndex: Number(answer?.questionIndex || index),
          question: String(question?.preview?.content || ""),
          type: String(question?.preview?.type || ""),
          cognitiveLevel: String(question?.preview?.cognitiveLevel || ""),
          options,
          studentAnswer: String(answer?.answer || ""),
          correctAnswer: String(question?.correctAnswer || ""),
          isCorrect: recomputedCorrect,
          score: recomputedScore,
          aiScore: Number(answer?.points || 0),
          maxScore: Number(question?.points || 1),
          feedback: String(answer?.feedback || ""),
        };
      });
      const recomputedScoreTotal = normalizedAnswers.reduce((sum, item) => sum + Number(item.score || 0), 0);
      return {
        id: String(row.student_id),
        attemptId: String(row.id),
        name: String(row.full_name || "學生"),
        submittedAt: row.completed_at || row.updated_at,
        status: String(row.teacher_status || buildAttemptTeacherStatus(String(row.status || "pending"), row.published_at)),
        anomalyFlags,
        score: recomputedScoreTotal,
        totalPoints: Number(row.total_points || 0),
        answers: normalizedAnswers,
      };
    });
    const completedStudents = students.filter((student) => student.status === "completed").length;
    const pendingConfirmStudents = students.filter((student) => student.status === "pending_confirm").length;
    const pendingGradingStudents = students.filter((student) => student.status === "pending_grading").length;
    const averageScore = students.length
      ? students.reduce((sum, student) => sum + student.score, 0) / students.length
      : 0;
    return res.json({
      quiz: {
        id: String(quiz.id),
        title: String(quiz.title || ""),
        questionCount: Number(quiz.question_count || questionRows.length),
        updatedAt: quiz.updated_at,
      },
      metrics: {
        totalStudents: students.length,
        pendingGrading: pendingGradingStudents,
        pendingConfirm: pendingConfirmStudents,
        completed: completedStudents,
        averageScore: Number(averageScore.toFixed(1)),
        anomalyCount: students.reduce((sum, student) => sum + student.anomalyFlags.length, 0),
      },
      students,
    });
  } catch (error) {
    console.error("GET /quizzes/:id/grading-detail Failed:", error);
    return res.status(500).json({ error: "Failed to load grading detail" });
  }
});

router.post("/quizzes/:id/grading/publish", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const quizId = String(req.params.id || "").trim();
    await client.query("BEGIN");

    const quizResult = await client.query(
      `SELECT id, title
       FROM quizzes
       WHERE id=$1 AND teacher_id=$2
       LIMIT 1
       FOR UPDATE`,
      [quizId, user.id]
    );
    if (!quizResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Quiz not found" });
    }

    const questionResult = await client.query(
      `SELECT id, preview_payload_json, correct_answer, points
       FROM quiz_questions
       WHERE quiz_id=$1
       ORDER BY order_index ASC, created_at ASC`,
      [quizId]
    );
    const questions = questionResult.rows.map((row, index) => ({
      id: String(row.id),
      preview: row.preview_payload_json || {},
      correctAnswer: String(row.correct_answer || ""),
      points: Number(row.points || 1),
      index,
    }));

    const attempts = await client.query(
      `SELECT a.*
       FROM quiz_attempts a
       JOIN users u ON u.id=a.student_id
       WHERE a.quiz_id=$1
         AND a.status='completed'
         AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
       FOR UPDATE OF a`,
      [quizId]
    );

    for (const attempt of attempts.rows) {
      const recomputed = recomputeAttemptScoresForPublish(attempt, questions);
      await client.query(
        `UPDATE quiz_attempts
         SET answers_json=$1::jsonb,
             teacher_review_json=$2::jsonb,
             score=$3,
             teacher_score=$3,
             total_points=$4,
             result_payload_json=$5::jsonb,
             teacher_status='completed',
             published_at=NOW(),
             updated_at=NOW()
         WHERE id=$6`,
        [
          JSON.stringify(recomputed.normalizedAnswers),
          JSON.stringify(recomputed.teacherReview),
          recomputed.teacherScore,
          recomputed.totalPoints,
          JSON.stringify(recomputed.resultPayload),
          String(attempt.id),
        ]
      );
    }

    await client.query("COMMIT");
    return res.json({ ok: true, publishedCount: attempts.rowCount });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("POST /quizzes/:id/grading/publish Failed:", error);
    return res.status(500).json({ error: "批量發佈成績失敗，請稍後再試。" });
  } finally {
    client.release();
  }
});

export default router;
