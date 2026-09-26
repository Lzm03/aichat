import { pool } from "../db.ts";
import { CharacterTopicError, getCharacterTopic } from "./character-topics.ts";

/**
 * 測驗嘅主題維度（Bot × 主題）——「邊份測驗俾學生見到」同「有幾多份待做」
 * 兩個判斷嘅**唯一實作**。詳見 docs/quiz-topic-implementation.md。
 *
 * 唔准喺 route 入面自己寫 `ORDER BY updated_at DESC LIMIT 1` 揀測驗：
 * 同一個判斷散開就會漂移（今日已經散落喺 4 個位）。
 *
 * 本檔唔可以 import `api/quizzes.ts`（會成環）——只依賴 db 同 lib/character-topics.ts。
 */

/** 一條 SQL 片段，全部測驗列表共用；`q` ＝ quizzes 嘅別名。 */
export const QUIZ_TOPIC_JOIN_SQL = "LEFT JOIN character_topics t ON t.id = q.topic_id";

/** 主題欄位（列表多一欄只改呢度）。 */
export const QUIZ_TOPIC_SELECT_SQL = "q.topic_id, t.name AS topic_name";

const TOPIC_MISMATCH_MESSAGE = "The selected Topic does not belong to this Character.";

/** 主題必須屬於該 Bot；唔屬於就拋現有錯誤碼（唔另開新碼）。 */
export async function assertTopicBelongsToBot(botId: string, topicId: string) {
  const topic = await getCharacterTopic(botId, topicId);
  if (!topic) {
    throw new CharacterTopicError(TOPIC_MISMATCH_MESSAGE, 400, "TOPIC_CHARACTER_MISMATCH");
  }
  return topic;
}

/**
 * 解析「（Bot, 主題）→ 學生應該見到嘅測驗」：
 * 1. 有指定主題 → 該主題最新已發佈
 * 2. 該主題冇 → 「不分主題」（topic_id IS NULL）最新已發佈
 * 3. 兩者都冇 → null（唔出 banner）
 *
 * 冇指定主題 → 整體最新已發佈一份：**同改動前完全一樣**，
 * 舊呼叫者（冇傳 topicId）行為零改變。
 */
export async function resolveActiveQuizForBotTopic(botId: string, topicId?: string | null) {
  const normalizedTopicId = String(topicId || "").trim();

  if (normalizedTopicId) {
    await assertTopicBelongsToBot(botId, normalizedTopicId);

    const scoped = await pool.query(
      `SELECT * FROM quizzes
       WHERE bot_id=$1 AND status='published' AND topic_id=$2
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [botId, normalizedTopicId]
    );
    if (scoped.rows[0]) return scoped.rows[0];

    const fallback = await pool.query(
      `SELECT * FROM quizzes
       WHERE bot_id=$1 AND status='published' AND topic_id IS NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [botId]
    );
    return fallback.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT * FROM quizzes
     WHERE bot_id=$1 AND status='published'
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [botId]
  );
  return result.rows[0] || null;
}

/**
 * Bot 卡「N 份測驗」嘅計數：逐個（Bot, 主題）bucket 取最新已發佈嗰份
 * （NULL bucket ＝「不分主題」，一併計），再數學生最近一次作答**未完成**嘅份數。
 *
 * 冇主題嘅舊 Bot 只有一個 NULL bucket → 只會出 0 或 1，
 * 同改動前嘅 boolean `hasPendingQuiz` 完全一樣（退化保證）。
 * 已過期嘅舊測驗唔計，所以 badge 唔會虛高。
 *
 * `botAlias` / `studentParam` 由呼叫者傳：三處用嘅 placeholder 唔同（$1 或 $2）。
 */
export function pendingQuizCountSql(botAlias: string, studentParam: string) {
  return `(
    SELECT COUNT(*)::int
    FROM (
      SELECT DISTINCT ON (resolved_quiz.topic_id) resolved_quiz.id,
        COALESCE(
          (SELECT attempt.status FROM quiz_attempts attempt
           WHERE attempt.quiz_id = resolved_quiz.id AND attempt.student_id = ${studentParam}
           ORDER BY attempt.updated_at DESC, attempt.created_at DESC
           LIMIT 1),
          'pending'
        ) AS attempt_status
      FROM quizzes resolved_quiz
      WHERE resolved_quiz.bot_id = ${botAlias} AND resolved_quiz.status = 'published'
      ORDER BY resolved_quiz.topic_id, resolved_quiz.updated_at DESC, resolved_quiz.created_at DESC
    ) resolved
    WHERE resolved.attempt_status <> 'completed'
  )`;
}

export async function countPendingQuizzesForBot(botId: string, studentId?: string | null) {
  const result = await pool.query(
    `SELECT ${pendingQuizCountSql("$1", "$2")} AS pending_quiz_count`,
    [botId, studentId || null]
  );
  return Number(result.rows[0]?.pending_quiz_count || 0);
}

/** 主題名（列表／回應顯示用）；冇主題或者主題已經刪咗 → 空字串。 */
export async function getQuizTopicName(topicId?: string | null) {
  const normalizedTopicId = String(topicId || "").trim();
  if (!normalizedTopicId) return "";
  const result = await pool.query(
    `SELECT name FROM character_topics WHERE id=$1 LIMIT 1`,
    [normalizedTopicId]
  );
  return result.rows[0] ? String(result.rows[0].name) : "";
}
