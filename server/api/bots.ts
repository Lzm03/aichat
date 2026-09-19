import express from "express";
import crypto from "crypto";
import { pool } from "../db.ts";
import { toDb, toClient } from "../botMapper.js";
import { getOrCreateWebmSequence, getPublicBase } from "./webm-sequence.ts";
import { canManageAllAccounts } from "../config/account-overrides.ts";
import {
  ensureFeatureAvailable,
  ensurePlatformTables,
  getAuthUser,
  optionalAuth,
  recordFeatureUsage,
  requireAuth,
} from "../lib/platform-auth.ts";
import { ensureQuizTables } from "./quizzes.ts";
import {
  ensureDefaultTopicForCharacter,
  ensureCharacterTopicTables,
  getAccessibleBot,
  syncInheritedTopicKnowledge,
} from "../lib/character-topics.ts";
import { ensureDefaultTeacherExperience } from "../lib/default-teacher-experience.ts";
import { getStudentProgress } from "../lib/conversation-state.ts";
import { parsePromptSource } from "../../utils/chat-prompt.ts";
import {
  GEMINI_STABLE_TEMPERATURE,
  GEMINI_TEXT_MODEL,
  getAI,
} from "../lib/gemini-server.ts";

const router = express.Router();
type SequenceVideoEntry = { key: "idle" | "thinking" | "talking"; url: string };
type KnowledgeBuckets = {
  basic: string[];
  deep: string[];
};

type StructuredKnowledgePoint = {
  tier: "basic_fact" | "deep_understanding";
  title: string;
  content: string;
  keywords: string[];
};

type KnowledgePoint = {
  label: string;
  score: number;
  completed: boolean;
};

/** 只取「教學目標（core）」知識點；非 core 嘅參考點唔入進度/覆蓋統計。 */
function coreKnowledgePoints(knowledgeBase: string) {
  return parsePromptSource({ knowledgeBase }).knowledgePoints.filter(
    (point) => point.core !== false
  );
}

/* ---------- 話題維度覆蓋聚合（audit #1：進度表按話題分維度，報告唔再撞 id） ---------- */

type TopicBucket = {
  topicId: string;
  topicName: string;
  isDefault: boolean;
  points: ReturnType<typeof coreKnowledgePoints>;
};

/** 每隻 bot 嘅話題分桶（讀 character_topics） */
async function loadTopicBuckets(botIds: string[]): Promise<Map<string, TopicBucket[]>> {
  const map = new Map<string, TopicBucket[]>();
  if (!botIds.length) return map;
  const result = await pool.query(
    `SELECT character_id, id, name, knowledge_content, is_default
     FROM character_topics
     WHERE character_id = ANY($1::text[])
     ORDER BY sort_order ASC, created_at ASC`,
    [botIds]
  );
  for (const row of result.rows) {
    const botId = String(row.character_id);
    const list = map.get(botId) || [];
    list.push({
      topicId: String(row.id),
      topicName: String(row.name || "主題"),
      isDefault: Boolean(row.is_default),
      points: coreKnowledgePoints(String(row.knowledge_content || "")),
    });
    map.set(botId, list);
  }
  return map;
}

/**
 * 聚合話題覆蓋：topic_id ''（舊數據／冇指定話題時跟主知識庫）嘅進度合併入
 * 默認話題桶——默認話題同主知識庫收斂後係同一批點，分開計會重複。
 * 每個桶各自同自己嘅點 id 集 intersect，跨話題撞 id 唔會再互相污染。
 */
function aggregateTopicCoverage(input: {
  kbPoints: ReturnType<typeof coreKnowledgePoints>;
  buckets: TopicBucket[];
  progressByTopic: Map<string, Set<string>>;
}) {
  const { kbPoints, buckets, progressByTopic } = input;
  const defaultTopic = buckets.find((bucket) => bucket.isDefault) || null;
  const kbBucketId = defaultTopic ? defaultTopic.topicId : "";
  const merged = new Map<string, Set<string>>();
  for (const [topicId, ids] of progressByTopic) {
    const target = topicId === "" ? kbBucketId : topicId;
    if (!merged.has(target)) merged.set(target, new Set());
    for (const id of ids) merged.get(target)!.add(id);
  }
  // 有效桶：默認話題（代表主知識庫）＋有其他點嘅話題；冇默認話題就用 KB 桶
  const effective: TopicBucket[] = [];
  if (defaultTopic) {
    effective.push({ ...defaultTopic, points: kbPoints.length ? kbPoints : defaultTopic.points });
  } else if (kbPoints.length) {
    effective.push({ topicId: "", topicName: "主知識庫", isDefault: true, points: kbPoints });
  }
  for (const bucket of buckets) {
    if (bucket === defaultTopic || bucket.points.length === 0) continue;
    effective.push(bucket);
  }
  let covered = 0;
  let total = 0;
  const bucketsOut = effective.map((bucket) => {
    const ids = new Set(bucket.points.map((point) => point.id));
    const bucketCovered = [...(merged.get(bucket.topicId) || [])].filter((id) => ids.has(id)).length;
    covered += bucketCovered;
    total += bucket.points.length;
    return {
      topicId: bucket.topicId,
      topicName: bucket.topicName,
      covered: bucketCovered,
      total: bucket.points.length,
      points: bucket.points.map((point) => ({ id: point.id, tier: point.tier, title: point.title })),
    };
  });
  return { buckets: bucketsOut, covered, total, mergedIds: merged };
}

/** 讀名冊內（或指定 user）嘅 per-topic 累積覆蓋 */
async function loadProgressByTopic(input: {
  botIds: string[];
  teacherId?: string;
  userId?: string;
}): Promise<Map<string, Map<string, Set<string>>>> {
  const map = new Map<string, Map<string, Set<string>>>();
  if (!input.botIds.length) return map;
  const result = input.userId
    ? await pool.query(
        `SELECT bot_id, topic_id, covered_point_ids FROM bot_student_progress
         WHERE bot_id = ANY($1::text[]) AND user_id=$2`,
        [input.botIds, input.userId]
      )
    : await pool.query(
        `SELECT bot_id, topic_id, covered_point_ids FROM bot_student_progress
         WHERE bot_id = ANY($1::text[])
           AND user_id IN (
             SELECT ts.student_id FROM teacher_students ts
             JOIN users u ON u.id = ts.student_id
             WHERE ts.teacher_id = $2 AND u.status = 'active'
           )`,
        [input.botIds, input.teacherId]
      );
  for (const row of result.rows) {
    const botId = String(row.bot_id);
    const byTopic = map.get(botId) || new Map<string, Set<string>>();
    const topicId = String(row.topic_id || "");
    const set = byTopic.get(topicId) || new Set<string>();
    for (const id of Array.isArray(row.covered_point_ids) ? row.covered_point_ids.map(String) : []) {
      set.add(id);
    }
    byTopic.set(topicId, set);
    map.set(botId, byTopic);
  }
  return map;
}

function fallbackOpeningMessage(name: string) {
  const safeName = (name || "").trim() || "AI 助手";
  return `你好，我是${safeName}，我們一起開始今天的學習吧。`;
}

export async function generateOpeningMessage(bot: any) {
  const name = String(bot?.name || "").trim() || "AI 助手";
  const characterContext = [bot?.knowledge_base, bot?.security_prompt]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  const systemPrompt =
    "你是角色語氣設計助手。你必須根據角色背景與人設寫一句固定開場白。只輸出一句，不要引號，不要換行，不要解釋。";
  const userPrompt = `
角色名稱：${name}
角色背景與設定：
${characterContext || "（未提供）"}

請寫一句「固定開場句」，要求：
1. 必須緊扣知識庫裡的人物特點與語氣，不可泛泛而談；
2. 簡短，12-45字；
3. 可直接用在每次對話開頭；
4. 禁止模板句（例如「你好我是...有什麼可以幫你」）；
5. 語言要同角色人設一致，請自行判斷：
   - 香港本地角色／師兄師姐式角色 → 自然香港粵語口語，用繁體字，可用「係、喎、咩、㗎、啦」等語氣詞；禁止北方話詞彙「咱们、啥、咋」及儿化音；
   - 外語老師（例如英文老師）→ 用該外語，或自然中英混合，例如「嗨！我是Penny！今天想跟我聊聊什麼英文呢？Don't be shy！」；
   - 古典人物（如孔子、陶淵明）→ 符合角色的淺近文言或詩性語氣，但保持易懂；
   - 其他 → 繁體中文書面語。
`.trim();

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: GEMINI_STABLE_TEMPERATURE,
      },
    });
    const text = String(response.text || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    return fallbackOpeningMessage(name);
  } catch {
    return fallbackOpeningMessage(name);
  }
}

function tokenizeKnowledge(text: string) {
  return String(text || "")
    .replace(/[【】「」『』（）()，。！？、；：:,.!?;\[\]{}]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 80);
}

