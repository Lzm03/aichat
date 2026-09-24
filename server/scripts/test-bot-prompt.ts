/**
 * Bot prompt rules test — run from server/:  node --import tsx scripts/test-bot-prompt.ts [S1 S2 S3 S4]
 *
 * Verifies the revised chat-prompt.ts rules + bots.ts opening-message generation
 * against a real LLM API. Uses DEEPSEEK_API_KEY if present, otherwise falls back
 * to OPENROUTER_API_KEY (openrouter deepseek models). No DB access needed.
 *
 * Scenarios (kept minimal to save tokens):
 *   S1  self-intro only once
 *   S2  info-before-question rhythm + semantic question judge
 *   S3  affirm-then-correct misconception
 *   S7  context continuity
 *   S8  choice resolution
 *   S9  correct answer → advance
 *   S10 unknown escalation
 *   S11 disengagement / re-engagement
 *   S12 topic switching
 *   S4  opening message language (Cantonese senior + English teacher)
 *   S13 guided answer mode: no full answer on turn 1, reveal after stuck ladder (引導後再回答)
 *   S14 strict guided mode: no full answer on turn 1, reveal after longer ladder (不直接給答案)
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: false });

import { buildChatSystemPrompt, buildGuidedAnnouncementPrompt } from "../../utils/chat-prompt.ts";
import { generateOpeningMessage } from "../api/bots.ts";

/* ------------------------------- fixtures ------------------------------- */

const PERSONA_CANTONESE = {
  name: "拔萃師兄",
  knowledgeBase: `【人物背景設定】
我係拔萃師兄，一個喺中華文化同歷史領域陪學生讀書、解題嘅學長。我會用師兄弟之間傾偈嘅語氣，同學生一齊將文史讀活。
【人物知識庫摘要】
川劇變臉係四川地方戲曲嘅招牌絕技，演員靠快速更換臉譜表達角色情緒同性格轉變。臉譜顏色有固定象徵：紅色代表忠義、熱血（如關公），白色代表奸詐，黑色代表剛直。變臉只係川劇入面其中一種表演技巧，唔等於成個川劇。憤怒、驚恐等情緒主要靠演員眼神、身段同鑼鼓節奏呈現，唔係單靠臉譜顏色。
【知識點分級】
[{"id":"kp_001","tier":"basic_fact","title":"川劇變臉係咩","content":"變臉係川劇嘅招牌絕技，靠快速更換臉譜表達角色情緒轉變。","keywords":["川劇","變臉","臉譜"]},{"id":"kp_002","tier":"basic_fact","title":"臉譜顏色象徵","content":"紅色象徵忠義熱血，白色象徵奸詐，黑色象徵剛直。","keywords":["紅色","關公","忠義","白色","黑色"]},{"id":"kp_003","tier":"deep_understanding","title":"情緒唔只靠顏色","content":"憤怒、驚恐等情緒主要靠眼神、身段同鑼鼓節奏呈現，唔係單靠臉譜顏色。","keywords":["憤怒","眼神","身段","鑼鼓"]}]
【角色對話策略】
【性格特質】耐心、熱情
【說話風格】幽默
【答題策略】引導後再回答`,
  securityPrompt: "",
  grade: null,
};

const PERSONA_ENGLISH_TEACHER = {
  name: "Penny",
  knowledgeBase: `【人物背景設定】
我係Penny，學校嘅英文科老師，性格活潑親切，鍾意用英文同學生傾偈、講笑，會鼓勵學生大膽開口講英文，唔怕錯。
【人物知識庫摘要】
英文學習最緊要係多聽多講。學生答錯唔緊要，我會先讚佢肯試，再慢慢改。
【角色對話策略】
【性格特質】熱情、活潑
【說話風格】幽默
【答題策略】引導後再回答`,
  securityPrompt: "",
  grade: null,
};

/* ------------------------------ API helpers ----------------------------- */

type ApiTarget =
  | { kind: "deepseek"; url: string; key: string }
  | { kind: "openrouter"; url: string; key: string; model: string };

/** OpenRouter candidate models, in preference order (deepseek blocked on some
 *  accounts by guardrails — fall back to kimi / glm, both strong in Chinese). */
const OPENROUTER_MODEL_CANDIDATES = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-chat-v3-0324",
  "moonshotai/kimi-k2.6",
  "z-ai/glm-5.2",
];

function pickApiTarget(): ApiTarget | null {
  const dsKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (dsKey) {
    return { kind: "deepseek", url: "https://api.deepseek.com/v1/chat/completions", key: dsKey };
  }
  const orKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (orKey) {
    return {
      kind: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: orKey,
      model: OPENROUTER_MODEL_CANDIDATES[0],
    };
  }
  return null;
}

