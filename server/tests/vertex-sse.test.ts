import assert from "node:assert/strict";
import test from "node:test";
import { takeVertexSseData } from "../lib/vertex-sse.ts";

test("parses Vertex SSE events separated by CRLF", () => {
  const payload = '{"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}';
  const result = takeVertexSseData(`data: ${payload}\r\n\r\n`);
  assert.deepEqual(result.data, [payload]);
  assert.equal(result.rest, "");
});

test("preserves an incomplete SSE event for the next chunk", () => {
  const first = takeVertexSseData('data: {"value":');
  assert.deepEqual(first.data, []);
  const second = takeVertexSseData(`${first.rest}1}\r\n\r\n`);
  assert.deepEqual(second.data, ['{"value":1}']);
  assert.equal(second.rest, "");
});
