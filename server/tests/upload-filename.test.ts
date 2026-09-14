import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUploadFilename } from "../../utils/uploadFilename.ts";

const asMultipartLatin1 = (filename: string) => Buffer.from(filename, "utf8").toString("latin1");

test("restores UTF-8 Chinese filenames decoded as multipart Latin-1", () => {
  const filename = "中文教材（第二版）.docx";
  assert.equal(normalizeUploadFilename(asMultipartLatin1(filename)), filename);
});

test("preserves ASCII and already-correct Unicode filenames", () => {
  assert.equal(normalizeUploadFilename("lesson-notes.pdf"), "lesson-notes.pdf");
  assert.equal(normalizeUploadFilename("中文教材.docx"), "中文教材.docx");
});

test("preserves genuine Latin-1 when its bytes are not valid UTF-8", () => {
  assert.equal(normalizeUploadFilename("café.pdf"), "café.pdf");
});

test("normalizes recovered names to NFC", () => {
  const decomposed = "re\u0301sume\u0301.docx";
  assert.equal(normalizeUploadFilename(asMultipartLatin1(decomposed)), "résumé.docx");
});
