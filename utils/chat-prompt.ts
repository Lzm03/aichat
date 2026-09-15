import { gradeBandOf } from "./grades";

export type KnowledgePoint = {
  id: string;
  tier: "basic_fact" | "deep_understanding";
  title: string;
  content: string;
  keywords: string[];
  assessmentCriteria?: string;
  /** 教學目標（必達）：驅動覆蓋追蹤、next_point、進度 UI。缺省 true（老師唔郁就全部照計）。 */
  core?: boolean;
};

/** 後台對話狀態（知識點覆蓋實錄），由 ask.ts 每輪載入並注入 prompt */
export type ConversationStateInput = {
  coveredPointIds?: string[];
  nextPointId?: string | null;
  turnsSinceSummary?: number;
  studentLevel?: string;
};

type PromptCompilerInput = {
  roleName?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
  /** 年級帶（P1 / P2-P3 / P4-P6 / S1-S3 / S4-S6）；未設定則不加難度規則 */
  gradeBand?: string | null;
  /** 後台實錄嘅對話狀態；提供咗就用真實狀態取代模型自估 */
  conversationState?: ConversationStateInput | null;
};

export type ChatReplyLanguage = "cantonese" | "mandarin" | "english";

type ParsedPromptSource = {
  roleName: string;
  characterBackground: string;
  knowledgeSummary: string;
  knowledgePoints: KnowledgePoint[];
  personaProfile: string;
  /** 老師設定書可選覆寫節；冇寫就落 DEFAULT_* */
  unknownBoundary: string;
  closingRitual: string;
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
4. Produce ONE complete reply per turn. Do not split one reply into two separate messages.
5. Keep each reply to a short passage of at most 3 message units — one unit = one piece of information, one question, or one set of 2-3 options. Usually under 150 Chinese characters unless the student explicitly asks for detail.
6. 訊息先行 (info before asking): if the reply ends with a question, it must first deliver at least one piece of new information or one substantive affirmation BEFORE the question (1 info + 1 question). Two consecutive turns that only ask questions without delivering any new information are a violation.
7. Do not ask a follow-up question every single turn. Some turns should simply answer and stop.
8. Only ask one short, knowledge-related follow-up question when it naturally helps the student think deeper.
9. Never ask more than one question in a single reply. One reply can contain zero or one question only. An A/B choice still counts as one question and must end with a single question mark, e.g. 「你想知紅色定黑色？」 is allowed, 「係唔係咁？定係咁？」 is not. A rhetorical self-answered question also counts — end it with a full stop instead, e.g. 「你諗下點解扯唔開——力斜斜咁壓入去。」 not 「點解扯唔開？係因為力。」
10. Do not stack two Socratic prompts in one turn. Ask about only one knowledge point at a time.
11. If the student seems confused or says they don't know, lower the difficulty FIRST: give one small piece of information or 2-3 options to choose from. Do not keep asking deeper questions.
12. 先肯定觀察，再精準校正: if the student's answer is partially right, use the pattern 「你捉到 X 方向；更準確係 Y。例如 Z。」 — affirm the correct part in one sentence, then correct the wrong part precisely with a concrete example. Never fully endorse a misconception.
13. If the student's answer is completely wrong: do not praise it. Give one gentle factual correction, then continue guiding.
14. Never reveal the answer inside a question or hint. The question must not contain the keyword or fact the student is meant to produce.
15. If the student jokes or goes off-topic: acknowledge the joke warmly in one sentence, then bridge back to the knowledge point naturally. Do not immediately fire a serious question.
16. Topic lock: never switch topics without the student's consent. When the student drifts, bridge the old and new topic in one sentence and let them choose (continue the new topic, or return to the old one).
17. 稱呼學生一律用「同學」或直接唔用稱呼。唔准假設學生性別（禁止「師弟」「師妹」「妹妹」等），除非學生自己表明性別或稱呼偏好。
18. 每 3-5 輪，用一句話做小結，重複學生目前學到嘅重點（例如「你到而家學咗：紅色代表忠義，白色代表奸詐」），令學生知道自己嘅進度，然後先繼續。
19. 相近概念唔准混為一談（例如「變臉」係快速換臉譜嘅技巧，「臉譜」係面上嘅色彩圖案）。學生混淆時，用一句話幫佢分清定義。
20. 推進對話（Advance）：如果 # Input Context 提供咗 Covered_Points 同 Next_Point，推進問題必須圍繞 Next_Point，嚴禁再問 Covered_Points 內已覆蓋嘅知識點；冇提供就按對話歷史自行判斷。總之唔准重複問學生已經答過嘅問題，唔准「鬼打牆」。
21. If you do not know, admit uncertainty honestly while preserving the role voice.
`.trim();

export function buildChatReplyLanguageRule(
  replyLanguage: ChatReplyLanguage,
  usesClassicalChineseStyle = false
) {
  if (usesClassicalChineseStyle) {
    return replyLanguage === "english"
      ? "Reply entirely in concise, dignified, aphoristic English that preserves the selected Classical Chinese voice while remaining student-friendly. Never output Chinese."
      : "Every word of the final reply must use easy-to-understand Classical Chinese in Traditional Chinese. This register overrides Cantonese or Mandarin wording preferences; do not use modern Cantonese vocabulary or particles.";
  }
  if (replyLanguage === "english") {
    return "Reply in clear, natural English. Do not switch to Chinese unless the user asks.";
  }
  if (replyLanguage === "mandarin") {
    return "Reply only in natural Standard Mandarin written with Traditional Chinese characters. Never use Cantonese grammar, vocabulary, or particles. This rule applies to every sentence, question, and teaching hint.";
  }
  return "Reply in natural Hong Kong Cantonese written with Traditional Chinese characters and everyday Cantonese wording. Use 「我係」 not 「我是」. Do not switch to Mandarin unless the user asks.";
}

/**
 * 年級帶難度規則。只調「難度」（句長、詞彙深淺、標點），**不改變回覆語言** ——
 * 粵語口語／普通話／英語三種語音輸出都要維持原本語域，只收窄句子長度與用詞。
 * 回傳空字串代表未設定年級，呼叫方唔應該加入任何難度 section。
 */
export function buildGradeBandRule(gradeBand?: string | null) {
  const band = gradeBandOf(gradeBand);
  if (!band) return "";

  return [
    `學生程度：${band.label}（${band.stage}）。`,
    "以下難度限制適用於所有回覆語言（粵語、普通話、英語），語言本身不變：",
    `- 粵語口語回覆照用日常口語寫法、普通話回覆照用普通話口語、英語回覆照用英語，不要改成書面語或文言。`,
    `- 每句最多 ${band.maxCharsPerSentence} 個中文字（英語回覆每句最多約 ${band.maxWordsPerSentence} 個詞）。`,
    `- 每次回覆最多 ${band.maxSentences} 句，合共最多 ${band.maxReplyChars} 個中文字。`,
    `- 標點：${band.punctuation}。`,
    `- 用詞：${band.vocabulary}。`,
    "學生表示不明白時，先降一級：縮短句子、換更淺白的詞語、每次只講一個意思；仍然不明白，就提供 2-3 個選項讓學生選擇。",
  ].join("\n");
}

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
  // 但緊接住嘅 optional 節（【不知道邏輯】【收尾儀式】）有自己嘅解析器，
  // 必須喺度切走，唔可以當成角色策略一部分，否則會重複注入。
  return (
    source.match(
      /【角色對話策略】\s*([\s\S]*?)(?=\s*【(?:不知道邏輯|收尾儀式)】|\n請根據「人物背景設定」|$)/i
    )?.[1]?.trim() || ""
  );
}

export function parseKnowledgePoints(raw: string): KnowledgePoint[] {
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
        core: item?.core !== false,
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
    `當學生質疑你時：先接住疑問，再請佢指出最卡住嘅一點。`,
    `當學生偏題時：用一句話點出新舊話題嘅關聯做橋樑，再俾學生揀「繼續新話題」定「返返之前話題」，唔准硬拉。`,
    `當學生沉默或話「唔知」時：先降難度——俾一小步資訊或者 2-3 個選項，唔准繼續追問更深。`,
  ].join(" ");
}

function inferMultipleHooks(roleName: string, background: string) {
  const firstLine = background.split(/[。！？!?]/)[0]?.trim();
  return [
    `自我介紹（含角色名）只准喺對話開始嘅第一輪出現一次；之後除非學生親口問「你係邊個」或「你叫咩名」，一律唔准重複自介。`,
    `重新接話時直接講內容，例如：「我哋先從你最有感覺嘅一點開始。」「唔使急，陪你一步一步諗。」「你願意先講講你而家點睇？」`,
    `${firstLine || "你願意先講講你而家點睇？"}，可以由此切入。`,
  ].join(" ");
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
  // 可選覆寫節：設定書寫咗就用佢，冇寫就落骨架層預設
  const unknownBoundary = matchSection(source, "不知道邏輯");
  const closingRitual = matchSection(source, "收尾儀式");

  return {
    roleName: roleNameFromSource,
    characterBackground,
    knowledgeSummary,
    knowledgePoints: parseKnowledgePoints(pointsRaw),
    personaProfile,
    unknownBoundary,
    closingRitual,
  };
}

export type AnswerMode = "直接給答案" | "引導後再回答" | "不直接給答案";

/**
 * 由知識庫原文讀 bot 嘅答題策略（【角色對話策略】→【答題策略】）。
 * 冇寫或者唔認得就當「引導後再回答」（預設）。
 */
export function parseAnswerMode(knowledgeBase: string): AnswerMode {
  const personaProfile = matchPersonaProfile(String(knowledgeBase || ""));
  const mode = matchSection(personaProfile, "答題策略").trim();
  if (mode === "直接給答案" || mode === "不直接給答案") return mode;
  return "引導後再回答";
}

export function buildStoredKnowledgeBase(input: {
  characterBackground: string;
  knowledgeSummary: string;
  knowledgePoints: KnowledgePoint[];
  personaProfile: string;
  /** 可選覆寫節：留空就唔輸出，組裝層會落 DEFAULT_* */
  unknownBoundary?: string;
  closingRitual?: string;
  /** 唔進入 prompt 嘅製作備註（服務情境／視覺設定等） */
  productionNotes?: string;
}) {
  const optionalSections = [
    input.unknownBoundary?.trim() ? `【不知道邏輯】\n${input.unknownBoundary.trim()}` : "",
    input.closingRitual?.trim() ? `【收尾儀式】\n${input.closingRitual.trim()}` : "",
    input.productionNotes?.trim() ? `【製作備註】\n${input.productionNotes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `
【人物背景設定】
${input.characterBackground}

【人物知識庫摘要】
${input.knowledgeSummary}

【知識點分級】
${JSON.stringify(input.knowledgePoints, null, 2)}

【角色對話策略】
${input.personaProfile}
${optionalSections ? `\n${optionalSections}\n` : ""}
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

  const gradeBandRule = buildGradeBandRule(input.gradeBand);

  // Input Context：有後台實錄狀態就用真實狀態（Covered/Next），冇就維持模型自估
  const state = input.conversationState;
  const inputContextSections: string[] = [
    `1. Target_Knowledge_Points\n${JSON.stringify(targetKnowledgeGraph, null, 2)}`,
  ];
  let contextIndex = 2;
  if (state?.coveredPointIds?.length) {
    const coveredLabels = state.coveredPointIds
      .map((id) => {
        const point = targetKnowledgeGraph.find((item) => item.id === id);
        return point ? `${id} ${point.title}` : id;
      })
      .join("、");
    inputContextSections.push(
      `${contextIndex++}. Covered_Points（後台實錄：學生已經接觸過嘅知識點，嚴禁重複提問或重複教）\n${coveredLabels}`
    );
  }
  if (state?.nextPointId) {
    const next = targetKnowledgeGraph.find((item) => item.id === state.nextPointId);
    const nextLabel = next ? `${next.id} ${next.title}（${next.content}）` : state.nextPointId;
    inputContextSections.push(
      `${contextIndex++}. Next_Point（下一步引導目標：推進問題必須圍繞佢）\n${nextLabel}`
    );
  }
  if ((state?.turnsSinceSummary ?? 0) >= 4) {
    inputContextSections.push(
      `${contextIndex++}. 小結提醒：已經 ${state.turnsSinceSummary} 輪冇做小結，呢輪回覆請加一句小結（學生到而家學咗咩重點）。`
    );
  }
  if (!state) {
    inputContextSections.push(
      `${contextIndex++}. Activated_Points\nUse recent chat context to infer which knowledge points have already been covered. Do not mechanically repeat the same question.`
    );
  }
  inputContextSections.push(
    `${contextIndex}. Chat_History\nContinue naturally from recent turns and adapt to the student's cognitive depth.`
  );

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
- Unknown Boundary Logic: ${parsed.unknownBoundary || DEFAULT_UNKNOWN_BOUNDARY}
- Closing Ritual: ${parsed.closingRitual || DEFAULT_CLOSING_RITUAL}
- Multiple Hooks: ${inferMultipleHooks(parsed.roleName, parsed.characterBackground)}

# Enforced Speaking Style
${compileSpeakingStyleRule(parsed.personaProfile) || "Maintain a clear, student-friendly speaking style."}
${gradeBandRule ? `\n# Grade Band Difficulty Rules\n${gradeBandRule}\n` : ""}
# Character Knowledge Base
${parsed.knowledgeSummary || "未提供知識摘要。"}

# Character's Dialogue Strategy (teacher-defined)
${parsed.personaProfile || "未提供額外對話策略。"}
如果本節同下方 # Interaction Rules 有衝突，一律以 # Interaction Rules 為準。

# Core Objective
Your goal is NOT to spoon-feed information, but to guide the student toward independent reasoning through "Socratic Questioning". Help them explore the character's life, decisions, background, and impact step-by-step.

# Input Context
${inputContextSections.join("\n\n")}

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
