/**
 * 對話狀態追蹤（啟發式，零額外 LLM call）：
 * 每輪回覆後，按知識點 keyword 喺近期對話文本嘅出現情況，記錄「已覆蓋知識點」，
 * 並計出下一個未覆蓋知識點做引導目標。狀態下一輪注入 system prompt，
 * 驅動蘇格拉底三步曲嘅 Advance（唔准重複已討論概念）。
 */
import { pool } from "../db.ts";
import { ensurePlatformTables } from "./platform-auth.ts";
import { parsePromptSource } from "../../utils/chat-prompt.ts";

export type ConversationStateRow = {
  conversation_id: string;
  bot_id: string;
  user_id: string;
  covered_point_ids: string[];
  next_point_id: string | null;
  student_level: string;
  turns_since_summary: number;
  updated_at: string;
};

export async function getConversationState(
  conversationId: string
): Promise<ConversationStateRow | null> {
  try {
    await ensurePlatformTables();
    const result = await pool.query(
      `SELECT * FROM bot_conversation_states WHERE conversation_id=$1 LIMIT 1`,
      [conversationId]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      conversation_id: String(row.conversation_id || ""),
      bot_id: String(row.bot_id || ""),
      user_id: String(row.user_id || ""),
      covered_point_ids: Array.isArray(row.covered_point_ids)
        ? row.covered_point_ids.map(String)
        : [],
      next_point_id: row.next_point_id ? String(row.next_point_id) : null,
      student_level: String(row.student_level || "未評估"),
      turns_since_summary: Number(row.turns_since_summary || 0),
      updated_at: String(row.updated_at || ""),
    };
  } catch (error) {
    console.warn("[conversation-state] failed to load state", error);
    return null;
  }
}

/** 回覆含小結句式就當做過小結，計數歸零 */
const SUMMARY_MARKERS =
  /(你到而家學咗|到而家你學咗|你而家識|小結|總結|記住三個字)/;

export async function trackConversationState(input: {
  botId: string;
  userId: string;
  conversationId: string;
  knowledgeBase: string;
  recentMessages: Array<{ role: string; content: string }>;
  reply: string;
}) {
  try {
    const points = parsePromptSource({ knowledgeBase: input.knowledgeBase })
      .knowledgePoints;
    if (!points.length) return;

    await ensurePlatformTables();
    const previous = await getConversationState(input.conversationId);
    const coveredNow = new Set<string>(previous?.covered_point_ids || []);

    // 呢輪對話文本（歷史＋最新回覆）出現咗知識點 keyword 就計做已覆蓋
    const turnText = [
      ...input.recentMessages.map((message) => message.content),
      input.reply,
    ].join("\n");
    for (const point of points) {
      if (coveredNow.has(point.id)) continue;
      const hit = (point.keywords || []).some(
        (keyword) => keyword && keyword.length >= 2 && turnText.includes(keyword)
      );
      if (hit) coveredNow.add(point.id);
    }

    const coveredIds = Array.from(coveredNow);
    const nextPoint = points.find((point) => !coveredNow.has(point.id))?.id || null;
    const didSummarize = SUMMARY_MARKERS.test(input.reply);
    const turnsSinceSummary = didSummarize
      ? 0
      : Math.max(0, Number(previous?.turns_since_summary || 0)) + 1;

    await pool.query(
      `INSERT INTO bot_conversation_states
         (conversation_id, bot_id, user_id, covered_point_ids, next_point_id, student_level, turns_since_summary, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         covered_point_ids=EXCLUDED.covered_point_ids,
         next_point_id=EXCLUDED.next_point_id,
         student_level=EXCLUDED.student_level,
         turns_since_summary=EXCLUDED.turns_since_summary,
         updated_at=NOW()`,
      [
        input.conversationId,
        input.botId,
        input.userId,
        JSON.stringify(coveredIds),
        nextPoint,
        previous?.student_level || "未評估",
        turnsSinceSummary,
      ]
    );
  } catch (error) {
    console.warn("[conversation-state] failed to track state", error);
  }
}
