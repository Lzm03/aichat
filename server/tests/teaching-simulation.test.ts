// 教學模擬預覽純函數測試：場景學生輸入要動態取自 Bot 知識點，
// 判斷要同 server 一樣用 utils/coverage.ts（唔可以寫死知識內容）。
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentTurns,
  corePointsOf,
  evaluateSimulation,
  pickSimulationTarget,
} from "../../utils/teaching-simulation.ts";

const buildKnowledgeBase = (answerMode: string) => `【人物背景設定】
我係魯班，木工出身。

【人物知識庫摘要】
木工知識摘要。

【知識點分級】
[{"id":"kp_001","tier":"basic_fact","title":"榫卯結構","content":"榫卯係唔使用釘嘅接合方法。","keywords":["榫卯","斗拱"],"core":true},{"id":"kp_002","tier":"deep_understanding","title":"木構穩固原因","content":"木構靠榫卯先穩固。","keywords":["木構","穩固"],"core":true}]

【角色對話策略】
【性格特質】耐心
【説話風格】口語
【答題策略】${answerMode}`;

test("corePointsOf 只取教學目標（core）", () => {
  const points = corePointsOf(buildKnowledgeBase("引導後再回答"));
  assert.equal(points.length, 2);
  assert.equal(points.every((point) => point.core !== false), true);
});

test("pickSimulationTarget 優先 basic_fact", () => {
  const target = pickSimulationTarget(corePointsOf(buildKnowledgeBase("引導後再回答")));
  assert.equal(target?.id, "kp_001");
});

test("學生場景輸入動態取自目前知識點（唔寫死知識名）", () => {
  const target = pickSimulationTarget(corePointsOf(buildKnowledgeBase("引導後再回答")));
  const familiar = buildStudentTurns("already_familiar", target);
  assert.ok(familiar.length >= 1);
  assert.ok(
    familiar.some((turn) => turn.includes("榫卯") || turn.includes("斗拱")),
    "已經很熟場景要用目前知識點內容／關鍵詞"
  );

  const short = buildStudentTurns("short_answer", target);
  assert.deepEqual(short, ["係", "唔知"]);

  const offTopic = buildStudentTurns("off_topic", target);
  assert.equal(offTopic.some((turn) => turn.includes("榫卯")), false);
});

test("引導模式：Bot 教 + 學生答 → 覆蓋", () => {
  const result = evaluateSimulation({
    knowledgeBase: buildKnowledgeBase("引導後再回答"),
    scenarioId: "already_familiar",
    turns: [
      { role: "student", content: "我記得，榫卯係唔使用釘嘅接合方法。" },
      { role: "bot", content: "冇錯，榫卯同斗拱係一對拍檔。" },
    ],
  });
  assert.ok(result);
  assert.equal(result.strictCoverage, true);
  assert.equal(result.botTaughtTarget, true);
  assert.equal(result.studentAnsweredTarget, true);
  assert.equal(result.coveredTarget, true);
});

test("引導模式：學生只答一個詞 → 唔算覆蓋", () => {
  const result = evaluateSimulation({
    knowledgeBase: buildKnowledgeBase("引導後再回答"),
    scenarioId: "short_answer",
    turns: [
      { role: "student", content: "係" },
      { role: "bot", content: "冇錯，榫卯同斗拱係一對拍檔。" },
    ],
  });
  assert.ok(result);
  assert.equal(result.botTaughtTarget, true);
  assert.equal(result.studentAnsweredTarget, false);
  assert.equal(result.coveredTarget, false);
});

test("直接給答案模式：Bot 教過就算", () => {
  const result = evaluateSimulation({
    knowledgeBase: buildKnowledgeBase("直接給答案"),
    scenarioId: "off_topic",
    turns: [
      { role: "student", content: "我今日想講吓打機。" },
      { role: "bot", content: "等我講吓榫卯同斗拱：榫卯係唔使用釘嘅接合方法。" },
    ],
  });
  assert.ok(result);
  assert.equal(result.strictCoverage, false);
  assert.equal(result.botTaughtTarget, true);
  assert.equal(result.coveredTarget, true);
});

test("冇 core 知識點 → 回 null", () => {
  const result = evaluateSimulation({
    knowledgeBase: "【人物背景設定】\n測試。",
    scenarioId: "already_familiar",
    turns: [{ role: "student", content: "你好" }],
  });
  assert.equal(result, null);
});