function normalizeKnowledgeEntry(value: string) {
  return String(value || "")
    .replace(/^[-*•\d.、\s]+/, "")
    .replace(/^(基礎事實|深度理解|basic_fact|deep_understanding|人物背景設定|角色設定|知識點)\s*[:：-]?/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStructuredKnowledgePoints(knowledgeBase: string): StructuredKnowledgePoint[] {
  const pointsMatch = String(knowledgeBase || "").match(
    /【知識點分級】([\s\S]*?)(?:【角色對話策略】|請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。|$)/
  );

  try {
    const raw = pointsMatch?.[1]?.trim();
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const content = String(item?.content || "").trim();
        const title = String(item?.title || item?.topic || "").trim();
        if (!content || !title) return null;
        return {
          tier: item?.tier === "deep_understanding" ? "deep_understanding" : "basic_fact",
          title,
          content,
          keywords: Array.isArray(item?.keywords)
            ? item.keywords.map((keyword: string) => String(keyword || "").trim()).filter(Boolean).slice(0, 8)
            : [],
        } satisfies StructuredKnowledgePoint;
      })
      .filter(Boolean) as StructuredKnowledgePoint[];
  } catch {
    return [];
  }
}

function splitKnowledgeEntries(line: string) {
  const normalizedLine = normalizeKnowledgeEntry(line);
  if (!normalizedLine) return [];

  const coarseParts = normalizedLine
    .split(/[;；]+/)
    .map((part) => normalizeKnowledgeEntry(part))
    .filter(Boolean);

  const parts = coarseParts.flatMap((part) => {
    if (part.includes("、")) {
      const subParts = part
        .split("、")
        .map((item) => normalizeKnowledgeEntry(item))
        .filter((item) => item.length >= 4 && item.length <= 24);
      if (subParts.length >= 2) return subParts;
    }
    return [part];
  });

  return parts
    .map((part) => part.replace(/[。！？]+$/g, "").trim())
    .filter((part) => part.length >= 4)
    .map((part) => (part.length > 28 ? part.slice(0, 28).trim() : part))
    .filter(Boolean);
}

function extractKnowledgeBuckets(knowledgeBase: string): KnowledgeBuckets {
  const structuredPoints = extractStructuredKnowledgePoints(knowledgeBase);
  if (structuredPoints.length) {
    return {
      basic: structuredPoints
        .filter((point) => point.tier === "basic_fact")
        .flatMap((point) => [point.title, point.content, ...point.keywords]),
      deep: structuredPoints
        .filter((point) => point.tier === "deep_understanding")
        .flatMap((point) => [point.title, point.content, ...point.keywords]),
    };
  }

  const basic: string[] = [];
  const deep: string[] = [];
  const lines = String(knowledgeBase || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let current: keyof KnowledgeBuckets = "basic";
  for (const line of lines) {
    if (/深度理解|deep_understanding|深層|因果|影響|評價|分析/i.test(line)) current = "deep";
    if (/基礎事實|basic_fact|基本事實|客觀事實|定義|時間|地點/i.test(line)) current = "basic";
    const entries = splitKnowledgeEntries(line);
    if (!entries.length) continue;
    if (current === "deep") deep.push(...entries);
    else basic.push(...entries);
  }

  if (!basic.length && !deep.length) {
    const fallbackEntries = String(knowledgeBase || "")
      .split(/\r?\n/)
      .flatMap((line) => splitKnowledgeEntries(line));
    if (fallbackEntries.length) basic.push(...fallbackEntries);
    else basic.push(...tokenizeKnowledge(knowledgeBase));
  }
  return {
    basic: Array.from(new Set(basic)).slice(0, 80),
    deep: Array.from(new Set(deep)).slice(0, 80),
  };
}

function countMatches(text: string, terms: string[]) {
  const normalized = String(text || "").toLowerCase();
  return terms.reduce((count, term) => {
    const safeTerm = String(term || "").toLowerCase().trim();
    if (!safeTerm) return count;
    return normalized.includes(safeTerm) ? count + 1 : count;
  }, 0);
}

function scoreOutputLevel(messages: string[], buckets: KnowledgeBuckets) {
  const combined = messages.join("\n");
  const basicMatches = countMatches(combined, buckets.basic);
  const deepMatches = countMatches(combined, buckets.deep);
  const relationSignals = /(因為|所以|因此|導致|影響|關係|連結|相關|比較|相反|原因|結果|背景|推論|說明|解釋)/.test(combined);
  const meaningfulMessages = messages.filter((msg) => msg.trim().length >= 8).length;

  if (deepMatches > 0) return 3;
  if (basicMatches >= 2 && (relationSignals || meaningfulMessages >= 2)) return 2;
  if (basicMatches > 0) return 1;
  return 0;
}

function outputLevelText(level: number) {
  if (level >= 3) return "深入連結";
  if (level === 2) return "正確回憶";
  if (level === 1) return "簡短回應";
  return "偏離主題";
}

function interactionBand(depth: number) {
  if (depth < 0.25) return { code: "Y1", text: "初步參與" };
  if (depth < 0.5) return { code: "Y2", text: "持續互動" };
  if (depth < 0.75) return { code: "Y3", text: "深入探索" };
  return { code: "Y4", text: "高度投入" };
}

function classifyStatus(level: number, depth: number) {
  if (level <= 1 || depth < 0.35) return { status: "warning", statusText: "未完成" };
  if (level >= 3 || depth >= 0.75) return { status: "knowledge", statusText: "已完成" };
  return { status: "normal", statusText: "進行中" };
}

function buildKnowledgePoints(
  buckets: KnowledgeBuckets,
  studentCount: number,
  messagesByStudentBot: Map<string, Array<{ content: string; createdAt: string }>>,
  botId: string,
  studentIds: string[],
  structuredPoints: StructuredKnowledgePoint[] = []
) {
  const source = structuredPoints.length
    ? structuredPoints.map((point) => ({
        label: point.title,
        terms: [point.title, point.content, ...point.keywords].filter(Boolean),
      }))
    : Array.from(new Set([...(buckets.basic || []), ...(buckets.deep || [])]))
        .slice(0, 10)
        .map((label) => ({ label, terms: [label] }));
  if (!source.length) return [];

  return source.map(({ label, terms }) => {
    const hits = studentIds.filter((studentId) => {
      const messages = messagesByStudentBot.get(`${studentId}:${botId}`) || [];
      return messages.some((msg) => {
        const content = String(msg.content || "");
        return terms.some((term) => term && content.includes(term));
      });
    }).length;
    const score = studentCount > 0 ? Math.round((hits / studentCount) * 100) : 0;
    return {
      label,
      score,
      completed: score >= 100 || (studentCount === 1 && score > 0),
    } satisfies KnowledgePoint;
  });
}

function formatStudentIndex(index: number) {
  return String(index + 1).padStart(2, "0");
}

function buildAssessmentRow(input: {
  student: any;
  index: number;
  messages: Array<{ content: string; createdAt: string; source?: string }>;
  buckets: KnowledgeBuckets;
}) {
  const messageContents = input.messages.map((message) => String(message.content || ""));
  const outputLevel = scoreOutputLevel(messageContents, input.buckets);
  const interactionTurn = input.messages.length;
  const turnFactor = Math.min(interactionTurn / 10, 1);
  const qualityFactor = outputLevel / 3;
  const interactionDepth = Number(((turnFactor * 0.6) + (qualityFactor * 0.4)).toFixed(3));
  const band = interactionBand(interactionDepth);
  const status = classifyStatus(outputLevel, interactionDepth);
  const mastery = Math.round(Math.max(0, Math.min(1, interactionDepth * 0.72 + qualityFactor * 0.28)) * 100);
  const directInputCount = input.messages.filter((msg) => {
    const source = String(msg.source || "direct").toLowerCase();
    return source === "direct" || source === "typing" || source === "voice" || source === "chat_enter" || source === "shared_bot";
  }).length;
  const directInputChars = input.messages.reduce((sum, msg) => {
    const source = String(msg.source || "direct").toLowerCase();
    if (!(source === "direct" || source === "typing" || source === "voice" || source === "chat_enter" || source === "shared_bot")) return sum;
    return sum + String(msg.content || "").trim().length;
  }, 0);
  const assistedInputCount = input.messages.filter((msg) => {
    const source = String(msg.source || "").toLowerCase();
    return source.includes("guided") || source.includes("hint") || source.includes("bubble") || source.includes("assist");
  }).length;
  const voiceInputCount = input.messages.filter((msg) => String(msg.source || "").toLowerCase() === "voice").length;
  const activeInputCount = Math.max(0, directInputCount);
  const activeInputRate = interactionTurn ? Math.round((activeInputCount / interactionTurn) * 100) : 0;
  const assistedInputRate = interactionTurn ? Math.round((assistedInputCount / interactionTurn) * 100) : 0;
  const hasStudentInput = messageContents.some((msg) => msg.trim().length >= 12);

  return {
    id: formatStudentIndex(input.index),
    studentId: input.student.id,
    name: input.student.full_name || input.student.email || `學生 ${formatStudentIndex(input.index)}`,
    mastery,
    output: `L${outputLevel}`,
    outputLevel,
    outputText: outputLevelText(outputLevel),
    interaction: `${band.code} ${band.text}`,
    interactionCode: band.code,
    interactionText: band.text,
    interactionDepth,
    rounds: interactionTurn,
    mode: interactionTurn ? (assistedInputCount > activeInputCount ? "系統引導" : "主動輸入") : "尚未互動",
    activeInputCount,
    assistedInputCount,
    directInputCount,
    directInputChars,
    voiceInputCount,
    guidedInputCount: assistedInputCount,
    activeInputRate,
    assistedInputRate,
    ...status,
  };
}

function buildWeightedAssessmentRow(input: {
  student: any;
  index: number;
  items: Array<{
    botId: string;
    messages: Array<{ content: string; createdAt: string; source?: string }>;
    buckets: KnowledgeBuckets;
  }>;
}) {
  if (!input.items.length) {
    return buildAssessmentRow({ student: input.student, index: input.index, messages: [], buckets: { basic: [], deep: [] } });
  }

  const now = Date.now();
  const scoredItems = input.items.map((item) => {
    const baseRow = buildAssessmentRow({ student: input.student, index: input.index, messages: item.messages, buckets: item.buckets });
    const latestAt = item.messages.reduce((max, msg) => Math.max(max, new Date(msg.createdAt).getTime() || 0), 0);
    const ageDays = latestAt ? Math.max(0, (now - latestAt) / (1000 * 60 * 60 * 24)) : 30;
    const recencyFactor = Math.max(0.35, 1 - Math.min(ageDays, 30) / 30);
    const turnWeight = Math.max(1, baseRow.rounds);
    const weight = turnWeight * (0.7 + recencyFactor * 0.3);
    return { baseRow, weight };
  });

  const totalWeight = scoredItems.reduce((sum, item) => sum + item.weight, 0) || 1;
  const weightedOutputLevel = scoredItems.reduce((sum, item) => sum + item.baseRow.outputLevel * item.weight, 0) / totalWeight;
  const weightedDepth = scoredItems.reduce((sum, item) => sum + item.baseRow.interactionDepth * item.weight, 0) / totalWeight;
  const weightedRounds = scoredItems.reduce((sum, item) => sum + item.baseRow.rounds * item.weight, 0) / totalWeight;
  const blendedOutputLevel = Math.max(0, Math.min(3, Math.round(weightedOutputLevel)));
  const band = interactionBand(weightedDepth);
  const status = classifyStatus(blendedOutputLevel, weightedDepth);
  const mastery = Math.round(Math.max(0, Math.min(1, weightedDepth * 0.72 + (blendedOutputLevel / 3) * 0.28)) * 100);
  const totalDirectInputCount = scoredItems.reduce((sum, item) => sum + Number(item.baseRow.directInputCount || 0), 0);
  const totalActiveInputCount = scoredItems.reduce((sum, item) => sum + Number(item.baseRow.activeInputCount || 0), 0);
  const totalAssistedInputCount = scoredItems.reduce((sum, item) => sum + Number(item.baseRow.assistedInputCount || 0), 0);
  const totalVoiceInputCount = scoredItems.reduce((sum, item) => sum + Number(item.baseRow.voiceInputCount || 0), 0);
  const totalGuidedInputCount = scoredItems.reduce((sum, item) => sum + Number(item.baseRow.guidedInputCount || 0), 0);
  const totalDirectInputChars = scoredItems.reduce((sum, item) => sum + Number(item.baseRow.directInputChars || 0), 0);
  const totalInputs = totalActiveInputCount + totalAssistedInputCount;
  const activeInputRate = totalInputs ? Math.round((totalActiveInputCount / totalInputs) * 100) : 0;
  const assistedInputRate = totalInputs ? Math.round((totalAssistedInputCount / totalInputs) * 100) : 0;
  const mode = scoredItems.some((item) => item.baseRow.assistedInputCount > item.baseRow.activeInputCount)
    ? "系統引導"
    : "主動輸入";

  return {
    id: formatStudentIndex(input.index),
    studentId: input.student.id,
    name: input.student.full_name || input.student.email || `學生 ${formatStudentIndex(input.index)}`,
    mastery,
    output: `L${blendedOutputLevel}`,
    outputLevel: blendedOutputLevel,
    outputText: outputLevelText(blendedOutputLevel),
    interaction: `${band.code} ${band.text}`,
    interactionCode: band.code,
    interactionText: band.text,
    interactionDepth: Number(weightedDepth.toFixed(3)),
    rounds: Math.round(weightedRounds),
    mode,
    activeInputCount: totalActiveInputCount,
    assistedInputCount: totalAssistedInputCount,
    directInputCount: totalDirectInputCount,
    voiceInputCount: totalVoiceInputCount,
    guidedInputCount: totalGuidedInputCount,
    directInputChars: totalDirectInputChars,
    activeInputRate,
    assistedInputRate,
    weightedBots: scoredItems.length,
    weightedOutputLevel: Number(weightedOutputLevel.toFixed(3)),
    ...status,
  };
}

/* -------------------- GET ALL BOTS -------------------- */
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureQuizTables();
    const user = getAuthUser(req);
    await ensureDefaultTeacherExperience(user);
    const result = await pool.query(
      `SELECT
        b.*,
        q.id AS active_quiz_id,
        q.title AS active_quiz_title,
        qa.status AS active_quiz_attempt_status
      FROM bots b
      LEFT JOIN LATERAL (
        SELECT id, title
        FROM quizzes
        WHERE bot_id=b.id AND status='published'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      ) q ON TRUE
      LEFT JOIN LATERAL (
        SELECT status
        FROM quiz_attempts
        WHERE quiz_id=q.id AND student_id=$2
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      ) qa ON TRUE
      WHERE b.owner_id=$1
      ORDER BY b.created_at DESC`,
      [user?.id, user?.id]
    );

    // 全班覆蓋：每隻 bot 有幾多知識點被名冊內學生覆蓋（跨對話累積，按話題分維度）。
    // 只計老師名冊（teacher_students）內嘅在學學生——老師測試自己隻 bot 都會寫
    // 一行 bot_student_progress，唔過濾就會當佢係學生（口徑同 student-progress 一致）。
    const botIds = result.rows.map((row) => String(row.id));
    const [topicsByBot, progressByBot] = await Promise.all([
      loadTopicBuckets(botIds),
      loadProgressByTopic({ botIds, teacherId: user?.id }),
    ]);
    const coverageMap = new Map<string, { covered: number; total: number }>();
    for (const row of result.rows) {
      const botId = String(row.id);
      const aggregate = aggregateTopicCoverage({
        kbPoints: coreKnowledgePoints(String(row.knowledge_base || "")),
        buckets: topicsByBot.get(botId) || [],
        progressByTopic: progressByBot.get(botId) || new Map(),
      });
      coverageMap.set(botId, { covered: aggregate.covered, total: aggregate.total });
    }

    res.json(result.rows.map((row) => ({
      ...toClient(row),
      hasPublishedQuiz: Boolean(row.active_quiz_id),
      hasPendingQuiz: Boolean(row.active_quiz_id) && row.active_quiz_attempt_status !== "completed",
      activeQuizId: row.active_quiz_id || "",
      activeQuizTitle: row.active_quiz_title || "",
      coverage: coverageMap.get(String(row.id)),
    })));
  } catch (err) {
    console.error("❌ GET / Failed:", err);
    res.status(500).json({ error: "Failed to fetch bots" });
  }
});

