// Golden scenarios：三種學生原型嘅 Hybrid 覆蓋行為回歸測試。
// 模擬 trackConversationState 嘅純函數部分（唔使 DB）：
//   覆蓋 = computeNewlyCovered(bot 兜底) ∪ computeStudentEvidence(學生主訊號)
//   next_point = computeNextPoint(...)
//
// 呢個係 B1（Hybrid 字串匹配版）嘅驗收場景，D4 換 LLM 判斷後應照跑同綠。
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeNewlyCovered,
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

const runHybridTurns = (
  points: KnowledgePoint[],
  turns: Array<{ student: string; bot: string }>
) => {
  let covered = new Set<string>();
  let skipped = new Set<string>();
  let prev: { nextPointId: string | null; turnsOnNextPoint: number } | null =
    null;
  const botTurns: string[] = [];
  const studentTurns: string[] = [];
  return turns.map(({ student, bot }) => {
    botTurns.push(bot);
    studentTurns.push(student);
    covered = computeNewlyCovered(points, botTurns, covered);
    for (const id of computeStudentEvidence(points, studentTurns)) {
      covered.add(id);
    }
    const result = computeNextPoint(points, covered, skipped, prev);
    skipped = new Set(result.skippedIds);
    prev = {
      nextPointId: result.nextPointId,
      turnsOnNextPoint: result.turnsOnNextPoint,
    };
    return { ...result, covered: new Set(covered) };
  });
};

test("離題學生：唔會因學生亂嗡而誤標，bot 兜底照樣推得動", () => {
  const turns = [
    { student: "我今日食咗菠蘿包", bot: "菠蘿包好味呀，我哋傾返榫卯先。" },
    { student: "你唔悶咩成日講木", bot: "榫卯同斗拱一齊先係木構精髓。" },
    { student: "我想打機多啲", bot: "打完機再傾南蓮園池都得。" },
  ];
  const points = trapPoints();
  // 學生由頭到尾都冇講 keyword → 學生證據應該係空
  const studentTurns = turns.map((t) => t.student);
  assert.equal(
    computeStudentEvidence(points, studentTurns).size,
    0,
    "離題學生唔應該有任何學生證據"
  );
  const states = runHybridTurns(points, turns);
  // 兜底：bot 第二輪講榫卯+斗拱 → kp_001 覆蓋
  assert.equal(states[1].covered.has("kp_001"), true);
  // 離題保護：唔會因未覆蓋就跳走知識點
  assert.deepEqual(states[1].skippedIds, []);
});

test("已經全會嘅學生：學生證據一輪一個點，唔靠 bot 講 keyword 都覆蓋晒", () => {
  const turns = [
    { student: "榫卯係唔使用釘嘅接合方法", bot: "冇錯，你好有研究。" },
    { student: "南蓮園池同志蓮淨苑都係仿唐建築", bot: "你都知得幾多喎。" },
    { student: "魯班發明咗墨斗嚟畫直線", bot: "全中。" },
  ];
  const points = trapPoints();
  const states = runHybridTurns(points, turns);
  assert.equal(states[0].covered.has("kp_001"), true);
  assert.equal(states[1].covered.has("kp_002"), true);
  assert.equal(states[2].covered.has("kp_003"), true);
  assert.equal(states[2].nextPointId, null, "全部覆蓋 next_point 變 null");
  // 關鍵：bot 全程冇講任何 keyword，證明覆蓋係學生證據驅動，唔係兜底
  const botTurns = turns.map((t) => t.bot);
  assert.equal(
    computeNewlyCovered(points, botTurns, new Set()).size,
    0,
    "bot 冇講 keyword，兜底層覆蓋應該係空"
  );
});

test("只答一個詞嘅學生：敷衍/echo 唔當證據，靠 bot 兜底", () => {
  const turns = [
    { student: "哦", bot: "榫卯係咪好有趣？" },
    { student: "唔知", bot: "榫卯係木工唔使用釘嘅方法。" },
    { student: "榫卯", bot: "係呀，就係榫卯。" },
    { student: "係", bot: "繼續。" },
  ];
  const points = trapPoints();
  const studentTurns = turns.map((t) => t.student);
  // 敷衍（哦/唔知/係）＋裸 echo（榫卯）全部被實質輸入閾值擋走
  assert.equal(
    computeStudentEvidence(points, studentTurns).size,
    0,
    "敷衍回覆同裸 echo 唔應該產生學生證據"
  );
  const states = runHybridTurns(points, turns);
  // 兜底：bot 講咗榫卯跨 2 輪 → kp_001 覆蓋
  assert.equal(states[1].covered.has("kp_001"), true);
});
