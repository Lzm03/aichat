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
import {
  hasSubstantiveStudentInput,
  JUDGE_INTERVAL_TURNS,
  judgeConversationWindow,
} from "./answer-judge.ts";
import type { EngagementVerdict } from "./engagement.ts";
import { recordParticipationWindow } from "./participation.ts";
import { enqueueConversationTrack } from "./conversation-track-queue.ts";

export {
  computeNewlyCovered,
  computeStudentEvidence,
  computeCoreCovered,
  computeNextPoint,
} from "../../utils/coverage.ts";

/**
 * 一個「屬於某個話題」嘅值。
 *
 * 覆蓋進度係按 (bot, user, topic) 分開儲存嘅，所以一組 covered point id
 * 離開咗佢所屬嘅話題就冇意義：2026-09 就中過一次 —— 對話中途切話題時，
 * 上一話題嘅 id 就咁帶入新話題（舊話題嘅 kp_3 同新話題嘅 kp_3 可以係
 * 兩回事）。用呢個型別將話題黐實個值，call site 就冇得淨係傳一條裸 id
 * 陣列：想寫入邊個話題，就要喺讀出嚟嗰一刻已經講明。
 */
export type TopicScoped<T> = { topicId: string; value: T };

export type ConversationStateRow = {
  conversation_id: string;
  bot_id: string;
  user_id: string;
  /** 對話揀咗嘅話題 id（'' = 冇指定話題，跟主知識庫） */
  topic_id: string;
  covered_point_ids: string[];
  next_point_id: string | null;
  student_level: string;
  turns_since_summary: number;
  skipped_point_ids: string[];
  turns_on_next_point: number;
  turns_since_judge: number;
  /** 課堂參與度水位標：已分類訊息嘅最大 created_at（參與度專用，唔影響覆蓋） */
  participation_watermark: string | null;
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
      topic_id: String(row.topic_id || ""),
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
      // 要 ISO：String(Date) 出 verbose 格式（"Sun Sep 20 2026..."），
      // 直接傳返俾 Postgres 會 DateTimeParseError。
      participation_watermark: row.participation_watermark
        ? new Date(row.participation_watermark).toISOString()
        : null,
      updated_at: String(row.updated_at || ""),
    };
  } catch (error) {
    console.warn("[conversation-state] failed to load state", error);
    return null;
  }
}

/**
 * 讀取學生 × Bot × 話題嘅跨對話累積進度（已掌握知識點）。
 * 冇紀錄（第一次對話）回傳空集合。topicId '' = 冇指定話題（主知識庫）。
 * 回傳值帶埋話題（見 TopicScoped）—— 呢個集合只可以寫返同一個話題。
 */
export async function getStudentProgress(
  botId: string,
  userId: string,
  topicId = ""
): Promise<TopicScoped<string[]>> {
  try {
    await ensurePlatformTables();
    const result = await pool.query(
      `SELECT covered_point_ids FROM bot_student_progress
       WHERE bot_id=$1 AND user_id=$2 AND topic_id=$3 LIMIT 1`,
      [botId, userId, topicId]
    );
    if (!result.rows.length) return { topicId, value: [] };
    const row = result.rows[0];
    return {
      topicId,
      value: Array.isArray(row.covered_point_ids)
        ? row.covered_point_ids.map(String)
        : [],
    };
  } catch (error) {
    console.warn("[conversation-state] failed to load student progress", error);
    return { topicId, value: [] };
  }
}

/**
 * 將今輪已覆蓋知識點合併入跨對話累積進度（並集，唔會倒退）。
 * coveredPointIds 係「累積 + 今輪新增」嘅完整集合，合併時照做去重並集，
 * 以防同一個 (bot, user, topic) 有並行對話時後寫嘅舊集合覆蓋走新進度。
 * 進度按話題分維度（'' = 主知識庫／冇指定話題）。
 * 話題由 coverage 帶入（唔可以另外傳），所以寫入嘅話題一定就係讀出嚟嗰個。
 */
