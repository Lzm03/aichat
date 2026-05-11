import express from "express";
import type { Request, Response } from "express";
import fetch from "node-fetch";
import { createRequire } from "module";
import multer from "multer";
import crypto from "crypto";
import { pool } from "../db.ts";
import {
  assertUserCanSpend,
  consumeUserCredits,
  ensurePlatformTables,
  ensureFeatureAvailable,
  getAuthUser,
  getBearerToken,
  recordFeatureUsage,
  verifyToken,
  findUserById,
  requireAuth,
} from "../lib/platform-auth.ts";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const AdmZip = require("adm-zip");
const MAX_FILE_PROMPT_CHARS = 18000;

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

type TeachingTaskType = "email";
type TeachingSessionRow = {
  id: string;
  user_id: string;
  bot_id: string;
  task_type: TeachingTaskType;
  mode: string;
  step_index: number;
  total_steps: number;
  last_student_draft?: string | null;
  last_feedback_json?: any;
};

const EMAIL_STEPS = [
  "挑選主題與情境",
  "主題（Subject）",
  "稱呼（Salutation）",
  "正文第一句（開門見山）",
  "正文細節（原因或具體內容）",
  "祝頌語（Closing）",
  "署名（Signature）",
];

const EMAIL_CATEGORIES = ["請求信", "請假信", "感謝信", "邀請信", "道歉信"] as const;

const EMAIL_SCENARIOS: Record<(typeof EMAIL_CATEGORIES)[number], string[]> = {
  "請求信": [
    "向校長申請在閱讀日舉辦「睡衣故事派對」",
    "向圖書館老師申請延長借閱冷知識圖書一星期",
    "向動物園申請參觀大熊貓保育區",
    "向班主任申請在小息設立交換貼紙角",
  ],
  "請假信": [
    "因要參加表姐的婚禮而請假半天",
    "因牙科覆診而請假一天",
    "因發燒需要在家休息兩天",
    "因參加校外朗誦比賽而請假一天",
  ],
  "感謝信": [
    "感謝老師在你比賽失手後一直鼓勵你",
    "感謝圖書館姐姐幫你找回遺失的作業簿",
    "感謝校工叔叔在下雨天借你雨傘",
    "感謝同學在科學展覽前幫你完成模型",
  ],
  "邀請信": [
    "邀請校長出席班上的小小發明展",
    "邀請表姐參加你的生日野餐會",
    "邀請圖書館老師擔任故事比賽評判",
    "邀請同學參加周末的觀星活動",
  ],
  "道歉信": [
    "向老師道歉，因為你忘了交功課",
    "向同學道歉，因為借了文具後沒有準時歸還",
    "向鄰居道歉，因為踢球時不小心弄髒了窗戶",
    "向圖書館道歉，因為把借來的書弄皺了",
  ],
};

type EmailTeachingState = {
  category?: (typeof EMAIL_CATEGORIES)[number];
  scenario?: string;
  lastScenario?: string;
  studentParts?: Record<string, string>;
};

function getTaskSteps(): string[] {
  return EMAIL_STEPS;
}

function inferTeachingTask(prompt: string): TeachingTaskType | null {
  if (/郵件|邮件|email|電郵/i.test(prompt)) return "email";
  return null;
}

function shouldStartTeaching(prompt: string): boolean {
  const hasTeachingIntent = /教我寫|教我写|一步一步教我|帶我寫|带我写|教我点寫|教我怎麼寫|教我怎么写|幫我寫|帮我写/i.test(prompt);
  const isEmailOnly = /郵件|邮件|email|電郵/i.test(prompt);
  return hasTeachingIntent && isEmailOnly;
}

function isExitCommand(text: string): boolean {
  return /^(退出引導|退出教学|結束引導|exit guide)$/i.test(text.trim());
}

function isExampleCommand(text: string): boolean {
  return /^(示例|給我示例|给我示例|example)$/i.test(text.trim());
}

function isRepeatCommand(text: string): boolean {
  return /^(重複|重複這一步|repeat)$/i.test(text.trim());
}

function isNextCommand(text: string): boolean {
  return /^(下一步|next)$/i.test(text.trim());
}

