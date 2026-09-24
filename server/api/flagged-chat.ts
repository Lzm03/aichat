import crypto from "crypto";
import express from "express";
import { pool } from "../db.ts";
import { withSchemaLock } from "../lib/schema-lock.ts";
import { getAuthUser, requireAuth } from "../lib/platform-auth.ts";

// 異常對話記錄：學生訊息命中偵測規則時留低嘅審計紀錄，供老師覆核。
// 分兩類動作（見 docs/chat-anomaly-detection.md）：
//   block — 訊息被完全攔截（唔到 model、唔扣 credits、唔入對話史）
//   flag  — 訊息照樣送出，只留紀錄（情緒困擾類：靜音求救訊號係最壞失敗模式）
// 規則與詞表見 server/lib/chat-anomaly-rules.ts；detected_by 預留日後 AI
// 變體審查層（同表，唔使改 schema）。

const router = express.Router();

let ensureTablesPromise: Promise<void> | null = null;

export function ensureFlaggedChatTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = withSchemaLock(async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS flagged_chat_messages (
          id TEXT PRIMARY KEY,
          bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
          student_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          excerpt TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'inappropriate' CHECK (category IN ('inappropriate','wellbeing','privacy')),
          action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block','flag')),
          detected_by TEXT NOT NULL DEFAULT 'keyword' CHECK (detected_by IN ('keyword','ai')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
          teacher_comment TEXT NOT NULL DEFAULT '',
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // 舊表升級：category/action 係後加嘅欄，用 ALTER 令新舊 schema 收斂
      // （開機自癒，唔使 migration 檔）。
      await pool.query(`ALTER TABLE flagged_chat_messages ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'inappropriate'`);
      await pool.query(`ALTER TABLE flagged_chat_messages ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'block'`);
      await pool.query(`
        DO $$
        BEGIN
          ALTER TABLE flagged_chat_messages ADD CONSTRAINT flagged_chat_messages_category_check
            CHECK (category IN ('inappropriate','wellbeing','privacy'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await pool.query(`
        DO $$
        BEGIN
          ALTER TABLE flagged_chat_messages ADD CONSTRAINT flagged_chat_messages_action_check
            CHECK (action IN ('block','flag'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS flagged_chat_messages_teacher_status_created_idx
        ON flagged_chat_messages(teacher_id, status, created_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS flagged_chat_messages_student_created_idx
        ON flagged_chat_messages(student_user_id, created_at DESC)
      `);
    }).catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }
  return ensureTablesPromise;
}

export async function recordFlaggedChatMessage(input: {
  botId: string;
  studentUserId: string;
  teacherId: string;
  content: string;
  excerpt: string;
  ruleId: string;
  category: "inappropriate" | "wellbeing" | "privacy";
  action: "block" | "flag";
  detectedBy?: "keyword" | "ai";
}): Promise<void> {
  await ensureFlaggedChatTables();
  await pool.query(
    `INSERT INTO flagged_chat_messages
       (id, bot_id, student_user_id, teacher_id, content, excerpt, rule_id, category, action, detected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      crypto.randomUUID(),
      input.botId || null,
      input.studentUserId || null,
      input.teacherId || null,
      input.content,
      input.excerpt,
      input.ruleId,
      input.category,
      input.action,
      input.detectedBy ?? "keyword",
    ]
  );
}

function requireTeacher(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthUser(req);
  if (!user || !["teacher", "admin"].includes(user.role)) {
    return res.status(403).json({ error: "需要教師權限" });
  }
  next();
}

interface FlagRow {
  id: string;
  bot_id: string | null;
  student_user_id: string | null;
  content: string;
  excerpt: string;
  rule_id: string;
  category: "inappropriate" | "wellbeing" | "privacy";
  action: "block" | "flag";
  detected_by: "keyword" | "ai";
  status: "open" | "resolved" | "dismissed";
  teacher_comment: string;
  resolved_at: string | null;
  created_at: string;
  student_name: string | null;
  bot_name: string | null;
  group_names: string[];
}

function mapFlagRow(row: FlagRow) {
  return {
    id: row.id,
    botId: row.bot_id,
    botName: row.bot_name,
    studentUserId: row.student_user_id,
    studentName: row.student_name,
    groupNames: row.group_names,
    content: row.content,
    excerpt: row.excerpt,
    ruleId: row.rule_id,
    category: row.category,
    action: row.action,
    detectedBy: row.detected_by,
    status: row.status,
    teacherComment: row.teacher_comment,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

// select 欄位清單共用（list 同 PATCH 各有一條查詢）。
const FLAG_COLUMNS = `f.id, f.bot_id, f.student_user_id, f.content, f.excerpt, f.rule_id,
              f.category, f.action, f.detected_by, f.status, f.teacher_comment, f.resolved_at, f.created_at,
              u.full_name AS student_name, b.name AS bot_name,
              COALESCE((SELECT array_agg(sg.name)
                        FROM student_group_members gm
                        JOIN student_groups sg ON sg.id = gm.group_id AND sg.teacher_id = f.teacher_id
                        WHERE gm.student_id = f.student_user_id), '{}') AS group_names`;

const FLAG_FROM = `FROM flagged_chat_messages f
         LEFT JOIN users u ON u.id = f.student_user_id
         LEFT JOIN bots b ON b.id = f.bot_id`;

router.get("/count", requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = getAuthUser(req).id;
    await ensureFlaggedChatTables();
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM flagged_chat_messages WHERE teacher_id=$1 AND status='open'`,
      [teacherId]
    );
    res.json({ count: result.rows[0]?.count ?? 0 });
  } catch (error) {
    console.error("[flagged-chat] count failed", error);
    res.status(500).json({ error: "無法載入異常對話記錄統計" });
  }
});

router.get("/", requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = getAuthUser(req).id;
    const rawStatus = String(req.query.status || "open");
    // "archived" = resolved + dismissed（已歸檔 tab 用）：處理咗嘅紀錄合併睇。
    const status = ["open", "resolved", "dismissed", "archived", "all"].includes(rawStatus) ? rawStatus : "open";
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    await ensureFlaggedChatTables();

    const listResult = await pool.query<FlagRow>(
      `SELECT ${FLAG_COLUMNS}
         ${FLAG_FROM}
        WHERE f.teacher_id = $1
          AND ($2 = 'all'
               OR ($2 = 'archived' AND f.status IN ('resolved','dismissed'))
               OR f.status = $2)
        ORDER BY (f.category = 'wellbeing' AND f.status = 'open') DESC, f.created_at DESC
        LIMIT $3 OFFSET $4`,
      [teacherId, status, limit, offset]
    );

    const totalsResult = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='open')::int AS open_count
         FROM flagged_chat_messages WHERE teacher_id=$1`,
      [teacherId]
    );
    const statusCountsResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count
         FROM flagged_chat_messages WHERE teacher_id=$1 GROUP BY status`,
      [teacherId]
    );
    const statusCounts: Record<string, number> = { open: 0, resolved: 0, dismissed: 0 };
    for (const row of statusCountsResult.rows) {
      if (row.status in statusCounts) statusCounts[row.status] = Number(row.count) || 0;
    }

    res.json({
      flags: listResult.rows.map(mapFlagRow),
      total: totalsResult.rows[0]?.total ?? 0,
      openCount: totalsResult.rows[0]?.open_count ?? 0,
      statusCounts,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[flagged-chat] list failed", error);
    res.status(500).json({ error: "無法載入異常對話記錄" });
  }
});

router.patch("/:id", requireAuth, requireTeacher, async (req, res) => {
  const rawStatus = String(req.body?.status || "");
  const teacherComment = String(req.body?.teacherComment || "").trim().slice(0, 500);
  if (rawStatus !== "resolved" && rawStatus !== "dismissed") {
    return res.status(400).json({ error: "無效的處理狀態。" });
  }
  const nextStatus: "resolved" | "dismissed" = rawStatus;

  const client = await pool.connect();
  try {
    await ensureFlaggedChatTables();
    const teacherId = getAuthUser(req).id;
    await client.query("BEGIN");
    const existing = await client.query<FlagRow>(
      `SELECT ${FLAG_COLUMNS}
         ${FLAG_FROM}
        WHERE f.id=$1 AND f.teacher_id=$2
        FOR UPDATE OF f`,
      [req.params.id, teacherId]
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "異常對話記錄不存在。" });
    }
    if (row.status !== "open") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "此紀錄已處理。" });
    }
    await client.query(
      `UPDATE flagged_chat_messages
          SET status=$2, teacher_comment=$3, resolved_at=NOW()
        WHERE id=$1`,
      [req.params.id, nextStatus, teacherComment]
    );
    await client.query("COMMIT");
    res.json({ ok: true, flag: mapFlagRow({ ...row, status: nextStatus, teacher_comment: teacherComment, resolved_at: new Date().toISOString() }) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[flagged-chat] patch failed", error);
    res.status(500).json({ error: "無法處理此紀錄" });
  } finally {
    client.release();
  }
});

export default router;