export async function mergeStudentProgress(
  botId: string,
  userId: string,
  coverage: TopicScoped<readonly string[]>
) {
  try {
    await ensurePlatformTables();
    await pool.query(
      `INSERT INTO bot_student_progress (bot_id, user_id, topic_id, covered_point_ids, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (bot_id, user_id, topic_id) DO UPDATE SET
         covered_point_ids = (
           SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
           FROM jsonb_array_elements_text(
             bot_student_progress.covered_point_ids || EXCLUDED.covered_point_ids
           ) AS elem
         ),
         updated_at = NOW()`,
      [botId, userId, coverage.topicId, JSON.stringify(coverage.value)]
    );
  } catch (error) {
    console.warn("[conversation-state] failed to merge student progress", error);
  }
}

/** 回覆含小結句式就當做過小結，計數歸零 */
const SUMMARY_MARKERS =
  /(你到而家學咗|到而家你學咗|你而家識|小結|總結|記住三個字)/;

/**
 * 話題比較嘅唯一來源。'' = 主知識庫／冇指定話題，同任何真 topic id 都唔相等
 * （exact compare：舊數據 topic_id='' 第一次帶真話題入嚟會當成「轉咗話題」）。
 *
 * 讀側（prompt 組裝前嘅 state gate，經 stateForTopic）、寫側
 * （trackConversationState → seedCoverageOnTopicSwitch）同切話題重置
 * （switchConversationTopicState）三處都經呢度判斷，唔好各自比 topic_id —— 之前讀側
 * 漏咗呢層，切話題之後第一輪仍然讀到上一個話題嘅 covered / next_point，Bot 照傾舊話題。
 */
export function sameTopic(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a || "") === String(b || "");
}

/**
 * state row 淨係對佢自己嗰個話題有意義：唔同話題 = 呢段對話喺呢個話題未有狀態。
 * 回傳 null 就當「冇 state」——寧願由新話題重新起步，都唔好將上一個話題嘅
 * covered / next_point 當成呢個話題嘅。
 */
export function stateForTopic<T extends { topic_id: string }>(
  state: T | null,
  topicId: string
): T | null {
  if (!state || !sameTopic(state.topic_id, topicId)) return null;
  return state;
}

/**
 * 對話中途切話題時，決定覆蓋集合由邊度起步（純函數，冇 DB）。
 *
 * 背景：覆蓋進度係按 (bot, user, topic) 分開儲存嘅，所以一個 covered id
 * 離開咗佢所屬嘅話題就唔再代表任何嘢 —— id 嘅意思係話題決定嘅。
 * 知識點 id 本身由 assignStableKnowledgePointIds 喺全 bot 範圍分配（正常
 * 編輯路徑跨話題唔會撞），但呢層保護淨係喺 client 一個函數度；一旦有數據
 * 唔行嗰條路（匯入、seed、還原備份、兩個 client 同時改），兩個話題就會有
 * 同號 id，而舊話題嘅 kp_1 就會令新話題嘅 kp_1 未教就當已覆蓋，仲會經
 * mergeStudentProgress 寫入新話題嘅累積進度（學習報告跟住錯）。
 * 就算冇撞 id，帶過去嘅外來 id 都會令張表污糟（讀取側 intersect 頂得住）。
 * 所以切話題 = 由新話題自己嘅跨對話累積進度重新起步；同一話題（或者新對話）就照舊。
 */