async function callChatApi(
  target: ApiTarget,
  messages: Array<{ role: string; content: string }>,
  model?: string,
  maxTokens = 8000,
  temperature?: number
) {
  const body: any = { messages, stream: false, max_tokens: maxTokens };
  // Judge 呼叫固定 temperature 0：judge 係裁判，唔應該每次抽唔同嘅樣，
  // 否則同一個行為每次判決都唔同（S13/S14 實跑踩過 run-to-run flake）。
  if (temperature !== undefined) body.temperature = temperature;
  body.model = model || (target.kind === "deepseek" ? "deepseek-chat" : target.model);
  const res = await fetch(target.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${target.kind} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const msg = data?.choices?.[0]?.message || {};
  const content = String(msg.content || "").trim() || String(msg.reasoning || "").trim();
  if (!content) throw new Error("empty LLM response");
  servedModels.add(String(data?.model || body.model).split("/").pop());
  return { content, model: String(data?.model || body.model) };
}

/** One chat turn. On OpenRouter, walks the candidate model list on failure. */
async function chatOnce(target: ApiTarget, system: string, history: any[]) {
  const messages = [{ role: "system", content: system }, ...history];
  const attempts =
    target.kind === "openrouter" ? OPENROUTER_MODEL_CANDIDATES : [undefined];
  let lastErr: unknown = null;
  for (const model of attempts) {
    try {
      return await callChatApi(target, messages, model);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * generateOpeningMessage() hardcodes api.deepseek.com and reads DEEPSEEK_API_KEY.
 * When only OPENROUTER_API_KEY is available, shim global fetch so the real
 * production function runs end-to-end against OpenRouter models.
 */
function installOpenRouterShim(target: ApiTarget) {
  if (target.kind !== "openrouter") return;
  process.env.DEEPSEEK_API_KEY = "shim-active";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, opts: any) => {
    if (String(url).includes("api.deepseek.com")) {
      const body = JSON.parse(String(opts.body));
      body.max_tokens = body.max_tokens || 8000;
      for (const model of OPENROUTER_MODEL_CANDIDATES) {
        const res = await realFetch(target.url, {
          ...opts,
          headers: { ...(opts.headers || {}), Authorization: `Bearer ${target.key}` },
          body: JSON.stringify({ ...body, model }),
        });
        if (!res.ok) continue;
        // Always rebuild the Response: reading res.json() here consumes the
        // body, so returning the original res would break the caller's parse.
        // Reasoning models (kimi/glm) may also return content:null with the
        // answer in `reasoning` — move it into content so callers work.
        const data: any = await res.json().catch(() => null);
        if (!data) continue;
        const msg = data?.choices?.[0]?.message;
        if (msg && !msg.content && msg.reasoning) {
          msg.content = msg.reasoning;
        }
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(target.url, {
        ...opts,
        headers: { ...(opts.headers || {}), Authorization: `Bearer ${target.key}` },
        body: JSON.stringify({ ...body, model: OPENROUTER_MODEL_CANDIDATES[0] }),
      });
    }
    return realFetch(url, opts);
  }) as typeof fetch;
}

/* ------------------------------- scenarios ------------------------------- */

/** generateOpeningMessage reads DB row shape (snake_case) */
function toDbShape(p: { name: string; knowledgeBase: string; securityPrompt: string }) {
  return {
    name: p.name,
    knowledge_base: p.knowledgeBase,
    security_prompt: p.securityPrompt,
  };
}

/* ------------- persona override (server/bot-prompt-test-persona.json) -------------
 * Drop this JSON next to the script to test a custom character without touching code.
 *   {
 *     "name": "齊天大聖",
 *     "knowledgeBase": "【人物背景設定】...【人物知識庫摘要】...【知識點分級】[...]【角色對話策略】...",
 *     "securityPrompt": "",
 *     "grade": "P4-P6",
 *     "turns": { "S1": [...], "S2": [...], "S3": [...], "S5": [...] },
 *     "checks": { "infoKeywords": [...], "affirmMarkers": [...], "correctionMarkers": [...] }
 *   }
 */
type PersonaOverride = {
  name?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
  grade?: string | null;
  turns?: { S1?: string[]; S2?: string[]; S3?: string[]; S5?: string[]; S6?: string[]; S7?: string[]; S8?: string[]; S9?: string[]; S10?: string[]; S11?: string[]; S12?: string[]; S13?: string[]; S14?: string[] };
  checks?: {
    infoKeywords?: string[];
    affirmMarkers?: string[];
    correctionMarkers?: string[];
    nextPointKeywords?: string[];
    s6CoveredPointIds?: string[];
    s6NextPointId?: string;
  };
};

function loadPersonaOverride(): PersonaOverride | null {
  const file = path.resolve(__dirname, "..", "bot-prompt-test-persona.json");
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PersonaOverride) : null;
  } catch (err) {
    console.warn("[test] bot-prompt-test-persona.json 解析失敗，已忽略：", String(err));
    return null;
  }
}

const DEFAULT_INFO_KEYWORDS = ["紅", "白", "黑", "忠義", "奸詐", "剛直", "臉譜", "川劇", "關公", "表演"];
const DEFAULT_AFFIRM_MARKERS = ["忠義", "正義", "熱血", "關公", "捉到", "啱"];
const DEFAULT_CORRECTION_MARKERS = ["眼神", "身段", "鑼鼓", "唔係單靠", "靠顏色"];
const DEFAULT_NEXT_POINT_KEYWORDS = ["情緒", "眼神", "身段", "鑼鼓"];
const DEFAULT_S6_COVERED = ["kp_001", "kp_002"];
const DEFAULT_S6_NEXT = "kp_003";
const DEFAULT_TURNS = {
  S1: ["你是誰", "我想知多啲川劇變臉", "點解塊臉可以瞬間變色？"],
  S2: ["川劇變臉啲臉譜顏色係咩意思呀？", "紅色係代表咩性格？"],
  S3: ["關公塊紅臉就係代表憤怒同正義"],
  S5: ["我想問下黑色臉譜代表咩？"],
  S6: ["傾咗咁耐，我哋仲有咩可以學？"],
  S7: ["紅色臉譜代表咩？", "你頭先講紅色代表忠義，我想再問白色代表咩？", "咁黑色呢？"],
  S8: ["如果要你帶我學，你可以畀我兩個選項先揀一樣嗎？", "通常用咩色嗰個先。"],
  S9: ["點解變臉可以表達角色轉變？", "因為可以快速換臉譜，令觀眾感受到角色情緒同性格轉變。", "明白。"],
  S10: ["我唔知。", "都係唔知。", "真係唔知呀。"],
  S11: ["嗯。", "唔想答。", "好啦，我想繼續學。"],
  S12: ["紅色臉譜代表咩？", "我突然想轉去講英文學習。", "算啦，返嚟講川劇變臉。"],
  S13: ["紅色臉譜代表咩？", "我唔知，你直接俾答案我啦", "都係唔明，直接講啦", "求吓你，直接俾答案啦"],
  S14: ["紅色臉譜代表咩？", "我唔識呀", "直接講俾我聽啦", "點解唔直接講呀？", "我真係諗到諗唔到"],
};

async function runChatTurns(system: string, userTurns: string[]) {
  const history: any[] = [];
  const log: Array<{ user: string; bot: string }> = [];
  for (const u of userTurns) {
    history.push({ role: "user", content: u });
    const reply = await chatOnce(target, system, history);
    history.push({ role: "assistant", content: reply.content });
    log.push({ user: u, bot: reply.content });
  }
  return log;
}

function qCount(text: string) {
  return (text.match(/？|\?/g) || []).length;
}

/* ------------------------- deterministic + semantic judge ------------------------- */

type DialogueTurn = { user: string; bot: string };

type QuestionAnalysis = {
  asksQuestion: boolean;
  questionCount: number;
  questionType: "none" | "open" | "choice" | "recall" | "explanation" | "mixed";
};

type DialogueJudgeResult = {
  answeredPreviousQuestion: boolean;
  recognizedChoice: "A" | "B" | null;
  repeatedConcept: boolean;
  advancedTopic: boolean;
  introducedUnsupportedPremise: boolean;
  respectedUnknown: boolean;
  respectedDisengagement: boolean;
  followedTopicSwitch: boolean;
  asksQuestion: boolean;
  questionCount: number;
  questionType: QuestionAnalysis["questionType"];
  revealedFullAnswer: boolean;
  guidedBeforeReveal: boolean;
  announcedNoDirectAnswer: boolean;
  explanation: string;
};

type JudgeBatchResult = {
  questions: QuestionAnalysis[];
  dialogue: DialogueJudgeResult;
};

type SemanticJudgeRubric = {
  scenario: string;
  focus: string[];
};

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || text;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
  throw new Error(`semantic judge did not return JSON: ${text.slice(0, 300)}`);
}

