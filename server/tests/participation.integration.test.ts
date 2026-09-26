import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import participationRouter from "../api/participation.ts";
import { trackConversationState } from "../lib/conversation-state.ts";
import {
  ensureParticipationTables,
  recordMasteryEvents,
  runIdleParticipationScan,
} from "../lib/participation.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";
import type { JudgeWindowResult } from "../lib/answer-judge.ts";
import { saveConversationMessage } from "../lib/conversations.ts";

// 呢個 test 會建真 schema 落 DATABASE_URL 指住嘅 DB，所以一定要係本機嘅專用 test DB。
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /students_test/.test(databaseUrl);

const PREFIX = "part_";
const TEACHER_A = `${PREFIX}teacher_a`;
const TEACHER_B = `${PREFIX}teacher_b`;
const STUDENT_A = `${PREFIX}student_1`;
const STUDENT_B = `${PREFIX}student_2`;
const STUDENT_C = `${PREFIX}student_3`;
const GROUP_A = `${PREFIX}group_a1`;
const BOT_A = `${PREFIX}bot_a`;
const CONV_A = `${PREFIX}conv_a`;
const CONV_B = `${PREFIX}conv_b`;
const CONV_C = `${PREFIX}conv_c`;
const CONV_OLD = `${PREFIX}conv_old`;
const CONV_SCAN = `${PREFIX}conv_scan`;
const CONV_DEL = `${PREFIX}conv_del`;
const ALL_USERS = [TEACHER_A, TEACHER_B, STUDENT_A, STUDENT_B, STUDENT_C];
const ALL_CONVS = [CONV_A, CONV_B, CONV_C, CONV_OLD, CONV_SCAN, CONV_DEL];

let httpServer: Server | null = null;
let baseUrl = "";

/** 造一個 track 輸入嘅「歷史訊息」：role + content + 參與度元數據 */
function makeMessage(
  role: "user" | "bot",
  content: string,
  second: number,
  messageType = "normal"
) {
  return {
    role,
    content,
    id: `${PREFIX}msg_${second}`,
    createdAt: new Date(`2026-09-20T10:00:${String(second).padStart(2, "0")}.000Z`).toISOString(),
    messageType,
  };
}

/** 參與度判斷 stub：demonstrated 恒 null（本測試唔驗覆蓋），engagement 由測試指定 */
function stubJudge(
  engagement: JudgeWindowResult["engagement"]
): (input: {
  points: unknown[];
  turns: unknown[];
  newStudentTurns: string[];
}) => Promise<JudgeWindowResult> {
  return async () => ({ demonstrated: null, engagement });
}

