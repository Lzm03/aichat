import express from "express";
import crypto from "crypto";
import { pool } from "../db.ts";
import {
  type AppRole,
  DEFAULT_MONTHLY_CREDIT_LIMIT,
  DEFAULT_USER_PREFERENCES,
  ensurePlatformTables,
  findUserByEmail,
  getBearerToken,
  hashPassword,
  getUserFeatureSummary,
  maybeAssignLegacyDataByEmail,
  normalizeUserPreferences,
  recordFeatureUsage,
  resetOwnFeatureUsage,
  listAccountsForAdmin,
  sanitizeUser,
  setUserFeatureLimit,
  setUserFeatureUsage,
  signToken,
  verifyPassword,
  verifyToken,
  findUserById,
  resetFeatureUsageForUser,
} from "../lib/platform-auth.ts";

const router = express.Router();

function issueAuthResponse(row: any) {
  const token = signToken({
    sub: row.id,
    email: row.email,
    role: row.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return {
    token,
    user: sanitizeUser(row),
  };
}

router.post("/register", async (req, res) => {
  const fullName = String(req.body?.fullName || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "teacher").trim() as AppRole;
  const avatarUrl = String(req.body?.avatarUrl || "").trim();

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "fullName, email and password are required" });
  }
  if (!["teacher", "student", "admin"].includes(role)) {
    return res.status(400).json({ error: "role must be teacher, student or admin" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  try {
    await ensurePlatformTables();
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "email already registered" });
    }

    const result = await pool.query(
      `
        INSERT INTO users (
          id, full_name, email, role, avatar_url, preferences_json, password_hash,
          status, plan_name, monthly_credit_limit, credit_balance, credit_used
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'active', 'starter', $8, $8, 0)
        RETURNING id, full_name, email, role, avatar_url, preferences_json, created_at, status, plan_name, monthly_credit_limit, credit_balance, credit_used
      `,
      [
        crypto.randomUUID(),
        fullName,
        email,
        role,
        avatarUrl || null,
        JSON.stringify(DEFAULT_USER_PREFERENCES),
        hashPassword(password),
        DEFAULT_MONTHLY_CREDIT_LIMIT,
      ]
    );

    await maybeAssignLegacyDataByEmail(email);

    return res.status(201).json(issueAuthResponse(result.rows[0]));
  } catch (error) {
    console.error("POST /api/auth/register failed:", error);
    return res.status(500).json({ error: "failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "invalid email or password" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ error: "account disabled" });
    }

    await maybeAssignLegacyDataByEmail(email);

    const freshUser = await findUserById(user.id);
    return res.json(issueAuthResponse(freshUser || user));
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return res.status(500).json({ error: "failed to login" });
  }
});

router.get("/me", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  try {
    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json({ user: sanitizeUser(user), features: await getUserFeatureSummary(user.id) });
  } catch (error) {
    console.error("GET /api/auth/me failed:", error);
    return res.status(500).json({ error: "failed to load current user" });
  }
});

router.get("/features", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  try {
    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json({ features: await getUserFeatureSummary(user.id) });
  } catch (error) {
    console.error("GET /api/auth/features failed:", error);
    return res.status(500).json({ error: "failed to load feature limits" });
  }
});

router.post("/features/:key/consume", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  try {
    const amount = Math.max(1, Number(req.body?.amount || 1));
    const features = await recordFeatureUsage(payload.sub, req.params.key as any, amount, req.body?.meta || {});
    return res.json({ ok: true, features });
  } catch (error) {
    console.error("POST /api/auth/features/:key/consume failed:", error);
    return res.status((error as any)?.status || 500).json({ error: (error as any)?.message || "failed to consume feature" });
  }
});

router.post("/features/reset", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  try {
    return res.json({ ok: true, features: await resetOwnFeatureUsage(payload.sub) });
  } catch (error) {
    console.error("POST /api/auth/features/reset failed:", error);
    return res.status((error as any)?.status || 500).json({ error: (error as any)?.message || "failed to reset features" });
  }
});

