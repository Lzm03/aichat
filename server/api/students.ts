import crypto from "crypto";
import express from "express";
import { pool } from "../db.ts";
import {
  DEFAULT_MONTHLY_CREDIT_LIMIT,
  DEFAULT_USER_PREFERENCES,
  ensurePlatformTables,
  getAuthUser,
  hashPassword,
  requireAuth,
} from "../lib/platform-auth.ts";
import {
  MAX_BATCH_STUDENTS,
  fetchOwnedGroupIds,
  fetchOwnedStudentIds,
  normalizeIdList,
  normalizeOptionalIdList,
  setStudentsGroups,
  unlinkStudentsFromTeacher,
} from "../lib/student-ops.ts";

const router = express.Router();

type StudentInput = {
  fullName: string;
  email: string;
};

function requireTeacher(req: express.Request, res: express.Response) {
  const user = getAuthUser(req);
  if (!user || !["teacher", "admin"].includes(user.role)) {
    res.status(403).json({ error: "teacher account required" });
    return null;
  }
  return user;
}

function normalizeStudentInput(input: any): StudentInput | null {
  const fullName = String(input?.fullName || "").trim();
  const email = String(input?.email || "").trim().toLowerCase();
  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { fullName, email };
}

export const DEFAULT_STUDENT_INITIAL_PASSWORD = "00000000";

export function createStudentInitialPassword() {
  return DEFAULT_STUDENT_INITIAL_PASSWORD;
}