async function resetFixture() {
  await pool.query(
    "DELETE FROM bot_conversation_participation_windows WHERE conversation_id = ANY($1::text[])",
    [ALL_CONVS]
  );
  await pool.query(
    "DELETE FROM bot_student_mastery_events WHERE bot_id = ANY($1::text[])",
    [[BOT_A]]
  );
  await pool.query(
    "DELETE FROM bot_conversation_states WHERE conversation_id = ANY($1::text[])",
    [ALL_CONVS]
  );
  await pool.query(
    "DELETE FROM conversation_messages WHERE conversation_id = ANY($1::text[])",
    [ALL_CONVS]
  );
  await pool.query("DELETE FROM conversations WHERE id = ANY($1::text[])", [ALL_CONVS]);
  await pool.query(
    "DELETE FROM student_group_members WHERE group_id = $1 OR student_id = ANY($2::text[])",
    [GROUP_A, ALL_USERS]
  );
  await pool.query(
    "DELETE FROM bot_student_shares WHERE bot_id = $1",
    [BOT_A]
  );
  await pool.query(
    "DELETE FROM teacher_students WHERE teacher_id = ANY($1::text[]) OR student_id = ANY($1::text[])",
    [ALL_USERS]
  );
  await pool.query("DELETE FROM student_groups WHERE id = $1", [GROUP_A]);
  await pool.query("DELETE FROM bots WHERE id = $1", [BOT_A]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash) VALUES
       ($1,'Teacher A','part_teacher_a@example.test','teacher','x'),
       ($2,'Teacher B','part_teacher_b@example.test','teacher','x'),
       ($3,'Student 1','part_student_1@example.test','student','x'),
       ($4,'Student 2','part_student_2@example.test','student','x'),
       ($5,'Student 3','part_student_3@example.test','student','x')`,
    ALL_USERS
  );
  await pool.query(
    `INSERT INTO student_groups (id, teacher_id, name, type) VALUES ($1,$2,'Class A1','class')`,
    [GROUP_A, TEACHER_A]
  );
  await pool.query(
    `INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1,$2),($1,$3)`,
    [TEACHER_A, STUDENT_A, STUDENT_B]
  );
  await pool.query(
    `INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1,$2)`,
    [TEACHER_B, STUDENT_C]
  );
  await pool.query(
    `INSERT INTO student_group_members (group_id, student_id) VALUES ($1,$2)`,
    [GROUP_A, STUDENT_A]
  );
  await pool.query(
    `INSERT INTO bots (id, name, owner_id) VALUES ($1,'Bot A',$2)`,
    [BOT_A, TEACHER_A]
  );
}

function authHeader(userId: string, role: "teacher" | "student") {
  return `Bearer ${signToken({ sub: userId, email: "part@example.test", role, exp: Date.now() + 3_600_000 })}`;
}

async function callApi(path: string, userId = TEACHER_A, role: "teacher" | "student" = "teacher") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: authHeader(userId, role) },
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

async function windowRows(conversationId: string) {
  const result = await pool.query(
    `SELECT * FROM bot_conversation_participation_windows
     WHERE conversation_id=$1 ORDER BY judged_at ASC`,
    [conversationId]
  );
  return result.rows;
}

async function stateRow(conversationId: string) {
  const result = await pool.query(
    `SELECT * FROM bot_conversation_states WHERE conversation_id=$1`,
    [conversationId]
  );
  return result.rows[0] || null;
}

/** 聚合 CTE 由 conversations 起步，track 掛鉤測試都要有一行先計到（topic_id 要 NULL：有 FK 指 character_topics） */
async function insertConversation(id: string, userId: string, botId: string, status = "active") {
  await pool.query(
    `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status)
     VALUES ($1,$2,$3,NULL,'part conv','bot_learning',$4)`,
    [id, userId, botId, status]
  );
}

before(async () => {
  if (!safeTestDatabase) return;
  // bots 係遺留表：ensurePlatformTables 唔會建佢（見 flagged-chat 測試同註釋）
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
  await ensureParticipationTables();

  const app = express();
  app.use(express.json());
  app.use("/api", participationRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

test("track 掛鉤：judge 成功（llm 路徑）→ 窗口行 + 水位標推進 + 計數清零", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const messages = [
    makeMessage("bot", "你今日想學啲咩？", 1),
    makeMessage("user", "哦", 2),
    makeMessage("bot", "我哋可以傾下課文", 3),
    makeMessage("user", "點解要學呢課？", 4),
    makeMessage("bot", "因為佢係基礎", 5),
    makeMessage("user", "我明白咗", 6),
  ];
  const judgeFn = stubJudge({ meaningless: new Set([0]), effective: new Set([1]) });

  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: messages,
    reply: "答得幾好",
    judgeFn,
  });

  const windows = await windowRows(CONV_A);
  assert.equal(windows.length, 1);
  assert.equal(Number(windows[0].window_student_count), 3);
  assert.equal(Number(windows[0].effective_count), 1);
  assert.equal(Number(windows[0].meaningless_count), 1);
  assert.equal(windows[0].judge_source, "llm");

  const state = await stateRow(CONV_A);
  assert.equal(Number(state.turns_since_judge), 0);
  assert.equal(
    new Date(state.participation_watermark).getTime(),
    new Date(makeMessage("user", "", 6).createdAt).getTime()
  );
});

test("track 掛鉤：judge 回 null → heuristic fallback 照寫窗口、judgeSource 標明", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const messages = [
    makeMessage("user", "哦", 1),
    makeMessage("bot", "你想學咩？", 2),
    makeMessage("user", "點解要學呢課？", 3),
    makeMessage("bot", "因為好重要", 4),
    makeMessage("user", "明白", 5),
  ];

  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: messages,
    reply: "好的",
    judgeFn: stubJudge(null),
  });

  const windows = await windowRows(CONV_A);
  assert.equal(windows.length, 1);
  assert.equal(Number(windows[0].window_student_count), 3);
  assert.equal(Number(windows[0].effective_count), 0);
  // 「哦」(1 字) 同「明白」(2 字) meaningless；「點解要學呢課？」(7 字) substantive
  assert.equal(Number(windows[0].meaningless_count), 2);
  assert.equal(windows[0].judge_source, "heuristic-fallback");
});

test("水位標防重複計數：同一批訊息唔會 judge 兩次", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const firstBatch = [
    makeMessage("user", "哦", 1),
    makeMessage("bot", "你好", 2),
    makeMessage("user", "點解要學呢課？", 3),
    makeMessage("bot", "因為好重要", 4),
    makeMessage("user", "我明白咗", 5),
  ];
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: firstBatch,
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set(), effective: new Set() }),
  });

  // 同一批再 track 一次（水位標已經越過佢哋）→ 唔會再有窗口
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: firstBatch,
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set(), effective: new Set() }),
  });
  assert.equal((await windowRows(CONV_A)).length, 1);

  // 第二批（新時間，3 條先夠節流）→ 得佢哋入新窗口，總和唔會加倍
  const secondBatch = [
    ...firstBatch,
    makeMessage("bot", "跟住呢？", 6),
    makeMessage("user", "我想問多啲", 7),
    makeMessage("bot", "隨便問", 8),
    makeMessage("user", "呢度唔明", 9),
    makeMessage("bot", "邊度？", 10),
    makeMessage("user", "第二段", 11),
  ];
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: secondBatch,
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set([0]), effective: new Set([1]) }),
  });

  const windows = await windowRows(CONV_A);
  assert.equal(windows.length, 2);
  const total = windows.reduce((sum, row) => sum + Number(row.window_student_count), 0);
  assert.equal(total, 3 + 3);
});

test("quiz_* 訊息唔入參與度計數；debounce 兩條 row 計 2", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // 2 條 normal + 1 條 quiz：計數 = 2（未夠 3，唔 judge）
  const messages = [
    makeMessage("user", "點解要學呢課？", 1),
    makeMessage("bot", "因為好重要", 2),
    makeMessage("user", "quiz 作答內容", 3, "quiz_answer"),
    makeMessage("user", "我想知多啲", 4),
  ];
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: messages,
    reply: "好的",
    judgeFn: stubJudge(null),
  });
  assert.equal((await windowRows(CONV_A)).length, 0);
  assert.equal(Number((await stateRow(CONV_A)).turns_since_judge), 2);

  // 第三條 normal → 夠 3 → judge；窗口只計 3 條 normal，quiz 唔入
  const more = [
    ...messages,
    makeMessage("bot", "當然可以", 5),
    makeMessage("user", "我明白咗", 6),
  ];
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: more,
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set([0]), effective: new Set([1]) }),
  });
  const windows = await windowRows(CONV_A);
  assert.equal(windows.length, 1);
  assert.equal(Number(windows[0].window_student_count), 3);
  assert.equal(Number((await stateRow(CONV_A)).turns_since_judge), 0);
});

test("冇 core 知識點嘅 bot：參與度照行、狀態行照寫", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const messages = [
    makeMessage("user", "哦", 1),
    makeMessage("bot", "你好", 2),
    makeMessage("user", "點解要學呢課？", 3),
    makeMessage("bot", "因為好重要", 4),
    makeMessage("user", "我明白咗", 5),
  ];
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: messages,
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set([0]), effective: new Set([1]) }),
  });
  const state = await stateRow(CONV_A);
  assert.ok(state, "冇點嘅 bot 都要有狀態行（水位標住處）");
  assert.deepEqual(state.covered_point_ids, []);
  assert.equal((await windowRows(CONV_A)).length, 1);
});

test("聚合 class 維度：班級 bucket + 未分組 bucket + 未有互動名單", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // STUDENT_A（Class A1）：窗口 3 條（effective 1、meaningless 1）→ substantive 2，活躍
  await insertConversation(CONV_A, STUDENT_A, BOT_A);
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: [
      makeMessage("user", "哦", 1),
      makeMessage("bot", "你好", 2),
      makeMessage("user", "點解要學呢課？", 3),
      makeMessage("bot", "因為好重要", 4),
      makeMessage("user", "我明白咗", 5),
    ],
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set([0]), effective: new Set([1]) }),
  });

  // STUDENT_B（未分組）：一條「哦」，從未被 judge → 尾巴 heuristic → substantive 0
  await insertConversation(CONV_B, STUDENT_B, BOT_A);
  await saveConversationMessage({
    conversationId: CONV_B,
    userId: STUDENT_B,
    botId: BOT_A,
    role: "user",
    content: "哦",
    messageType: "normal",
    metadata: {},
  });
  // 狀態行存在但水位標 NULL → 尾巴 = 全部訊息
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
     VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,0,NULL,NOW())`,
    [CONV_B, BOT_A, STUDENT_B]
  );

  const { status, body } = await callApi("/api/teachers/me/participation?period=all&dimension=class");
  assert.equal(status, 200);
  assert.equal(body.dimension, "class");

  const classA = body.rows.find((row: any) => row.id === GROUP_A);
  assert.ok(classA, "要有 Class A1 bucket");
  assert.equal(classA.studentMessageTotal, 3);
  assert.equal(classA.effectiveQuestions, 1);
  assert.equal(classA.meaninglessMessages, 1);
  assert.equal(classA.substantiveMessages, 2);
  assert.equal(classA.activeStudents, 1);
  assert.equal(classA.noInteractionStudents, 0);

  const ungrouped = body.rows.find((row: any) => row.id === "");
  assert.ok(ungrouped, "冇班嘅學生要合併做未分組 bucket");
  assert.equal(ungrouped.studentMessageTotal, 1);
  assert.equal(ungrouped.meaninglessMessages, 1);
  assert.equal(ungrouped.substantiveMessages, 0);
  assert.equal(ungrouped.activeStudents, 0);
  assert.equal(ungrouped.noInteractionStudents, 1);
  assert.deepEqual(ungrouped.noInteractionNames, ["Student 2"]);
});

