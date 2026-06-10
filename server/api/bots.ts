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

function fallbackOpeningMessage(name: string) {
  const safeName = (name || "").trim() || "AI 助手";
  return `你好，我是${safeName}，我們一起開始今天的學習吧。`;
}

async function generateOpeningMessage(bot: any) {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) {
    return fallbackOpeningMessage(String(bot?.name || ""));
  }

  const name = String(bot?.name || "").trim() || "AI 助手";
  const characterContext = [bot?.knowledge_base, bot?.security_prompt]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  const systemPrompt =
    "你是角色語氣設計助手。你必須根據角色背景與人設寫一句固定開場白。只輸出一句繁體中文，不要引號，不要換行，不要解釋。";
  const userPrompt = `
角色名稱：${name}
角色背景與設定：
${characterContext || "（未提供）"}

請寫一句「固定開場句」，要求：
1. 必須緊扣知識庫裡的人物特點與語氣，不可泛泛而談；
2. 簡短，12-32字；
3. 可直接用在每次對話開頭；
4. 禁止模板句（例如「你好我是...有什麼可以幫你」）；
5. 若角色屬古典人物（如孔子、陶淵明等），可用符合角色的文言或詩性語氣，但保持易懂。
`.trim();

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      return fallbackOpeningMessage(name);
    }
    const data: any = await response.json().catch(() => null);
    const text = String(data?.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim();
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
  if (level <= 1 || depth < 0.35) return { status: "warning", statusText: "卡關預警" };
  if (level >= 3 || depth >= 0.75) return { status: "knowledge", statusText: "知識溢出" };
  return { status: "normal", statusText: "正常探索" };
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
  messages: string[];
  buckets: KnowledgeBuckets;
}) {
  const outputLevel = scoreOutputLevel(input.messages, input.buckets);
  const interactionTurn = input.messages.length;
  const turnFactor = Math.min(interactionTurn / 10, 1);
  const qualityFactor = outputLevel / 3;
  const interactionDepth = Number(((turnFactor * 0.6) + (qualityFactor * 0.4)).toFixed(3));
  const band = interactionBand(interactionDepth);
  const status = classifyStatus(outputLevel, interactionDepth);
  const mastery = Math.round(Math.max(0, Math.min(1, interactionDepth * 0.72 + qualityFactor * 0.28)) * 100);
  const hasStudentInput = input.messages.some((msg) => msg.trim().length >= 12);

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
    mode: hasStudentInput ? "主動輸入" : "尚未互動",
    ...status,
  };
}

