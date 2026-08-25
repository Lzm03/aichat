import express from "express";
import { pool } from "../db.ts";
import { getAuthUser, requireAuth } from "../lib/platform-auth.ts";
import { ensureQuizTables } from "./quizzes.ts";

const router = express.Router();
let taskTablesReady: Promise<void> | null = null;

type StudentTaskEvent = {
  id: string;
  taskKey: string;
  type: "share" | "quiz";
  teacherName: string;
  botId: string;
  botName: string;
  subject: string;
  sharedAt: string;
  quizId?: string;
  quizTitle?: string;
  readAt?: string | null;
};

const SKILL_DIMENSIONS = [
  { key: "remember", label: "記憶 (Remember)", desc: "提取事實與概念", aliases: ["記憶", "remember"] },
  { key: "understand", label: "理解 (Understand)", desc: "解釋想法與邏輯", aliases: ["理解", "understand"] },
  { key: "apply", label: "應用 (Apply)", desc: "運用於新情境", aliases: ["應用", "apply"] },
  { key: "analyze", label: "分析 (Analyze)", desc: "拆解資訊的關聯", aliases: ["分析", "analyze"] },
  { key: "evaluate", label: "評價 (Evaluate)", desc: "批判與辯護", aliases: ["評價", "評鑑", "evaluate"] },
  { key: "create", label: "創造 (Create)", desc: "產出原創作品", aliases: ["創造", "create"] },
] as const;

function resolveSkillKey(cognitiveLevel: unknown) {
  const normalized = String(cognitiveLevel || "").trim().toLowerCase();
  return SKILL_DIMENSIONS.find((dimension) =>
    dimension.aliases.some((alias) => normalized === alias.toLowerCase())
  )?.key;
}

function calculateCurrentStreak(activityDates: string[]) {
  const activeDays = new Set(activityDates.filter(Boolean));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = formatter.format(new Date());
  const todayStart = new Date(`${todayKey}T00:00:00+08:00`).getTime();
  let streak = 0;
  while (activeDays.has(formatter.format(new Date(todayStart - streak * 86_400_000)))) {
    streak += 1;
  }
  return streak;
}

function calculateLongestStreak(activityDates: string[]) {
  const sortedDays = [...new Set(activityDates.filter(Boolean))].sort();
  let longest = 0;
  let current = 0;
  let previousTime: number | null = null;
  for (const day of sortedDays) {
    const currentTime = new Date(`${day}T00:00:00+08:00`).getTime();
    current = previousTime != null && currentTime - previousTime === 86_400_000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previousTime = currentTime;
  }
  return longest;
}

