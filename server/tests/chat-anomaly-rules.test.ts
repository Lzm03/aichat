import test from "node:test";
import assert from "node:assert/strict";

import { detectChatAnomaly, shouldScreenChatMessage } from "../lib/chat-anomaly-rules.ts";

const OFFENSIVE = "inappropriate-chat-offensive-terms";
const WELLBEING = "wellbeing-chat-distress-terms";
const PRIVACY = "privacy-chat-personal-info";

function hit(text: string) {
  return detectChatAnomaly(text);
}

test("detects Cantonese profanity and returns ruleId, category and action", () => {
  assert.deepEqual(hit("你條仆街行開啦"), {
    ruleId: OFFENSIVE,
    category: "inappropriate",
    action: "block",
    excerpt: "仆街",
  });
});

test("detects English profanity case-insensitively", () => {
  const result = hit("FUCK off");
  assert.equal(result?.ruleId, OFFENSIVE);
  assert.equal(result?.excerpt, "FUCK");
});

test("detects wtf and 去死", () => {
  assert.equal(hit("wtf")?.excerpt, "wtf");
  assert.equal(hit("WTF??")?.excerpt, "WTF");
  assert.equal(hit("你去死啦")?.ruleId, OFFENSIVE);
});

test("去死 does not match place names like 死亡谷", () => {
  assert.equal(hit("我想去死亡谷旅遊"), null);
});

test("self-referential 去死 is wellbeing, not a block", () => {
  // The blocking rule carries (?<![我想]) so the second person stays a block
  // while the first person falls through to the advisory wellbeing rule.
  assert.equal(hit("你條仆街")?.action, "block");
  const selfHarm = hit("我想去死");
  assert.equal(selfHarm?.ruleId, WELLBEING);
  assert.equal(selfHarm?.action, "flag");
  assert.equal(selfHarm?.category, "wellbeing");
  assert.equal(hit("我好想死")?.ruleId, WELLBEING);
  // Directed at someone else stays a block.
  assert.equal(hit("你去死啦")?.action, "block");
});

test("wellbeing signals are always flag-only (never dropped)", () => {
  for (const text of ["我唔想活落去", "自殺係一個沉重話題", "我覺得人生冇意義", "我好想消失", "都係因我而起"]) {
    const result = hit(text);
    assert.ok(result, `expected a hit for ${text}`);
    assert.equal(result.category, "wellbeing", `${text} should be wellbeing`);
    assert.equal(result.action, "flag", `${text} must never block`);
  }
});

test("detects personal data formats and blocks them", () => {
  const phone = hit("我電話係 91234567");
  assert.equal(phone?.ruleId, PRIVACY);
  assert.equal(phone?.action, "block");
  assert.equal(hit("whatsapp: 61234567")?.ruleId, PRIVACY);
  assert.equal(hit("my hkid is A123456(3)")?.ruleId, PRIVACY);
  assert.equal(hit("email me at student@school.edu.hk")?.ruleId, PRIVACY);
});

test("ordinary schoolwork is not treated as personal data", () => {
  // 住在/地址 alone are deliberately excluded from the privacy rule.
  assert.equal(hit("我住在香港"), null);
  assert.equal(hit("呢條數學題答案係 12345678"), null);
  assert.equal(hit("我想知地址係咩"), null);
});

test("returns null for empty and whitespace-only input", () => {
  assert.equal(hit(""), null);
  assert.equal(hit("   "), null);
});

test("returns null for clean Cantonese", () => {
  assert.equal(hit("今日天氣好好呀"), null);
  assert.equal(hit("我想學中文"), null);
});

test("rejected high-FP terms do not match", () => {
  // Terms deliberately excluded for chat blocking (see spec doc reject table).
  assert.equal(hit("垃圾分類係環保課題"), null);
  assert.equal(hit("呢題好蠢"), null);
  assert.equal(hit("白痴都係一個詞語"), null);
});

test("blocking rules win when a message carries both signals", () => {
  // Personal data must not be delivered just because the message also reads
  // as distress; the teacher still sees the full content in the record.
  const result = hit("我電話係 91234567，我好想死");
  assert.equal(result?.category, "privacy");
  assert.equal(result?.action, "block");
});

test("excerpt is capped at 40 chars", () => {
  const long = "冚家鏟".repeat(30);
  const result = hit(long);
  assert.ok(result);
  assert.ok(result.excerpt.length <= 40);
});

test("shouldScreenChatMessage: only student chat messages are screened", () => {
  const base = { integration: false, usageType: "chat_message" };
  assert.equal(shouldScreenChatMessage({ ...base, role: "student" }), true);
  assert.equal(shouldScreenChatMessage({ ...base, role: "teacher" }), false);
  assert.equal(shouldScreenChatMessage({ ...base, role: "admin" }), false);
  assert.equal(shouldScreenChatMessage({ ...base, role: null }), false);
  assert.equal(shouldScreenChatMessage({ ...base, role: undefined }), false);
  assert.equal(shouldScreenChatMessage({ ...base, role: "student", integration: true }), false);
  assert.equal(shouldScreenChatMessage({ ...base, role: "student", usageType: "general" }), false);
});
