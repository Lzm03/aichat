import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { pool } from '../db.ts';
import { quizAudienceSql } from '../lib/quiz-audience.ts';
after(() => pool.end());
test('audience deduplicates memberships, excludes staff and exclusions, includes unstarted students', async () => {
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
test('published and grading queries execute on current schema and progress stays bounded', async () => {
  const source = readFileSync(new URL('../api/quizzes.ts', import.meta.url), 'utf8');
  for (const route of ['/quizzes/published', '/teachers/me/grading-summary']) {
    const part = source.slice(source.indexOf(`router.get("${route}"`));
    const sql = part.match(/const result = await pool.query\(\s*`([\s\S]*?)`/)![1]
      .replace("${quizAudienceSql('q.bot_id', 'u.id')}", quizAudienceSql('q.bot_id','u.id'));
    const owners = await pool.query("SELECT DISTINCT teacher_id FROM quizzes WHERE status='published'");
    for (const owner of owners.rows) {
      const result = await pool.query(sql, [owner.teacher_id]);
      for (const row of result.rows) assert.ok(Number(row.submitted) <= Number(row.total_students));
    }
  }
});
