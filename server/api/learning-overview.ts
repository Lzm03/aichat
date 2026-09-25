/**
 * 學習報告「總覽」聚合 route（教師端）：
 * `GET /api/teachers/me/learning-overview?period=30d|90d|all`
 *
 * 設計：docs/learning-report-overview.md。一次 call 攞齊總覽 KPI、班級提醒、
 * 待處理異常（= Sidebar 紅點數）、最近動態（今日新增能力報告／掌握進展、
 * 7 日測驗質量報告）同今日快照。全部係學生行為向，唔重複智能評測 KPI。
 * 界線：冇排名、冇個人數字（沿用 docs/class-participation.md）。
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

/** HKT 今日開始（先例：server/api/student-tasks.ts:325） */
const HKT_TODAY_SQL =
  "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Hong_Kong') AT TIME ZONE 'Asia/Hong_Kong')";

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

    // participation 同 today 用同一套口徑（aggregateParticipation，class 維度），
    // today 只係 periodStart 唔同——唔會出現兩個數字講唔同嘢。
    const [classRows, todayRows, anomaly, ability, quiz] = await Promise.all([
      aggregateParticipation({ teacherId: user.id, periodStartSql: periodStart, dimension: "class" }),
      aggregateParticipation({ teacherId: user.id, periodStartSql: HKT_TODAY_SQL, dimension: "class" }),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status='open')::int AS anomaly_open,
           COUNT(*) FILTER (WHERE status='open' AND category='wellbeing')::int AS wellbeing_open
         FROM flagged_chat_messages
         WHERE teacher_id=$1`,
        [user.id]
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT (bot_id, user_id))::int AS reports_today,
           COUNT(DISTINCT user_id)::int AS students_today
         FROM bot_student_progress
         WHERE created_at >= ${HKT_TODAY_SQL}
           AND bot_id IN (SELECT id FROM bots WHERE owner_id=$1)
           AND user_id IN (
             SELECT ts.student_id FROM teacher_students ts
             JOIN users u ON u.id = ts.student_id AND u.status = 'active'
             WHERE ts.teacher_id = $1
           )`,
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS graded7d
         FROM quizzes
         WHERE teacher_id=$1 AND grading_completed_at >= NOW() - INTERVAL '7 days'`,
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
    // 班級提醒按需要跟進人數排（多至少）、最多 3 條。呢個係班級層級排序，
    // 唔係學生排名（界線只禁學生排名）；未分組 bucket（name null）都照出。
    classAlerts.sort((a, b) => b.noInteractionStudents - a.noInteractionStudents);
    const today = {
      activeStudents: todayRows.reduce((sum, row) => sum + row.activeStudents, 0),
      noInteractionStudents: todayRows.reduce((sum, row) => sum + row.noInteractionStudents, 0),
    };

    return res.json({
      period,
      participation,
      classAlerts: classAlerts.slice(0, 3),
      wellbeingOpen: Number(anomaly.rows[0]?.wellbeing_open || 0),
      anomalyOpen: Number(anomaly.rows[0]?.anomaly_open || 0),
      updates: {
        abilityReportsToday: Number(ability.rows[0]?.reports_today || 0),
        knowledgeStudentsToday: Number(ability.rows[0]?.students_today || 0),
        quizReportsGraded7d: Number(quiz.rows[0]?.graded7d || 0),
      },
      today,
    });
  } catch (error) {
    console.error("GET /teachers/me/learning-overview Failed:", error);
    return res.status(500).json({ error: "Failed to load learning overview" });
  }
});

export default router;