export function seedCoverageOnTopicSwitch(input: {
  /** 上一段對話狀態；null = 新對話（冇 conversation state） */
  previous: TopicScoped<string[]> | null;
  /** 對話而家喺邊個話題 */
  topicId: string;
  /** getStudentProgress(botId, userId, topicId) 嘅結果（同一個話題） */
  accumulated: TopicScoped<string[]>;
}): { coverage: TopicScoped<Set<string>>; topicChanged: boolean } {
  const previous = input.previous;
  const topicChanged = previous !== null && !sameTopic(previous.topicId, input.topicId);

  // 兩個輸入都係 TopicScoped，型別上冇得傳錯話題。呢個 guard 係防有人硬
  // cast 或者將來改壞：寧願當冇累積（由零重新教），都唔好將第二個話題嘅
  // id 當成呢個話題已掌握 —— 後者會靜靜雞寫入 DB，冇人會發現。
  if (input.accumulated.topicId !== input.topicId) {
    console.warn(
      `[conversation-state] accumulated coverage topic mismatch: expected "${input.topicId}", got "${input.accumulated.topicId}"`
    );
    return {
      coverage: { topicId: input.topicId, value: new Set<string>() },
      topicChanged,
    };
  }

  const source = previous && !topicChanged ? previous : input.accumulated;
  return {
    coverage: { topicId: input.topicId, value: new Set<string>(source.value) },
    topicChanged,
  };
}

export type TrackConversationStateInput = {
  botId: string;
  userId: string;
  conversationId: string;
  knowledgeBase: string;
  /** 對話揀咗嘅話題 id（'' = 冇指定話題）；進度按話題分維度 */
  topicId?: string;
  /** 答題模式覆寫：知識來源係話題內容（冇【答題策略】節）時，由主知識庫傳入 */
  answerModeOverride?: string;
  recentMessages: Array<{
    role: string;
    content: string;
    /** 參與度分類用（由 ask.ts 帶入 conversation_messages 嘅 id／時間／類型） */
    id?: string;
    createdAt?: string;
    messageType?: string;
  }>;
  reply: string;
  /**
   * 測試注入口：ESM named-import 喺 tsx／esbuild 下 mock 唔到，DI 先可靠
   * （參與度整合測試會傳 stub）。production 唔傳 = 真 judgeConversationWindow。
   */
  judgeFn?: typeof judgeConversationWindow;
};

/**
 * 排入該對話嘅 FIFO 隊列先寫。call site 照舊 `void` 就得 —— 回覆唔會等佢，
 * 但下一個 ask 讀 state 之前會等埋條鏈（見 conversation-track-queue.ts）。
 * 順帶修好兩個在途寫入互相交錯、食咗一回合計數器嘅問題。
 */
export async function trackConversationState(input: TrackConversationStateInput): Promise<void> {
  return enqueueConversationTrack(input.conversationId, () => trackConversationStateWork(input));
}

