// 學生名單操作：單人 route 同批量 route 共用同一份定義。
//
// 點解要抽：呢啲 SQL 一旦有兩份就會走散 —— 例如日後多一張表要清，改咗批量嗰邊、
// 唔記得單人嗰邊，就會出現「批量移除乾淨、單人移除留低孤兒 row」呢種冇人會發現嘅 bug。
// 所以驗證同 SQL 收埋喺呢度，route 只管 HTTP 語義（status code、response 形狀）。
//
// 每個 function 嘅 SQL 都黐死 teacher_id：批量操作唔可以由「交一疊 id 入嚟」變成
// 「改到第二個老師嘅資料」。caller 應該已經驗過擁有權，呢度係第二道閘。
import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

/** 一次過最多處理幾多個學生（批量刪除先例：DELETE /api/conversations 係 100）。 */
export const MAX_BATCH_STUDENTS = 100;

function toIdList(input: unknown, minLength: number, max: number): string[] | null {
  if (!Array.isArray(input)) return null;
  // 只收字串：唔係字串就當冇交過，唔好靜靜雞 String() 夾硬砌一個 id 出嚟查。
  const ids = Array.from(
    new Set(input.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))
  );
  if (ids.length < minLength || ids.length > max) return null;
  return ids;
}

/** request body 嘅 id 陣列 → 去重嘅 string[]；唔係陣列／空／超出上限就 null。 */
export function normalizeIdList(input: unknown, max = MAX_BATCH_STUDENTS): string[] | null {
  return toIdList(input, 1, max);
}

/** 同上，但容許空陣列（「清空班級」＝交一個空陣列，係合法操作）。 */
export function normalizeOptionalIdList(input: unknown, max = MAX_BATCH_STUDENTS): string[] | null {
  return toIdList(input, 0, max);
}

/**
 * 呢批 id 入面，真正屬於呢位老師嘅有邊幾個。
 *
 * 回傳 subset 而唔係 boolean：單人 route 一直用「唔存在 → 404」、
 * 批量 route 用「名單有問題 → 400」，同一個檢查兩種對外講法。
 * HTTP 語義留返喺 HTTP 層，呢度只答資料問題。
 */
export async function fetchOwnedStudentIds(client: Queryable, teacherId: string, studentIds: string[]): Promise<string[]> {
  if (!studentIds.length) return [];
  const result = await client.query(
    "SELECT student_id FROM teacher_students WHERE teacher_id=$1 AND student_id = ANY($2::text[])",
    [teacherId, studentIds]
  );
  return result.rows.map((row: { student_id: string }) => row.student_id);
}

export async function fetchOwnedGroupIds(client: Queryable, teacherId: string, groupIds: string[]): Promise<string[]> {
  if (!groupIds.length) return [];
  const result = await client.query(
    "SELECT id FROM student_groups WHERE teacher_id=$1 AND id = ANY($2::text[])",
    [teacherId, groupIds]
  );
  return result.rows.map((row: { id: string }) => row.id);
}

/**
 * 為呢批學生 replace 班級（先清後加），語義同 PUT /:studentId/groups 逐字一樣：
 * 一位學生 × 每個 group 一行，DELETE 只清呢位老師自己班級嘅 membership。
 *
 * 批量版同逐個學生 loop 一次等價（N 個學生 × M 個班級 = N×M 行）。
 * Caller 要自己開 transaction。
 */
export async function setStudentsGroups(
  client: Queryable,
  teacherId: string,
  studentIds: string[],
  groupIds: string[]
): Promise<void> {
  await client.query(
    `DELETE FROM student_group_members
     WHERE student_id = ANY($1::text[]) AND group_id IN (SELECT id FROM student_groups WHERE teacher_id=$2)`,
    [studentIds, teacherId]
  );
  if (!groupIds.length) return;
  // 兩個 UNNEST cross join ＝ cartesian product。一定要寫明欄位別名（g(g)、s(s)），
  // 唔係兩個 UNNEST 會撞同一個欄位名 "unnest"。
  await client.query(
    `INSERT INTO student_group_members (group_id, student_id)
     SELECT g, s FROM UNNEST($1::text[]) AS g(g), UNNEST($2::text[]) AS s(s)`,
    [groupIds, studentIds]
  );
}

/**
 * 由老師名單移除呢批學生 —— 同 DELETE /:studentId 一模一樣嘅 4 步 cleanup。
 *
 * 只解除關聯，唔會刪 users row：學生帳戶唔係呢位老師嘅資產，
 * 佢可以再用同一個電郵被加入返（findOrCreateStudent 會 re-link 同一個 account）。
 * bot_group_shares 唔喺度清，係跟返單人 route 嘅做法（班級權限係跟班級，唔係跟學生）。
 *
 * 回傳真正移除咗幾多人（teacher_students 嘅 rowCount）——單人 route 靠佢分 404。
 * Caller 要自己開 transaction。
 */
export async function unlinkStudentsFromTeacher(
  client: Queryable,
  teacherId: string,
  studentIds: string[]
): Promise<number> {
  await client.query(
    `DELETE FROM student_group_members
     WHERE student_id = ANY($1::text[]) AND group_id IN (SELECT id FROM student_groups WHERE teacher_id=$2)`,
    [studentIds, teacherId]
  );
  await client.query("DELETE FROM bot_student_shares WHERE student_id = ANY($1::text[]) AND teacher_id=$2", [
    studentIds,
    teacherId,
  ]);
  await client.query("DELETE FROM bot_student_exclusions WHERE student_id = ANY($1::text[]) AND teacher_id=$2", [
    studentIds,
    teacherId,
  ]);
  const result = await client.query("DELETE FROM teacher_students WHERE teacher_id=$2 AND student_id = ANY($1::text[])", [
    studentIds,
    teacherId,
  ]);
  return result.rowCount || 0;
}
