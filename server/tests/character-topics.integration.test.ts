import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { pool } from "../db.ts";
import {
  CharacterTopicError,
  composeCharacterTopicPrompt,
  createCharacterTopic,
  deleteCharacterTopic,
  ensureDefaultTopicForCharacter,
  ensureCharacterTopicTables,
  getAccessibleCharacter,
  getCharacterTopic,
  listCharacterTopics,
  resolveCharacterTopic,
  updateCharacterTopic,
} from "../lib/character-topics.ts";
import {
  createConversation,
  getConversationForUser,
  updateConversationTopic,
} from "../lib/conversations.ts";
import { buildChatReplyLanguageRule } from "../../utils/chat-prompt.ts";

const databaseUrl = String(process.env.DATABASE_URL || "");
const safeTestDatabase = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl) && /topic_test/.test(databaseUrl);

before(async () => {
  if (!safeTestDatabase) return;
  await pool.query(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      knowledge_base TEXT,
      security_prompt TEXT,
      owner_id TEXT,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE bot_student_shares (
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, student_id)
    )
  `);
  await pool.query(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '新的對話',
      type TEXT NOT NULL DEFAULT 'bot_learning',
      status TEXT NOT NULL DEFAULT 'active',
      last_message_preview TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash)
     VALUES ('teacher_1','Teacher','teacher@example.test','teacher','test'),
            ('student_1','Student','student@example.test','student','test')`
  );
  await pool.query(
    `INSERT INTO bots (id, name, knowledge_base, security_prompt, owner_id, is_visible)
     VALUES
       ('chinese_teacher','Chinese Teacher','legacy chinese knowledge','base safety','teacher_1',TRUE),
       ('math_teacher','Mathematics Teacher','legacy math knowledge','base safety','teacher_1',TRUE)`
  );
  await ensureCharacterTopicTables();
});

after(async () => {
  await pool.end();
});

test("server reply-language rules cover each supported chat language", () => {
  assert.match(buildChatReplyLanguageRule("cantonese"), /Hong Kong Cantonese/);
  assert.match(buildChatReplyLanguageRule("mandarin"), /Standard Mandarin/);
  assert.match(buildChatReplyLanguageRule("english"), /clear, natural English/);
  assert.match(buildChatReplyLanguageRule("cantonese", true), /Classical Chinese/);
});

