import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "../db.ts";
import { FEATURE_LIMIT_LIST, FEATURE_LIMITS, type FeatureLimitKey } from "../config/feature-limits.ts";
import { canManageAllAccounts, canResetOwnUsage, isUnlimitedAccount } from "../config/account-overrides.ts";

export type AppRole = "teacher" | "student" | "admin";

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  avatar_url: string | null;
  preferences_json: Record<string, any> | null;
  created_at: string;
  status: string;
  plan_name: string;
  monthly_credit_limit: number;
  credit_balance: number;
  credit_used: number;
};

export const DEFAULT_USER_PREFERENCES = {
  appearance: {
    themeMode: "light",
    backgroundStyle: "sky",
    cardStyle: "soft",
  },
  notifications: {
    productUpdates: true,
    weeklySummary: false,
    securityEmail: true,
  },
  experience: {
    language: "zh-HK",
    autoPlayVoice: true,
    enterToSend: true,
    reduceMotion: false,
  },
} as const;

type AuthTokenPayload = {
  sub: string;
  email: string;
  role: AppRole;
  exp: number;
};

let ensurePlatformTablesPromise: Promise<void> | null = null;
const LEGACY_OWNER_EMAIL = (process.env.LEGACY_OWNER_EMAIL?.trim().toLowerCase() || "lzm200303@gmail.com");
export const DEFAULT_MONTHLY_CREDIT_LIMIT = Number(process.env.DEFAULT_MONTHLY_CREDIT_LIMIT || 200);