async function trackConversationStateWork(input: TrackConversationStateInput): Promise<void> {
  try {
    const allPoints = parsePromptSource({ knowledgeBase: input.knowledgeBase })
      .knowledgePoints;

    // 只追蹤「教學目標（core）」；非 core 嘅參考點唔入覆蓋 / next_point / 進度。
    // 參與度分類唔受呢個 filter 影響：冇 core 點嘅 bot 對話都要計（judge 容許
    // 空 points，淨出 engagement），所以參與度塊放喺 points early-return 之前。
    const points = allPoints.filter((point) => point.core !== false);

    await ensurePlatformTables();
    const previous = await getConversationState(input.conversationId);
    const topicId = input.topicId || "";
    const answerMode = input.answerModeOverride || parseAnswerMode(input.knowledgeBase);
    const strictCoverage = answerMode !== "直接給答案";

    // ---- 課堂參與度（水位標分類）----
    // 邊界 = participation_watermark（已分類訊息嘅最大 created_at）。
    // 唔用 turns_since_judge 計數器切片：recentMessages 喺 persistUserMessage
    // 之前攞（當輪訊息唔喺窗口），而 debounce 可以一條計數對兩條 row，
    // 計數器切片會令訊息永久失蹤——水位標先係可靠邊界。
    const watermarkMs = previous?.participation_watermark
      ? new Date(previous.participation_watermark).getTime()
      : -1;
    const newParticipationTurns = input.recentMessages
      .filter((message) => {
        if (message.role !== "user") return false;
        if (message.messageType != null && message.messageType !== "normal") {
          return false;
        }
        if (!message.createdAt) return false;
        const time = new Date(message.createdAt).getTime();
        return Number.isFinite(time) && time > watermarkMs;
      })
      .map((message) => ({
        content: message.content,
        createdAt: new Date(message.createdAt as string).toISOString(),
      }));

    // turns_since_judge 語義：未分類 user row 數（debounce 兩條 row 計 2）。
    let turnsSinceJudge =
      Number(previous?.turns_since_judge || 0) + newParticipationTurns.length;

    const judgeTurns = input.recentMessages.map((message) => ({
      role: (message.role === "user" ? "student" : "bot") as "student" | "bot",
      content: message.content,
    }));

    // 一次 judge 同時服務覆蓋證據（demonstrated）同參與度（engagement）。
    // 免費預濾：新訊息全係短字，heuristic 已經分類得啱，唔使打 LLM；
    // strict 模式照舊要求全窗口有實質輸入先值得判斷 demonstrated。
    let judgedDemonstrated: Set<string> | null = null;
    let judgedEngagement: EngagementVerdict | null = null;
    const judgeRan =
      newParticipationTurns.length > 0 &&
      turnsSinceJudge >= JUDGE_INTERVAL_TURNS &&
      (hasSubstantiveStudentInput(
        newParticipationTurns.map((turn) => ({
          role: "student" as const,
          content: turn.content,
        }))
      ) ||
        (strictCoverage && hasSubstantiveStudentInput(judgeTurns)));
    if (judgeRan) {
      const judgeFn = input.judgeFn ?? judgeConversationWindow;
      const judged = await judgeFn({
        points,
        turns: judgeTurns,
        newStudentTurns: newParticipationTurns.map((turn) => turn.content),
      });
      judgedDemonstrated = judged.demonstrated;
      judgedEngagement = judged.engagement;
    }

    // ---- 覆蓋追蹤（原有邏輯；冇 core 點就跳過，參與度照行）----
    let coverage: TopicScoped<string[]> = { topicId, value: [] };
    let nextPointId: string | null = previous?.next_point_id || null;
    let skippedIds: string[] = previous?.skipped_point_ids || [];
    let turnsOnNextPoint = previous?.turns_on_next_point || 0;
    if (points.length) {
      // 新對話開場（冇 conversation 狀態）時，用同一個話題嘅跨對話累積進度 seed，
      // 令 bot 唔會每段新對話都重新教同一批已掌握知識點。已有 conversation 狀態、
      // 而且話題冇變，就照舊由 conversation 嘅 covered 起步。
      // 注意：呢度嘅話題比較係 exact compare —— ''（舊數據／主知識庫）同默認話題
      // 嘅真 id 會當成「轉咗話題」，由新話題嘅累積進度重新起步；顯示側
      // aggregateTopicCoverage 嘅 '' 合併唔受影響。
      const accumulated: TopicScoped<string[]> =
        !previous || previous.topic_id !== topicId
          ? await getStudentProgress(input.botId, input.userId, topicId)
          : { topicId, value: [] };
      const { coverage: startingCoverage, topicChanged } = seedCoverageOnTopicSwitch({
        previous: previous
          ? { topicId: previous.topic_id, value: previous.covered_point_ids }
          : null,
        topicId,
        accumulated,
      });
      const previouslyCovered = startingCoverage.value;

      // 老師改過知識點之後，舊 id 可能已經退役（例如重新生成後 title 對唔上）。
      // 呢啲 id 唔應該再入 conversation state / prompt：Covered_Points 會將佢哋
      // 渲染成裸 id，而且 computeCoreCovered 由 seed 起步，會將佢哋當成已覆蓋
      // 一路帶落去，令學生永遠唔會再被教嗰點。
      const validIds = new Set(points.map((point) => point.id));
      for (const id of [...previouslyCovered]) {
        if (!validIds.has(id)) previouslyCovered.delete(id);
      }

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

      // 學生證據：judge 有跑（參與度同一 call）就用 demonstrated，判斷唔到
      // （null）用字串匹配兜底；冇跑就照舊字串匹配。
      let studentEvidence: Set<string> = new Set();
      if (strictCoverage) {
        studentEvidence = judgeRan
          ? judgedDemonstrated ?? computeStudentEvidence(points, studentTurns)
          : computeStudentEvidence(points, studentTurns);
      }

      const coveredNow = computeCoreCovered(
        points,
        assistantTurns,
        studentEvidence,
        previouslyCovered,
        strictCoverage
      );

      // 寫入側 invariant guard：只寫入而家呢個話題真正存在嘅知識點 id。
      // 話題由 startingCoverage 帶落嚟 —— 跟住兩個寫入（對話狀態 + 跨對話累積）
      // 都只可以由呢個物件攞話題，冇得將 A 話題嘅 id 寫入 B 話題。
      coverage = {
        topicId: startingCoverage.topicId,
        value: Array.from(coveredNow).filter((id) => validIds.has(id)),
      };
      // 切話題之後，上一段對話嘅 next_point / 跳過名單唔可以帶落新話題
      // （舊話題嘅 id 會壓制新話題嘅點），所以 context 傳 null。
      const computed = computeNextPoint(
        points,
        coveredNow,
        new Set<string>(topicChanged ? [] : previous?.skipped_point_ids || []),
        previous && !topicChanged
          ? {
              nextPointId: previous.next_point_id,
              turnsOnNextPoint: previous.turns_on_next_point,
            }
          : null
      );
      nextPointId = computed.nextPointId;
      skippedIds = computed.skippedIds;
      turnsOnNextPoint = computed.turnsOnNextPoint;
    }

    const didSummarize = SUMMARY_MARKERS.test(input.reply);
    const turnsSinceSummary = didSummarize
      ? 0
      : Math.max(0, Number(previous?.turns_since_summary || 0)) + 1;

    // 窗口行 INSERT 同 state upsert（含水滴標、turns_since_judge 清零）同一
    // transaction：中途死機唔會出現「有窗口但冇水位標」→ 下次重複計。
    let participationWatermark = previous?.participation_watermark ?? null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (judgeRan) {
        const recorded = await recordParticipationWindow(
          {
            conversationId: input.conversationId,
            botId: input.botId,
            userId: input.userId,
            topicId,
            newTurns: newParticipationTurns,
            engagement: judgedEngagement,
          },
          client
        );
        participationWatermark = recorded.watermark ?? participationWatermark;
        turnsSinceJudge = 0;
      }
      await client.query(
        `INSERT INTO bot_conversation_states
           (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, participation_watermark, updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW())
         ON CONFLICT (conversation_id) DO UPDATE SET
           topic_id=EXCLUDED.topic_id,
           covered_point_ids=EXCLUDED.covered_point_ids,
           next_point_id=EXCLUDED.next_point_id,
           student_level=EXCLUDED.student_level,
           turns_since_summary=EXCLUDED.turns_since_summary,
           skipped_point_ids=EXCLUDED.skipped_point_ids,
           turns_on_next_point=EXCLUDED.turns_on_next_point,
           turns_since_judge=EXCLUDED.turns_since_judge,
           participation_watermark=EXCLUDED.participation_watermark,
           updated_at=NOW()`,
        [
          input.conversationId,
          input.botId,
          input.userId,
          coverage.topicId,
          JSON.stringify(coverage.value),
          nextPointId,
          previous?.student_level || "未評估",
          turnsSinceSummary,
          JSON.stringify(skippedIds),
          turnsOnNextPoint,
          turnsSinceJudge,
          participationWatermark,
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    // 每輪結束後，將覆蓋進度合併入跨對話累積表（並集，唔會倒退；按話題分維度）。
    if (points.length) {
      await mergeStudentProgress(input.botId, input.userId, coverage);
    }
  } catch (error) {
    console.warn("[conversation-state] failed to track state", error);
  }
}

/**
 * 對話中途切話題：即刻（同步）將 state row 由舊話題轉去新話題，唔等下一輪回覆。
 *
 * 點解要即刻：state row 係每段對話一行，切話題嗰刻如果唔重寫，今輪組裝 prompt
 * 仍然會讀到上一個話題嘅 covered / next_point，Bot 就照傾舊話題（回覆出咗之後
 * trackConversationState 先會寫新 state，即係慢咗一整輪）。
 *
 * 舊話題嘅嘢冇丟，全部已經歸咗去相關路徑：
 * - 知識點進度 → 每輪 trackConversationState 都經 mergeStudentProgress 寫入
 *   bot_student_progress(bot_id, user_id, 舊話題)；呢度再保險補寫一次（並集，唔會倒退）。
 * - 對話記錄 → 每條訊息嘅 metadata.topicId 記住佢當時屬邊個話題。
 * 所以呢度只需要清走「淨係對舊話題有意義」嘅欄位：next_point_id、skipped_point_ids、
 * turns_on_next_point（舊話題嘅 id 喺新話題冇意義，仲會壓制新話題嘅點），
 * 同 turns_since_summary（唔好一轉話題就叫 Bot 小結上一個話題）。
 * student_level 係講個學生唔係講個話題，保留。
 */
export type SwitchConversationTopicStateInput = {
  conversationId: string;
  botId: string;
  userId: string;
  topicId: string;
};

/**
 * 同樣排入該對話嘅隊列。淨係喺開頭等「已起飛」嗰條 track 係唔夠嘅 ——
 * 等完之後先入隊嘅 track 會用舊話題嘅讀數覆寫呢度啱啱寫好嘅新話題 row，
 * 個對話就會黏死喺舊話題一個回合。行同一條 FIFO 鏈兩個方向都封死。
 * 兩個 call site（ask.ts / conversations.ts）本身已 await，語意不變，
 * 只係多咗「排隊」。
 */
export async function switchConversationTopicState(
  input: SwitchConversationTopicStateInput
): Promise<void> {
  return enqueueConversationTrack(input.conversationId, () =>
    switchConversationTopicStateWork(input)
  );
}

async function switchConversationTopicStateWork(
  input: SwitchConversationTopicStateInput
): Promise<void> {
  try {
    await ensurePlatformTables();
    const current = await getConversationState(input.conversationId);
    // 冇 state（未傾過）或者已經係呢個話題 → 冇嘢要轉。
    if (!current || sameTopic(current.topic_id, input.topicId)) return;

    await mergeStudentProgress(input.botId, input.userId, {
      topicId: current.topic_id,
      value: current.covered_point_ids,
    });
    const accumulated = await getStudentProgress(input.botId, input.userId, input.topicId);

    await pool.query(
      `INSERT INTO bot_conversation_states
         (conversation_id, bot_id, user_id, topic_id, covered_point_ids, next_point_id, student_level, turns_since_summary, skipped_point_ids, turns_on_next_point, turns_since_judge, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NULL,$6,0,'[]'::jsonb,0,0,NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         topic_id=EXCLUDED.topic_id,
         covered_point_ids=EXCLUDED.covered_point_ids,
         next_point_id=NULL,
         turns_since_summary=0,
         skipped_point_ids='[]'::jsonb,
         turns_on_next_point=0,
         turns_since_judge=0,
         updated_at=NOW()`,
      [
        input.conversationId,
        input.botId,
        input.userId,
        input.topicId,
        JSON.stringify(accumulated.value),
        current.student_level || "未評估",
      ]
    );
  } catch (error) {
    console.warn("[conversation-state] failed to switch conversation topic state", error);
  }
}
