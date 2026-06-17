import crypto from "crypto";
import { pool } from "../db.ts";

export type ConversationRow = {
  id: string;
  user_id: string;
  bot_id: string | null;
  title: string;
  type: string;
  status: string;
  last_message_preview: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  bot_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: "normal" | "quiz_question" | "quiz_answer" | "quiz_result";
  metadata: Record<string, any> | null;
  created_at: Date | string;
};

type CreateConversationInput = {
  userId: string;
  botId?: string | null;
  title?: string;
  type?: string;
};

type SaveConversationMessageInput = {
  conversationId: string;
  userId: string;
  botId?: string | null;
  role: ConversationMessageRow["role"];
  content: string;
  messageType?: ConversationMessageRow["message_type"];
  metadata?: Record<string, any>;
};

let tablesReady: Promise<void> | null = null;

export function mapConversationRow(row: ConversationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    botId: row.bot_id,
    title: row.title,
    type: row.type,
    status: row.status,
    lastMessagePreview: row.last_message_preview,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function mapConversationMessageRow(row: ConversationMessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    botId: row.bot_id,
    role: row.role,
    content: row.content,
    messageType: row.message_type,
    metadata: row.metadata || {},
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function ensureConversationTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          bot_id TEXT NULL REFERENCES bots(id) ON DELETE SET NULL,
          title TEXT NOT NULL DEFAULT '新的對話',
          type TEXT NOT NULL DEFAULT 'bot_learning',
          status TEXT NOT NULL DEFAULT 'active',
          last_message_preview TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS conversation_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          bot_id TEXT NULL REFERENCES bots(id) ON DELETE SET NULL,
          role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
          content TEXT NOT NULL,
          message_type TEXT NOT NULL DEFAULT 'normal',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
        ON conversations(user_id, updated_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_user_bot_updated
        ON conversations(user_id, bot_id, updated_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
        ON conversation_messages(conversation_id, created_at ASC)
      `);
    })();
  }
  return tablesReady;
}

export async function listConversationsForUser(input: {
  userId: string;
  botId?: string | null;
  search?: string;
}) {
  await ensureConversationTables();
  const values: any[] = [input.userId];
  const clauses = ["user_id=$1", "status <> 'deleted'"];

  if (input.botId) {
    values.push(input.botId);
    clauses.push(`bot_id=$${values.length}`);
  }

  const normalizedSearch = String(input.search || "").trim();
  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    clauses.push(`(title ILIKE $${values.length} OR last_message_preview ILIKE $${values.length})`);
  }

  const result = await pool.query(
    `
    SELECT *
    FROM conversations
    WHERE ${clauses.join(" AND ")}
    ORDER BY updated_at DESC
    LIMIT 100
    `,
    values
  );
  return result.rows as ConversationRow[];
}

export async function createConversation(input: CreateConversationInput) {
  await ensureConversationTables();
  const id = crypto.randomUUID();
  const result = await pool.query(
    `
    INSERT INTO conversations (id, user_id, bot_id, title, type, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    RETURNING *
    `,
    [
      id,
      input.userId,
      input.botId || null,
      String(input.title || "新的對話").trim() || "新的對話",
      String(input.type || "bot_learning").trim() || "bot_learning",
    ]
  );
  return result.rows[0] as ConversationRow;
}

export async function getConversationForUser(conversationId: string, userId: string) {
  await ensureConversationTables();
  const result = await pool.query(
    `SELECT * FROM conversations WHERE id=$1 AND user_id=$2 AND status <> 'deleted' LIMIT 1`,
    [conversationId, userId]
  );
  return (result.rows[0] as ConversationRow) || null;
}

export async function renameConversation(conversationId: string, userId: string, title: string) {
  await ensureConversationTables();
  const result = await pool.query(
    `
    UPDATE conversations
    SET title=$3, updated_at=NOW()
    WHERE id=$1 AND user_id=$2 AND status <> 'deleted'
    RETURNING *
    `,
    [conversationId, userId, String(title || "").trim().slice(0, 80)]
  );
  return (result.rows[0] as ConversationRow) || null;
}

export async function deleteConversation(conversationId: string, userId: string) {
  await ensureConversationTables();
  const result = await pool.query(
    `DELETE FROM conversations WHERE id=$1 AND user_id=$2 RETURNING id`,
    [conversationId, userId]
  );
  return Boolean(result.rowCount);
}

export async function listConversationMessages(conversationId: string, userId: string) {
  await ensureConversationTables();
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) return null;
  const result = await pool.query(
    `
    SELECT *
    FROM conversation_messages
    WHERE conversation_id=$1 AND user_id=$2
    ORDER BY created_at ASC
    LIMIT 500
    `,
    [conversationId, userId]
  );
  return result.rows as ConversationMessageRow[];
}

export async function saveConversationMessage(input: SaveConversationMessageInput) {
  await ensureConversationTables();
  const id = crypto.randomUUID();
  const result = await pool.query(
    `
    INSERT INTO conversation_messages (
      id, conversation_id, user_id, bot_id, role, content, message_type, metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    RETURNING *
    `,
    [
      id,
      input.conversationId,
      input.userId,
      input.botId || null,
      input.role,
      input.content,
      input.messageType || "normal",
      JSON.stringify(input.metadata || {}),
    ]
  );
  return result.rows[0] as ConversationMessageRow;
}

export async function updateConversationPreview(conversationId: string, userId: string, preview: string) {
  await ensureConversationTables();
  const normalizedPreview = String(preview || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const result = await pool.query(
    `
    UPDATE conversations
    SET last_message_preview=$3, updated_at=NOW()
    WHERE id=$1 AND user_id=$2 AND status <> 'deleted'
    RETURNING *
    `,
    [conversationId, userId, normalizedPreview || null]
  );
  return (result.rows[0] as ConversationRow) || null;
}

export async function updateConversationTitleFromFirstMessage(conversationId: string, userId: string) {
  await ensureConversationTables();
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation || conversation.title !== "新的對話") return conversation;

  const result = await pool.query(
    `
    SELECT content
    FROM conversation_messages
    WHERE conversation_id=$1 AND user_id=$2 AND role='user'
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [conversationId, userId]
  );
  const firstMessage = String(result.rows[0]?.content || "").replace(/\s+/g, " ").trim();
  if (!firstMessage) return conversation;
  const title = firstMessage.length > 24 ? `${firstMessage.slice(0, 24)}...` : firstMessage;
  return renameConversation(conversationId, userId, title);
}
