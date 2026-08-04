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
import {
  createConversation,
  getConversationForUser,
  listConversationMessages,
  mapConversationRow,
  saveConversationMessage,
  updateConversationPreview,
  updateConversationTopic,
  updateConversationTitleFromFirstMessage,
} from "../lib/conversations.ts";
import {
  CharacterTopicError,
  composeCharacterTopicPrompt,
  getAccessibleCharacter,
  resolveCharacterTopic,
} from "../lib/character-topics.ts";
import {
  buildChatReplyLanguageRule,
  buildChatSystemPrompt,
} from "../../utils/chat-prompt.ts";
import {
  getAI,
  getVertexAccessToken,
  getVertexAIConfig,
  isVertexAIEnabled,
} from "../lib/gemini-server.ts";
const isDebugLogEnabled = process.env.LOG_LEVEL === "debug";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const AdmZip = require("adm-zip");
const WordExtractor = require("word-extractor");
const MAX_FILE_PROMPT_CHARS = 18000;
const MAX_CHAT_IMAGE_COUNT = 4;

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const MOCK_UPSTREAM = /^(1|true|yes|on)$/i.test(String(process.env.MOCK_UPSTREAM || "").trim());
const ENABLE_DIALOGUE_SUGGESTION_LLM = !/^(0|false|no|off)$/i.test(String(process.env.ENABLE_DIALOGUE_SUGGESTION_LLM || "true").trim());

function isModoIntegrationRequest(req: Request) {
  const expected = String(process.env.MODO_INTEGRATION_TOKEN || "").trim();
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function maybeMockModelReply(userPrompt: string): Promise<string | null> {
  if (!MOCK_UPSTREAM) return null;
  const delayMs = randomInt(
    Number(process.env.MOCK_UPSTREAM_MIN_DELAY_MS || 300),
    Number(process.env.MOCK_UPSTREAM_MAX_DELAY_MS || 3000)
  );
  const failureRate = Math.max(0, Math.min(1, Number(process.env.MOCK_UPSTREAM_FAILURE_RATE || 0.03)));
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (Math.random() < failureRate) {
    throw new Error("Mock upstream timeout");
  }
  return `mock-reply(${delayMs}ms): ${String(userPrompt || "").slice(0, 120)}`;
}

type TeachingTaskType = "email";
type ChatImageInput = {
  mimeType: string;
  data: string;
};
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

function extractChatImages(req: Request): ChatImageInput[] {
  const files = ((req.files as Express.Multer.File[] | undefined) || []).filter(Boolean);
  return files
    .filter((file) => String(file.mimetype || "").startsWith("image/"))
    .slice(0, MAX_CHAT_IMAGE_COUNT)
    .map((file) => ({
      mimeType: file.mimetype,
      data: file.buffer.toString("base64"),
    }));
}

type ChatModelProvider = "deepseek" | "gemini";
type SuggestedReply = {
  tier: "L1" | "L2" | "L3";
  label: string;
  text: string;
  sendText: string;
};

type DialogueQuestionType =
  | "specific_fact_lookup"
  | "choice_or_judgment"
  | "change_comparison"
  | "reason_explanation"
  | "style_or_symbol"
  | "general_reflection";

type RecentChatMessage = {
  role: "user" | "bot";
  content: string;
};

function normalizeChatModelProvider(input: unknown): ChatModelProvider {
  return String(input || "").trim().toLowerCase() === "gemini" ? "gemini" : "deepseek";
}

function getDialogueEnhancementProvider(fallbackProvider: ChatModelProvider): ChatModelProvider {
  const configured = normalizeChatModelProvider(process.env.DIALOGUE_HINT_MODEL_PROVIDER || "deepseek");
  return configured || fallbackProvider;
}

function sanitizeChatHistoryContent(input: string) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildContextualUserPrompt(userPrompt: string, recentMessages: RecentChatMessage[]) {
  const normalizedPrompt = String(userPrompt || "").trim();
  if (!recentMessages.length) return normalizedPrompt;
  const transcript = recentMessages
    .map((message) => `${message.role === "user" ? "學生" : "老師"}：${sanitizeChatHistoryContent(message.content)}`)
    .filter(Boolean)
    .join("\n");
  if (!transcript) return normalizedPrompt;
  return [
    "以下是最近對話，請延續上下文作答；若學生已回應上一個問題，請自然進入下一個問題；若未回應，也不要機械式重複同一句追問。",
    transcript,
    "",
    `學生最新一句：${normalizedPrompt}`,
  ].join("\n");
}

function normalizeStreamFlag(input: unknown): boolean {
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    return normalized !== "false" && normalized !== "0" && normalized !== "";
  }
  return Boolean(input);
}