function buildWeightedAssessmentRow(input: {
  student: any;
  index: number;
  items: Array<{
    botId: string;
    messages: Array<{ content: string; createdAt: string }>;
    buckets: KnowledgeBuckets;
  }>;
}) {
  if (!input.items.length) {
    return buildAssessmentRow({ student: input.student, index: input.index, messages: [], buckets: { basic: [], deep: [] } });
  }

  const now = Date.now();
  const scoredItems = input.items.map((item) => {
    const messages = item.messages.map((msg) => String(msg.content || ""));
    const baseRow = buildAssessmentRow({ student: input.student, index: input.index, messages, buckets: item.buckets });
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
  const mode = weightedRounds >= 2 ? "加權平均" : "尚未互動";

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
    weightedBots: scoredItems.length,
    weightedOutputLevel: Number(weightedOutputLevel.toFixed(3)),
    ...status,
  };
}

/* -------------------- GET ALL BOTS -------------------- */
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    const result = await pool.query(
      "SELECT * FROM bots WHERE owner_id=$1 ORDER BY created_at DESC",
      [user?.id]
    );
    res.json(result.rows.map(toClient));
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
    await pool.query("DELETE FROM bot_student_shares WHERE bot_id=$1 AND teacher_id=$2", [botId, user?.id]);
    for (const studentId of allowedIds) {
      await pool.query(
        "INSERT INTO bot_student_shares (bot_id, teacher_id, student_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [botId, user?.id, studentId]
      );
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
    const user = getAuthUser(req);
    const result = await pool.query(
      `SELECT b.*, u.full_name AS teacher_name
       FROM bot_student_shares s
       JOIN bots b ON b.id = s.bot_id
       JOIN users u ON u.id = s.teacher_id
       WHERE s.student_id=$1
       ORDER BY s.created_at DESC`,
      [user?.id]
    );
    return res.json(result.rows.map((row) => ({ ...toClient(row), teacherName: row.teacher_name || "" })));
  } catch (err) {
    console.error("GET /shared/with-me Failed:", err);
    return res.status(500).json({ error: "Failed to load shared bots" });
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
      `SELECT u.id, u.full_name, u.email
       FROM teacher_students ts
       JOIN users u ON u.id = ts.student_id
       WHERE ts.teacher_id=$1 AND u.status='active'
       ORDER BY u.full_name ASC, u.email ASC`,
      [user.id]
    );

    const shareResult = await pool.query(
      `SELECT s.student_id, b.id AS bot_id, b.name AS bot_name, b.knowledge_base, b.avatar_url AS bot_avatar_url
       FROM bot_student_shares s
       JOIN bots b ON b.id = s.bot_id
       WHERE s.teacher_id=$1`,
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
          `SELECT user_id, bot_id, content, created_at
           FROM bot_chat_messages
           WHERE teacher_id=$1
             AND role='user'
             AND bot_id = ANY($2)
           ORDER BY created_at ASC`,
          [user.id, botIds]
        )
      : { rows: [] as any[] };

    const messagesByStudentBot = new Map<string, Array<{ content: string; createdAt: string }>>();
    for (const row of messageRows.rows) {
      const key = `${row.user_id}:${row.bot_id}`;
      const list = messagesByStudentBot.get(key) || [];
      list.push({ content: String(row.content || ""), createdAt: String(row.created_at || "") });
      messagesByStudentBot.set(key, list);
    }

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
        if (row.mode === "主動輸入") acc.independent += 1;
        else acc.assisted += 1;
        acc.points.push({
          name: row.name,
          x: Math.max(0, Math.min(100, Math.round((row.interactionDepth || 0) * 100))),
          y: Math.max(0, Math.min(100, Math.round(row.mastery || 0))),
          status: row.status,
        });
        return acc;
      },
      {
        independent: 0,
        assisted: 0,
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
      interactionSummary: {
        independentRate: rows.length ? Math.round((interactionSummary.independent / rows.length) * 100) : 0,
        assistedRate: rows.length ? Math.round((interactionSummary.assisted / rows.length) * 100) : 0,
        averageFreeInputLength: rows.length ? Math.max(8, Math.round(rows.reduce((sum, row) => sum + (row.mastery || 0), 0) / rows.length / 2)) : 0,
        averageBubbleDependency: rows.length ? Number((interactionSummary.assisted / Math.max(1, rows.length * 10)).toFixed(1)) : 0,
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
    await ensurePlatformTables();
    const user = await optionalAuth(req);
    const result = user
      ? await pool.query(
          `SELECT * FROM bots WHERE id=$1 AND (
            owner_id=$2 OR is_visible=true OR EXISTS (
              SELECT 1 FROM bot_student_shares s WHERE s.bot_id=bots.id AND s.student_id=$2
            )
          )`,
          [id, user.id]
        )
      : await pool.query("SELECT * FROM bots WHERE id=$1 AND is_visible=true", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Bot not found" });

    res.json(toClient(result.rows[0]));
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

    const query = `
      INSERT INTO bots (
        id, name, subject, subject_color, avatar_url,
        background, animation, knowledge_base, security_prompt,
        video_idle, video_thinking, video_talking, voice_id,
        opening_message, interactions, accuracy, is_visible, owner_id, owner_email
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
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
    ];

    const result = await pool.query(query, values);
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

    const query = `
      UPDATE bots SET
        name=$1, subject=$2, subject_color=$3, avatar_url=$4,
        background=$5, animation=$6, knowledge_base=$7, security_prompt=$8,
        video_idle=$9, video_thinking=$10, video_talking=$11, voice_id=$12,
        opening_message=$13, interactions=$14, accuracy=$15, is_visible=$16,
        updated_at=NOW()
      WHERE id=$17 AND owner_id=$18
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
      id,
      user?.id,
    ];

    const result = await pool.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ error: "Bot not found" });

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
    await pool.query("DELETE FROM bots WHERE id=$1 AND owner_id=$2", [req.params.id, user?.id]);
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

    const ownerCheck = await pool.query("SELECT id, email FROM users WHERE id=$1", [ownerId]);
    if (!ownerCheck.rowCount) {
      return res.status(404).json({ error: "target owner not found" });
    }

    const result = await pool.query(
      `
      UPDATE bots
      SET owner_id=$1, owner_email=$2, updated_at=NOW()
      WHERE id=$3
      RETURNING *
      `,
      [ownerId, ownerCheck.rows[0].email, botId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "bot not found" });
    }

    return res.json({ ok: true, bot: toClient(result.rows[0]) });
  } catch (err) {
    console.error("❌ PUT /admin/:id/owner Failed:", err);
    return res.status(500).json({ error: "Failed to update bot owner" });
  }
});

export default router;
