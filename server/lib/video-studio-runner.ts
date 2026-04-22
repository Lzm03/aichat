import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { uploadsDir } from "./uploads-dir.ts";
import {
  getVideoStudioTaskById,
  updateVideoStudioTaskSlot,
  type VideoStudioSlotKey,
} from "./video-studio-tasks.ts";
import { pool } from "../db.ts";

const SUPPORTED_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const HINTS_BY_PRESET: Record<string, string> = {
  big_movement:
    "動作風格採用大動作版本，肢體與表情變化更明顯，但人物位置、鏡頭和綠幕背景仍需保持穩定一致。",
  small_movement:
    "動作風格採用小動作版本，以細微表情、口型和輕度姿態變化為主，整體更穩定克制。",
};
const SLOT_PROMPTS: Record<VideoStudioSlotKey, string> = {
  idle: "角色必須原地站定，雙腳固定在同一位置，禁止走動、踏步、位移、轉身移位。角色保持静止、自然呼吸、微微眨眼。相機完全固定，不縮放、不前後移動、不平移、不搖晃。只允許角色本身的輕微動作，不要移動取景框。背景必須始終為純亮綠色綠幕（chroma key green, RGB 0,255,0 附近），整個背景單一純色、均勻填滿、無漸層、無紋理、無雜訊、無陰影、無反光、無光斑、無景深模糊、無任何背景物件。人物身上不得出現綠色溢色、綠色反射或綠邊。人物邊緣清晰完整，頭髮絲、手指、衣服輪廓清楚可分割。",
  speaking:
    "角色必須原地站定，雙腳固定在同一位置，禁止走動、踏步、位移、轉身移位。角色自然張嘴說話，口型連貫、清晰。相機完全固定，不縮放、不推拉、不運鏡、不搖晃。保持角色在畫面中固定位置，只演示口型與表情。背景必須始終為純亮綠色綠幕（chroma key green, RGB 0,255,0 附近），整個背景單一純色、均勻填滿、無漸層、無紋理、無雜訊、無陰影、無反光、無光斑、無景深模糊、無任何背景物件。人物身上不得出現綠色溢色、綠色反射或綠邊。人物邊緣清晰完整，頭髮絲、手指、衣服輪廓清楚可分割。",
  thinking:
    "角色必須原地站定，雙腳固定在同一位置，禁止走動、踏步、位移、轉身移位。角色做出思考動作（抬頭、皱眉、輕微眼球運動）即可。相機固定鎖死，不前後移動、不左右平移、不縮放、不搖鏡。禁止鏡頭動畫，僅允許角色頭部小幅度動作。背景必須始終為純亮綠色綠幕（chroma key green, RGB 0,255,0 附近），整個背景單一純色、均勻填滿、無漸層、無紋理、無雜訊、無陰影、無反光、無光斑、無景深模糊、無任何背景物件。人物身上不得出現綠色溢色、綠色反射或綠邊。人物邊緣清晰完整，頭髮絲、手指、衣服輪廓清楚可分割。",
};
const TEST_HINT_VIDEOS: Record<VideoStudioSlotKey, string> = {
  idle: "/hint-videos/idle.mp4",
  speaking: "/hint-videos/speaking.mp4",
  thinking: "/hint-videos/thinking.mp4",
};

function toErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const maybeMessage =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
    if (maybeMessage.trim()) return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return "unknown error";
}

const activeRuns = new Map<string, Promise<void>>();

function normalizeAspectRatio(aspectRatio?: string | null): string | null {
  if (!aspectRatio) return null;
  if ((SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) {
    return aspectRatio;
  }
  const parts = aspectRatio.split(":").map((v) => Number(v));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const value = parts[0] / parts[1];
  const targets = [
    { ratio: "1:1", value: 1 },
    { ratio: "16:9", value: 16 / 9 },
    { ratio: "9:16", value: 9 / 16 },
    { ratio: "4:3", value: 4 / 3 },
    { ratio: "3:4", value: 3 / 4 },
    { ratio: "3:2", value: 3 / 2 },
    { ratio: "2:3", value: 2 / 3 },
  ] as const;
  let bestRatio: string = targets[0].ratio;
  let minDiff = Math.abs(value - targets[0].value);
  for (const t of targets) {
    const diff = Math.abs(value - t.value);
    if (diff < minDiff) {
      minDiff = diff;
      bestRatio = t.ratio;
    }
  }
  return bestRatio;
}

async function ensureImageInputForGeneration(sourceImageUrl: string) {
  if (!sourceImageUrl) {
    throw new Error("missing source image url");
  }
  if (sourceImageUrl.startsWith("https://") || sourceImageUrl.startsWith("data:")) {
    return sourceImageUrl;
  }

  const res = await fetch(sourceImageUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch source image: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function createVideoRequest(params: {
  prompt: string;
  imageUrl: string;
  aspectRatio?: string | null;
  resolution?: string | null;
  duration?: string | null;
  preset?: string | null;
}) {
  const payload: Record<string, any> = {
    prompt: params.prompt,
    model: "grok-imagine-video",
    image: { url: params.imageUrl },
  };
  if (params.duration) payload.duration = Number(params.duration);
  const normalizedAspectRatio = normalizeAspectRatio(params.aspectRatio);
  if (normalizedAspectRatio) payload.aspect_ratio = normalizedAspectRatio;
  if (params.resolution) payload.resolution = params.resolution;

  const res = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || "create video request failed");
  const json = JSON.parse(text);
  if (!json?.request_id) throw new Error("missing request_id");
  return json.request_id as string;
}

async function fetchVideoResult(requestId: string): Promise<{ status: "completed" | "failed" | "processing"; url?: string; error?: string }> {
  const res = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      status: "failed",
      error: text || "invalid upstream response",
    };
  }
  if (data.video?.url) return { status: "completed", url: data.video.url };
  if (data.error || data.status === "failed") {
    return { status: "failed", error: toErrorMessage(data.error ?? data) };
  }
  return { status: "processing" };
}

