import crypto from "crypto";
import express from "express";
import multer from "multer";
import path from "path";
import { pool } from "../db.ts";
import { getAuthUser, requireAuth } from "../lib/platform-auth.ts";
import { canManageAllAccounts } from "../config/account-overrides.ts";

const router = express.Router();

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".png", ".jpg", ".jpeg", ".webp",
]);
const requestBuckets = new Map<string, number[]>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 30, fields: 20 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    callback(null, ALLOWED_EXTENSIONS.has(ext));
  },
});

let ensureTablesPromise: Promise<void> | null = null;

export function ensureSchoolAvatarRequestTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS school_avatar_requests (
          id TEXT PRIMARY KEY,
          reference_code TEXT NOT NULL UNIQUE,
          school_name TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          source TEXT NOT NULL DEFAULT 'website',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS school_avatar_request_roles (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES school_avatar_requests(id) ON DELETE CASCADE,
          role_index INTEGER NOT NULL,
          name TEXT NOT NULL,
          subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
          custom_subject TEXT NOT NULL DEFAULT '',
          visual_styles JSONB NOT NULL DEFAULT '[]'::jsonb,
          material_text TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS school_avatar_request_files (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES school_avatar_requests(id) ON DELETE CASCADE,
          role_index INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('reference', 'material')),
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          content BYTEA NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS school_avatar_requests_created_at_idx ON school_avatar_requests(created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS school_avatar_request_files_request_idx ON school_avatar_request_files(request_id)`);
    })().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }
  return ensureTablesPromise;
}

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestBuckets.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ error: "提交次數過多，請稍後再試。" });
  recent.push(now);
  requestBuckets.set(key, recent);
  next();
}

function makeReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CR-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

router.post("/", rateLimit, upload.any(), async (req, res) => {
  const schoolName = text(req.body.schoolName, 160);
  const teacherName = text(req.body.teacherName, 120);
  const phone = text(req.body.phone, 60);
  const email = text(req.body.email, 180).toLowerCase();

  if (text(req.body.website, 200)) return res.status(200).json({ ok: true });
  if (!schoolName || !teacherName || !phone || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "請填妥學校、聯絡老師、電話及有效電郵。" });
  }

  let rawRoles: unknown;
  try {
    rawRoles = JSON.parse(String(req.body.roles || "[]"));
  } catch {
    return res.status(400).json({ error: "角色資料格式不正確。" });
  }
  if (!Array.isArray(rawRoles) || rawRoles.length < 1 || rawRoles.length > 10) {
    return res.status(400).json({ error: "每次可提交 1 至 10 個角色。" });
  }

  const roles = rawRoles.map((raw: any) => ({
    name: text(raw?.name, 160),
    subjects: Array.isArray(raw?.subjects) ? raw.subjects.map((v: unknown) => text(v, 80)).filter(Boolean).slice(0, 20) : [],
    customSubject: text(raw?.customSubject, 160),
    visualStyles: Array.isArray(raw?.visualStyles) ? raw.visualStyles.map((v: unknown) => text(v, 80)).filter(Boolean).slice(0, 10) : [],
    materialText: text(raw?.materialText, 20000),
    notes: text(raw?.notes, 5000),
  }));
  if (roles.some((role) => !role.name)) return res.status(400).json({ error: "請為每個數字人填寫名稱或角色主題。" });

  const files = (req.files || []) as Express.Multer.File[];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 60 * 1024 * 1024) return res.status(413).json({ error: "所有檔案合計不可超過 60MB。" });

  const id = crypto.randomUUID();
  const reference = makeReference();
  await ensureSchoolAvatarRequestTables();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO school_avatar_requests (id, reference_code, school_name, teacher_name, phone, email) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, reference, schoolName, teacherName, phone, email]
    );
    for (let index = 0; index < roles.length; index += 1) {
      const role = roles[index];
      await client.query(
        `INSERT INTO school_avatar_request_roles (id, request_id, role_index, name, subjects, custom_subject, visual_styles, material_text, notes)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`,
        [crypto.randomUUID(), id, index, role.name, JSON.stringify(role.subjects), role.customSubject, JSON.stringify(role.visualStyles), role.materialText, role.notes]
      );
    }
    for (const file of files) {
      const match = file.fieldname.match(/^(reference|material)-(\d+)$/);
      if (!match) continue;
      const roleIndex = Number(match[2]);
      if (!Number.isInteger(roleIndex) || roleIndex < 0 || roleIndex >= roles.length) continue;
      await client.query(
        `INSERT INTO school_avatar_request_files (id, request_id, role_index, kind, original_name, mime_type, size_bytes, content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [crypto.randomUUID(), id, roleIndex, match[1], text(file.originalname, 240), file.mimetype || "application/octet-stream", file.size, file.buffer]
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ ok: true, reference });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to create school avatar request:", error);
    return res.status(500).json({ error: "暫時未能提交，請稍後再試或聯絡 ChopReality 團隊。" });
  } finally {
    client.release();
  }
});

