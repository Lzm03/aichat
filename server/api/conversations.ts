import express from "express";
import { getAuthUser, requireAuth } from "../lib/platform-auth.ts";
import {
  createConversation,
  deleteConversation,
  getConversationForUser,
  listConversationMessages,
  listConversationsForUser,
  mapConversationMessageRow,
  mapConversationRow,
  renameConversation,
  saveConversationMessage,
  updateConversationTopic,
} from "../lib/conversations.ts";
import {
  CharacterTopicError,
  getAccessibleCharacter,
  resolveCharacterTopic,
} from "../lib/character-topics.ts";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const botId = typeof req.query.botId === "string" ? req.query.botId.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const conversations = await listConversationsForUser({
      userId: user.id,
      botId: botId || null,
      search,
    });
    return res.json({ conversations: conversations.map(mapConversationRow) });
  } catch (error) {
    console.error("GET /api/conversations failed:", error);
    return res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.post("/", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const botId = String(req.body?.botId || "").trim() || null;
    let topicId: string | null = null;
    if (botId) {
      const character = await getAccessibleCharacter(botId, user.id);
      if (!character) return res.status(404).json({ error: "Character not found" });
      const topic = await resolveCharacterTopic({
        characterId: botId,
        requestedTopicId: String(req.body?.topicId || "").trim() || null,
      });
      topicId = topic?.id || null;
    }
    const conversation = await createConversation({
      userId: user.id,
      botId,
      topicId,
      title: String(req.body?.title || "新的對話").trim() || "新的對話",
      type: String(req.body?.type || "bot_learning").trim() || "bot_learning",
    });
    return res.status(201).json({ conversation: mapConversationRow(conversation) });
  } catch (error) {
    if (error instanceof CharacterTopicError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error("POST /api/conversations failed:", error);
    return res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.patch("/:conversationId/topic", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const conversation = await getConversationForUser(req.params.conversationId, user.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    const topicId = String(req.body?.topicId || "").trim();
    if (!topicId) return res.status(400).json({ error: "topicId is required" });
    const characterId = String(conversation.bot_id || "").trim();
    if (!characterId) return res.status(400).json({ error: "Conversation has no Character" });
    const character = await getAccessibleCharacter(characterId, user.id);
    if (!character) return res.status(404).json({ error: "Character not found" });
    const topic = await resolveCharacterTopic({ characterId, requestedTopicId: topicId });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const updated = await updateConversationTopic(conversation.id, user.id, topic.id);
    return res.json({ conversation: mapConversationRow(updated!) });
  } catch (error) {
    if (error instanceof CharacterTopicError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error("PATCH /api/conversations/:conversationId/topic failed:", error);
    return res.status(500).json({ error: "Failed to switch Topic" });
  }
});

router.get("/:conversationId", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const conversation = await getConversationForUser(req.params.conversationId, user.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    return res.json({ conversation: mapConversationRow(conversation) });
  } catch (error) {
    console.error("GET /api/conversations/:conversationId failed:", error);
    return res.status(500).json({ error: "Failed to load conversation" });
  }
});

router.patch("/:conversationId", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "title is required" });
    const conversation = await renameConversation(req.params.conversationId, user.id, title);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    return res.json({ conversation: mapConversationRow(conversation) });
  } catch (error) {
    console.error("PATCH /api/conversations/:conversationId failed:", error);
    return res.status(500).json({ error: "Failed to rename conversation" });
  }
});

router.delete("/:conversationId", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const ok = await deleteConversation(req.params.conversationId, user.id);
    if (!ok) return res.status(404).json({ error: "Conversation not found" });
    return res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/conversations/:conversationId failed:", error);
    return res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/:conversationId/messages", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const messages = await listConversationMessages(req.params.conversationId, user.id);
    if (!messages) return res.status(404).json({ error: "Conversation not found" });
    return res.json({ messages: messages.map(mapConversationMessageRow) });
  } catch (error) {
    console.error("GET /api/conversations/:conversationId/messages failed:", error);
    return res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/:conversationId/messages", async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const conversation = await getConversationForUser(req.params.conversationId, user.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ error: "content is required" });
    const role = String(req.body?.role || "user");
    if (!["user", "assistant", "system"].includes(role)) {
      return res.status(400).json({ error: "invalid role" });
    }
    const message = await saveConversationMessage({
      conversationId: conversation.id,
      userId: user.id,
      botId: String(req.body?.botId || conversation.bot_id || "").trim() || null,
      role: role as "user" | "assistant" | "system",
      content,
      messageType: String(req.body?.messageType || "normal") as any,
      metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
    });
    return res.status(201).json({ message: mapConversationMessageRow(message) });
  } catch (error) {
    console.error("POST /api/conversations/:conversationId/messages failed:", error);
    return res.status(500).json({ error: "Failed to save message" });
  }
});

export default router;
