import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeminiContents,
  normalizeGeminiImages,
  summarizeGeminiContents,
} from "../lib/gemini-content.ts";

test("keeps an uploaded image in conversation history for a later question", () => {
  const image = { mimeType: "image/png", data: "aW1hZ2UtYnl0ZXM=" };
  const contents = buildGeminiContents("上面有什麼字？", [], [
    { role: "user", content: "這是什麼？", images: [image] },
    { role: "bot", content: "這是一個標誌。" },
  ]);

  assert.deepEqual(contents, [
    {
      role: "user",
      parts: [
        { text: "這是什麼？" },
        { inlineData: image },
      ],
    },
    { role: "model", parts: [{ text: "這是一個標誌。" }] },
    { role: "user", parts: [{ text: "上面有什麼字？" }] },
  ]);
  assert.deepEqual(summarizeGeminiContents(contents), {
    multimodal: true,
    images: 1,
    mimeTypes: ["image/png"],
  });
});

test("preserves supported MIME types and rejects unsupported image formats", () => {
  assert.deepEqual(
    normalizeGeminiImages([
      { mimeType: "image/jpeg", data: "jpeg" },
      { mimeType: "image/png", data: "png" },
      { mimeType: "image/webp", data: "webp" },
      { mimeType: "image/gif", data: "gif" },
    ]),
    [
      { mimeType: "image/jpeg", data: "jpeg" },
      { mimeType: "image/png", data: "png" },
      { mimeType: "image/webp", data: "webp" },
    ]
  );
});
