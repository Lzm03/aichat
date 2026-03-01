import express from "express";
import { pool } from "../db.ts";
import { toDb, toClient } from "../botMapper.js";

const router = express.Router();

/* -------------------- GET ALL BOTS -------------------- */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bots ORDER BY created_at DESC");
    res.json(result.rows.map(toClient));
  } catch (err) {
    console.error("❌ GET / Failed:", err);
    res.status(500).json({ error: "Failed to fetch bots" });
  }
});

/* -------------------- GET SINGLE BOT -------------------- */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM bots WHERE id=$1", [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Bot not found" });

    res.json(toClient(result.rows[0]));
  } catch (err) {
    console.error("❌ GET /:id Failed:", err);
    res.status(500).json({ error: "Failed to fetch bot" });
  }
});

/* -------------------- CREATE BOT -------------------- */
router.post("/", async (req, res) => {
  try {
    const bot = toDb(req.body);

    const query = `
      INSERT INTO bots (
        id, name, subject, subject_color, avatar_url,
        background, animation, knowledge_base, security_prompt,
        video_idle, video_thinking, video_talking, voice_id,
        interactions, accuracy, is_visible
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
    ];

    const result = await pool.query(query, values);
    res.json(toClient(result.rows[0]));
  } catch (err) {
    console.error("❌ POST / Failed:", err);
    res.status(500).json({ error: "Failed to create bot" });
  }
});

/* -------------------- UPDATE BOT -------------------- */
router.put("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const bot = toDb(req.body);

    const query = `
      UPDATE bots SET
        name=$1, subject=$2, subject_color=$3, avatar_url=$4,
        background=$5, animation=$6, knowledge_base=$7, security_prompt=$8,
        video_idle=$9, video_thinking=$10, video_talking=$11, voice_id=$12,
        interactions=$13, accuracy=$14, is_visible=$15,
        updated_at=NOW()
      WHERE id=$16
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
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM bots WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /:id Failed:", err);
    res.status(500).json({ error: "Failed to delete bot" });
  }
});

export default router;