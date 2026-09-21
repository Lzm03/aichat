import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { pool } from "../db.ts";
import studentsRouter from "../api/students.ts";
import { ensurePlatformTables, signToken } from "../lib/platform-auth.ts";
import {
  fetchOwnedGroupIds,
  fetchOwnedStudentIds,
  normalizeIdList,
  normalizeOptionalIdList,
  setStudentsGroups,
  unlinkStudentsFromTeacher,
} from "../lib/student-ops.ts";

// 呢個 test 會建真 schema 落 DATABASE_URL 指住嘅 DB，所以一定要係本機嘅專用 test DB。
const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /students_test/.test(databaseUrl);

const PREFIX = "sops_";
const TEACHER_A = `${PREFIX}teacher_a`;
const TEACHER_B = `${PREFIX}teacher_b`;
const STUDENTS_A = [`${PREFIX}student_1`, `${PREFIX}student_2`, `${PREFIX}student_3`];
const STUDENT_FOREIGN = `${PREFIX}student_4`;
const GROUPS_A = [`${PREFIX}group_a1`, `${PREFIX}group_a2`];
const GROUP_B = `${PREFIX}group_b1`;
const BOT_A = `${PREFIX}bot_a`;
const BOT_B = `${PREFIX}bot_b`;
const ALL_USERS = [TEACHER_A, TEACHER_B, ...STUDENTS_A, STUDENT_FOREIGN];
const ALL_GROUPS = [...GROUPS_A, GROUP_B];

let httpServer: Server | null = null;
let baseUrl = "";

