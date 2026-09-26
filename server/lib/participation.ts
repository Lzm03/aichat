/**
 * 課堂參與度分析：per-conversation 判斷窗口表 + 閒置補漏掃描 + 聚合。
 *
 * 設計（docs/class-participation.md）：
 * - 判斷搭 answer-judge 順風車：同一次 Gemini call 出 demonstrated + engagement，
 *   唔另開 call（成本上限 ⌈輪數 ÷ 3⌉ + 1）
 * - 每個判斷窗口存一行（唔係 conversation 一條摘要）：judge 每次都見到全窗口，
 *   累加成單行會重複計數；而且帶 judged_at 先切得返 30/90/全期
 * - 邊界用水位標 `bot_conversation_states.participation_watermark`
 *   （= 已分類訊息嘅最大 created_at）：`recentMessages` 喺 `persistUserMessage`
 *   之前攞，當輪訊息唔喺窗口，計數器切片會令佢永久失蹤
 * - 唔存逐條訊息標籤；統計只出群體數字、唔出個人數字（規格「界線」）
 *
 * 多實例安全：掃描用 `FOR UPDATE SKIP LOCKED` 攞候選（autocommit 下即揸即放，
 * 唔會揸住行鎖跑 LLM），寫入用 optimistic update 用水位標做 guard——
 * 同 hot path 並發時唔會重複計同一批訊息。
 */
import { pool } from "../db.ts";
import { withSchemaLock } from "./schema-lock.ts";
import { judgeConversationWindow } from "./answer-judge.ts";
import {
  JUDGE_SUBSTANTIVE_MIN,
  classifyEngagement,
  type EngagementCounts,
  type EngagementVerdict,
} from "./engagement.ts";

/** 閒置幾耐先補跑一次判斷（規格：10 分鐘，真課堂要再驗） */
export const IDLE_SCAN_THRESHOLD_MINUTES = 10;

/** 每次掃描最多處理幾多個 conversation（逐條 sequential，pool max 30 夠） */
export const IDLE_SCAN_BATCH = 20;

/** memoized：boot 同 hot path 都會 call，DDL 只行一次（跟 ensurePlatformTables 先例） */
let ensureParticipationTablesPromise: Promise<void> | null = null;
export function ensureParticipationTables(): Promise<void> {
  if (!ensureParticipationTablesPromise) {
    ensureParticipationTablesPromise = withSchemaLock(async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_conversation_participation_windows (
          id BIGSERIAL PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          bot_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          topic_id TEXT NOT NULL DEFAULT '',
          judged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          window_student_count INT NOT NULL DEFAULT 0,
          effective_count INT NOT NULL DEFAULT 0,
          meaningless_count INT NOT NULL DEFAULT 0,
          judge_source TEXT NOT NULL DEFAULT 'heuristic-fallback'
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS bcpw_conversation_judged_idx
        ON bot_conversation_participation_windows (conversation_id, judged_at)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS bcpw_bot_judged_idx
        ON bot_conversation_participation_windows (bot_id, judged_at)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS bcpw_user_judged_idx
        ON bot_conversation_participation_windows (user_id, judged_at)
      `);
      await pool.query(`
        ALTER TABLE bot_conversation_states
        ADD COLUMN IF NOT EXISTS participation_watermark TIMESTAMPTZ
      `);
      // 「今日新增能力追蹤報告」要數 bot_student_progress 嘅新 row——
      // 冇 created_at 欄分唔出「新增」同「更新」。冇 DEFAULT：舊數據 NULL，
      // 唔當今日新增；mergeStudentProgress 嘅 INSERT 由呢個 commit 起寫 NOW()。
      await pool.query(`
        ALTER TABLE bot_student_progress
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
      `);
      // 知識點掌握增長事件：每個 (bot, student, topic, point) 嘅「首次掌握」。
      // PK 天然去重，recordMasteryEvents 用 ON CONFLICT DO NOTHING——重複寫入
      // 零影響；統計「期內首次掌握嘅學生數」就係 COUNT(DISTINCT user_id)。
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_student_mastery_events (
          bot_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          topic_id TEXT NOT NULL DEFAULT '',
          point_id TEXT NOT NULL,
          first_covered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (bot_id, user_id, topic_id, point_id)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS bsme_first_covered_idx
        ON bot_student_mastery_events (first_covered_at)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS bcs_idle_scan_idx
        ON bot_conversation_states (updated_at)
        WHERE participation_watermark IS NOT NULL
      `);
    }).catch((error) => {
      ensureParticipationTablesPromise = null;
      throw error;
    });
  }
  return ensureParticipationTablesPromise;
}