router.get("/sharing/students", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url
       FROM teacher_students ts
       JOIN users u ON u.id = ts.student_id
       WHERE ts.teacher_id = $1 AND u.status = 'active'
       ORDER BY u.full_name ASC`,
      [user.id]
    );
    return res.json({ students: result.rows.map((row) => ({
      id: row.id, fullName: row.full_name, email: row.email, avatarUrl: row.avatar_url || "",
    })) });
  } catch (err) {
    console.error("GET /sharing/students Failed:", err);
    return res.status(500).json({ error: "Failed to load students" });
  }
});

router.post("/sharing/students", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const student = await pool.query(
      "SELECT id, full_name, email, avatar_url FROM users WHERE email=$1 AND role='student' AND status='active'",
      [email]
    );
    if (!student.rowCount) return res.status(404).json({ error: "student account not found" });
    await pool.query(
      "INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [user.id, student.rows[0].id]
    );
    const row = student.rows[0];
    return res.json({ student: { id: row.id, fullName: row.full_name, email: row.email, avatarUrl: row.avatar_url || "" } });
  } catch (err) {
    console.error("POST /sharing/students Failed:", err);
    return res.status(500).json({ error: "Failed to add student" });
  }
});

router.get("/sharing/assignments", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    const result = await pool.query(
      "SELECT bot_id, student_id FROM bot_student_shares WHERE teacher_id=$1",
      [user?.id]
    );
    return res.json({ assignments: result.rows.map((row) => ({ botId: row.bot_id, studentId: row.student_id })) });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load assignments" });
  }
});

router.get("/:id/group-shares", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    const bot = await pool.query("SELECT id FROM bots WHERE id=$1 AND owner_id=$2", [req.params.id, user?.id]);
    if (!bot.rowCount) return res.status(404).json({ error: "Bot not found" });
    const groups = await pool.query("SELECT group_id FROM bot_group_shares WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user?.id]);
    const exclusions = await pool.query("SELECT student_id FROM bot_student_exclusions WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user?.id]);
    return res.json({ groupIds: groups.rows.map(row => row.group_id), excludedStudentIds: exclusions.rows.map(row => row.student_id) });
  } catch (error) {
    console.error("Load group shares failed", error);
    return res.status(500).json({ error: "Failed to load class access" });
  }
});

router.put("/:id/group-shares", requireAuth, async (req, res) => {
  if (!Array.isArray(req.body?.groupIds) || !Array.isArray(req.body?.excludedStudentIds)) {
    return res.status(400).json({ error: "groupIds and excludedStudentIds are required" });
  }
  const groupIds = [...new Set(req.body.groupIds.map(String))];
  const excludedStudentIds = [...new Set(req.body.excludedStudentIds.map(String))];
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !['teacher', 'admin'].includes(user.role)) return res.status(403).json({ error: "teacher account required" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bot = await client.query("SELECT id FROM bots WHERE id=$1 AND owner_id=$2 FOR UPDATE", [req.params.id, user.id]);
      if (!bot.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Bot not found" });
      }
      const groups = await client.query("SELECT id FROM student_groups WHERE teacher_id=$1 AND id=ANY($2::text[])", [user.id, groupIds]);
      const students = await client.query(`SELECT DISTINCT gm.student_id FROM student_group_members gm
        JOIN student_groups sg ON sg.id=gm.group_id WHERE sg.teacher_id=$1 AND sg.id=ANY($2::text[])
        AND gm.student_id=ANY($3::text[])`, [user.id, groupIds, excludedStudentIds]);
      if (groups.rowCount !== groupIds.length || students.rowCount !== excludedStudentIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid classes or excluded students" });
      }
      await client.query("DELETE FROM bot_group_shares WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user.id]);
      await client.query("DELETE FROM bot_student_exclusions WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user.id]);
      await client.query("INSERT INTO bot_group_shares (bot_id, teacher_id, group_id) SELECT $1, $2, UNNEST($3::text[])", [req.params.id, user.id, groupIds]);
      await client.query("INSERT INTO bot_student_exclusions (bot_id, teacher_id, student_id) SELECT $1, $2, UNNEST($3::text[])", [req.params.id, user.id, excludedStudentIds]);
      await client.query("COMMIT");
      return res.json({ ok: true, groupIds, excludedStudentIds });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Save group shares failed", error);
    return res.status(500).json({ error: "Failed to save class access" });
  }
});

router.get("/:id/access", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    const bot = await pool.query(
      "SELECT id, is_visible FROM bots WHERE id=$1 AND owner_id=$2",
      [String(req.params.id || ""), user?.id]
    );
    if (!bot.rowCount) return res.status(404).json({ error: "Bot not found" });
    const groups = await pool.query(
      "SELECT group_id FROM bot_group_shares WHERE bot_id=$1 AND teacher_id=$2 ORDER BY created_at ASC",
      [req.params.id, user?.id]
    );
    return res.json({
      mode: bot.rows[0].is_visible && groups.rowCount
        ? "both"
        : bot.rows[0].is_visible
          ? "link"
          : "group",
      groupIds: groups.rows.map((row) => String(row.group_id)),
    });
  } catch (err) {
    console.error("GET /:id/access Failed:", err);
    return res.status(500).json({ error: "Failed to load bot access" });
  }
});

router.put("/:id/access", requireAuth, async (req, res) => {
  const mode = String(req.body?.mode || "");
  const groupIds = Array.isArray(req.body?.groupIds)
    ? Array.from(new Set(req.body.groupIds.map(String)))
    : [];
  if (!['link', 'group', 'both'].includes(mode)) {
    return res.status(400).json({ error: "mode must be link, group, or both" });
  }
  if ((mode === 'group' || mode === 'both') && !groupIds.length) {
    return res.status(400).json({ error: "select at least one class" });
  }

  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const bot = await pool.query("SELECT id FROM bots WHERE id=$1 AND owner_id=$2", [req.params.id, user.id]);
    if (!bot.rowCount) return res.status(404).json({ error: "Bot not found" });

    const allowedGroups = groupIds.length
      ? await pool.query(
          "SELECT id FROM student_groups WHERE teacher_id=$1 AND id = ANY($2::text[])",
          [user.id, groupIds]
        )
      : { rows: [] as Array<{ id: string }> };
    if (allowedGroups.rows.length !== groupIds.length) {
      return res.status(400).json({ error: "one or more classes are invalid" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM bot_group_shares WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user.id]);
      await client.query("DELETE FROM bot_student_shares WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user.id]);
      await client.query("DELETE FROM bot_student_exclusions WHERE bot_id=$1 AND teacher_id=$2", [req.params.id, user.id]);
      if (mode === 'group' || mode === 'both') {
        await client.query(
          `INSERT INTO bot_group_shares (bot_id, teacher_id, group_id)
           SELECT $1, $2, UNNEST($3::text[])`,
          [req.params.id, user.id, groupIds]
        );
      }
      await client.query("UPDATE bots SET is_visible=$1, updated_at=NOW() WHERE id=$2 AND owner_id=$3", [mode === 'link' || mode === 'both', req.params.id, user.id]);
      await client.query("COMMIT");
      return res.json({ ok: true, mode, groupIds: mode === 'group' || mode === 'both' ? groupIds : [] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("PUT /:id/access Failed:", err);
    return res.status(500).json({ error: "Failed to update bot access" });
  }
});

router.put("/:id/shares", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    const botId = String(req.params.id || "");
    const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : [];
    const bot = await pool.query("SELECT id FROM bots WHERE id=$1 AND owner_id=$2", [botId, user?.id]);
    if (!bot.rowCount) return res.status(404).json({ error: "Bot not found" });

    const allowed = await pool.query(
      "SELECT student_id FROM teacher_students WHERE teacher_id=$1 AND student_id = ANY($2)",
      [user?.id, studentIds]
    );
    const allowedIds = allowed.rows.map((row) => row.student_id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (allowedIds.length) {
        await client.query(
          `DELETE FROM bot_student_shares
           WHERE bot_id=$1 AND teacher_id=$2 AND NOT (student_id = ANY($3::text[]))`,
          [botId, user?.id, allowedIds]
        );
        await client.query(
          `INSERT INTO bot_student_shares (bot_id, teacher_id, student_id)
           SELECT $1, $2, UNNEST($3::text[])
           ON CONFLICT DO NOTHING`,
          [botId, user?.id, allowedIds]
        );
      } else {
        await client.query(
          "DELETE FROM bot_student_shares WHERE bot_id=$1 AND teacher_id=$2",
          [botId, user?.id]
        );
      }
      await client.query("COMMIT");
    } catch (transactionError) {
      await client.query("ROLLBACK");
      throw transactionError;
    } finally {
      client.release();
    }
    return res.json({ ok: true, studentIds: allowedIds });
  } catch (err) {
    console.error("PUT /:id/shares Failed:", err);
    return res.status(500).json({ error: "Failed to share bot" });
  }
});

router.get("/shared/with-me", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    await ensureQuizTables();
    const user = getAuthUser(req);
    const result = await pool.query(
      `SELECT
         b.*,
         u.full_name AS teacher_name,
         q.id AS active_quiz_id,
         q.title AS active_quiz_title,
         qa.status AS active_quiz_attempt_status
       FROM bots b
       JOIN users u ON u.id = b.owner_id
       LEFT JOIN LATERAL (
         SELECT id, title
         FROM quizzes
         WHERE bot_id=b.id AND status='published'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1
       ) q ON TRUE
       LEFT JOIN LATERAL (
         SELECT status
         FROM quiz_attempts
         WHERE quiz_id=q.id AND student_id=$1
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1
       ) qa ON TRUE
       WHERE (
         EXISTS (
           SELECT 1
           FROM bot_student_shares s
           WHERE s.bot_id = b.id AND s.student_id = $1
         )
         OR EXISTS (
           SELECT 1
           FROM bot_group_shares bg
           JOIN student_group_members gm ON gm.group_id = bg.group_id
           WHERE bg.bot_id = b.id AND gm.student_id = $1
             AND NOT EXISTS (
               SELECT 1
               FROM bot_student_exclusions ex
               WHERE ex.bot_id = b.id AND ex.student_id = $1
             )
         )
       )
       ORDER BY b.updated_at DESC`,
      [user?.id]
    );
    const rows = result.rows;
    // 每隻 bot 嘅累積進度（跨對話，按話題分維度）；一次查完，唔逐隻 bot N+1。
    const botIds = rows.map((row) => String(row.id));
    const [topicsByBot, progressByBot] = await Promise.all([
      loadTopicBuckets(botIds),
      loadProgressByTopic({ botIds, userId: user?.id }),
    ]);
    return res.json(rows.map((row) => {
      const botId = String(row.id);
      const knowledgeBase = String(row.knowledge_base || "");
      const aggregate = aggregateTopicCoverage({
        kbPoints: coreKnowledgePoints(knowledgeBase),
        buckets: topicsByBot.get(botId) || [],
        progressByTopic: progressByBot.get(botId) || new Map(),
      });
      return {
        ...toClient(row),
        teacherName: row.teacher_name || "",
        hasPublishedQuiz: Boolean(row.active_quiz_id),
        hasPendingQuiz: Boolean(row.active_quiz_id) && row.active_quiz_attempt_status !== "completed",
        activeQuizId: row.active_quiz_id || "",
        activeQuizTitle: row.active_quiz_title || "",
        progress: { covered: aggregate.covered, total: aggregate.total },
      };
    }));
  } catch (err) {
    console.error("GET /shared/with-me Failed:", err);
    return res.status(500).json({ error: "Failed to load shared bots" });
  }
});

// 學生對單一 Bot 嘅累積進度（跨對話）；供聊天內進度條用。
router.get("/:botId/progress", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    const botId = String(req.params.botId || "");
    if (!botId) return res.status(400).json({ error: "missing botId" });

    // 存取閘：同對話入口（ask.ts）同一套規則——擁有者 / 公開 / 直接分享 /
    // 群組分享（未被排除）。唔可以「知 bot id 就讀到知識點內容」，所以
    // 冇權限同唔存在一樣回 404，唔洩漏 bot 存唔存在。
    const bot = await getAccessibleBot(botId, user?.id);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const kbPoints = coreKnowledgePoints(String(bot.knowledge_base || ""));
    const [topicsByBot, progressByBot] = await Promise.all([
      loadTopicBuckets([botId]),
      loadProgressByTopic({ botIds: [botId], userId: user.id }),
    ]);
    const aggregate = aggregateTopicCoverage({
      kbPoints,
      buckets: topicsByBot.get(botId) || [],
      progressByTopic: progressByBot.get(botId) || new Map(),
    });

    // "目前學習"：最新一段對話嘅 next_point_id（按嗰段對話嘅話題解析）。
    const stateResult = await pool.query(
      `SELECT next_point_id, topic_id FROM bot_conversation_states WHERE bot_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 1`,
      [botId, user.id]
    );
    let nextPoint: { id: string; title: string } | null = null;
    const stateTopicId = stateResult.rows.length ? String(stateResult.rows[0].topic_id || "") : "";
    const nextPointId = stateResult.rows.length ? String(stateResult.rows[0].next_point_id || "") : "";
    if (nextPointId) {
      const bucket = aggregate.buckets.find((item) => item.topicId === stateTopicId);
      const scope = bucket ? bucket.points : kbPoints;
      const point = scope.find((item) => item.id === nextPointId);
      if (point) nextPoint = { id: point.id, title: point.title };
    }

    const flatPoints = aggregate.buckets.flatMap((bucket) =>
      bucket.points.map((point) => ({
        ...point,
        topicId: bucket.topicId,
        topicName: bucket.topicName,
        covered: Boolean(aggregate.mergedIds.get(bucket.topicId)?.has(point.id)),
      }))
    );
    const coveredIds = Array.from(
      new Set([...aggregate.mergedIds.values()].flatMap((set) => [...set]))
    );

    return res.json({
      botId,
      total: aggregate.total,
      covered: aggregate.covered,
      nextPoint,
      coveredPointIds: coveredIds,
      points: flatPoints,
      topicBuckets: aggregate.buckets.map((bucket) => ({
        topicId: bucket.topicId,
        topicName: bucket.topicName,
        covered: bucket.covered,
        total: bucket.total,
      })),
    });
  } catch (err) {
    console.error("GET /:botId/progress Failed:", err);
    return res.status(500).json({ error: "Failed to load progress" });
  }
});

router.get("/teacher/assessment-report", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const studentResult = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url
       FROM teacher_students ts
       JOIN users u ON u.id = ts.student_id
       WHERE ts.teacher_id=$1 AND u.status='active'
       ORDER BY u.full_name ASC, u.email ASC`,
      [user.id]
    );

    const shareResult = await pool.query(
      `WITH student_bot_access AS (
         SELECT s.student_id, s.bot_id
         FROM bot_student_shares s
         WHERE s.teacher_id=$1

         UNION

         SELECT gm.student_id, bg.bot_id
         FROM bot_group_shares bg
         JOIN student_group_members gm ON gm.group_id=bg.group_id
         WHERE bg.teacher_id=$1
           AND NOT EXISTS (
             SELECT 1 FROM bot_student_exclusions ex
             WHERE ex.bot_id=bg.bot_id AND ex.teacher_id=bg.teacher_id AND ex.student_id=gm.student_id
           )

         UNION

         SELECT qa.student_id, qa.bot_id
         FROM quiz_attempts qa
         JOIN quizzes q ON q.id=qa.quiz_id AND q.teacher_id=$1
         JOIN teacher_students ts ON ts.student_id=qa.student_id AND ts.teacher_id=$1
       )
       SELECT s.student_id, b.id AS bot_id, b.name AS bot_name, b.knowledge_base, b.avatar_url AS bot_avatar_url
       FROM student_bot_access s
       JOIN bots b ON b.id = s.bot_id
       LEFT JOIN LATERAL (
         SELECT MAX(m.created_at) AS last_message_at
         FROM bot_chat_messages m
         WHERE m.bot_id = b.id AND m.teacher_id = $1
       ) lm ON TRUE
       ORDER BY lm.last_message_at DESC NULLS LAST, b.updated_at DESC`,
      [user.id]
    );

    const sharedBots = Array.from(
      new Map(
        shareResult.rows.map((row) => [
          String(row.bot_id),
          {
            id: String(row.bot_id),
            name: String(row.bot_name || "AI Bot"),
            knowledgeBase: String(row.knowledge_base || ""),
            avatarUrl: String(row.bot_avatar_url || ""),
          },
        ])
      ).values()
    );

    const requestedBotId = String(req.query?.botId || "").trim();
    const selectedBotId = requestedBotId && sharedBots.some((bot) => bot.id === requestedBotId)
      ? requestedBotId
      : "";

    const botByStudent = new Map<string, Array<{ botId: string; buckets: KnowledgeBuckets }>>();
    for (const row of shareResult.rows) {
      if (selectedBotId && String(row.bot_id) !== selectedBotId) continue;
      const list = botByStudent.get(row.student_id) || [];
      list.push({
        botId: row.bot_id,
        buckets: extractKnowledgeBuckets(row.knowledge_base || ""),
      });
      botByStudent.set(row.student_id, list);
    }

    const botIds = Array.from(new Set(
      shareResult.rows
        .map((row) => String(row.bot_id))
        .filter((botId) => Boolean(botId) && (!selectedBotId || botId === selectedBotId))
    ));
    const messageRows = botIds.length
      ? await pool.query(
          `SELECT user_id, bot_id, role, content, source, created_at
           FROM bot_chat_messages
           WHERE teacher_id=$1
             AND bot_id = ANY($2)
           ORDER BY created_at ASC`,
          [user.id, botIds]
        )
      : { rows: [] as any[] };

    const messagesByStudentBot = new Map<string, Array<{ content: string; createdAt: string; source?: string }>>();
    for (const row of messageRows.rows) {
      if (row.role !== "user") continue;
      const key = `${row.user_id}:${row.bot_id}`;
      const list = messagesByStudentBot.get(key) || [];
      list.push({ content: String(row.content || ""), createdAt: String(row.created_at || ""), source: String(row.source || "direct") });
      messagesByStudentBot.set(key, list);
    }

    const studentById = new Map(
      studentResult.rows.map((student) => [
        String(student.id),
        {
          id: String(student.id),
          name: String(student.full_name || student.email || "學生"),
          email: String(student.email || ""),
          avatarUrl: String(student.avatar_url || ""),
        },
      ])
    );
    const chatRecordMap = new Map<string, any>();
    for (const row of messageRows.rows) {
      const student = studentById.get(String(row.user_id));
      if (!student) continue;
      const key = `${row.user_id}:${row.bot_id}`;
      if (!chatRecordMap.has(key)) {
        chatRecordMap.set(key, {
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          studentAvatarUrl: student.avatarUrl,
          botId: String(row.bot_id),
          messages: [],
        });
      }
      chatRecordMap.get(key).messages.push({
        role: row.role === "bot" ? "bot" : "user",
        content: String(row.content || ""),
        source: String(row.source || "direct"),
        createdAt: new Date(row.created_at).toISOString(),
      });
    }
    const chatRecords = Array.from(chatRecordMap.values())
      .map((record) => ({
        ...record,
        messageCount: record.messages.length,
        lastActiveAt: record.messages[record.messages.length - 1]?.createdAt || null,
      }))
      .sort((a, b) => String(b.lastActiveAt || "").localeCompare(String(a.lastActiveAt || "")));

    const rows = studentResult.rows.map((student, index) => {
      const assignments = botByStudent.get(student.id) || [];
      if (!assignments.length) {
        return buildAssessmentRow({ student, index, messages: [], buckets: { basic: [], deep: [] } });
      }
      return buildWeightedAssessmentRow({
        student,
        index,
        items: assignments.map((assignment) => ({
          botId: assignment.botId,
          buckets: assignment.buckets,
          messages: messagesByStudentBot.get(`${student.id}:${assignment.botId}`) || [],
        })),
      });
    });

    const selectedBot = selectedBotId
      ? sharedBots.find((bot) => bot.id === selectedBotId) || null
      : sharedBots[0] || null;
    const selectedKnowledgeBase = selectedBot?.knowledgeBase || "";
    const selectedBuckets = selectedBot ? extractKnowledgeBuckets(selectedKnowledgeBase) : { basic: [], deep: [] };
    const structuredPoints = selectedBot ? extractStructuredKnowledgePoints(selectedKnowledgeBase) : [];
    const selectedStudentIds = studentResult.rows.map((row) => String(row.id));
    const knowledgePoints = selectedBot
      ? buildKnowledgePoints(
          selectedBuckets,
          Math.max(1, studentResult.rows.length),
          messagesByStudentBot,
          selectedBot.id,
          selectedStudentIds,
          structuredPoints
        )
      : [];

    const interactionSummary = rows.reduce(
      (acc, row) => {
        const typedRow = row as any;
        const active = Number(typedRow.activeInputCount || 0);
        const assisted = Number(typedRow.assistedInputCount || 0);
        acc.independent += active;
        acc.assisted += assisted;
        acc.totalInputs += active + assisted;
        acc.totalActiveChars += Number(typedRow.directInputChars || 0);
        acc.totalActiveMessages += Number(typedRow.directInputCount || 0);
        acc.points.push({
          name: typedRow.name,
          x: Math.max(0, Math.min(100, Number(typedRow.activeInputRate ?? Math.round((typedRow.interactionDepth || 0) * 100)))),
          y: Math.max(0, Math.min(100, Math.round(typedRow.mastery || 0))),
          status: typedRow.status,
        });
        return acc;
      },
      {
        independent: 0,
        assisted: 0,
        totalInputs: 0,
        totalActiveChars: 0,
        totalActiveMessages: 0,
        points: [] as Array<{ name: string; x: number; y: number; status: string }>,
      }
    );

    const counts = rows.reduce(
      (acc, row) => {
        acc.all += 1;
        acc[row.status as "warning" | "knowledge" | "normal"] += 1;
        return acc;
      },
      { all: 0, warning: 0, knowledge: 0, normal: 0 }
    );

    return res.json({
      rows,
      counts,
      sharedBots,
      selectedBotId: selectedBotId || (sharedBots[0]?.id || ""),
      selectedBot,
      knowledgePoints,
      chatRecords,
      interactionSummary: {
        independentRate: interactionSummary.totalInputs ? Math.round((interactionSummary.independent / interactionSummary.totalInputs) * 100) : 0,
        assistedRate: interactionSummary.totalInputs ? Math.round((interactionSummary.assisted / interactionSummary.totalInputs) * 100) : 0,
        averageFreeInputLength: interactionSummary.totalActiveMessages
          ? Math.round(interactionSummary.totalActiveChars / interactionSummary.totalActiveMessages)
          : 0,
        averageBubbleDependency: rows.length
          ? Number((interactionSummary.assisted / rows.length).toFixed(1))
          : 0,
        points: interactionSummary.points,
      },
      rules: {
        outputQuality: {
          L0: "未討論知識庫相關內容",
          L1: "討論或回答基礎事實相關內容",
          L2: "正確討論基礎事實並呈現事實間關聯",
          L3: "討論深度理解知識點",
        },
        interactionDepth: {
          formula: "interaction_depth = (min(interaction_turn / 10, 1.0) * 0.6) + ((output_quality_level / 3) * 0.4)",
          Y1: "interaction_depth < 0.25",
          Y2: "0.25–0.5",
          Y3: "0.5–0.75",
          Y4: ">= 0.75",
        },
      },
    });
  } catch (err) {
    console.error("GET /teacher/assessment-report Failed:", err);
    return res.status(500).json({ error: "Failed to build assessment report" });
  }
});

