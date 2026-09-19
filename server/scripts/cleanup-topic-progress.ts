/**
 * 一次性清理：修正切話題時舊話題 covered id 污染新話題嘅累積進度。
 *
 * 2026-09-19 之前，對話中途切話題會帶走上一段對話嘅 covered_point_ids
 * （每個話題嘅知識點 id 都由 kp_1 起，跨話題撞 id 係常態），令新話題嘅
 * 進度 row 混入唔屬於佢嘅 id。修復之後，寫入側已經唔會再污染；呢個 script
 * 負責執舊數據：逐 (bot, topic) 將 covered_point_ids 同該話題自身嘅 core
 * 知識點 id 取交集。
 *
 * 讀邊份知識來源：
 *   - topic_id ''（主知識庫 row）→ bots.knowledge_base
 *   - 其他 topic_id → character_topics.knowledge_content
 * 冇對應知識來源（話題已刪）嘅 row 清空。
 *
 * 冪等，可以重複跑：node --import tsx scripts/cleanup-topic-progress.ts
 */
import { pool } from "../db.ts";
import { ensurePlatformTables } from "../lib/platform-auth.ts";
import { ensureCharacterTopicTables } from "../lib/character-topics.ts";
import { parsePromptSource } from "../../utils/chat-prompt.ts";

function corePointIds(knowledgeBase: string): Set<string> {
  return new Set(
    parsePromptSource({ knowledgeBase })
      .knowledgePoints.filter((point) => point.core !== false)
      .map((point) => point.id)
  );
}

try {
  await ensurePlatformTables();
  await ensureCharacterTopicTables();

  const progressResult = await pool.query(
    `SELECT bot_id, user_id, topic_id, covered_point_ids FROM bot_student_progress`
  );
  const botResult = await pool.query(`SELECT id, knowledge_base FROM bots`);
  const topicResult = await pool.query(
    `SELECT id, knowledge_content FROM character_topics`
  );

  const kbByBot = new Map<string, string>();
  for (const row of botResult.rows) {
    kbByBot.set(String(row.id), String(row.knowledge_base || ""));
  }
  const knowledgeByTopic = new Map<string, string>();
  for (const row of topicResult.rows) {
    knowledgeByTopic.set(String(row.id), String(row.knowledge_content || ""));
  }

  let scanned = 0;
  let cleaned = 0;
  for (const row of progressResult.rows) {
    scanned += 1;
    const botId = String(row.bot_id);
    const topicId = String(row.topic_id || "");
    const covered: string[] = Array.isArray(row.covered_point_ids)
      ? row.covered_point_ids.map(String)
      : [];
    const knowledgeBase =
      topicId === ""
        ? kbByBot.get(botId) || ""
        : knowledgeByTopic.get(topicId) || "";
    const validIds = corePointIds(knowledgeBase);
    const kept = covered.filter((id) => validIds.has(id));
    if (kept.length === covered.length) continue;
    await pool.query(
      `UPDATE bot_student_progress SET covered_point_ids=$4::jsonb, updated_at=NOW()
       WHERE bot_id=$1 AND user_id=$2 AND topic_id=$3`,
      [botId, String(row.user_id), topicId, JSON.stringify(kept)]
    );
    cleaned += 1;
    console.log(
      `cleaned bot=${botId} topic=${topicId || "(main)"} ${covered.length} -> ${kept.length}`
    );
  }

  // 對話狀態行同樣處理：topic_id 而家係邊個話題，covered 就只可以係嗰個話題嘅 id。
  const stateResult = await pool.query(
    `SELECT conversation_id, bot_id, topic_id, covered_point_ids FROM bot_conversation_states`
  );
  let stateCleaned = 0;
  for (const row of stateResult.rows) {
    const botId = String(row.bot_id);
    const topicId = String(row.topic_id || "");
    const covered: string[] = Array.isArray(row.covered_point_ids)
      ? row.covered_point_ids.map(String)
      : [];
    const knowledgeBase =
      topicId === ""
        ? kbByBot.get(botId) || ""
        : knowledgeByTopic.get(topicId) || "";
    const validIds = corePointIds(knowledgeBase);
    const kept = covered.filter((id) => validIds.has(id));
    if (kept.length === covered.length) continue;
    await pool.query(
      `UPDATE bot_conversation_states SET covered_point_ids=$2::jsonb, updated_at=NOW()
       WHERE conversation_id=$1`,
      [String(row.conversation_id), JSON.stringify(kept)]
    );
    stateCleaned += 1;
    console.log(
      `cleaned state conversation=${row.conversation_id} topic=${topicId || "(main)"} ${covered.length} -> ${kept.length}`
    );
  }

  console.log(
    `Cleanup completed. progress rows scanned=${scanned} cleaned=${cleaned}; state rows cleaned=${stateCleaned}`
  );
} finally {
  await pool.end();
}
