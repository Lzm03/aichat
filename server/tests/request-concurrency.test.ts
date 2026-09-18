import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { getRequestConcurrencyState, requestConcurrencyGate } from "../lib/request-concurrency.ts";

class FakeResponse extends EventEmitter {
  destroyed = false;
  headersSent = false;
  statusCode = 200;
  setHeader() {}
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json() {
    this.headersSent = true;
    this.emit("finish");
    return this;
  }
}

test("a 1000-request burst is bounded instead of starting all work at once", async () => {
  let running = 0;
  let peak = 0;
  let completed = 0;

  await new Promise<void>((resolve, reject) => {
    for (let index = 0; index < 1000; index += 1) {
      const req = { method: "GET", path: "/api/test", destroyed: false } as any;
      const res = new FakeResponse() as any;
      requestConcurrencyGate(req, res, () => {
        running += 1;
        peak = Math.max(peak, running);
        setImmediate(() => {
          running -= 1;
          completed += 1;
          res.emit("finish");
          if (completed === 1000) resolve();
        });
      });
    }
    setTimeout(() => reject(new Error("concurrency gate test timed out")), 5000).unref();
  });

  const state = getRequestConcurrencyState();
  assert.equal(completed, 1000);
  assert.ok(peak <= state.maxActive);
  assert.equal(state.active, 0);
  assert.equal(state.queued, 0);
});