// C3：老師「使用後總結」—— 每隻 Bot 每個知識點有幾多學生已掌握（跨對話累積）。
// 只計老師名冊（teacher_students）內嘅在學學生：老師測試自己隻 bot 都會寫入
// bot_student_progress / bot_conversation_states，唔過濾就會當佢係學生。
router.get("/teacher/progress-overview", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const botsResult = await pool.query(
      `SELECT b.id, b.name, b.knowledge_base, b.avatar_url, b.updated_at
       FROM bots b
       WHERE EXISTS (
         SELECT 1 FROM bot_student_shares s
         WHERE s.bot_id=b.id AND s.teacher_id=$1
       ) OR EXISTS (
         SELECT 1 FROM bot_group_shares bg
         WHERE bg.bot_id=b.id AND bg.teacher_id=$1
       )
       ORDER BY b.updated_at DESC`,
      [user.id]
    );

    const bots = [];
    const topicsByBot = await loadTopicBuckets(botsResult.rows.map((row) => String(row.id)));
    for (const row of botsResult.rows) {
      const botId = String(row.id);
      const kbPoints = coreKnowledgePoints(String(row.knowledge_base || ""));
      const buckets = topicsByBot.get(botId) || [];
      const defaultTopic = buckets.find((bucket) => bucket.isDefault) || null;
      const kbBucketId = defaultTopic ? defaultTopic.topicId : "";
      // '' 進度（舊數據／冇指定話題）合併入默認話題桶
      const mapTopic = (topicId: string) => (topicId === "" ? kbBucketId : topicId);
      const effective: TopicBucket[] = [];
      if (defaultTopic) {
        effective.push({ ...defaultTopic, points: kbPoints.length ? kbPoints : defaultTopic.points });
      } else if (kbPoints.length) {
        effective.push({ topicId: "", topicName: "主知識庫", isDefault: true, points: kbPoints });
      }
      for (const bucket of buckets) {
        if (bucket !== defaultTopic && bucket.points.length) effective.push(bucket);
      }

      const progressResult = await pool.query(
        `SELECT user_id, topic_id, covered_point_ids FROM bot_student_progress
         WHERE bot_id=$1
           AND user_id IN (
             SELECT ts.student_id FROM teacher_students ts
             JOIN users u ON u.id = ts.student_id
             WHERE ts.teacher_id = $2 AND u.status = 'active'
           )`,
        [botId, user.id]
      );
      const coveredCounts = new Map<string, number>();
      const students = new Set<string>();
      for (const p of progressResult.rows) {
        students.add(String(p.user_id));
        const target = mapTopic(String(p.topic_id || ""));
        const ids = Array.isArray(p.covered_point_ids)
          ? p.covered_point_ids.map(String)
          : [];
        for (const id of ids) coveredCounts.set(`${target}::${id}`, (coveredCounts.get(`${target}::${id}`) || 0) + 1);
      }

      // 「常被跳過」：名冊內有幾多段對話喺 next_point 推唔動時跳走咗呢個點。
      const skipResult = await pool.query(
        `SELECT topic_id, skipped_point_ids FROM bot_conversation_states
         WHERE bot_id=$1
           AND user_id IN (
             SELECT ts.student_id FROM teacher_students ts
             JOIN users u ON u.id = ts.student_id
             WHERE ts.teacher_id = $2 AND u.status = 'active'
           )`,
        [botId, user.id]
      );
      const skipCounts = new Map<string, number>();
      for (const s of skipResult.rows) {
        const target = mapTopic(String(s.topic_id || ""));
        const ids = Array.isArray(s.skipped_point_ids)
          ? s.skipped_point_ids.map(String)
          : [];
        for (const id of ids) skipCounts.set(`${target}::${id}`, (skipCounts.get(`${target}::${id}`) || 0) + 1);
      }

      bots.push({
        id: botId,
        name: String(row.name || "AI Bot"),
        avatarUrl: String(row.avatar_url || ""),
        studentsWithProgress: students.size,
        points: effective.flatMap((bucket) =>
          bucket.points.map((point) => ({
            id: point.id,
            tier: point.tier,
            title: point.title,
            topicId: bucket.topicId,
            topicName: bucket.topicName,
            coveredCount: coveredCounts.get(`${bucket.topicId}::${point.id}`) || 0,
            skippedCount: skipCounts.get(`${bucket.topicId}::${point.id}`) || 0,
          }))
        ),
      });
    }

    return res.json({ bots });
  } catch (err) {
    console.error("GET /teacher/progress-overview Failed:", err);
    return res.status(500).json({ error: "Failed to build progress overview" });
  }
});

