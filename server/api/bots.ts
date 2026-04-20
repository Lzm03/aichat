import express from "express";
import { pool } from "../db.ts";
import { toDb, toClient } from "../botMapper.js";
import { getOrCreateWebmSequence, getPublicBase } from "./webm-sequence.ts";
import {
  ensureFeatureAvailable,
  ensurePlatformTables,
  getAuthUser,
  optionalAuth,
  recordFeatureUsage,
  requireAuth,
} from "../lib/platform-auth.ts";

const router = express.Router();

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

    const query = `
      INSERT INTO bots (
        id, name, subject, subject_color, avatar_url,
        background, animation, knowledge_base, security_prompt,
        video_idle, video_thinking, video_talking, voice_id,
        interactions, accuracy, is_visible, owner_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
      bot.interactions ?? 0,
      bot.accuracy ?? 0,
      bot.is_visible ?? true,
      user?.id,
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

    const query = `
      UPDATE bots SET
        name=$1, subject=$2, subject_color=$3, avatar_url=$4,
        background=$5, animation=$6, knowledge_base=$7, security_prompt=$8,
        video_idle=$9, video_thinking=$10, video_talking=$11, voice_id=$12,
        interactions=$13, accuracy=$14, is_visible=$15,
        updated_at=NOW()
      WHERE id=$16 AND owner_id=$17
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

export default router;