export type ParticipationTurn = {
  content: string;
  /** 訊息 created_at（ISO 字串）。水位標 = 呢批嘅最大值 */
  createdAt: string;
};

/** 熱路徑（transaction 內）同掃描兩邊都寫窗口行，所以 executor 可以係 pool 或 client */
type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rowCount?: number | null }>;
};

/**
 * 記「首次掌握」事件（每個知識點一條，idempotent）。
 * 由 mergeStudentProgress 每輪 call；PK 去重令重複寫入零影響，
 * 「期內首次掌握嘅學生數」統計就係 COUNT(DISTINCT user_id)。
 */
export async function recordMasteryEvents(
  botId: string,
  userId: string,
  topicId: string,
  pointIds: readonly string[]
): Promise<void> {
  if (!pointIds.length) return;
  await ensureParticipationTables();
  await pool.query(
    `INSERT INTO bot_student_mastery_events (bot_id, user_id, topic_id, point_id)
     SELECT $1, $2, $3, elem
     FROM jsonb_array_elements_text($4::jsonb) AS elem
     ON CONFLICT DO NOTHING`,
    [botId, userId, topicId, JSON.stringify(pointIds)]
  );
}

/**
 * 記一個判斷窗口（純 INSERT，唔 upsert——同一批 new turns 只會 judge 一次，
 * 靠水位標 guard 保證）。回傳分類計數同新水位標（呢批訊息嘅最大 created_at）。
 * executor 傳 client 時，caller 負責 BEGIN／COMMIT（窗口行同水位標要同一
 * transaction，中途死機先唔會重複計）。
 */
