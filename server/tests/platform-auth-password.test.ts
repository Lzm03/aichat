import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/platform-auth.ts";

test("password verification remains compatible and asynchronous", async () => {
  const stored = hashPassword("Correct#123");
  const pending = verifyPassword("Correct#123", stored);
  assert.equal(typeof pending.then, "function");
  assert.equal(await pending, true);
  assert.equal(await verifyPassword("Wrong#123", stored), false);
});

test("malformed password hashes are rejected", async () => {
  assert.equal(await verifyPassword("anything", "malformed"), false);
});
