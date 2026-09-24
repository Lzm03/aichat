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
  /** 教學目標知識來源（話題版本內容）；冇提供就用 knowledgeBase 自己嘅【知識點分級】。
   *  角色身份／背景／摘要仍然由 knowledgeBase 提供。 */
  targetKnowledgeBase?: string;
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
7. Do not dump the complete answer in one message. Whether a turn may reveal the final answer is decided ONLY by # Answer Mode Directive — outside its explicit allowance, reply with a hint, a smaller sub-question, or 2-3 options instead. A turn without a follow-up question is fine when it delivers substance (an answer the student earned, a summary, or a completion), never as a shortcut that bypasses the guided path.
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
22. 上下文連貫: facts already established in the conversation must not be contradicted, re-asked as if unknown, or dropped. Follow-up questions must build on the information already established in earlier turns.
23. 選項解析: after you offer an A/B choice (例如「你想知 X，定係想知 Y？」), if the student's next message semantically picks one option — even a fragment like「Y」or「想知 Y」— treat it as their answer immediately. Do NOT ask them to repeat the complete option wording or re-ask which option they meant.
24. 答啱接住推進: when the student answers correctly, the same reply must do all three: (1) one short affirmation that names what they got right (例如「啱，紅色代表忠義」), (2) one brief supplement that adds a new fact or angle, (3) advance to a new angle or the next knowledge point. Never end with praise alone, and never re-ask the same concept in different words.
25. 最新輸入優先：先直接回應學生呢一輪實際講嘅內容；只有學生正在討論教學主題或同意繼續時，先用 Next_Point 推進。不得忽略學生問題而機械式重開課、重做自我介紹或硬拉去固定知識點。
26. Avoid canned openings and repeated transition phrases. Start with the substance of the answer; do not reuse stock wording from previous replies.
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

