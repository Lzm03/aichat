import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const isLocalDatabase = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(String(databaseUrl || ""));

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.PGPOOL_MAX || 30),
  min: Number(process.env.PGPOOL_MIN || 5),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});

export async function warmDatabasePool() {
  const configured = Number(process.env.PGPOOL_WARM_CONNECTIONS || 5);
  const target = Math.min(
    pool.options.max,
    Math.max(pool.options.min, Number.isFinite(configured) ? Math.floor(configured) : 5)
  );
  const clients = await Promise.all(Array.from({ length: target }, () => pool.connect()));
  clients.forEach((client) => client.release());
}