test("聚合 bot／topic 維度 + 老師範圍隔離", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // STUDENT_A 一個 llm 窗口（3 條）
  await insertConversation(CONV_A, STUDENT_A, BOT_A);
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: [
      makeMessage("user", "哦", 1),
      makeMessage("bot", "你好", 2),
      makeMessage("user", "點解要學呢課？", 3),
      makeMessage("bot", "因為好重要", 4),
      makeMessage("user", "我明白咗", 5),
    ],
    reply: "好的",
    judgeFn: stubJudge({ meaningless: new Set([0]), effective: new Set([1]) }),
  });
  // STUDENT_C（老師 B 嘅學生）都有對話——老師 A 唔應該見到
  await insertConversation(CONV_C, STUDENT_C, BOT_A);
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_C,
    conversationId: CONV_C,
    knowledgeBase: "",
    recentMessages: [
      makeMessage("user", "點解要學呢課？", 1),
      makeMessage("bot", "因為好重要", 2),
      makeMessage("user", "我明白咗", 3),
      makeMessage("bot", "好", 4),
      makeMessage("user", "多謝", 5),
    ],
    reply: "好的",
    judgeFn: stubJudge(null),
  });

  const botRes = await callApi("/api/teachers/me/participation?period=all&dimension=bot");
  assert.equal(botRes.status, 200);
  const botRow = botRes.body.rows.find((row: any) => row.id === BOT_A);
  assert.ok(botRow);
  assert.equal(botRow.name, "Bot A");
  assert.equal(botRow.studentMessageTotal, 3); // 只有 STUDENT_A 嘅（C 係老師 B 嘅）
  assert.equal(botRow.activeStudents, 1);

  const topicRes = await callApi("/api/teachers/me/participation?period=all&dimension=topic");
  assert.equal(topicRes.status, 200);
  const topicRow = topicRes.body.rows.find((row: any) => row.id === "");
  assert.ok(topicRow, "'' = 主知識庫 bucket");
  assert.equal(topicRow.name, null);
  assert.equal(topicRow.studentMessageTotal, 3);

  // 老師 B：只見到自己學生 C
  const teacherB = await callApi(
    "/api/teachers/me/participation?period=all&dimension=class",
    TEACHER_B
  );
  assert.equal(teacherB.status, 200);
  const bUngrouped = teacherB.body.rows.find((row: any) => row.id === "");
  assert.ok(bUngrouped);
  assert.equal(bUngrouped.studentMessageTotal, 3);
  assert.deepEqual(bUngrouped.noInteractionNames, []);
});

