import express from "express";
import {
  CharacterTopicError,
  MAX_TOPICS_PER_CHARACTER,
  createCharacterTopic,
  deleteCharacterTopic,
  getAccessibleCharacter,
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
    const character = await getAccessibleCharacter(characterId, user?.id || null);
    if (!character) return res.status(404).json({ error: "Character not found" });
    const topics = await listCharacterTopics(characterId);
    return res.json({
      topics: topics.map((topic) => mapCharacterTopicRow(topic)),
      maxTopics: MAX_TOPICS_PER_CHARACTER,
      legacyFallback: topics.length === 0,
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