export async function recordParticipationWindow(
  input: {
    conversationId: string;
    botId: string;
    userId: string;
    topicId: string;
    newTurns: ParticipationTurn[];
    engagement: EngagementVerdict | null;
  },
  executor: Queryable = pool
): Promise<{ counts: EngagementCounts; watermark: string | null }> {
  const counts = classifyEngagement(input.newTurns, input.engagement);

  let watermarkMs = -1;
  for (const turn of input.newTurns) {
    const time = new Date(turn.createdAt).getTime();
    if (Number.isFinite(time) && time > watermarkMs) watermarkMs = time;
  }
  const watermark = watermarkMs > 0 ? new Date(watermarkMs).toISOString() : null;

  await executor.query(
    `INSERT INTO bot_conversation_participation_windows
       (conversation_id, bot_id, user_id, topic_id,
        window_student_count, effective_count, meaningless_count, judge_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.conversationId,
      input.botId,
      input.userId,
      input.topicId,
      input.newTurns.length,
      counts.effective,
      counts.meaningless,
      counts.judgeSource,
    ]
  );
  return { counts, watermark };
}

type ScanCandidate = {
  conversationId: string;
  botId: string;
  userId: string;
  topicId: string;
  watermark: Date;
};

/** 掃一個 candidate：攞新訊息 → judge → 窗口 INSERT + 水位標 optimistic update 同一 transaction */
async function scanOneConversation(candidate: ScanCandidate): Promise<boolean> {
  const newRows = await pool.query(
    `SELECT content, created_at FROM conversation_messages
     WHERE conversation_id=$1 AND role='user' AND message_type='normal'
       AND created_at > $2
     ORDER BY created_at ASC
     LIMIT 200`,
    [candidate.conversationId, candidate.watermark]
  );
  const newTurns: ParticipationTurn[] = newRows.rows.map((row) => ({
    content: String(row.content || ""),
    createdAt: String(row.created_at),
  }));
  if (!newTurns.length) return false;

  // 攞幾條水位標之前嘅訊息做上下文，令 judge 分得出話題同語氣。
  const contextRows = await pool.query(
    `SELECT role, content FROM conversation_messages
     WHERE conversation_id=$1 AND created_at <= $2 AND role IN ('user','assistant')
     ORDER BY created_at DESC
     LIMIT 6`,
    [candidate.conversationId, candidate.watermark]
  );
  const turns = [
    ...contextRows.rows.reverse().map((row) => ({
      role: (row.role === "user" ? "student" : "bot") as "student" | "bot",
      content: String(row.content || ""),
    })),
    ...newTurns.map((turn) => ({ role: "student" as const, content: turn.content })),
  ];

  // 免費預濾：新訊息全係短字 → heuristic 分類已經啱，唔使打 LLM。
  let engagement: EngagementVerdict | null = null;
  const hasSubstantive = newTurns.some(
    (turn) => turn.content.trim().length >= JUDGE_SUBSTANTIVE_MIN
  );
  if (hasSubstantive) {
    const judged = await judgeConversationWindow({
      points: [],
      turns,
      newStudentTurns: newTurns.map((turn) => turn.content),
    });
    engagement = judged.engagement;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { watermark: newWatermark } = await recordParticipationWindow(
      {
        conversationId: candidate.conversationId,
        botId: candidate.botId,
        userId: candidate.userId,
        topicId: candidate.topicId,
        newTurns,
        engagement,
      },
      client
    );
    if (!newWatermark) {
      await client.query("ROLLBACK");
      return false;
    }
    // optimistic update：track 喺我哋攞候選之後 judge 咗嘅話，水位標已經唔同，
    // guard 唔中 → ROLLBACK 連窗口一齊撤，唔會重複計。
    const updated = await client.query(
      `UPDATE bot_conversation_states
       SET turns_since_judge=0, participation_watermark=$3::timestamptz, updated_at=NOW()
       WHERE conversation_id=$1 AND participation_watermark=$2::timestamptz`,
      [candidate.conversationId, candidate.watermark, newWatermark]
    );
    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 閒置補漏掃描：對話閒置超過 IDLE_SCAN_THRESHOLD_MINUTES 分鐘而仲有未判斷訊息
 * → 補跑一次。掛喺 index.ts 嘅 setInterval，每 5 分鐘一次。
 *
 * 唔設最低訊息數（survivorship bias：最想捉嘅「講一兩句就走」學生唔可以消失）。
 * SKIP LOCKED 令多個 instance 唔會掃到同一條；水位標 guard 令重掃 idempotent。
 * 回傳處理咗幾多條（測試用）。
 */
export async function runIdleParticipationScan(): Promise<number> {
  await ensureParticipationTables();
  const candidates = await pool.query(
    `SELECT s.conversation_id, s.bot_id, s.user_id, s.topic_id,
            s.participation_watermark
     FROM bot_conversation_states s
     JOIN conversations c ON c.id = s.conversation_id AND c.status <> 'deleted'
     WHERE s.updated_at < NOW() - ($1::text || ' minutes')::interval
       AND s.participation_watermark IS NOT NULL
     ORDER BY s.updated_at ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [String(IDLE_SCAN_THRESHOLD_MINUTES), IDLE_SCAN_BATCH]
  );
  let processed = 0;
  for (const row of candidates.rows) {
    try {
      const didWork = await scanOneConversation({
        conversationId: String(row.conversation_id),
        botId: String(row.bot_id),
        userId: String(row.user_id),
        topicId: String(row.topic_id || ""),
        watermark: new Date(String(row.participation_watermark)),
      });
      if (didWork) processed += 1;
    } catch (error) {
      console.warn(
        "[participation] idle scan failed for conversation",
        String(row.conversation_id),
        error
      );
    }
  }
  return processed;
}

