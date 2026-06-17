import crypto from "crypto";
import express from "express";
import { pool } from "../db.ts";
import { requireAuth, getAuthUser, ensurePlatformTables, optionalAuth } from "../lib/platform-auth.ts";
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
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      current_index INTEGER NOT NULL DEFAULT 0,
      answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      score INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL DEFAULT 0,
      result_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (quiz_id, student_id)
    );
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
  const options = normalizeOptions(raw?.options);
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

function buildQuizTitle(targetGrade: string, sourceText: string) {
  const gradeLabel = GRADE_LABEL_MAP[targetGrade] || targetGrade || "未分級";
  const firstLine = String(sourceText || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "AI 測驗";
  const trimmed = firstLine.length > 18 ? `${firstLine.slice(0, 18)}...` : firstLine;
  return `${gradeLabel} - ${trimmed}`;
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

async function gradeSubjectiveAnswer(question: any, answer: string) {
  const maxPoints = Number(question.points || 1);
  const referenceAnswer = String(question.correctAnswer || "").trim();
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

    const systemPrompt = [
      "你是香港學校老師的智能出題助手。",
      "請根據提供的文本、目標年級與指定 Bot 產生繁體中文測驗題目。",
      "你只能輸出合法 JSON，不能輸出 Markdown、說明、註解或多餘文字。",
      "題目格式必須可直接用於教師端預覽頁。",
    ].join("\n");

    const userPrompt = `
請依照以下條件產生測驗題目：
- Bot 名稱：${String(selectedBot.name || "AI Bot")}
- 目標年級：${GRADE_LABEL_MAP[targetGrade] || targetGrade}
- 題目數量：${questionCount}
- 題型模式：${questionTypeMode}
- 語言：繁體中文

文本內容：
${sourceText}

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
- questions 長度必須剛好等於 ${questionCount}
- 多項選擇題要提供 4 個選項
- 非選擇題的 options 要回傳空陣列
- answer 必須具體可顯示
- explanation 可簡短但不能留空
- 題目內容不可脫離文本
    `.trim();

    const raw = await askGeminiForQuiz(systemPrompt, userPrompt);
    const parsed = JSON.parse(cleanJsonPayload(raw));
    const previewQuestions = Array.isArray(parsed?.questions)
      ? parsed.questions.map((item: any, index: number) => buildPreviewQuestion(item, index))
      : [];

    if (previewQuestions.length !== questionCount) {
      throw new Error("Gemini returned invalid question count");
    }
    if (previewQuestions.some((question) => !question.content || !question.answer)) {
      throw new Error("Gemini returned incomplete questions");
    }

    const quizId = crypto.randomUUID();
    const title = String(parsed?.title || "").trim() || buildQuizTitle(targetGrade, sourceText);

    await pool.query(
      `INSERT INTO quizzes (
        id, bot_id, teacher_id, title, source_text, target_grade, question_count, question_type_mode, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')`,
      [quizId, botId, user.id, title, sourceText, targetGrade, questionCount, questionTypeMode]
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
    return res.json({
      ok: true,
      quizId: String(updated.rows[0].id),
      botId: String(updated.rows[0].bot_id),
      title: String(updated.rows[0].title || ""),
      status: String(updated.rows[0].status || "published"),
    });
  } catch (error) {
    console.error("POST /quizzes/:id/publish Failed:", error);
    return res.status(500).json({ error: "發佈測驗失敗，請稍後再試。" });
  }
});

router.get("/bots/:botId/active-quiz", async (req, res) => {
  try {
    const botId = String(req.params.botId || "").trim();
    if (!botId) return res.status(400).json({ error: "bot id is required" });
    const user = await optionalAuth(req);
    const payload = await getActiveQuizForBot(botId, user?.id || null);
    if (!payload) return res.json({ quiz: null });
    return res.json({
      quiz: payload.quiz,
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
      currentQuestion: payload.currentQuestion,
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
    const questions = await listQuizQuestions(quizId);
    const attempt = await getOrCreateAttempt(quizId, user.id, String(quiz.bot_id));
    const updated = await pool.query(
      `UPDATE quiz_attempts
       SET status='in_progress',
           started_at=COALESCE(started_at, NOW()),
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [attempt.id]
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
      currentQuestion: questions[Math.min(Number(next.current_index || 0), questions.length - 1)]?.preview || null,
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
    await pool.query(
      `UPDATE quiz_attempts
       SET status='pending', current_index=0, answers_json='[]'::jsonb, score=0, total_points=0,
           result_payload_json='{}'::jsonb, started_at=NULL, completed_at=NULL, updated_at=NOW()
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
    const payload = await getActiveQuizForBot(String(req.body?.botId || ""), user.id).catch(() => null);
    const quizResult = await pool.query(`SELECT id, bot_id, title FROM quizzes WHERE id=$1 AND status='published' LIMIT 1`, [quizId]);
    if (!quizResult.rowCount) return res.status(404).json({ error: "Quiz not found" });
    const quiz = quizResult.rows[0];
    const questions = await listQuizQuestions(quizId);
    const target = questions[questionIndex];
    if (!target) return res.status(400).json({ error: "題目不存在。" });
    const attempt = await getOrCreateAttempt(quizId, user.id, String(quiz.bot_id));
    const previousAnswers = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
    const nextAnswers = previousAnswers.filter((item: any) => Number(item?.questionIndex) !== questionIndex);
    const isObjective = Array.isArray(target.preview?.options) && target.preview.options.length > 0;
    const correct = normalizeAnswerForCompare(answer) === normalizeAnswerForCompare(target.correctAnswer);
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

    const updated = await pool.query(
      `UPDATE quiz_attempts
       SET status=$1,
           current_index=$2,
           answers_json=$3::jsonb,
           score=$4,
           total_points=$5,
           result_payload_json=$6::jsonb,
           completed_at=$7,
           updated_at=NOW()
       WHERE id=$8
       RETURNING *`,
      [
        isCompleted ? "completed" : "in_progress",
        Math.min(nextIndex, questions.length - 1),
        JSON.stringify(nextAnswers),
        score,
        totalPoints,
        JSON.stringify(result || {}),
        isCompleted ? new Date().toISOString() : null,
        attempt.id,
      ]
    );

    return res.json({
      ok: true,
      status: isCompleted ? "completed" : "in_progress",
      currentIndex: Number(updated.rows[0]?.current_index || 0),
      nextQuestion: !isCompleted ? questions[nextIndex]?.preview || null : null,
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

export default router;
