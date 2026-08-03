import crypto from "crypto";
import express from "express";
import { pool } from "../db.ts";
import { toClient } from "../botMapper.js";

const router = express.Router();

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireModoIntegration(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected = String(process.env.MODO_INTEGRATION_TOKEN || "").trim();
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !provided || !safeEqual(expected, provided)) {
    return res.status(401).json({ error: "invalid integration token" });
  }
  next();
}

function publicBot(row: any) {
  const bot = toClient(row);
  return {
    id: bot.id,
    name: bot.name,
    subject: bot.subject,
    subjectColor: bot.subjectColor,
    avatarUrl: bot.avatarUrl,
    background: bot.background,
    animation: bot.animation,
    videoIdle: bot.videoIdle,
    videoThinking: bot.videoThinking,
    videoTalking: bot.videoTalking,
    openingMessage: bot.openingMessage,
    isVisible: Boolean(bot.isVisible),
    updatedAt: row.updated_at || null,
  };
}

router.get("/bots", requireModoIntegration, async (_req, res) => {
  const ownerId = String(process.env.MODO_SOURCE_OWNER_ID || "").trim();
  const ownerEmail = String(process.env.MODO_SOURCE_OWNER_EMAIL || "").trim().toLowerCase();
  if (!ownerId && !ownerEmail) {
    return res.status(503).json({ error: "Modo source owner is not configured" });
  }

  try {
    const result = ownerId
      ? await pool.query(
          "SELECT * FROM bots WHERE owner_id=$1 ORDER BY created_at DESC",
          [ownerId]
        )
      : await pool.query(
          "SELECT * FROM bots WHERE LOWER(owner_email)=LOWER($1) ORDER BY created_at DESC",
          [ownerEmail]
        );
    return res.json({ bots: result.rows.map(publicBot), syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/integrations/modo/bots failed:", error);
    return res.status(500).json({ error: "failed to load integration bots" });
  }
});

export default router;
