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
      const entries: Array<{ key: "idle" | "thinking" | "talking"; url: string }> = [
        { key: "idle", url: bot.videoIdle || "" },
        { key: "thinking", url: bot.videoThinking || "" },
        { key: "talking", url: bot.videoTalking || "" },
      ].filter((x) => x.url);

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
    const entries: Array<{ key: "idle" | "thinking" | "talking"; url: string }> = [
      { key: "idle", url: bot.videoIdle || "" },
      { key: "thinking", url: bot.videoThinking || "" },
      { key: "talking", url: bot.videoTalking || "" },
    ].filter((x) => x.url);

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
          "SELECT * FROM bots WHERE id=$1 AND (owner_id=$2 OR is_visible=true)",
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
