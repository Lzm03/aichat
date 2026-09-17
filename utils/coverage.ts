/**
 * 覆蓋判定純函數（client + server 共用）。
 *
 * 由 server/lib/conversation-state.ts 抽出，等前端「教學模擬預覽」可以用
 * 完全相同嘅邏輯計算 covered / next_point，唔會出現兩套實作走樣。
 * 純函數、無任何 DB 或 node 依賴，可以安全咁入前端 bundle。
 *
 * 判定跟 bot 答題策略（mode-aware）：
 *   - 直接給答案：角色講過 keyword 就算（學生唔會產出答案）。
 *   - 引導後再回答 / 不直接給答案：角色教咗 AND 學生答到先算。
 */
import type { KnowledgePoint } from "./chat-prompt";

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
export const MIN_SIGNALS = 2;

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
export const SUBSTANTIVE_INPUT_MIN = 4;

/**
 * 由「學生自己講過嘅每輪文字」算出有展現理解嘅知識點（主訊號）。
 *
 * 同 computeNewlyCovered 嘅分別：嗰個數「角色講過咩」（教咗），呢個數「學生
 * 講過咩」（學咗）。學生主動講出知識點 keyword = 強證據，所以 1 個訊號就夠
 * （唔似角色版要 2 個去避泛用詞誤鎖）。
 *
 * 已知限制（LLM judge 先解決）：
 * - 字串匹配只捉到「學生用咗 exact keyword」，捉唔到「用自己說話講出概念」。
 * - 學生複述 keyword 嚟提問（「榫卯？咩嚟㗎」）會被當成證據。
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
 * LLM judge 或者字串匹配（fallback）。
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
 *
 * 跳過（skip）同已覆蓋（covered）係兩件事：跳過只係唔再逼 bot 教佢，
 * 知識點仍然可以教、教到夠訊號就自動變已覆蓋，然後由 skipped 名單剔走。
 * 所以跳錯嘅代價低（少咗個指引），唔跳嘅代價高（永久叫 bot 重複教）。
 *
 * 4 呢個數係 2026-09-14 四段真對話重播定嘅：正常目標都會揸 3-4 輪
 * （開場自介＋熱身佔兩三輪，之後先夠訊號），所以 4 係喺最壞正常情況
 * 之上留一格，唔會誤跳。低過 3 就會連正常開場都跳走。
 */
export const NEXT_POINT_STALL_LIMIT = 4;

/**
 * 揀下一個要推嘅知識點，附「推唔動就跳過」保險。
 *
 * 每輪計法：covered 增長唔一定令目標前進（可能係後面嘅點被教到），
 * 所以呢度追蹤嘅係「目標本身」維持咗幾多輪冇換過 —— 一換就歸零。
 * 連續 NEXT_POINT_STALL_LIMIT 輪都係同一個目標就跳過佢，改推下一個。
 *
 * 但呢個保險只喺「對話已經有覆蓋」之後先啟動：一輪都未覆蓋過即係仲喺
 * 開場熱身（或者學生離題），呢個時候跳走知識點係誤判。
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