// 老師睇單一 Bot 嘅「每個學生掌握咗邊幾個知識點」（跨對話累積）。
// progress-overview 只有全班聚合，做唔到 per-student；呢個 endpoint 補上
// user_id 維度，同時供「班級知識覆蓋地圖」同「學生知識掌握」drawer 用。
router.get("/teacher/student-progress", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }

    const botId = String(req.query.botId || "");
    if (!botId) return res.status(400).json({ error: "missing botId" });

    // 只准睇自己分享過嘅 Bot（同 progress-overview 同一道閘）
    const botResult = await pool.query(
      `SELECT b.id, b.knowledge_base
       FROM bots b
       JOIN bot_student_shares s ON s.bot_id = b.id
       WHERE b.id=$1 AND s.teacher_id=$2
       LIMIT 1`,
      [botId, user.id]
    );
    if (!botResult.rows.length) return res.status(404).json({ error: "Bot not found" });

    const kbPoints = coreKnowledgePoints(String(botResult.rows[0].knowledge_base || ""));
    const topicsByBot = await loadTopicBuckets([botId]);
    const buckets = topicsByBot.get(botId) || [];
    const defaultTopic = buckets.find((bucket) => bucket.isDefault) || null;
    const kbBucketId = defaultTopic ? defaultTopic.topicId : "";
    // '' 進度（舊數據／冇指定話題）合併入默認話題桶
    const mapTopic = (topicId: string) => (topicId === "" ? kbBucketId : topicId);
    const effective: TopicBucket[] = [];
    if (defaultTopic) {
      effective.push({ ...defaultTopic, points: kbPoints.length ? kbPoints : defaultTopic.points });
    } else if (kbPoints.length) {
      effective.push({ topicId: "", topicName: "主知識庫", isDefault: true, points: kbPoints });
    }
    for (const bucket of buckets) {
      if (bucket !== defaultTopic && bucket.points.length) effective.push(bucket);
    }
    const bucketPoints = new Map(effective.map((bucket) => [bucket.topicId, bucket]));

    const studentsResult = await pool.query(
      `SELECT u.id, u.full_name, u.email
       FROM teacher_students ts
       JOIN users u ON u.id = ts.student_id
       WHERE ts.teacher_id=$1 AND u.status='active'
       ORDER BY u.full_name ASC, u.email ASC`,
      [user.id]
    );
    const studentIds = studentsResult.rows.map((row) => String(row.id));

    // 累積覆蓋（batched，按話題分維度）。寫入係 union、永不 prune，
    // 老師改過知識點之後會有退役 id 留喺表度——每個桶同自己嘅點 id 集 intersect。
    const coveredByStudent = new Map<string, Map<string, string[]>>();
    const hasProgress = new Set<string>();
    if (studentIds.length) {
      const progressResult = await pool.query(
        `SELECT user_id, topic_id, covered_point_ids FROM bot_student_progress
         WHERE bot_id=$1 AND user_id = ANY($2::text[])`,
        [botId, studentIds]
      );
      for (const row of progressResult.rows) {
        const studentId = String(row.user_id);
        hasProgress.add(studentId);
        const bucket = bucketPoints.get(mapTopic(String(row.topic_id || "")));
        if (!bucket) continue;
        const validIds = new Set(bucket.points.map((point) => point.id));
        const ids = Array.isArray(row.covered_point_ids)
          ? row.covered_point_ids.map(String).filter((id) => validIds.has(id))
          : [];
        const byTopic = coveredByStudent.get(studentId) || new Map<string, string[]>();
        byTopic.set(bucket.topicId, [...(byTopic.get(bucket.topicId) || []), ...ids]);
        coveredByStudent.set(studentId, byTopic);
      }
    }

    // 每人「目前學習」= 佢最新一段對話嘅 next_point_id（按嗰段對話嘅話題解析）。
    // 一個 query 攞晒，喺 JS 度每 user 取第一行（updated_at DESC），同 /:botId/progress 一致。
    const nextPointByStudent = new Map<string, { id: string; title: string }>();
    if (studentIds.length) {
      const stateResult = await pool.query(
        `SELECT user_id, next_point_id, topic_id FROM bot_conversation_states
         WHERE bot_id=$1 AND user_id = ANY($2::text[])
         ORDER BY updated_at DESC`,
        [botId, studentIds]
      );
      for (const row of stateResult.rows) {
        const studentId = String(row.user_id);
        if (nextPointByStudent.has(studentId)) continue; // 只要最新嗰行
        const bucket = bucketPoints.get(mapTopic(String(row.topic_id || "")));
        const scope = bucket ? bucket.points : kbPoints;
        const point = scope.find((item) => item.id === String(row.next_point_id || ""));
        if (point) nextPointByStudent.set(studentId, { id: point.id, title: point.title });
      }
    }

    const flatPoints = effective.flatMap((bucket) =>
      bucket.points.map((point) => ({
        id: point.id,
        tier: point.tier,
        title: point.title,
        topicId: bucket.topicId,
        topicName: bucket.topicName,
      }))
    );

    return res.json({
      botId,
      total: flatPoints.length,
      points: flatPoints,
      topicBuckets: effective.map((bucket) => ({
        topicId: bucket.topicId,
        topicName: bucket.topicName,
        points: bucket.points.map((point) => ({ id: point.id, tier: point.tier, title: point.title })),
      })),
      students: studentsResult.rows.map((row) => {
        const studentId = String(row.id);
        const byTopic = coveredByStudent.get(studentId) || new Map<string, string[]>();
        const coveredPointIds = Array.from(new Set([...byTopic.values()].flat()));
        return {
          userId: studentId,
          name: String(row.full_name || row.email || "學生"),
          covered: coveredPointIds.length,
          coveredPointIds,
          coveredBuckets: effective.map((bucket) => ({
            topicId: bucket.topicId,
            topicName: bucket.topicName,
            coveredPointIds: byTopic.get(bucket.topicId) || [],
          })),
          hasProgressRow: hasProgress.has(studentId),
          nextPoint: nextPointByStudent.get(studentId) || null,
        };
      }),
    });
  } catch (err) {
    console.error("GET /teacher/student-progress Failed:", err);
    return res.status(500).json({ error: "Failed to build student progress" });
  }
});