async function pollVideoResult(requestId: string, timeoutMs = 240000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchVideoResult(requestId);
    if (result.status === "completed" && result.url) return result.url;
    if (result.status === "failed") throw new Error(toErrorMessage(result.error || "video generation failed"));
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("video generation timeout");
}

async function pollRemoveBgStatus(jobId: string, timeoutMs = 120000, uploadedStuckLimit = 25): Promise<string> {
  const startedAt = Date.now();
  let uploadedCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const statusRes = await fetch(`https://api.videobgremover.com/v1/jobs/${jobId}/status`, {
      headers: { "X-Api-Key": process.env.VIDEO_BG_REMOVER_KEY! },
    });
    const raw = await statusRes.text();
    let statusJson: any = null;
    try {
      statusJson = JSON.parse(raw);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }

    if (statusJson.status === "completed") {
      return (
        statusJson.processed_video_url ||
        statusJson.processed_png_sequence_url ||
        statusJson.processed_png_zip_url ||
        statusJson.processed_zip_url ||
        statusJson.processed_archive_url ||
        statusJson.processed_url
      );
    }
    if (statusJson.status === "failed") throw new Error("remove bg failed");
    if (statusJson.status === "uploaded") {
      uploadedCount += 1;
      if (uploadedCount >= uploadedStuckLimit) throw new Error("uploaded_stuck");
    } else {
      uploadedCount = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("remove bg timeout");
}

async function downloadZipAndExtractToSequence(url: string, publicBase: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed to download processed zip");
  const buffer = Buffer.from(await res.arrayBuffer());
  const seqId = crypto.createHash("md5").update(`${url}|${Date.now()}`).digest("hex");
  const seqRoot = path.join(uploadsDir, "sequences", seqId);
  const framesDir = path.join(seqRoot, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const zipPath = path.join(seqRoot, "sequence.zip");
  fs.writeFileSync(zipPath, buffer);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(framesDir, true);

  const frameFiles = fs.readdirSync(framesDir).filter((f) => /\.(png)$/i.test(f)).sort();
  if (!frameFiles.length) throw new Error("No PNG frames found in zip");

  frameFiles.forEach((file, idx) => {
    const next = `frame_${String(idx + 1).padStart(4, "0")}.png`;
    const from = path.join(framesDir, file);
    const to = path.join(framesDir, next);
    if (from !== to) fs.renameSync(from, to);
  });

  const manifest = {
    id: seqId,
    fps: 25,
    frameCount: frameFiles.length,
    folderUrl: `${publicBase}/uploads/sequences/${seqId}/frames`,
    pattern: "frame_%04d.png",
  };

  const manifestPath = path.join(seqRoot, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return `${publicBase}/uploads/sequences/${seqId}/manifest.json`;
}

async function removeBgFromVideoUrl(sourceUrl: string, userId: string, options?: { skipCreditConsumption?: boolean }) {
  const jobRes = await fetch("https://api.videobgremover.com/v1/jobs", {
    method: "POST",
    headers: {
      "X-Api-Key": process.env.VIDEO_BG_REMOVER_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ video_url: sourceUrl }),
  });
  const jobJson = await jobRes.json();
  if (!jobRes.ok || !jobJson?.id) throw new Error("failed to create remove bg job");
  const jobId = jobJson.id as string;

  const startResp = await fetch(`https://api.videobgremover.com/v1/jobs/${jobId}/start`, {
    method: "POST",
    headers: {
      "X-Api-Key": process.env.VIDEO_BG_REMOVER_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      background: {
        type: "transparent",
        transparent_format: "png_sequence",
      },
    }),
  });
  if (!startResp.ok) throw new Error("failed to start remove bg processing");

  let temporaryUrl: string;
  try {
    temporaryUrl = await pollRemoveBgStatus(jobId);
  } catch (error) {
    if (error instanceof Error && error.message === "uploaded_stuck") {
      temporaryUrl = await pollRemoveBgStatus(jobId, 120000, 25);
    } else {
      throw error;
    }
  }

  const publicBase = process.env.BACKEND_URL;
  if (!publicBase) throw new Error("Missing BACKEND_URL");
  const isZip = /\.zip($|\?)/i.test(temporaryUrl);
  const resultUrl = isZip ? await downloadZipAndExtractToSequence(temporaryUrl, publicBase) : temporaryUrl;

  if (!options?.skipCreditConsumption) {
    await pool.query(
      `UPDATE user_feature_usage
       SET used = used + $1, updated_at = NOW()
       WHERE user_id = $2 AND feature_key = $3`,
      [20, userId, "remove_bg_video"]
    ).catch(() => undefined);
  }

  return resultUrl;
}

async function processSlot(
  taskId: string,
  userId: string,
  slotKey: VideoStudioSlotKey,
  options?: { skipCreditConsumption?: boolean; simulateHintVideos?: boolean; imageInput?: string }
) {
  try {
    const task = await getVideoStudioTaskById(taskId, userId);
    if (!task) throw new Error("task not found");

    const slot = task.slots[slotKey];
    if (slot.resultUrl && (slot.status === "ready" || slot.status === "remove_bg_done")) {
      return;
    }

    if (options?.simulateHintVideos) {
      await updateVideoStudioTaskSlot({
        taskId,
        userId,
        slotKey,
        patch: {
          status: "generating",
          requestId: `test-${slotKey}-${Date.now()}`,
          error: null,
        },
        taskStatus: "generating",
      });
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await updateVideoStudioTaskSlot({
        taskId,
        userId,
        slotKey,
        patch: {
          status: "remove_bg_done",
          requestId: `test-${slotKey}`,
          originalVideoUrl: TEST_HINT_VIDEOS[slotKey],
          resultUrl: TEST_HINT_VIDEOS[slotKey],
          error: null,
        },
      });
      return;
    }

    let requestId = slot.requestId || null;
    let originalVideoUrl = slot.originalVideoUrl || null;

    if (!originalVideoUrl) {
      if (!requestId) {
        const stylePrompt = HINTS_BY_PRESET[task.preset] || HINTS_BY_PRESET.big_movement;
        const imageInput = options?.imageInput || (await ensureImageInputForGeneration(task.sourceImageUrl));
        requestId = await createVideoRequest({
          prompt: `${stylePrompt} ${SLOT_PROMPTS[slotKey]}`,
          imageUrl: imageInput,
          aspectRatio: task.sourceAspectRatio,
          resolution: "480p",
          duration: "2",
          preset: task.preset,
        });
        await updateVideoStudioTaskSlot({
          taskId,
          userId,
          slotKey,
          patch: { status: "generating", requestId, error: null },
          taskStatus: "generating",
        });
      }
      originalVideoUrl = await pollVideoResult(requestId);
    }

    const resultUrl = await removeBgFromVideoUrl(originalVideoUrl, userId, options);
    await updateVideoStudioTaskSlot({
      taskId,
      userId,
      slotKey,
      patch: {
        status: "remove_bg_done",
        requestId,
        originalVideoUrl,
        resultUrl,
        error: null,
      },
    });
  } catch (error) {
    await updateVideoStudioTaskSlot({
      taskId,
      userId,
      slotKey,
      patch: {
        status: "failed",
        error: toErrorMessage(error),
      },
      taskStatus: "failed",
    }).catch(() => undefined);
    throw error;
  }
}

async function runTask(
  taskId: string,
  userId: string,
  options?: { skipCreditConsumption?: boolean; simulateHintVideos?: boolean }
) {
  const task = await getVideoStudioTaskById(taskId, userId);
  if (!task) throw new Error("task not found");
  const imageInput = options?.simulateHintVideos
    ? ""
    : await ensureImageInputForGeneration(task.sourceImageUrl);

  const jobs = (["idle", "speaking", "thinking"] as VideoStudioSlotKey[]).map((slotKey) =>
    processSlot(taskId, userId, slotKey, { ...options, imageInput })
  );
  const results = await Promise.allSettled(jobs);
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  if (failed) throw failed.reason;
}

export function startVideoStudioTask(
  taskId: string,
  userId: string,
  options?: { skipCreditConsumption?: boolean; simulateHintVideos?: boolean }
) {
  const existing = activeRuns.get(taskId);
  if (existing) return existing;

  const promise = runTask(taskId, userId, options)
    .catch((error) => {
      console.error("video studio task failed:", error);
    })
    .finally(() => {
      activeRuns.delete(taskId);
    });

  activeRuns.set(taskId, promise);
  return promise;
}

export function isVideoStudioTaskRunning(taskId: string) {
  return activeRuns.has(taskId);
}
