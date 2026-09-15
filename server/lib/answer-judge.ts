/**
 * 平價 LLM 判斷（D4）：判斷學生喺近期對話入面「答啱咗邊啲教學目標（core）知識點」。
 *
 * 取代字串匹配嘅「學生證據」嗰半 —— 字串匹配只捉到「學生提過 keyword」，
 * 捉唔到「答啱」定「答錯」，亦捉唔到「用自己說話答啱但冇用 keyword」。
 * 呢度用 DeepSeek（平價）做一次判斷 call，輸出結構化 JSON。
 *
 * 節流策略（每 3 輪 + 免費預濾）係純函數，方便單測；真正接線喺 step 3。
 */
import type { KnowledgePoint } from "../../utils/chat-prompt.ts";

/** 每幾多輪先跑一次判斷（跟小結節奏，唔好每輪都打 LLM） */
export const JUDGE_INTERVAL_TURNS = 3;

/** 學生「實質輸入」最短字數：低過即敷衍回覆（哦／唔知／係），唔值得判斷 */
export const JUDGE_SUBSTANTIVE_MIN = 4;

/** 判斷窗口內有冇「實質學生輸入」；冇就唔使打 LLM（免費預濾） */
export function hasSubstantiveStudentInput(
  turns: Array<{ role: "student" | "bot"; content: string }>
): boolean {
  return turns.some(
    (turn) =>
      turn.role === "student" && turn.content.trim().length >= JUDGE_SUBSTANTIVE_MIN
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

const JUDGE_SYSTEM_PROMPT = `你是教學評估器。你根據「教學目標知識點清單」同「近期對話」，判斷學生有邊啲知識點已經真正答啱、展現出理解。

規則：
1. 只輸出合法 JSON，格式：{"demonstrated":["kp_001","kp_002"]}
2. 只計學生「自己答出嚟」嘅理解，bot 講咗但學生冇回應嘅唔計。
3. 學生用自己說話表達出正確概念，即使冇用到關鍵詞，都要計。
4. 學生答錯、含糊、只重複 bot 嘅話、或者純離題，唔計。
5. 冇任何一點答啱，輸出 {"demonstrated":[]}
6. 唔好輸出 JSON 以外嘅文字。`.trim();

function buildJudgeUserPrompt(
  points: KnowledgePoint[],
  turns: Array<{ role: "student" | "bot"; content: string }>
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
  return `教學目標知識點清單：
${pointsBlock}

近期對話（由舊到新）：
${turnsBlock}

請判斷學生答啱咗邊啲知識點，輸出 JSON。`.trim();
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
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey || !input.points.length || !input.turns.length) {
    return null;
  }

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: buildJudgeUserPrompt(input.points, input.turns) },
        ],
      }),
    });
    if (!response.ok) return null;
    const data: any = await response.json().catch(() => null);
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!text) return null;
    return new Set(parseDemonstrated(text));
  } catch {
    return null;
  }
}