/* -------------------- GET SINGLE BOT -------------------- */
router.post("/precompute-sequences/all", async (req, res) => {
  const fps = Number(req.body?.fps || 25);
  try {
    await ensurePlatformTables();
    const user = await optionalAuth(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const result = await pool.query("SELECT * FROM bots WHERE owner_id=$1 ORDER BY created_at DESC", [user.id]);
    const base = getPublicBase(req);
    const report: Array<any> = [];

    for (const row of result.rows) {
      const bot = toClient(row) as any;
      const item: any = { botId: bot.id, name: bot.name, sequences: {} };
      const entries = ([
        { key: "idle", url: bot.videoIdle || "" },
        { key: "thinking", url: bot.videoThinking || "" },
        { key: "talking", url: bot.videoTalking || "" },
      ] satisfies SequenceVideoEntry[]).filter((x) => x.url);

      for (const entry of entries) {
        try {
          const manifest = await getOrCreateWebmSequence(entry.url, fps, base);
          item.sequences[entry.key] = manifest;
        } catch (e) {
          item.sequences[entry.key] = {
            error: e instanceof Error ? e.message : "sequence generation failed",
          };
        }
      }
      report.push(item);
    }

    return res.json({ ok: true, fps, count: report.length, report });
  } catch (err) {
    console.error("❌ POST /precompute-sequences/all Failed:", err);
    return res.status(500).json({ error: "Failed to precompute all bot sequences" });
  }
});

router.post("/:id/precompute-sequences", async (req, res) => {
  const { id } = req.params;
  const fps = Number(req.body?.fps || 25);
  try {
    await ensurePlatformTables();
    const user = await optionalAuth(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const result = await pool.query("SELECT * FROM bots WHERE id=$1 AND owner_id=$2", [id, user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bot not found" });
    }

    const bot = toClient(result.rows[0]) as any;
    const base = getPublicBase(req);
    const entries = ([
      { key: "idle", url: bot.videoIdle || "" },
      { key: "thinking", url: bot.videoThinking || "" },
      { key: "talking", url: bot.videoTalking || "" },
    ] satisfies SequenceVideoEntry[]).filter((x) => x.url);

    const sequences: Record<string, any> = {};
    for (const entry of entries) {
      try {
        sequences[entry.key] = await getOrCreateWebmSequence(entry.url, fps, base);
      } catch (e) {
        sequences[entry.key] = {
          error: e instanceof Error ? e.message : "sequence generation failed",
        };
      }
    }

    return res.json({ ok: true, botId: id, fps, sequences });
  } catch (err) {
    console.error("❌ POST /:id/precompute-sequences Failed:", err);
    return res.status(500).json({ error: "Failed to precompute sequences" });
  }
});

router.get("/interactions/today", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const rawIds = String(req.query?.ids || "").trim();
    const ids = rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!ids.length) {
      return res.json({ counts: {} });
    }

    const result = await pool.query(
      `
      SELECT bot_id, COUNT(*)::int AS count
      FROM bot_interaction_events
      WHERE bot_id = ANY($1)
        AND created_at >= date_trunc('day', NOW())
      GROUP BY bot_id
      `,
      [ids]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[String(row.bot_id)] = Number(row.count || 0);
    }
    return res.json({ counts });
  } catch (err) {
    console.error("❌ GET /interactions/today Failed:", err);
    return res.status(500).json({ error: "Failed to fetch today interactions" });
  }
});

