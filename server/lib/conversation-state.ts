/**
 * 對話狀態追蹤（零額外 LLM call，mode-aware）：
 * 只追蹤「教學目標（core）」知識點嘅覆蓋，判定按 bot 答題策略分兩種：
 *   - 直接給答案：角色講過 keyword 就算（學生唔會產出答案）。
 *   - 引導後再回答 / 不直接給答案：角色教咗 AND 學生答到先算。
 * 再計出下一個未覆蓋知識點做引導目標，下一輪注入 system prompt，
 * 驅動蘇格拉底三步曲嘅 Advance（唔准重複已討論概念）。
 *
 * 覆蓋判定純函數（computeNewlyCovered / computeStudentEvidence /
 * computeCoreCovered / computeNextPoint）已搬去 utils/coverage.ts，前後端共用；
 * 下面 re-export 保持舊 import 路徑同既有測試不變。
 */
import { pool } from "../db.ts";
import { ensurePlatformTables } from "./platform-auth.ts";
import {
  parsePromptSource,
  parseAnswerMode,
} from "../../utils/chat-prompt.ts";
import {
  computeCoreCovered,
  computeStudentEvidence,
  computeNextPoint,
} from "../../utils/coverage.ts";
import { judgeStudentAnswers, shouldRunJudge } from "./answer-judge.ts";

export {
  computeNewlyCovered,
  computeStudentEvidence,
  computeCoreCovered,
  computeNextPoint,
} from "../../utils/coverage.ts";

export type ConversationStateRow = {
  conversation_id: string;
  bot_id: string;
  user_id: string;
  covered_point_ids: string[];
  next_point_id: string | null;
  student_level: string;
  turns_since_summary: number;
  skipped_point_ids: string[];
  turns_on_next_point: number;
  turns_since_judge: number;
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
      skipped_point_ids: Array.isArray(row.skipped_point_ids)
        ? row.skipped_point_ids.map(String)
        : [],
      turns_on_next_point: Number(row.turns_on_next_point || 0),
      turns_since_judge: Number(row.turns_since_judge || 0),
      updated_at: String(row.updated_at || ""),
    };
  } catch (error) {
    console.warn("[conversation-state] failed to load state", error);
    return null;
  }
}

/**
 * 讀取學生 × Bot 嘅跨對話累積進度（已掌握知識點）。
 * 冇紀錄（第一次對話）回傳空陣列。
 */
export async function getStudentProgress(
  botId: string,
  userId: string
): Promise<string[]> {
  try {
    await ensurePlatformTables();
    const result = await pool.query(
      `SELECT covered_point_ids FROM bot_student_progress WHERE bot_id=$1 AND user_id=$2 LIMIT 1`,
      [botId, userId]
    );
    if (!result.rows.length) return [];
    const row = result.rows[0];
    return Array.isArray(row.covered_point_ids)
      ? row.covered_point_ids.map(String)
      : [];
  } catch (error) {
    console.warn("[conversation-state] failed to load student progress", error);
    return [];
  }
}

/**
 * 將今輪已覆蓋知識點合併入跨對話累積進度（並集，唔會倒退）。
 * coveredPointIds 係「累積 + 今輪新增」嘅完整集合，合併時照做去重並集，
 * 以防同一個 (bot, user) 有並行對話時後寫嘅舊集合覆蓋走新進度。
 */