test("Topic lifecycle, limit, relationship validation, persistence, and legacy fallback", { skip: !safeTestDatabase }, async () => {
  const migrated = await listCharacterTopics("chinese_teacher");
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].is_default, true);
  assert.equal(migrated[0].knowledge_content, "legacy chinese knowledge");

  const metadataOnlyUpdate = await updateCharacterTopic("chinese_teacher", migrated[0].id, {
    name: "Renamed Default Topic",
    description: "Metadata changed without replacing inherited knowledge.",
    systemPrompt: migrated[0].system_prompt,
    knowledgeContent: migrated[0].knowledge_content,
    isDefault: true,
  });
  assert.equal(metadataOnlyUpdate.inherits_legacy_knowledge, true);

  const reading = await updateCharacterTopic("chinese_teacher", migrated[0].id, {
    name: "Reading Comprehension",
    description: "Analyse structure and central ideas.",
    systemPrompt: "READING_ONLY_INSTRUCTION",
    knowledgeContent: "READING_ONLY_KNOWLEDGE",
    isDefault: true,
  });
  assert.equal(reading.inherits_legacy_knowledge, false);
  const writing = await createCharacterTopic("chinese_teacher", {
    name: "Writing Guidance",
    description: "Plan and revise essays.",
    systemPrompt: "WRITING_ONLY_INSTRUCTION",
    knowledgeContent: "WRITING_ONLY_KNOWLEDGE",
  });
  const classical = await createCharacterTopic("chinese_teacher", {
    name: "Classical Chinese",
    description: "Interpret classical texts.",
    systemPrompt: "CLASSICAL_ONLY_INSTRUCTION",
    knowledgeContent: "CLASSICAL_ONLY_KNOWLEDGE",
  });
  const grammar = await createCharacterTopic("chinese_teacher", {
    name: "Grammar and Vocabulary",
    description: "Practise grammar and vocabulary.",
    systemPrompt: "GRAMMAR_ONLY_INSTRUCTION",
    knowledgeContent: "GRAMMAR_ONLY_KNOWLEDGE",
  });
  assert.equal((await listCharacterTopics("chinese_teacher")).length, 4);

  await assert.rejects(
    () => createCharacterTopic("chinese_teacher", {
      name: "Fifth Topic",
      description: "Should fail",
      systemPrompt: "",
      knowledgeContent: "",
    }),
    (error: unknown) => error instanceof CharacterTopicError && error.code === "TOPIC_LIMIT_REACHED"
  );

  const mathTopic = (await listCharacterTopics("math_teacher"))[0];
  await assert.rejects(
    () => resolveCharacterTopic({
      characterId: "chinese_teacher",
      requestedTopicId: mathTopic.id,
    }),
    (error: unknown) => error instanceof CharacterTopicError && error.code === "TOPIC_CHARACTER_MISMATCH"
  );

  const character = await getAccessibleCharacter("chinese_teacher", "student_1");
  assert.ok(character);
  const writingPrompt = composeCharacterTopicPrompt("CHARACTER_BASE", character!, writing);
  assert.match(writingPrompt, /WRITING_ONLY_INSTRUCTION/);
  assert.match(writingPrompt, /WRITING_ONLY_KNOWLEDGE/);
  assert.doesNotMatch(writingPrompt, /READING_ONLY_KNOWLEDGE/);

  const conversation = await createConversation({
    userId: "student_1",
    botId: "chinese_teacher",
    topicId: classical.id,
  });
  assert.equal(conversation.topic_id, classical.id);
  const reopened = await getConversationForUser(conversation.id, "student_1");
  assert.equal(reopened?.topic_id, classical.id);
  const switched = await updateConversationTopic(conversation.id, "student_1", writing.id);
  assert.equal(switched?.topic_id, writing.id);

  await updateConversationTopic(conversation.id, "student_1", reading.id);
  const deletedDefault = await deleteCharacterTopic("chinese_teacher", reading.id);
  assert.notEqual(deletedDefault.defaultTopicId, reading.id);
  const afterDefaultDelete = await listCharacterTopics("chinese_teacher");
  assert.equal(afterDefaultDelete.filter((topic) => topic.is_default).length, 1);
  assert.equal((await getConversationForUser(conversation.id, "student_1"))?.topic_id, deletedDefault.defaultTopicId);

  await deleteCharacterTopic("chinese_teacher", grammar.id);
  await deleteCharacterTopic("chinese_teacher", classical.id);
  await assert.rejects(
    () => deleteCharacterTopic("chinese_teacher", writing.id),
    (error: unknown) => error instanceof CharacterTopicError && error.code === "LAST_TOPIC_REQUIRED"
  );

  await pool.query(
    `INSERT INTO bots (id, name, knowledge_base, security_prompt, owner_id, is_visible)
     VALUES ('legacy_after_migration','Legacy Character','LEGACY_KNOWLEDGE','legacy safety','teacher_1',TRUE)`
  );
  const legacyTopic = await resolveCharacterTopic({ characterId: "legacy_after_migration" });
  assert.equal(legacyTopic, null);
  const legacyCharacter = await getAccessibleCharacter("legacy_after_migration", "teacher_1");
  assert.equal(composeCharacterTopicPrompt("LEGACY_BASE_PROMPT", legacyCharacter!, null), "LEGACY_BASE_PROMPT");

  const transactionClient = await pool.connect();
  let transactionOpen = false;
  try {
    await transactionClient.query("BEGIN");
    transactionOpen = true;
    await transactionClient.query(
      `INSERT INTO bots (id, name, knowledge_base, security_prompt, owner_id, is_visible)
       VALUES ('transactional_character','Transactional Character','TRANSACTIONAL_KNOWLEDGE','base safety','teacher_1',TRUE)`
    );
    const transactionalTopic = await ensureDefaultTopicForCharacter(
      "transactional_character",
      "TRANSACTIONAL_KNOWLEDGE",
      transactionClient
    );
    assert.equal(transactionalTopic.character_id, "transactional_character");
    await transactionClient.query("ROLLBACK");
    transactionOpen = false;
  } finally {
    if (transactionOpen) {
      await transactionClient.query("ROLLBACK").catch(() => undefined);
    }
    transactionClient.release();
  }
  assert.equal(
    Number((await pool.query(`SELECT COUNT(*) FROM bots WHERE id='transactional_character'`)).rows[0].count),
    0
  );
  assert.equal((await listCharacterTopics("transactional_character")).length, 0);

  assert.equal((await getCharacterTopic("chinese_teacher", writing.id))?.knowledge_content, "WRITING_ONLY_KNOWLEDGE");
});
