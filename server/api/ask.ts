import express from "express";
import fetch from "node-fetch";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");  // ← v1.1.1 才正常

const router = express.Router();

/* ============================================================
   1) PDF → Text
   ============================================================ */
async function extractTextFromPDF(buffer: Buffer) {
  const parsed = await pdfParse(buffer);
  return parsed.text.trim();
}

/* ============================================================
   2) DeepSeek Chat Completion
   ============================================================ */
async function askDeepSeek(systemPrompt: string, userPrompt: string) {
  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  const data: any = await r.json();
  return data?.choices?.[0]?.message?.content ?? "（無回答）";
}

/* ============================================================
   3) PDF 上傳 → 分析
   ============================================================ */
router.post("/ask-file", async (req: any, res) => {
  try {
    const fileField = req.files?.file;
    if (!fileField) return res.status(400).json({ error: "缺少文件" });

    const file = Array.isArray(fileField) ? fileField[0] : fileField;

    // 1) PDF → text
    const pdfText = await extractTextFromPDF(file.data);

    if (!pdfText) {
      return res.json({ reply: "（PDF 沒有可解析文字）" });
    }

    // 2) DeepSeek 整理
    const systemPrompt = req.body.systemPrompt;
    const reply = await askDeepSeek(systemPrompt, pdfText);

    return res.json({
      reply,
      extractedText: pdfText,
    });

  } catch (err: any) {
    console.error("❌ PDF 解析錯誤:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   4) URL / 文字
   ============================================================ */
router.post("/ask", async (req, res) => {
  try {
    const { systemPrompt, userPrompt } = req.body;
    const reply = await askDeepSeek(systemPrompt, userPrompt);
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;