function hasFiveEventsWithinTenMinutes(timestamps: Array<Date | string>) {
  const sorted = timestamps.map((item) => new Date(item).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  for (let index = 0; index + 4 < sorted.length; index += 1) {
    if (sorted[index + 4] - sorted[index] <= 10 * 60 * 1000) return true;
  }
  return false;
}

export function ensureStudentTaskTables() {
  if (!taskTablesReady) {
    const initialization = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS student_task_reads (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          task_key TEXT NOT NULL,
          task_type TEXT NOT NULL CHECK (task_type IN ('share', 'quiz')),
          read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, task_key)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS student_task_reads_user_read_at_idx
        ON student_task_reads(user_id, read_at DESC)
      `);
    })();
    taskTablesReady = initialization;
    initialization.catch(() => {
      if (taskTablesReady === initialization) taskTablesReady = null;
    });
  }
  return taskTablesReady;
}

function eventKey(type: "share" | "quiz", id: string, occurredAt: Date | string) {
  return `${type}:${id}:${new Date(occurredAt).getTime()}`;
}

async function loadStudentTaskEvents(userId: string) {
  await Promise.all([ensureStudentTaskTables(), ensureQuizTables()]);

  const [shareResult, quizResult] = await Promise.all([
    pool.query(
      `SELECT
         s.bot_id,
         s.created_at AS shared_at,
         b.name AS bot_name,
         b.subject,
         teacher.full_name AS teacher_name
       FROM bot_student_shares s
       JOIN bots b ON b.id=s.bot_id
       JOIN users teacher ON teacher.id=s.teacher_id
       WHERE s.student_id=$1
         AND s.created_at >= NOW() - INTERVAL '3 days'
       ORDER BY s.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT
         q.id AS quiz_id,
         q.title AS quiz_title,
         q.updated_at AS published_at,
         b.id AS bot_id,
         b.name AS bot_name,
         b.subject,
         teacher.full_name AS teacher_name
       FROM bot_student_shares s
       JOIN bots b ON b.id=s.bot_id
       JOIN users teacher ON teacher.id=s.teacher_id
       JOIN LATERAL (
         SELECT id, title, updated_at
         FROM quizzes
         WHERE bot_id=b.id AND status='published'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1
       ) q ON TRUE
       LEFT JOIN quiz_attempts attempt
         ON attempt.quiz_id=q.id AND attempt.student_id=s.student_id
       WHERE s.student_id=$1
         AND COALESCE(attempt.status, 'pending') <> 'completed'
         AND q.updated_at >= NOW() - INTERVAL '3 days'
       ORDER BY q.updated_at DESC`,
      [userId]
    ),
  ]);

  const shareEvents: StudentTaskEvent[] = shareResult.rows.map((row) => {
    const sharedAt = new Date(row.shared_at).toISOString();
    const taskKey = eventKey("share", String(row.bot_id), row.shared_at);
    return {
      id: taskKey,
      taskKey,
      type: "share",
      teacherName: String(row.teacher_name || "老師"),
      botId: String(row.bot_id),
      botName: String(row.bot_name || "AI Bot"),
      subject: String(row.subject || "未分類"),
      sharedAt,
    };
  });

  const quizEvents: StudentTaskEvent[] = quizResult.rows.map((row) => {
    const sharedAt = new Date(row.published_at).toISOString();
    const taskKey = eventKey("quiz", String(row.quiz_id), row.published_at);
    return {
      id: taskKey,
      taskKey,
      type: "quiz",
      teacherName: String(row.teacher_name || "老師"),
      botId: String(row.bot_id),
      botName: String(row.bot_name || "AI Bot"),
      subject: String(row.subject || "未分類"),
      sharedAt,
      quizId: String(row.quiz_id),
      quizTitle: String(row.quiz_title || "知識測試"),
    };
  });

  const events = [...shareEvents, ...quizEvents];
  if (!events.length) return events;

  const readResult = await pool.query(
    `SELECT task_key, read_at
     FROM student_task_reads
     WHERE user_id=$1 AND task_key = ANY($2::text[])`,
    [userId, events.map((item) => item.taskKey)]
  );
  const readAtByKey = new Map(
    readResult.rows.map((row) => [String(row.task_key), new Date(row.read_at).toISOString()])
  );
  return events.map((item) => ({ ...item, readAt: readAtByKey.get(item.taskKey) || null }));
}

router.use(requireAuth);

router.get("/tasks", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.role !== "student") return res.status(403).json({ error: "student account required" });

    const events = await loadStudentTaskEvents(user.id);
    const pending = events
      .filter((item) => !item.readAt)
      .sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime());
    const recentShares = events
      .filter((item) => item.type === "share" && Boolean(item.readAt))
      .sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime());

    return res.json({ pending, recentShares, tasks: [...pending, ...recentShares] });
  } catch (error) {
    console.error("GET /api/student/tasks failed:", error);
    return res.status(500).json({ error: "載入今日任務失敗" });
  }
});

router.get("/achievements", async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.role !== "student") return res.status(403).json({ error: "student account required" });

    const attemptResult = await pool.query(
      `SELECT id, quiz_id, answers_json, teacher_review_json
       FROM quiz_attempts
       WHERE student_id=$1
         AND jsonb_array_length(COALESCE(answers_json, '[]'::jsonb)) > 0`,
      [user.id]
    );
    const quizIds = [...new Set(attemptResult.rows.map((row) => String(row.quiz_id)).filter(Boolean))];
    const questionResult = quizIds.length
      ? await pool.query(
          `SELECT id, quiz_id, cognitive_level, points, order_index
           FROM quiz_questions
           WHERE quiz_id = ANY($1::text[])`,
          [quizIds]
        )
      : { rows: [] as any[] };

    const questionById = new Map(questionResult.rows.map((row) => [String(row.id), row]));
    const questionByPosition = new Map(
      questionResult.rows.map((row) => [`${String(row.quiz_id)}:${Number(row.order_index || 0)}`, row])
    );
    const totals = new Map(SKILL_DIMENSIONS.map((dimension) => [dimension.key, { answered: 0, correct: 0 }]));

    for (const attempt of attemptResult.rows) {
      const answers = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
      const reviews = Array.isArray(attempt.teacher_review_json) ? attempt.teacher_review_json : [];
      for (const answer of answers) {
        const questionIndex = Number(answer?.questionIndex || 0);
        const question = questionById.get(String(answer?.questionId || ""))
          || questionByPosition.get(`${String(attempt.quiz_id)}:${questionIndex}`);
        const skillKey = resolveSkillKey(question?.cognitive_level);
        if (!question || !skillKey) continue;
        const review = reviews.find((item: any) => Number(item?.questionIndex || 0) === questionIndex);
        const isCorrect = review?.finalPoints == null
          ? Boolean(answer?.isCorrect)
          : Number(review.finalPoints || 0) >= Number(question.points || 1);
        const total = totals.get(skillKey);
        if (!total) continue;
        total.answered += 1;
        if (isCorrect) total.correct += 1;
      }
    }

    const skills = SKILL_DIMENSIONS.map((dimension) => {
      const total = totals.get(dimension.key) || { answered: 0, correct: 0 };
      return {
        key: dimension.key,
        label: dimension.label,
        desc: dimension.desc,
        value: total.answered ? Math.round((total.correct / total.answered) * 100) : 0,
        answered: total.answered,
        correct: total.correct,
      };
    });

    const [messageStatsResult, interactionResult, activityResult, earlyBirdResult, subjectResult, attemptStatsResult, eventTimesResult, coverageResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(DISTINCT cm.bot_id) FILTER (WHERE cm.role='user' AND cm.bot_id IS NOT NULL) AS bots_talked,
           COUNT(*) FILTER (WHERE cm.role='user') AS total_messages,
           COUNT(DISTINCT c.topic_id) FILTER (WHERE cm.role='user' AND c.topic_id IS NOT NULL) AS topics_talked,
           MIN(cm.created_at) FILTER (WHERE cm.role='user') AS first_message_at,
           COUNT(*) FILTER (
             WHERE cm.role='user' AND (
               LOWER(COALESCE(b.subject, '')) ~ '(語文|中文|英文|english|language|writing|寫作)'
               OR LOWER(COALESCE(b.name, '')) ~ '(語文|中文|英文|english|writing|寫作)'
             )
           ) AS language_messages
         FROM conversation_messages cm
         JOIN conversations c ON c.id=cm.conversation_id
         LEFT JOIN bots b ON b.id=cm.bot_id
         WHERE cm.user_id=$1`,
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*) AS today_interactions
         FROM bot_interaction_events
         WHERE user_id=$1
           AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Hong_Kong') AT TIME ZONE 'Asia/Hong_Kong')`,
        [user.id]
      ),
      pool.query(
        `SELECT DISTINCT activity_date::text
         FROM (
           SELECT (created_at AT TIME ZONE 'Asia/Hong_Kong')::date AS activity_date
           FROM conversation_messages
           WHERE user_id=$1 AND role='user'
           UNION
           SELECT (completed_at AT TIME ZONE 'Asia/Hong_Kong')::date AS activity_date
           FROM quiz_attempts
           WHERE student_id=$1 AND status='completed' AND completed_at IS NOT NULL
         ) activity
         ORDER BY activity_date DESC`,
        [user.id]
      ),
      pool.query(
        `SELECT MIN(created_at) AS first_early_at
         FROM conversation_messages
         WHERE user_id=$1 AND role='user'
           AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Hong_Kong') >= 6
           AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Hong_Kong') < 10`,
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT NULLIF(BTRIM(COALESCE(b.subject, '')), '')) AS subjects_talked
         FROM conversation_messages cm
         JOIN bots b ON b.id=cm.bot_id
         WHERE cm.user_id=$1 AND cm.role='user'`,
        [user.id]
      ),
      pool.query(
        `SELECT
           a.score, a.teacher_score, a.total_points, a.teacher_status, a.completed_at,
           q.title, b.name AS bot_name, b.subject
         FROM quiz_attempts a
         JOIN quizzes q ON q.id=a.quiz_id
         JOIN bots b ON b.id=a.bot_id
         WHERE a.student_id=$1 AND a.status='completed'
         ORDER BY a.completed_at DESC NULLS LAST, a.updated_at DESC`,
        [user.id]
      ),
      pool.query(
        `SELECT created_at
         FROM bot_interaction_events
         WHERE user_id=$1
         ORDER BY created_at ASC`,
        [user.id]
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT t.id) AS available_topics,
           COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN t.id END) AS covered_topics
         FROM bot_student_shares s
         JOIN character_topics t ON t.character_id=s.bot_id
         LEFT JOIN conversations c
           ON c.user_id=s.student_id AND c.bot_id=s.bot_id AND c.topic_id=t.id
           AND EXISTS (
             SELECT 1 FROM conversation_messages cm
             WHERE cm.conversation_id=c.id AND cm.user_id=s.student_id AND cm.role='user'
           )
         WHERE s.student_id=$1`,
        [user.id]
      ),
    ]);

    const messageStats = messageStatsResult.rows[0] || {};
    const activityDates = activityResult.rows.map((row) => String(row.activity_date || ""));
    const currentStreak = calculateCurrentStreak(activityDates);
    const longestStreak = calculateLongestStreak(activityDates);
    const stats = {
      botsTalked: Number(messageStats.bots_talked || 0),
      topicsTalked: Number(messageStats.topics_talked || 0),
      todayInteractions: Number(interactionResult.rows[0]?.today_interactions || 0),
      totalMessages: Number(messageStats.total_messages || 0),
      currentStreak,
    };

    const completedAttempts = attemptStatsResult.rows.map((row) => {
      const finalScore = String(row.teacher_status || "") === "completed"
        ? Number(row.teacher_score || 0)
        : Number(row.score || 0);
      const totalPoints = Number(row.total_points || 0);
      const descriptor = `${String(row.title || "")} ${String(row.bot_name || "")} ${String(row.subject || "")}`.toLowerCase();
      return {
        ...row,
        finalScore,
        totalPoints,
        percent: totalPoints > 0 ? (finalScore / totalPoints) * 100 : 0,
        descriptor,
      };
    });
    const stemMaster = completedAttempts.some((attempt) =>
      /(stem|數學|数学|科學|科学|science|technology|科技|工程|engineering)/i.test(attempt.descriptor)
      && attempt.percent >= 85
    );
    const grammarAttempts = completedAttempts.filter((attempt) =>
      /(英文|english)/i.test(attempt.descriptor) && /(文法|語法|语法|grammar)/i.test(attempt.descriptor)
    );
    const grammarMaster = grammarAttempts.some((_, index) =>
      grammarAttempts.slice(index, index + 5).length === 5
      && grammarAttempts.slice(index, index + 5).every((attempt) => attempt.totalPoints > 0 && attempt.finalScore >= attempt.totalPoints)
    );
    const perfectionist = completedAttempts.some((_, index) =>
      completedAttempts.slice(index, index + 3).length === 3
      && completedAttempts.slice(index, index + 3).every((attempt) => attempt.totalPoints > 0 && attempt.finalScore >= attempt.totalPoints)
    );
    const availableTopics = Number(coverageResult.rows[0]?.available_topics || 0);
    const coveredTopics = Number(coverageResult.rows[0]?.covered_topics || 0);
    const allRounder = availableTopics > 0 && coveredTopics / availableTopics >= 0.8;
    const flashUnlocked = hasFiveEventsWithinTenMinutes(eventTimesResult.rows.map((row) => row.created_at));
    const badges = [
      { id: "first-voyage", unlocked: stats.totalMessages >= 1, unlockedAt: messageStats.first_message_at || null },
      { id: "streak-rookie", unlocked: longestStreak >= 5, unlockedAt: null },
      { id: "early-bird", unlocked: Boolean(earlyBirdResult.rows[0]?.first_early_at), unlockedAt: earlyBirdResult.rows[0]?.first_early_at || null },
      { id: "streak-master", unlocked: longestStreak >= 10, unlockedAt: null },
      { id: "stem-master", unlocked: stemMaster, unlockedAt: null },
      { id: "word-wizard", unlocked: Number(messageStats.language_messages || 0) >= 10, unlockedAt: null },
      { id: "curious-baby", unlocked: stats.totalMessages >= 100, unlockedAt: null },
      { id: "grammar-master", unlocked: grammarMaster, unlockedAt: null },
      { id: "explorer", unlocked: Number(subjectResult.rows[0]?.subjects_talked || 0) >= 4, unlockedAt: null },
      { id: "flash", unlocked: flashUnlocked, unlockedAt: null },
      { id: "perfectionist", unlocked: perfectionist, unlockedAt: null },
      { id: "all-rounder", unlocked: allRounder, unlockedAt: null },
    ];

    return res.json({ skills, stats, badges });
  } catch (error) {
    console.error("GET /api/student/achievements failed:", error);
    return res.status(500).json({ error: "載入學習維度失敗" });
  }
});

router.post("/tasks/read", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.role !== "student") return res.status(403).json({ error: "student account required" });

    const taskKey = String(req.body?.taskKey || "").trim();
    if (!taskKey) return res.status(400).json({ error: "taskKey is required" });
    const events = await loadStudentTaskEvents(user.id);
    const event = events.find((item) => item.taskKey === taskKey);
    if (!event) return res.status(404).json({ error: "task not found" });

    const result = await pool.query(
      `INSERT INTO student_task_reads (user_id, task_key, task_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, task_key)
       DO UPDATE SET read_at=EXCLUDED.read_at
       RETURNING read_at`,
      [user.id, event.taskKey, event.type]
    );
    return res.json({ ok: true, taskKey, readAt: new Date(result.rows[0].read_at).toISOString() });
  } catch (error) {
    console.error("POST /api/student/tasks/read failed:", error);
    return res.status(500).json({ error: "更新任務狀態失敗" });
  }
});

export default router;
