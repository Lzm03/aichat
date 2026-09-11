/**
 * Bot prompt rules test — run from server/:  node --import tsx scripts/test-bot-prompt.ts [S1 S2 S3 S4]
 *
 * Verifies the revised chat-prompt.ts rules + bots.ts opening-message generation
 * against a real LLM API. Uses DEEPSEEK_API_KEY if present, otherwise falls back
 * to OPENROUTER_API_KEY (openrouter deepseek models). No DB access needed.
 *
 * Scenarios (kept minimal to save tokens):
 *   S1  self-intro only once
 *   S2  info-before-question rhythm
 *   S3  affirm-then-correct misconception
 *   S4  opening message language (Cantonese senior + English teacher)
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: false });

import { buildChatSystemPrompt } from "../../utils/chat-prompt.ts";
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
  model?: string
) {
  const body: any = { messages, stream: false, max_tokens: 8000 };
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
  turns?: { S1?: string[]; S2?: string[]; S3?: string[]; S5?: string[]; S6?: string[] };
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

function checkS2(log: Array<{ user: string; bot: string }>, infoKeywords: string[]): CheckResult[] {
  const kw = infoKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const infoPattern = new RegExp(`(${kw})`);
  // A question may end without "？" when output is cut or spoken-style, so also
  // detect question lead-in words.
  const askWords = /(你估|你覺得|考下你|邊個|邊樣|你想|知唔知|點解|係唔係)/;
  return log.map((t, i) => {
    const hasInfo = infoPattern.test(t.bot);
    const hasQuestion = qCount(t.bot) >= 1 || askWords.test(t.bot);
    const singleQ = qCount(t.bot) <= 1;
    // Info is always required; a question is optional, but if asked it must be single.
    const pass = hasInfo && singleQ;
    return {
      label: `S2 第${i + 1}輪：每輪有資訊（問可選，問只一條）`,
      pass,
      detail: `資訊:${hasInfo ? "有" : "冇"} 問句:${hasQuestion ? "有" : "冇"} 問號數:${qCount(t.bot)}`,
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

const only = process.argv.slice(2).map((a) => String(a).toUpperCase()).filter((a) => /^S\d$/.test(a));
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
  out(`Scenarios: ${only.length ? only.join(", ") : "S1 S2 S3 S4 S5 S6"}`);
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
    for (const c of checkS2(log, checkConfig.infoKeywords)) {
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
