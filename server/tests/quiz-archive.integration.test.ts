import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import quizzesRouter, { ensureQuizTables } from "../api/quizzes.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";

// This suite writes real schema into whatever DATABASE_URL points at, so it must be a
// local dedicated test database. Without the `quizzes_test` marker every DB test skips
// silently and the suite still reports green.
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /quizzes_test/.test(databaseUrl);

const PREFIX = "qarch_";
const TEACHER_A = `${PREFIX}teacher_a`;
const TEACHER_B = `${PREFIX}teacher_b`;
const ADMIN = `${PREFIX}admin`;
const STUDENT = `${PREFIX}student_1`;
const BOT_A = `${PREFIX}bot_a`;
const QUIZ_A = `${PREFIX}quiz_a`;
const QUIZ_B = `${PREFIX}quiz_b`;
const ALL_USERS = [TEACHER_A, TEACHER_B, ADMIN, STUDENT];
const ALL_QUIZZES = [QUIZ_A, QUIZ_B];

let httpServer: Server | null = null;
let baseUrl = "";

type QuizRow = {
  archived_at: Date | null;
  updated_at: Date;
  published_at: Date | null;
  status: string;
};

async function resetFixture() {
  await pool.query("DELETE FROM quizzes WHERE id = ANY($1::text[])", [ALL_QUIZZES]);
  await pool.query("DELETE FROM bots WHERE id = $1", [BOT_A]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash) VALUES
       ($1,'Teacher A','qarch_teacher_a@example.test','teacher','x'),
       ($2,'Teacher B','qarch_teacher_b@example.test','teacher','x'),
       ($3,'Admin','qarch_admin@example.test','admin','x'),
       ($4,'Student 1','qarch_student_1@example.test','student','x')`,
    ALL_USERS
  );
  await pool.query(`INSERT INTO bots (id, name, owner_id) VALUES ($1,'Bot A',$2)`, [BOT_A, TEACHER_A]);
  // updated_at is deliberately a day old: comparing two timestamps microseconds apart
  // would let an accidental `updated_at = NOW()` through. QUIZ_B belongs to another
  // teacher, so it is the "not yours" fixture.
  await pool.query(
    `INSERT INTO quizzes (id, bot_id, teacher_id, title, source_text, target_grade, question_count, status, published_at, updated_at)
     VALUES ($1,$3,$4,'Quiz A','source','S1',5,'published', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
            ($2,$3,$5,'Quiz B','source','S1',5,'published', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
    [QUIZ_A, QUIZ_B, BOT_A, TEACHER_A, TEACHER_B]
  );
}

async function quizRow(quizId: string) {
  const result = await pool.query("SELECT archived_at, updated_at, published_at, status FROM quizzes WHERE id=$1", [
    quizId,
  ]);
  return result.rows[0] as QuizRow | undefined;
}

function authHeader(userId = TEACHER_A, role: "teacher" | "student" | "admin" = "teacher") {
  return `Bearer ${signToken({ sub: userId, email: `${userId}@example.test`, role, exp: Date.now() + 3_600_000 })}`;
}

async function callArchive(
  quizId: string,
  options: { body?: unknown; role?: "teacher" | "student" | "admin"; userId?: string; anonymous?: boolean } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!options.anonymous) headers.Authorization = authHeader(options.userId || TEACHER_A, options.role || "teacher");
  const response = await fetch(`${baseUrl}/api/quizzes/${quizId}/archive`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(options.body === undefined ? { archived: true } : options.body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

async function publishedList(userId = TEACHER_A, role: "teacher" | "admin" = "teacher") {
  const response = await fetch(`${baseUrl}/api/quizzes/published`, {
    headers: { Authorization: authHeader(userId, role) },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  return { status: response.status, quizzes: (body.quizzes || []) as Array<Record<string, any>> };
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
  // bots.subject belongs to the production DDL that is not part of this repo, so a fresh
  // test database only gets it here. GET /quizzes/published selects it.
  await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS subject TEXT`);
  await ensurePlatformTables();
  await ensureQuizTables();

  const app = express();
  app.use(express.json());
  // index.ts mounts this router at /api, and the route itself is /quizzes/:id/archive.
  app.use("/api", quizzesRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  await resetFixture();
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

test("archiving marks the quiz and leaves updated_at alone", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const beforeRow = await quizRow(QUIZ_A);

  const response = await callArchive(QUIZ_A);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.id, QUIZ_A);
  assert.ok(response.body.archivedAt, "response has to carry the archive timestamp");

  const afterRow = await quizRow(QUIZ_A);
  assert.ok(afterRow!.archived_at, "archived_at has to be written");
  assert.equal(
    afterRow!.updated_at.getTime(),
    beforeRow!.updated_at.getTime(),
    "archiving must not touch updated_at: it would reshuffle the teacher's list ordering"
  );
  assert.equal(afterRow!.status, "published", "archiving hides a quiz, it does not unpublish it");
});

test("restoring clears archived_at and also leaves updated_at alone", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await callArchive(QUIZ_A);
  const archivedRow = await quizRow(QUIZ_A);

  const response = await callArchive(QUIZ_A, { body: { archived: false } });
  assert.equal(response.status, 200);
  assert.equal(response.body.archivedAt, null, "response has to say the quiz is no longer archived");

  const restoredRow = await quizRow(QUIZ_A);
  assert.equal(restoredRow!.archived_at, null);
  assert.equal(
    restoredRow!.updated_at.getTime(),
    archivedRow!.updated_at.getTime(),
    "restoring must not touch updated_at either"
  );
});

test("an absent archived field restores the quiz instead of doing nothing", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await callArchive(QUIZ_A);

  // Boolean(undefined) is false, so the route takes the restore branch. That is the
  // documented behaviour: the field is opt-in, not a no-op when missing.
  const response = await callArchive(QUIZ_A, { body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.body.archivedAt, null);
  assert.equal((await quizRow(QUIZ_A))!.archived_at, null);
});

test("archiving twice still succeeds and stays archived", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const first = await callArchive(QUIZ_A);
  const second = await callArchive(QUIZ_A);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200, "a repeat archive is not an error");
  assert.ok(second.body.archivedAt);
  assert.ok((await quizRow(QUIZ_A))!.archived_at);
});

test("another teacher's quiz is 404, not 403", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callArchive(QUIZ_B, { userId: TEACHER_A });

  assert.equal(response.status, 404, "ownership is scoped in the WHERE clause, so it reads as not found");
  assert.equal((await quizRow(QUIZ_B))!.archived_at, null, "the other teacher's quiz has to stay untouched");
});

test("an admin passes the role gate but still cannot archive someone else's quiz", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callArchive(QUIZ_A, { userId: ADMIN, role: "admin" });

  assert.equal(response.status, 404, "the role check is not the ownership check");
  assert.equal((await quizRow(QUIZ_A))!.archived_at, null);
});

test("an unknown quiz id is 404", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  assert.equal((await callArchive(`${PREFIX}nobody`)).status, 404);
});

test("a student is rejected with 403 and nothing is written", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callArchive(QUIZ_A, { userId: STUDENT, role: "student" });

  assert.equal(response.status, 403);
  assert.equal((await quizRow(QUIZ_A))!.archived_at, null);
});

test("a request without a token is rejected with 401", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callArchive(QUIZ_A, { anonymous: true });

  assert.equal(response.status, 401);
  assert.equal((await quizRow(QUIZ_A))!.archived_at, null);
});

test("an archived quiz stays in the published list, carrying archivedAt", { skip: !safeTestDatabase }, async () => {
  await resetFixture();

  const beforeArchive = await publishedList();
  assert.equal(beforeArchive.status, 200);
  const active = beforeArchive.quizzes.find((quiz) => quiz.id === QUIZ_A);
  assert.ok(active, "the fixture quiz has to show up in the published list");
  assert.equal(active!.archivedAt, null, "a live quiz reports archivedAt null");

  await callArchive(QUIZ_A);

  const afterArchive = await publishedList();
  const archived = afterArchive.quizzes.find((quiz) => quiz.id === QUIZ_A);
  assert.ok(archived, "archiving is not deletion: the quiz has to stay in the published list");
  assert.ok(archived!.archivedAt, "the list has to expose archivedAt so the UI can split active from archived");
  assert.equal(archived!.title, "Quiz A", "the rest of the summary is unchanged");
});