export type ParticipationRow = {
  id: string;
  name: string | null;
  /** 行所屬嘅 Bot id：bot 維度 = 自己；topic 維度 = character_topics.character_id；
   *  ''（主知識庫）或 topic 已刪時 null → 前端唔可撳跳能力報告 */
  botId?: string | null;
  studentMessageTotal: number;
  effectiveQuestions: number;
  meaninglessMessages: number;
  substantiveMessages: number;
  activeStudents: number;
  noInteractionStudents: number;
  /** 淨係 class 維度有：期內 0 條實質訊息嘅學生名（binary 狀態，唔出個人數字） */
  noInteractionNames: string[];
};

/**
 * 班級／Bot／話題三個維度嘅參與度聚合。
 *
 * 每 conversation 兩部分相加：
 * 1. 窗口行（judged_at 喺期內；窗口內容橫跨邊界以 judged_at 為準，已知近似）
 * 2. 未判斷尾巴（水位標之後、期內嘅 user normal 訊息）即場字數 heuristic
 *
 * 界線（規格硬性）：唔出排名（rows 唔排序）、唔出個人數字——
 * 學生層級只有「有／未有實質互動」binary。
 */
export async function aggregateParticipation(input: {
  teacherId: string;
  /** SQL 表達式（"NOW() - INTERVAL '30 days'"）或 null = 全期 */
  periodStartSql: string | null;
  dimension: "class" | "bot" | "topic";
}): Promise<ParticipationRow[]> {
  await ensureParticipationTables();
  // periodStartSql 係 route 白名單嘅硬編碼表達式（"NOW() - INTERVAL '30 days'"），
  // 唔係用戶輸入，直接嵌入 SQL；綁參數會俾 Postgres 當字串 parse（DateTimeParseError）。
  // 一定要加括號先 cast——`::timestamptz` 後綴綁得比 `INTERVAL '…'` 緊，
  // 唔加會 cast 咗個間隔字串。
  const periodStart = input.periodStartSql
    ? `(${input.periodStartSql})::timestamptz`
    : "NULL::timestamptz";
  const perConversation = await pool.query(
    `WITH perconv AS (
       SELECT c.id AS conversation_id, c.user_id, c.bot_id, c.topic_id,
              COALESCE(w.win_count, 0) + COALESCE(t.tail_count, 0) AS msg_total,
              COALESCE(w.win_effective, 0) AS effective,
              COALESCE(w.win_meaningless, 0)
                + (COALESCE(t.tail_count, 0) - COALESCE(t.tail_substantive, 0))
                AS meaningless
       FROM conversations c
       LEFT JOIN (
         SELECT conversation_id,
                SUM(window_student_count)::int AS win_count,
                SUM(effective_count)::int AS win_effective,
                SUM(meaningless_count)::int AS win_meaningless
         FROM bot_conversation_participation_windows
         WHERE ${periodStart} IS NULL OR judged_at >= ${periodStart}
         GROUP BY conversation_id
       ) w ON w.conversation_id = c.id
       LEFT JOIN (
         SELECT m.conversation_id,
                COUNT(*)::int AS tail_count,
                COUNT(*) FILTER (WHERE LENGTH(m.content) >= $2)::int AS tail_substantive
         FROM conversation_messages m
         JOIN bot_conversation_states s ON s.conversation_id = m.conversation_id
         WHERE m.role = 'user' AND m.message_type = 'normal'
           AND (${periodStart} IS NULL OR m.created_at >= ${periodStart})
           AND (s.participation_watermark IS NULL
                OR m.created_at > s.participation_watermark)
         GROUP BY m.conversation_id
       ) t ON t.conversation_id = c.id
       WHERE c.user_id IN (
               SELECT ts.student_id FROM teacher_students ts
               JOIN users u ON u.id = ts.student_id AND u.status = 'active'
               WHERE ts.teacher_id = $1
             )
         AND c.status <> 'deleted'
     )
     SELECT p.conversation_id, p.user_id, p.bot_id, p.topic_id,
            p.msg_total::int AS msg_total, p.effective::int AS effective,
            p.meaningless::int AS meaningless,
            u.full_name AS student_name,
            b.name AS bot_name,
            ct.name AS topic_name,
            ct.character_id AS topic_bot_id
     FROM perconv p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN bots b ON b.id = p.bot_id
     LEFT JOIN character_topics ct ON ct.id = p.topic_id`,
    [input.teacherId, JUDGE_SUBSTANTIVE_MIN]
  );

  const perStudent = new Map<
    string,
    { name: string; msgTotal: number; effective: number; meaningless: number }
  >();
  const bucketStats = new Map<
    string,
    {
      name: string | null;
      botId: string | null;
      msgTotal: number;
      effective: number;
      meaningless: number;
    }
  >();
  for (const row of perConversation.rows) {
    const userId = String(row.user_id);
    const msgTotal = Number(row.msg_total) || 0;
    const effective = Number(row.effective) || 0;
    const meaningless = Number(row.meaningless) || 0;

    const student = perStudent.get(userId) || {
      name: String(row.student_name || ""),
      msgTotal: 0,
      effective: 0,
      meaningless: 0,
    };
    student.msgTotal += msgTotal;
    student.effective += effective;
    student.meaningless += meaningless;
    perStudent.set(userId, student);

    if (input.dimension === "class") continue;
    const bucketId =
      input.dimension === "bot"
        ? String(row.bot_id || "")
        : String(row.topic_id || "");
    const bucketName =
      input.dimension === "bot"
        ? row.bot_name
          ? String(row.bot_name)
          : null
        : row.topic_name
          ? String(row.topic_name)
          : null;
    const bucket = bucketStats.get(bucketId) || {
      name: bucketName,
      // bot 維度 id 就係 bot；topic 維度用 character_topics.character_id
      // （''／已刪話題 JOIN miss → null，前端唔可撳）
      botId:
        input.dimension === "bot"
          ? bucketId
          : row.topic_bot_id
            ? String(row.topic_bot_id)
            : null,
      msgTotal: 0,
      effective: 0,
      meaningless: 0,
    };
    bucket.msgTotal += msgTotal;
    bucket.effective += effective;
    bucket.meaningless += meaningless;
    bucketStats.set(bucketId, bucket);
  }

  if (input.dimension === "class") {
    return aggregateByClass(input.teacherId, perStudent);
  }

  // 每 bucket 嘅活躍學生數：有 ≥1 條實質訊息嘅 distinct 學生（同一學生多條
  // conversation 唔會重複計）。
  const activeByBucket = new Map<string, Set<string>>();
  for (const row of perConversation.rows) {
    const convSubstantive =
      (Number(row.msg_total) || 0) - (Number(row.meaningless) || 0);
    if (convSubstantive <= 0) continue;
    const bucketId =
      input.dimension === "bot"
        ? String(row.bot_id || "")
        : String(row.topic_id || "");
    if (!activeByBucket.has(bucketId)) activeByBucket.set(bucketId, new Set());
    activeByBucket.get(bucketId)!.add(String(row.user_id));
  }

  const rows: ParticipationRow[] = [];
  for (const [id, bucket] of bucketStats) {
    const substantive = bucket.msgTotal - bucket.meaningless;
    const active = activeByBucket.get(id);
    rows.push({
      id,
      name: bucket.name,
      botId: bucket.botId,
      studentMessageTotal: bucket.msgTotal,
      effectiveQuestions: bucket.effective,
      meaninglessMessages: bucket.meaningless,
      substantiveMessages: substantive,
      activeStudents: active ? active.size : 0,
      // Bot／話題維度唔出學生名單（「未有互動」係班級層級嘅 drill-down）
      noInteractionStudents: 0,
      noInteractionNames: [],
    });
  }
  return rows;
}

