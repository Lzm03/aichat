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

/** 班級名只是介面上嘅標籤，超長就截短，唔值得為咗佢令成批匯入 400。 */
const MAX_CLASS_NAME_LENGTH = 40;

type ImportStudentInput = StudentInput & { className: string };

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

/**
 * 匯入專用：多收一個班級名（空白／冇 = 唔分班）。
 * 單人新增（POST /）用返 normalizeStudentInput，佢冇班級邏輯，
 * 就算 client 夾硬帶 className 入嚟都會俾呢個 function 隔走。
 */
function normalizeImportStudentInput(input: any): ImportStudentInput | null {
  const base = normalizeStudentInput(input);
  if (!base) return null;
  return { ...base, className: String(input?.className || "").trim().slice(0, MAX_CLASS_NAME_LENGTH) };
}

/**
 * 班級名 → student_groups row。同名班級重用，唔會開第二個。
 *
 * DB 冇 (teacher_id, name) 嘅 unique 約束（POST /groups 本身都唔去重），所以
 * 去重只可以喺呢度做：同名有幾個就揀最早建立嗰個，唔會再開新。
 * Caller 要自己開 transaction，並且同一批入面同一個名只可以查一次（見 classGroups cache）。
 */
async function resolveClassGroup(
  client: any,
  teacherId: string,
  name: string
): Promise<{ id: string; created: boolean }> {
  const existing = await client.query(
    `SELECT id FROM student_groups
     WHERE teacher_id=$1 AND name=$2
     ORDER BY created_at ASC, id ASC LIMIT 1`,
    [teacherId, name]
  );
  if (existing.rowCount) return { id: existing.rows[0].id as string, created: false };

  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO student_groups (id, teacher_id, name, type) VALUES ($1, $2, $3, 'class')`,
    [id, teacherId, name]
  );
  return { id, created: true };
}

/**
 * 匯入之後每班有幾多人 —— 係「呢班而家有幾多人」，唔係「今次加咗幾個」。
 * 老師睇摘要係想知班開齊未，重用返舊班時今次加咗幾個根本冇意思。
 */
async function summarizeClasses(client: any, classGroups: Map<string, { id: string; created: boolean }>) {
  if (!classGroups.size) return [];
  const groupIds = Array.from(classGroups.values()).map((group) => group.id);
  const counts = await client.query(
    `SELECT group_id, COUNT(*)::int AS student_count FROM student_group_members
     WHERE group_id = ANY($1::text[]) GROUP BY group_id`,
    [groupIds]
  );
  const countByGroup = new Map<string, number>(
    counts.rows.map((row: { group_id: string; student_count: number }) => [row.group_id, row.student_count])
  );
  return Array.from(classGroups.entries()).map(([name, group]) => ({
    id: group.id,
    name,
    created: group.created,
    studentCount: countByGroup.get(group.id) || 0,
  }));
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
  const students = rawStudents.map(normalizeImportStudentInput);
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
      // 班級名 → group row。同一批同一個名只查一次 DB。
      const classGroups = new Map<string, { id: string; created: boolean }>();
      const imported: Array<{
        id: string;
        fullName: string;
        email: string;
        groupIds: string[];
        created: boolean;
        temporaryPassword: string;
      }> = [];

      for (const student of students as ImportStudentInput[]) {
        const createdStudent = await findOrCreateStudent(client, student);
        await client.query(
          "INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [teacher.id, createdStudent.row.id]
        );
        if (student.className && !classGroups.has(student.className)) {
          classGroups.set(student.className, await resolveClassGroup(client, teacher.id, student.className));
        }
        imported.push({
          id: createdStudent.row.id,
          fullName: createdStudent.row.full_name,
          email: createdStudent.row.email,
          groupIds: [],
          created: createdStudent.created,
          temporaryPassword: createdStudent.temporaryPassword,
        });
      }

      // 逐班一次過 assign，用返 setStudentsGroups（同 PUT /groups 逐字一樣嘅
      // replace 語義）：名單寫嘅就係呢位學生嘅班級，唔會殘留上次匯入嘅舊班。
      // 同一個學生喺名單出現兩次嘅話，以第一次為準，唔會同時入兩班。
      const byClass = new Map<string, string[]>();
      const assigned = new Set<string>();
      imported.forEach((row, index) => {
        const className = (students[index] as ImportStudentInput).className;
        const groupId = className ? classGroups.get(className)?.id : undefined;
        if (!groupId || assigned.has(row.id)) return;
        assigned.add(row.id);
        byClass.set(groupId, [...(byClass.get(groupId) || []), row.id]);
      });
      for (const [groupId, studentIds] of byClass) {
        await setStudentsGroups(client, teacher.id, studentIds, [groupId]);
      }

      // groupIds 一定要係呢位學生喺呢位老師名下嘅「全部」班級，唔可以淨係報今次
      // 嗰個：前端會用呢個 response 覆蓋自己嘅學生紀錄，殘缺清單會靜靜雞抹走
      // 佢原有嘅班級（例如 3B 重匯入 3A，3B 就消失）。
      const importedIds = imported.map((row) => row.id);
      if (importedIds.length) {
        const membership = await client.query(
          `SELECT gm.student_id, gm.group_id
           FROM student_group_members gm
           JOIN student_groups sg ON sg.id = gm.group_id
           WHERE sg.teacher_id = $1 AND gm.student_id = ANY($2::text[])
           ORDER BY sg.created_at ASC, sg.id ASC`,
          [teacher.id, importedIds]
        );
        const groupsByStudent = new Map<string, string[]>();
        for (const row of membership.rows as Array<{ student_id: string; group_id: string }>) {
          groupsByStudent.set(row.student_id, [...(groupsByStudent.get(row.student_id) || []), row.group_id]);
        }
        imported.forEach((student) => {
          student.groupIds = groupsByStudent.get(student.id) || [];
        });
      }

      const groups = await summarizeClasses(client, classGroups);
      await client.query("COMMIT");
      return res.status(201).json({ students: imported, groups });
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