export async function mergeStudentProgress(
  botId: string,
  userId: string,
  coveredPointIds: string[]
) {
  try {
    await ensurePlatformTables();
    await pool.query(
      `INSERT INTO bot_student_progress (bot_id, user_id, covered_point_ids, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (bot_id, user_id) DO UPDATE SET
         covered_point_ids = (
           SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
           FROM jsonb_array_elements_text(
             bot_student_progress.covered_point_ids || EXCLUDED.covered_point_ids
           ) AS elem
         ),
         updated_at = NOW()`,
      [botId, userId, JSON.stringify(coveredPointIds)]
    );
  } catch (error) {
    console.warn("[conversation-state] failed to merge student progress", error);
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
    const allPoints = parsePromptSource({ knowledgeBase: input.knowledgeBase })
      .knowledgePoints;
    if (!allPoints.length) return;

    // 只追蹤「教學目標（core）」；非 core 嘅參考點唔入覆蓋 / next_point / 進度。
    const points = allPoints.filter((point) => point.core !== false);
    if (!points.length) return;

    await ensurePlatformTables();
    const previous = await getConversationState(input.conversationId);

    // 新對話開場（冇 conversation 狀態）時，用跨對話累積進度 seed，
    // 令 bot 唔會每段新對話都重新教同一批已掌握知識點。
    // 已有 conversation 狀態就照舊由 conversation 嘅 covered 起步。
    const previouslyCovered = previous
      ? new Set<string>(previous.covered_point_ids)
      : new Set<string>(await getStudentProgress(input.botId, input.userId));

    // 只計「角色自己講過」嘅內容。學生講出知識點名字唔等於教過 ——
    // 2026-09-12 端到端測試實證：舊版將學生訊息一齊拼入嚟，學生問一句
    // 「榫卯係咩嚟㗎？」就即刻令 kp_001 標記已覆蓋，6 個知識點有 4 個
    // 係咁樣被誤標，之後 bot 反而被 Covered_Points 禁止再教。
    // 注意 role 有兩種寫法：DB 出嚟係 "assistant"，但 ask.ts 會
    // 正規化成 "bot" 先傳入嚟，兩者都要認。
    // 每輪獨立一組字（唔 join 成一條），訊號先分得出「跨輪」。
    const assistantTurns = [
      ...input.recentMessages
        .filter((message) => message.role === "assistant" || message.role === "bot")
        .map((message) => message.content),
      input.reply,
    ];
    // 學生自己講過嘅每輪文字（主訊號來源）。只認 role === "user"。
    const studentTurns = input.recentMessages
      .filter((message) => message.role === "user")
      .map((message) => message.content);

    // 覆蓋判定跟 bot 答題策略：直接給答案 = 角色講過就算；
    // 引導後再回答 / 不直接給答案 = 角色教咗 AND 學生答到先算。
    const answerMode = parseAnswerMode(input.knowledgeBase);
    const strictCoverage = answerMode !== "直接給答案";

    // 學生證據：strict mode 下每 JUDGE_INTERVAL_TURNS 輪跑一次 LLM 判斷（D4），
    // 其餘輪、或者判斷唔到（null）就用字串匹配兜底。
    let studentEvidence: Set<string> = new Set();
    let turnsSinceJudge = Number(previous?.turns_since_judge || 0);
    if (strictCoverage) {
      const judgeTurns = input.recentMessages.map((message) => ({
        role: (message.role === "user" ? "student" : "bot") as "student" | "bot",
        content: message.content,
      }));
      if (shouldRunJudge(turnsSinceJudge, judgeTurns)) {
        const judged = await judgeStudentAnswers({ points, turns: judgeTurns });
        studentEvidence = judged ?? computeStudentEvidence(points, studentTurns);
        turnsSinceJudge = 0;
      } else {
        studentEvidence = computeStudentEvidence(points, studentTurns);
        turnsSinceJudge += 1;
      }
    }

    const coveredNow = computeCoreCovered(
      points,
      assistantTurns,
      studentEvidence,
      previouslyCovered,
      strictCoverage
    );

    const coveredIds = Array.from(coveredNow);
    const { nextPointId, skippedIds, turnsOnNextPoint } = computeNextPoint(
      points,
      coveredNow,
      new Set<string>(previous?.skipped_point_ids || []),
      previous
        ? {
            nextPointId: previous.next_point_id,
            turnsOnNextPoint: previous.turns_on_next_point,
          }
        : null
    );
    const didSummarize = SUMMARY_MARKERS.test(input.reply);
    const turnsSinceSummary = didSummarize
      ? 0
      : Math.max(0, Number(previous?.turns_since_summary || 0)) + 1;

    await pool.query(
      `INSERT INTO bot_conversation_states
         (conversation_id, bot_id, user_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9,$10,NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         covered_point_ids=EXCLUDED.covered_point_ids,
         next_point_id=EXCLUDED.next_point_id,
         student_level=EXCLUDED.student_level,
         turns_since_summary=EXCLUDED.turns_since_summary,
         skipped_point_ids=EXCLUDED.skipped_point_ids,
         turns_on_next_point=EXCLUDED.turns_on_next_point,
         turns_since_judge=EXCLUDED.turns_since_judge,
         updated_at=NOW()`,
      [
        input.conversationId,
        input.botId,
        input.userId,
        JSON.stringify(coveredIds),
        nextPointId,
        previous?.student_level || "未評估",
        turnsSinceSummary,
        JSON.stringify(skippedIds),
        turnsOnNextPoint,
        turnsSinceJudge,
      ]
    );

    // 每輪結束後，將覆蓋進度合併入跨對話累積表（並集，唔會倒退）。
    await mergeStudentProgress(input.botId, input.userId, coveredIds);
  } catch (error) {
    console.warn("[conversation-state] failed to track state", error);
  }
}
