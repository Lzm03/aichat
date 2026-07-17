import { pool } from "../db.ts";
import { ensurePlatformTables } from "../lib/platform-auth.ts";
import { ensureCharacterTopicTables } from "../lib/character-topics.ts";

try {
  await ensurePlatformTables();
  await ensureCharacterTopicTables();
  console.log("Character Topic migration completed.");
} finally {
  await pool.end();
}
