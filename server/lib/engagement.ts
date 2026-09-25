/**
 * 課堂參與度分類（純函數、零 import，方便 root test 用 esbuild 直接 bundle）：
 * - `parseEngagement`：由 judge 嘅 raw JSON 解出 meaningless / effective 索引
 * - `classifyEngagement`：索引集（LLM）或字數門檻（heuristic fallback）→ 每窗口計數
 *
 * 參與度判斷搭 answer-judge 順風車（docs/class-participation.md）：同一次 Gemini call
 * 輸出 demonstrated + engagement，唔另開 call。「無意義」定義沿用 JUDGE_SUBSTANTIVE_MIN
 * （低過 4 字 = 敷衍回覆，同 answer-judge 原本嘅預濾同一個門檻，唔另立一套）。
 */

/** 學生「實質輸入」最短字數：低過即敷衍回覆（哦／唔知／係），唔值得判斷 */
export const JUDGE_SUBSTANTIVE_MIN = 4;

/** LLM 分類：0-based 索引指向 judge prompt 嘅「新訊息（學生）編號清單」 */
export type EngagementVerdict = {
  /** 無實質內容（哦／唔知／係／亂打字） */
  meaningless: Set<number>;
  /** 學生主動提出、同學習內容相關嘅提問 */
  effective: Set<number>;
};

/**
 * 解 judge 回應入面嘅 engagement 欄。策略同 answer-judge 嘅 parseDemonstrated：
 * 先 JSON.parse，失敗就抽第一個 `{...}` block 再 parse。
 * 回 null = 判斷唔到（欄位缺失／index 越界／非整數）→ caller 落 heuristic fallback，
 * 唔可以靜靜當 pass。
 */
export function parseEngagement(
  raw: string,
  newTurnCount: number
): EngagementVerdict | null {
  if (!Number.isInteger(newTurnCount) || newTurnCount < 0) return null;

  const fromParsed = (parsed: unknown): EngagementVerdict | null => {
    const engagement = (parsed as { engagement?: unknown } | null)?.engagement;
    if (!engagement || typeof engagement !== "object") return null;
    const toIndexSet = (value: unknown): Set<number> | null => {
      if (!Array.isArray(value)) return null;
      const set = new Set<number>();
      for (const entry of value) {
        const index = Number(entry);
        if (!Number.isInteger(index) || index < 0 || index >= newTurnCount) {
          return null;
        }
        set.add(index);
      }
      return set;
    };
    const meaningless = toIndexSet(
      (engagement as { meaningless?: unknown }).meaningless
    );
    const effective = toIndexSet((engagement as { effective?: unknown }).effective);
    if (!meaningless || !effective) return null;
    return { meaningless, effective };
  };

  try {
    return fromParsed(JSON.parse(raw));
  } catch {
    const block = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!block) return null;
    try {
      return fromParsed(JSON.parse(block));
    } catch {
      return null;
    }
  }
}

export type EngagementCounts = {
  /** 實質訊息數（= 唔係 meaningless 嘅學生訊息數） */
  substantive: number;
  effective: number;
  meaningless: number;
  /** llm = 真係 judge 過；heuristic-fallback = 字數門檻兜底。統計頁要分得開兩者 */
  judgeSource: "llm" | "heuristic-fallback";
};

/**
 * 每窗口計數。LLM 有判斷就信佢（重複 index 以 meaningless 優先）；
 * 冇（null）用字數門檻兜底——heuristic 分唔出「有效提問」，effective 恒 0。
 */
export function classifyEngagement(
  newTurns: Array<{ content: string }>,
  engagement: EngagementVerdict | null
): EngagementCounts {
  if (engagement) {
    let effective = 0;
    let meaningless = 0;
    newTurns.forEach((_turn, index) => {
      if (engagement.meaningless.has(index)) meaningless += 1;
      else if (engagement.effective.has(index)) effective += 1;
    });
    return {
      substantive: newTurns.length - meaningless,
      effective,
      meaningless,
      judgeSource: "llm",
    };
  }
  const substantive = newTurns.filter(
    (turn) => (turn.content || "").trim().length >= JUDGE_SUBSTANTIVE_MIN
  ).length;
  return {
    substantive,
    effective: 0,
    meaningless: newTurns.length - substantive,
    judgeSource: "heuristic-fallback",
  };
}
