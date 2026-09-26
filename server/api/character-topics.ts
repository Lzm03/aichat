import express from "express";
import { pool } from "../db.ts";
import { ensureQuizTables } from "./quizzes.ts";
import {
  CharacterTopicError,
  MAX_TOPICS_PER_CHARACTER,
  createCharacterTopic,
  deleteCharacterTopic,
  getAccessibleBot,
  getCharacterTopic,
  getOwnedCharacter,
  listCharacterTopics,
  mapCharacterTopicRow,
  updateCharacterTopic,
} from "../lib/character-topics.ts";
import {
  getAuthUser,
  optionalAuth,
  requireAuth,
} from "../lib/platform-auth.ts";

const router = express.Router({ mergeParams: true });

function getCharacterId(req: express.Request) {
  return String((req.params as Record<string, string | undefined>).characterId || "").trim();
}

function handleTopicError(res: express.Response, error: unknown, fallback: string) {
  if (error instanceof CharacterTopicError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

router.get("/", async (req, res) => {
  try {
    const characterId = getCharacterId(req);
    const user = await optionalAuth(req);
    const character = await getAccessibleBot(characterId, user?.id || null);
    if (!character) return res.status(404).json({ error: "Character not found" });
    const topics = await listCharacterTopics(characterId);
    // 刪主題警告要講「呢個主題有 N 份已發佈測驗」——一次過回，唔好俾前端逐個主題打一次。
    // 只計已發佈（草稿刪主題唔受影響）；「不分主題」（topic_id IS NULL）唔屬於任何主題。
    let quizCounts: Record<string, number> = {};
    if (topics.length > 0) {
      await ensureQuizTables();
      const counts = await pool.query(
        `SELECT topic_id, COUNT(*)::int AS quiz_count
         FROM quizzes
         WHERE bot_id=$1 AND status='published' AND topic_id IS NOT NULL
         GROUP BY topic_id`,
        [characterId]
      );
      quizCounts = counts.rows.reduce((acc: Record<string, number>, row: any) => {
        acc[String(row.topic_id)] = Number(row.quiz_count || 0);
        return acc;
      }, {});
    }
    return res.json({
      topics: topics.map((topic) => mapCharacterTopicRow(topic)),
      maxTopics: MAX_TOPICS_PER_CHARACTER,
      legacyFallback: topics.length === 0,
      quizCounts,
    });
  } catch (error) {
    return handleTopicError(res, error, "Failed to load Topics");
  }
});

router.get("/:topicId", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const characterId = getCharacterId(req);
    const character = user ? await getOwnedCharacter(characterId, user.id) : null;
    if (!character) return res.status(404).json({ error: "Character not found" });
    const topic = await getCharacterTopic(characterId, String(req.params.topicId || ""));
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    return res.json({ topic: mapCharacterTopicRow(topic, true) });
  } catch (error) {
    return handleTopicError(res, error, "Failed to load Topic");
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const characterId = getCharacterId(req);
    const character = user ? await getOwnedCharacter(characterId, user.id) : null;
    if (!character) return res.status(404).json({ error: "Character not found" });
    const topic = await createCharacterTopic(characterId, req.body || {});
    return res.status(201).json({ topic: mapCharacterTopicRow(topic, true) });
  } catch (error) {
    return handleTopicError(res, error, "Failed to create Topic");
  }
});

router.patch("/:topicId", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const characterId = getCharacterId(req);
    const character = user ? await getOwnedCharacter(characterId, user.id) : null;
    if (!character) return res.status(404).json({ error: "Character not found" });
    const topic = await updateCharacterTopic(
      characterId,
      String(req.params.topicId || ""),
      req.body || {}
    );
    return res.json({ topic: mapCharacterTopicRow(topic, true) });
  } catch (error) {
    return handleTopicError(res, error, "Failed to update Topic");
  }
});

router.delete("/:topicId", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const characterId = getCharacterId(req);
    const character = user ? await getOwnedCharacter(characterId, user.id) : null;
    if (!character) return res.status(404).json({ error: "Character not found" });
    const result = await deleteCharacterTopic(characterId, String(req.params.topicId || ""));
    return res.json({ ok: true, ...result });
  } catch (error) {
    return handleTopicError(res, error, "Failed to delete Topic");
  }
});

export default router;
