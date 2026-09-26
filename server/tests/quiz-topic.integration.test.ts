import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import quizzesRouter, { ensureQuizTables } from "../api/quizzes.ts";
import characterTopicsRouter from "../api/character-topics.ts";
import { countPendingQuizzesForBot, resolveActiveQuizForBotTopic } from "../lib/quiz-topic.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";

// Route-level companion to `test:quiz-topic` (lib-level, minimal schema): this one drives the
// real HTTP routes against the schema `ensureQuizTables()` actually builds, so the two fail
// for different reasons on purpose.
//
// It writes real schema into whatever DATABASE_URL points at, so it must be a local dedicated
// test database. Without the `quizzes_test` marker every DB test skips silently and the suite
// still reports green.
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /quizzes_test/.test(databaseUrl);

const PREFIX = "qtopic_";
const TEACHER_A = `${PREFIX}teacher_a`;
const TEACHER_B = `${PREFIX}teacher_b`;
const STUDENT = `${PREFIX}student_1`;
const BOT_A = `${PREFIX}bot_a`;
const BOT_B = `${PREFIX}bot_b`;
const TOPIC_A = `${PREFIX}topic_a`;
const TOPIC_B = `${PREFIX}topic_b`;
const TOPIC_FOREIGN = `${PREFIX}topic_foreign`;
const QUIZ_A_NEW = `${PREFIX}quiz_a_new`;
const QUIZ_A_OLD = `${PREFIX}quiz_a_old`;
const QUIZ_UNTYPED = `${PREFIX}quiz_untopic`;
const QUIZ_DRAFT = `${PREFIX}quiz_draft`;
const QUIZ_OTHER = `${PREFIX}quiz_other`;

const ALL_USERS = [TEACHER_A, TEACHER_B, STUDENT];
const ALL_BOTS = [BOT_A, BOT_B];
const ALL_QUIZZES = [QUIZ_A_NEW, QUIZ_A_OLD, QUIZ_UNTYPED, QUIZ_DRAFT, QUIZ_OTHER];

let httpServer: Server | null = null;
let baseUrl = "";