export function matchSection(source: string, label: string, fallbackLabels: string[] = []) {
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
      /【角色對話策略】\s*([\s\S]*?)(?=\s*【(?:不知道邏輯|收尾儀式|製作備註)】|\n請根據「人物背景設定」|$)/i
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

/** `kp_007` → 7；唔符合格式（自訂 id）回 0。 */
function numericIdSuffix(id: unknown): number {
  const match = /^kp_(\d+)$/.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
}

/** 由現有知識點算出下一個可用 id：max(數值後綴)+1，永不重用。 */
export function nextKnowledgePointId(points: Array<{ id?: string }>): string {
  const highest = points.reduce((max, point) => Math.max(max, numericIdSuffix(point.id)), 0);
  return `kp_${String(highest + 1).padStart(3, "0")}`;
}

/**
 * 重新生成知識點之後穩定 id，令舊覆蓋進度唔會對錯點。
 *
 * 背景：老師每次重新提取，LLM 都回一批新點。若照位重編 kp_001..kp_00N，
 * bot_student_progress 入面嘅舊 id 就會指去完全唔同嘅知識點（位置撞 id），
 * 學生會顯示「掌握咗從未學過嘅嘢」。
 *
 * 規則（依序）：
 *   1. title（trim 後）同舊點一致 → 保留舊 id（改錯字／改內容都唔會清零進度）
 *   2. 其餘 → 派新 id（max+1），永不重用已退役嘅號
 *
 * 刻意唔保留「點自己帶嘅 id」：提取路徑嘅 id 唔係 LLM 位置性編號（kp_001…）
 * 就係 fallback 照行數生成，兩者都同內容無對應關係，保留只會製造同一個 bug。
 */
export function assignStableKnowledgePointIds<T extends { id?: string; title?: string }>(
  points: T[],
  previousPoints: Array<{ id?: string; title?: string }>,
  reservedPoints: Array<{ id?: string }> = previousPoints
): T[] {
  const byTitle = new Map<string, string>();
  for (const point of previousPoints) {
    const title = String(point.title || "").trim();
    if (title && point.id && !byTitle.has(title)) byTitle.set(title, String(point.id));
  }

  const used = new Set<string>();
  // 新號一定要高過所有「舊點」嘅號：舊點就算已經退役，佢個號仍然帶住學生嘅
  // 覆蓋紀錄，重用就會令進度對錯知識點。今批點自己嘅暫定 id 唔計 —— 佢哋
  // 一係 LLM 位置性編號、一係 fallback 照行數生成，全部都唔會保留。
  let highest = reservedPoints.reduce(
    (max, point) => Math.max(max, numericIdSuffix(point.id)),
    0
  );

  return points.map((point) => {
    const title = String(point.title || "").trim();
    const inherited = title ? byTitle.get(title) : undefined;
    let id: string;
    if (inherited && !used.has(inherited)) {
      id = inherited;
    } else {
      highest += 1;
      id = `kp_${String(highest).padStart(3, "0")}`;
    }
    used.add(id);
    return { ...point, id };
  });
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
  return [
    `自我介紹（含角色名）只准喺對話開始嘅第一輪出現一次；之後除非學生親口問「你係邊個」或「你叫咩名」，一律唔准重複自介。`,
    `重新接話時直接回應學生最新一句嘅實際意思，唔准使用固定開場白、重複過渡句或角色背景第一句。`,
    `只有學生主動問身份時先簡短回答身份；其他情況唔准用身份介紹代替問題答案。`,
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

/**
 * 「答題策略」真正落地嘅一節。以前呢個老師設定只影響覆蓋追蹤（coverage strictness），
 * 對模型講嘢完全冇作用——揀「不直接給答案」同「直接給答案」出嚟嘅 prompt 一模一樣，
 * 所以學生覺得 Bot 一嘢倒答案。呢節將模式翻譯成「揭曉階梯」指令。
 *
 * 兩個引導模式都保證有終點（提示 → 選項 → 答案連解釋）：無限引導＝學生永遠攞唔到答案，
 * 係另一種失敗模式。分別只在於節奏快慢同揭曉時嘅措辭。
 */
export function buildAnswerModeDirective(mode: AnswerMode): string {
  const header =
    "# Answer Mode Directive (derived from the teacher's 【答題策略】; if this section conflicts with # Safety Rules or # Interaction Rules below, those rules always win)";
  // 「一輪最多一條問題」喺引導輪特別易甩：模型會連問兩條唔同嘅問題（問完「係咩色」
  // 又問「印象點樣」），或者喺選項輪寫完「A 定 B？」再跟手加句「你揀邊個」。
  // 三個模式共用同一條限制。
  const oneQuestionRule =
    "一輪仍然最多一條問題：一輪只可以問一樣嘢，連問兩條唔同嘅問題（例如問完「咩色」又問「印象點樣」）都唔准；選項寫成一個問句（例如「A 定 B？」），唔准跟手加多句「你揀邊個」，亦唔准將同一條問題換個問法重複寫兩次。想開頭 check-in（例如「你聽過『赤膽忠心』未」）就用陳述句或者自己答埋收句號，唔准寫成問句再加第二條問題。";

  if (mode === "直接給答案") {
    return `${header}
${oneQuestionRule}
You are in「直接給答案」mode: the teacher has given you explicit permission to answer directly. Give the complete answer in one reply when the student asks for knowledge or facts — do not withhold it behind forced hints or counter-questions. You may still add one short follow-up question afterwards if it naturally deepens understanding, but the answer must come first. All other # Interaction Rules (language, one question maximum, safety) still apply.`;
  }

  if (mode === "不直接給答案") {
    return `${header}
${oneQuestionRule}
You are in「不直接給答案」mode: never casually reveal the answer. Rule 7 does not license you to "simply answer and stop" in this mode.
1. 先引導：always guide first — ask, hint, or break the problem into smaller steps. Do NOT reveal the full answer, even if the student asks directly, complains, or repeats the demand. 第一輪硬性禁止講出學生問嗰個事實本身：就算你喺同一句入面再補一條問題或一句提示，只要個事實已經講咗，就當倒咗答案。第一輪只可以出問題、線索或者縮窄範圍。
2. 更謹慎嘅卡關遞進：only after the student is clearly stuck for several turns (roughly 3 or more consecutive 唔明／唔識), escalate slowly — small hint → more concrete hint or 2-3 choices → after that, give the answer WITH a full explanation, framed as 「我破例直接講一次，但你要試下用自己嘅說話重講返出嚟」.
3. 交返俾學生：after any reveal, immediately return the conversation to guided mode by asking the student to retell or apply the answer. 但如果學生喺揭曉之後仍然話唔明，就再直接講一次答案連解釋，唔准退返去出選擇題——答案已經揭曉過，再出選項只會令學生更攰。
4. 永不放任卡死：sustained stuckness always ends with the answer + explanation — never endless questioning. 答案揭曉之後嘅回合，如果學生仲話唔明／諗唔到，就每次用唔同嘅講法再解釋一次答案，永遠唔准再出選項或者追問嗰個概念。`;
  }

  return `${header}
${oneQuestionRule}
You are in「引導後再回答」mode: guide first, answer later. Follow this reveal ladder strictly:
1. 先引導：open with a guiding question, an analogy, a related example, or a hint that does NOT state the answer itself. Do NOT give the full answer, even if the student asks directly (e.g. 「你直接講啦」). 如果學生問嘅係一個事實（例如「紅色代表咩」），第一輪唔准直接講出嗰個事實本身——就算你喺同一句入面再補一條問題，只要事實已出就當倒咗答案；第一輪只可以反問、俾線索或者叫學生觀察。
2. 卡關遞進：after roughly 2 consecutive turns of 唔明／唔識／唔知 or direct demands for the answer, upgrade — give a more concrete hint, or offer 2-3 answer options for the student to choose from.
3. 最終俾答案：if the student is still stuck after the hint-and-options rounds, THEN give the full answer WITH a short explanation, and hand the reasoning back (e.g. 「而家明咗，試下用自己嘅說話講返點解」). The answer is the last resort, not the first move — the student is never trapped in an endless loop. 揭曉之後如果學生仍然話唔明，就再直接講一次答案連解釋，唔准退返去出選擇題。
4. 學生答啱或主動問新嘢：guiding continues normally and the ladder resets.`;
}

/**
 * 開場引導說明嘅罐頭後備句（跟對話回覆語言）。
 * 正常路徑係由模型按「說話風格 × 人物設定 × 回覆語言」生成變體（server/api/bots.ts），
 * 呢句只喺冇 model／生成失敗時用，唔應該係學生平時見到嗰句。
 */
export function buildCannedGuidedAnnouncement(replyLanguage: ChatReplyLanguage): string {
  if (replyLanguage === "english") {
    return "Just so you know: in our chat I won't give you the answer directly — I'll guide you to figure it out with questions and hints.";
  }
  if (replyLanguage === "mandarin") {
    return "提醒你：這段對話我不會直接給答案，而是用問題和提示引導你自己思考。";
  }
  return "提提你：呢段對話我唔會直接俾答案，而係會用問題同提示引導你自己諗。";
}

/** 只有兩個引導模式先需要開場說明；「直接給答案」唔應該出呢句。 */
export function needsGuidedAnnouncement(mode: AnswerMode): boolean {
  return mode !== "直接給答案";
}

/**
 * 開場引導說明嘅生成 prompt。
 *
 * 呢句唔可以係固定罐頭句：老師揀嘅說話風格、回覆語言同數字人人物設定都要反映落去，
 * 所以交俾模型生成變體。答題策略都入 prompt，令「引導後再回答」同「不直接給答案」
 * 嘅措辭自然有別（前者較輕，後者較嚴）。
 */
export function buildGuidedAnnouncementPrompt(input: {
  roleName?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
  replyLanguage: ChatReplyLanguage;
  answerMode: AnswerMode;
}) {
  const personaProfile = parsePromptSource({ knowledgeBase: input.knowledgeBase || "" }).personaProfile;
  const speakingStyle = matchSection(personaProfile, "說話風格").trim();
  const name = String(input.roleName || "").trim() || "AI 助手";
  // 「說話風格」藏喺【角色對話策略】容器入面，要單獨抽出嚟餵俾生成器，
  // 否則模型只會見到一大段人設，捉唔到「文言文」呢類會左右句式嘅設定。
  const characterContext = [input.knowledgeBase, input.securityPrompt]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  const systemPrompt =
    "你是角色語氣設計助手。你必須根據角色人設、說話風格同指定回覆語言，寫一句簡短的「引導式對話說明」。只輸出一句，不要引號，不要換行，不要解釋。";
  const userPrompt = `
角色名稱：${name}
角色背景與設定：
${characterContext || "（未提供）"}
說話風格：${speakingStyle || "（未指定，用自然口語）"}
回覆語言：${buildChatReplyLanguageRule(input.replyLanguage, speakingStyle === "文言文")}
答題策略：${input.answerMode}

請寫一句「引導式對話說明」，向學生講清楚：呢段對話我唔會直接俾答案，而係會用問題同提示一步步引導佢自己諗。要求：
1. 必須用角色自己嘅語氣同人物身份去講（歷史人物用佢自己嘅口吻，唔可以似通用助理）；
2. 必須跟足上面嘅「說話風格」（例如文言風格就用文言句式）同「回覆語言」；
3. 唔准照抄任何固定模板句，要自然多變；
4. 只輸出一句，20-40 字，唔好加引號或解釋。
`.trim();

  return { systemPrompt, userPrompt };
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

/**
 * 發佈／預覽用：以默認主題版本嘅知識點重建主知識庫（bots.knowledge_base）。
 * 學習報告（assessment-report）同覆蓋 intersect 都讀 bots.knowledge_base，
 * 而手動新增／刪改嘅點只會存喺主題版本數據——呢個函數令兩邊收斂返同一份來源。
 * 冇任何實際改動就原樣返還，保住 legacy bot 嘅手寫摘要。
 * （守護測試：server/tests/knowledge-base-sync.test.ts）
 */
export function buildKnowledgeBaseWithVersionPoints(input: {
  knowledgeBase: string;
  defaultVersionPoints: KnowledgePoint[];
  characterBackground?: string;
}): string {
  const fallback = parsePromptSource({ knowledgeBase: input.knowledgeBase });
  const points = input.defaultVersionPoints;
  const background = (input.characterBackground || "").trim();
  const pointsUnchanged =
    points.length === fallback.knowledgePoints.length &&
    points.every((point, index) => {
      const other = fallback.knowledgePoints[index];
      return (
        point.id === other.id &&
        point.title === other.title &&
        point.content === other.content &&
        point.tier === other.tier &&
        Boolean(point.core) === Boolean(other.core) &&
        JSON.stringify(point.keywords || []) === JSON.stringify(other.keywords || []) &&
        (point.assessmentCriteria || "") === (other.assessmentCriteria || "")
      );
    });
  // 背景冇提供（或清空）都當「冇改動」——只有實際改咗先觸發重寫
  const backgroundUnchanged = !background || background === fallback.characterBackground;
  if (pointsUnchanged && backgroundUnchanged) return input.knowledgeBase;
  const summaryFromPoints = (list: KnowledgePoint[]) =>
    list
      .map((point) => {
        const tierLabel = point.tier === "basic_fact" ? "基礎事實" : "深度理解";
        const keywords = (point.keywords || []).filter(Boolean).join("、");
        const assessment = (point.assessmentCriteria || "").trim();
        const suffix = [keywords ? `關鍵詞：${keywords}` : "", assessment ? `評估：${assessment}` : ""]
          .filter(Boolean)
          .join("｜");
        return `- [${tierLabel}] ${point.title.trim()}：${point.content.trim()}${suffix ? `（${suffix}）` : ""}`;
      })
      .join("\n");
  return buildStoredKnowledgeBase({
    characterBackground: background || fallback.characterBackground,
    knowledgeSummary: summaryFromPoints(points),
    knowledgePoints: points,
    personaProfile: fallback.personaProfile,
  });
}

export function buildChatSystemPrompt(input: PromptCompilerInput) {
  const parsed = parsePromptSource({
    roleName: input.roleName,
    knowledgeBase: input.knowledgeBase,
  });
  // 話題版本活躍時，教學目標用話題知識；身份／背景仍然由主知識庫提供。
  const targetParsed = input.targetKnowledgeBase
    ? parsePromptSource({ knowledgeBase: input.targetKnowledgeBase })
    : parsed;

  // 教學目標只計 core 知識點，同覆蓋追蹤 / next_point / 進度 UI 同一集。
  // 非 core 點仍然喺【人物知識庫摘要】文字入面做背景知識，只係唔再係必教目標
  // —— 否則 bot 會教一啲永遠唔會出現喺進度分母嘅知識點。
  const corePoints = targetParsed.knowledgePoints.filter((point) => point.core !== false);
  const targetKnowledgeGraph = corePoints.length
    ? corePoints
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

  // 答題策略永遠由**主知識庫**讀（話題版本冇【答題策略】節），同 ask.ts 嘅 trackingAnswerMode 一致。
  const answerModeDirective = buildAnswerModeDirective(parseAnswerMode(input.knowledgeBase || ""));

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
安全規則、回覆語言與年級難度限制優先；除此之外，老師設定嘅角色語氣與答題策略優先於通用教學骨架。

${answerModeDirective}

# Core Objective
Your goal is NOT to spoon-feed information, but to guide the student toward independent reasoning through "Socratic Questioning". Help them explore the character's life, decisions, background, and impact step-by-step.

# Input Context
${inputContextSections.join("\n\n")}

# Interaction Rules & Scaffolding Strategies
Follow this cognitive loop internally before every response:
1. Evaluate the student's latest input: off-topic, surface fact recall, or deeper relational understanding.
2. Apply adaptive scaffolding: ${DEFAULT_SCAFFOLDING}
3. If the student is engaged, briefly affirm and optionally push one level deeper.
4. If the student is confused, lower difficulty and give a partial hint without dumping the answer — escalate along the stuck-progression ladder in # Answer Mode Directive.
5. If the student is clearly stuck or silent for too long, advance one rung on the # Answer Mode Directive ladder (hint → choices → answer with explanation), and be ready to support L1/L2/L3 guided replies generated by the outer system.

${CHAT_STYLE_RULES}

# Safety Rules
${String(input.securityPrompt || "").trim() || "未提供額外安全規則。"}
  `.trim();

  return compiled;
}