router.post("/:id/interactions", async (req, res) => {
  const botId = String(req.params.id || "").trim();
  if (!botId) {
    return res.status(400).json({ error: "bot id is required" });
  }

  try {
    await ensurePlatformTables();
    const botResult = await pool.query("SELECT id, owner_id FROM bots WHERE id=$1", [botId]);
    if (!botResult.rowCount) {
      return res.status(404).json({ error: "Bot not found" });
    }

    const authUser = await optionalAuth(req);
    const source = String(req.body?.source || "chat_enter").slice(0, 32);

    await pool.query(
      `
      INSERT INTO bot_interaction_events (id, bot_id, user_id, source)
      VALUES ($1, $2, $3, $4)
      `,
      [crypto.randomUUID(), botId, authUser?.id || null, source]
    );

    const updateResult = await pool.query(
      `
      UPDATE bots
      SET interactions = COALESCE(interactions, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING interactions
      `,
      [botId]
    );

    return res.json({ ok: true, interactions: Number(updateResult.rows[0]?.interactions || 0) });
  } catch (err) {
    console.error("❌ POST /:id/interactions Failed:", err);
    return res.status(500).json({ error: "Failed to record interaction" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await ensureQuizTables();
    await ensurePlatformTables();
    const user = await optionalAuth(req);
    // 存取閘：同對話入口（ask.ts）同一套規則，即 getAccessibleBot。
    // 冇權限同唔存在一樣回 404，唔洩漏 bot 存唔存在；下面正式查詢唔再重寫一次條件。
    const accessibleBot = await getAccessibleBot(id, user?.id || null);
    if (!accessibleBot) return res.status(404).json({ error: "Bot not found" });

    const result = await pool.query(
      `SELECT
         bots.*,
         q.id AS active_quiz_id,
         q.title AS active_quiz_title,
         qa.status AS active_quiz_attempt_status
       FROM bots
       LEFT JOIN LATERAL (
         SELECT id, title
         FROM quizzes
         WHERE bot_id=bots.id AND status='published'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1
       ) q ON TRUE
       LEFT JOIN LATERAL (
         SELECT status
         FROM quiz_attempts
         WHERE quiz_id=q.id AND student_id=$2
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1
       ) qa ON TRUE
       WHERE bots.id=$1`,
      [id, user?.id || null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Bot not found" });

    res.json({
      ...toClient(result.rows[0]),
      hasPublishedQuiz: Boolean(result.rows[0].active_quiz_id),
      hasPendingQuiz:
        Boolean(result.rows[0].active_quiz_id) &&
        result.rows[0].active_quiz_attempt_status !== "completed",
      activeQuizId: result.rows[0].active_quiz_id || "",
      activeQuizTitle: result.rows[0].active_quiz_title || "",
    });
  } catch (err) {
    console.error("❌ GET /:id Failed:", err);
    res.status(500).json({ error: "Failed to fetch bot" });
  }
});

/* -------------------- CREATE BOT -------------------- */
router.post("/", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const bot = toDb(req.body);
    const user = getAuthUser(req);
    await ensureFeatureAvailable(user!.id, "bot_publish", 1);
    const openingMessage = await generateOpeningMessage(bot);
    await ensureCharacterTopicTables();

    const query = `
      INSERT INTO bots (
        id, name, subject, subject_color, avatar_url,
        background, animation, knowledge_base, security_prompt,
        video_idle, video_thinking, video_talking, voice_id,
        opening_message, interactions, accuracy, is_visible, owner_id, owner_email, grade
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *;
    `;

    const values = [
      bot.id,
      bot.name,
      bot.subject,
      bot.subject_color,
      bot.avatar_url,
      bot.background,
      bot.animation,
      bot.knowledge_base,
      bot.security_prompt,
      bot.video_idle,
      bot.video_thinking,
      bot.video_talking,
      bot.voice_id,
      openingMessage,
      bot.interactions ?? 0,
      bot.accuracy ?? 0,
      bot.is_visible ?? true,
      user?.id,
      user?.email || null,
      bot.grade || null,
    ];

    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      result = await client.query(query, values);
      await ensureDefaultTopicForCharacter(bot.id, bot.knowledge_base || "", client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await recordFeatureUsage(user!.id, "bot_publish", 1, { botId: bot.id });
    res.json(toClient(result.rows[0]));
  } catch (err) {
    console.error("❌ POST / Failed:", err);
    res.status(500).json({ error: "Failed to create bot" });
  }
});

/* -------------------- UPDATE BOT -------------------- */
router.put("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    await ensurePlatformTables();
    const bot = toDb(req.body);
    const user = getAuthUser(req);
    const openingMessage = await generateOpeningMessage(bot);
    await ensureCharacterTopicTables();

    const query = `
      UPDATE bots SET
        name=$1, subject=$2, subject_color=$3, avatar_url=$4,
        background=$5, animation=$6, knowledge_base=$7, security_prompt=$8,
        video_idle=$9, video_thinking=$10, video_talking=$11, voice_id=$12,
        opening_message=$13, interactions=$14, accuracy=$15, is_visible=$16, grade=$17,
        updated_at=NOW()
      WHERE id=$18 AND owner_id=$19
      RETURNING *;
    `;

    const values = [
      bot.name,
      bot.subject,
      bot.subject_color,
      bot.avatar_url,
      bot.background,
      bot.animation,
      bot.knowledge_base,
      bot.security_prompt,
      bot.video_idle,
      bot.video_thinking,
      bot.video_talking,
      bot.voice_id,
      openingMessage,
      bot.interactions ?? 0,
      bot.accuracy ?? 0,
      bot.is_visible ?? true,
      bot.grade || null,
      id,
      user?.id,
    ];

    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      result = await client.query(query, values);
      if (!result.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Bot not found" });
      }
      await syncInheritedTopicKnowledge(String(id), bot.knowledge_base || "", client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json(toClient(result.rows[0]));
  } catch (err) {
    console.error("❌ PUT /:id Failed:", err);
    res.status(500).json({ error: "Failed to update bot" });
  }
});

/* -------------------- DELETE BOT -------------------- */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const result = await pool.query(
      "DELETE FROM bots WHERE id=$1 AND owner_id=$2 AND template_key IS NULL RETURNING id",
      [req.params.id, user?.id]
    );
    if (!result.rowCount) {
      const existing = await pool.query("SELECT template_key FROM bots WHERE id=$1 AND owner_id=$2", [req.params.id, user?.id]);
      if (existing.rows[0]?.template_key) {
        return res.status(403).json({ error: "預設孔子 Bot 不能刪除，你仍可建立及管理自己的 Bot。" });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /:id Failed:", err);
    res.status(500).json({ error: "Failed to delete bot" });
  }
});

router.get("/admin/all", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user || !canManageAllAccounts(user.email)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const result = await pool.query(
      `
      SELECT
        b.*,
        u.email AS owner_email,
        u.full_name AS owner_name
      FROM bots b
      LEFT JOIN users u ON u.id = b.owner_id
      ORDER BY b.created_at DESC
      `
    );

    return res.json(
      result.rows.map((row) => ({
        ...toClient(row),
        ownerId: row.owner_id || "",
        ownerEmail: row.owner_email || "",
        ownerName: row.owner_name || "",
      }))
    );
  } catch (err) {
    console.error("❌ GET /admin/all Failed:", err);
    return res.status(500).json({ error: "Failed to fetch admin bot list" });
  }
});

