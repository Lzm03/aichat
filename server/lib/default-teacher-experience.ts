import crypto from "crypto";
import type { PoolClient } from "pg";
import { pool } from "../db.ts";

const CONFUCIUS_TEMPLATE_KEY = "default-confucius-v1";
const CONFUCIUS_QUIZ_TEMPLATE_KEY = "default-confucius-quiz-v1";

const CONFUCIUS_SOURCE_TEXT = `孔子（公元前551年至公元前479年），名丘，字仲尼，是中國古代思想家、教育家，儒家學派創始人。孔子主張「仁」與「禮」，重視關愛他人、尊重規範及自我修養。他提出「有教無類」，認為人人都應有接受教育的機會；教學時重視「因材施教」，並鼓勵學生主動思考。孔子也提醒學習者「學而時習之」，把學習和溫習結合；「三人行，必有我師焉」則表示每個人身上都有值得學習之處。孔子的言行由弟子及再傳弟子整理在《論語》中，對中國及東亞文化產生深遠影響。`;

const CONFUCIUS_QUESTIONS = [
  { type: "多項選擇題", cognitive: "記憶", text: "孔子的名和字分別是甚麼？", options: ["名丘，字仲尼", "名軻，字子輿", "名耳，字聃", "名鞅，字公孫"], answer: "名丘，字仲尼", explanation: "孔子名丘，字仲尼。" },
  { type: "多項選擇題", cognitive: "記憶", text: "孔子是哪一個學派的創始人？", options: ["道家", "儒家", "墨家", "法家"], answer: "儒家", explanation: "孔子是儒家學派創始人。" },
  { type: "判斷題", cognitive: "理解", text: "「有教無類」表示只有特定身分的人才可以接受教育。", options: ["正確", "錯誤"], answer: "錯誤", explanation: "有教無類主張人人都應有接受教育的機會。" },
  { type: "填充題", cognitive: "記憶", text: "孔子的言行主要收錄在《＿＿》中。", options: [], answer: "論語", explanation: "孔子的弟子及再傳弟子把相關言行整理成《論語》。" },
  { type: "多項選擇題", cognitive: "理解", text: "「因材施教」最接近以下哪一種做法？", options: ["所有學生使用完全相同的方法", "按學生特點採用合適的教學方法", "只教成績最好的學生", "讓學生完全不需指導"], answer: "按學生特點採用合適的教學方法", explanation: "因材施教強調根據學生的能力和特點調整教學。" },
  { type: "判斷題", cognitive: "理解", text: "「學而時習之」重視學習後適時溫習。", options: ["正確", "錯誤"], answer: "正確", explanation: "這句話把學習與經常溫習連結起來。" },
  { type: "多項選擇題", cognitive: "應用", text: "小明從同學身上學到整理筆記的方法，最能呼應哪句話？", options: ["三人行，必有我師焉", "己所不欲，勿施於人", "溫故而知新", "知之為知之"], answer: "三人行，必有我師焉", explanation: "這句話提醒我們每個人身上都有值得學習之處。" },
  { type: "簡答題", cognitive: "理解", text: "請用自己的話解釋孔子所重視的「仁」。", options: [], answer: "關愛他人，並以同理和善意與人相處。", explanation: "答案能指出關愛、同理或善待他人即可。" },
  { type: "簡答題", cognitive: "應用", text: "請舉一個在課堂中實踐「有教無類」的例子。", options: [], answer: "例如讓不同能力和背景的學生都能參與課堂並獲得學習支援。", explanation: "例子應表現平等的學習機會。" },
  { type: "論述題", cognitive: "分析", text: "你認為「三人行，必有我師焉」對今天的學習有甚麼啟示？", options: [], answer: "我們應保持謙虛，主動觀察並學習別人的長處，同時反思自己的不足。", explanation: "答案宜連結謙虛、向他人學習及自我反思。" },
];