async function findOrCreateStudent(client: any, input: StudentInput) {
  let result = await client.query(
    "SELECT id, full_name, email, role, status FROM users WHERE email=$1",
    [input.email]
  );
  let temporaryPassword = "";
  let created = false;

  if (result.rowCount) {
    const existing = result.rows[0];
    if (existing.role !== "student") {
      const error = new Error(`account ${input.email} is not a student`) as Error & { status?: number };
      error.status = 409;
      throw error;
    }
    if (existing.status !== "active") {
      const error = new Error(`student account ${input.email} is disabled`) as Error & { status?: number };
      error.status = 409;
      throw error;
    }
  } else {
    temporaryPassword = createStudentInitialPassword();
    result = await client.query(
      `INSERT INTO users (
         id, full_name, email, role, avatar_url, preferences_json, password_hash,
         status, plan_name, monthly_credit_limit, credit_balance, credit_used
       ) VALUES ($1, $2, $3, 'student', NULL, $4::jsonb, $5, 'active', 'starter', $6, $6, 0)
       RETURNING id, full_name, email, role, status`,
      [
        crypto.randomUUID(),
        input.fullName,
        input.email,
        JSON.stringify(DEFAULT_USER_PREFERENCES),
        hashPassword(temporaryPassword),
        DEFAULT_MONTHLY_CREDIT_LIMIT,
      ]
    );
    created = true;
  }

  return { row: result.rows[0], created, temporaryPassword };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;

    const [studentResult, groupResult] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, u.email,
                COALESCE(array_agg(sg.id) FILTER (WHERE sg.id IS NOT NULL), '{}') AS group_ids
         FROM teacher_students ts
         JOIN users u ON u.id=ts.student_id
         LEFT JOIN student_group_members gm ON gm.student_id=u.id
         LEFT JOIN student_groups sg ON sg.id=gm.group_id AND sg.teacher_id=ts.teacher_id
         WHERE ts.teacher_id=$1 AND u.status='active'
         GROUP BY u.id, u.full_name, u.email
         ORDER BY u.full_name ASC, u.email ASC`,
        [teacher.id]
      ),
      pool.query(
        `SELECT sg.id, sg.name,
                COALESCE(array_agg(gm.student_id) FILTER (WHERE gm.student_id IS NOT NULL), '{}') AS student_ids
         FROM student_groups sg
         LEFT JOIN student_group_members gm ON gm.group_id=sg.id
         WHERE sg.teacher_id=$1
         GROUP BY sg.id, sg.name, sg.created_at
         ORDER BY sg.created_at ASC`,
        [teacher.id]
      ),
    ]);

    return res.json({
      students: studentResult.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        groupIds: row.group_ids || [],
      })),
      groups: groupResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: "class",
        studentIds: row.student_ids || [],
      })),
    });
  } catch (error) {
    console.error("GET /api/students failed:", error);
    return res.status(500).json({ error: "failed to load students" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const input = normalizeStudentInput(req.body);
  if (!input) return res.status(400).json({ error: "valid fullName and email are required" });

  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const createdStudent = await findOrCreateStudent(client, input);
      await client.query(
        "INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [teacher.id, createdStudent.row.id]
      );
      await client.query("COMMIT");
      return res.status(createdStudent.created ? 201 : 200).json({
        student: {
          id: createdStudent.row.id,
          fullName: createdStudent.row.full_name,
          email: createdStudent.row.email,
          groupIds: [],
        },
        created: createdStudent.created,
        temporaryPassword: createdStudent.temporaryPassword,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/students failed:", error);
    return res.status((error as any)?.status || 500).json({ error: (error as Error).message || "failed to add student" });
  }
});

router.post("/import", requireAuth, async (req, res) => {
  const rawStudents = Array.isArray(req.body?.students) ? req.body.students : [];
  if (!rawStudents.length || rawStudents.length > 500) {
    return res.status(400).json({ error: "students must contain between 1 and 500 rows" });
  }
  const students = rawStudents.map(normalizeStudentInput);
  if (students.some((student) => !student)) {
    return res.status(400).json({ error: "every student must have a valid name and email" });
  }

  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const imported = [];
      for (const student of students as StudentInput[]) {
        const createdStudent = await findOrCreateStudent(client, student);
        await client.query(
          "INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [teacher.id, createdStudent.row.id]
        );
        imported.push({
          id: createdStudent.row.id,
          fullName: createdStudent.row.full_name,
          email: createdStudent.row.email,
          groupIds: [],
          created: createdStudent.created,
          temporaryPassword: createdStudent.temporaryPassword,
        });
      }
      await client.query("COMMIT");
      return res.status(201).json({ students: imported });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/students/import failed:", error);
    return res.status((error as any)?.status || 500).json({ error: (error as Error).message || "failed to import students" });
  }
});

// 批量由老師名單移除學生。同單人 DELETE 一樣只係解除關聯，users row 保留。
router.delete("/", requireAuth, async (req, res) => {
  const studentIds = normalizeIdList(req.body?.studentIds);
  if (!studentIds) {
    return res.status(400).json({ error: `studentIds must be an array of 1-${MAX_BATCH_STUDENTS} ids` });
  }
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 擁有權喺 transaction 入面驗：驗完同刪完之間冇窗口俾人插手，
      // 「唔會 partial」先至真係成立。
      const owned = await fetchOwnedStudentIds(client, teacher.id, studentIds);
      if (owned.length !== studentIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "one or more students are invalid" });
      }
      const removed = await unlinkStudentsFromTeacher(client, teacher.id, studentIds);
      await client.query("COMMIT");
      return res.json({ ok: true, count: removed });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/students failed:", error);
    return res.status(500).json({ error: "failed to remove students" });
  }
});

router.delete("/:studentId", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const studentId = String(req.params.studentId || "");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const removed = await unlinkStudentsFromTeacher(client, teacher.id, [studentId]);
      await client.query("COMMIT");
      if (!removed) return res.status(404).json({ error: "student not found" });
      return res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/students/:studentId failed:", error);
    return res.status(500).json({ error: "failed to remove student" });
  }
});

// 批量為學生 replace 班級。body: { studentIds, groupIds }；空 groupIds ＝ 清空班級。
router.put("/groups", requireAuth, async (req, res) => {
  const studentIds = normalizeIdList(req.body?.studentIds);
  const groupIds = normalizeOptionalIdList(req.body?.groupIds);
  if (!studentIds) {
    return res.status(400).json({ error: `studentIds must be an array of 1-${MAX_BATCH_STUDENTS} ids` });
  }
  if (!groupIds) {
    return res.status(400).json({ error: `groupIds must be an array of at most ${MAX_BATCH_STUDENTS} ids` });
  }
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 全批驗完先寫：任何一個 id 唔屬於呢位老師就成批 400，唔做 partial。
      // （同上星期 TopicScoped 嘅取向一致：寧願大聲失敗，都唔好靜靜雞做一半。）
      const owned = await fetchOwnedStudentIds(client, teacher.id, studentIds);
      if (owned.length !== studentIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "one or more students are invalid" });
      }
      const allowedGroups = await fetchOwnedGroupIds(client, teacher.id, groupIds);
      if (allowedGroups.length !== groupIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "one or more groups are invalid" });
      }
      await setStudentsGroups(client, teacher.id, studentIds, groupIds);
      await client.query("COMMIT");
      return res.json({ ok: true, studentIds, groupIds });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PUT /api/students/groups failed:", error);
    return res.status(500).json({ error: "failed to update student groups" });
  }
});

router.put("/:studentId/groups", requireAuth, async (req, res) => {
  // 標明 string[]：req.body 係 any，唔標嘅話 new Set() 會推導成 Set<unknown>，
  // 就傳唔入 student-ops 嘅 string[] 參數（以前直接掉落 pool.query，所以睇唔出）。
  const groupIds = Array.isArray(req.body?.groupIds)
    ? Array.from(new Set<string>((req.body.groupIds as unknown[]).map(String)))
    : [];
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const studentId = String(req.params.studentId || "");
    const linked = await fetchOwnedStudentIds(pool, teacher.id, [studentId]);
    if (!linked.length) return res.status(404).json({ error: "student not found" });

    const allowedGroups = await fetchOwnedGroupIds(pool, teacher.id, groupIds);
    if (allowedGroups.length !== groupIds.length) {
      return res.status(400).json({ error: "one or more groups are invalid" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setStudentsGroups(client, teacher.id, [studentId], groupIds);
      await client.query("COMMIT");
      return res.json({ ok: true, groupIds });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PUT /api/students/:studentId/groups failed:", error);
    return res.status(500).json({ error: "failed to update student groups" });
  }
});

router.post("/groups", requireAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "group name is required" });
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const result = await pool.query(
      `INSERT INTO student_groups (id, teacher_id, name, type)
       VALUES ($1, $2, $3, 'class') RETURNING id, name`,
      [crypto.randomUUID(), teacher.id, name]
    );
    return res.status(201).json({ group: { id: result.rows[0].id, name: result.rows[0].name, type: "class", studentIds: [] } });
  } catch (error) {
    console.error("POST /api/students/groups failed:", error);
    return res.status(500).json({ error: "failed to create group" });
  }
});

router.delete("/groups/:groupId", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const result = await pool.query(
      "DELETE FROM student_groups WHERE id=$1 AND teacher_id=$2",
      [String(req.params.groupId || ""), teacher.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "group not found" });
    return res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/students/groups/:groupId failed:", error);
    return res.status(500).json({ error: "failed to delete group" });
  }
});

export default router;
