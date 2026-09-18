import express from "express";
import { pool } from "../db.ts";
import { ensurePlatformTables, getAuthUser, requireAuth } from "../lib/platform-auth.ts";

/** 帳戶層自訂主題版本分類標籤上限（docs/knowledge-map-topic-versions.md 第 3 節） */
export const MAX_CUSTOM_CATEGORY_LABELS = 10;
const MAX_LABEL_LENGTH = 12;

const router = express.Router();
router.use(requireAuth);

/** GET /api/teacher/topic-category-labels → 呢個老師自訂咗嘅分類標籤列表 */
router.get("/", async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const result = await pool.query(`SELECT topic_category_labels FROM users WHERE id=$1`, [user.id]);
    const labels = Array.isArray(result.rows[0]?.topic_category_labels)
      ? result.rows[0].topic_category_labels.map((item: unknown) => String(item))
      : [];
    return res.json({ labels });
  } catch (error) {
    console.error("GET /api/teacher/topic-category-labels failed:", error);
    return res.status(500).json({ error: "Failed to load category labels" });
  }
});

/** PUT /api/teacher/topic-category-labels {labels: string[]} → 全量覆寫（最多 10 個） */
router.put("/", async (req, res) => {
  try {
    await ensurePlatformTables();
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: "missing bearer token" });
    const raw = req.body?.labels;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ error: "labels array is required" });
    }
    const labels = [...new Set(raw.map((item: unknown) => String(item || "").trim()).filter(Boolean))];
    if (labels.length > MAX_CUSTOM_CATEGORY_LABELS) {
      return res.status(400).json({ error: `A maximum of ${MAX_CUSTOM_CATEGORY_LABELS} custom labels is allowed` });
    }
    for (const label of labels) {
      if (label.length > MAX_LABEL_LENGTH) {
        return res.status(400).json({ error: "Labels must be 12 characters or fewer" });
      }
    }
    await pool.query(
      `UPDATE users SET topic_category_labels=$2::jsonb, updated_at=NOW() WHERE id=$1`,
      [user.id, JSON.stringify(labels)]
    );
    return res.json({ labels });
  } catch (error) {
    console.error("PUT /api/teacher/topic-category-labels failed:", error);
    return res.status(500).json({ error: "Failed to save category labels" });
  }
});

export default router;