function getAuthSecret() {
  return process.env.AUTH_SECRET?.trim() || "chopreality-dev-auth-secret";
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

export function signToken(payload: AuthTokenPayload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(encodedPayload).digest();
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = crypto.createHmac("sha256", getAuthSecret()).update(encodedPayload).digest();
  const actualSignature = fromBase64Url(encodedSignature);
  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as AuthTokenPayload;
    if (!payload?.sub || !payload?.email || !payload?.role || !payload?.exp) return null;
    if (Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function sanitizeUser(row: AuthUser) {
  const preferences = normalizeUserPreferences(row.preferences_json || {});
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url || "",
    preferences,
    createdAt: row.created_at,
    plan: row.plan_name,
    quota: {
      monthlyLimit: Number(row.monthly_credit_limit || 0),
      used: Number(row.credit_used || 0),
      remaining: Number(row.credit_balance || 0),
    },
  };
}

export function normalizeUserPreferences(input: Record<string, any> | null | undefined) {
  const appearance = input?.appearance || {};
  const notifications = input?.notifications || {};
  const experience = input?.experience || {};

  return {
    appearance: {
      themeMode: ["light", "warm", "midnight"].includes(appearance.themeMode)
        ? appearance.themeMode
        : DEFAULT_USER_PREFERENCES.appearance.themeMode,
      backgroundStyle: ["sky", "paper", "forest", "sunset", "slate"].includes(appearance.backgroundStyle)
        ? appearance.backgroundStyle
        : DEFAULT_USER_PREFERENCES.appearance.backgroundStyle,
      cardStyle: ["soft", "glass"].includes(appearance.cardStyle)
        ? appearance.cardStyle
        : DEFAULT_USER_PREFERENCES.appearance.cardStyle,
    },
    notifications: {
      productUpdates:
        typeof notifications.productUpdates === "boolean"
          ? notifications.productUpdates
          : DEFAULT_USER_PREFERENCES.notifications.productUpdates,
      weeklySummary:
        typeof notifications.weeklySummary === "boolean"
          ? notifications.weeklySummary
          : DEFAULT_USER_PREFERENCES.notifications.weeklySummary,
      securityEmail:
        typeof notifications.securityEmail === "boolean"
          ? notifications.securityEmail
          : DEFAULT_USER_PREFERENCES.notifications.securityEmail,
    },
    experience: {
      language: ["zh-HK", "zh-CN", "en"].includes(experience.language)
        ? experience.language
        : DEFAULT_USER_PREFERENCES.experience.language,
      autoPlayVoice:
        typeof experience.autoPlayVoice === "boolean"
          ? experience.autoPlayVoice
          : DEFAULT_USER_PREFERENCES.experience.autoPlayVoice,
      enterToSend:
        typeof experience.enterToSend === "boolean"
          ? experience.enterToSend
          : DEFAULT_USER_PREFERENCES.experience.enterToSend,
      reduceMotion:
        typeof experience.reduceMotion === "boolean"
          ? experience.reduceMotion
          : DEFAULT_USER_PREFERENCES.experience.reduceMotion,
    },
  };
}

export async function ensurePlatformTables() {
  if (!ensurePlatformTablesPromise) {
    ensurePlatformTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
          avatar_url TEXT,
          preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          password_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          plan_name TEXT NOT NULL DEFAULT 'starter',
          monthly_credit_limit INTEGER NOT NULL DEFAULT ${DEFAULT_MONTHLY_CREDIT_LIMIT},
          credit_balance INTEGER NOT NULL DEFAULT ${DEFAULT_MONTHLY_CREDIT_LIMIT},
          credit_used INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'starter',
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS monthly_credit_limit INTEGER NOT NULL DEFAULT ${DEFAULT_MONTHLY_CREDIT_LIMIT},
        ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT ${DEFAULT_MONTHLY_CREDIT_LIMIT},
        ADD COLUMN IF NOT EXISTS credit_used INTEGER NOT NULL DEFAULT 0;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          credits INTEGER NOT NULL,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS usage_events_user_id_created_at_idx ON usage_events(user_id, created_at DESC);`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_feature_limits (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          feature_key TEXT NOT NULL,
          limit_value INTEGER NOT NULL CHECK (limit_value >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, feature_key)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS user_feature_limits_user_id_idx
        ON user_feature_limits(user_id);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS video_studio_tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source_image_url TEXT NOT NULL,
          preset TEXT NOT NULL DEFAULT 'cinematic',
          source_aspect_ratio TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          slots JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS video_studio_tasks_user_id_updated_at_idx
        ON video_studio_tasks(user_id, updated_at DESC);
      `);
      await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS owner_id TEXT;`);
      await pool.query(`CREATE INDEX IF NOT EXISTS bots_owner_id_idx ON bots(owner_id, created_at DESC);`);
    })();
  }
  await ensurePlatformTablesPromise;
}

export async function findUserByEmail(email: string) {
  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT id, full_name, email, role, avatar_url, preferences_json, password_hash, created_at, status, plan_name, monthly_credit_limit, credit_balance, credit_used
     FROM users WHERE email=$1`,
    [email]
  );
  return result.rows[0] || null;
}

export async function findUserById(userId: string) {
  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT id, full_name, email, role, avatar_url, preferences_json, created_at, status, plan_name, monthly_credit_limit, credit_balance, credit_used
     FROM users WHERE id=$1`,
    [userId]
  );
  return (result.rows[0] as AuthUser | undefined) || null;
}

export async function assignLegacyBotsToUser(userId: string) {
  await ensurePlatformTables();
  await pool.query(
    `UPDATE bots
     SET owner_id=$1
     WHERE owner_id IS NULL`,
    [userId]
  );
}

export async function maybeAssignLegacyDataByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== LEGACY_OWNER_EMAIL) return;
  const user = await findUserByEmail(normalizedEmail);
  if (!user) return;
  await assignLegacyBotsToUser(user.id);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "account disabled" });
  }

  (req as any).authUser = user;
  next();
}

export async function optionalAuth(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return findUserById(payload.sub);
}

export function getAuthUser(req: Request) {
  return ((req as any).authUser || null) as AuthUser | null;
}

export async function assertUserCanSpend(userId: string, credits: number) {
  // Credit-based blocking is disabled. Feature limits are enforced separately.
  void userId;
  void credits;
  return;
}

export async function consumeUserCredits(
  userId: string,
  action: string,
  credits: number,
  meta: Record<string, unknown> = {}
) {
  // Credit-based deduction is disabled. Keep account data unchanged.
  void action;
  void credits;
  void meta;
  const user = await findUserById(userId);
  return user ? sanitizeUser(user).quota : null;
}

function featureActionName(featureKey: FeatureLimitKey) {
  return `feature:${featureKey}`;
}

async function getUserFeatureLimitOverrides(userId: string) {
  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT feature_key, limit_value
     FROM user_feature_limits
     WHERE user_id=$1`,
    [userId]
  );
  const overrides = new Map<FeatureLimitKey, number>();
  for (const row of result.rows) {
    const key = String(row.feature_key) as FeatureLimitKey;
    if (FEATURE_LIMITS[key]) {
      overrides.set(key, Number(row.limit_value || 0));
    }
  }
  return overrides;
}

