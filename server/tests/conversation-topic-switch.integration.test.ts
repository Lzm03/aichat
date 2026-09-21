import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import conversationsRouter from "../api/conversations.ts";
import { createConversation } from "../lib/conversations.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";
import {
  createCharacterTopic,
  ensureCharacterTopicTables,
} from "../lib/character-topics.ts";
import {
  getConversationState,
  switchConversationTopicState,
} from "../lib/conversation-state.ts";

// 呢個 test 會建真 schema 落 DATABASE_URL 指住嘅 DB，所以一定要係本機嘅專用 test DB。
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /topic_switch_test/.test(databaseUrl);

const PREFIX = "tsw_";
const TEACHER = `${PREFIX}teacher`;
const BOT = `${PREFIX}bot`;

let httpServer: Server | null = null;
let baseUrl = "";
let topicA = "";
let topicB = "";

function authHeader(userId = TEACHER) {
  return `Bearer ${signToken({ sub: userId, email: "tsw@example.test", role: "teacher", exp: Date.now() + 3_600_000 })}`;
}

/** 一段對話 + 一條指定話題嘅 state row，回傳對話 id。 */
async function seedConversationWithState(input: {
  conversationId: string;
  topicId: string;
  covered?: string[];
  nextPointId?: string | null;
  skipped?: string[];
  turnsSinceSummary?: number;
  turnsOnNextPoint?: number;
  studentLevel?: string;
}) {
  await pool.query(
    `INSERT INTO conversations (id, user_id, bot_id, topic_id, title, type)
     VALUES ($1,$2,$3,$4,'測試對話','bot_learning')`,
    [input.conversationId, TEACHER, BOT, input.topicId]
  );
  await pool.query(
    `INSERT INTO bot_conversation_states
       (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id,
        student_level, turns_since_summary, skipped_point_ids, turns_on_next_point)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10)`,
    [
      input.conversationId,
      BOT,
      TEACHER,
      input.topicId,
      JSON.stringify(input.covered || []),
      input.nextPointId ?? null,
      input.studentLevel || "未評估",
      input.turnsSinceSummary ?? 0,
      JSON.stringify(input.skipped || []),
      input.turnsOnNextPoint ?? 0,
    ]
  );
}

async function topicProgress(topicId: string): Promise<string[]> {
  const result = await pool.query(
    "SELECT covered_point_ids FROM bot_student_progress WHERE bot_id=$1 AND user_id=$2 AND topic_id=$3",
    [BOT, TEACHER, topicId]
  );
  return result.rows.length ? (result.rows[0].covered_point_ids as string[]) : [];
}

async function resetFixture() {
  await pool.query("DELETE FROM conversations WHERE user_id=$1", [TEACHER]);
  await pool.query("DELETE FROM bot_conversation_states WHERE bot_id=$1", [BOT]);
  await pool.query("DELETE FROM bot_student_progress WHERE bot_id=$1", [BOT]);
  await pool.query("DELETE FROM character_topics WHERE character_id=$1", [BOT]);
  await pool.query("DELETE FROM bots WHERE id=$1", [BOT]);
  await pool.query("DELETE FROM users WHERE id=$1", [TEACHER]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash, status)
     VALUES ($1,'Topic Switch Teacher','tsw@example.test','teacher','x','active')`,
    [TEACHER]
  );
  await pool.query(
    `INSERT INTO bots (id, name, knowledge_base, owner_id, is_visible)
     VALUES ($1,'Topic Switch Bot','',$2,TRUE)`,
    [BOT, TEACHER]
  );
  topicA = (await createCharacterTopic(BOT, {
    name: "舞獅",
    description: "",
    systemPrompt: "",
    knowledgeContent: "",
    category: "",
    isDefault: true,
  })).id;
  topicB = (await createCharacterTopic(BOT, {
    name: "變臉",
    description: "",
    systemPrompt: "",
    knowledgeContent: "",
    category: "",
    isDefault: false,
  })).id;
}

before(async () => {
  if (!safeTestDatabase) return;
  // bots 係遺留表：ensurePlatformTables 唔會建佢，但 conversations / bot_student_progress
  // 都有 FK 指住，所以一個全新嘅 test DB 一定要先自己有 bots。
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
  await ensureCharacterTopicTables();

  const app = express();
  app.use(express.json());
  app.use("/api/conversations", conversationsRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  await resetFixture();
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

test(
  "切話題即刻轉 state row：covered 換新話題、next_point／skipped／小結計數清走、level 保留",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const conversationId = `${PREFIX}conv_1`;
    await seedConversationWithState({
      conversationId,
      topicId: topicA,
      covered: ["kp_1", "kp_2"],
      nextPointId: "kp_3",
      skipped: ["kp_9"],
      turnsSinceSummary: 5,
      turnsOnNextPoint: 2,
      studentLevel: "中級",
    });
    // 新話題自己嘅跨對話累積進度（之前另一段對話學過）
    await pool.query(
      `INSERT INTO bot_student_progress (bot_id, user_id, topic_id, covered_point_ids)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [BOT, TEACHER, topicB, JSON.stringify(["kp_7"])]
    );

    await switchConversationTopicState({
      conversationId,
      botId: BOT,
      userId: TEACHER,
      topicId: topicB,
    });

    const state = await getConversationState(conversationId);
    assert.equal(state?.topic_id, topicB, "state row 要即刻轉去新話題");
    assert.deepEqual(state?.covered_point_ids, ["kp_7"], "由新話題自己嘅累積進度起步");
    assert.equal(state?.next_point_id, null, "舊話題嘅 Next_Point 一定要清（就係佢令 Bot 傾舊話題）");
    assert.deepEqual(state?.skipped_point_ids, [], "舊話題嘅跳過名單唔可以帶過去");
    assert.equal(state?.turns_on_next_point, 0);
    assert.equal(state?.turns_since_summary, 0, "唔好一轉話題就叫 Bot 小結上一個話題");
    assert.equal(state?.student_level, "中級", "level 係講學生唔係講話題，要保留");
  }
);

