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

test("students and admins retain their configured feature limits", () => {
  assert.equal(isFeatureUnlimitedForRole("student", "chat_messages"), false);
  assert.equal(isFeatureUnlimitedForRole("student", "voice_messages"), false);
  assert.equal(isFeatureUnlimitedForRole("admin", "chat_messages"), false);
});
