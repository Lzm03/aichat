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

function createTemporaryPassword() {
  return `Cr!${crypto.randomBytes(9).toString("base64url")}`;
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
    temporaryPassword = createTemporaryPassword();
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

router.delete("/:studentId", requireAuth, async (req, res) => {
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const studentId = String(req.params.studentId || "");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM student_group_members
         WHERE student_id=$1 AND group_id IN (SELECT id FROM student_groups WHERE teacher_id=$2)`,
        [studentId, teacher.id]
      );
      await client.query("DELETE FROM bot_student_shares WHERE student_id=$1 AND teacher_id=$2", [studentId, teacher.id]);
      await client.query("DELETE FROM bot_student_exclusions WHERE student_id=$1 AND teacher_id=$2", [studentId, teacher.id]);
      const result = await client.query(
        "DELETE FROM teacher_students WHERE teacher_id=$1 AND student_id=$2",
        [teacher.id, studentId]
      );
      await client.query("COMMIT");
      if (!result.rowCount) return res.status(404).json({ error: "student not found" });
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

router.put("/:studentId/groups", requireAuth, async (req, res) => {
  const groupIds = Array.isArray(req.body?.groupIds) ? Array.from(new Set(req.body.groupIds.map(String))) : [];
  try {
    await ensurePlatformTables();
    const teacher = requireTeacher(req, res);
    if (!teacher) return;
    const studentId = String(req.params.studentId || "");
    const linked = await pool.query(
      "SELECT 1 FROM teacher_students WHERE teacher_id=$1 AND student_id=$2",
      [teacher.id, studentId]
    );
    if (!linked.rowCount) return res.status(404).json({ error: "student not found" });

    const allowedGroups = groupIds.length
      ? await pool.query("SELECT id FROM student_groups WHERE teacher_id=$1 AND id = ANY($2::text[])", [teacher.id, groupIds])
      : { rows: [] as Array<{ id: string }> };
    if (allowedGroups.rows.length !== groupIds.length) {
      return res.status(400).json({ error: "one or more groups are invalid" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM student_group_members
         WHERE student_id=$1 AND group_id IN (SELECT id FROM student_groups WHERE teacher_id=$2)`,
        [studentId, teacher.id]
      );
      if (groupIds.length) {
        await client.query(
          `INSERT INTO student_group_members (group_id, student_id)
           SELECT UNNEST($1::text[]), $2`,
          [groupIds, studentId]
        );
      }
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
