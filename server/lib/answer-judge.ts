/**
 * Gemini LLM 判斷（D4）：判斷學生喺近期對話入面「答啱咗邊啲教學目標（core）知識點」，
 * 順帶（同一次 call）將「新訊息」做課堂參與度分類（meaningless / effective）。
 *
 * 取代字串匹配嘅「學生證據」嗰半 —— 字串匹配只捉到「學生提過 keyword」，
 * 捉唔到「答啱」定「答錯」，亦捉唔到「用自己說話答啱但冇用 keyword」。
 * 呢度用 Gemini 低溫做一次判斷 call，輸出結構化 JSON。
 *
 * 參與度判斷唔另開 call（docs/class-participation.md 成本上限）：
 * `judgeConversationWindow` 一次 call 同時出 demonstrated + engagement；
 * `judgeStudentAnswers` 係薄 wrapper，供舊 caller（conversation-state）保持語義不變。
 *
 * 節流策略（每 3 輪 + 免費預濾）係純函數，方便單測；真正接線喺 conversation-state。
 */
import type { KnowledgePoint } from "../../utils/chat-prompt.ts";
import {
  GEMINI_TEXT_MODEL,
  getAI,
} from "./gemini-server.ts";
import {
  JUDGE_SUBSTANTIVE_MIN,
  parseEngagement,
  type EngagementVerdict,
} from "./engagement.ts";

/** 每幾多輪先跑一次判斷（跟小結節奏，唔好每輪都打 LLM） */
export const JUDGE_INTERVAL_TURNS = 3;

export { JUDGE_SUBSTANTIVE_MIN };

/** 判斷窗口內有冇「實質學生輸入」；冇就唔使打 LLM（免費預濾） */
export function hasSubstantiveStudentInput(
  turns: Array<{ role: "student" | "bot"; content: string }>
): boolean {
  return turns.some(
    (turn) =>
      turn.role === "student" &&
      turn.content.trim().length >= JUDGE_SUBSTANTIVE_MIN
  );
}

/** 節流 + 預濾：夠唔夠鐘（≥ 每 3 輪）而且窗口有嘢好判斷先跑 */
export function shouldRunJudge(
  turnsSinceLastJudge: number,
  turns: Array<{ role: "student" | "bot"; content: string }>
): boolean {
  if (turnsSinceLastJudge < JUDGE_INTERVAL_TURNS) return false;
  return hasSubstantiveStudentInput(turns);
}

function parseDemonstrated(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.demonstrated)) {
      return parsed.demonstrated.map(String).filter(Boolean);
    }
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    return [];
  } catch {
    const block = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!block) return [];
    try {
      const parsed = JSON.parse(block);
      return Array.isArray(parsed?.demonstrated)
        ? parsed.demonstrated.map(String).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }
}

const JUDGE_SYSTEM_PROMPT = `你是教學評估器。你根據「教學目標知識點清單」同「近期對話」，判斷學生有邊啲知識點已經真正答啱、展現出理解，並將「新訊息」做參與度分類。

規則：
1. 只輸出合法 JSON，格式：{"demonstrated":["kp_001","kp_002"],"engagement":{"meaningless":[],"effective":[]}}
2. 只計學生「自己答出嚟」嘅理解，bot 講咗但學生冇回應嘅唔計。
3. 學生用自己說話表達出正確概念，即使冇用到關鍵詞，都要計。
4. 學生答錯、含糊、只重複 bot 嘅話、或者純離題，唔計。
5. 冇任何一點答啱，demonstrated 用 []；「新訊息」區塊標示（無）時，engagement 兩個 array 都用 []。
6. engagement 淨係分類「新訊息」區塊入面、已編號嘅學生訊息，兩個 array 用 0-based 編號：
   - meaningless = 冇實質內容（「哦」「唔知」「係」、亂打字、純測試）
   - effective = 學生主動提出、同學習內容相關嘅問題
   - 有實質內容但唔係提問 = 兩個 array 都唔列；一條訊息兩邊都列時以 meaningless 為準
7. 唔好輸出 JSON 以外嘅文字。`.trim();

function buildJudgeUserPrompt(
  points: KnowledgePoint[],
  turns: Array<{ role: "student" | "bot"; content: string }>,
  newStudentTurns: string[]
): string {
  const pointsBlock = JSON.stringify(
    points.map((point) => ({
      id: point.id,
      title: point.title,
      content: point.content,
      assessmentCriteria: point.assessmentCriteria || "",
    })),
    null,
    2
  );
  const turnsBlock = turns
    .map((turn) => `${turn.role === "student" ? "[學生]" : "[角色]"} ${turn.content}`)
    .join("\n");
  const newTurnsBlock = newStudentTurns.length
    ? newStudentTurns.map((content, index) => `${index}: ${content}`).join("\n")
    : "（無）";
  return `教學目標知識點清單：
${pointsBlock}

近期對話（由舊到新）：
${turnsBlock}

新訊息（自上次判斷後嘅學生訊息，已編號 0..N-1）：
${newTurnsBlock}

請判斷學生答啱咗邊啲知識點，並將「新訊息」分類，輸出 JSON。`.trim();
}

export type JudgeWindowResult = {
  /** null = 判斷唔到（冇 API key、LLM 失敗、parse 唔到）；Set（可能空）= 判斷成功 */
  demonstrated: Set<string> | null;
  /** null = 判斷唔到 → caller 用字數門檻兜底（judgeSource 標明來源） */
  engagement: EngagementVerdict | null;
};

/**
 * 一次 Gemini call 同時出「答啱咗邊啲知識點」同「新訊息參與度分類」。
 * points 可以係空 array（冇 core 知識點嘅 bot 淨係要 engagement）；
 * newStudentTurns 可以係空（純 demonstrated 判斷，prompt 標示（無））。
 */
export async function judgeConversationWindow(input: {
  points: KnowledgePoint[];
  turns: Array<{ role: "student" | "bot"; content: string }>;
  newStudentTurns: string[];
}): Promise<JudgeWindowResult> {
  const result: JudgeWindowResult = { demonstrated: null, engagement: null };
  if (!input.turns.length) return result;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildJudgeUserPrompt(
                input.points,
                input.turns,
                input.newStudentTurns
              ),
            },
          ],
        },
      ],
      config: {
        systemInstruction: JUDGE_SYSTEM_PROMPT,
        temperature: 0,
      },
    });
    const text = String(response.text || "").trim();
    if (!text) return result;
    if (input.points.length) {
      result.demonstrated = new Set(parseDemonstrated(text));
    }
    result.engagement = parseEngagement(text, input.newStudentTurns.length);
    return result;
  } catch {
    return result;
  }
}

/**
 * 判斷學生有邊啲 core 知識點已答啱（展現理解）。
 * 回傳 null = 判斷唔到（冇 API key、LLM 失敗、parse 唔到）→ caller 用字串匹配兜底；
 * 回傳 Set（可能空）＝ 判斷成功 → 信佢（空即真係冇答啱）。
 */
export async function judgeStudentAnswers(input: {
  points: KnowledgePoint[];
  turns: Array<{ role: "student" | "bot"; content: string }>;
}): Promise<Set<string> | null> {
  if (!input.points.length || !input.turns.length) {
    return null;
  }
  const result = await judgeConversationWindow({
    points: input.points,
    turns: input.turns,
    newStudentTurns: [],
  });
  return result.demonstrated;
}
