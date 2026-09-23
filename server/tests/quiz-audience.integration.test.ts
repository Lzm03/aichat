import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { pool } from '../db.ts';
import { quizAudienceSql } from '../lib/quiz-audience.ts';
after(() => pool.end());

// 呢兩個 test 都要真 DB：上面嗰個淨係要連得到，下面嗰個仲要當前 schema（會 query
// quizzes / users / bot_student_shares …）。所以探測 schema 而唔係靠 DB 名 ——
// 任何有 schema 嘅 DB（包括預設 dev DB）都應該跑得到，冇嘅就好聲好氣 skip 而唔係爆。
type DbState = 'ready' | 'no-schema' | 'unreachable';
let dbStatePromise: Promise<DbState> | null = null;
function probeDatabase(): Promise<DbState> {
  dbStatePromise ??= pool
    .query("SELECT to_regclass('public.quizzes') IS NOT NULL AS ready")
    .then(({ rows }): DbState => (rows[0]?.ready ? 'ready' : 'no-schema'))
    .catch((): DbState => 'unreachable');
  return dbStatePromise;
}

test('audience deduplicates memberships, excludes staff and exclusions, includes unstarted students', async (t) => {
  if ((await probeDatabase()) === 'unreachable') return t.skip('連唔到 DATABASE_URL 指住嘅 DB');
  const { rows } = await pool.query(`WITH
    users(id, role, status) AS (VALUES ('s1','student','active'), ('s2','student','active'),
      ('s3','student','active'), ('s4','student','active'), ('s5','student','inactive'),
      ('t','teacher','active'), ('a','admin','active')),
    bot_student_shares(bot_id,student_id) AS (VALUES ('b','s1'),('b','t'),('b','a'),('b','s5')),
    bot_group_shares(bot_id,group_id) AS (VALUES ('b','g1'),('b','g2')),
    student_group_members(group_id,student_id) AS (VALUES ('g1','s1'),('g2','s1'),('g1','s2'),('g2','s3')),
    bot_student_exclusions(bot_id,student_id) AS (VALUES ('b','s3')),
    attempts(student_id,status) AS (VALUES ('s1','completed'),('t','completed'),('s3','completed'))
    SELECT COUNT(u.id)::int AS total, COUNT(a.student_id)::int AS submitted
    FROM users u LEFT JOIN attempts a ON a.student_id=u.id AND a.status='completed'
    WHERE u.role='student' AND u.status='active' AND ${quizAudienceSql("'b'", 'u.id')}`);
  assert.deepEqual(rows[0], {total: 2, submitted: 1});
});

test('published and grading queries execute on current schema and progress stays bounded', async (t) => {
  const state = await probeDatabase();
  if (state === 'unreachable') return t.skip('連唔到 DATABASE_URL 指住嘅 DB');
  if (state === 'no-schema') return t.skip('DATABASE_URL 指住嘅 DB 未有 platform schema（quizzes 表唔存在）');

  const source = readFileSync(new URL('../api/quizzes.ts', import.meta.url), 'utf8');

  // 抽 SQL 之前先確認抽得到：quizzes.ts 改咗 route 寫法或者搬走個 query 嘅話，
  // indexOf 會變 -1（或者 match 到第二條 query），到時出嘅錯會莫名其妙。
  const routes = ['/quizzes/published', '/teachers/me/grading-summary'];
  const queries = routes.map((route) => {
    const start = source.indexOf(`router.get("${route}"`);
    assert.ok(start !== -1, `quizzes.ts 已經冇 router.get("${route}" —— 呢個 test 嘅抽取方式要跟住改`);
    const matched = source.slice(start).match(/const result = await pool.query\(\s*`([\s\S]*?)`/);
    assert.ok(matched, `由 ${route} 抽唔到 pool.query 嘅 SQL —— 呢個 test 嘅抽取方式要跟住改`);
    return matched![1].replace("${quizAudienceSql('q.bot_id', 'u.id')}", quizAudienceSql('q.bot_id','u.id'));
  });

  // 呢個 test 真正守住嘅係「SQL 對得住當前 schema」—— 欄位改咗名或者被刪就會爆。
  // 所以 DB 冇已發佈測驗都要用一個唔存在嘅 teacher_id 跑一次：否則兩個 route
  // 一次都冇執行過，零斷言都會出綠燈（2026-09-23 實測：預設 dev DB 正是如此）。
  const owners = await pool.query("SELECT DISTINCT teacher_id FROM quizzes WHERE status='published'");
  const probes = owners.rows.length ? owners.rows : [{ teacher_id: '__no_published_quiz_probe__' }];

  for (const sql of queries) {
    for (const owner of probes) {
      const result = await pool.query(sql, [owner.teacher_id]);
      for (const row of result.rows) assert.ok(Number(row.submitted) <= Number(row.total_students));
    }
  }
});
