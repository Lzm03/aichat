/**
 * 學習報告「總覽」聚合 route（教師端）：
 * `GET /api/teachers/me/learning-overview?period=30d|90d|all`
 *
 * 設計：docs/learning-report-overview.md。一次 call 攞齊總覽 KPI、班級提醒
 * （cap 3 條＋total）、待處理異常（= Sidebar 紅點數）。全部係學生行為向，
 * 唔重複智能評測 KPI。界線：冇排名、冇個人數字（沿用 docs/class-participation.md）。
 */
import express from "express";
import { pool } from "../db.ts";
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

router.get("/teachers/me/learning-overview", requireAuth, async (req, res) => {
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
    const periodStart = PERIOD_SQL[period];

    const [classRows, anomaly] = await Promise.all([
      aggregateParticipation({ teacherId: user.id, periodStartSql: periodStart, dimension: "class" }),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status='open')::int AS anomaly_open,
           COUNT(*) FILTER (WHERE status='open' AND category='wellbeing')::int AS wellbeing_open
         FROM flagged_chat_messages
         WHERE teacher_id=$1`,
        [user.id]
      ),
    ]);

    const participation = {
      activeStudents: 0,
      noInteractionStudents: 0,
      meaninglessMessages: 0,
      studentMessageTotal: 0,
    };
    const classAlerts: Array<{
      classId: string;
      className: string | null;
      noInteractionStudents: number;
    }> = [];
    for (const row of classRows) {
      participation.activeStudents += row.activeStudents;
      participation.noInteractionStudents += row.noInteractionStudents;
      participation.meaninglessMessages += row.meaninglessMessages;
      participation.studentMessageTotal += row.studentMessageTotal;
      if (row.noInteractionStudents > 0) {
        classAlerts.push({
          classId: row.id,
          className: row.name,
          noInteractionStudents: row.noInteractionStudents,
        });
      }
    }
    // 班級提醒按需要跟進人數排（多至少）、最多 3 條；classAlertsTotal 係全數，
    // 前端超過 3 條時出「仲有 N 班」行。呢個係班級層級排序，唔係學生排名
    // （界線只禁學生排名）；未分組 bucket（name null）都照出。
    classAlerts.sort((a, b) => b.noInteractionStudents - a.noInteractionStudents);
    const classAlertsTotal = classAlerts.length;

    return res.json({
      period,
      participation,
      classAlerts: classAlerts.slice(0, 3),
      classAlertsTotal,
      wellbeingOpen: Number(anomaly.rows[0]?.wellbeing_open || 0),
      anomalyOpen: Number(anomaly.rows[0]?.anomaly_open || 0),
    });
  } catch (error) {
    console.error("GET /teachers/me/learning-overview Failed:", error);
    return res.status(500).json({ error: "Failed to load learning overview" });
  }
});

export default router;