test("period 過濾：30d 撇除舊窗口、all 包返", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // 舊窗口（60 日前）喺 CONV_OLD（STUDENT_A 名下，等 class 維度計到）
  await pool.query(
    `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status)
     VALUES ($1,$2,$3,NULL,'old','bot_learning','active')`,
    [CONV_OLD, STUDENT_A, BOT_A]
  );
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

  const recent = await callApi("/api/teachers/me/participation?period=30d&dimension=class");
  const classARecent = recent.body.rows.find((row: any) => row.id === GROUP_A);
  assert.equal(classARecent.studentMessageTotal, 0);

  const all = await callApi("/api/teachers/me/participation?period=all&dimension=class");
  const classAAll = all.body.rows.find((row: any) => row.id === GROUP_A);
  assert.equal(classAAll.studentMessageTotal, 5);
  assert.equal(classAAll.activeStudents, 1);
});

test("deleted 嘅 conversation 唔入聚合", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await insertConversation(CONV_A, STUDENT_A, BOT_A);
  await trackConversationState({
    botId: BOT_A,
    userId: STUDENT_A,
    conversationId: CONV_A,
    knowledgeBase: "",
    recentMessages: [
      makeMessage("user", "哦", 1),
      makeMessage("bot", "你好", 2),
      makeMessage("user", "點解要學呢課？", 3),
      makeMessage("bot", "因為好重要", 4),
      makeMessage("user", "我明白咗", 5),
    ],
    reply: "好的",
    judgeFn: stubJudge(null),
  });
  await pool.query(`UPDATE conversations SET status='deleted' WHERE id=$1`, [CONV_A]);

  const res = await callApi("/api/teachers/me/participation?period=all&dimension=class");
  const classA = res.body.rows.find((row: any) => row.id === GROUP_A);
  assert.equal(classA.studentMessageTotal, 0);
  assert.equal(classA.activeStudents, 0);
  assert.equal(classA.noInteractionStudents, 1);
});

