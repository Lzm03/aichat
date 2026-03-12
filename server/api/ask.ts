import express from "express";
import type { Request, Response } from "express";
import fetch from "node-fetch";
import { createRequire } from "module";
import multer from "multer";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ============================================================
   1) PDF → Text
============================================================ */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text.trim();
}

function extractTextFromHtml(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const text = noScript
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

/* ============================================================
   2) DeepSeek Streaming
============================================================ */
async function askDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void
) {
  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const decoder = new TextDecoder();

  for await (const chunk of r.body as any) {
    const text = decoder.decode(chunk);

    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const json = line.replace("data:", "").trim();
      if (json === "[DONE]") return;

      try {
        const data = JSON.parse(json);
        const token = data?.choices?.[0]?.delta?.content;

        if (token) onToken(token);
      } catch {}
    }
  }
}

async function askDeepSeekOnce(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
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
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "DeepSeek request failed");
  }

  const data: any = await r.json();
  return data?.choices?.[0]?.message?.content || "";
}
/* ============================================================
   3) PDF 上传分析
============================================================ */
router.post("/ask-file", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "缺少文件" });

    const pdfText = await extractTextFromPDF(file.buffer);

    if (!pdfText) {
      return res.json({ reply: "（PDF 沒有可解析文字）" });
    }

    const systemPrompt: string = (req.body as any)?.systemPrompt || "";

    let reply = "";

    await askDeepSeek(systemPrompt, pdfText, (token: string) => {
      reply += token;
    });

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
   4) URL 抓取并分析
============================================================ */
router.post("/ask-url", async (req: Request, res: Response) => {
  try {
    const { systemPrompt = "", url = "" } = req.body as any;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "缺少網址" });
    }

    const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const pageRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Bot/1.0)",
      },
    });

    if (!pageRes.ok) {
      return res.status(400).json({ error: `網址抓取失敗：${pageRes.status}` });
    }

    const html = await pageRes.text();
    const pageText = extractTextFromHtml(html).slice(0, 18000);

    if (!pageText) {
      return res.status(400).json({ error: "網址內容無可解析文字" });
    }

    const reply = await askDeepSeekOnce(systemPrompt, pageText);
    return res.json({
      reply,
      extractedText: pageText,
      sourceUrl: targetUrl,
    });
  } catch (err: any) {
    console.error("❌ URL 解析錯誤:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   5) Chat Streaming
============================================================ */
router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { systemPrompt, userPrompt, stream = true } = req.body;

    if (!stream) {
      const reply = await askDeepSeekOnce(systemPrompt, userPrompt);
      return res.json({ reply });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    await askDeepSeek(systemPrompt, userPrompt, (token: string) => {
      res.write(`data:${token}\n\n`);
    });

    res.end();

  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