export async function getUserFeatureSummary(userId: string) {
  await ensurePlatformTables();
  const user = await findUserById(userId);
  const unlimited = Boolean(user?.email && isUnlimitedAccount(user.email));
  const limitOverrides = await getUserFeatureLimitOverrides(userId);
  const actionNames = FEATURE_LIMIT_LIST.map((item) => featureActionName(item.key));
  const result = await pool.query(
    `SELECT action, COALESCE(SUM(meta_usage_count), 0) AS used
     FROM (
       SELECT action, COALESCE((meta->>'amount')::int, 1) AS meta_usage_count
       FROM usage_events
       WHERE user_id=$1 AND action = ANY($2)
     ) usage_rows
     GROUP BY action`,
    [userId, actionNames]
  );

  const usedMap = new Map<string, number>();
  for (const row of result.rows) {
    usedMap.set(String(row.action), Number(row.used || 0));
  }

  return FEATURE_LIMIT_LIST.map((definition) => {
    const effectiveLimit = limitOverrides.get(definition.key) ?? definition.limit;
    const used = usedMap.get(featureActionName(definition.key)) || 0;
    const remaining = Math.max(0, effectiveLimit - used);
    return {
      ...definition,
      limit: effectiveLimit,
      used,
      remaining: unlimited ? null : remaining,
      locked: unlimited ? false : remaining <= 0,
      unlimited,
    };
  });
}

export async function ensureFeatureAvailable(
  userId: string,
  featureKey: FeatureLimitKey,
  amount = 1
) {
  const definition = FEATURE_LIMITS[featureKey];
  const user = await findUserById(userId);
  if (user?.email && isUnlimitedAccount(user.email)) {
    return null;
  }
  const summary = await getUserFeatureSummary(userId);
  const current = summary.find((item) => item.key === featureKey);
  if (!definition || !current) {
    throw new Error(`unknown feature limit: ${featureKey}`);
  }
  if (current.used + amount > definition.limit) {
    const error = new Error(definition.upgradeMessage);
    (error as any).status = 402;
    throw error;
  }
  return current;
}

export async function recordFeatureUsage(
  userId: string,
  featureKey: FeatureLimitKey,
  amount = 1,
  meta: Record<string, unknown> = {}
) {
  if (!FEATURE_LIMITS[featureKey]) {
    const error = new Error(`unknown feature limit: ${featureKey}`);
    (error as any).status = 400;
    throw error;
  }
  await ensurePlatformTables();
  await pool.query(
    `INSERT INTO usage_events (id, user_id, action, credits, meta)
     VALUES ($1, $2, $3, 0, $4::jsonb)`,
    [
      crypto.randomUUID(),
      userId,
      featureActionName(featureKey),
      JSON.stringify({ ...meta, amount }),
    ]
  );
  return getUserFeatureSummary(userId);
}

