import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const isLocalDatabase = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(String(databaseUrl || ""));

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.PGPOOL_MAX || 30),
  min: Number(process.env.PGPOOL_MIN || 2),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});