test("閒置掃描：補跑 + 清零 + idempotent + 唔掃 deleted", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  // CONV_SCAN：水位標 2020 年（好舊），有兩條新訊息，閒置 11 分鐘
  await pool.query(
    `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status)
     VALUES ($1,$2,$3,NULL,'scan','bot_learning','active')`,
    [CONV_SCAN, STUDENT_A, BOT_A]
  );
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
     VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,2,'2020-01-01T00:00:00.000Z',NOW() - INTERVAL '11 minutes')`,
    [CONV_SCAN, BOT_A, STUDENT_A]
  );
  await saveConversationMessage({
    conversationId: CONV_SCAN,
    userId: STUDENT_A,
    botId: BOT_A,
    role: "user",
    content: "點解要學呢課？",
    messageType: "normal",
    metadata: {},
  });
  await saveConversationMessage({
    conversationId: CONV_SCAN,
    userId: STUDENT_A,
    botId: BOT_A,
    role: "user",
    content: "我明白咗",
    messageType: "normal",
    metadata: {},
  });
  // CONV_DEL：同樣舊但 conversation 已刪 → 唔應該被掃
  await pool.query(
    `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status)
     VALUES ($1,$2,$3,NULL,'del','bot_learning','deleted')`,
    [CONV_DEL, STUDENT_A, BOT_A]
  );
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
     VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,2,'2020-01-01T00:00:00.000Z',NOW() - INTERVAL '11 minutes')`,
    [CONV_DEL, BOT_A, STUDENT_A]
  );

  const processed = await runIdleParticipationScan();
  assert.ok(processed >= 1);

  const windows = await windowRows(CONV_SCAN);
  assert.equal(windows.length, 1);
  assert.equal(Number(windows[0].window_student_count), 2);
  // 本機冇 Gemini key → judge 落 heuristic fallback（正常，唔係 bug）
  assert.equal(windows[0].judge_source, "heuristic-fallback");

  const state = await stateRow(CONV_SCAN);
  assert.equal(Number(state.turns_since_judge), 0);
  assert.ok(
    new Date(state.participation_watermark).getTime() >
      new Date("2020-01-01T00:00:00.000Z").getTime()
  );

  // idempotent：updated_at 已被掃描推前 → 再掃唔會重複
  const second = await runIdleParticipationScan();
  assert.equal(second, 0);
  assert.equal((await windowRows(CONV_SCAN)).length, 1);

  // deleted 嘅 conversation 冇窗口
  assert.equal((await windowRows(CONV_DEL)).length, 0);
});

test("未登入／學生身份被拒", { skip: !safeTestDatabase }, async () => {
  const anon = await fetch(`${baseUrl}/api/teachers/me/participation`);
  assert.equal(anon.status, 401);

  const student = await callApi(
    "/api/teachers/me/participation?period=all&dimension=class",
    STUDENT_A,
    "student"
  );
  assert.equal(student.status, 403);
});

