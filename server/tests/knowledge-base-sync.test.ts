// 守護測試：手動知識點同 bots.knowledge_base 收斂（學習報告讀呢份來源）。
// 防止再出現「版本數據有、主知識庫冇」嘅資料來源分歧 bug。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildKnowledgeBaseWithVersionPoints,
  buildStoredKnowledgeBase,
  parsePromptSource,
} from "../../utils/chat-prompt";

const point = (id: string, title: string, content: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  content,
  tier: "basic_fact" as const,
  keywords: ["greeting"],
  assessmentCriteria: "",
  core: true,
  ...extra,
});

const baseKb = buildStoredKnowledgeBase({
  characterBackground: "我係一位英語學習夥伴",
  knowledgeSummary: "- [基礎事實] Greeting：How to say hello.",
  knowledgePoints: [point("kp_1", "Greeting", "How to say hello.")],
  personaProfile: "【答題策略】引導後再回答",
});

test("冇改動時原樣返還（保住 legacy 手寫摘要）", () => {
  const parsed = parsePromptSource({ knowledgeBase: baseKb });
  const out = buildKnowledgeBaseWithVersionPoints({
    knowledgeBase: baseKb,
    defaultVersionPoints: parsed.knowledgePoints,
  });
  assert.equal(out, baseKb);
});

test("手動新增嘅知識點會入重建後嘅知識庫", () => {
  const parsed = parsePromptSource({ knowledgeBase: baseKb });
  const withManual = [...parsed.knowledgePoints, point("kp_2", "Ordering food", "How to order politely.")];
  const out = buildKnowledgeBaseWithVersionPoints({
    knowledgeBase: baseKb,
    defaultVersionPoints: withManual,
  });
  const rebuilt = parsePromptSource({ knowledgeBase: out });
  assert.equal(rebuilt.knowledgePoints.length, 2);
  assert.ok(rebuilt.knowledgePoints.some((p) => p.id === "kp_2"));
  assert.ok(out.includes("Ordering food"));
});

test("改咗背景都會帶入重建結果", () => {
  const parsed = parsePromptSource({ knowledgeBase: baseKb });
  const out = buildKnowledgeBaseWithVersionPoints({
    knowledgeBase: baseKb,
    defaultVersionPoints: parsed.knowledgePoints,
    characterBackground: "我係新嘅英語夥伴",
  });
  const rebuilt = parsePromptSource({ knowledgeBase: out });
  assert.equal(rebuilt.characterBackground, "我係新嘅英語夥伴");
});

test("刪晒知識點都仍然出到非空知識庫", () => {
  const out = buildKnowledgeBaseWithVersionPoints({
    knowledgeBase: baseKb,
    defaultVersionPoints: [],
  });
  assert.ok(out.trim().length > 0);
  const rebuilt = parsePromptSource({ knowledgeBase: out });
  assert.equal(rebuilt.knowledgePoints.length, 0);
});