router.get("/", requireAuth, async (req, res) => {
  const user = getAuthUser(req);
  if (!user || !canManageAllAccounts(user.email)) return res.status(403).json({ error: "forbidden" });
  const result = await pool.query(`
    SELECT r.id, r.reference_code, r.school_name, r.teacher_name, r.email, r.status, r.created_at,
      COUNT(DISTINCT rr.id)::int AS role_count, COUNT(DISTINCT f.id)::int AS file_count
    FROM school_avatar_requests r
    LEFT JOIN school_avatar_request_roles rr ON rr.request_id = r.id
    LEFT JOIN school_avatar_request_files f ON f.request_id = r.id
    GROUP BY r.id ORDER BY r.created_at DESC LIMIT 200
  `);
  return res.json({ requests: result.rows });
});

router.get("/:requestId", requireAuth, async (req, res) => {
  const user = getAuthUser(req);
  if (!user || !canManageAllAccounts(user.email)) return res.status(403).json({ error: "forbidden" });
  const [requestResult, rolesResult, filesResult] = await Promise.all([
    pool.query(
      `SELECT id, reference_code, school_name, teacher_name, phone, email, status, created_at, updated_at
       FROM school_avatar_requests WHERE id=$1`,
      [req.params.requestId]
    ),
    pool.query(
      `SELECT id, role_index, name, subjects, custom_subject, visual_styles, material_text, notes
       FROM school_avatar_request_roles WHERE request_id=$1 ORDER BY role_index ASC`,
      [req.params.requestId]
    ),
    pool.query(
      `SELECT id, role_index, kind, original_name, mime_type, size_bytes, created_at
       FROM school_avatar_request_files WHERE request_id=$1 ORDER BY role_index ASC, created_at ASC`,
      [req.params.requestId]
    ),
  ]);
  if (!requestResult.rowCount) return res.status(404).json({ error: "request not found" });
  return res.json({ request: requestResult.rows[0], roles: rolesResult.rows, files: filesResult.rows });
});

router.patch("/:requestId/status", requireAuth, async (req, res) => {
  const user = getAuthUser(req);
  if (!user || !canManageAllAccounts(user.email)) return res.status(403).json({ error: "forbidden" });
  const status = text(req.body?.status, 40);
  if (!["new", "reviewing", "completed"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  const result = await pool.query(
    `UPDATE school_avatar_requests SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING status, updated_at`,
    [status, req.params.requestId]
  );
  if (!result.rowCount) return res.status(404).json({ error: "request not found" });
  return res.json(result.rows[0]);
});

router.get("/:requestId/files/:fileId", requireAuth, async (req, res) => {
  const user = getAuthUser(req);
  if (!user || !canManageAllAccounts(user.email)) return res.status(403).json({ error: "forbidden" });
  const result = await pool.query(
    `SELECT original_name, mime_type, content FROM school_avatar_request_files WHERE id=$1 AND request_id=$2`,
    [req.params.fileId, req.params.requestId]
  );
  if (!result.rowCount) return res.status(404).json({ error: "file not found" });
  const file = result.rows[0];
  res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  return res.send(file.content);
});

router.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "單一檔案不可超過 20MB。" });
  }
  console.error("School avatar request upload failed:", error);
  return res.status(400).json({ error: "檔案格式或上載內容不正確。" });
});

export default router;