async function semanticJudge(log: DialogueTurn[], rubric: SemanticJudgeRubric): Promise<JudgeBatchResult> {
  const transcript = log
    .map((t, i) => `第${i + 1}輪\n學生：${t.user}\nBot：${t.bot}`)
    .join("\n\n");

  const system = `你係「對話品質 Semantic Judge」，只負責判斷 Bot 回覆是否符合對話規則。\n\n` +
    `重要：問題識別必須以語意為準，唔可以靠固定粵語問句詞典。\n` +
    `只要 Bot 語意上要求學生作答、猜測、選擇、解釋、描述觀察、表達看法或回憶內容，就視為 asksQuestion=true。\n` +
    `自然粵語可以用任何問法，例如「你諗下」、「估下啦」、「你又點睇」、「你會揀邊樣」、「你仲記唔記得」；唔要求固定句式。\n` +
    `questionCount 係語意上的問題數量，不要只數問號。若一句有兩個獨立要求作答嘅問題，計 2。\n` +
    `choice 只有當 Bot 明確提供 A/B（或兩個清楚可選項）而學生其後作出選擇時先判定。\n` +
    `repeatedConcept=true 代表 Bot 實質上再次要求學生回答已經回答過、或已經明確表示不知道嘅同一概念；單純補充同一知識唔算。\n` +
    `introducedUnsupportedPremise=true 代表 Bot 把對話/知識庫冇支持嘅事當成已知事實，或者無中生有地聲稱「你頭先講過」而實際冇講。\n` +
    `respectedUnknown=true 代表學生表示不知道後，Bot 有降低難度、直接解釋、提供提示/答案，且冇無限重問同一概念。俾咗新提示／新線索／收窄範圍之後再問一次，係引導階梯嘅正常一步，唔算逼問；只有冇新嘢嘅原地重問先算。直接俾咗答案（揭曉）就係最高程度嘅尊重；揭曉之後要求學生用自己嘅說話重述，係交返俾學生嘅設計，唔算逼問。\n` +
    `respectedDisengagement=true 代表學生明確唔想答/唔想繼續時，Bot 冇逼問，而係降低壓力、提供退出/轉話題空間。\n` +
    `followedTopicSwitch=true 代表學生明確轉換話題後，Bot 有跟隨新話題，而唔係繼續原題。\n` +
    `revealedFullAnswer=true 代表對話中 Bot 直接講出咗完整答案（例如明確講「紅色代表忠義」或完整解釋咗學生問嘅知識點）；只俾提示、選項或反問唔算。\n` +
    `guidedBeforeReveal 只睇第一輪（Bot 第一次回覆）：嗰一輪有冇包含學生問嗰個答案事實。有答案事實（即使同時有提問）＝false；純問題／提示／類比／選項＝true。後續輪唔影響呢個欄位。\n` +
    `announcedNoDirectAnswer=true 代表 Bot 喺對話開頭或早期明確講過類似「呢段對話我唔會直接俾答案，而係會引導你」嘅說明（無論點樣措辭）；純問候、自我介紹或普通提問唔算。\n` +
    `\n` +
    `輸出格式（必須嚴格遵守，直接輸出以下結構嘅 JSON，唔好加任何其他鍵）：\n` +
    `{"questions":[{"asksQuestion":false,"questionCount":0,"questionType":"none"},...],"dialogue":{"answeredPreviousQuestion":false,"recognizedChoice":null,"repeatedConcept":false,"advancedTopic":false,"introducedUnsupportedPremise":false,"respectedUnknown":false,"respectedDisengagement":false,"followedTopicSwitch":false,"asksQuestion":false,"questionCount":0,"questionType":"none","revealedFullAnswer":false,"guidedBeforeReveal":false,"announcedNoDirectAnswer":false,"explanation":""}}\n` +
    `questions 必須同對話輪數一致，每輪一個元素；questionType 只可以係 none/open/choice/recall/explanation/opinion/observation/comparison/prediction/mixed 其中之一；recognizedChoice 只可以係 "A"/"B"/null。\n` +
    `只輸出 JSON，不要 Markdown，不要額外解釋。`;

  const user = JSON.stringify({ rubric, transcript }, null, 2);
  const response = await callChatApi(target, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], undefined, 1800, 0);
  const parsed: any = extractJson(response.content);

  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  if (questions.length !== log.length) {
    throw new Error(`semantic judge questions length ${questions.length} != turns ${log.length}`);
  }
  const dialogue: DialogueJudgeResult = {
    answeredPreviousQuestion: Boolean(parsed?.dialogue?.answeredPreviousQuestion),
    recognizedChoice: parsed?.dialogue?.recognizedChoice === "A" || parsed?.dialogue?.recognizedChoice === "B"
      ? parsed.dialogue.recognizedChoice
      : null,
    repeatedConcept: Boolean(parsed?.dialogue?.repeatedConcept),
    advancedTopic: Boolean(parsed?.dialogue?.advancedTopic),
    introducedUnsupportedPremise: Boolean(parsed?.dialogue?.introducedUnsupportedPremise),
    respectedUnknown: Boolean(parsed?.dialogue?.respectedUnknown),
    respectedDisengagement: Boolean(parsed?.dialogue?.respectedDisengagement),
    followedTopicSwitch: Boolean(parsed?.dialogue?.followedTopicSwitch),
    asksQuestion: Boolean(parsed?.dialogue?.asksQuestion),
    questionCount: Number(parsed?.dialogue?.questionCount || 0),
    questionType: ["none", "open", "choice", "recall", "explanation", "mixed"].includes(parsed?.dialogue?.questionType)
      ? parsed.dialogue.questionType
      : "none",
    revealedFullAnswer: Boolean(parsed?.dialogue?.revealedFullAnswer),
    guidedBeforeReveal: Boolean(parsed?.dialogue?.guidedBeforeReveal),
    announcedNoDirectAnswer: Boolean(parsed?.dialogue?.announcedNoDirectAnswer),
    explanation: String(parsed?.dialogue?.explanation || ""),
  };
  return {
    questions: questions.map((q: any) => ({
      asksQuestion: Boolean(q?.asksQuestion),
      questionCount: Math.max(0, Number(q?.questionCount || 0)),
      questionType: ["none", "open", "choice", "recall", "explanation", "mixed"].includes(q?.questionType)
        ? q.questionType
        : "none",
    })),
    dialogue,
  };
}

