import crypto from "crypto";
import { pool } from "../db.ts";
import { ensurePlatformTables } from "./platform-auth.ts";

export type VideoStudioSlotKey = "idle" | "speaking" | "thinking";
export type VideoStudioSlotStatus =
  | "pending"
  | "generating"
  | "remove_bg_done"
  | "ready"
  | "failed";

export type VideoStudioTaskSlot = {
  status: VideoStudioSlotStatus;
  requestId?: string | null;
  originalVideoUrl?: string | null;
  resultUrl?: string | null;
  error?: string | null;
  updatedAt?: string | null;
};

export type VideoStudioTask = {
  id: string;
  userId: string;
  sourceImageUrl: string;
  preset: string;
  sourceAspectRatio: string | null;
  status: "pending" | "generating" | "remove_bg_done" | "ready" | "failed";
  slots: Record<VideoStudioSlotKey, VideoStudioTaskSlot>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function defaultSlots(): Record<VideoStudioSlotKey, VideoStudioTaskSlot> {
  return {
    idle: { status: "pending" },
    speaking: { status: "pending" },
    thinking: { status: "pending" },
  };
}

function normalizeSlot(slot: any): VideoStudioTaskSlot {
  return {
    status: (slot?.status || "pending") as VideoStudioSlotStatus,
    requestId: slot?.requestId || null,
    originalVideoUrl: slot?.originalVideoUrl || null,
    resultUrl: slot?.resultUrl || null,
    error: slot?.error || null,
    updatedAt: slot?.updatedAt || null,
  };
}

function normalizeTask(row: any): VideoStudioTask | null {
  if (!row) return null;
  const slots = row.slots || {};
  return {
    id: row.id,
    userId: row.user_id,
    sourceImageUrl: row.source_image_url,
    preset: row.preset,
    sourceAspectRatio: row.source_aspect_ratio || null,
    status: row.status,
    slots: {
      idle: normalizeSlot(slots.idle),
      speaking: normalizeSlot(slots.speaking),
      thinking: normalizeSlot(slots.thinking),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null,
  };
}

export async function createVideoStudioTask(params: {
  userId: string;
  sourceImageUrl: string;
  preset: string;
  sourceAspectRatio?: string | null;
}) {
  await ensurePlatformTables();
  const result = await pool.query(
    `INSERT INTO video_studio_tasks
      (id, user_id, source_image_url, preset, source_aspect_ratio, status, slots)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
     RETURNING *`,
    [
      crypto.randomUUID(),
      params.userId,
      params.sourceImageUrl,
      params.preset,
      params.sourceAspectRatio || null,
      JSON.stringify(defaultSlots()),
    ]
  );
  return normalizeTask(result.rows[0]);
}

export async function getLatestVideoStudioTask(userId: string) {
  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT *
     FROM video_studio_tasks
     WHERE user_id=$1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId]
  );
  return normalizeTask(result.rows[0]);
}

export async function getVideoStudioTaskById(taskId: string, userId: string) {
  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT *
     FROM video_studio_tasks
     WHERE id=$1 AND user_id=$2
     LIMIT 1`,
    [taskId, userId]
  );
  return normalizeTask(result.rows[0]);
}

export async function updateVideoStudioTaskSlot(params: {
  taskId: string;
  userId: string;
  slotKey: VideoStudioSlotKey;
  patch: Partial<VideoStudioTaskSlot>;
  taskStatus?: VideoStudioTask["status"];
}) {
  const existing = await getVideoStudioTaskById(params.taskId, params.userId);
  if (!existing) return null;

  const nextSlots = {
    ...existing.slots,
    [params.slotKey]: {
      ...existing.slots[params.slotKey],
      ...params.patch,
      updatedAt: new Date().toISOString(),
    },
  };

  const slotStatuses = Object.values(nextSlots).map((slot) => slot.status);
  const inferredStatus =
    params.taskStatus ||
    (slotStatuses.every((status) => status === "ready" || status === "remove_bg_done")
      ? "ready"
      : slotStatuses.some((status) => status === "failed")
      ? "failed"
      : slotStatuses.some((status) => status === "remove_bg_done")
      ? "remove_bg_done"
      : slotStatuses.some((status) => status === "generating")
      ? "generating"
      : "pending");

  const completedAt = inferredStatus === "ready" ? new Date().toISOString() : null;

  const result = await pool.query(
    `UPDATE video_studio_tasks
     SET slots=$1::jsonb,
         status=$2,
         completed_at=$3,
         updated_at=NOW()
     WHERE id=$4 AND user_id=$5
     RETURNING *`,
    [JSON.stringify(nextSlots), inferredStatus, completedAt, params.taskId, params.userId]
  );
  return normalizeTask(result.rows[0]);
}