async function getActiveTeachingSession(userId: string, botId: string): Promise<TeachingSessionRow | null> {
  const result = await pool.query(
    `SELECT * FROM teaching_sessions WHERE user_id=$1 AND bot_id=$2 AND mode IN ('guiding','waiting_student','feedback','paused') ORDER BY updated_at DESC LIMIT 1`,
    [userId, botId]
  );
  return (result.rows[0] as TeachingSessionRow) || null;
}

async function startTeachingSession(userId: string, botId: string, taskType: TeachingTaskType) {
  await pool.query(`UPDATE teaching_sessions SET mode='aborted', updated_at=NOW() WHERE user_id=$1 AND bot_id=$2 AND mode IN ('guiding','waiting_student','feedback','paused')`, [userId, botId]);
  const steps = getTaskSteps();
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO teaching_sessions (id, user_id, bot_id, task_type, mode, step_index, total_steps, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'guiding',1,$5,NOW(),NOW())`,
    [id, userId, botId, taskType, steps.length]
  );
  return { id, stepIndex: 1, totalSteps: steps.length, taskType };
}

function getTeachingState(session?: Partial<TeachingSessionRow> | null): EmailTeachingState {
  const raw = session?.last_feedback_json;
  if (raw && typeof raw === "object" && raw.teachingState && typeof raw.teachingState === "object") {
    return raw.teachingState as EmailTeachingState;
  }
  return {};
}

function detectCategory(text: string): (typeof EMAIL_CATEGORIES)[number] | null {
  const normalized = text.trim();
  if (/^(1|請求|請求信)$/.test(normalized)) return "請求信";
  if (/^(2|請假|請假信)$/.test(normalized)) return "請假信";
  if (/^(3|感謝|感謝信)$/.test(normalized)) return "感謝信";
  if (/^(4|邀請|邀請信)$/.test(normalized)) return "邀請信";
  if (/^(5|道歉|道歉信)$/.test(normalized)) return "道歉信";
  return EMAIL_CATEGORIES.find((item) => normalized.includes(item.replace("信", "")) || normalized.includes(item)) || null;
}

function pickScenario(category: (typeof EMAIL_CATEGORIES)[number], lastScenario?: string) {
  const pool = EMAIL_SCENARIOS[category].filter((item) => item !== lastScenario);
  const source = pool.length > 0 ? pool : EMAIL_SCENARIOS[category];
  return source[Math.floor(Math.random() * source.length)];
}

function buildInitialTeachingIntro() {
  return [
    "Step 1/7（郵件）",
    "你好！我是你的中文電郵導師。寫電郵像玩拼圖，我們一步步拼出完整電郵！",
    "先選一個數字，我會變出超酷情境：",
    "1. 請求信",
    "2. 請假信",
    "3. 感謝信",
    "4. 邀請信",
    "5. 道歉信",
    "你想練習哪一個呢？",
  ].join("\n");
}

function buildTeachingGuide(stepIndex: number, mode: "step" | "example", state: EmailTeachingState = {}) {
  const scenarioLine = state.category && state.scenario ? `情境：${state.category} - ${state.scenario}` : "";

  if (stepIndex === 1) {
    return buildInitialTeachingIntro();
  }

  if (mode === "example") {
    if (stepIndex === 2) {
      return [
        `Step ${stepIndex}`,
        scenarioLine,
        "我們這一步先來寫主題。",
        "你可以用「目的 + 班別姓名」這個方式來想。",
        "例如：請假申請 5A 陳小明",
        "你也試着寫一個主題吧。",
      ].filter(Boolean).join("\n");
    }
    if (stepIndex === 3) {
      return [
        `Step ${stepIndex}`,
        scenarioLine,
        "這一步我們來寫稱呼。",
        "例如：陳主任：林老師：王小文同學：",
        "記得稱呼後面要用冒號。",
      ].filter(Boolean).join("\n");
    }
    if (stepIndex === 4) {
      return [
        `Step ${stepIndex}`,
        scenarioLine,
        "這一步先寫正文的第一句。",
        "例子：我寫這封電郵，是想向您請假一天。",
      ].filter(Boolean).join("\n");
    }
    if (stepIndex === 5) {
      return [
        `Step ${stepIndex}`,
        scenarioLine,
        "這一步補充原因或細節。",
        "例子：因為我當天要到牙科診所覆診，所以未能回校上課。",
      ].filter(Boolean).join("\n");
    }
    if (stepIndex === 6) {
      return [
        `Step ${stepIndex}`,
        scenarioLine,
        "這一步來選一個合適的祝頌語。",
        "例子：祝 教安 / 祝 身體健康 / 祝 學業進步",
      ].filter(Boolean).join("\n");
    }
    if (stepIndex === 7) {
      return [
        `Step ${stepIndex}`,
        scenarioLine,
        "最後一步是署名。",
        "例子：學生 / 5A 陳小明",
        "你的署名要放在祝頌語下面。",
      ].filter(Boolean).join("\n");
    }
  }

  const stepBodyMap: Record<number, string[]> = {
    2: [
      "我們這次先把主題定好。",
      "你可以按照「目的 + 班別姓名」來寫。",
      "先寫主題就可以，不用寫其他部分。",
    ],
    3: [
      "現在來寫稱呼。",
      "可選：林老師：/ 王校長：/ 親愛的小明：",
      "記得稱呼後一定要用冒號（：）。",
      "這一步只寫稱呼就可以。",
    ],
    4: [
      "現在來寫正文的第一句。",
      "直接說出你寫這封電郵的目的就可以。",
      "這一步只寫 1 句。",
    ],
    5: [
      "現在補上原因或細節。",
      "請再寫 1 至 2 句，讓內容更完整。",
      "記得要貼合這個情境。",
    ],
    6: [
      "現在來寫祝頌語。",
      "可選：祝 教安 / 祝 工作愉快 / 祝 生活愉快",
      "教安：給老師；工作愉快：給大人；生活愉快：通用。",
      "這一步只寫祝頌語就可以。",
    ],
    7: [
      "最後我們來寫署名。",
      "格式：自稱 + 姓名 + 末啟詞（如：學生 陳小明 敬上）。",
      "這一步只寫署名部分。",
    ],
  };

  return [
    `Step ${stepIndex}`,
    scenarioLine,
    ...(stepBodyMap[stepIndex] || []),
  ].filter(Boolean).join("\n");
}

async function askDeepSeek(systemPrompt: string, userPrompt: string, onToken: (token: string) => void) {
  const requestBody = {
    model: "deepseek-chat",
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  const r = await fetchDeepSeekWithRetry(requestBody);

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

async function askDeepSeekOnce(systemPrompt: string, userPrompt: string): Promise<string> {
  const r = await fetchDeepSeekWithRetry({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  if (!r.ok) throw new Error((await r.text()) || "DeepSeek request failed");
  const data: any = await r.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function fetchDeepSeekWithRetry(body: Record<string, unknown>, retries = 2) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok && response.status >= 500 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error;
      const code = String(error?.code || "");
      const shouldRetry =
        attempt < retries &&
        (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED");

      if (!shouldRetry) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("DeepSeek request failed");
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text.trim();
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    );
}

function extractTextFromDocxBuffer(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) {
    throw new Error("DOCX 內容讀取失敗");
  }

  const xml = entry.getData().toString("utf-8");
  const text = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<w:cr\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  return decodeXmlEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

async function extractTextFromUploadedFile(file: Express.Multer.File): Promise<string> {
  const lowerName = String(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
    return extractTextFromPDF(file.buffer);
  }
  if (
    lowerName.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractTextFromDocxBuffer(file.buffer);
  }
  if (lowerName.endsWith(".doc") || mimeType === "application/msword") {
    throw new Error("目前線上環境僅支援 PDF 與 DOCX，舊版 DOC 請先另存為 DOCX 再上傳");
  }

  throw new Error(`不支援的文件格式：${file.originalname || "unknown"}`);
}

function extractTextFromHtml(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return noScript.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

async function resolveChatActor(req: Request, sharedBotId?: string) {
  const token = getBearerToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload?.sub) {
    const user = await findUserById(payload.sub);
    if (user) {
      return { user, shared: false as const };
    }
  }

  const normalizedBotId = String(sharedBotId || "").trim();
  if (!normalizedBotId) {
    const error = new Error("missing bearer token");
    (error as any).status = 401;
    throw error;
  }

  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT owner_id
     FROM bots
     WHERE id=$1
       AND is_visible=true
       AND owner_id IS NOT NULL
     LIMIT 1`,
    [normalizedBotId]
  );
  const ownerId = String(result.rows[0]?.owner_id || "").trim();
  if (!ownerId) {
    const error = new Error("shared bot not found");
    (error as any).status = 404;
    throw error;
  }

  const user = await findUserById(ownerId);
  if (!user) {
    const error = new Error("shared bot owner not found");
    (error as any).status = 404;
    throw error;
  }

  return { user, shared: true as const };
}