// Every test starts by calling this. Order matters: quizzes reference both users and
// bots, and `bots.owner_id` is a plain TEXT column with no FK, so deleting the users
// does NOT take the bots with it — each table has to go explicitly.
async function resetFixture() {
  await pool.query("DELETE FROM quizzes WHERE id = ANY($1::text[])", [ALL_QUIZZES]);
  await pool.query("DELETE FROM character_topics WHERE character_id = ANY($1::text[])", [ALL_BOTS]);
  await pool.query("DELETE FROM bots WHERE id = ANY($1::text[])", [ALL_BOTS]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);
  // The share rows and attempts cascade from the deletes above; nothing else to clear.

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash) VALUES
       ($1,'Teacher A','qtopic_teacher_a@example.test','teacher','x'),
       ($2,'Teacher B','qtopic_teacher_b@example.test','teacher','x'),
       ($3,'Student 1','qtopic_student_1@example.test','student','x')`,
    ALL_USERS
  );
  await pool.query(
    `INSERT INTO bots (id, name, owner_id, subject) VALUES ($1,'Bot A',$3,'英文'), ($2,'Bot B',$4,'數學')`,
    [BOT_A, BOT_B, TEACHER_A, TEACHER_B]
  );
  // Bot A has two topics. Bot B carries a third one so the suite can hand Bot A a Topic
  // that belongs to somebody else (the TOPIC_CHARACTER_MISMATCH case).
  await pool.query(
    `INSERT INTO character_topics (id, character_id, name, sort_order, is_default) VALUES
       ($1,$3,'第一課',0,TRUE),
       ($2,$3,'第二課',1,FALSE),
       ($4,$5,'數學第一課',0,TRUE)`,
    [TOPIC_A, TOPIC_B, BOT_A, TOPIC_FOREIGN, BOT_B]
  );
  // updated_at is deliberately days apart and QUIZ_DRAFT is the newest row of all: two
  // rows microseconds apart would let "which one won" pass by accident, and the draft
  // must never surface no matter how new it is. QUIZ_OTHER belongs to another teacher —
  // it is a draft so it cannot pollute the resolver, and exists for the "not yours" 404.
  await pool.query(
    `INSERT INTO quizzes (id, bot_id, teacher_id, title, source_text, target_grade, question_count, status, topic_id, published_at, updated_at) VALUES
       ($1,$6,$7,'新嘅第一課測驗','source','S1',5,'published',$9,     NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
       ($2,$6,$7,'舊嘅第一課測驗','source','S1',5,'published',$9,     NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
       ($3,$6,$7,'不分主題測驗','source','S1',5,'published',NULL,     NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days'),
       ($4,$6,$7,'未發佈嘅第一課測驗','source','S1',5,'draft',$9,     NULL,                     NOW()),
       ($5,$6,$8,'隔籬老師嘅草稿','source','S1',5,'draft',NULL,       NULL,                     NOW())`,
    [QUIZ_A_NEW, QUIZ_A_OLD, QUIZ_UNTYPED, QUIZ_DRAFT, QUIZ_OTHER, BOT_A, TEACHER_A, TEACHER_B, TOPIC_A]
  );
  // The student reaches Bot A through a direct share (quizAudienceSql).
  await pool.query(`INSERT INTO bot_student_shares (bot_id, student_id, teacher_id) VALUES ($1,$2,$3)`, [
    BOT_A,
    STUDENT,
    TEACHER_A,
  ]);
}

function authHeader(userId = TEACHER_A, role: "teacher" | "student" = "teacher") {
  return `Bearer ${signToken({ sub: userId, email: `${userId}@example.test`, role, exp: Date.now() + 3_600_000 })}`;
}

async function getActiveQuiz(
  botId: string,
  options: { topicId?: string; role?: "teacher" | "student"; userId?: string } = {}
) {
  const query = options.topicId === undefined ? "" : `?topicId=${encodeURIComponent(options.topicId)}`;
  const response = await fetch(`${baseUrl}/api/bots/${botId}/active-quiz${query}`, {
    headers: { Authorization: authHeader(options.userId || STUDENT, options.role || "student") },
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

async function patchTopic(quizId: string, topicId: string | null, userId = TEACHER_A) {
  const response = await fetch(`${baseUrl}/api/quizzes/${quizId}/topic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: authHeader(userId) },
    body: JSON.stringify({ topicId }),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

async function listQuizzes(route: "published" | "drafts", key: "quizzes" | "drafts") {
  const response = await fetch(`${baseUrl}/api/quizzes/${route}`, {
    headers: { Authorization: authHeader(TEACHER_A) },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  return (body[key] || []) as Array<Record<string, any>>;
}

before(async () => {
  if (!safeTestDatabase) return;
  // bots is a legacy table: ensurePlatformTables does not create it, but quizzes and the
  // share tables reference it, so a fresh test database needs it before anything else.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      knowledge_base TEXT,
      security_prompt TEXT,
      owner_id TEXT,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      grade TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // The rest of the bots columns live in production DDL that is not part of this repo.
  // GET /teachers/me/available-quiz-bots selects subject/avatar_url, and its
  // ensureDefaultTeacherExperience() bootstrap writes the whole list below, so a fresh
  // test database only gets them here.
  await pool.query(`
    ALTER TABLE bots
      ADD COLUMN IF NOT EXISTS subject TEXT,
      ADD COLUMN IF NOT EXISTS subject_color TEXT,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS background TEXT,
      ADD COLUMN IF NOT EXISTS animation TEXT,
      ADD COLUMN IF NOT EXISTS opening_message TEXT,
      ADD COLUMN IF NOT EXISTS video_idle TEXT,
      ADD COLUMN IF NOT EXISTS video_thinking TEXT,
      ADD COLUMN IF NOT EXISTS video_talking TEXT,
      ADD COLUMN IF NOT EXISTS voice_id TEXT,
      ADD COLUMN IF NOT EXISTS interactions INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS accuracy INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS owner_email TEXT,
      ADD COLUMN IF NOT EXISTS template_key TEXT,
      ADD COLUMN IF NOT EXISTS chat_message_limit INTEGER,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  // The Confucius bootstrap inserts with ON CONFLICT (owner_id, template_key) WHERE
  // template_key IS NOT NULL, which needs a matching partial unique index.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS bots_owner_template_key_unique_idx
    ON bots(owner_id, template_key) WHERE template_key IS NOT NULL
  `);
  await ensurePlatformTables();
  await ensureQuizTables();

  const app = express();
  app.use(express.json());
  // index.ts mounts these the same way; the topic router needs mergeParams for :characterId.
  app.use("/api/bots/:characterId/topics", characterTopicsRouter);
  app.use("/api", quizzesRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  await resetFixture();
});

after(async () => {
  if (safeTestDatabase) {
    await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);
    await pool.query("DELETE FROM bots WHERE id = ANY($1::text[])", [ALL_BOTS]);
  }
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

/* -------------------- resolver rules (maintenance principle 1) -------------------- */

test("no topicId keeps today's behaviour: newest published quiz of any topic", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const quiz = await resolveActiveQuizForBotTopic(BOT_A, undefined);
  assert.equal(quiz?.id, QUIZ_A_NEW);
});

test("a topic with its own published quiz wins, and the newest one at that", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const quiz = await resolveActiveQuizForBotTopic(BOT_A, TOPIC_A);
  assert.equal(quiz?.id, QUIZ_A_NEW);
  // The draft is the newest row in the fixture — it must never be picked.
  assert.notEqual(quiz?.id, QUIZ_DRAFT);
  // The resolver returns the quizzes row as-is (no topic join): the topic name comes from
  // QUIZ_TOPIC_SELECT_SQL at the listing call sites, not from here.
  assert.equal(quiz?.topic_id, TOPIC_A);
});

test("a topic with no quiz of its own falls back to the newest untopiced quiz", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const quiz = await resolveActiveQuizForBotTopic(BOT_A, TOPIC_B);
  assert.equal(quiz?.id, QUIZ_UNTYPED);
  assert.equal(quiz?.topic_id, null);
});

test("a null topicId means the same as no topic at all: newest published overall", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // Normalising null to "" is deliberate — no caller wants "the untopiced quiz only", and
  // the route turns an absent ?topicId= into null.
  const quiz = await resolveActiveQuizForBotTopic(BOT_A, null);
  assert.equal(quiz?.id, QUIZ_A_NEW);
});

test("a bot with nothing published resolves to null, and a foreign topic is refused", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  assert.equal(await resolveActiveQuizForBotTopic(BOT_B, undefined), null);
  assert.equal(await resolveActiveQuizForBotTopic(BOT_B, TOPIC_FOREIGN), null);
  // A topic belonging to another bot must never resolve quietly — it is a caller bug.
  await assert.rejects(
    () => resolveActiveQuizForBotTopic(BOT_A, TOPIC_FOREIGN),
    (error: any) => {
      assert.equal(error.code, "TOPIC_CHARACTER_MISMATCH");
      assert.equal(error.status, 400);
      return true;
    }
  );
});

/* -------------------- active-quiz route -------------------- */

test("active-quiz without topicId stays backward compatible", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await getActiveQuiz(BOT_A);
  assert.equal(status, 200);
  assert.equal(body.quiz?.id, QUIZ_A_NEW);
  // The payload carries topicId but no topicName: the chat header already names the topic
  // the student is in, and the banner shows the quiz title, so no caller reads the name.
  assert.equal(body.quiz?.topicId, TOPIC_A);
});