test(
  "舊話題嘅知識點進度歸入返舊話題條路徑，唔會失",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const conversationId = `${PREFIX}conv_2`;
    await seedConversationWithState({
      conversationId,
      topicId: topicA,
      covered: ["kp_1", "kp_2"],
    });

    await switchConversationTopicState({ conversationId, botId: BOT, userId: TEACHER, topicId: topicB });

    assert.deepEqual(await topicProgress(topicA), ["kp_1", "kp_2"], "舊話題嘅進度要留喺舊話題");
    assert.deepEqual(await topicProgress(topicB), [], "新話題唔可以沾到舊話題嘅 id");
  }
);

test("同一話題再叫一次 = no-op（唔會誤清已覆蓋進度）", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const conversationId = `${PREFIX}conv_3`;
  await seedConversationWithState({
    conversationId,
    topicId: topicA,
    covered: ["kp_1"],
    nextPointId: "kp_2",
  });

  await switchConversationTopicState({ conversationId, botId: BOT, userId: TEACHER, topicId: topicA });

  const state = await getConversationState(conversationId);
  assert.deepEqual(state?.covered_point_ids, ["kp_1"], "同一話題唔應該當成切換");
  assert.equal(state?.next_point_id, "kp_2", "同一話題唔應該清走 Next_Point");
});

test("未傾過（冇 state row）嘅對話切話題 = no-op，唔會亂建 row", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const conversation = await createConversation({
    userId: TEACHER,
    botId: BOT,
    topicId: topicA,
    title: "未有狀態",
    type: "bot_learning",
  });

  await switchConversationTopicState({
    conversationId: conversation.id,
    botId: BOT,
    userId: TEACHER,
    topicId: topicB,
  });

  assert.equal(await getConversationState(conversation.id), null, "冇嘢可以切就唔好建 row");
});

test("PATCH /api/conversations/:id/topic 同一個 request 內已經重置對話狀態", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const conversationId = `${PREFIX}conv_4`;
  await seedConversationWithState({
    conversationId,
    topicId: topicA,
    covered: ["kp_1"],
    nextPointId: "kp_2",
    skipped: ["kp_8"],
    turnsSinceSummary: 4,
  });

  const response = await fetch(`${baseUrl}/api/conversations/${conversationId}/topic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ topicId: topicB }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { conversation: { topicId: string } };
  assert.equal(body.conversation.topicId, topicB);

  // 唔使等下一次 /api/ask —— request 返嚟嗰刻 state 就要係新話題嘅。
  const state = await getConversationState(conversationId);
  assert.equal(state?.topic_id, topicB);
  assert.equal(state?.next_point_id, null);
  assert.deepEqual(state?.skipped_point_ids, []);
  assert.equal(state?.turns_since_summary, 0);
  assert.deepEqual(await topicProgress(topicA), ["kp_1"], "舊話題進度歸返舊話題");
});

test("PATCH topic 回歸：冇 topicId 400、對話唔存在 404、冇 token 401", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const conversationId = `${PREFIX}conv_5`;
  await seedConversationWithState({ conversationId, topicId: topicA });

  const noTopic = await fetch(`${baseUrl}/api/conversations/${conversationId}/topic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({}),
  });
  assert.equal(noTopic.status, 400);

  const missing = await fetch(`${baseUrl}/api/conversations/${PREFIX}nobody/topic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ topicId: topicB }),
  });
  assert.equal(missing.status, 404);

  const anonymous = await fetch(`${baseUrl}/api/conversations/${conversationId}/topic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId: topicB }),
  });
  assert.equal(anonymous.status, 401);
});