async function findOrCreateConfuciusBot(client: PoolClient, user: any) {
  // Always resolve the canonical template first. In PostgreSQL, DESC sorts
  // NULL values first unless NULLS LAST is explicit, which previously caused
  // an unmarked same-name bot to be selected ahead of the existing template.
  const existingTemplate = await client.query(
    `SELECT * FROM bots WHERE owner_id=$1 AND template_key=$2 LIMIT 1`,
    [user.id, CONFUCIUS_TEMPLATE_KEY]
  );
  if (existingTemplate.rowCount) {
    const row = existingTemplate.rows[0];
    if (Number(row.chat_message_limit || 0) !== 10) {
      await client.query(`UPDATE bots SET chat_message_limit=10 WHERE id=$1`, [row.id]);
    }
    return String(row.id);
  }

  const reusable = await client.query(
    `SELECT * FROM bots
     WHERE owner_id=$1 AND name='孔子' AND template_key IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (reusable.rowCount) {
    const promoted = await client.query(
      `UPDATE bots
       SET template_key=$1, chat_message_limit=10, updated_at=NOW()
       WHERE id=$2
         AND NOT EXISTS (
           SELECT 1 FROM bots WHERE owner_id=$3 AND template_key=$1
         )
       RETURNING id`,
      [CONFUCIUS_TEMPLATE_KEY, reusable.rows[0].id, user.id]
    );
    if (promoted.rowCount) return String(promoted.rows[0].id);

    const concurrentlyCreated = await client.query(
      `SELECT id FROM bots WHERE owner_id=$1 AND template_key=$2 LIMIT 1`,
      [user.id, CONFUCIUS_TEMPLATE_KEY]
    );
    if (concurrentlyCreated.rowCount) return String(concurrentlyCreated.rows[0].id);
  }

  const source = await client.query(
    `SELECT * FROM bots WHERE name='孔子'
     ORDER BY (template_key=$1) DESC NULLS LAST, created_at DESC LIMIT 1`,
    [CONFUCIUS_TEMPLATE_KEY]
  );
  const sourceBot = source.rows[0] || {};
  const botId = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO bots (
      id, name, subject, subject_color, avatar_url, background, animation,
      knowledge_base, security_prompt, video_idle, video_thinking, video_talking,
      voice_id, opening_message, interactions, accuracy, is_visible,
      owner_id, owner_email, template_key, chat_message_limit
    ) VALUES ($1,'孔子',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,0,true,$14,$15,$16,10)
    ON CONFLICT (owner_id, template_key) WHERE template_key IS NOT NULL DO NOTHING
    RETURNING id`,
    [
      botId,
      sourceBot.subject || "語文（中文）",
      sourceBot.subject_color || "indigo",
      sourceBot.avatar_url || "/avatars/bot-default.svg",
      sourceBot.background || "",
      sourceBot.animation || "",
      sourceBot.knowledge_base || CONFUCIUS_SOURCE_TEXT,
      sourceBot.security_prompt || "你是孔子，以親切、循循善誘的繁體中文引導學生思考。只回答適合學生的學習內容。",
      sourceBot.video_idle || "",
      sourceBot.video_thinking || "",
      sourceBot.video_talking || "",
      sourceBot.voice_id || "",
      sourceBot.opening_message || "學而時習之，不亦說乎？讓我們一起開始今天的學習。",
      user.id,
      user.email || null,
      CONFUCIUS_TEMPLATE_KEY,
    ]
  );
  if (inserted.rowCount) return String(inserted.rows[0].id);

  const concurrentlyCreated = await client.query(
    `SELECT id FROM bots WHERE owner_id=$1 AND template_key=$2 LIMIT 1`,
    [user.id, CONFUCIUS_TEMPLATE_KEY]
  );
  if (concurrentlyCreated.rowCount) return String(concurrentlyCreated.rows[0].id);
  throw new Error("failed to resolve default Confucius bot");
}

async function ensureConfuciusQuiz(client: PoolClient, userId: string, botId: string) {
  const exists = await client.query(
    `SELECT id FROM quizzes WHERE teacher_id=$1 AND template_key=$2 LIMIT 1`,
    [userId, CONFUCIUS_QUIZ_TEMPLATE_KEY]
  );
  if (exists.rowCount) return;

  const quizId = crypto.randomUUID();
  await client.query(
    `INSERT INTO quizzes (
      id, bot_id, teacher_id, title, source_text, target_grade, question_count,
      question_type_mode, preferred_question_types_json, question_type_distribution_json,
      status, template_key
    ) VALUES ($1,$2,$3,'孔子思想入門測驗',$4,'P4-P6',10,'rule_based','[]'::jsonb,'[]'::jsonb,'draft',$5)`,
    [quizId, botId, userId, CONFUCIUS_SOURCE_TEXT, CONFUCIUS_QUIZ_TEMPLATE_KEY]
  );
  for (let index = 0; index < CONFUCIUS_QUESTIONS.length; index += 1) {
    const question = CONFUCIUS_QUESTIONS[index];
    const preview = {
      id: index + 1,
      type: question.type,
      cognitiveLevel: question.cognitive,
      levelColor: "bg-indigo-100 text-indigo-700",
      content: question.text,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
      points: 1,
      difficulty: index < 4 ? "easy" : index < 8 ? "medium" : "hard",
    };
    await client.query(
      `INSERT INTO quiz_questions (
        id, quiz_id, question_type, cognitive_level, question_text, options_json,
        correct_answer, explanation, points, difficulty, order_index, preview_payload_json
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,1,$9,$10,$11::jsonb)`,
      [crypto.randomUUID(), quizId, question.type, question.cognitive, question.text, JSON.stringify(question.options), question.answer, question.explanation, preview.difficulty, index, JSON.stringify(preview)]
    );
  }
}

export async function ensureDefaultTeacherExperience(user: any) {
  if (!user || !["teacher", "admin"].includes(String(user.role || ""))) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`default-teacher:${user.id}`]);
    const botId = await findOrCreateConfuciusBot(client, user);
    await ensureConfuciusQuiz(client, String(user.id), botId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
