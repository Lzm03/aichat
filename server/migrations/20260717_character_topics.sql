BEGIN;

CREATE TABLE IF NOT EXISTS character_topics (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  knowledge_content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  inherits_legacy_knowledge BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS character_topics_character_sort_idx
  ON character_topics(character_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS character_topics_one_default_idx
  ON character_topics(character_id)
  WHERE is_default = TRUE;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_topic_id_fkey'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_topic_id_fkey
      FOREIGN KEY (topic_id) REFERENCES character_topics(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_topic_id_idx ON conversations(topic_id);

INSERT INTO character_topics (
  id, character_id, name, description, system_prompt,
  knowledge_content, sort_order, is_default, inherits_legacy_knowledge
)
SELECT
  CONCAT('topic_legacy_', b.id),
  b.id,
  '預設主題',
  '沿用此角色原有的提示與知識設定。',
  '',
  COALESCE(b.knowledge_base, ''),
  0,
  TRUE,
  TRUE
FROM bots b
WHERE NOT EXISTS (
  SELECT 1 FROM character_topics t WHERE t.character_id = b.id
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