async function evaluateStudentDraft(session: TeachingSessionRow, draft: string) {
  const state = getTeachingState(session);
  const stepGoal = EMAIL_STEPS[session.step_index - 1] || "";
  const evalSystem = `你是一位專業、有耐心的中文電郵導師。你採用支架式教學法，只能評估當前這一步，不能跳到下一個部分。請用繁體中文，只輸出 JSON，不要 markdown。回饋要像老師當下改作業一樣自然、直接、簡潔，只談這份草稿本身，不要評論「符合小學生程度」「大家一看就知道」這類泛泛描述。請優先指出內容是否清楚、是否貼合情境、標點或格式是否正確；如果沒有問題，就不用特地提格式。`;
  const evalUser = `請評估學生在「中文電郵寫作引導」中的本步草稿。
目前步驟:${session.step_index}/${session.total_steps}
步驟目標:${stepGoal}
電郵類別:${state.category || "未選擇"}
情境:${state.scenario || "未設定"}
學生草稿:
${draft}

輸出 JSON:
{
  "good": ["..."],
  "improve": ["..."],
  "nextAction": "...",
  "pass": true
}`;
  const raw = await askDeepSeekOnce(evalSystem, evalUser);
  try {
    const parsed = JSON.parse(raw);
    return {
      good: Array.isArray(parsed?.good) ? parsed.good.slice(0, 3) : [],
      improve: Array.isArray(parsed?.improve) ? parsed.improve.slice(0, 3) : [],
      nextAction: String(parsed?.nextAction || "請根據建議修改後再貼一次。"),
      pass: Boolean(parsed?.pass),
    };
  } catch {
    return {
      good: ["你已經提供了本步草稿。"],
      improve: ["可再明確本步重點與語句。"],
      nextAction: "請按本步目標修改後再貼一次。",
      pass: false,
    };
  }
}