test("active-quiz follows the requested topic and falls back when that topic has no quiz", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const onTopicA = await getActiveQuiz(BOT_A, { topicId: TOPIC_A });
  assert.equal(onTopicA.body.quiz?.id, QUIZ_A_NEW);

  const onTopicB = await getActiveQuiz(BOT_A, { topicId: TOPIC_B });
  assert.equal(onTopicB.body.quiz?.id, QUIZ_UNTYPED);
  // The fallback quiz has no topic of its own, so it must not claim one.
  assert.equal(onTopicB.body.quiz?.topicId, "");
});

test("active-quiz rejects a topic that belongs to another bot", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await getActiveQuiz(BOT_A, { topicId: TOPIC_FOREIGN });
  assert.equal(status, 400);
  assert.equal(body.code, "TOPIC_CHARACTER_MISMATCH");
});

/* -------------------- generate -------------------- */

test("generate refuses a topic that belongs to another bot", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await fetch(`${baseUrl}/api/quizzes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader(TEACHER_A) },
    body: JSON.stringify({
      botId: BOT_A,
      sourceText: "some source text",
      targetGrade: "S1",
      questionCount: 3,
      topicId: TOPIC_FOREIGN,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  // The topic check runs before any AI call, so this holds without a Gemini key.
  assert.equal(response.status, 400);
  assert.equal(body.code, "TOPIC_CHARACTER_MISMATCH");
});

/* -------------------- PATCH /quizzes/:id/topic -------------------- */

test("changing the topic of a published quiz returns the new topic and updates the row", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await patchTopic(QUIZ_UNTYPED, TOPIC_B);
  assert.equal(status, 200);
  assert.equal(body.quiz?.topicId, TOPIC_B);
  assert.equal(body.quiz?.topicName, "第二課");
  const row = await pool.query("SELECT topic_id FROM quizzes WHERE id=$1", [QUIZ_UNTYPED]);
  assert.equal(row.rows[0].topic_id, TOPIC_B);
});

test("a draft quiz can be moved between topics too", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await patchTopic(QUIZ_DRAFT, TOPIC_B);
  assert.equal(status, 200);
  assert.equal(body.quiz?.topicId, TOPIC_B);
  // The response says nothing about status, so read the row: moving a draft must not publish it.
  const row = await pool.query("SELECT topic_id, status FROM quizzes WHERE id=$1", [QUIZ_DRAFT]);
  assert.equal(row.rows[0].topic_id, TOPIC_B);
  assert.equal(row.rows[0].status, "draft");
});

test("a null topicId clears the topic back to 不分主題", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await patchTopic(QUIZ_A_NEW, null);
  assert.equal(status, 200);
  assert.equal(body.quiz?.topicId, "");
  assert.equal(body.quiz?.topicName, "");
  const row = await pool.query("SELECT topic_id FROM quizzes WHERE id=$1", [QUIZ_A_NEW]);
  assert.equal(row.rows[0].topic_id, null);
});

test("changing the topic is refused for a foreign topic and for someone else's quiz", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const foreign = await patchTopic(QUIZ_A_NEW, TOPIC_FOREIGN);
  assert.equal(foreign.status, 400);
  assert.equal(foreign.body.code, "TOPIC_CHARACTER_MISMATCH");

  // Not the owner: 404 rather than 403, so the response does not reveal that it exists.
  const notMine = await patchTopic(QUIZ_OTHER, TOPIC_A);
  assert.equal(notMine.status, 404);
});

/* -------------------- topic columns on the teacher lists -------------------- */

test("the published, draft and grading lists carry the topic", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const published = await listQuizzes("published", "quizzes");
  const target = published.find((item) => item.id === QUIZ_A_NEW);
  assert.equal(target?.topicId, TOPIC_A);
  assert.equal(target?.topicName, "第一課");
  const untopiced = published.find((item) => item.id === QUIZ_UNTYPED);
  assert.equal(untopiced?.topicId, "");
  assert.equal(untopiced?.topicName, "");

  const drafts = await listQuizzes("drafts", "drafts");
  assert.equal(drafts.find((item) => item.id === QUIZ_DRAFT)?.topicId, TOPIC_A);

  const summaryResponse = await fetch(`${baseUrl}/api/teachers/me/grading-summary`, {
    headers: { Authorization: authHeader(TEACHER_A) },
  });
  const summary = (await summaryResponse.json()) as Record<string, any>;
  assert.equal(summary.quizzes.find((item: any) => item.id === QUIZ_A_NEW)?.topicName, "第一課");
});

/* -------------------- counts -------------------- */

test("available-quiz-bots carries each bot's topics, and topics carries the quiz counts", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const botsResponse = await fetch(`${baseUrl}/api/teachers/me/available-quiz-bots`, {
    headers: { Authorization: authHeader(TEACHER_A) },
  });
  const bots = ((await botsResponse.json()) as Record<string, any>).bots as Array<Record<string, any>>;
  const botA = bots.find((item) => item.id === BOT_A);
  assert.deepEqual(
    (botA?.topics || []).map((topic: any) => topic.id),
    [TOPIC_A, TOPIC_B]
  );
  assert.equal(botA?.topics?.[0]?.isDefault, true);

  const topicsResponse = await fetch(`${baseUrl}/api/bots/${BOT_A}/topics`, {
    headers: { Authorization: authHeader(TEACHER_A) },
  });
  const topicsBody = (await topicsResponse.json()) as Record<string, any>;
  // Two published quizzes sit on TOPIC_A (the draft does not count); none on TOPIC_B.
  assert.equal(topicsBody.quizCounts?.[TOPIC_A], 2);
  assert.equal(topicsBody.quizCounts?.[TOPIC_B] ?? 0, 0);
});

test("the pending quiz count keeps one bucket per topic, so an older quiz cannot inflate it", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const countFor = () => countPendingQuizzesForBot(BOT_A, STUDENT);
  const addAttempt = (id: string, quizId: string, status: string) =>
    pool.query(
      `INSERT INTO quiz_attempts (id, quiz_id, student_id, bot_id, status) VALUES ($1,$2,$3,$4,$5)`,
      [id, quizId, STUDENT, BOT_A, status]
    );

  // Bot A has three published quizzes but only two buckets — TOPIC_A and 不分主題 — so the
  // number matches the entries a student can actually reach from the Bot card.
  assert.equal(await countFor(), 2);

  // Finishing the newest quiz of a bucket settles that bucket...
  await addAttempt(`${PREFIX}attempt_1`, QUIZ_A_NEW, "completed");
  assert.equal(await countFor(), 1);

  // ...and an unfinished attempt on the *older* quiz of the same bucket cannot bring it back.
  await addAttempt(`${PREFIX}attempt_2`, QUIZ_A_OLD, "in_progress");
  assert.equal(await countFor(), 1);

  // 不分主題 is its own bucket, counted separately.
  await addAttempt(`${PREFIX}attempt_3`, QUIZ_UNTYPED, "completed");
  assert.equal(await countFor(), 0);
});

/* -------------------- data-level safety net -------------------- */

test("deleting a topic degrades its quizzes to 不分主題 instead of orphaning them", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await patchTopic(QUIZ_UNTYPED, TOPIC_A);
  await pool.query("DELETE FROM character_topics WHERE id=$1", [TOPIC_A]);
  const row = await pool.query("SELECT topic_id, status FROM quizzes WHERE id=$1", [QUIZ_UNTYPED]);
  assert.equal(row.rows[0].topic_id, null);
  // The quiz itself survives — it just becomes visible in every topic.
  assert.equal(row.rows[0].status, "published");
});
