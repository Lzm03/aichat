/**
 * 課堂參與度聚合 route（教師端）：
 * `GET /api/teachers/me/participation?period=30d|90d|all&dimension=class|bot|topic`
 *
 * 班級／Bot／話題三個維度由同一份 per-conversation 資料切出嚟
 * （lib/participation.ts 嘅 aggregateParticipation）。界線（規格硬性）：
 * 唔出排名、唔出個人數字——學生層級只有「有／未有實質互動」binary 名單。
 */
import express from "express";
import { requireAuth, getAuthUser } from "../lib/platform-auth.ts";
import {
  aggregateParticipation,
  ensureParticipationTables,
} from "../lib/participation.ts";

const router = express.Router();

const PERIOD_SQL: Record<string, string | null> = {
  "30d": "NOW() - INTERVAL '30 days'",
  "90d": "NOW() - INTERVAL '90 days'",
  all: null,
};
const DIMENSIONS = new Set(["class", "bot", "topic"]);

router.get("/teachers/me/participation", requireAuth, async (req, res) => {
  try {
    await ensureParticipationTables();
    const user = getAuthUser(req);
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "teacher account required" });
    }
    const period =
      typeof req.query.period === "string" && PERIOD_SQL[req.query.period] !== undefined
        ? req.query.period
        : "30d";
    const dimension =
      typeof req.query.dimension === "string" && DIMENSIONS.has(req.query.dimension)
        ? (req.query.dimension as "class" | "bot" | "topic")
        : "class";

    const rows = await aggregateParticipation({
      teacherId: user.id,
      periodStartSql: PERIOD_SQL[period],
      dimension,
    });
    return res.json({ dimension, period, rows });
  } catch (error) {
    console.error("GET /teachers/me/participation Failed:", error);
    return res.status(500).json({ error: "Failed to load participation report" });
  }
});

export default router;