function clampChinesePhrase(input: string, maxLength = 10) {
  const withWordSpaces = String(input || "")
    .replace(/[「」『』"'`]/g, "")
    .replace(/[，。！？；：、,.!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const containsLatinWords = /[A-Za-z]/.test(withWordSpaces);
  const cleaned = containsLatinWords ? withWordSpaces : withWordSpaces.replace(/\s+/g, "");
  if (containsLatinWords) return cleaned.slice(0, Math.max(maxLength * 4, 72)).trim();
  return cleaned.slice(0, maxLength);
}

function extractDialogueKnowledgePoints(systemPrompt: string) {
  const raw = String(systemPrompt || "");
  const compiledPointsMatch = raw.match(/Target_Knowledge_Points\s*\n([\s\S]*?)(?:\n\s*2\.\s*Activated_Points|\n# |\s*$)/i);
  if (compiledPointsMatch?.[1]) {
    try {
      const jsonBlock = compiledPointsMatch[1].match(/\[[\s\S]*\]/)?.[0] || compiledPointsMatch[1].trim();
      const parsed = JSON.parse(jsonBlock);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .map((item: any) => ({
            tier: String(item?.tier || "").includes("L2") || String(item?.tier || "").includes("L3")
              ? "deep_understanding"
              : "basic_fact",
            content: String(item?.content || item?.title || "").trim(),
            keywords: Array.isArray(item?.keywords) ? item.keywords.map((k: any) => String(k).trim()).filter(Boolean) : [],
          }))
          .filter((item) => item.content);
      }
    } catch {
      // fall through to legacy parsing
    }
  }

  const pointsMatch = raw.match(/【知識點分級】([\s\S]*?)(?:【角色對話策略】|請根據|【安全|$)/);
  let parsed: any[] = [];
  if (pointsMatch?.[1]) {
    try {
      const jsonBlock = pointsMatch[1].match(/\[[\s\S]*\]/)?.[0] || pointsMatch[1].trim();
      parsed = JSON.parse(jsonBlock);
    } catch {
      parsed = [];
    }
  }

  if (Array.isArray(parsed) && parsed.length) {
    return parsed
      .map((item) => ({
        tier: String(item?.tier || "").includes("deep") ? "deep_understanding" : "basic_fact",
        content: String(item?.content || item?.title || "").trim(),
        keywords: Array.isArray(item?.keywords) ? item.keywords.map((k: any) => String(k).trim()).filter(Boolean) : [],
      }))
      .filter((item) => item.content);
  }

  const summaryMatch = raw.match(/【人物知識庫摘要】([\s\S]*?)(?:【知識點分級】|【角色對話策略】|請根據|$)/);
  const fallbackSource = summaryMatch?.[1]
    ? String(summaryMatch[1])
    : raw
        .replace(/#\s+[^\n]+\n/g, "\n")
        .replace(/\[[^\]]+\]/g, " ")
        .replace(/^\s*-\s*(Name|Core Mission|Inner Monologue|Core Attitudes|Background & Traits|Sentence Length & Rhythm|Forbidden & Preferred Words|Unique Response Triggers|Unknown Boundary Logic|Closing Ritual|Multiple Hooks):.*$/gim, "")
        .replace(/^\s*\d+\.\s*(Target_Knowledge_Points|Activated_Points|Chat_History)\s*$/gim, "");
  const lines = String(fallbackSource)
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter((line) => line.length > 3 && !/^【.+】$/.test(line) && !/^#/.test(line) && !/^Role\s*&\s*Persona$/i.test(line))
    .slice(0, 8);
  return lines.map((content, index) => ({
    tier: index < 4 ? "basic_fact" : "deep_understanding",
    content,
    keywords: [],
  }));
}

function pickDialogueKnowledgePoint(systemPrompt: string, userPrompt: string, reply: string) {
  const points = extractDialogueKnowledgePoints(systemPrompt);
  if (!points.length) return null;
  const context = `${userPrompt} ${reply}`;
  const scored = points.map((point, index) => {
    const topic = point.content;
    const keywords = [topic, ...point.keywords].map((item) => clampChinesePhrase(item, 8)).filter(Boolean);
    const score = keywords.reduce((sum, keyword) => sum + (keyword && context.includes(keyword) ? 2 : 0), 0);
    return { point, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.point || points[0];
}

function pickDialogueKnowledgePointForQuestion(systemPrompt: string, question: string, reply: string) {
  return pickDialogueKnowledgePoint(systemPrompt, question, `${question}\n${reply}`);
}

function inferDialogueQuestionType(question: string): DialogueQuestionType {
  const q = String(question || "");
  if (/(邊齣|哪齣|哪一齣|咩戲|什麼戲|知唔知|知道.*嗎|叫咩|叫什麼|係咩|是什麼)/.test(q)) {
    return "specific_fact_lookup";
  }
  if (/(係因為|是因為|定係|還是|或者|會唔會|是不是|係咪|你覺得.*還是|你覺得.*定)/.test(q)) {
    return "choice_or_judgment";
  }
  if (/(以前同依家|以前和現在|前後|變化|唔同|不同|改變)/.test(q)) {
    return "change_comparison";
  }
  if (/(點解|為什麼|原因|因為咩|為何)/.test(q)) {
    return "reason_explanation";
  }
  if (/(象徵|符號|意象|風格|設計|紅梅|花|顏色|代表)/.test(q)) {
    return "style_or_symbol";
  }
  return "general_reflection";
}

function describeDialogueQuestionType(type: DialogueQuestionType) {
  switch (type) {
    case "specific_fact_lookup":
      return "具體事實題：L1 必須給出知識庫中的具體答案，例如劇名、人物、地點或名稱；L2 解釋它和問題的關係；L3 才做象徵或生活連結。";
    case "choice_or_judgment":
      return "選擇/判斷題：L1 必須選一邊或給出最直接判斷；L2 說原因；L3 連到更一般的價值或生活例子。";
    case "change_comparison":
      return "變化比較題：L1 說出一個具體變化；L2 說為什麼會變或前後差異；L3 連到今天生活中的相似變化。";
    case "reason_explanation":
      return "原因解釋題：L1 給一個簡單原因；L2 補充脈絡或影響；L3 連到現代或個人經驗。";
    case "style_or_symbol":
      return "風格/象徵題：L1 說出具體象徵物、風格或觀察；L2 解釋它代表什麼；L3 連到作品如何用符號表達人物或情感。";
    default:
      return "一般思考題：L1 直接回答；L2 說原因或關聯；L3 連到生活或價值遷移。";
  }
}

function compactForMatch(input: string) {
  return String(input || "")
    .replace(/[「」『』"'`《》？?。！!，,、：:\s]/g, "")
    .trim();
}

function extractChoiceOptions(question: string) {
  const cleaned = String(question || "")
    .replace(/[？?]/g, "")
    .replace(/^(你覺得|你認為|咁你覺得|咁你認為|你估|咁你估吓|咁你估)/, "")
    .trim();
  const match = cleaned.match(/(.+?)(?:，|,)?(?:定係|還是|或者)(.+)$/);
  if (!match) return [];
  return [match[1], match[2]]
    .map((item) =>
      item
        .replace(/^(係因為|是因為|係|是)/, "")
        .replace(/^(我|你|佢|它|呢個|這個)/, "")
        .trim()
    )
    .filter((item) => compactForMatch(item).length >= 2)
    .slice(0, 2);
}

function extractQuestionKeywords(question: string) {
  const choiceOptions = extractChoiceOptions(question);
  const source = choiceOptions.length ? choiceOptions.join(" ") : question;
  const candidates = source
    .replace(/[？?。！!，,、：:]/g, " ")
    .split(/\s+/)
    .flatMap((part) => part.split(/(?:係|是|因為|定係|還是|或者|有冇|會唔會|你覺得|你認為|咁|呢|嘅|的)/))
    .map((part) => compactForMatch(part))
    .filter((part) => part.length >= 2 && !/^(我|你|佢|它|這個|呢個|問題|答案|覺得|認為)$/.test(part));
  return Array.from(new Set(candidates)).slice(0, 8);
}

function includesAnyConcept(text: string, concepts: string[]) {
  const compactText = compactForMatch(text);
  return concepts.some((concept) => {
    const compactConcept = compactForMatch(concept);
    if (!compactConcept) return false;
    if (compactText.includes(compactConcept)) return true;
    return compactConcept.length > 4 && compactText.includes(compactConcept.slice(0, 4));
  });
}

function extractLastQuestion(text: string) {
  const normalized = String(text || "").replace(/\r/g, "").trim();
  const questionMatches = normalized.match(/[^。！？!?。\n]*[？?]/g);
  return questionMatches?.at(-1)?.trim() || "";
}

function isGenericSuggestedText(text: string) {
  const normalized = String(text || "").replace(/\s+/g, "").trim();
  if (!normalized) return true;
  return [
    "我覺得這是慢慢形成的",
    "這讓我想到現在的生活",
    "因為背後有更深原因",
    "可以連到現代生活",
    "和背後原因有關",
    "可比較前後變化",
    "這跟現在很像",
    "我覺得有",
    "我覺得會",
  ].includes(normalized);
}

function cleanSuggestionJson(raw: string) {
  const cleaned = String(raw || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

function normalizeSuggestedReplies(input: unknown, questionContext: string): SuggestedReply[] {
  if (!Array.isArray(input)) return [];
  const allowedTiers = new Set(["L1", "L2", "L3"]);
  return input
    .map((item: any, index) => {
      const tier = allowedTiers.has(String(item?.tier)) ? String(item.tier) as SuggestedReply["tier"] : (["L1", "L2", "L3"][index] as SuggestedReply["tier"]);
      const label =
        String(item?.label || "").trim() ||
        (tier === "L1" ? "基礎事實" : tier === "L2" ? "深入思考" : "價值遷移");
      const rawText = String(item?.text || "").replace(/[。！？!?]+$/g, "").trim();
      const text = clampChinesePhrase(rawText, 22);
      if (!text) return null;
      return {
        tier,
        label,
        text,
        sendText: String(item?.sendText || "").trim() || text,
      };
    })
    .filter(Boolean)
    .slice(0, 3) as SuggestedReply[];
}

function isQuestionSubstring(text: string, questionContext: string) {
  const normalizedText = String(text || "").replace(/\s+/g, "").trim();
  const normalizedQuestion = String(questionContext || "")
    .replace(/[？?。！!，,、\s]/g, "")
    .trim();
  return Boolean(normalizedText && normalizedQuestion.includes(normalizedText));
}

function l1ReplyLooksWeak(reply: SuggestedReply, questionContext: string) {
  if (reply.tier !== "L1") return false;
  const questionType = inferDialogueQuestionType(questionContext);
  const text = String(reply.text || "").trim();
  const compactText = text.replace(/\s+/g, "");
  if (!compactText) return true;
  if (isQuestionSubstring(compactText, questionContext) && compactText.length <= 10) return true;
  if (/^(你覺得|你認為|你估|咁你估|咁你估吓|咁你覺得|好似|例如|比如|譬如|我哋之前講到)/.test(text)) return true;
  if (/(稱呼|呢個稱呼|符號|問題|故事|內容)$/.test(compactText) && compactText.length <= 12) return true;

  if (questionType === "specific_fact_lookup") {
    const hasConcreteEntity = /(《[^》]+》|「[^」]+」|『[^』]+』|[A-Za-z0-9]|[一-龥]{2,}(花|戲|劇|曲|亭|園|廣場|稱|名|號|角色|人物)|叫|係|是|同)/.test(text);
    const hasAnswerRelation = /(係|是|叫|同|有關|關於|就係|就是|來自|出自)/.test(text);
    return !hasConcreteEntity || !hasAnswerRelation;
  }

  if (questionType === "choice_or_judgment") {
    const options = extractChoiceOptions(questionContext);
    const matchesOption = options.length ? includesAnyConcept(text, options) : true;
    return !matchesOption || !/(係|是|因為|我覺得|可能|似|唔係|不是|會|有|自然|演變|改變)/.test(text);
  }

  if (questionType === "reason_explanation") {
    return !/(因為|可能|由於|所以|係為咗|是為了)/.test(text);
  }

  if (questionType === "change_comparison") {
    return !/(唔同|不同|變|改|多咗|少咗|以前|而家|現在)/.test(text);
  }

  return compactText.length < 4;
}

function suggestedReplyLooksWeak(reply: SuggestedReply, questionContext: string) {
  const questionType = inferDialogueQuestionType(questionContext);
  const concepts = extractQuestionKeywords(questionContext);
  const normalizedQuestion = clampChinesePhrase(String(questionContext || "").replace(/[？?]/g, ""), 22);
  const normalizedText = clampChinesePhrase(String(reply?.text || ""), 22);
  const rawText = String(reply?.text || "").trim();
  if (l1ReplyLooksWeak(reply, questionContext)) return true;
  if (!normalizedText) return true;
  if (normalizedText === normalizedQuestion) return true;
  if (isGenericSuggestedText(normalizedText)) return true;
  if (/^(你覺得|你認為|你估|咁你估|咁你估吓|咁你覺得|好似|例如|比如|譬如|我哋之前講到)/.test(rawText)) return true;
  if (/(估吓|諗吓|睇吓).{0,8}$/.test(rawText)) return true;
  if (reply.tier === "L1" && rawText.length <= 5 && !/(係|是|有|會|因為|同|叫|關於|唔同|不同)/.test(rawText)) return true;
  if (
    questionType === "specific_fact_lookup" &&
    reply.tier === "L1" &&
    !/(《[^》]+》|「[^」]+」|『[^』]+』|[A-Za-z0-9]|花|戲|劇|曲|稱|名|叫|係|是|同)/.test(rawText)
  ) {
    return true;
  }
  if (
    questionType === "specific_fact_lookup" &&
    reply.tier === "L3" &&
    /(類似改變|好多地方|翻新|變新|現代生活|而家都會有類似)/.test(rawText)
  ) {
    return true;
  }
  if (
    questionType !== "change_comparison" &&
    /(後來嘅變化|類似改變|好多地方都翻新|變新咗|改建過)/.test(rawText)
  ) {
    return true;
  }
  if (reply.tier === "L2") {
    if (!/(因為|所以|可能|我估|我覺得|代表|反映|關係|脈絡|意思|象徵|演變|改變)/.test(rawText)) return true;
    if (concepts.length && !includesAnyConcept(rawText, concepts)) return true;
  }
  if (reply.tier === "L3") {
    if (/(現在生活|而家生活|相似例子)$/.test(rawText)) return true;
    if (!/(好似|令我諗到|而家|現在|作品|電影|粉絲|觀眾|稱呼|身份|符號|象徵|生活|例子)/.test(rawText)) return true;
    if (
      questionType === "choice_or_judgment" &&
      concepts.length &&
      !includesAnyConcept(rawText, concepts) &&
      !/(稱呼|身份|觀眾|粉絲|暱稱|叫法|認同|地位)/.test(rawText)
    ) {
      return true;
    }
  }
  return false;
}

async function repairL1WithModel(
  provider: ChatModelProvider,
  systemPrompt: string,
  questionContext: string,
  currentL1: SuggestedReply | undefined,
  topic: string,
  recentMessages: RecentChatMessage[]
) {
  const questionType = inferDialogueQuestionType(questionContext);
  const choiceOptions = extractChoiceOptions(questionContext);
  const prompt = [
    "你只需要修正 L1（基礎事實）提示回答。",
    "目前 L1 可能只是摘了題目中的名詞、像提問片段，或沒有真正回答 Bot 的問題。",
    `問題類型：${questionType}`,
    `題型要求：${describeDialogueQuestionType(questionType)}`,
    choiceOptions.length ? `可選項：${choiceOptions.join(" / ")}` : "",
    "要求：",
    "1. 只輸出一個 L1，必須是學生能直接點選發送的短答案。",
    "2. L1 必須直接回答 Bot 最後問題，不可以只摘出問題裡的名詞。",
    "3. 如果是具體事實題，L1 要給具體名稱、劇名、人物、地點或稱呼，並帶有基本關係詞，例如『同...有關』『係...』『叫...』。",
    "4. 如果是選擇/判斷題，L1 必須明確選其中一個選項，不能只說『我覺得會』。",
    "5. 每條只寫一句，8-18 個中文字為佳。",
    "只輸出 JSON：",
    '{"tier":"L1","label":"基礎事實","text":"短答案","sendText":"完整一點的學生答案"}',
    "",
    `角色與知識庫資料：${String(systemPrompt || "").slice(0, 4000)}`,
    `Bot 最後問題：${questionContext}`,
    `相關知識點：${topic || "未指定"}`,
    recentMessages.length
      ? `最近對話：\n${recentMessages.map((message) => `${message.role === "user" ? "學生" : "老師"}：${sanitizeChatHistoryContent(message.content)}`).join("\n")}`
      : "",
    `目前 L1：${JSON.stringify(currentL1 || null)}`,
  ].join("\n");

  const raw = await askModelOnce(
    provider,
    "你只負責輸出符合格式的 L1 教學建議答案 JSON，不扮演任何角色。",
    prompt
  );
  const parsed = JSON.parse(cleanSuggestionJson(raw));
  const repaired = normalizeSuggestedReplies([parsed], questionContext)[0];
  return repaired && !l1ReplyLooksWeak(repaired, questionContext) ? repaired : null;
}

async function repairSuggestedRepliesWithModel(
  provider: ChatModelProvider,
  systemPrompt: string,
  questionContext: string,
  originalReplies: SuggestedReply[],
  topic: string,
  recentMessages: RecentChatMessage[]
) {
  const questionType = inferDialogueQuestionType(questionContext);
  const choiceOptions = extractChoiceOptions(questionContext);
  const prompt = [
    "你現在要修正 3 個學生提示回答。",
    "下面有一些回答太像重複 bot 話術、太空泛、或不像真正答題。",
    "請根據角色知識庫與 bot 最後的問題，重新寫出 3 個更自然、更具體的學生回答。",
    `問題類型：${questionType}`,
    `題型要求：${describeDialogueQuestionType(questionType)}`,
    choiceOptions.length ? `可選項：${choiceOptions.join(" / ")}` : "",
    "要求：",
    "1. 每個回答都必須直接回答問題，不要重複 bot 原句。",
    "2. 不要使用『我哋之前講到』『這讓我想到現在的生活』『慢慢形成』這類空話。",
    "3. 如果是具體事實題，L1 必須給出具體答案，不能只摘出問題裡的名詞；L2 解釋關係；L3 連到象徵、作品表達或生活例子。",
    "4. 如果是選擇/判斷題，L1 要選一邊；L2 要解釋為何選這邊；L3 要連到這個選項背後的概念，例如稱呼、身份、觀眾認同或藝術地位。",
    "5. 不要引用與 Bot 最後問題無關的舊知識點，即使它出現在最近對話中。",
    "6. 只有當問題真的在問前後變化時，才可以使用『變化、改變、翻新』這類答案。",
    "7. 每條只寫一句，8-18 個中文字為佳。",
    "只輸出 JSON：",
    '{"suggestedReplies":[{"tier":"L1","label":"基礎事實","text":"短答案","sendText":"完整一點的學生答案"},{"tier":"L2","label":"深入思考","text":"短答案","sendText":"完整一點的學生答案"},{"tier":"L3","label":"價值遷移","text":"短答案","sendText":"完整一點的學生答案"}]}',
    "",
    `角色與知識庫資料：${String(systemPrompt || "").slice(0, 4000)}`,
    `Bot 最後問題：${questionContext}`,
    `相關知識點：${topic || "未指定"}`,
    recentMessages.length
      ? `最近對話：\n${recentMessages.map((message) => `${message.role === "user" ? "學生" : "老師"}：${sanitizeChatHistoryContent(message.content)}`).join("\n")}`
      : "",
    `待修正回答：${JSON.stringify(originalReplies)}`,
  ].join("\n");

  const raw = await askModelOnce(
    provider,
    "你只負責輸出符合格式的教學建議答案 JSON，不扮演任何角色。",
    prompt
  );
  const parsed = JSON.parse(cleanSuggestionJson(raw));
  return normalizeSuggestedReplies(parsed?.suggestedReplies, questionContext);
}

function emptyDialogueEnhancement() {
  return {
    followUpQuestion: "",
    suggestedReplies: [] as SuggestedReply[],
    dialogueState: {
      student_status_flag: "stuck",
      suggested_replies: [] as SuggestedReply[],
      follow_up_question: "",
    },
  };
}

async function buildDialogueEnhancement(
  provider: ChatModelProvider,
  systemPrompt: string,
  userPrompt: string,
  reply: string,
  recentMessages: RecentChatMessage[] = [],
  options: {
    idleTrigger?: boolean;
    currentQuestion?: string;
    replyLanguage?: "cantonese" | "mandarin" | "english";
  } = {}
) {
  const empty = emptyDialogueEnhancement();
  if (MOCK_UPSTREAM || !ENABLE_DIALOGUE_SUGGESTION_LLM) return empty;
  const enhancementProvider = getDialogueEnhancementProvider(provider);

  const lastQuestion = String(options.currentQuestion || "").trim() || extractLastQuestion(reply);
  if (!lastQuestion) return empty;
  const questionType = inferDialogueQuestionType(lastQuestion);
  const choiceOptions = extractChoiceOptions(lastQuestion);
  const point = pickDialogueKnowledgePointForQuestion(systemPrompt, lastQuestion, reply);
  const usesClassicalChinese = /Enforced Speaking Style[\s\S]*淺近文言文/.test(systemPrompt);
  const guideLanguageRule =
    usesClassicalChinese && options.replyLanguage === "english"
      ? "OUTPUT LANGUAGE: Write followUpQuestion, every label, text, and sendText entirely in concise, dignified, aphoristic English that evokes a Classical Chinese voice while remaining easy to understand. Never output Chinese. Labels must be: Key fact, Think deeper, Apply the idea."
      : usesClassicalChinese
      ? "輸出語言：followUpQuestion、label、text、sendText 必須全部使用繁體中文的淺近文言文。可用『吾、汝、何以、然、可謂』等文言詞句，須讓學生易懂；不得改成現代普通話或粵語口語。"
      : options.replyLanguage === "english"
      ? "OUTPUT LANGUAGE: Write followUpQuestion, every label, text, and sendText entirely in natural English. Labels must be: Key fact, Think deeper, Apply the idea."
      : options.replyLanguage === "mandarin"
        ? "輸出語言：followUpQuestion、label、text、sendText 必須全部使用繁體中文的標準普通話，禁止使用粵語詞與語氣詞（如係、嘅、喺、咗、佢、哋）。"
        : "輸出語言：followUpQuestion、label、text、sendText 必須全部使用自然的香港粵語繁體中文。";

  const topic = clampChinesePhrase(
    String(point?.content || userPrompt || lastQuestion)
      .split(/[。！？!?；;\n]/)[0]
      .replace(/^[-*•\d.、\s]+/, "")
      .trim(),
    18
  );

  const prompt = [
    guideLanguageRule,
    "你是兒童中文學習平台的引導提示生成器，不是回答模板機器。",
    "請先理解角色知識庫、角色語氣、學生上一句話、Bot 剛剛回覆，以及 Bot 最後提出的問題，再生成 3 個可直接點選的學生回答。",
    "三個回答必須是『真的回答這一題』，要從角色知識庫中挑出最相關的內容來組織成自然句子，而不是套用固定句式。",
    "每個層級都要不同：L1 偏基礎事實，L2 偏原因、變化、比較或脈絡，L3 偏價值遷移、現代連結或生活經驗。",
    `問題類型：${questionType}`,
    `題型要求：${describeDialogueQuestionType(questionType)}`,
    choiceOptions.length ? `可選項：${choiceOptions.join(" / ")}` : "",
    options.idleTrigger
      ? "這次是學生超過 15 秒未輸入的情境，請更積極提供可直接點選的回答鷹架，並視為 student_status_flag = stuck。"
      : "若學生沒有卡住，followUpQuestion 可保持空字串。",
    "如果學生剛剛已經回答了上一條問題，新的 followUpQuestion 應自然推進到下一個小問題；如果未回答，也不要原句重複追問。",
    "重要要求：",
    "1. 不要輸出模板句、空話、口號或操作說明，例如『我覺得這是慢慢形成的』『這讓我想到現在的生活』『可比較前後變化』。",
    "2. 每個 text 必須是 1 句自然的學生回答，盡量 8-18 個中文字，且要具體、像真的在回應問題。",
    "3. L1 要直接命中事實或觀察結果；L2 要點出原因、變化、比較、脈絡；L3 要連到今天生活、個人經驗、或現在的情境。",
    "4. 三個答案要回答同一個問題，但層次不同，不能只是換句話說。",
    "5. sendText 可以稍完整，但仍然要像學生回答，不要要求 Bot 再做任務。",
    "6. 如果 knowledge base 內有明確相關內容，請優先使用它，不要自己發明空泛的概念。",
    "7. 如果是具體事實題，L1 必須回答具體名稱/劇名/人物/地點，不可以只摘出題目中的名詞。",
    "8. 如果是選擇/判斷題，L1 必須明確選其中一個選項；L2 必須解釋選擇原因；L3 必須連到該選項背後的概念，不能泛泛說生活有相似例子。",
    "9. 不要引用與 Bot 最後問題無關的舊知識點，即使它出現在最近對話中。",
    "10. 只有問題真的在問前後變化時，才可以使用『變化、改變、翻新』這類答案。",
    "11. 如果最後還是很難寫得自然，就寧可簡短直接，也不要補空話。",
    "只輸出 JSON，不要 Markdown：",
    '{"followUpQuestion":"Bot最後的問題","suggestedReplies":[{"tier":"L1","label":"基礎事實","text":"短答案","sendText":"完整一點的學生答案"},{"tier":"L2","label":"深入思考","text":"短答案","sendText":"完整一點的學生答案"},{"tier":"L3","label":"價值遷移","text":"短答案","sendText":"完整一點的學生答案"}]}',
    "",
    `角色與知識庫資料：${String(systemPrompt || "").slice(0, 4000)}`,
    `相關知識點：${topic || "未指定"}`,
    recentMessages.length
      ? `最近對話：\n${recentMessages.map((message) => `${message.role === "user" ? "學生" : "老師"}：${sanitizeChatHistoryContent(message.content)}`).join("\n")}`
      : "",
    `學生上一句：${userPrompt}`,
    `Bot 回覆：${reply}`,
    `Bot 最後問題：${lastQuestion}`,
  ].join("\n");

  try {
    const raw = await askModelOnce(
      enhancementProvider,
      `${guideLanguageRule}\n你只負責輸出符合格式的教學建議答案 JSON，不扮演任何角色。`,
      prompt
    );
    const parsed = JSON.parse(cleanSuggestionJson(raw));
    const generatedQuestion = lastQuestion;
    const botQuestions = recentMessages
      .filter((message) => message.role === "bot")
      .map((message) => extractLastQuestion(message.content))
      .filter(Boolean);
    const previousBotQuestion = botQuestions.at(-1) || "";
    const dedupedQuestion =
      generatedQuestion && previousBotQuestion && generatedQuestion === previousBotQuestion
        ? ""
        : generatedQuestion;
    let suggestedReplies = normalizeSuggestedReplies(parsed?.suggestedReplies, lastQuestion);
    const l1Reply = suggestedReplies.find((item) => item.tier === "L1");
    if (options.replyLanguage === "cantonese" && l1Reply && l1ReplyLooksWeak(l1Reply, lastQuestion)) {
      const repairedL1 = await repairL1WithModel(
        enhancementProvider,
        systemPrompt,
        lastQuestion,
        l1Reply,
        topic,
        recentMessages
      );
      if (repairedL1) {
        suggestedReplies = suggestedReplies.map((item) => (item.tier === "L1" ? repairedL1 : item));
      }
    }
    if (
      options.replyLanguage === "cantonese" &&
      suggestedReplies.length === 3 &&
      suggestedReplies.some((item) => suggestedReplyLooksWeak(item, lastQuestion))
    ) {
      suggestedReplies = await repairSuggestedRepliesWithModel(
        enhancementProvider,
        systemPrompt,
        lastQuestion,
        suggestedReplies,
        topic,
        recentMessages
      );
    }
    if (suggestedReplies.length === 3) {
      return {
        followUpQuestion: extractLastQuestion(reply) ? "" : dedupedQuestion,
        suggestedReplies,
        dialogueState: {
          student_status_flag: "stuck",
          suggested_replies: suggestedReplies,
          follow_up_question: dedupedQuestion || generatedQuestion,
        },
      };
    }
  } catch (error) {
    if (isDebugLogEnabled) console.warn("[ask] dialogue suggestions skipped", error);
  }

  return empty;
}

function normalizeRecentMessages(input: unknown): RecentChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any) => {
      const role =
        item?.role === "assistant" || item?.role === "bot"
          ? "bot"
          : item?.role === "user"
            ? "user"
            : "";
      const content = String(item?.content || "").trim();
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-8) as RecentChatMessage[];
}

async function askGemini(
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void,
  images: ChatImageInput[] = []
) {
  if (isVertexAIEnabled()) {
    const { project, location } = getVertexAIConfig();
    const accessToken = await getVertexAccessToken();
    const response = await fetch(
      `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: userPrompt },
                ...images.map((image) => ({
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                  },
                })),
              ],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        }),
      }
    );

    if (!response.ok || !response.body) {
      throw new Error((await response.text()) || "Vertex AI streaming request failed");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const consumeBuffer = () => {
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const payload = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");

        if (payload) {
          const parsed: any = JSON.parse(payload);
          const text = parsed?.candidates?.[0]?.content?.parts
            ?.map((part: any) => String(part?.text || ""))
            .join("") || "";
          if (text) onToken(text);
        }

        boundary = buffer.indexOf("\n\n");
      }
    };

    const body: any = response.body;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        consumeBuffer();
        if (done) break;
      }
    } else {
      for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
        const normalizedChunk =
          typeof chunk === "string"
            ? Buffer.from(chunk)
            : chunk instanceof Uint8Array
              ? chunk
              : new Uint8Array(chunk);
        buffer += decoder.decode(normalizedChunk, { stream: true });
        consumeBuffer();
      }
      buffer += decoder.decode();
      consumeBuffer();
    }
    return;
  }

  const ai = getAI();
  const stream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: userPrompt },
          ...images.map((image) => ({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data,
            },
          })),
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
    },
  });

  for await (const chunk of stream) {
    const token = chunk.text;
    if (token) onToken(token);
  }
}

async function askGeminiOnce(systemPrompt: string, userPrompt: string, images: ChatImageInput[] = []): Promise<string> {
  if (isVertexAIEnabled()) {
    const { project, location } = getVertexAIConfig();
    const accessToken = await getVertexAccessToken();
    const response = await fetch(
      `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: userPrompt },
                ...images.map((image) => ({
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                  },
                })),
              ],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error((await response.text()) || "Vertex AI request failed");
    }

    const data: any = await response.json();
    return String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: userPrompt },
          ...images.map((image) => ({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data,
            },
          })),
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
    },
  });

  return String(response.text || "").trim();
}

async function askModelOnce(
  provider: ChatModelProvider,
  systemPrompt: string,
  userPrompt: string,
  images: ChatImageInput[] = []
): Promise<string> {
  if (provider === "gemini") {
    return askGeminiOnce(systemPrompt, userPrompt, images);
  }
  return askDeepSeekOnce(systemPrompt, userPrompt);
}

const CJK_CHARACTER_PATTERN = /[\u3400-\u9fff]/;

async function renderReplyInEnglish(
  provider: ChatModelProvider,
  input: string,
  classicalChineseStyle = false
) {
  const styleRule = classicalChineseStyle
    ? "Use concise, dignified, aphoristic English that evokes a Classical Chinese voice while remaining easy to understand."
    : "Use natural, student-friendly English.";
  const render = (text: string, strict = false) => askModelOnce(
    provider,
    [
      "Render the entire input in English.",
      styleRule,
      "Preserve its meaning, character identity, paragraph structure, and at most one question.",
      strict ? "STRICT FINAL CHECK: The output must contain English only and zero Chinese characters." : "",
      "Output only the English rendering, with no notes or explanation.",
    ].filter(Boolean).join("\n"),
    text
  );

  let rendered = await render(String(input || ""));
  if (CJK_CHARACTER_PATTERN.test(rendered)) {
    rendered = await render(rendered, true);
  }
  return rendered;
}

async function askModelStream(
  provider: ChatModelProvider,
  systemPrompt: string,
  userPrompt: string,
  onToken: (token: string) => void,
  images: ChatImageInput[] = []
) {
  if (provider === "gemini") {
    return askGemini(systemPrompt, userPrompt, onToken, images);
  }
  return askDeepSeek(systemPrompt, userPrompt, onToken);
}

function remapModelProviderError(error: unknown) {
  const message = String((error as any)?.message || "");
  if (
    /Missing GOOGLE_CLOUD_PROJECT/i.test(message) ||
    /Could not load the default credentials/i.test(message) ||
    /DefaultCredentialsError/i.test(message) ||
    /Application Default Credentials/i.test(message) ||
    /Failed to acquire Vertex AI access token/i.test(message)
  ) {
    return new Error("Gemini Vertex AI 尚未完成伺服器認證設定，請先配置 Google Cloud 憑證。");
  }
  if (
    /Permission 'aiplatform\./i.test(message) ||
    /PERMISSION_DENIED/i.test(message)
  ) {
    return new Error("Gemini Vertex AI 沒有足夠權限，請確認目前 Google Cloud 帳號已開通 Vertex AI 並具備對應權限。");
  }
  if (
    /User location is not supported for the API use/i.test(message) ||
    /FAILED_PRECONDITION/i.test(message)
  ) {
    return new Error("Gemini 目前請改走 Vertex AI；若仍看到地區限制，表示請求尚未使用到 Vertex AI 憑證。");
  }
  return error;
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

async function extractTextFromDocBuffer(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  const body = typeof document?.getBody === "function" ? document.getBody() : "";
  const footnotes =
    typeof document?.getFootnotes === "function" ? document.getFootnotes() : "";
  const endnotes =
    typeof document?.getEndnotes === "function" ? document.getEndnotes() : "";
  const headers =
    typeof document?.getHeaders === "function" ? document.getHeaders() : "";
  const text = [body, footnotes, endnotes, headers]
    .filter(Boolean)
    .join("\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new Error("DOC 內容讀取失敗");
  }

  return text;
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
    return extractTextFromDocBuffer(file.buffer);
  }

  throw new Error(`不支援的文件格式：${file.originalname || "unknown"}`);
}

function extractTextFromHtml(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return noScript.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

async function resolveChatActor(req: Request, sharedBotId?: string, botId?: string) {
  if (isModoIntegrationRequest(req)) {
    const normalizedBotId = String(sharedBotId || botId || "").trim();
    const ownerId = String(process.env.MODO_SOURCE_OWNER_ID || "").trim();
    const ownerEmail = String(process.env.MODO_SOURCE_OWNER_EMAIL || "").trim().toLowerCase();
    if (!ownerId && !ownerEmail) {
      const error = new Error("integration source owner is not configured");
      (error as any).status = 503;
      throw error;
    }
    const result = await pool.query(
      `SELECT owner_id, owner_email FROM bots
       WHERE id=$1
         AND is_visible=TRUE
         AND ($2='' OR owner_id=$2)
         AND ($3='' OR LOWER(owner_email)=LOWER($3))
       LIMIT 1`,
      [normalizedBotId, ownerId, ownerEmail]
    );
    const resolvedOwnerId = String(result.rows[0]?.owner_id || "").trim();
    if (!resolvedOwnerId) {
      const error = new Error("integration bot not found");
      (error as any).status = 404;
      throw error;
    }
    const user = await findUserById(resolvedOwnerId);
    if (!user) {
      const error = new Error("integration bot owner not found");
      (error as any).status = 404;
      throw error;
    }
    return { user, shared: true as const, integration: true as const };
  }

  const token = getBearerToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload?.sub) {
    const user = await findUserById(payload.sub);
    if (user) {
      return { user, shared: false as const, integration: false as const };
    }
  }

  const normalizedBotId = String(sharedBotId || botId || "").trim();
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

  return { user, shared: true as const, integration: false as const };
}

async function getBotOwnerId(botId: string) {
  const normalizedBotId = String(botId || "").trim();
  if (!normalizedBotId || normalizedBotId === "default") return null;
  const result = await pool.query(
    `
    SELECT COALESCE(
      NULLIF(BTRIM(owner_id), ''),
      (
        SELECT NULLIF(BTRIM(teacher_id), '')
        FROM bot_student_shares
        WHERE bot_id = $1
          AND teacher_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      )
    ) AS teacher_id
    FROM bots
    WHERE id=$1
    `,
    [normalizedBotId]
  );
  return String(result.rows[0]?.teacher_id || "").trim() || null;
}

async function recordBotChatMessages(input: {
  botId: string;
  userId: string;
  userPrompt: string;
  botReply: string;
  modelProvider: string;
  source: string;
}) {
  const botId = String(input.botId || "").trim();
  const userPrompt = String(input.userPrompt || "").trim();
  const botReply = String(input.botReply || "").trim();
  if (!botId || botId === "default" || (!userPrompt && !botReply)) return;

  try {
    await ensurePlatformTables();
    const teacherId = await getBotOwnerId(botId);
    const source = String(input.source || "direct").slice(0, 32);
    const modelProvider = String(input.modelProvider || "").slice(0, 32);
    const rows: Array<[string, string, string, string, string, string, string, string]> = [];
    if (userPrompt) {
      rows.push([crypto.randomUUID(), botId, input.userId, teacherId || "", "user", userPrompt, modelProvider, source]);
    }
    if (botReply) {
      rows.push([crypto.randomUUID(), botId, input.userId, teacherId || "", "bot", botReply, modelProvider, source]);
    }
    for (const row of rows) {
      await pool.query(
        `INSERT INTO bot_chat_messages (id, bot_id, user_id, teacher_id, role, content, model_provider, source)
         VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8)`,
        row
      );
    }
  } catch (error) {
    console.warn("[ask] failed to record bot chat messages", error);
  }
}

async function recordBotInteractionEvent(input: {
  botId: string;
  userId: string;
  source: string;
}) {
  const botId = String(input.botId || "").trim();
  if (!botId || botId === "default") return;
  try {
    await ensurePlatformTables();
    await pool.query(
      `
      INSERT INTO bot_interaction_events (id, bot_id, user_id, source)
      VALUES ($1, $2, $3, $4)
      `,
      [crypto.randomUUID(), botId, input.userId || null, String(input.source || "direct").slice(0, 32)]
    );
  } catch (error) {
    console.warn("[ask] failed to record bot interaction event", error);
  }
}

async function fetchRecentBotChatMessages(botId: string, userId: string, limit = 6): Promise<RecentChatMessage[]> {
  const normalizedBotId = String(botId || "").trim();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedBotId || normalizedBotId === "default" || !normalizedUserId) return [];

  try {
    await ensurePlatformTables();
    const result = await pool.query(
      `SELECT role, content
       FROM bot_chat_messages
       WHERE bot_id=$1
         AND user_id=$2
       ORDER BY created_at DESC
       LIMIT $3`,
      [normalizedBotId, normalizedUserId, Math.max(1, Math.min(limit, 12))]
    );
    return result.rows
      .slice()
      .reverse()
      .map((row): RecentChatMessage => ({
        role: row.role === "bot" ? "bot" : "user",
        content: sanitizeChatHistoryContent(String(row.content || "")),
      }))
      .filter((row) => row.content);
  } catch (error) {
    console.warn("[ask] failed to fetch recent bot chat messages", error);
    return [];
  }
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
    const modelProvider = normalizeChatModelProvider((req.body as any)?.modelProvider);
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
    const reply = await askModelOnce(modelProvider, systemPrompt, normalizedPromptText);
    await consumeUserCredits(authUser!.id, "ask_file", 4, {
      fileNames: files.map((file) => file.originalname),
      extractedLength: normalizedPromptText.length,
      fileCount: files.length,
      modelProvider,
    });
    return res.json({
      reply,
      extractedText: normalizedPromptText,
      modelProvider,
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
    const { systemPrompt = "", url = "", modelProvider = "deepseek" } = req.body as any;
    const selectedModelProvider = normalizeChatModelProvider(modelProvider);
    if (!url || typeof url !== "string") return res.status(400).json({ error: "缺少網址" });
    const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let pageText = "";
    if (MOCK_UPSTREAM) {
      pageText = `Mock page content from ${targetUrl}`.slice(0, 18000);
    } else {
      const pageRes = await fetch(targetUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Bot/1.0)" } });
      if (!pageRes.ok) return res.status(400).json({ error: `網址抓取失敗：${pageRes.status}` });
      const html = await pageRes.text();
      pageText = extractTextFromHtml(html).slice(0, 18000);
    }
    if (!pageText) return res.status(400).json({ error: "網址內容無可解析文字" });
    const reply = await askModelOnce(selectedModelProvider, systemPrompt, pageText);
    await consumeUserCredits(authUser!.id, "ask_url", 2, { url: targetUrl, modelProvider: selectedModelProvider });
    return res.json({ reply, extractedText: pageText, sourceUrl: targetUrl, modelProvider: selectedModelProvider });
  } catch (err: any) {
    console.error("❌ URL 解析錯誤:", err);
    return res.status(err?.status || 500).json({ error: err.message });
  }
});

router.post("/ask", upload.any(), async (req: Request, res: Response) => {
  try {
    const {
      systemPrompt = "",
      userPrompt = "",
      stream = true,
      usageType = "general",
      botId = "default",
      sharedBotId = "",
      modelProvider = "deepseek",
      mode = "",
      source = "direct",
      conversationId = "",
      topicId = "",
      replyLanguage = "cantonese",
    } = req.body || {};
    const actor = await resolveChatActor(req, String(sharedBotId || ""), String(botId || ""));
    const externalMode = actor.integration === true;
    const authUser = actor.user;
    await assertUserCanSpend(authUser.id, 1);
    if (usageType === "chat_message") await ensureFeatureAvailable(authUser.id, "chat_messages", 1);

    const normalized = String(userPrompt || "").trim();
    const selectedModelProvider = normalizeChatModelProvider(modelProvider);
    const normalizedReplyLanguage =
      replyLanguage === "english" || replyLanguage === "mandarin" ? replyLanguage : "cantonese";
    const chatImages = selectedModelProvider === "gemini" ? extractChatImages(req) : [];
    const normalizedPrompt = selectedModelProvider === "gemini" && chatImages.length > 0 && !normalized
      ? "請描述這張圖片。"
      : normalized;
    const normalizedBotId = String(botId || "default");
    const normalizedConversationId = String(conversationId || "").trim();
    let activeConversation =
      usageType === "chat_message" && !externalMode
        ? normalizedConversationId
          ? await getConversationForUser(normalizedConversationId, authUser.id)
          : null
        : null;
    if (usageType === "chat_message" && normalizedConversationId && !activeConversation) {
      return res.status(404).json({ error: "找不到對話紀錄" });
    }
    if (
      activeConversation &&
      String(activeConversation.bot_id || "").trim() !== normalizedBotId
    ) {
      return res.status(400).json({ error: "對話與所選角色不相符" });
    }

    let activeTopic = null as Awaited<ReturnType<typeof resolveCharacterTopic>>;
    let effectiveSystemPrompt = String(systemPrompt || "");
    if (usageType === "chat_message" && normalizedBotId && normalizedBotId !== "default") {
      const character = await getAccessibleCharacter(normalizedBotId, authUser.id);
      if (!character) return res.status(404).json({ error: "Character not found" });
      activeTopic = await resolveCharacterTopic({
        characterId: normalizedBotId,
        requestedTopicId: String(topicId || "").trim() || null,
        conversationTopicId: activeConversation?.topic_id || null,
      });
      if (activeConversation && activeTopic && activeConversation.topic_id !== activeTopic.id) {
        activeConversation = await updateConversationTopic(
          activeConversation.id,
          authUser.id,
          activeTopic.id
        );
      }
      const characterBasePrompt = buildChatSystemPrompt({
        roleName: character.name,
        knowledgeBase: character.knowledge_base || "",
        securityPrompt: character.security_prompt || "",
      });
      const composedCharacterPrompt = composeCharacterTopicPrompt(
        characterBasePrompt,
        character,
        activeTopic
      );
      const characterUsesClassicalChineseStyle =
        /Enforced Speaking Style[\s\S]*淺近文言文/.test(composedCharacterPrompt);
      effectiveSystemPrompt = `${composedCharacterPrompt}

# Highest-Priority Required Reply Language
${buildChatReplyLanguageRule(normalizedReplyLanguage, characterUsesClassicalChineseStyle)}`.trim();
    }

    const usesClassicalChineseStyle = /Enforced Speaking Style[\s\S]*淺近文言文/.test(effectiveSystemPrompt);
    // English and Mandarin are buffered so their final language conversion is
    // always applied; only Cantonese may be streamed directly.
    const wantsStream = normalizedReplyLanguage === "cantonese" && normalizeStreamFlag(stream);
    if (isDebugLogEnabled) {
      console.log("[ask] provider=%s stream=%s shared=%s vertex=%s", selectedModelProvider, wantsStream, Boolean(sharedBotId), isVertexAIEnabled());
    }
    const storedConversationMessages =
      usageType === "chat_message" && activeConversation && !externalMode
        ? await listConversationMessages(activeConversation.id, authUser.id)
        : null;
    const externalRecentMessages = externalMode
      ? normalizeRecentMessages(req.body?.recentMessages)
      : [];
    const recentChatMessages: RecentChatMessage[] = (externalMode ? externalRecentMessages : storedConversationMessages || [])
      .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "bot")
      .slice(-6)
      .map((message) => ({
        role: message.role === "assistant" || message.role === "bot" ? "bot" : "user",
        content: sanitizeChatHistoryContent(String(message.content || "")),
      }));
    const contextualPrompt = buildContextualUserPrompt(normalizedPrompt, recentChatMessages);
    const active = actor.shared ? null : await getActiveTeachingSession(authUser.id, normalizedBotId);

    const ensureActiveConversation = async () => {
      if (externalMode) return null;
      if (activeConversation || usageType !== "chat_message" || !normalizedPrompt) {
        return activeConversation;
      }
      activeConversation = await createConversation({
        userId: authUser.id,
        botId: normalizedBotId || null,
        topicId: activeTopic?.id || null,
        title: "新的對話",
        type: "bot_learning",
      });
      return activeConversation;
    };

    const persistUserMessage = async () => {
      if (externalMode) return;
      const conversation = await ensureActiveConversation();
      if (!conversation) return;
      await saveConversationMessage({
        conversationId: conversation.id,
        userId: authUser.id,
        botId: normalizedBotId || null,
        role: "user",
        content: normalizedPrompt,
        messageType: "normal",
        metadata: { replyLanguage: normalizedReplyLanguage, topicId: activeTopic?.id || null },
      });
      await updateConversationPreview(conversation.id, authUser.id, normalizedPrompt);
      const maybeRenamed = await updateConversationTitleFromFirstMessage(conversation.id, authUser.id);
      if (maybeRenamed) activeConversation = maybeRenamed;
    };

    const persistAssistantMessage = async (replyText: string) => {
      if (externalMode) return;
      if (!activeConversation || usageType !== "chat_message") return;
      const safeReply = String(replyText || "").trim();
      if (!safeReply) return;
      await saveConversationMessage({
        conversationId: activeConversation.id,
        userId: authUser.id,
        botId: normalizedBotId || null,
        role: "assistant",
        content: safeReply,
        messageType: "normal",
        metadata: { replyLanguage: normalizedReplyLanguage, topicId: activeTopic?.id || null },
      });
      const refreshed = await updateConversationPreview(activeConversation.id, authUser.id, safeReply);
      if (refreshed) activeConversation = refreshed;
    };

    const respondTeaching = async (payload: Record<string, any>) => {
      if (
        normalizedReplyLanguage !== "cantonese" &&
        !(usesClassicalChineseStyle && normalizedReplyLanguage === "mandarin") &&
        String(payload?.reply || "").trim()
      ) {
        const targetLanguage =
          normalizedReplyLanguage === "english"
            ? usesClassicalChineseStyle
              ? "concise, dignified, aphoristic English that evokes a Classical Chinese voice while remaining student-friendly"
              : "natural, student-friendly English"
            : "standard Mandarin written in Traditional Chinese; never use Cantonese words or particles";
        payload.reply = normalizedReplyLanguage === "english"
          ? await renderReplyInEnglish(
              selectedModelProvider,
              String(payload.reply),
              usesClassicalChineseStyle
            ).catch(() => payload.reply)
          : await askModelOnce(
              selectedModelProvider,
              `Translate educational chat content into ${targetLanguage}. Preserve Step numbers, line breaks, examples, choices, and meaning. Output only the translated text.`,
              String(payload.reply)
            ).catch(() => payload.reply);
      }
      if (usageType === "chat_message" && normalizedPrompt) {
        await persistUserMessage();
      }
      if (usageType === "chat_message" && !externalMode) {
        const replyText = String(payload?.reply || "").trim();
        const normalizedSource = String(source || (actor.shared ? "shared_bot" : "direct")).slice(0, 32);
        await recordBotChatMessages({
          botId: normalizedBotId,
          userId: authUser.id,
          userPrompt: normalizedPrompt,
          botReply: replyText,
          modelProvider: selectedModelProvider,
          source: normalizedSource,
        });
        await recordBotInteractionEvent({
          botId: normalizedBotId,
          userId: authUser.id,
          source: normalizedSource,
        });
        await persistAssistantMessage(replyText);
      }
      return res.json({
        ...payload,
        conversation: activeConversation ? mapConversationRow(activeConversation) : null,
        conversationId: activeConversation?.id || null,
      });
    };

    if (mode === "translate_text") {
      const sourceText = String(req.body?.text || "").trim();
      if (!sourceText) return res.status(400).json({ error: "Missing text" });
      if (usesClassicalChineseStyle && normalizedReplyLanguage === "mandarin") {
        return res.json({ reply: sourceText });
      }
      const translationPrompt =
        normalizedReplyLanguage === "english"
          ? usesClassicalChineseStyle
            ? "Translate entirely into concise, dignified, aphoristic English that evokes the original Classical Chinese voice while remaining easy to understand. Never output Chinese. Preserve the character and meaning. Output only the translation."
            : "Translate into natural English while preserving the character voice and meaning. Output only the translation."
          : "改寫成自然、標準的繁體中文普通話，保留角色語氣與原意，徹底移除粵語詞彙、句法和語氣詞。只輸出改寫結果。";
      const translated = normalizedReplyLanguage === "english"
        ? await renderReplyInEnglish(selectedModelProvider, sourceText, usesClassicalChineseStyle)
        : await askModelOnce(selectedModelProvider, translationPrompt, sourceText);
      return res.json({ reply: translated });
    }

    if (mode === "dialogue_enhancement") {
      const reply = String(req.body?.reply || "").trim();
      if (!reply) {
        return res.status(400).json({ error: "Missing reply" });
      }
      const enhancement = await buildDialogueEnhancement(
        selectedModelProvider,
        effectiveSystemPrompt,
        normalizedPrompt,
        reply,
        normalizeRecentMessages(req.body?.recentMessages),
        {
          idleTrigger: Boolean(req.body?.idleTrigger),
          currentQuestion: String(req.body?.currentQuestion || "").trim(),
          replyLanguage:
            req.body?.replyLanguage === "english" || req.body?.replyLanguage === "mandarin"
              ? req.body.replyLanguage
              : "cantonese",
        }
      );
      return res.json(enhancement);
    }

    if (shouldStartTeaching(normalizedPrompt)) {
      if (actor.shared) {
        return res.json({ reply: "分享聊天目前不支援引導教學模式。", teachingMode: false });
      }
      const taskType = inferTeachingTask(normalized) || "email";
      const created = await startTeachingSession(authUser.id, normalizedBotId, taskType);
      return respondTeaching({ reply: buildTeachingGuide(1, "step"), teachingMode: true, stepIndex: 1, totalSteps: created.totalSteps, taskType: created.taskType });
    }

    if (active) {
      if (active && isExitCommand(normalizedPrompt)) {
        await pool.query(`UPDATE teaching_sessions SET mode='aborted', updated_at=NOW() WHERE id=$1`, [active.id]);
        return respondTeaching({ reply: "已退出引導模式，現在回到一般聊天模式。", teachingMode: false });
      }
      const session = active;
      const teachingState = getTeachingState(session);

      if (isExampleCommand(normalizedPrompt)) {
        return respondTeaching({ reply: buildTeachingGuide(session.step_index, "example", teachingState), teachingMode: true, stepIndex: session.step_index, totalSteps: session.total_steps, taskType: session.task_type });
      }
      if (isRepeatCommand(normalizedPrompt)) {
        return respondTeaching({ reply: buildTeachingGuide(session.step_index, "step", teachingState), teachingMode: true, stepIndex: session.step_index, totalSteps: session.total_steps, taskType: session.task_type });
      }
      if (isNextCommand(normalizedPrompt)) {
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
          return respondTeaching({
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
          return respondTeaching({ reply: finalTemplate, teachingMode: false });
        }
        await pool.query(`UPDATE teaching_sessions SET step_index=$2, mode='guiding', updated_at=NOW() WHERE id=$1`, [session.id, nextStep]);
        return respondTeaching({ reply: buildTeachingGuide(nextStep, "step", teachingState), teachingMode: true, stepIndex: nextStep, totalSteps: session.total_steps, taskType: session.task_type });
      }

      if (session.step_index === 1) {
        const category = detectCategory(normalized);
        if (!category) {
          return respondTeaching({
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
        return respondTeaching({ reply, teachingMode: true, stepIndex: 2, totalSteps: session.total_steps, taskType: session.task_type });
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
      return respondTeaching({ reply: composed, teachingMode: true, stepIndex: session.step_index, totalSteps: session.total_steps, taskType: session.task_type, evaluation });
    }

    await persistUserMessage();

    if (!wantsStream) {
      let reply = "";
      try {
        if (isDebugLogEnabled) console.log("[ask] requesting model reply");
        reply =
          (await maybeMockModelReply(normalizedPrompt)) ??
          (await askModelOnce(selectedModelProvider, effectiveSystemPrompt, contextualPrompt, chatImages));
        if (normalizedReplyLanguage === "mandarin" && !usesClassicalChineseStyle) {
          reply = await askModelOnce(
            selectedModelProvider,
            "你是專業粵語轉繁體普通話編輯。把輸入完整改寫成自然、標準的普通話，使用繁體中文。保留原意、角色身份、段落與最多一個問題。徹底移除所有粵語詞彙、句法和語氣詞。不要解釋，只輸出改寫結果。",
            reply
          );
        } else if (normalizedReplyLanguage === "english") {
          reply = await renderReplyInEnglish(selectedModelProvider, reply, usesClassicalChineseStyle);
        }
        if (isDebugLogEnabled) console.log("[ask] model reply received length=%s", reply.length);
      } catch (error) {
        throw remapModelProviderError(error);
      }
      if (usageType === "chat_message") await recordFeatureUsage(authUser.id, "chat_messages", 1, { usageType, source: actor.shared ? "shared_bot" : "direct" });
      if (usageType === "chat_message" && !externalMode) {
        await recordBotChatMessages({
          botId: normalizedBotId,
          userId: authUser.id,
          userPrompt: normalizedPrompt,
          botReply: reply,
          modelProvider: selectedModelProvider,
          source: String(source || (actor.shared ? "shared_bot" : "direct")).slice(0, 32),
        });
        await recordBotInteractionEvent({
          botId: normalizedBotId,
          userId: authUser.id,
          source: String(source || (actor.shared ? "shared_bot" : "direct")).slice(0, 32),
        });
      }
      await persistAssistantMessage(reply);
      if (isDebugLogEnabled) console.log("[ask] consuming credits");
      await consumeUserCredits(authUser.id, "ask", 1, { streaming: false, promptLength: normalizedPrompt.length, source: actor.shared ? "shared_bot" : "direct", modelProvider: selectedModelProvider, imageCount: chatImages.length });
      if (isDebugLogEnabled) console.log("[ask] sending json response");
      return res.json({
        reply,
        teachingMode: false,
        modelProvider: selectedModelProvider,
        conversation: activeConversation ? mapConversationRow(activeConversation) : null,
        conversationId: activeConversation?.id || null,
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (activeConversation?.id) {
      res.setHeader("X-Conversation-Id", activeConversation.id);
    }
    let streamedReply = "";
    try {
      const mocked = await maybeMockModelReply(normalizedPrompt);
      if (mocked !== null) {
        streamedReply = mocked;
        res.write(`data:${mocked}\n\n`);
      } else {
        await askModelStream(selectedModelProvider, effectiveSystemPrompt, contextualPrompt, (token: string) => {
          streamedReply += token;
          res.write(`data:${token}\n\n`);
        }, chatImages);
      }
    } catch (error) {
      throw remapModelProviderError(error);
    }
    if (usageType === "chat_message") await recordFeatureUsage(authUser.id, "chat_messages", 1, { usageType, source: actor.shared ? "shared_bot" : "direct" });
    if (usageType === "chat_message" && !externalMode) {
      await recordBotChatMessages({
        botId: normalizedBotId,
        userId: authUser.id,
        userPrompt: normalizedPrompt,
        botReply: streamedReply,
        modelProvider: selectedModelProvider,
        source: String(source || (actor.shared ? "shared_bot" : "direct")).slice(0, 32),
      });
      await recordBotInteractionEvent({
        botId: normalizedBotId,
        userId: authUser.id,
        source: String(source || (actor.shared ? "shared_bot" : "direct")).slice(0, 32),
      });
    }
    await persistAssistantMessage(streamedReply);
    await consumeUserCredits(authUser.id, "ask", 1, { streaming: true, promptLength: normalizedPrompt.length, source: actor.shared ? "shared_bot" : "direct", modelProvider: selectedModelProvider, imageCount: chatImages.length });
    res.end();
  } catch (err: any) {
    console.error(err);
    const fallbackMessage =
      err instanceof CharacterTopicError
        ? err.message
        : String(err?.message || "").trim() === "找不到對話紀錄"
        ? "找不到對話紀錄"
        : "AI 回覆暫時失敗，請稍後再試。";
    res.status(err?.status || 500).json({ error: fallbackMessage });
  }
});

export default router;