router.post("/ask-file", requireAuth, upload.any(), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    await assertUserCanSpend(authUser!.id, 4);
    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter(Boolean);
    if (!files.length) return res.status(400).json({ error: "缺少文件" });

    const extractedParts = await Promise.all(
      files.map(async (file) => {
        const text = await extractTextFromUploadedFile(file);
        return {
          fileName: file.originalname,
          extractedText: text.trim(),
        };
      })
    );

    const nonEmptyParts = extractedParts.filter((part) => part.extractedText);
    if (!nonEmptyParts.length) {
      return res.json({ reply: "（文件沒有可解析文字）" });
    }

    const combinedText = nonEmptyParts
      .map((part) => `【文件：${part.fileName}】\n${part.extractedText}`)
      .join("\n\n")
      .trim();
    const normalizedPromptText = combinedText.slice(0, MAX_FILE_PROMPT_CHARS);
    const systemPrompt: string = (req.body as any)?.systemPrompt || "";
    const reply = await askDeepSeekOnce(systemPrompt, normalizedPromptText);
    await consumeUserCredits(authUser!.id, "ask_file", 4, {
      fileNames: files.map((file) => file.originalname),
      extractedLength: normalizedPromptText.length,
      fileCount: files.length,
    });
    return res.json({
      reply,
      extractedText: normalizedPromptText,
      files: nonEmptyParts.map((part) => ({
        fileName: part.fileName,
        extractedLength: part.extractedText.length,
      })),
    });
  } catch (err: any) {
    console.error("❌ 文件解析錯誤:", err);
    const code = String(err?.code || "");
    const isNetworkReset =
      code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED";
    res.status(err?.status || 500).json({
      error: isNetworkReset
        ? "文件文字已提取，但 AI 解析服務連線中斷，請稍後重試。"
        : err.message,
      detail: err?.message || "unknown error",
      code: code || undefined,
    });
  }
});