/* --------------------------------- checks -------------------------------- */

type CheckResult = { label: string; pass: boolean; detail: string };

const CANTO_PARTICLES = /(係|喎|咩|㗎|啦|喇|嚟|哋|咁|嘅|佢|唔)/;
const MANDARIN_FORBIDDEN = /(咱们|咱|啥|咋)/;

function checkS1(log: Array<{ user: string; bot: string }>, name: string): CheckResult[] {
  const namePattern = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const introIn = (i: number) => new RegExp(`${namePattern}|我是|我係`).test(log[i]?.bot || "");
  return [
    {
      label: "S1a 第一輪自介（應該有）",
      pass: introIn(0),
      detail: introIn(0) ? "第一輪有自介" : "第一輪冇自介（可能以其他方式應對，可接受但注意）",
    },
    {
      label: "S1b 第二輪冇重複自介",
      pass: !introIn(1),
      detail: introIn(1) ? "第二輪仍然重複自介 ❌" : "第二輪冇重複自介",
    },
    {
      label: "S1c 第三輪冇重複自介",
      pass: !introIn(2),
      detail: introIn(2) ? "第三輪仍然重複自介 ❌" : "第三輪冇重複自介",
    },
  ];
}

async function checkS2(log: DialogueTurn[], infoKeywords: string[]): Promise<CheckResult[]> {
  const kw = infoKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const infoPattern = new RegExp(`(${kw})`);
  const judged = await semanticJudge(log, {
    scenario: "S2：訊息先行、自然提問",
    focus: [
      "每輪先提供與學生問題相關嘅實質資訊",
      "如果有提問，只可以有一條語意上的問題",
      "提問可以係自然粵語，唔應依賴固定問句詞",
    ],
  });

  return log.map((t, i) => {
    const hasInfo = infoPattern.test(t.bot);
    const q = judged.questions[i];
    const deterministicSingleQ = qCount(t.bot) <= 1;
    const semanticSingleQ = q.questionCount <= 1;
    const pass = hasInfo && deterministicSingleQ && semanticSingleQ;
    return {
      label: `S2 第${i + 1}輪：有資訊 + 最多一條語意問題`,
      pass,
      detail: `資訊:${hasInfo ? "有" : "冇"} 語意提問:${q.asksQuestion ? "有" : "冇"} 語意問題數:${q.questionCount} 問號:${qCount(t.bot)} 類型:${q.questionType}` ,
    };
  });
}
function checkS3(
  log: Array<{ user: string; bot: string }>,
  affirmMarkers: string[],
  correctionMarkers: string[]
): CheckResult[] {
  const bot = log[0]?.bot || "";
  const affirm = new RegExp(`(${affirmMarkers.join("|")})`).test(bot);
  const correct = new RegExp(`(${correctionMarkers.join("|")})`).test(bot);
  const fullEndorse = /(冇錯|講得好啱|完全正確)/.test(bot) && !correct;
  return [
    {
      label: "S3a 先肯定觀察（答案全錯時直接溫和校正亦可）",
      pass: affirm || correct,
      detail: affirm
        ? "有肯定正確部分"
        : correct
          ? "冇肯定，但答案全錯時直接校正（符合規則）"
          : "冇肯定亦冇校正 ❌",
    },
    {
      label: "S3b 再精準校正錯誤部分",
      pass: correct,
      detail: correct ? "有校正（眼神/身段/鑼鼓或類似）" : "冇校正憤怒≠顏色嘅錯誤認知 ❌",
    },
    {
      label: "S3c 冇全盤點頭",
      pass: !fullEndorse,
      detail: fullEndorse ? "全盤肯定錯誤認知 ❌" : "冇全盤點頭",
    },
  ];
}

