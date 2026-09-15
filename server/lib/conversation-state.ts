/**
 * 對話狀態追蹤（零額外 LLM call，mode-aware）：
 * 只追蹤「教學目標（core）」知識點嘅覆蓋，判定按 bot 答題策略分兩種：
 *   - 直接給答案：角色講過 keyword 就算（學生唔會產出答案）。
 *   - 引導後再回答 / 不直接給答案：角色教咗 AND 學生答到先算。
 * 再計出下一個未覆蓋知識點做引導目標，下一輪注入 system prompt，
 * 驅動蘇格拉底三步曲嘅 Advance（唔准重複已討論概念）。
 */
import { pool } from "../db.ts";
import { ensurePlatformTables } from "./platform-auth.ts";
import {
  parsePromptSource,
  parseAnswerMode,
  type KnowledgePoint,
} from "../../utils/chat-prompt.ts";
import { judgeStudentAnswers, shouldRunJudge } from "./answer-judge.ts";

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

/**
 * 覆蓋訊號門檻：一個知識點要 ≥2 個「獨立訊號」先算已覆蓋。
 *
 * 訊號 = (keyword × 輪次) 對，例如 "榫卯@0"。兩個訊號只要 keyword 唔同
 * 或者輪次唔同就當獨立 —— 兩個 keyword 同一輪、或同一個 keyword 跨兩輪
 * 都夠數。單一通用 keyword 喺一輪出現一次，唔會鎖死知識點。
 *
 * 2026-09-12 三段真對話重播定嘅規則：舊版（任何一個 keyword 出現一次就
 * 算）會將「傳說」「茅草」「街名」呢類泛用詞當成教過，之後 prompt 就
 * 永久禁止 bot 再教嗰點。strict（要 2 個唔同 keyword 兼跨 2 輪）就反過來
 * 太緊：單輪一次過教完嘅知識點永遠標唔到，next_point 會卡死喺嗰度，
 * bot 被指示重複教。呢個 union 版本兩邊都避開。
 */
const MIN_SIGNALS = 2;

/** 由「角色自己講過嘅每輪文字」算出新覆蓋嘅知識點（唔會覆蓋走已經 covered 嘅） */
export function computeNewlyCovered(
  points: KnowledgePoint[],
  assistantTurns: string[],
  previouslyCovered: Set<string>
): Set<string> {
  const coveredNow = new Set(previouslyCovered);
  for (const point of points) {
    if (coveredNow.has(point.id)) continue;
    const signals = new Set<string>();
    assistantTurns.forEach((text, turnIndex) => {
      for (const keyword of point.keywords || []) {
        if (!keyword || keyword.length < 2) continue;
        if (text.includes(keyword)) signals.add(`${keyword}@${turnIndex}`);
      }
    });
    if (signals.size >= MIN_SIGNALS) coveredNow.add(point.id);
  }
  return coveredNow;
}

/**
 * 學生「實質輸入」最短字數：低過呢個數嘅回覆（哦／唔知／係／單詞）唔當證據。
 * 閾值唔可以太高 —— 中文好精煉，「榫卯係唔用釘」得 6 個字已經係完整示範。
 * 4 呢個數純粹用嚟隔走最明顯嘅敷衍回覆，亦順手擋走學生複述單一 keyword
 * 嘅 echo（例如淨係回「榫卯」）。
 */
const SUBSTANTIVE_INPUT_MIN = 4;

/**
 * 由「學生自己講過嘅每輪文字」算出有展現理解嘅知識點（Hybrid 主訊號）。
 *
 * 同 computeNewlyCovered 嘅分別：嗰個數「角色講過咩」（教咗），呢個數「學生
 * 講過咩」（學咗）。學生主動講出知識點 keyword = 強證據，所以 1 個訊號就夠
 * （唔似角色版要 2 個去避泛用詞誤鎖）。
 *
 * 已知限制（D4 換 LLM 判斷先解決）：
 * - 字串匹配只捉到「學生用咗 exact keyword」，捉唔到「用自己說話講出概念」。
 * - 學生複述 keyword 嚟提問（「榫卯？咩嚟㗎」）會被當成證據，要靠 LLM 先分到。
 */
export function computeStudentEvidence(
  points: KnowledgePoint[],
  studentTurns: string[]
): Set<string> {
  const evidenced = new Set<string>();
  for (const point of points) {
    const signals = new Set<string>();
    studentTurns.forEach((text, turnIndex) => {
      if (text.trim().length < SUBSTANTIVE_INPUT_MIN) return;
      for (const keyword of point.keywords || []) {
        if (!keyword || keyword.length < 2) continue;
        if (text.includes(keyword)) signals.add(`${keyword}@${turnIndex}`);
      }
    });
    if (signals.size >= 1) evidenced.add(point.id);
  }
  return evidenced;
}

/**
 * 計出「教學目標（core）」嘅新覆蓋集合，判定跟 bot 答題策略（mode-aware）：
 * - strictCoverage = false（直接給答案）：角色講過 keyword 就算。
 * - strictCoverage = true（引導後再回答／不直接給答案）：
 *   角色教咗 AND 學生答到先算 —— 兩個訊號都要齊。
 *
 * studentEvidence 係「學生答到嘅知識點」集合，由 caller 決定點嚟：
 * LLM 判斷（D4）或者字串匹配（fallback）。
 */
