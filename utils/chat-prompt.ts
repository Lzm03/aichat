type KnowledgePoint = {
  id: string;
  tier: "basic_fact" | "deep_understanding";
  title: string;
  content: string;
  keywords: string[];
  assessmentCriteria?: string;
};

type PromptCompilerInput = {
  roleName?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
};

type ParsedPromptSource = {
  roleName: string;
  characterBackground: string;
  knowledgeSummary: string;
  knowledgePoints: KnowledgePoint[];
  personaProfile: string;
};

const DEFAULT_CORE_MISSION =
  "不直接灌輸答案，而是透過循序追問與提示，引導學生主動理解知識背後的原因、脈絡與影響。";
const DEFAULT_INNER_MONOLOGUE =
  "我不是要壓迫學生接受標準答案，而是想陪他從已知出發，一步步長出自己的理解。";
const DEFAULT_TEACHING_ATTITUDE =
  "把學生的困惑視為思考入口；先接住，再引導；先降低負荷，再逐步升維，不用權威壓人。";
const DEFAULT_SCAFFOLDING =
  "當學生未掌握基礎時，我會先回到事實、情境或簡單選擇來降低難度；當學生掌握基礎後，我會追問背後原因、關聯與影響，推進到更深層理解。";
const DEFAULT_UNKNOWN_BOUNDARY =
  "若問題超出我的知識範圍，我會坦誠說明自己不確定，並把對話拉回目前可確認的知識點。";
const DEFAULT_CLOSING_RITUAL =
  "今天先想到這裡也很好，真正重要的是你開始自己推敲其中的道理。";

export const CHAT_STYLE_RULES = `
# Core Objective
Your goal is NOT to spoon-feed information, but to guide the student toward independent reasoning through "Socratic Questioning". Help them explore the topic step-by-step.

# Interaction Rules
1. Answer in Traditional Chinese unless the student clearly uses another language variety and expects it.
2. Stay in character, but remain clear and easy for students to understand.
3. Do not output stage directions or action descriptions such as "（微笑）" or "*點頭*".
4. Keep each reply to 1-3 short sentences, usually under 120 Chinese characters unless the student explicitly asks for detail.
5. Do not ask a follow-up question every single turn. Some turns should simply answer and stop.
6. Only ask one short, knowledge-related follow-up question when it naturally helps the student think deeper.
7. Never ask more than one question in a single reply. One reply can contain zero or one question only.
8. If you choose to ask a question, end the reply with that single question and do not add a second question anywhere else in the same reply.
9. Do not stack two Socratic prompts in one turn. Ask about only one knowledge point at a time.
10. If the student seems confused, lower the difficulty first; if the student is engaged, gently raise the cognitive depth.
11. If you do not know, admit uncertainty honestly while preserving the role voice.
`.trim();

function matchSection(source: string, label: string, fallbackLabels: string[] = []) {
  const labels = [label, ...fallbackLabels].map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `【(?:${labels.join("|")})】([\\s\\S]*?)(?=\\n【[^\\n]+】|$)`,
    "i"
  );
  return source.match(pattern)?.[1]?.trim() || "";
}

function matchPersonaProfile(source: string) {
  // This container holds nested 【...】 controls. The generic section parser
  // stops at the first nested label and would silently discard all controls.
  return (
    source.match(
      /【角色對話策略】\s*([\s\S]*?)(?=\n請根據「人物背景設定」|$)/i
    )?.[1]?.trim() || ""
  );
}

function parseKnowledgePoints(raw: string): KnowledgePoint[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any, index) => ({
        id: String(item?.id || `kp_${String(index + 1).padStart(3, "0")}`),
        tier: (item?.tier === "deep_understanding" ? "deep_understanding" : "basic_fact") as
          | "basic_fact"
          | "deep_understanding",
        title: String(item?.title || item?.topic || "").trim(),
        content: String(item?.content || "").trim(),
        keywords: Array.isArray(item?.keywords)
          ? item.keywords.map((keyword: any) => String(keyword || "").trim()).filter(Boolean)
          : [],
        assessmentCriteria: String(item?.assessmentCriteria || item?.assessment_criteria || "").trim(),
      }))
      .filter((item) => item.content);
  } catch {
    return [];
  }
}

function inferLinguisticRhythm(personaProfile: string) {
  const speakingStyle = matchSection(personaProfile, "說話風格");
  if (speakingStyle) return `一句不超過 120 字；語氣風格為：${speakingStyle}。`;
  return "一句不超過 120 字；多用短句與自然停頓，避免大段說理。";
}

function compileSpeakingStyleRule(personaProfile: string) {
  const speakingStyle = matchSection(personaProfile, "說話風格").trim();
  if (speakingStyle === "文言文") {
    return "所有中文回覆、追問與引導答案皆須使用易懂的繁體中文淺近文言文，例如『吾、汝、何以、然、可謂』；不得使用現代粵語口語。";
  }
  return speakingStyle ? `持續使用「${speakingStyle}」說話風格。` : "";
}

function inferBuzzwords(personaProfile: string) {
  const traits = matchSection(personaProfile, "性格特質");
  const answerMode = matchSection(personaProfile, "答題策略");
  return [
    "絕對禁忌：你應該、標準答案就是、我已經告訴你了",
    `強烈建議：${traits || "耐心、真誠、引導式"}${answerMode ? `；答題策略偏好：${answerMode}` : ""}`,
  ].join("。");
}

