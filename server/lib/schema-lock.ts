import { pool } from "../db.ts";

// All schema provisioning — every ensure*Tables() function, in lib/ and api/ —
// must run under this mutex. CREATE TABLE IF NOT EXISTS is not race-free: two
// processes that both see a missing table both try to create it, and the loser
// dies on pg_type_typname_nsp_index. A fresh database plus several instances
// booting at once reaches this, and it fails the whole boot because the ensure
// calls are awaited before app.listen().
//
// Session-scoped rather than transaction-scoped, because each function's DDL
// runs as individual autocommit statements on the pool instead of one
// transaction. Postgres drops a session's advisory locks when it ends, so a
// crashed process cannot wedge the mutex.
//
// The key is deliberately shared by every provisioning function: they must not
// interleave with one another, and one key per function would split the mutex
// into per-table locks that two booting instances could take in different
// orders. Chosen once; never change it.
const SCHEMA_LOCK_KEY = 1_668_248_688;

// Reentrancy depth for this process. initializeQuizTables() awaits
// ensurePlatformTables(), so a nested acquisition happens on the boot path;
// acquiring the lock again on a second pool client would deadlock. While this
// process holds the mutex no other process can be inside it, so a nested run
// is still safe without taking the lock again.
let heldDepth = 0;

export async function withSchemaLock<T>(run: () => Promise<T>): Promise<T> {
  if (heldDepth > 0) return run();

  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1::bigint)", [SCHEMA_LOCK_KEY]);
    heldDepth = 1;
    return await run();
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [SCHEMA_LOCK_KEY]);
    } catch {
      // The session is already gone; its advisory locks went with it.
    }
    heldDepth = 0;
    lockClient.release();
  }
}