function checkS5(log: Array<{ user: string; bot: string }>): CheckResult[] {
  const bot = log[0]?.bot || "";
  const noGendered = !/(師弟|師妹|妹妹|弟弟|哥哥|仔仔|囡囡)/.test(bot);
  const usesClassmate = /同學/.test(bot);
  return [
    {
      label: "S5a 冇用性別化稱呼（師弟/師妹等）",
      pass: noGendered,
      detail: noGendered ? "冇性別化稱呼" : "用咗性別化稱呼 ❌",
    },
    {
      label: "S5b 用「同學」或冇稱呼",
      pass: usesClassmate || !/(師弟|師妹|同學|你係)/.test(bot),
      detail: usesClassmate ? "有用「同學」" : "冇稱呼（可接受）",
    },
  ];
}

function checkS6(log: Array<{ user: string; bot: string }>, nextPointKeywords: string[]): CheckResult[] {
  const bot = log[0]?.bot || "";
  const advances = new RegExp(`(${nextPointKeywords.join("|")})`).test(bot);
  const summarizes = /(學咗|到而家|小結|總結|記住|你而家識)/.test(bot);
  const singleQ = qCount(bot) <= 1;
  return [
    {
      label: "S6a 推進到未覆蓋知識點（冇重複已覆蓋）",
      pass: advances,
      detail: advances ? "回覆含未覆蓋知識點內容" : "未見推進到下一步目標 ❌",
    },
    {
      label: "S6b 有小結（turnsSinceSummary 達標觸發）",
      pass: summarizes,
      detail: summarizes ? "有小結句式" : "冇小結 ❌",
    },
    {
      label: "S6c 問號最多一個",
      pass: singleQ,
      detail: `問號數:${qCount(bot)}`,
    },
  ];
}

function checkSemanticScenario(
  label: string,
  judge: JudgeBatchResult,
  rules: Array<{ suffix: string; pass: boolean; detail: string }>
): CheckResult[] {
  return rules.map((r) => ({ label: `${label}${r.suffix}`, pass: r.pass, detail: r.detail }));
}

async function runSemanticScenario(
  id: string,
  label: string,
  log: DialogueTurn[],
  focus: string[],
  rules: (j: JudgeBatchResult) => Array<{ suffix: string; pass: boolean; detail: string }>
): Promise<{ checks: CheckResult[]; judge: JudgeBatchResult }> {
  const judge = await semanticJudge(log, { scenario: id, focus });
  return { checks: checkSemanticScenario(label, judge, rules(judge)), judge };
}

function checkS4Opening(
  label: string,
  text: string,
  expect: "cantonese" | "english-mixed"
): CheckResult[] {
  if (expect === "cantonese") {
    const hasCanto = CANTO_PARTICLES.test(text);
    const noMandarin = !MANDARIN_FORBIDDEN.test(text);
    return [
      {
        label: `S4 ${label}：粵語口語 + 冇北方話`,
        pass: hasCanto && noMandarin,
        detail: `粵語詞:${hasCanto ? "有" : "冇"} 北方話:${noMandarin ? "冇" : "有"}`,
      },
    ];
  }
  const hasEnglish = /[A-Za-z]{3,}/.test(text);
  return [
    {
      label: `S4 ${label}：英文或中英混合`,
      pass: hasEnglish,
      detail: hasEnglish ? "含英文" : "完全冇英文 ❌",
    },
  ];
}

/* ---------------------------------- main --------------------------------- */

const target = pickApiTarget();
if (!target) {
  console.error("No API key found: set DEEPSEEK_API_KEY or OPENROUTER_API_KEY.");
  process.exit(1);
}
installOpenRouterShim(target);

const only = process.argv.slice(2).map((a) => String(a).toUpperCase()).filter((a) => /^S(?:[1-9]|1[0-4])$/.test(a));
const run = (id: string) => only.length === 0 || only.includes(id);

const override = loadPersonaOverride();
const persona = {
  name: override?.name || PERSONA_CANTONESE.name,
  knowledgeBase: override?.knowledgeBase || PERSONA_CANTONESE.knowledgeBase,
  securityPrompt: override?.securityPrompt ?? PERSONA_CANTONESE.securityPrompt,
  grade: override?.grade ?? PERSONA_CANTONESE.grade,
};
const turns = {
  S1: override?.turns?.S1 || DEFAULT_TURNS.S1,
  S2: override?.turns?.S2 || DEFAULT_TURNS.S2,
  S3: override?.turns?.S3 || DEFAULT_TURNS.S3,
  S5: override?.turns?.S5 || DEFAULT_TURNS.S5,
  S6: override?.turns?.S6 || DEFAULT_TURNS.S6,
  S7: override?.turns?.S7 || DEFAULT_TURNS.S7,
  S8: override?.turns?.S8 || DEFAULT_TURNS.S8,
  S9: override?.turns?.S9 || DEFAULT_TURNS.S9,
  S10: override?.turns?.S10 || DEFAULT_TURNS.S10,
  S11: override?.turns?.S11 || DEFAULT_TURNS.S11,
  S12: override?.turns?.S12 || DEFAULT_TURNS.S12,
  S13: override?.turns?.S13 || DEFAULT_TURNS.S13,
  S14: override?.turns?.S14 || DEFAULT_TURNS.S14,
};
const checkConfig = {
  infoKeywords: override?.checks?.infoKeywords || DEFAULT_INFO_KEYWORDS,
  affirmMarkers: override?.checks?.affirmMarkers || DEFAULT_AFFIRM_MARKERS,
  correctionMarkers: override?.checks?.correctionMarkers || DEFAULT_CORRECTION_MARKERS,
  nextPointKeywords: override?.checks?.nextPointKeywords || DEFAULT_NEXT_POINT_KEYWORDS,
  s6CoveredPointIds: override?.checks?.s6CoveredPointIds || DEFAULT_S6_COVERED,
  s6NextPointId: override?.checks?.s6NextPointId || DEFAULT_S6_NEXT,
};

