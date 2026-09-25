// 集成測試：對話狀態寫入隊列嘅 read-your-writes 合約（要真 DB）。
//
// 驗嘅係 trackConversationState 由 fire-and-forget 變成「排隊 + 可以等」之後，
// ask.ts 讀 state 之前等一等就保證讀到最新 —— 即係學生手快連問兩句，第二句
// 唔會用到第一句未寫好嘅 covered / next_point。
//
// 全部 track call 都傳 answerModeOverride「直接給答案」→ strictCoverage = false。
// 課堂參與度判斷（全部模式掛鉤）喺呢度唔會跑：recentMessages 冇帶 createdAt
// 元數據 → 唔計入窗口；就算跑，本機冇 Gemini key 都係 null → fallback。
// 所以測試仍然完全離線、deterministic。
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { pool } from "../db.ts";
import { ensurePlatformTables } from "../lib/platform-auth.ts";
import {
  switchConversationTopicState,
  trackConversationState,
} from "../lib/conversation-state.ts";
import { waitForPendingTrack } from "../lib/conversation-track-queue.ts";

// 呢個 test 會建真 schema 落 DATABASE_URL 指住嘅 DB，所以一定要係本機嘅專用 test DB。
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase =
  /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /topic_switch_test/.test(databaseUrl);

const PREFIX = "trq_";
const TEACHER = `${PREFIX}teacher`;
const BOT = `${PREFIX}bot`;

/** 直接給答案 = 角色講過就算（strictCoverage false）→ demonstrated 唔用於覆蓋 */
const ANSWER_MODE = "直接給答案";

/** parsePromptSource 認【知識點分級】節，入面係知識點 JSON 陣列。 */
function knowledgeBase(points: Array<{ id: string; keywords: string[] }>): string {
  return [
    "【知識點分級】",
    JSON.stringify(
      points.map((point) => ({
        id: point.id,
        tier: "basic_fact",
        title: point.id,
        content: "測試內容",
        keywords: point.keywords,
        core: true,
      }))
    ),
  ].join("\n");
}

const KB_ONE = knowledgeBase([{ id: "kp_1", keywords: ["起源", "唐代"] }]);
const KB_TWO = knowledgeBase([
  { id: "kp_1", keywords: ["起源", "唐代"] },
  { id: "kp_2", keywords: ["變臉", "面具"] },
]);

async function stateRow(conversationId: string) {
  const result = await pool.query(
    "SELECT topic_id, covered_point_ids FROM bot_conversation_states WHERE conversation_id=$1",
    [conversationId]
  );
  return result.rows[0] as { topic_id: string; covered_point_ids: string[] } | undefined;
}

async function topicProgress(topicId: string): Promise<string[]> {
  const result = await pool.query(
    "SELECT covered_point_ids FROM bot_student_progress WHERE bot_id=$1 AND user_id=$2 AND topic_id=$3",
    [BOT, TEACHER, topicId]
  );
  return result.rows.length ? (result.rows[0].covered_point_ids as string[]) : [];
}

async function resetFixture() {
  await pool.query("DELETE FROM bot_conversation_states WHERE bot_id=$1", [BOT]);
  await pool.query("DELETE FROM bot_student_progress WHERE bot_id=$1", [BOT]);
  await pool.query("DELETE FROM bots WHERE id=$1", [BOT]);
  await pool.query("DELETE FROM users WHERE id=$1", [TEACHER]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash, status)
     VALUES ($1,'Track Queue Teacher','trq@example.test','teacher','x','active')`,
    [TEACHER]
  );
  await pool.query(
    `INSERT INTO bots (id, name, knowledge_base, owner_id, is_visible)
     VALUES ($1,'Track Queue Bot','',$2,TRUE)`,
    [BOT, TEACHER]
  );
}

before(async () => {
  if (!safeTestDatabase) return;
  // bots 係遺留表：ensurePlatformTables 唔會建佢，但 bot_student_progress
  // 有 FK 指住，所以一個全新嘅 test DB 一定要先自己有 bots。
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
  await resetFixture();
});

after(async () => {
  await pool.end();
});

test(
  "read-your-writes：fire-and-forget 寫入之後等隊列，state row 一定已經寫好",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const conversationId = `${PREFIX}conv_1`;

    // 同 ask.ts 一模一樣嘅用法：void，唔 await。
    void trackConversationState({
      botId: BOT,
      userId: TEACHER,
      conversationId,
      knowledgeBase: KB_ONE,
      topicId: "",
      answerModeOverride: ANSWER_MODE,
      recentMessages: [{ role: "user", content: "舞獅係咩嚟㗎？" }],
      reply: "舞獅嘅起源可以追溯到唐代。",
    }).catch(() => {});

    await waitForPendingTrack(conversationId);

    const row = await stateRow(conversationId);
    assert.ok(row, "等到隊列之後，state row 一定要存在");
    assert.deepEqual(row.covered_point_ids, ["kp_1"], "兩個關鍵詞喺同一輪出現 = 覆蓋");
  }
);

test(
  "隊列序列化：兩輪背對背寫入，第二輪讀到第一輪嘅結果，唔會跌走覆蓋",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const conversationId = `${PREFIX}conv_2`;
    const base = {
      botId: BOT,
      userId: TEACHER,
      conversationId,
      knowledgeBase: KB_TWO,
      topicId: "",
      answerModeOverride: ANSWER_MODE,
    };

    // 中間唔 await：冇 FIFO 嘅話第二輪會讀到 null，最後只寫低 kp_2。
    const first = trackConversationState({
      ...base,
      recentMessages: [],
      reply: "舞獅嘅起源係唐代。",
    });
    // 第二輪刻意唔提 kp_1 嘅關鍵詞 —— kp_1 要留低，就一定係靠讀返第一輪寫嘅嘢。
    const second = trackConversationState({
      ...base,
      recentMessages: [{ role: "assistant", content: "變臉全靠面具。" }],
      reply: "面具係變臉嘅靈魂。",
    });
    await Promise.all([first, second]);

    const row = await stateRow(conversationId);
    assert.deepEqual(
      [...(row?.covered_point_ids || [])].sort(),
      ["kp_1", "kp_2"],
      "第一輪嘅 kp_1 要喺第二輪讀到先唔會跌"
    );
  }
);

test(
  "切話題排喺在途寫入之後：新話題唔會被舊話題嘅寫入蓋返轉頭",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const conversationId = `${PREFIX}conv_3`;
    const OLD_TOPIC = "old_topic";
    const NEW_TOPIC = "new_topic";

    // 舊話題嘅寫入仲喺途上（同 ask.ts 一樣 void 咗）
    void trackConversationState({
      botId: BOT,
      userId: TEACHER,
      conversationId,
      knowledgeBase: KB_ONE,
      topicId: OLD_TOPIC,
      answerModeOverride: ANSWER_MODE,
      recentMessages: [],
      reply: "舞獅嘅起源係唐代。",
    }).catch(() => {});

    // 老師即刻切話題：呢個 request 要排喺上面嗰個之後，唔可以反超前。
    await switchConversationTopicState({
      conversationId,
      botId: BOT,
      userId: TEACHER,
      topicId: NEW_TOPIC,
    });

    const row = await stateRow(conversationId);
    assert.equal(row?.topic_id, NEW_TOPIC, "最終 state 要喺新話題");
    assert.deepEqual(await topicProgress(OLD_TOPIC), ["kp_1"], "舊話題嘅覆蓋歸返舊話題");
    assert.deepEqual(await topicProgress(NEW_TOPIC), [], "新話題唔可以沾到舊話題嘅 id");
  }
);