router.put("/admin/:id/owner", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user || !canManageAllAccounts(user.email)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const botId = String(req.params.id || "").trim();
    const ownerId = String(req.body?.ownerId || "").trim();
    if (!botId || !ownerId) {
      return res.status(400).json({ error: "bot id and ownerId are required" });
    }

    await ensurePlatformTables();
    await ensureCharacterTopicTables();
    const ownerCheck = await pool.query("SELECT id, email FROM users WHERE id=$1 AND status='active'", [ownerId]);
    if (!ownerCheck.rowCount) {
      return res.status(404).json({ error: "target owner not found" });
    }

    const source = await pool.query("SELECT owner_id FROM bots WHERE id=$1", [botId]);
    if (!source.rowCount) return res.status(404).json({ error: "bot not found" });
    if (source.rows[0].owner_id === ownerId) {
      return res.status(400).json({ error: "target account already owns this bot" });
    }

    const copiedBotId = crypto.randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO bots (
           id, name, subject, subject_color, avatar_url, background, animation,
           knowledge_base, security_prompt, video_idle, video_thinking, video_talking,
           voice_id, interactions, accuracy, is_visible, owner_id, owner_email,
           opening_message, template_key, chat_message_limit
         )
         SELECT
           $1, name, subject, subject_color, avatar_url, background, animation,
           knowledge_base, security_prompt, video_idle, video_thinking, video_talking,
           voice_id, 0, accuracy, is_visible, $2, $3,
           opening_message, NULL, chat_message_limit
         FROM bots
         WHERE id=$4
         RETURNING *`,
        [copiedBotId, ownerId, ownerCheck.rows[0].email, botId]
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "bot not found" });
      }

      await client.query(
        `INSERT INTO character_topics (
           id, character_id, name, description, system_prompt, knowledge_content,
           sort_order, is_default, inherits_legacy_knowledge
         )
         SELECT
           CONCAT('topic_', $1::text, '_', ROW_NUMBER() OVER (ORDER BY sort_order, created_at)),
           $1, name, description, system_prompt, knowledge_content,
           sort_order, is_default, inherits_legacy_knowledge
         FROM character_topics
         WHERE character_id=$2`,
        [copiedBotId, botId]
      );
      await client.query("COMMIT");
      return res.json({ ok: true, sourceBotId: botId, bot: toClient(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ PUT /admin/:id/owner Failed:", err);
    return res.status(500).json({ error: "Failed to copy bot to target owner" });
  }
});

export default router;