function inferResponseTriggers(roleName: string) {
  return [
    `當學生質疑我時，我會先接住疑問，再請他指出最卡住的一點。`,
    `當學生偏題時，我會用一句話把焦點拉回${roleName || "當前主題"}相關知識。`,
    "當學生沉默或說不知道時，我會先降難度，再給一個可直接回答的小提示。",
  ].join(" ");
}

function inferMultipleHooks(roleName: string, background: string) {
  const opener = roleName ? `我是${roleName}` : "我們來聊聊這個主題";
  const firstLine = background.split(/[。！？!?]/)[0]?.trim();
  return [
    `${opener}，我們先從你最有感覺的一點開始。`,
    `${opener}，別急著找答案，先陪我一起想一想。`,
    `${firstLine || opener}，你願意先說說你現在怎麼看嗎？`,
  ].join(" | ");
}

export function parsePromptSource(input: { roleName?: string; knowledgeBase?: string }): ParsedPromptSource {
  const source = String(input.knowledgeBase || "").trim();
  const characterBackground = matchSection(source, "人物背景設定");
  const knowledgeSummary = matchSection(source, "人物知識庫摘要");
  const pointsRaw = matchSection(source, "知識點分級");
  const personaProfile = matchPersonaProfile(source);
  const roleNameFromSource =
    String(input.roleName || "").trim() ||
    characterBackground.match(/我是([^，。！？!?]{1,12})/)?.[1]?.trim() ||
    "";

  return {
    roleName: roleNameFromSource,
    characterBackground,
    knowledgeSummary,
    knowledgePoints: parseKnowledgePoints(pointsRaw),
    personaProfile,
  };
}

export function buildStoredKnowledgeBase(input: {
  characterBackground: string;
  knowledgeSummary: string;
  knowledgePoints: KnowledgePoint[];
  personaProfile: string;
}) {
  return `
【人物背景設定】
${input.characterBackground}

【人物知識庫摘要】
${input.knowledgeSummary}

【知識點分級】
${JSON.stringify(input.knowledgePoints, null, 2)}

【角色對話策略】
${input.personaProfile}

請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。
  `.trim();
}

export function buildChatSystemPrompt(input: PromptCompilerInput) {
  const parsed = parsePromptSource({
    roleName: input.roleName,
    knowledgeBase: input.knowledgeBase,
  });

  const targetKnowledgeGraph = parsed.knowledgePoints.length
    ? parsed.knowledgePoints
        .map((point) => ({
          id: point.id,
          tier:
            point.tier === "basic_fact"
              ? "L1"
              : "L2/L3",
          title: point.title,
          content: point.content,
          keywords: point.keywords,
        }))
    : [];

  const compiled = `
# Role & Persona
You are now acting as the historical/academic character specified below. You must stay in character at all times and adhere to the linguistic and personality rules provided.

[Character Soul Profile]
- Name: ${parsed.roleName || "未命名角色"}
- Core Mission: ${DEFAULT_CORE_MISSION}
- Inner Monologue: ${DEFAULT_INNER_MONOLOGUE}
- Core Attitudes: ${DEFAULT_TEACHING_ATTITUDE}
- Background & Traits: ${parsed.characterBackground || "未提供角色背景。"}

# Linguistic Constraints & Dynamic Flow
- Sentence Length & Rhythm: ${inferLinguisticRhythm(parsed.personaProfile)}
- Forbidden & Preferred Words: ${inferBuzzwords(parsed.personaProfile)}
- Unique Response Triggers: ${inferResponseTriggers(parsed.roleName)}
- Unknown Boundary Logic: ${DEFAULT_UNKNOWN_BOUNDARY}
- Closing Ritual: ${DEFAULT_CLOSING_RITUAL}
- Multiple Hooks: ${inferMultipleHooks(parsed.roleName, parsed.characterBackground)}

# Enforced Speaking Style
${compileSpeakingStyleRule(parsed.personaProfile) || "Maintain a clear, student-friendly speaking style."}

# Character Knowledge Base
${parsed.knowledgeSummary || "未提供知識摘要。"}

# Core Objective
Your goal is NOT to spoon-feed information, but to guide the student toward independent reasoning through "Socratic Questioning". Help them explore the character's life, decisions, background, and impact step-by-step.

# Input Context
1. Target_Knowledge_Points
${JSON.stringify(targetKnowledgeGraph, null, 2)}

2. Activated_Points
Use recent chat context to infer which knowledge points have already been covered. Do not mechanically repeat the same question.

3. Chat_History
Continue naturally from recent turns and adapt to the student's cognitive depth.

# Interaction Rules & Scaffolding Strategies
Follow this cognitive loop internally before every response:
1. Evaluate the student's latest input: off-topic, surface fact recall, or deeper relational understanding.
2. Apply adaptive scaffolding: ${DEFAULT_SCAFFOLDING}
3. If the student is engaged, briefly affirm and optionally push one level deeper.
4. If the student is confused, lower difficulty and give a partial hint without dumping the answer.
5. If the student is clearly stuck or silent for too long, be ready to support L1/L2/L3 guided replies generated by the outer system.

${CHAT_STYLE_RULES}

# Safety Rules
${String(input.securityPrompt || "").trim() || "未提供額外安全規則。"}
  `.trim();

  return compiled;
}
