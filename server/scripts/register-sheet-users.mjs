import crypto from "crypto";
import { pool } from "../db.ts";
import { ensurePlatformTables, hashPassword } from "../lib/platform-auth.ts";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/13TGL7iizwfkmMnKTiqTwi1a8kxDBYX9WancCqHGwXGE/export?format=csv&gid=0";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function surnameFromName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "老師";
  if (/[\u4e00-\u9fff]/.test(trimmed[0])) return trimmed[0];
  return trimmed.split(/\s+/)[0]
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function displayNameFor(row) {
  const name = String(row.teacherName || "").trim();
  const position = String(row.position || "老師").trim() || "老師";
  if (name.includes(position)) return name;
  return `${surnameFromName(name)}${position}`;
}

function normalizeRows(rows) {
  const dataRows = rows.slice(3);
  const seen = new Map();

  for (const row of dataRows) {
    const [school, teacherName, position, email, companions, attendanceCount] = row;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) continue;
    seen.set(normalizedEmail, {
      school: String(school || "").trim(),
      teacherName: String(teacherName || "").trim(),
      position: String(position || "老師").trim() || "老師",
      email: normalizedEmail,
      companions: String(companions || "").trim(),
      attendanceCount: Number(attendanceCount || 1) || 1,
    });
  }

  return Array.from(seen.values());
}

async function main() {
  const initialPassword = String(process.env.SHEET_USER_DEFAULT_PASSWORD || "");
  if (initialPassword.length < 12) {
    throw new Error("SHEET_USER_DEFAULT_PASSWORD must be set to at least 12 characters.");
  }

  await ensurePlatformTables();
  const response = await fetch(SHEET_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status}`);
  }

  const rows = normalizeRows(parseCsv(await response.text()));
  const results = [];

  for (const row of rows) {
    const fullName = displayNameFor(row);
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (
         id, full_name, email, role, avatar_url, preferences_json, password_hash,
         status, plan_name, monthly_credit_limit, credit_balance, credit_used,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, 'teacher', NULL, $4::jsonb, $5, 'active', 'starter', 200, 200, 0, NOW(), NOW())
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role = 'teacher',
         status = 'active',
         updated_at = NOW()`,
      [
        id,
        fullName,
        row.email,
        JSON.stringify({
          school: row.school,
          source: "2026-06-02 google sheet import",
          originalTeacherName: row.teacherName,
          position: row.position,
          companions: row.companions,
          attendanceCount: row.attendanceCount,
        }),
        hashPassword(initialPassword),
      ]
    );
    results.push({ email: row.email, fullName, school: row.school });
  }

  console.log(JSON.stringify({ count: results.length, users: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