router.put("/profile", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  const fullName = String(req.body?.fullName || "").trim();
  const avatarUrl = String(req.body?.avatarUrl || "").trim();
  const nextEmail = String(req.body?.email || "").trim().toLowerCase();
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!fullName) {
    return res.status(400).json({ error: "fullName is required" });
  }

  try {
    const currentUserResult = await pool.query(
      `SELECT id, full_name, email, role, avatar_url, preferences_json, password_hash, created_at, status, plan_name, monthly_credit_limit, credit_balance, credit_used
       FROM users
       WHERE id=$1`,
      [payload.sub]
    );
    const currentUser = currentUserResult.rows[0];
    if (!currentUser) {
      return res.status(404).json({ error: "user not found" });
    }

    const preferences = normalizeUserPreferences(
      req.body?.preferences === undefined ? currentUser.preferences_json || {} : req.body?.preferences || {}
    );

    const shouldUpdateEmail = nextEmail && nextEmail !== currentUser.email;
    const shouldUpdatePassword = Boolean(newPassword);

    if (shouldUpdateEmail || shouldUpdatePassword) {
      if (!currentPassword || !verifyPassword(currentPassword, (currentUser as any).password_hash)) {
        return res.status(401).json({ error: "current password is incorrect" });
      }
    }

    if (shouldUpdateEmail) {
      const existing = await findUserByEmail(nextEmail);
      if (existing && existing.id !== payload.sub) {
        return res.status(409).json({ error: "email already registered" });
      }
    }

    if (shouldUpdatePassword && newPassword.length < 8) {
      return res.status(400).json({ error: "new password must be at least 8 characters" });
    }

    const result = await pool.query(
      `UPDATE users
       SET full_name=$1,
           email=$2,
           avatar_url=$3,
           preferences_json=$4::jsonb,
           password_hash=CASE WHEN $5 <> '' THEN $6 ELSE password_hash END,
           updated_at=NOW()
       WHERE id=$7
       RETURNING id, full_name, email, role, avatar_url, preferences_json, created_at, status, plan_name, monthly_credit_limit, credit_balance, credit_used`,
      [
        fullName,
        shouldUpdateEmail ? nextEmail : currentUser.email,
        avatarUrl || null,
        JSON.stringify(preferences),
        newPassword,
        shouldUpdatePassword ? hashPassword(newPassword) : "",
        payload.sub,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    console.error("PUT /api/auth/profile failed:", error);
    return res.status(500).json({ error: "failed to update profile" });
  }
});

router.get("/admin/accounts", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid or expired token" });

  try {
    return res.json({ accounts: await listAccountsForAdmin(payload.sub) });
  } catch (error) {
    return res.status((error as any)?.status || 500).json({ error: (error as any)?.message || "failed to load accounts" });
  }
});

router.post("/admin/accounts/:userId/reset-features", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid or expired token" });

  try {
    return res.json({ ok: true, features: await resetFeatureUsageForUser(payload.sub, req.params.userId) });
  } catch (error) {
    return res.status((error as any)?.status || 500).json({ error: (error as any)?.message || "failed to reset account features" });
  }
});

router.put("/admin/accounts/:userId/features/:key", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid or expired token" });

  try {
    const used = Math.max(0, Number(req.body?.used || 0));
    return res.json({
      ok: true,
      features: await setUserFeatureUsage(payload.sub, req.params.userId, req.params.key as any, used),
    });
  } catch (error) {
    return res.status((error as any)?.status || 500).json({ error: (error as any)?.message || "failed to update feature usage" });
  }
});

router.put("/admin/accounts/:userId/features/:key/limit", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid or expired token" });

  try {
    const limit = Math.max(0, Number(req.body?.limit ?? 0));
    return res.json({
      ok: true,
      features: await setUserFeatureLimit(payload.sub, req.params.userId, req.params.key as any, limit),
    });
  } catch (error) {
    return res.status((error as any)?.status || 500).json({ error: (error as any)?.message || "failed to update feature limit" });
  }
});

export default router;
