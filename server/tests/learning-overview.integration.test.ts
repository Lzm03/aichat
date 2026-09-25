import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import learningOverviewRouter from "../api/learning-overview.ts";
import { ensureParticipationTables } from "../lib/participation.ts";
import { ensureQuizTables } from "../api/quizzes.ts";
import { ensureFlaggedChatTables } from "../api/flagged-chat.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";

// 呢個 test 會建真 schema 落 DATABASE_URL 指住嘅 DB，所以一定要係本機嘅專用 test DB。
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /students_test/.test(databaseUrl);

const PREFIX = "lovo_";
const TEACHER_A = `${PREFIX}teacher_a`;
const TEACHER_B = `${PREFIX}teacher_b`;
const STUDENT_A = `${PREFIX}student_1`;
const STUDENT_B = `${PREFIX}student_2`;
const STUDENT_C = `${PREFIX}student_3`;
const GROUP_A = `${PREFIX}group_a1`;
const BOT_A = `${PREFIX}bot_a`;
const BOT_B = `${PREFIX}bot_b`;
const CONV_A = `${PREFIX}conv_a`;
const CONV_B = `${PREFIX}conv_b`;
const CONV_OLD = `${PREFIX}conv_old`;
const QUIZ_A = `${PREFIX}quiz_a`;
const QUIZ_B = `${PREFIX}quiz_b`;
const ALL_USERS = [TEACHER_A, TEACHER_B, STUDENT_A, STUDENT_B, STUDENT_C];
const ALL_CONVS = [CONV_A, CONV_B, CONV_OLD];

let httpServer: Server | null = null;
let baseUrl = "";

