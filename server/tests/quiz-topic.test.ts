import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { pool } from "../db.ts";
import { CharacterTopicError, ensureCharacterTopicTables } from "../lib/character-topics.ts";
import {
  assertTopicBelongsToBot,
  countPendingQuizzesForBot,
  getQuizTopicName,
  resolveActiveQuizForBotTopic,
} from "../lib/quiz-topic.ts";

// 呢套會 INSERT 數據，所以用關鍵字守門（唔可以用 quiz-audience 嘅 probe 式：
// probe 只擋「schema 唔存在」，擋唔到「呢個 DB 唔係俾測試用」）。
// 名字要含 quiz_topic_test，例如：
//   DATABASE_URL=postgres://…/aichat_quiz_topic_test npm run test:quiz-topic
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase =
  /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /quiz_topic_test/.test(databaseUrl);

before(async () => {
  if (!safeTestDatabase) return;
  // 由零起一個最小 schema（呢套唔靠 ensureQuizTables：佢嘅完整 schema 有大量
  // 同本題無關嘅欄位，反而會令斷言失焦）。順序：先拆返上次跑剩嘅。
  await pool.query(`
    DROP TABLE IF EXISTS quiz_attempts, quizzes, conversations, character_topics, bots CASCADE
  `);
  await pool.query(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      knowledge_base TEXT,
      owner_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // quizzes.topic_id 有 FK 去 character_topics，所以嗰張表要先起（ensureCharacterTopicTables
  // 順手會 ALTER conversations 加 topic_id，所以 conversations 亦要喺佢之前）。
  await ensureCharacterTopicTables();
  await pool.query(`
    CREATE TABLE quizzes (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      topic_id TEXT REFERENCES character_topics(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
});

after(async () => {
  await pool.end();
});

/** 同一隻 Bot 兩個主題：grammar / reading。 */
async function seedBots() {
  await pool.query(`DELETE FROM quiz_attempts`);
  await pool.query(`DELETE FROM quizzes`);
  await pool.query(`DELETE FROM character_topics`);
  await pool.query(`DELETE FROM bots`);
  await pool.query(
    `INSERT INTO bots (id, name, knowledge_base) VALUES
       ('bot_a','Bot A','legacy a'),
       ('bot_b','Bot B', NULL)`
  );
  // ensureCharacterTopicTables 嘅 backfill 已經幫每隻 bot 開咗一個預設主題，
  // 上面 DELETE 清走咗，所以呢度自己插。
  await pool.query(
    `INSERT INTO character_topics (id, character_id, name) VALUES
       ('topic_a_grammar','bot_a','Grammar'),
       ('topic_a_reading','bot_a','Reading'),
       ('topic_b_only','bot_b','Bot B Topic')`
  );
}

/** 插入一份已發佈測驗；`minutesAgo` 越大越舊（決定「最新」）。 */
async function seedQuiz(
  id: string,
  botId: string,
  topicId: string | null,
  minutesAgo: number,
  status = "published"
) {
  await pool.query(
    `INSERT INTO quizzes (id, bot_id, title, status, topic_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW() - ($6 || ' minutes')::interval, NOW() - ($6 || ' minutes')::interval)`,
    [id, botId, id, status, topicId, String(minutesAgo)]
  );
}

async function seedAttempt(quizId: string, studentId: string, status: string, minutesAgo = 0) {
  await pool.query(
    `INSERT INTO quiz_attempts (id, quiz_id, student_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW() - ($5 || ' minutes')::interval, NOW() - ($5 || ' minutes')::interval)
     ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
    [`${quizId}_${studentId}`, quizId, studentId, status, String(minutesAgo)]
  );
}

test("student in a Topic sees the latest published quiz of that Topic", { skip: !safeTestDatabase }, async () => {
  await seedBots();
  await seedQuiz("quiz_grammar_old", "bot_a", "topic_a_grammar", 60);
  await seedQuiz("quiz_grammar_new", "bot_a", "topic_a_grammar", 10);
  await seedQuiz("quiz_reading", "bot_a", "topic_a_reading", 5);

  const grammar = await resolveActiveQuizForBotTopic("bot_a", "topic_a_grammar");
  assert.equal(grammar?.id, "quiz_grammar_new");
  const reading = await resolveActiveQuizForBotTopic("bot_a", "topic_a_reading");
  assert.equal(reading?.id, "quiz_reading");

  // 草稿唔算「已發佈」——即使係最新
  await seedQuiz("quiz_grammar_draft", "bot_a", "topic_a_grammar", 1, "draft");
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", "topic_a_grammar"))?.id, "quiz_grammar_new");
});

test("a Topic without its own quiz falls back to the no-Topic quiz", { skip: !safeTestDatabase }, async () => {
  await seedBots();
  await seedQuiz("quiz_grammar", "bot_a", "topic_a_grammar", 30);
  await seedQuiz("quiz_no_topic", "bot_a", null, 20);

  // reading 冇自己嘅測驗 → 後備「不分主題」
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", "topic_a_reading"))?.id, "quiz_no_topic");
  // grammar 有自己嘅 → 唔會俾「不分主題」搶走，即使後者更新
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", "topic_a_grammar"))?.id, "quiz_grammar");

  // 日後 reading 有咗自己嘅測驗，就會遮住「不分主題」
  await seedQuiz("quiz_reading", "bot_a", "topic_a_reading", 1);
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", "topic_a_reading"))?.id, "quiz_reading");

  // 連「不分主題」都冇 → 唔出 banner
  await pool.query(`DELETE FROM quizzes WHERE id='quiz_no_topic'`);
  await pool.query(`DELETE FROM quizzes WHERE id='quiz_reading'`);
  assert.equal(await resolveActiveQuizForBotTopic("bot_a", "topic_a_reading"), null);
});

test("a Topic from another Bot is rejected with the existing mismatch error", { skip: !safeTestDatabase }, async () => {
  await seedBots();
  await seedQuiz("quiz_b", "bot_b", "topic_b_only", 5);

  await assert.rejects(
    () => resolveActiveQuizForBotTopic("bot_a", "topic_b_only"),
    (error: unknown) =>
      error instanceof CharacterTopicError &&
      error.code === "TOPIC_CHARACTER_MISMATCH" &&
      error.status === 400
  );
  // 唔存在嘅主題都一樣（同一個碼，前端只需要處理一個）
  await assert.rejects(
    () => assertTopicBelongsToBot("bot_a", "topic_does_not_exist"),
    (error: unknown) => error instanceof CharacterTopicError && error.code === "TOPIC_CHARACTER_MISMATCH"
  );
  await assert.doesNotReject(() => assertTopicBelongsToBot("bot_a", "topic_a_grammar"));
});

test("omitting topicId stays byte-identical to the legacy query", { skip: !safeTestDatabase }, async () => {
  await seedBots();
  await seedQuiz("quiz_grammar", "bot_a", "topic_a_grammar", 30);
  await seedQuiz("quiz_no_topic", "bot_a", null, 20);
  await seedQuiz("quiz_draft_newest", "bot_a", "topic_a_reading", 1, "draft");

  const actual = await resolveActiveQuizForBotTopic("bot_a");
  // 改動前嘅查詢：整體最新一份已發佈，唔理主題
  const legacy = await pool.query(
    `SELECT * FROM quizzes
     WHERE bot_id=$1 AND status='published'
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    ["bot_a"]
  );
  assert.deepEqual(actual, legacy.rows[0]);
  assert.equal(actual?.id, "quiz_no_topic");

  // 空字串／null 同「冇傳」一樣（route 傳 null 落嚟）
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", ""))?.id, "quiz_no_topic");
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", null))?.id, "quiz_no_topic");

  // 一隻測驗都冇 → null
  await pool.query(`DELETE FROM quizzes`);
  assert.equal(await resolveActiveQuizForBotTopic("bot_a"), null);
});

test("deleting a Topic downgrades its quizzes to no-Topic instead of orphaning them", { skip: !safeTestDatabase }, async () => {
  await seedBots();
  await seedQuiz("quiz_grammar", "bot_a", "topic_a_grammar", 30);

  await pool.query(`DELETE FROM character_topics WHERE id='topic_a_grammar'`);
  const remaining = await pool.query(`SELECT topic_id FROM quizzes WHERE id='quiz_grammar'`);
  assert.equal(remaining.rows[0].topic_id, null);
  // 降級之後就係「不分主題」測驗：reading 都會見到
  assert.equal((await resolveActiveQuizForBotTopic("bot_a", "topic_a_reading"))?.id, "quiz_grammar");
});

test("pending count is per (Bot, Topic) bucket and degenerates to 0/1 without Topics", { skip: !safeTestDatabase }, async () => {
  await seedBots();

  // 冇主題嘅 Bot：一個 NULL bucket
  await seedQuiz("quiz_b_only", "bot_b", null, 10);
  assert.equal(await countPendingQuizzesForBot("bot_b", "student_1"), 1);
  await seedAttempt("quiz_b_only", "student_1", "completed");
  assert.equal(await countPendingQuizzesForBot("bot_b", "student_1"), 0);

  // 有主題嘅 Bot：每個主題各自一份
  await seedQuiz("quiz_grammar_old", "bot_a", "topic_a_grammar", 60);
  await seedQuiz("quiz_grammar_new", "bot_a", "topic_a_grammar", 10);
  await seedQuiz("quiz_reading", "bot_a", "topic_a_reading", 20);
  // 兩個主題 + 冇「不分主題」測驗 → 2 份待做（舊嘅 grammar 測驗唔計）
  assert.equal(await countPendingQuizzesForBot("bot_a", "student_1"), 2);

  await seedAttempt("quiz_grammar_new", "student_1", "completed");
  assert.equal(await countPendingQuizzesForBot("bot_a", "student_1"), 1);

  // 加上一份「不分主題」測驗 → 多一個 bucket
  await seedQuiz("quiz_a_no_topic", "bot_a", null, 15);
  assert.equal(await countPendingQuizzesForBot("bot_a", "student_1"), 2);

  // 「稍後再做」等未完成狀態照計
  await seedAttempt("quiz_reading", "student_1", "later");
  assert.equal(await countPendingQuizzesForBot("bot_a", "student_1"), 2);

  // 最近一次 attempt 才決定（重新開始做會再變返待做）
  await seedAttempt("quiz_grammar_new", "student_1", "in_progress", -5);
  assert.equal(await countPendingQuizzesForBot("bot_a", "student_1"), 3);

  // 另一位學生完全冇做過
  assert.equal(await countPendingQuizzesForBot("bot_a", "student_2"), 3);
});

test("getQuizTopicName resolves the Topic name and stays empty otherwise", { skip: !safeTestDatabase }, async () => {
  await seedBots();
  assert.equal(await getQuizTopicName("topic_a_grammar"), "Grammar");
  assert.equal(await getQuizTopicName(null), "");
  assert.equal(await getQuizTopicName(""), "");
  assert.equal(await getQuizTopicName("topic_deleted"), "");
});
