/**
 * 教學模擬預覽邏輯（純函數，唔打 API、唔寫 DB）。
 *
 * 場景只定義「學生行為」（已經很熟／答得很短／完全離題），
 * 實際內容由目前 Bot 嘅 core 知識點動態生成 —— 冇任何寫死知識名稱。
 * 判斷用同 server 一樣嘅 utils/coverage.ts，唔會出現兩套實作。
 */
import {
  parseAnswerMode,
  parsePromptSource,
  type KnowledgePoint,
} from "./chat-prompt";
import {
  computeCoreCovered,
  computeNewlyCovered,
  computeNextPoint,
  computeStudentEvidence,
} from "./coverage";

export type SimulationScenarioId =
  | "already_familiar"
  | "short_answer"
  | "off_topic";

export type SimulationScenario = {
  id: SimulationScenarioId;
  title: string;
  description: string;
};

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "already_familiar",
    title: "學生已經很熟",
    description: "學生主動正確回答，檢查 Bot 是否識別到學生已掌握。",
  },
  {
    id: "short_answer",
    title: "學生答得很短",
    description: "學生只答「係」「唔知」，檢查 Bot 會否誤判為已掌握。",
  },
  {
    id: "off_topic",
    title: "學生完全離題",
    description: "學生持續傾其他話題，檢查 Bot 能否自然拉回主題。",
  },
];

export type SimulationTurn = {
  role: "student" | "bot";
  content: string;
};

export type SimulationResult = {
  scenarioId: SimulationScenarioId;
  /** 模擬用嘅教學目標（目前 Bot 第一個 core 知識點） */
  target: { id: string; title: string; tier: string } | null;
  turns: SimulationTurn[];
  /** Bot 有冇講過目標知識點嘅關鍵詞 */
  botTaughtTarget: boolean;
  /** 學生有冇講到目標知識點嘅關鍵詞（實質輸入） */
  studentAnsweredTarget: boolean;
  /** 按答題策略判定：目標知識點算唔算已覆蓋 */
  coveredTarget: boolean;
  coveredPointIds: string[];
  nextPointId: string | null;
  nextPointTitle: string | null;
  skippedPointIds: string[];
  /** true = 引導後再回答／不直接給答案（要 Bot 教 + 學生答） */
  strictCoverage: boolean;
};

/** 目前 Bot 嘅 core 知識點；basic_fact 優先（同 next_point 規則一致） */
export function corePointsOf(knowledgeBase: string): KnowledgePoint[] {
  return parsePromptSource({ knowledgeBase }).knowledgePoints.filter(
    (point) => point.core !== false
  );
}

export function pickSimulationTarget(
  points: KnowledgePoint[]
): KnowledgePoint | null {
  return (
    points.find((point) => point.tier === "basic_fact") ?? points[0] ?? null
  );
}

/**
 * 按場景生成學生輸入（動態取自目標知識點，唔寫死知識內容）。
 * 每個場景兩輪，令 Bot 有機會累積 ≥2 個覆蓋訊號。
 */
export function buildStudentTurns(
  scenarioId: SimulationScenarioId,
  target: KnowledgePoint | null
): string[] {
  if (scenarioId === "short_answer") {
    return ["係", "唔知"];
  }
  if (scenarioId === "off_topic") {
    return ["我今日想講吓打機。", "最近天氣幾好，你有冇去游水？"];
  }
  // already_familiar：用目標知識點內容砌出「學生答對」嘅輸入
  const content = target?.content?.trim() || target?.title?.trim() || "";
  const firstKeyword =
    (target?.keywords || []).find((keyword) => keyword && keyword.length >= 2) ||
    "";
  const first = content ? `我記得，${content}` : "我記得之前學過。";
  const second = firstKeyword ? `係，就係${firstKeyword}。` : "我明喇。";
  return [first, second];
}

/** 用同一套 coverage 純函數評估模擬結果 */
export function evaluateSimulation(input: {
  knowledgeBase: string;
  scenarioId: SimulationScenarioId;
  turns: SimulationTurn[];
}): SimulationResult | null {
  const points = corePointsOf(input.knowledgeBase);
  if (!points.length) return null;

  const target = pickSimulationTarget(points);
  const answerMode = parseAnswerMode(input.knowledgeBase);
  const strictCoverage = answerMode !== "直接給答案";

  const botTurns = input.turns
    .filter((turn) => turn.role === "bot")
    .map((turn) => turn.content);
  const studentTurns = input.turns
    .filter((turn) => turn.role === "student")
    .map((turn) => turn.content);

  const studentEvidence = computeStudentEvidence(points, studentTurns);
  const coveredNow = computeCoreCovered(
    points,
    botTurns,
    studentEvidence,
    new Set(),
    strictCoverage
  );
  const { nextPointId, skippedIds } = computeNextPoint(
    points,
    coveredNow,
    new Set(),
    null
  );

  const targetId = target?.id ?? null;
  const targetList = target ? [target] : [];
  const botTaughtTarget = targetId
    ? computeNewlyCovered(targetList, botTurns, new Set()).has(targetId)
    : false;
  const studentAnsweredTarget = targetId
    ? computeStudentEvidence(targetList, studentTurns).has(targetId)
    : false;

  const nextPoint = nextPointId
    ? points.find((point) => point.id === nextPointId) ?? null
    : null;

  return {
    scenarioId: input.scenarioId,
    target: target
      ? { id: target.id, title: target.title, tier: target.tier }
      : null,
    turns: input.turns,
    botTaughtTarget,
    studentAnsweredTarget,
    coveredTarget: targetId ? coveredNow.has(targetId) : false,
    coveredPointIds: [...coveredNow],
    nextPointId,
    nextPointTitle: nextPoint?.title ?? null,
    skippedPointIds: skippedIds,
    strictCoverage,
  };
}