async function resetFixture() {
  await pool.query("DELETE FROM flagged_chat_messages WHERE teacher_id = ANY($1::text[]) OR student_user_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM bot_conversation_participation_windows WHERE conversation_id = ANY($1::text[])", [ALL_CONVS]);
  await pool.query("DELETE FROM bot_conversation_states WHERE conversation_id = ANY($1::text[])", [ALL_CONVS]);
  await pool.query("DELETE FROM conversation_messages WHERE conversation_id = ANY($1::text[])", [ALL_CONVS]);
  await pool.query("DELETE FROM conversations WHERE id = ANY($1::text[])", [ALL_CONVS]);
  await pool.query("DELETE FROM bot_student_progress WHERE bot_id = ANY($1::text[])", [[BOT_A, BOT_B]]);
  await pool.query("DELETE FROM quizzes WHERE id = ANY($1::text[])", [[QUIZ_A, QUIZ_B]]);
  await pool.query("DELETE FROM student_group_members WHERE group_id = $1 OR student_id = ANY($2::text[])", [GROUP_A, ALL_USERS]);
  await pool.query("DELETE FROM teacher_students WHERE teacher_id = ANY($1::text[]) OR student_id = ANY($1::text[])", [ALL_USERS]);
  await pool.query("DELETE FROM student_groups WHERE id = $1", [GROUP_A]);
  await pool.query("DELETE FROM bots WHERE id = ANY($1::text[])", [[BOT_A, BOT_B]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash) VALUES
       ($1,'Teacher A','lovo_teacher_a@example.test','teacher','x'),
       ($2,'Teacher B','lovo_teacher_b@example.test','teacher','x'),
       ($3,'Student 1','lovo_student_1@example.test','student','x'),
       ($4,'Student 2','lovo_student_2@example.test','student','x'),
       ($5,'Student 3','lovo_student_3@example.test','student','x')`,
    ALL_USERS
  );
  await pool.query(`INSERT INTO student_groups (id, teacher_id, name, type) VALUES ($1,$2,'Class A1','class')`, [GROUP_A, TEACHER_A]);
  await pool.query(`INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1,$2),($1,$3)`, [TEACHER_A, STUDENT_A, STUDENT_B]);
  await pool.query(`INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1,$2)`, [TEACHER_B, STUDENT_C]);
  await pool.query(`INSERT INTO student_group_members (group_id, student_id) VALUES ($1,$2)`, [GROUP_A, STUDENT_A]);
  await pool.query(`INSERT INTO bots (id, name, owner_id) VALUES ($1,'Bot A',$2),($3,'Bot B',$4)`, [BOT_A, TEACHER_A, BOT_B, TEACHER_B]);

  // STUDENT_A：窗口 3 條（effective 1、meaningless 1）→ 活躍
  await pool.query(`INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status) VALUES ($1,$2,$3,NULL,'conv a','bot_learning','active')`, [CONV_A, STUDENT_A, BOT_A]);
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
     VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,0,NOW(),NOW())`,
    [CONV_A, BOT_A, STUDENT_A]
  );
  await pool.query(
    `INSERT INTO bot_conversation_participation_windows
       (conversation_id, bot_id, user_id, topic_id, window_student_count, effective_count, meaningless_count, judge_source)
     VALUES ($1,$2,$3,'',3,1,1,'llm')`,
    [CONV_A, BOT_A, STUDENT_A]
  );

  // STUDENT_B（未分組）：一條「哦」、水位標 NULL → 尾巴 heuristic → 未有互動
  await pool.query(`INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status) VALUES ($1,$2,$3,NULL,'conv b','bot_learning','active')`, [CONV_B, STUDENT_B, BOT_A]);
  await pool.query(
    `INSERT INTO conversation_messages (id, conversation_id, user_id, bot_id, role, content, message_type, metadata)
     VALUES ($1,$2,$3,$4,'user','哦','normal','{}'::jsonb)`,
    [`${PREFIX}msg_b`, CONV_B, STUDENT_B, BOT_A]
  );
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
     VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,0,NULL,NOW())`,
    [CONV_B, BOT_A, STUDENT_B]
  );

  // 60 日前嘅舊窗口（period=30d 要撇除、all 要計）
  await pool.query(`INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status) VALUES ($1,$2,$3,NULL,'conv old','bot_learning','active')`, [CONV_OLD, STUDENT_A, BOT_A]);
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
     VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,0,NOW() - INTERVAL '60 days',NOW() - INTERVAL '60 days')`,
    [CONV_OLD, BOT_A, STUDENT_A]
  );
  await pool.query(
    `INSERT INTO bot_conversation_participation_windows
       (conversation_id, bot_id, user_id, topic_id, judged_at, window_student_count, effective_count, meaningless_count, judge_source)
     VALUES ($1,$2,$3,'',NOW() - INTERVAL '60 days',5,2,1,'llm')`,
    [CONV_OLD, BOT_A, STUDENT_A]
  );

  // 能力報告：A×1 今日新增、A×2 十日舊（唔當今日）
  await pool.query(
    `INSERT INTO bot_student_progress (bot_id, user_id, topic_id, covered_point_ids, created_at, updated_at) VALUES
       ($1,$2,'','["kp_001"]'::jsonb,NOW(),NOW()),
       ($1,$3,'','["kp_001"]'::jsonb,NOW() - INTERVAL '10 days',NOW() - INTERVAL '10 days'),
       ($4,$5,'','["kp_001"]'::jsonb,NOW(),NOW())`,
    [BOT_A, STUDENT_A, STUDENT_B, BOT_B, STUDENT_C]
  );

  // 測驗質量報告：1 日前批改（計）、10 日前（唔計）
  await pool.query(
    `INSERT INTO quizzes (id, bot_id, teacher_id, title, source_text, target_grade, question_count, status, published_at, grading_completed_at) VALUES
       ($1,$2,$3,'Quiz A','src','S1',5,'published',NOW(),NOW() - INTERVAL '1 day'),
       ($4,$2,$3,'Quiz B','src','S1',5,'published',NOW(),NOW() - INTERVAL '10 days')`,
    [QUIZ_A, BOT_A, TEACHER_A, QUIZ_B]
  );

  // 異常：open 不當用語、open 情緒困擾、已歸檔
  await pool.query(
    `INSERT INTO flagged_chat_messages
       (id, bot_id, student_user_id, teacher_id, content, excerpt, rule_id, category, action, status, created_at)
     VALUES
       ($1,$2,$3,$4,'你係垃圾','垃圾','inappropriate-chat-offensive-terms','inappropriate','block','open',NOW()),
       ($5,$2,$3,$4,'人生冇意義','人生冇意義','wellbeing-chat-distress-terms','wellbeing','flag','open',NOW()),
       ($6,$2,$3,$4,'我的電話係91234567','我的電話','privacy-chat-personal-info','privacy','block','resolved',NOW())`,
    [`${PREFIX}f1`, BOT_A, STUDENT_A, TEACHER_A, `${PREFIX}f2`, `${PREFIX}f3`]
  );
}

