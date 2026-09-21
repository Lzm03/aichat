import assert from "node:assert/strict";
import test from "node:test";
import { isFeatureUnlimitedForRole } from "../config/feature-limits.ts";

test("teachers have unlimited chat messages and voice replies", () => {
  assert.equal(isFeatureUnlimitedForRole("teacher", "chat_messages"), true);
  assert.equal(isFeatureUnlimitedForRole("teacher", "voice_messages"), true);
});

test("teacher-only unlimited access does not cover other features", () => {
  assert.equal(isFeatureUnlimitedForRole("teacher", "voice_audition_preview"), false);
  assert.equal(isFeatureUnlimitedForRole("teacher", "bot_publish"), false);
});

test("students get free bot-chat voice but keep their other limits", () => {
  // 產品規則：學生嘅 Bot 對話語音永久開放（見 config/feature-limits.ts 嘅
  // isFeatureUnlimitedForRole 註釋），但文字對話同其他製作功能照跟原本配額。
  assert.equal(isFeatureUnlimitedForRole("student", "voice_messages"), true);
  assert.equal(isFeatureUnlimitedForRole("student", "chat_messages"), false);
  assert.equal(isFeatureUnlimitedForRole("student", "voice_audition_preview"), false);
});

test("admins do not inherit teacher-only unlimited features", () => {
  assert.equal(isFeatureUnlimitedForRole("admin", "chat_messages"), false);
  assert.equal(isFeatureUnlimitedForRole("admin", "voice_messages"), false);
});