router.post("/ask-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    await assertUserCanSpend(authUser!.id, 2);
    const { systemPrompt = "", url = "" } = req.body as any;
    if (!url || typeof url !== "string") return res.status(400).json({ error: "缺少網址" });
    const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const pageRes = await fetch(targetUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Bot/1.0)" } });
    if (!pageRes.ok) return res.status(400).json({ error: `網址抓取失敗：${pageRes.status}` });
    const html = await pageRes.text();
    const pageText = extractTextFromHtml(html).slice(0, 18000);
    if (!pageText) return res.status(400).json({ error: "網址內容無可解析文字" });
    const reply = await askDeepSeekOnce(systemPrompt, pageText);
    await consumeUserCredits(authUser!.id, "ask_url", 2, { url: targetUrl });
    return res.json({ reply, extractedText: pageText, sourceUrl: targetUrl });
  } catch (err: any) {
    console.error("❌ URL 解析錯誤:", err);
    return res.status(err?.status || 500).json({ error: err.message });
  }
});

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { systemPrompt = "", userPrompt = "", stream = true, usageType = "general", botId = "default", sharedBotId = "" } = req.body || {};
    const actor = await resolveChatActor(req, String(sharedBotId || ""));
    const authUser = actor.user;
    await assertUserCanSpend(authUser.id, 1);
    if (usageType === "chat_message") await ensureFeatureAvailable(authUser.id, "chat_messages", 1);

    const normalized = String(userPrompt || "").trim();
    const normalizedBotId = String(botId || "default");
    const active = actor.shared ? null : await getActiveTeachingSession(authUser.id, normalizedBotId);

    if (shouldStartTeaching(normalized)) {
      if (actor.shared) {
        return res.json({ reply: "分享聊天目前不支援引導教學模式。", teachingMode: false });
      }
      const taskType = inferTeachingTask(normalized) || "email";
      const created = await startTeachingSession(authUser.id, normalizedBotId, taskType);
      return res.json({ reply: buildTeachingGuide(1, "step"), teachingMode: true, stepIndex: 1, totalSteps: created.totalSteps, taskType: created.taskType });
    }

    if (active) {
      if (active && isExitCommand(normalized)) {
        await pool.query(`UPDATE teaching_sessions SET mode='aborted', updated_at=NOW() WHERE id=$1`, [active.id]);
        return res.json({ reply: "已退出引導模式，現在回到一般聊天模式。", teachingMode: false });
      }
      const session = active;
      const teachingState = getTeachingState(session);

      if (isExampleCommand(normalized)) {
        return res.json({ reply: buildTeachingGuide(session.step_index, "example", teachingState), teachingMode: true, stepIndex: session.step_index, totalSteps: session.total_steps, taskType: session.task_type });
      }
      if (isRepeatCommand(normalized)) {
        return res.json({ reply: buildTeachingGuide(session.step_index, "step", teachingState), teachingMode: true, stepIndex: session.step_index, totalSteps: session.total_steps, taskType: session.task_type });
      }
      if (isNextCommand(normalized)) {
        const savedParts = teachingState.studentParts || {};
        const currentPart = savedParts[String(session.step_index)]?.trim();
        if (session.step_index >= 2 && !currentPart) {
          const hintMap: Record<number, string> = {
            2: "例如：請假申請 5A 陳小明",
            3: "例如：林老師：",
            4: "例如：我寫這封電郵，是想向您請假一天。",
            5: "例如：因為我要到醫院覆診，未能回校上課。",
            6: "例如：祝 教安",
            7: "例如：學生 陳小明 敬上",
          };
          return res.json({
            reply: `先別急著跳步，你這一步還沒寫內容喔！你可以先試試：${hintMap[session.step_index] || "先寫這一步內容"}`,
            teachingMode: true,
            stepIndex: session.step_index,
            totalSteps: session.total_steps,
            taskType: session.task_type,
          });
        }
        const nextStep = session.step_index + 1;
        if (nextStep > session.total_steps) {
          await pool.query(`UPDATE teaching_sessions SET mode='completed', step_index=$2, updated_at=NOW() WHERE id=$1`, [session.id, session.total_steps]);
          const state = getTeachingState(session);
          const parts = state.studentParts || {};
          const finalTemplate = [
            "太好了！你已完成這次中文電郵練習！",
            "拼圖完成，這是你的完整電郵：",
            `主題：${parts["2"] || ""}`,
            `${parts["3"] || ""}`,
            `${parts["4"] || ""}`,
            `${parts["5"] || ""}`,
            `${parts["6"] || ""}`,
            `${parts["7"] || ""}`,
            "",
            "超有創意！格式也越來越穩了！",
          ].join("\n");
          return res.json({ reply: finalTemplate, teachingMode: false });
        }
        await pool.query(`UPDATE teaching_sessions SET step_index=$2, mode='guiding', updated_at=NOW() WHERE id=$1`, [session.id, nextStep]);
        return res.json({ reply: buildTeachingGuide(nextStep, "step", teachingState), teachingMode: true, stepIndex: nextStep, totalSteps: session.total_steps, taskType: session.task_type });
      }

      if (session.step_index === 1) {
        const category = detectCategory(normalized);
        if (!category) {
          return res.json({
            reply: "Step 1/7（郵件）\n請先從 5 個類別中選 1 個：\n1. 請求信\n2. 請假信\n3. 感謝信\n4. 邀請信\n5. 道歉信\n你可以直接輸入數字，或輸入類別名稱。",
            teachingMode: true,
            stepIndex: 1,
            totalSteps: session.total_steps,
            taskType: session.task_type,
          });
        }
        const scenario = pickScenario(category, teachingState.lastScenario);
        const nextState: EmailTeachingState = {
          category,
          scenario,
          lastScenario: scenario,
          studentParts: teachingState.studentParts || {},
        };
        await pool.query(
          `UPDATE teaching_sessions SET step_index=2, mode='guiding', last_student_draft=$2, last_feedback_json=$3::jsonb, updated_at=NOW() WHERE id=$1`,
          [
            session.id,
            normalized,
            JSON.stringify({
              teachingState: nextState,
              good: [`你已選好類別：${category}`],
              improve: [],
              nextAction: "請先寫主題。",
              pass: true,
            }),
          ]
        );
        const reply = [
          "Step 1/7（郵件）",
          `你選的是「${category}」。`,
          `我為你準備的情境是：${scenario}。`,
          "接下來我們只做「主題」這一小步。",
          "",
          buildTeachingGuide(2, "step", nextState),
        ].join("\n");
        return res.json({ reply, teachingMode: true, stepIndex: 2, totalSteps: session.total_steps, taskType: session.task_type });
      }

      const evaluation = await evaluateStudentDraft(session, normalized);
      const nextTeachingState: EmailTeachingState = {
        ...teachingState,
        studentParts: {
          ...(teachingState.studentParts || {}),
          [String(session.step_index)]: normalized,
        },
      };
      await pool.query(
        `UPDATE teaching_sessions SET mode='feedback', last_student_draft=$2, last_feedback_json=$3::jsonb, updated_at=NOW() WHERE id=$1`,
        [session.id, normalized, JSON.stringify({ ...evaluation, teachingState: nextTeachingState })]
      );
      const composed = [
        `Step ${session.step_index}/${session.total_steps} 評估`,
        ...(evaluation.good || []),
        ...(evaluation.improve || []),
        evaluation.nextAction || "請按這一步的要求再試一次。",
      ].join("\n");
      return res.json({ reply: composed, teachingMode: true, stepIndex: session.step_index, totalSteps: session.total_steps, taskType: session.task_type, evaluation });
    }

    if (!stream) {
      const reply = await askDeepSeekOnce(systemPrompt, normalized);
      if (usageType === "chat_message") await recordFeatureUsage(authUser.id, "chat_messages", 1, { usageType, source: actor.shared ? "shared_bot" : "direct" });
      await consumeUserCredits(authUser.id, "ask", 1, { streaming: false, promptLength: normalized.length, source: actor.shared ? "shared_bot" : "direct" });
      return res.json({ reply, teachingMode: false });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    await askDeepSeek(systemPrompt, normalized, (token: string) => {
      res.write(`data:${token}\n\n`);
    });
    if (usageType === "chat_message") await recordFeatureUsage(authUser.id, "chat_messages", 1, { usageType, source: actor.shared ? "shared_bot" : "direct" });
    await consumeUserCredits(authUser.id, "ask", 1, { streaming: true, promptLength: normalized.length, source: actor.shared ? "shared_bot" : "direct" });
    res.end();
  } catch (err: any) {
    console.error(err);
    res.status(err?.status || 500).json({ error: err.message });
  }
});

export default router;
