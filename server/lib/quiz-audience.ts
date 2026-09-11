// Match the student Bot library: direct shares, or class membership minus exclusions.
// Callers supply trusted SQL aliases only, never request input.
export function quizAudienceSql(botId: string, studentId: string) {
  return `(EXISTS (SELECT 1 FROM bot_student_shares s WHERE s.bot_id=${botId} AND s.student_id=${studentId})
    OR EXISTS (SELECT 1 FROM bot_group_shares bg
      JOIN student_group_members gm ON gm.group_id=bg.group_id
      WHERE bg.bot_id=${botId} AND gm.student_id=${studentId}
      AND NOT EXISTS (SELECT 1 FROM bot_student_exclusions ex
        WHERE ex.bot_id=${botId} AND ex.student_id=${studentId})))`;
}