export function computeCoreCovered(
  points: KnowledgePoint[],
  assistantTurns: string[],
  studentEvidence: Set<string>,
  previouslyCovered: Set<string>,
  strictCoverage: boolean
): Set<string> {
  const coveredNow = new Set(previouslyCovered);
  const botCovered = computeNewlyCovered(points, assistantTurns, new Set());
  if (!strictCoverage) {
    for (const id of botCovered) coveredNow.add(id);
    return coveredNow;
  }
  for (const point of points) {
    if (coveredNow.has(point.id)) continue;
    if (botCovered.has(point.id) && studentEvidence.has(point.id)) {
      coveredNow.add(point.id);
    }
  }
  return coveredNow;
}

/**
 * next_point 連續幾多輪推唔動就跳過佢。
 *
 * 為咩需要：知識點嘅 keyword 清單係由教材抽取出嚟，每份都唔同，冇可能保證
 * 每點都攞到 ≥2 個可用訊號。魯班 kp_002 就係實例 —— keywords = [鋸, 刨,
 * 墨斗, 傳說]，「鋸」「刨」單字被跳過，剩返「墨斗」（對話冇出現）同
 * 「傳說」（只出現一次）→ 永遠得 1 個訊號 → 永遠標唔到已覆蓋 →
 * next_point 由 T4 起一路卡死喺 kp_002，prompt 每輪都叫 bot 教同一點。
 * 舊版門檻 1 冇呢個問題，係新規則放大咗嘅既有風險。
 *
 * 跳過（skip）同已覆蓋（covered）係兩件事：跳過只係唔再逼 bot 教佢，
 * 知識點仍然可以教、教到夠訊號就自動變已覆蓋，然後由 skipped 名單剔走。
 * 所以跳錯嘅代價低（少咗個指引），唔跳嘅代價高（永久叫 bot 重複教）。
 *
 * 4 呢個數係 2026-09-14 四段真對話重播定嘅：正常目標都會揸 3-4 輪
 * （開場自介＋熱身佔兩三輪，之後先夠訊號），所以 4 係喺最壞正常情況
 * 之上留一格，唔會誤跳。低過 3 就會連正常開場都跳走。
 */
const NEXT_POINT_STALL_LIMIT = 4;

/**
 * 揀下一個要推嘅知識點，附「推唔動就跳過」保險。
 *
 * 每輪計法：covered 增長唔一定令目標前進（可能係後面嘅點被教到），
 * 所以呢度追蹤嘅係「目標本身」維持咗幾多輪冇換過 —— 一換就歸零。
 * 連續 NEXT_POINT_STALL_LIMIT 輪都係同一個目標就跳過佢，改推下一個。
 *
 * 但呢個保險只喺「對話已經有覆蓋」之後先啟動：一輪都未覆蓋過即係仲喺
 * 開場熱身（或者學生離題），呢個時候跳走知識點係誤判 —— 離題對話仲會
 * 每 4 輪靜靜雞跳走一點，跳到 next_point 變 null，冇晒引導目標。
 */
export function computeNextPoint(
  points: KnowledgePoint[],
  covered: Set<string>,
  previouslySkipped: Set<string>,
  previous: { nextPointId: string | null; turnsOnNextPoint: number } | null
): { nextPointId: string | null; skippedIds: string[]; turnsOnNextPoint: number } {
  // 被跳過但後來教到 → 已經係 covered，唔使再留喺跳過名單
  const skipped = new Set(
    [...previouslySkipped].filter((id) => !covered.has(id))
  );
  // 課程結構簡化：優先推 basic_fact（基礎事實），全部基礎做完先推 deep_understanding。
  // 唔再依賴陣列順序 —— 就算 deep 點排喺前面都照樣先教基礎。
  const isAvailable = (point: KnowledgePoint) =>
    !covered.has(point.id) && !skipped.has(point.id);
  const firstUncovered = () =>
    points.find((point) => point.tier === "basic_fact" && isAvailable(point))?.id ??
    points.find(isAvailable)?.id ??
    null;

  let nextPointId = firstUncovered();
  let turnsOnNextPoint =
    previous && previous.nextPointId === nextPointId
      ? previous.turnsOnNextPoint + 1
      : 0;

  if (covered.size > 0 && nextPointId && turnsOnNextPoint >= NEXT_POINT_STALL_LIMIT) {
    skipped.add(nextPointId);
    nextPointId = firstUncovered();
    turnsOnNextPoint = 0;
  }

  return { nextPointId, skippedIds: [...skipped], turnsOnNextPoint };
}

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
    // 注意 role 有兩種寫法：DB 出嚟係 "assistant"，但 ask.ts:1985 會
    // 正規化成 "bot" 先傳入嚟，兩者都要認。
    // 每輪獨立一組字（唔 join 成一條），訊號先分得出「跨輪」。
    const assistantTurns = [
      ...input.recentMessages
        .filter((message) => message.role === "assistant" || message.role === "bot")
        .map((message) => message.content),
      input.reply,
    ];
    // 學生自己講過嘅每輪文字（Hybrid 主訊號來源）。只認 role === "user"，
    // 同 assistant/bot 對稱 —— 呢個正規化喺 ask.ts 入嚟前已經做好。
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