function authHeader(userId: string, role: "teacher" | "student") {
  return `Bearer ${signToken({ sub: userId, email: "lovo@example.test", role, exp: Date.now() + 3_600_000 })}`;
}

async function callApi(path: string, userId = TEACHER_A, role: "teacher" | "student" = "teacher") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: authHeader(userId, role) },
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

before(async () => {
  if (!safeTestDatabase) return;
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
  await ensureQuizTables();
  await ensureFlaggedChatTables();
  await ensureParticipationTables();

  const app = express();
  app.use(express.json());
  app.use("/api", learningOverviewRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

test("KPI 行：期內參與度加總 + 班級提醒（未有互動嘅班）", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { status, body } = await callApi("/api/teachers/me/learning-overview?period=30d");
  assert.equal(status, 200);
  assert.equal(body.period, "30d");
  // 30d：新窗口 3 條 + STUDENT_B 尾巴 1 條；舊窗口（60d）唔計
  assert.equal(body.participation.activeStudents, 1);
  assert.equal(body.participation.noInteractionStudents, 1);
  assert.equal(body.participation.studentMessageTotal, 4);
  assert.equal(body.participation.meaninglessMessages, 2);
  // 提醒：未分組 bucket（STUDENT_B）有 1 位未有互動
  assert.equal(body.classAlerts.length, 1);
  assert.equal(body.classAlerts[0].classId, "");
  assert.equal(body.classAlerts[0].noInteractionStudents, 1);
});

test("period=all 包埋 60 日前嘅舊窗口", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { body } = await callApi("/api/teachers/me/learning-overview?period=all");
  assert.equal(body.participation.studentMessageTotal, 9); // 3 + 1 + 5
  assert.equal(body.participation.meaninglessMessages, 3); // 1 + 1 + 1
});

test("異常數字：anomalyOpen = 紅點數、wellbeingOpen 分開", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { body } = await callApi("/api/teachers/me/learning-overview?period=30d");
  assert.equal(body.anomalyOpen, 2);
  assert.equal(body.wellbeingOpen, 1);
});

test("最近動態：今日新增報告／掌握進展、7 日測驗報告", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { body } = await callApi("/api/teachers/me/learning-overview?period=30d");
  // A×1 今日新增（A×2 十日舊、B×C 係老師 B 嘅 bot）→ 報告 1、學生 1
  assert.equal(body.updates.abilityReportsToday, 1);
  assert.equal(body.updates.knowledgeStudentsToday, 1);
  assert.equal(body.updates.quizReportsGraded7d, 1);
});

test("今日快照：有實質互動／需要跟進（HKT 今日）", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { body } = await callApi("/api/teachers/me/learning-overview?period=30d");
  // 新窗口 judged_at = NOW() → 今日活躍 1；STUDENT_B 尾巴 created_at NOW() → 今日未有互動 1
  assert.equal(body.today.activeStudents, 1);
  assert.equal(body.today.noInteractionStudents, 1);
});

test("老師範圍隔離：老師 B 只見到自己嘅數據", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const { body } = await callApi("/api/teachers/me/learning-overview?period=30d", TEACHER_B);
  // 老師 B 嘅 roster 得 STUDENT_C，佢冇對話 → 未有互動 1、冇活躍
  assert.equal(body.participation.noInteractionStudents, 1);
  assert.equal(body.participation.activeStudents, 0);
  assert.equal(body.anomalyOpen, 0);
  // B×C 今日新增 → 報告 1
  assert.equal(body.updates.abilityReportsToday, 1);
});

test("未登入／學生身份被拒", { skip: !safeTestDatabase }, async () => {
  const anon = await fetch(`${baseUrl}/api/teachers/me/learning-overview`);
  assert.equal(anon.status, 401);
  const student = await callApi("/api/teachers/me/learning-overview", STUDENT_A, "student");
  assert.equal(student.status, 403);
});