/** class 維度：roster 每個學生按班聚合（冇班嘅合併做「未分組」bucket，唔可以靜靜雞消失） */
async function aggregateByClass(
  teacherId: string,
  perStudent: Map<
    string,
    { name: string; msgTotal: number; effective: number; meaningless: number }
  >
): Promise<ParticipationRow[]> {
  const roster = await pool.query(
    `SELECT r.student_id, u.full_name, g.id AS group_id, g.name AS group_name
     FROM teacher_students r
     JOIN users u ON u.id = r.student_id AND u.status = 'active'
     LEFT JOIN student_group_members gm ON gm.student_id = r.student_id
     LEFT JOIN student_groups g
       ON g.id = gm.group_id AND g.teacher_id = $1 AND g.type = 'class'
     WHERE r.teacher_id = $1`,
    [teacherId]
  );

  // studentId → [{groupId, groupName}]（一個學生可以喺多班：音量喺每班各計一次，
  // 名單同活躍數每班只計一次——已知嘅粗粒度，寫咗入 spec）
  const rosterByStudent = new Map<string, Array<{ id: string; name: string | null }>>();
  for (const row of roster.rows) {
    const studentId = String(row.student_id);
    const entries = rosterByStudent.get(studentId) || [];
    const groupId = String(row.group_id || "");
    if (!entries.some((entry) => entry.id === groupId)) {
      entries.push({ id: groupId, name: row.group_name ? String(row.group_name) : null });
    }
    rosterByStudent.set(studentId, entries);
  }

  type ClassBucket = ParticipationRow & {
    members: Map<string, { name: string; substantive: number }>;
  };
  const buckets = new Map<string, ClassBucket>();
  const ensureBucket = (id: string, name: string | null): ClassBucket => {
    if (!buckets.has(id)) {
      buckets.set(id, {
        id,
        name,
        studentMessageTotal: 0,
        effectiveQuestions: 0,
        meaninglessMessages: 0,
        substantiveMessages: 0,
        activeStudents: 0,
        noInteractionStudents: 0,
        noInteractionNames: [],
        members: new Map(),
      });
    }
    return buckets.get(id)!;
  };

  for (const [studentId, groups] of rosterByStudent) {
    const name = perStudent.get(studentId)?.name || "";
    const stats = perStudent.get(studentId);
    const msgTotal = stats ? stats.msgTotal : 0;
    const effective = stats ? stats.effective : 0;
    const meaningless = stats ? stats.meaningless : 0;
    const substantive = msgTotal - meaningless;

    const targets =
      groups.length > 0 ? groups : [{ id: "", name: null }];
    for (const target of targets) {
      const bucket = ensureBucket(target.id, target.name);
      if (!bucket.members.has(studentId)) {
        bucket.members.set(studentId, { name, substantive });
      }
      bucket.studentMessageTotal += msgTotal;
      bucket.effectiveQuestions += effective;
      bucket.meaninglessMessages += meaningless;
    }
  }

  const rows: ParticipationRow[] = [];
  for (const bucket of buckets.values()) {
    const noInteractionNames: string[] = [];
    let active = 0;
    for (const member of bucket.members.values()) {
      if (member.substantive > 0) active += 1;
      else noInteractionNames.push(member.name);
    }
    noInteractionNames.sort();
    rows.push({
      id: bucket.id,
      name: bucket.name,
      studentMessageTotal: bucket.studentMessageTotal,
      effectiveQuestions: bucket.effectiveQuestions,
      meaninglessMessages: bucket.meaninglessMessages,
      substantiveMessages: bucket.studentMessageTotal - bucket.meaninglessMessages,
      activeStudents: active,
      noInteractionStudents: noInteractionNames.length,
      noInteractionNames,
    });
  }
  return rows;
}