export async function resetOwnFeatureUsage(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    const error = new Error("user not found");
    (error as any).status = 404;
    throw error;
  }
  if (!canResetOwnUsage(user.email)) {
    const error = new Error("this account is not allowed to reset usage");
    (error as any).status = 403;
    throw error;
  }

  const actionNames = FEATURE_LIMIT_LIST.map((item) => featureActionName(item.key));
  await pool.query("DELETE FROM usage_events WHERE user_id=$1 AND action = ANY($2)", [userId, actionNames]);
  return getUserFeatureSummary(userId);
}

export async function listAccountsForAdmin(adminUserId: string) {
  const admin = await findUserById(adminUserId);
  if (!admin || !canManageAllAccounts(admin.email)) {
    const error = new Error("forbidden");
    (error as any).status = 403;
    throw error;
  }

  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT id, full_name, email, role, avatar_url, created_at, status, plan_name, monthly_credit_limit, credit_balance, credit_used
     FROM users
     ORDER BY created_at ASC`
  );

  return Promise.all(
    result.rows.map(async (row) => ({
      user: sanitizeUser(row),
      features: await getUserFeatureSummary(row.id),
    }))
  );
}

export async function resetFeatureUsageForUser(adminUserId: string, targetUserId: string) {
  const admin = await findUserById(adminUserId);
  if (!admin || !canManageAllAccounts(admin.email)) {
    const error = new Error("forbidden");
    (error as any).status = 403;
    throw error;
  }

  const actionNames = FEATURE_LIMIT_LIST.map((item) => featureActionName(item.key));
  await pool.query("DELETE FROM usage_events WHERE user_id=$1 AND action = ANY($2)", [targetUserId, actionNames]);
  return getUserFeatureSummary(targetUserId);
}

export async function setUserFeatureUsage(
  adminUserId: string,
  targetUserId: string,
  featureKey: FeatureLimitKey,
  used: number
) {
  const admin = await findUserById(adminUserId);
  if (!admin || !canManageAllAccounts(admin.email)) {
    const error = new Error("forbidden");
    (error as any).status = 403;
    throw error;
  }
  if (!FEATURE_LIMITS[featureKey]) {
    const error = new Error("unknown feature");
    (error as any).status = 400;
    throw error;
  }

  await pool.query("DELETE FROM usage_events WHERE user_id=$1 AND action=$2", [targetUserId, featureActionName(featureKey)]);
  if (used > 0) {
    await pool.query(
      `INSERT INTO usage_events (id, user_id, action, credits, meta)
       VALUES ($1, $2, $3, 0, $4::jsonb)`,
      [
        crypto.randomUUID(),
        targetUserId,
        featureActionName(featureKey),
        JSON.stringify({ amount: used, source: "admin_set" }),
      ]
    );
  }
  return getUserFeatureSummary(targetUserId);
}

export async function setUserFeatureLimit(
  adminUserId: string,
  targetUserId: string,
  featureKey: FeatureLimitKey,
  limit: number
) {
  const admin = await findUserById(adminUserId);
  if (!admin || !canManageAllAccounts(admin.email)) {
    const error = new Error("forbidden");
    (error as any).status = 403;
    throw error;
  }
  if (!FEATURE_LIMITS[featureKey]) {
    const error = new Error("unknown feature");
    (error as any).status = 400;
    throw error;
  }

  const normalizedLimit = Math.max(0, Math.floor(limit));
  if (normalizedLimit === FEATURE_LIMITS[featureKey].limit) {
    await pool.query(
      `DELETE FROM user_feature_limits
       WHERE user_id=$1 AND feature_key=$2`,
      [targetUserId, featureKey]
    );
  } else {
    await pool.query(
      `INSERT INTO user_feature_limits (user_id, feature_key, limit_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, feature_key)
       DO UPDATE SET limit_value=EXCLUDED.limit_value, updated_at=NOW()`,
      [targetUserId, featureKey, normalizedLimit]
    );
  }

  return getUserFeatureSummary(targetUserId);
}