test("掌握事件：首次寫入＋重複 idempotent（PK 去重）", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await recordMasteryEvents(BOT_A, STUDENT_A, "", ["kp_a", "kp_b"]);
  await recordMasteryEvents(BOT_A, STUDENT_A, "", ["kp_a", "kp_b"]); // 重複批 → 唔加
  await recordMasteryEvents(BOT_A, STUDENT_A, "", ["kp_a", "kp_c"]); // 新 kp_c → 加
  await recordMasteryEvents(BOT_A, STUDENT_B, "", ["kp_a"]); // 另一學生

  const result = await pool.query(
    `SELECT user_id, point_id FROM bot_student_mastery_events
     WHERE bot_id=$1 ORDER BY user_id, point_id`,
    [BOT_A]
  );
  assert.deepEqual(
    result.rows.map((row) => [String(row.user_id), String(row.point_id)]),
    [
      [STUDENT_A, "kp_a"],
      [STUDENT_A, "kp_b"],
      [STUDENT_A, "kp_c"],
      [STUDENT_B, "kp_a"],
    ]
  );
});

test("topic 維度行帶 botId（character_topics 映射）；主知識庫 botId null", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const topicId = `${PREFIX}topic_tp1`;
  const convId = `${PREFIX}conv_tp`;
  try {
    // character_topics 行先（conversations.topic_id 有 FK 指佢）
    await pool.query(
      `INSERT INTO character_topics (id, character_id, name, knowledge_content)
       VALUES ($1,$2,'測試話題','')`,
      [topicId, BOT_A]
    );
    await pool.query(
      `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status)
       VALUES ($1,$2,$3,$4,'conv tp','bot_learning','active')`,
      [convId, STUDENT_A, BOT_A, topicId]
    );
    await pool.query(
      `INSERT INTO bot_conversation_states
         (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
       VALUES ($1,$2,$3,$4,'[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,0,NOW(),NOW())`,
      [convId, BOT_A, STUDENT_A, topicId]
    );
    await pool.query(
      `INSERT INTO bot_conversation_participation_windows
         (conversation_id, bot_id, user_id, topic_id, window_student_count, effective_count, meaningless_count, judge_source)
       VALUES ($1,$2,$3,$4,3,1,0,'llm')`,
      [convId, BOT_A, STUDENT_A, topicId]
    );
    // 主知識庫 conversation（topic NULL → 聚合歸 ''，botId null）
    await pool.query(
      `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type, status)
       VALUES ($1,$2,$3,NULL,'conv main','bot_learning','active')`,
      [`${PREFIX}conv_main`, STUDENT_A, BOT_A]
    );
    await pool.query(
      `INSERT INTO bot_conversation_states
         (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
       VALUES ($1,$2,$3,'','[]'::jsonb,NULL,'未評估',0,'[]'::jsonb,0,0,NOW(),NOW())`,
      [`${PREFIX}conv_main`, BOT_A, STUDENT_A]
    );
    await pool.query(
      `INSERT INTO bot_conversation_participation_windows
         (conversation_id, bot_id, user_id, topic_id, window_student_count, effective_count, meaningless_count, judge_source)
       VALUES ($1,$2,$3,'',2,0,1,'llm')`,
      [`${PREFIX}conv_main`, BOT_A, STUDENT_A]
    );

    const { body } = await callApi("/api/teachers/me/participation?period=all&dimension=topic");
    const tpRow = body.rows.find((row: any) => row.id === topicId);
    assert.ok(tpRow, "要有話題行");
    assert.equal(tpRow.botId, BOT_A);
    const mainRow = body.rows.find((row: any) => row.id === "");
    assert.ok(mainRow, "要有主知識庫行");
    assert.equal(mainRow.botId, null);
  } finally {
    const mainConv = `${PREFIX}conv_main`;
    await pool.query("DELETE FROM bot_conversation_participation_windows WHERE conversation_id = ANY($1::text[])", [[convId, mainConv]]);
    await pool.query("DELETE FROM bot_conversation_states WHERE conversation_id = ANY($1::text[])", [[convId, mainConv]]);
    await pool.query("DELETE FROM conversations WHERE id = ANY($1::text[])", [[convId, mainConv]]);
    await pool.query("DELETE FROM character_topics WHERE id=$1", [topicId]);
  }
});
