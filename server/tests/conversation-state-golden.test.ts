// Golden scenarios：三種學生原型喺「教學目標覆蓋」嘅行為回歸測試。
// 模擬 trackConversationState 嘅純函數部分（唔使 DB）：
//   覆蓋 = computeCoreCovered（mode-aware：直接給答案 = bot 教過就算；
//          引導／不直接 = bot 教咗 AND 學生答到先算）
//   next_point = computeNextPoint(...)
//
// D4 換 LLM 判斷後應照跑同綠。
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeCoreCovered,
  computeNextPoint,
  computeStudentEvidence,
} from "../lib/conversation-state.ts";
import type { KnowledgePoint } from "../../utils/chat-prompt.ts";

const point = (id: string, keywords: string[]): KnowledgePoint => ({
  id,
  tier: "basic_fact",
  title: id,
  content: "測試內容",
  keywords,
});

const trapPoints = (): KnowledgePoint[] => [
  point("kp_001", ["榫卯", "斗拱"]),
  point("kp_002", ["南蓮園池", "志蓮淨苑"]),
  point("kp_003", ["墨斗", "魯班"]),
];

const runCoreTurns = (
  points: KnowledgePoint[],
  turns: Array<{ student: string; bot: string }>,
  strictCoverage: boolean
) => {
  let covered = new Set<string>();
  let skipped = new Set<string>();
  let prev: { nextPointId: string | null; turnsOnNextPoint: number } | null = null;
  const botTurns: string[] = [];
  const studentTurns: string[] = [];
  return turns.map(({ student, bot }) => {
    botTurns.push(bot);
    studentTurns.push(student);
    const studentEvidence = computeStudentEvidence(points, studentTurns);
    covered = computeCoreCovered(points, botTurns, studentEvidence, covered, strictCoverage);
    const result = computeNextPoint(points, covered, skipped, prev);
    skipped = new Set(result.skippedIds);
    prev = { nextPointId: result.nextPointId, turnsOnNextPoint: result.turnsOnNextPoint };
    return { ...result, covered: new Set(covered) };
  });
};

test("引導模式．離題學生：bot 教咗但學生冇答到 → 唔算覆蓋", () => {
  const states = runCoreTurns(
    trapPoints(),
    [
      { student: "我今日食咗菠蘿包", bot: "榫卯同斗拱係一對拍檔。" },
      { student: "我想打機", bot: "我哋繼續講榫卯。" },
    ],
    true
  );
  assert.equal(states[1].covered.has("kp_001"), false, "bot 單方面教咗，學生冇答，唔應該覆蓋");
});

test("引導模式．已經全會嘅學生：bot 教 + 學生答 → 覆蓋", () => {
  const states = runCoreTurns(
    trapPoints(),
    [
      { student: "榫卯係唔使用釘嘅接合方法", bot: "冇錯，榫卯同斗拱係一對拍檔。" },
    ],
    true
  );
  assert.equal(states[0].covered.has("kp_001"), true, "兩個訊號齊先算覆蓋");
});

test("引導模式．只答一個詞嘅學生：敷衍回覆唔當答到 → 唔算覆蓋", () => {
  const states = runCoreTurns(
    trapPoints(),
    [
      { student: "哦", bot: "榫卯同斗拱係一對拍檔。" },
      { student: "唔知", bot: "榫卯係木工唔使用釘。" },
    ],
    true
  );
  assert.equal(states[1].covered.has("kp_001"), false, "敷衍回覆唔產生學生證據");
});

test("直接給答案模式：bot 教過就算，唔使學生答", () => {
  const states = runCoreTurns(
    trapPoints(),
    [{ student: "咩嚟㗎", bot: "榫卯同斗拱係一對拍檔。" }],
    false
  );
  assert.equal(states[0].covered.has("kp_001"), true, "寬鬆判定：bot 講過即覆蓋");
});
