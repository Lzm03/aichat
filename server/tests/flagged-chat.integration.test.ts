import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import askRouter from "../api/ask.ts";
import flaggedChatRouter, { ensureFlaggedChatTables } from "../api/flagged-chat.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";

// 呢個 test 會建真 schema 落 DATABASE_URL 指住嘅 DB，所以一定要係本機嘅專用 test DB。
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /students_test/.test(databaseUrl);

const PREFIX = "fchat_";
const TEACHER_A = `${PREFIX}teacher_a`;
const TEACHER_B = `${PREFIX}teacher_b`;
const STUDENT_A = `${PREFIX}student_1`;
const STUDENT_B = `${PREFIX}student_2`;
const GROUP_A = `${PREFIX}group_a1`;
const BOT_A = `${PREFIX}bot_a`;
const ALL_USERS = [TEACHER_A, TEACHER_B, STUDENT_A, STUDENT_B];

let httpServer: Server | null = null;
let baseUrl = "";

async function resetFixture() {
  await pool.query("DELETE FROM flagged_chat_messages WHERE teacher_id = ANY($1::text[]) OR student_user_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM bot_chat_messages WHERE user_id = ANY($1::text[]) OR teacher_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM conversation_messages WHERE user_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM conversations WHERE user_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM student_group_members WHERE group_id = $1 OR student_id = ANY($2::text[])", [GROUP_A, ALL_USERS]);
  await pool.query("DELETE FROM bot_student_shares WHERE bot_id = $1 OR teacher_id = ANY($2::text[])", [BOT_A, ALL_USERS]);
  await pool.query("DELETE FROM teacher_students WHERE teacher_id = ANY($1::text[]) OR student_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM student_groups WHERE id = $1", [GROUP_A]);
  await pool.query("DELETE FROM bots WHERE id = $1", [BOT_A]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash) VALUES
       ($1,'Teacher A','fchat_teacher_a@example.test','teacher','x'),
       ($2,'Teacher B','fchat_teacher_b@example.test','teacher','x'),
       ($3,'Student 1','fchat_student_1@example.test','student','x'),
       ($4,'Student 2','fchat_student_2@example.test','student','x')`,
    ALL_USERS
  );
  await pool.query(`INSERT INTO student_groups (id, teacher_id, name, type) VALUES ($1,$2,'Class A1','class')`, [GROUP_A, TEACHER_A]);
  await pool.query(`INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1,$2),($1,$3)`, [TEACHER_A, STUDENT_A, STUDENT_B]);
  await pool.query(`INSERT INTO student_group_members (group_id, student_id) VALUES ($1,$2)`, [GROUP_A, STUDENT_A]);
  await pool.query(`INSERT INTO bots (id, name, owner_id) VALUES ($1,'Bot A',$2)`, [BOT_A, TEACHER_A]);
  await pool.query(`INSERT INTO bot_student_shares (bot_id, teacher_id, student_id) VALUES ($1,$2,$3)`, [BOT_A, TEACHER_A, STUDENT_A]);
}

function authHeader(userId: string, role: "teacher" | "student") {
  return `Bearer ${signToken({ sub: userId, email: "fchat@example.test", role, exp: Date.now() + 3_600_000 })}`;
}

async function callApi(method: string, path: string, options: { body?: unknown; userId?: string; role?: "teacher" | "student"; anonymous?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!options.anonymous) headers.Authorization = authHeader(options.userId || TEACHER_A, options.role || "teacher");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

before(async () => {
  if (!safeTestDatabase) return;
  // bots 係遺留表：ensurePlatformTables 唔會建佢，但 bot_student_shares 有 FK 指住，
  // 所以一個全新嘅 test DB 一定要先自己有 bots。
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
  await ensurePlatformTables();
  await ensureFlaggedChatTables();

  const app = express();
  app.use(express.json());
  app.use("/api", askRouter);
  app.use("/api/flagged-chat", flaggedChatRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  await resetFixture();
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

test("學生訊息含不當用語 → 422 攔截、留紀錄、唔入任何對話表", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await callApi("POST", "/api/ask", {
    userId: STUDENT_A,
    role: "student",
    body: {
      userPrompt: "你條仆街",
      botId: BOT_A,
      sharedBotId: BOT_A,
      usageType: "chat_message",
      stream: false,
      source: "direct",
    },
  });
  assert.equal(status, 422);
  assert.equal(body.code, "inappropriate_language");

  const flags = await pool.query(
    `SELECT f.*, b.name AS bot_name FROM flagged_chat_messages f LEFT JOIN bots b ON b.id = f.bot_id WHERE f.student_user_id=$1`,
    [STUDENT_A]
  );
  assert.equal(flags.rows.length, 1);
  const row = flags.rows[0];
  assert.equal(row.content, "你條仆街");
  assert.equal(row.excerpt, "仆街");
  assert.equal(row.rule_id, "inappropriate-chat-offensive-terms");
  assert.equal(row.category, "inappropriate");
  assert.equal(row.action, "block");
  assert.equal(row.detected_by, "keyword");
  assert.equal(row.status, "open");
  assert.equal(row.teacher_id, TEACHER_A);

  const chatLog = await pool.query(`SELECT * FROM bot_chat_messages WHERE user_id=$1`, [STUDENT_A]);
  assert.equal(chatLog.rows.length, 0, "攔截訊息唔應該入 bot_chat_messages");
  const convMessages = await pool.query(`SELECT * FROM conversation_messages WHERE user_id=$1`, [STUDENT_A]);
  assert.equal(convMessages.rows.length, 0, "攔截訊息唔應該入 conversation_messages");
  const convs = await pool.query(`SELECT * FROM conversations WHERE user_id=$1`, [STUDENT_A]);
  assert.equal(convs.rows.length, 0, "攔截訊息唔應該建 conversation");
});

test("私隱訊息 → 422 攔截、code 同不當用語唔同", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await callApi("POST", "/api/ask", {
    userId: STUDENT_A,
    role: "student",
    body: {
      userPrompt: "我電話係 91234567，你可以打俾我",
      botId: BOT_A,
      sharedBotId: BOT_A,
      usageType: "chat_message",
      stream: false,
      source: "direct",
    },
  });
  assert.equal(status, 422);
  assert.equal(body.code, "personal_data_detected", "私隱要用另一個 code，前端文案唔同");

  const flags = await pool.query(`SELECT * FROM flagged_chat_messages WHERE student_user_id=$1`, [STUDENT_A]);
  assert.equal(flags.rows.length, 1);
  assert.equal(flags.rows[0].category, "privacy");
  assert.equal(flags.rows[0].action, "block");
  assert.equal(flags.rows[0].rule_id, "privacy-chat-personal-info");
  assert.equal(flags.rows[0].excerpt, "電話係 91234567");

  const chatLog = await pool.query(`SELECT * FROM bot_chat_messages WHERE user_id=$1`, [STUDENT_A]);
  assert.equal(chatLog.rows.length, 0, "攔截訊息唔應該入 bot_chat_messages");
});

test("情緒困擾訊息 → 唔攔截（唔回 422），照留紀錄畀老師", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // 用一個唔存在嘅 conversationId：請求過咗攔截鉤子之後就會撞 404，行唔到
  // model call（test 環境冇 AI key）。呢個 404 正好證明情緒困擾冇被攔截
  // ——攔截嘅話會係 422，根本行唔到後面任何一步。
  const { status } = await callApi("POST", "/api/ask", {
    userId: STUDENT_B,
    role: "student",
    body: {
      userPrompt: "我覺得人生冇意義，唔想返學",
      botId: BOT_A,
      sharedBotId: BOT_A,
      conversationId: `${PREFIX}no_such_conversation`,
      usageType: "chat_message",
      stream: false,
      source: "direct",
    },
  });
  assert.notEqual(status, 422, "情緒困擾絕對唔可以攔截——靜音求救訊號係最壞失敗模式");
  assert.equal(status, 404, "行到對話查詢先失敗，證明鉤子放行咗");

  const flags = await pool.query(`SELECT * FROM flagged_chat_messages WHERE student_user_id=$1`, [STUDENT_B]);
  assert.equal(flags.rows.length, 1, "照樣要留紀錄");
  assert.equal(flags.rows[0].category, "wellbeing");
  assert.equal(flags.rows[0].action, "flag");
  assert.equal(flags.rows[0].rule_id, "wellbeing-chat-distress-terms");
  assert.equal(flags.rows[0].status, "open");
});

test("冇老師可通知（default bot）→ 照攔截、唔留紀錄", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await callApi("POST", "/api/ask", {
    userId: STUDENT_A,
    role: "student",
    body: {
      userPrompt: "食屎啦",
      botId: "default",
      usageType: "chat_message",
      stream: false,
      source: "direct",
    },
  });
  assert.equal(status, 422);
  assert.equal(body.code, "inappropriate_language");
  const flags = await pool.query(`SELECT * FROM flagged_chat_messages WHERE student_user_id=$1`, [STUDENT_A]);
  assert.equal(flags.rows.length, 0);
});

test("count／list 只有嗰位老師見到；學生 JWT 全部 403", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // 直接插兩條 fixture：一條 open、一條 resolved，方便驗 filter 同 counts
  await pool.query(
    `INSERT INTO flagged_chat_messages
       (id, bot_id, student_user_id, teacher_id, content, excerpt, rule_id, status, teacher_comment, resolved_at)
     VALUES
       ($1,$2,$3,$4,'你係垃圾','垃圾','inappropriate-chat-offensive-terms','open','',NULL),
       ($5,$2,$3,$4,'收皮啦','收皮','inappropriate-chat-offensive-terms','resolved','已傾過','2026-09-24T08:00:00Z')`,
    [`${PREFIX}f1`, BOT_A, STUDENT_A, TEACHER_A, `${PREFIX}f2`]
  );

  const countA = await callApi("GET", "/api/flagged-chat/count", { userId: TEACHER_A });
  assert.equal(countA.status, 200);
  assert.equal(countA.body.count, 1);
  const countB = await callApi("GET", "/api/flagged-chat/count", { userId: TEACHER_B });
  assert.equal(countB.body.count, 0);

  const listA = await callApi("GET", "/api/flagged-chat?status=all", { userId: TEACHER_A });
  assert.equal(listA.status, 200);
  assert.equal(listA.body.total, 2);
  assert.equal(listA.body.openCount, 1);
  assert.deepEqual(listA.body.statusCounts, { open: 1, resolved: 1, dismissed: 0 });
  const openFlag = listA.body.flags.find((flag: any) => flag.status === "open");
  assert.equal(openFlag.studentName, "Student 1");
  assert.equal(openFlag.botName, "Bot A");
  assert.deepEqual(openFlag.groupNames, ["Class A1"]);

  const listOpen = await callApi("GET", "/api/flagged-chat?status=open", { userId: TEACHER_A });
  assert.equal(listOpen.body.flags.length, 1);
  assert.equal(listOpen.body.flags[0].category, "inappropriate", "mapped 出嚟嘅 row 要帶類別");

  const listArchived = await callApi("GET", "/api/flagged-chat?status=archived", { userId: TEACHER_A });
  assert.equal(listArchived.body.flags.length, 1, "archived = resolved + dismissed");
  assert.equal(listArchived.body.flags[0].status, "resolved");

  // 情緒困擾優先：開一條最新嘅 inappropriate 同一條較舊嘅 wellbeing，wellbeing 要排前面
  await pool.query(
    `INSERT INTO flagged_chat_messages
       (id, bot_id, student_user_id, teacher_id, content, excerpt, rule_id, category, action, created_at)
     VALUES ($1,$2,$3,$4,'你條仆街','仆街','inappropriate-chat-offensive-terms','inappropriate','block','2026-09-24T10:00:00Z'),
            ($5,$2,$3,$4,'我好想消失','想消失','wellbeing-chat-distress-terms','wellbeing','flag','2026-09-24T09:00:00Z')`,
    [`${PREFIX}f_new`, BOT_A, STUDENT_A, TEACHER_A, `${PREFIX}f_well`]
  );
  const pinned = await callApi("GET", "/api/flagged-chat?status=open", { userId: TEACHER_A });
  assert.equal(pinned.body.flags[0].category, "wellbeing", "情緒困擾要置頂，就算唔係最新");
  await pool.query(`DELETE FROM flagged_chat_messages WHERE id = ANY($1::text[])`, [[`${PREFIX}f_new`, `${PREFIX}f_well`]]);

  for (const [method, path] of [
    ["GET", "/api/flagged-chat/count"],
    ["GET", "/api/flagged-chat"],
    ["PATCH", `/api/flagged-chat/${openFlag.id}`],
  ] as const) {
    const denied = await callApi(method, path, {
      userId: STUDENT_A,
      role: "student",
      body: method === "PATCH" ? { status: "resolved" } : undefined,
    });
    assert.equal(denied.status, 403, `${method} ${path} 應該拒學生`);
  }
});

test("PATCH：open→resolved 帶備註、重複處理 400、他人紀錄 404、非法狀態 400", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await pool.query(
    `INSERT INTO flagged_chat_messages
       (id, bot_id, student_user_id, teacher_id, content, excerpt, rule_id, status)
     VALUES ($1,$2,$3,$4,'屌你','屌你','inappropriate-chat-offensive-terms','open')`,
    [`${PREFIX}f3`, BOT_A, STUDENT_A, TEACHER_A]
  );

  const patch = await callApi("PATCH", `/api/flagged-chat/${PREFIX}f3`, {
    userId: TEACHER_A,
    body: { status: "resolved", teacherComment: "已同學生傾過" },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.ok, true);
  assert.equal(patch.body.flag.status, "resolved");
  assert.equal(patch.body.flag.teacherComment, "已同學生傾過");

  const second = await callApi("PATCH", `/api/flagged-chat/${PREFIX}f3`, {
    userId: TEACHER_A,
    body: { status: "dismissed" },
  });
  assert.equal(second.status, 400);

  const foreign = await callApi("PATCH", `/api/flagged-chat/${PREFIX}f3`, {
    userId: TEACHER_B,
    body: { status: "resolved" },
  });
  assert.equal(foreign.status, 404);

  const invalid = await callApi("POST", "/api/flagged-chat/count", { userId: TEACHER_A });
  assert.equal(invalid.status, 404, "冇 POST count route");

  const badStatus = await callApi("PATCH", `/api/flagged-chat/${PREFIX}f3`, {
    userId: TEACHER_A,
    body: { status: "whatever" },
  });
  assert.equal(badStatus.status, 400);
});