async function resetFixture() {
  await pool.query("DELETE FROM student_group_members WHERE student_id = ANY($1::text[]) OR group_id = ANY($2::text[])", [
    ALL_USERS,
    ALL_GROUPS,
  ]);
  await pool.query("DELETE FROM bot_student_shares WHERE student_id = ANY($1::text[]) OR teacher_id = ANY($2::text[])", [
    ALL_USERS,
    ALL_USERS,
  ]);
  await pool.query("DELETE FROM bot_student_exclusions WHERE student_id = ANY($1::text[]) OR teacher_id = ANY($2::text[])", [
    ALL_USERS,
    ALL_USERS,
  ]);
  await pool.query("DELETE FROM teacher_students WHERE teacher_id = ANY($1::text[]) OR student_id = ANY($2::text[])", [
    ALL_USERS,
    ALL_USERS,
  ]);
  await pool.query("DELETE FROM student_groups WHERE id = ANY($1::text[])", [ALL_GROUPS]);
  await pool.query("DELETE FROM bots WHERE id = ANY($1::text[])", [[BOT_A, BOT_B]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [ALL_USERS]);

  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash) VALUES
       ($1,'Teacher A','sops_teacher_a@example.test','teacher','x'),
       ($2,'Teacher B','sops_teacher_b@example.test','teacher','x'),
       ($3,'Student 1','sops_student_1@example.test','student','x'),
       ($4,'Student 2','sops_student_2@example.test','student','x'),
       ($5,'Student 3','sops_student_3@example.test','student','x'),
       ($6,'Student 4','sops_student_4@example.test','student','x')`,
    [TEACHER_A, TEACHER_B, ...STUDENTS_A, STUDENT_FOREIGN]
  );
  await pool.query(
    `INSERT INTO student_groups (id, teacher_id, name, type) VALUES
       ($1,$4,'Class A1','class'), ($2,$4,'Class A2','class'), ($3,$5,'Class B1','class')`,
    [...GROUPS_A, GROUP_B, TEACHER_A, TEACHER_B]
  );
  await pool.query(
    `INSERT INTO teacher_students (teacher_id, student_id) VALUES ($1,$3),($1,$4),($1,$5),($2,$6)`,
    [TEACHER_A, TEACHER_B, ...STUDENTS_A, STUDENT_FOREIGN]
  );
  // student_1 同時屬於 teacher_a 嘅 group_a1 同 teacher_b 嘅 group_b1：
  // 後面每個 test 都要證明 teacher_a 嘅操作動唔到 group_b1 嗰行。
  await pool.query(`INSERT INTO student_group_members (group_id, student_id) VALUES ($1,$2),($3,$2)`, [
    GROUPS_A[0],
    STUDENTS_A[0],
    GROUP_B,
  ]);
  await pool.query(`INSERT INTO bots (id, name, owner_id) VALUES ($1,'Bot A',$3),($2,'Bot B',$4)`, [
    BOT_A,
    BOT_B,
    TEACHER_A,
    TEACHER_B,
  ]);
  await pool.query(`INSERT INTO bot_student_shares (bot_id, teacher_id, student_id) VALUES ($1,$2,$3),($4,$5,$3)`, [
    BOT_A,
    TEACHER_A,
    STUDENTS_A[0],
    BOT_B,
    TEACHER_B,
  ]);
  await pool.query(`INSERT INTO bot_student_exclusions (bot_id, teacher_id, student_id) VALUES ($1,$2,$3),($4,$5,$3)`, [
    BOT_A,
    TEACHER_A,
    STUDENTS_A[1],
    BOT_B,
    TEACHER_B,
  ]);
}

/** 「group_id:student_id」排序好嘅清單，方便 deepEqual 睇晒全部 membership。 */
async function membershipPairs(groupIds: string[], studentIds: string[]) {
  const result = await pool.query(
    `SELECT group_id, student_id FROM student_group_members
     WHERE group_id = ANY($1::text[]) AND student_id = ANY($2::text[])
     ORDER BY group_id, student_id`,
    [groupIds, studentIds]
  );
  return result.rows.map((row: { group_id: string; student_id: string }) => `${row.group_id}:${row.student_id}`);
}

async function botIdsIn(table: string, studentIds: string[]) {
  const result = await pool.query(
    `SELECT bot_id FROM ${table} WHERE student_id = ANY($1::text[]) ORDER BY bot_id`,
    [studentIds]
  );
  return result.rows.map((row: { bot_id: string }) => row.bot_id);
}

function authHeader(userId = TEACHER_A, role: "teacher" | "student" = "teacher") {
  return `Bearer ${signToken({ sub: userId, email: "sops@example.test", role, exp: Date.now() + 3_600_000 })}`;
}

async function callApi(
  method: "PUT" | "DELETE",
  path: string,
  options: { body?: unknown; role?: "teacher" | "student"; userId?: string; anonymous?: boolean } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!options.anonymous) headers.Authorization = authHeader(options.userId || TEACHER_A, options.role || "teacher");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
}

before(async () => {
  if (!safeTestDatabase) return;
  // bots 係遺留表：ensurePlatformTables 唔會建佢，但 bot_student_shares 有 FK 指住，
  // 所以一個全新嘅 test DB 一定要先自己有 bots。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      knowledge_base TEXT,
      security_prompt TEXT,
      owner_id TEXT,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      grade TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await ensurePlatformTables();

  const app = express();
  app.use(express.json());
  app.use("/api/students", studentsRouter);
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer!.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  await resetFixture();
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer!.close(resolve));
  await pool.end();
});

test("normalizeIdList 去重、拒收非陣列／空／超上限，optional 版容許空陣列", () => {
  assert.deepEqual(normalizeIdList(["a", "a", " b "]), ["a", "b"]);
  assert.equal(normalizeIdList([]), null);
  assert.equal(normalizeIdList("a"), null);
  assert.equal(normalizeIdList([123]), null, "唔可以靜靜雞將數字變成 id");
  assert.equal(normalizeIdList(Array.from({ length: 101 }, (_, index) => `id_${index}`)), null);
  assert.equal(normalizeIdList(Array.from({ length: 100 }, (_, index) => `id_${index}`))?.length, 100);
  assert.deepEqual(normalizeOptionalIdList([]), [], "清空班級係合法操作");
  assert.equal(normalizeOptionalIdList(null), null);
  assert.equal(normalizeOptionalIdList(["a", "b"], 500)?.length, 2);
});

test("fetchOwned* 只回傳呢位老師真正擁有嘅 id", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  assert.deepEqual(await fetchOwnedStudentIds(pool, TEACHER_A, [STUDENTS_A[0], STUDENT_FOREIGN]), [STUDENTS_A[0]]);
  assert.deepEqual(await fetchOwnedStudentIds(pool, TEACHER_A, [`${PREFIX}nobody`]), []);
  assert.deepEqual(await fetchOwnedStudentIds(pool, TEACHER_A, []), []);
  assert.deepEqual(await fetchOwnedGroupIds(pool, TEACHER_A, [GROUPS_A[0], GROUP_B]), [GROUPS_A[0]]);
  assert.deepEqual(await fetchOwnedGroupIds(pool, TEACHER_A, []), []);
});

test(
  "setStudentsGroups replace 班級，但唔會碰其他老師嘅 membership",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    await setStudentsGroups(pool, TEACHER_A, [STUDENTS_A[0]], [GROUPS_A[1]]);
    assert.deepEqual(
      await membershipPairs(ALL_GROUPS, STUDENTS_A),
      [`${GROUPS_A[1]}:${STUDENTS_A[0]}`, `${GROUP_B}:${STUDENTS_A[0]}`],
      "group_a1 要冇咗、group_a2 要加咗、teacher_b 嘅 group_b1 一定要生還"
    );
  }
);

test("批量 setStudentsGroups ＝ 逐個學生做一次（3 人 × 2 班 ＝ 6 行）", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await setStudentsGroups(pool, TEACHER_A, STUDENTS_A, GROUPS_A);
  assert.equal((await membershipPairs(GROUPS_A, STUDENTS_A)).length, 6);
});

test("空 groupIds ＝ 清空呢位老師嘅班級，其他老師嘅唔碰", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  await setStudentsGroups(pool, TEACHER_A, [STUDENTS_A[0]], []);
  assert.deepEqual(await membershipPairs(ALL_GROUPS, STUDENTS_A), [`${GROUP_B}:${STUDENTS_A[0]}`]);
});

test(
  "unlinkStudentsFromTeacher 清 4 張表，但要留住 users row 同其他老師嘅資料",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const removed = await unlinkStudentsFromTeacher(pool, TEACHER_A, [STUDENTS_A[0], STUDENTS_A[1]]);
    assert.equal(removed, 2);

    assert.deepEqual(await membershipPairs(GROUPS_A, STUDENTS_A), [], "teacher_a 嘅班級 membership 清晒");
    assert.deepEqual(
      await membershipPairs([GROUP_B], STUDENTS_A),
      [`${GROUP_B}:${STUDENTS_A[0]}`],
      "teacher_b 嘅班級 membership 生還"
    );
    assert.deepEqual(await botIdsIn("bot_student_shares", [STUDENTS_A[0]]), [BOT_B], "只有 teacher_b 嘅分享生還");
    assert.deepEqual(await botIdsIn("bot_student_exclusions", [STUDENTS_A[1]]), [BOT_B]);
    assert.deepEqual(
      (await pool.query("SELECT student_id FROM teacher_students WHERE teacher_id=$1", [TEACHER_A])).rows.map(
        (row: { student_id: string }) => row.student_id
      ),
      [STUDENTS_A[2]],
      "teacher_a 只剩 student_3"
    );
    assert.equal(
      Number((await pool.query("SELECT COUNT(*) FROM users WHERE id = ANY($1::text[])", [[STUDENTS_A[0], STUDENTS_A[1]]])).rows[0].count),
      2,
      "學生帳戶本身要保留（可以再用電郵加入返）"
    );
  }
);

test("transaction rollback 之後 membership 回復原狀", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setStudentsGroups(client, TEACHER_A, STUDENTS_A, GROUPS_A);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  assert.deepEqual(await membershipPairs(GROUPS_A, STUDENTS_A), [`${GROUPS_A[0]}:${STUDENTS_A[0]}`]);
});

test("PUT /api/students/groups：批量加入班級", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callApi("PUT", "/api/students/groups", {
    body: { studentIds: STUDENTS_A, groupIds: GROUPS_A },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.groupIds, GROUPS_A);
  assert.equal((await membershipPairs(GROUPS_A, STUDENTS_A)).length, 6);
});

test(
  "PUT /api/students/groups：名單有外來學生 → 400，一個都唔會寫入",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const response = await callApi("PUT", "/api/students/groups", {
      body: { studentIds: [...STUDENTS_A, STUDENT_FOREIGN], groupIds: [GROUPS_A[1]] },
    });
    assert.equal(response.status, 400);
    assert.match(String(response.body.error), /students are invalid/);
    assert.deepEqual(
      await membershipPairs(GROUPS_A, [...STUDENTS_A, STUDENT_FOREIGN]),
      [`${GROUPS_A[0]}:${STUDENTS_A[0]}`],
      "維持原狀：唔可以 partial 加咗頭幾個"
    );
  }
);

test("PUT /api/students/groups：班級唔屬於呢位老師 → 400", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callApi("PUT", "/api/students/groups", {
    body: { studentIds: [STUDENTS_A[1]], groupIds: [GROUP_B] },
  });
  assert.equal(response.status, 400);
  assert.match(String(response.body.error), /groups are invalid/);
  assert.deepEqual(await membershipPairs([GROUP_B], STUDENTS_A), [`${GROUP_B}:${STUDENTS_A[0]}`]);
});

test("PUT /api/students/groups：空 studentIds／非陣列 groupIds → 400", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  assert.equal((await callApi("PUT", "/api/students/groups", { body: { studentIds: [], groupIds: [] } })).status, 400);
  assert.equal(
    (await callApi("PUT", "/api/students/groups", { body: { studentIds: STUDENTS_A, groupIds: "not-an-array" } })).status,
    400
  );
  assert.equal(
    (await callApi("PUT", "/api/students/groups", {
      body: { studentIds: Array.from({ length: 101 }, (_, index) => `id_${index}`), groupIds: [] },
    })).status,
    400,
    "超過上限要拒絕，唔好一次過鎖住成個 DB"
  );
});

test("DELETE /api/students：批量移除", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const response = await callApi("DELETE", "/api/students", {
    body: { studentIds: [STUDENTS_A[0], STUDENTS_A[1]] },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.count, 2);
  assert.deepEqual(await membershipPairs(GROUPS_A, STUDENTS_A), []);
  assert.deepEqual(await botIdsIn("bot_student_shares", [STUDENTS_A[0]]), [BOT_B], "其他老師嘅分享唔受影響");
  assert.equal(
    Number((await pool.query("SELECT COUNT(*) FROM users WHERE id = ANY($1::text[])", [[STUDENTS_A[0], STUDENTS_A[1]]])).rows[0].count),
    2
  );
});

test(
  "DELETE /api/students：同一個 request 再送一次 → 400（嚴格驗證，唔會靜靜雞當成功）",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    const body = { studentIds: [STUDENTS_A[0], STUDENTS_A[1]] };
    assert.equal((await callApi("DELETE", "/api/students", { body })).status, 200);
    const second = await callApi("DELETE", "/api/students", { body });
    assert.equal(second.status, 400);
    assert.match(String(second.body.error), /students are invalid/);
  }
);

test("DELETE /api/students：空陣列 → 400", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  assert.equal((await callApi("DELETE", "/api/students", { body: { studentIds: [] } })).status, 400);
});

test("批量 route 嘅權限閘：冇 token 401、學生身份 403", { skip: !safeTestDatabase }, async () => {
  await resetFixture();
  const body = { studentIds: [STUDENTS_A[0]], groupIds: [] };
  assert.equal((await callApi("PUT", "/api/students/groups", { body, anonymous: true })).status, 401);
  assert.equal((await callApi("DELETE", "/api/students", { body, anonymous: true })).status, 401);
  assert.equal((await callApi("PUT", "/api/students/groups", { body, role: "student", userId: STUDENTS_A[0] })).status, 403);
  assert.equal((await callApi("DELETE", "/api/students", { body, role: "student", userId: STUDENTS_A[0] })).status, 403);
});

test(
  "重構回歸：單人 DELETE 未知 id 404、單人 PUT 非法班級 400、正常路徑照舊",
  { skip: !safeTestDatabase },
  async () => {
    await resetFixture();
    assert.equal((await callApi("DELETE", `/api/students/${PREFIX}nobody`)).status, 404);
    assert.equal(
      (await callApi("PUT", `/api/students/${STUDENTS_A[0]}/groups`, { body: { groupIds: [GROUP_B] } })).status,
      400
    );

    const assigned = await callApi("PUT", `/api/students/${STUDENTS_A[1]}/groups`, { body: { groupIds: [GROUPS_A[0]] } });
    assert.equal(assigned.status, 200);
    assert.deepEqual(await membershipPairs([GROUPS_A[0]], STUDENTS_A), [
      `${GROUPS_A[0]}:${STUDENTS_A[0]}`,
      `${GROUPS_A[0]}:${STUDENTS_A[1]}`,
    ]);

    assert.equal((await callApi("DELETE", `/api/students/${STUDENTS_A[1]}`)).status, 200);
    assert.deepEqual(await membershipPairs([GROUPS_A[0]], STUDENTS_A), [`${GROUPS_A[0]}:${STUDENTS_A[0]}`]);
  }
);