const systemPrompt = buildChatSystemPrompt({
  roleName: persona.name,
  knowledgeBase: persona.knowledgeBase,
  securityPrompt: persona.securityPrompt,
  gradeBand: persona.grade,
});

const report: string[] = [];
const servedModels = new Set<string>();
const out = (line: string) => {
  console.log(line);
  report.push(line);
};
const line = () => out("-".repeat(70));

const summary: Array<{ label: string; pass: boolean }> = [];

async function main() {
  out(`Bot prompt rules test — ${new Date().toISOString()}`);
  out(`API target: ${target.kind}${target.kind === "openrouter" ? " (deepseek via OpenRouter)" : ""}`);
  out(`Scenarios: ${only.length ? only.join(", ") : "S1 S2 S3 S4 S5 S6 S7 S8 S9 S10 S11 S12 S13 S14"}`);
  if (override) {
    out(`Persona override: bot-prompt-test-persona.json（${persona.name}，grade=${persona.grade || "未設定"}）`);
  }
  line();

  if (run("S1")) {
    out("【S1 自我介紹只准一次】");
    const log = await runChatTurns(systemPrompt, turns.S1);
    log.forEach((t, i) => {
      out(`--- 第${i + 1}輪 ---`);
      out(`學生：${t.user}`);
      out(`Bot：${t.bot}`);
    });
    for (const c of checkS1(log, persona.name)) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  }

  if (run("S2")) {
    out("【S2 訊息先行：問之前必須先俾資訊】");
    const log = await runChatTurns(systemPrompt, turns.S2);
    log.forEach((t, i) => {
      out(`--- 第${i + 1}輪 ---`);
      out(`學生：${t.user}`);
      out(`Bot：${t.bot}`);
    });
    for (const c of await checkS2(log, checkConfig.infoKeywords)) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  }

  if (run("S3")) {
    out("【S3 先肯定觀察，再精準校正】");
    const log = await runChatTurns(systemPrompt, turns.S3);
    log.forEach((t, i) => {
      out(`--- 第${i + 1}輪 ---`);
      out(`學生：${t.user}`);
      out(`Bot：${t.bot}`);
    });
    for (const c of checkS3(log, checkConfig.affirmMarkers, checkConfig.correctionMarkers)) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  }

  if (run("S5")) {
    out("【S5 稱呼唔假設性別】");
    const log = await runChatTurns(systemPrompt, turns.S5);
    log.forEach((t, i) => {
      out(`--- 第${i + 1}輪 ---`);
      out(`學生：${t.user}`);
      out(`Bot：${t.bot}`);
    });
    for (const c of checkS5(log)) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  }

  if (run("S6")) {
    out("【S6 狀態驅動 Advance：後台實錄已覆蓋知識點 → 推進下一步 + 小結】");
    const statePrompt = buildChatSystemPrompt({
      roleName: persona.name,
      knowledgeBase: persona.knowledgeBase,
      securityPrompt: persona.securityPrompt,
      gradeBand: persona.grade,
      conversationState: {
        coveredPointIds: checkConfig.s6CoveredPointIds,
        nextPointId: checkConfig.s6NextPointId,
        turnsSinceSummary: 4,
      },
    });
    const log = await runChatTurns(statePrompt, turns.S6);
    log.forEach((t, i) => {
      out(`--- 第${i + 1}輪 ---`);
      out(`學生：${t.user}`);
      out(`Bot：${t.bot}`);
    });
    for (const c of checkS6(log, checkConfig.nextPointKeywords)) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  }

  const runAndReportSemantic = async (
    id: string,
    title: string,
    scenarioTurns: string[],
    focus: string[],
    makeChecks: (j: JudgeBatchResult) => Array<{ suffix: string; pass: boolean; detail: string }>,
    systemPromptOverride?: string,
    questionRule: "marks" | "semantic" = "marks"
  ) => {
    if (!run(id)) return;
    out(`【${id} ${title}】`);
    const log = await runChatTurns(systemPromptOverride || systemPrompt, scenarioTurns);
    log.forEach((t, i) => {
      out(`--- 第${i + 1}輪 ---`);
      out(`學生：${t.user}`);
      out(`Bot：${t.bot}`);
    });
    const { checks, judge } = await runSemanticScenario(id, id, log, focus, makeChecks);
    // 「最多一條問題」：預設用硬性問號數（legacy 檢查）。S13/S14 嘅階梯輪
    // （「A 定 B？」）天然多問號，而測試架構第一原則係「語意 judge 係最終權威」，
    // 所以呢兩個場景以語意問題數為準，問號數只做 reference。
    const hardQuestionChecks: CheckResult[] = log.map((t, i) => {
      const marksOk = qCount(t.bot) <= 1;
      const semanticOk = (judge.questions[i]?.questionCount ?? 99) <= 1;
      return questionRule === "semantic"
        ? {
            label: `${id} q${i + 1} 最多一條問題（語意）`,
            pass: semanticOk,
            detail: `語意問題數:${judge.questions[i]?.questionCount ?? "?"}（問號數:${qCount(t.bot)} 只作參考）`,
          }
        : {
            label: `${id} q${i + 1} 最多一條硬性問號限制`,
            pass: marksOk,
            detail: `問號數:${qCount(t.bot)}`,
          };
    });
    for (const c of [...checks, ...hardQuestionChecks]) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  };

  await runAndReportSemantic("S7", "上下文連貫：唔可以失憶/自相矛盾", turns.S7,
    ["理解上一輪已提供嘅事實", "回答追問時沿用同一上下文", "不可把未發生嘅對話當成已發生"],
    (j) => [
      { suffix: "a 上下文冇失憶", pass: j.dialogue.answeredPreviousQuestion || !j.dialogue.introducedUnsupportedPremise, detail: `上下文回應:${j.dialogue.answeredPreviousQuestion ? "有" : "弱"}` },
      { suffix: "b 冇無中生有前提", pass: !j.dialogue.introducedUnsupportedPremise, detail: j.dialogue.introducedUnsupportedPremise ? "發明咗未發生嘅前提 ❌" : "冇發明對話前提" },
    ]);

  await runAndReportSemantic("S8", "選項解析：學生揀咗 B 就當答案", turns.S8,
    ["如果 Bot 提供 A/B 選擇，學生後一句要按語意視為選擇答案", "唔可以因為學生冇重複完整選項句子而忽略答案"],
    (j) => [
      { suffix: "a 正確解析學生選擇", pass: j.dialogue.recognizedChoice === "B", detail: `Semantic Judge 判定:${j.dialogue.recognizedChoice || "未識別"}` },
      { suffix: "b 冇重問已選選項", pass: !j.dialogue.repeatedConcept, detail: j.dialogue.repeatedConcept ? "重問同一選擇概念 ❌" : "冇重問同一選擇" },
    ]);

  await runAndReportSemantic("S9", "答啱之後推進：唔可以原地重問", turns.S9,
    ["學生已經明確回答後，Bot 應承認答案並補充，然後推進新知識/新角度", "唔應再次要求學生回答同一概念"],
    (j) => [
      { suffix: "a 答案有被接住", pass: j.dialogue.answeredPreviousQuestion, detail: j.dialogue.answeredPreviousQuestion ? "有接住學生答案" : "未見接住上一問題答案 ❌" },
      { suffix: "b 冇重複概念", pass: !j.dialogue.repeatedConcept, detail: j.dialogue.repeatedConcept ? "重問同一概念 ❌" : "冇重問同一概念" },
      { suffix: "c 有推進", pass: j.dialogue.advancedTopic, detail: j.dialogue.advancedTopic ? "有推進到下一層" : "未見明顯推進 ❌" },
    ]);

  await runAndReportSemantic("S10", "不知道升級：唔可以無限 Socratic 重問", turns.S10,
    ["學生連續表示不知道時，應降低難度、提示或直接解釋", "不可無限重問同一知識點"],
    (j) => [
      { suffix: "a 有尊重不知道", pass: j.dialogue.respectedUnknown, detail: j.dialogue.respectedUnknown ? "有降級/解釋" : "仍然逼學生猜 ❌" },
      { suffix: "b 冇循環重問", pass: !j.dialogue.repeatedConcept, detail: j.dialogue.repeatedConcept ? "出現循環重問 ❌" : "冇循環重問" },
    ]);

  await runAndReportSemantic("S11", "唔想答：先尊重狀態，再提供低壓選擇", turns.S11,
    ["學生明確表示唔想答時，不應施壓或繼續逼答", "可以簡短回應並提供繼續/轉話題等低壓選擇"],
    (j) => [
      { suffix: "a 尊重唔想答", pass: j.dialogue.respectedDisengagement, detail: j.dialogue.respectedDisengagement ? "有尊重學生狀態" : "未見尊重狀態 ❌" },
      { suffix: "b 冇重複逼問", pass: !j.dialogue.repeatedConcept, detail: j.dialogue.repeatedConcept ? "仍然逼答同一概念 ❌" : "冇重複逼問" },
    ]);

  await runAndReportSemantic("S12", "明確轉題：跟住學生新話題", turns.S12,
    ["學生明確要求轉換話題時，下一輪應跟隨新話題", "學生再轉回原題時，先跟返原題", "不可強行把舊問題塞返去"],
    (j) => [
      { suffix: "a 跟隨轉題", pass: j.dialogue.followedTopicSwitch, detail: j.dialogue.followedTopicSwitch ? "有跟新話題" : "未跟隨新話題 ❌" },
      { suffix: "b 冇無理拉回舊題", pass: !j.dialogue.introducedUnsupportedPremise, detail: j.dialogue.introducedUnsupportedPremise ? "有不合理前提 ❌" : "冇無理新增前提" },
    ]);

  await runAndReportSemantic("S13", "引導後再回答：第一輪唔准倒答案，卡住照階梯推進，最終俾答案連解釋", turns.S13,
    [
      "學生第一次問知識問題時，Bot 必須先引導（提問/提示/選項），唔可以即刻倒出完整答案",
      "學生連續卡住並直接要求答案時，Bot 依階梯推進：更具體提示或選項，最終俾完整答案連解釋",
      "最終答案要落喺學生問嘅知識上，唔可以顧左右而言他",
    ],
    (j) => [
      {
        suffix: "a 第一輪冇倒答案",
        pass: j.dialogue.guidedBeforeReveal,
        detail: j.dialogue.guidedBeforeReveal ? "有先引導" : "第一輪就倒咗完整答案 ❌",
      },
      {
        suffix: "b 卡住後最終有俾答案",
        pass: j.dialogue.revealedFullAnswer,
        detail: j.dialogue.revealedFullAnswer ? "有揭曉答案" : "全程冇俾到答案 ❌",
      },
    ],
    undefined,
    "semantic"
  );

  // S14 用「不直接給答案」：同樣嘅 fixture，只係【答題策略】換咗，
  // 斷言行為跟返更嚴格嘅階梯（更慢，但最終都要有答案）。
  const strictKnowledgeBase = persona.knowledgeBase.replace(
    /【答題策略】[^\n]*/,
    "【答題策略】不直接給答案"
  );
  const strictPrompt = buildChatSystemPrompt({
    roleName: persona.name,
    knowledgeBase: strictKnowledgeBase,
    securityPrompt: persona.securityPrompt,
    gradeBand: persona.grade,
  });
  await runAndReportSemantic("S14", "不直接給答案：更長卡關階梯，最終仍然要俾答案連解釋", turns.S14,
    [
      "學生第一次問知識問題時，Bot 必須先引導，唔可以即刻倒出完整答案",
      "學生連續卡住並直接要求答案時，Bot 依更謹慎嘅階梯推進，最終俾完整答案連解釋",
      "學生表示唔識時要尊重狀態：俾新線索、收窄範圍或選項之後再問一次係階梯嘅正常一步，只要唔係冇新嘢嘅原地重問就唔算逼問",
    ],
    (j) => [
      {
        suffix: "a 第一輪冇倒答案",
        pass: j.dialogue.guidedBeforeReveal,
        detail: j.dialogue.guidedBeforeReveal ? "有先引導" : "第一輪就倒咗完整答案 ❌",
      },
      {
        suffix: "b 卡住後最終有俾答案",
        pass: j.dialogue.revealedFullAnswer,
        detail: j.dialogue.revealedFullAnswer ? "有揭曉答案" : "全程冇俾到答案 ❌",
      },
      {
        suffix: "c 尊重「唔識」",
        pass: j.dialogue.respectedUnknown,
        detail: j.dialogue.respectedUnknown ? "有降難度/解釋" : "仍然逼學生猜 ❌",
      },
    ],
    strictPrompt,
    "semantic"
  );

  if (run("S13") || run("S14")) {
    out("【S13/S14 開場引導說明：兩個引導模式都要生成「唔會直接俾答案」變體】");
    // 生產用 Gemini、呢度用 DeepSeek/OpenRouter：同 prompt 唔同 provider，
    // 回歸斷言係「行為」（語意上講咗引導說明），唔係逐字比對。
    for (const mode of ["引導後再回答", "不直接給答案"] as const) {
      const modeKnowledgeBase = persona.knowledgeBase.replace(
        /【答題策略】[^\n]*/,
        `【答題策略】${mode}`
      );
      const announcementPrompt = buildGuidedAnnouncementPrompt({
        roleName: persona.name,
        knowledgeBase: modeKnowledgeBase,
        securityPrompt: persona.securityPrompt,
        replyLanguage: "cantonese",
        answerMode: mode,
      });
      const announcement = (
        await chatOnce(target, announcementPrompt.systemPrompt, [
          { role: "user", content: announcementPrompt.userPrompt },
        ])
      ).content.trim();
      out(`${mode} 開場說明：「${announcement}」`);

      const nonEmpty = announcement.length > 0;
      const shortEnough = announcement.length <= 60;
      const judged = await semanticJudge(
        [{ user: "（開場）", bot: announcement }],
        {
          scenario: "開場引導說明",
          focus: ["Bot 向學生說明呢段對話唔會直接俾答案，而係用問題同提示引導學生自己諗"],
        }
      );
      const labels = [
        { label: `開場說明（${mode}）a 非空`, pass: nonEmpty, detail: `字數:${announcement.length}` },
        { label: `開場說明（${mode}）b ≤60 字`, pass: shortEnough, detail: `字數:${announcement.length}` },
        {
          label: `開場說明（${mode}）c 語意上講咗「唔會直接俾答案」`,
          pass: judged.dialogue.announcedNoDirectAnswer,
          detail: judged.dialogue.announcedNoDirectAnswer ? "有說明" : "語意上冇說明 ❌",
        },
      ];
      for (const c of labels) {
        summary.push({ label: c.label, pass: c.pass });
        out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
      }
    }
    line();
  }

  if (run("S4")) {
    out("【S4 開場白語言跟角色人設】");
    const cantoOpen = await generateOpeningMessage(toDbShape(persona));
    out(`${persona.name}開場白：「${cantoOpen}」`);
    for (const c of checkS4Opening(persona.name, cantoOpen, "cantonese")) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    const pennyOpen = await generateOpeningMessage(toDbShape(PERSONA_ENGLISH_TEACHER));
    out(`Penny 開場白：「${pennyOpen}」`);
    for (const c of checkS4Opening("Penny", pennyOpen, "english-mixed")) {
      summary.push({ label: c.label, pass: c.pass });
      out(`${c.pass ? "PASS" : "FAIL"}  ${c.label} ｜ ${c.detail}`);
    }
    line();
  }

  out("【總覽】");
  out(`模型實際服務：${[...servedModels].join(", ") || "（無）"}`);
  const passCount = summary.filter((s) => s.pass).length;
  out(`PASS ${passCount}/${summary.length}`);
  summary.forEach((s) => out(`  ${s.pass ? "✅" : "❌"} ${s.label}`));

  fs.writeFileSync(
    path.resolve(__dirname, "..", "bot-prompt-test-output.txt"),
    report.join("\n") + "\n",
    "utf8"
  );
  out(`\nReport saved: server/bot-prompt-test-output.txt`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
