BEGIN;

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS topic_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_topic_id_fkey'
  ) THEN
    ALTER TABLE quizzes
      ADD CONSTRAINT quizzes_topic_id_fkey
      FOREIGN KEY (topic_id) REFERENCES character_topics(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quizzes_bot_topic_status_idx
  ON quizzes(bot_id, topic_id, status, updated_at DESC);

COMMIT;
