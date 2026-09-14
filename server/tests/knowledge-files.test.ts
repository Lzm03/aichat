import assert from "node:assert/strict";
import test from "node:test";
import { combineExtractedFileText } from "../lib/knowledge-files.ts";

test("keeps content from every uploaded file within the model context limit", () => {
  const combined = combineExtractedFileText([
    { fileName: "第一份.docx", extractedText: "甲".repeat(500) },
    { fileName: "第二份.pdf", extractedText: "乙".repeat(500) },
  ], 240);

  assert.ok(combined.length <= 240);
  assert.match(combined, /【文件：第一份\.docx】/);
  assert.match(combined, /【文件：第二份\.pdf】/);
  assert.match(combined, /甲/);
  assert.match(combined, /乙/);
});

test("redistributes unused space from a short file to longer files", () => {
  const combined = combineExtractedFileText([
    { fileName: "short.pdf", extractedText: "短" },
    { fileName: "long.doc", extractedText: "長".repeat(500) },
  ], 200);

  assert.match(combined, /【文件：short\.pdf】\n短/);
  assert.ok((combined.match(/長/g) || []).length > 100);
});
