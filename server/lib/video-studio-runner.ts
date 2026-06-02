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
const DEFAULT_STYLE_PROMPT =
  "Use the small-movement style. Keep the animation extremely restrained and natural. Allow only tiny micro-movements in the face, mouth, and head, with minimal pose variation. Avoid expressive gestures, large motion arcs, exaggerated acting, or noticeable body movement.";
const LOOP_PROMPT_SUFFIX =
  "Create a seamless looping animation. The final frame must return as close as possible to the first frame, with matching body pose, head angle, character position, camera framing, subject scale, and overall composition. Motion must form a smooth closed cycle with no visible jump when the clip restarts. Do not end with a hold, stop, reset, or abrupt pose change. Keep the camera fully locked and keep body translation near zero so the ending flows naturally back into the beginning. Favor very small, smooth, low-amplitude motion over expressive or dramatic movement.";
const SLOT_PROMPTS: Record<VideoStudioSlotKey, string> = {
  idle:
    "Silent idle only. Character stands in place with both feet planted at exactly the same position. No walking, no stepping, no body translation, and no turn-and-shift. Mouth must stay naturally closed for the entire clip: no speech, no lip-sync, no mouth opening, no visible teeth, no tongue, and no jaw rhythm. Keep the body almost perfectly still. Do not move the head, neck, shoulders, torso, arms, hands, or posture. Do not sway, nod, tilt, lean, gesture, or shift weight. The only allowed motion is tiny eye movement and occasional natural blinking. Breathing must be imperceptible or nearly imperceptible. Keep all motion extremely small and smooth, with no expressive acting. Camera must be fully locked: no zoom, no pan, no dolly, and no shake. Background must be pure bright chroma key green, close to RGB 0,255,0, as a single uniform solid color with no gradient, no texture, no shadow, no reflection, no noise, and no background objects. The subject must have no green spill and no green edge halo. Edges must be crisp and clean for keying, including hair strands, fingers, and clothing contours. If constraints conflict, priority order is: no speaking > no body movement > eyes only > locked camera > green screen purity.",
  speaking:
    "Speaking mode with restrained lip-sync only. Character stands in place with both feet planted at exactly the same position. No walking, no stepping, no body translation, and no turn-and-shift. Arms, hands, fingers, shoulders, torso, hips, legs, and posture must stay completely still. Do not gesture, wave, raise hands, move arms, shift weight, sway, lean, nod, or perform any body acting. Natural speech lip-sync is allowed only through small, controlled mouth movement. Keep mouth opening narrow and modest: no wide-open mouth, no exaggerated jaw drop, no visible teeth, no tongue, no shouting expression, and no large facial acting. Lips should move subtly as if speaking softly. Only tiny head micro-movements, very small facial changes, and natural blinking are allowed. Camera must be fully locked: no zoom, no pan, no dolly, and no shake. Background must be pure bright chroma key green, close to RGB 0,255,0, as a single uniform solid color with no gradient, no texture, no shadow, no reflection, no noise, and no background objects. The subject must have no green spill and no green edge halo. Edges must be crisp and clean for keying, including hair strands, fingers, and clothing contours. If constraints conflict, priority order is: no body movement > restrained mouth-only lip-sync > stable framing > green screen purity.",
  thinking:
    "Thinking mode, silent. Character stands in place with both feet planted at exactly the same position. No walking, no stepping, no body translation, and no turn-and-shift. No speech and no lip-sync. Mouth stays closed with no speaking-related jaw rhythm. Keep the body almost perfectly still. Do not move the shoulders, torso, arms, hands, or posture. Avoid dramatic pondering, large head turns, obvious nods, expressive gestures, or visible body motion. Allowed actions are only extremely subtle thinking cues: tiny eye movement, a very slight brow change, and a brief soft upward glance. Head movement should be absent or nearly absent, with no visible tilt unless absolutely minimal. Camera must be fully locked: no zoom, no pan, no dolly, and no shake. Background must be pure bright chroma key green, close to RGB 0,255,0, as a single uniform solid color with no gradient, no texture, no shadow, no reflection, no noise, and no background objects. The subject must have no green spill and no green edge halo. Edges must be crisp and clean for keying, including hair strands, fingers, and clothing contours. If constraints conflict, priority order is: no speaking > no body movement > tiny eye and brow motion only > locked camera > green screen purity.",
};
const TEST_HINT_VIDEOS: Record<VideoStudioSlotKey, string> = {
  idle: "/hint-videos/idle.mp4",
  speaking: "/hint-videos/speaking.mp4",
  thinking: "/hint-videos/thinking.mp4",
};

type VideoBgJobResponse = {
  id?: string;
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
  loopFrameMode?: boolean | null;
}) {
  const buildPayload = (loopFrameMode = false) => {
    const payload: Record<string, any> = {
      prompt: loopFrameMode
        ? `${params.prompt}\n\nLoop frame constraint: treat the source image as both the first-frame anchor and the intended final-frame target. The clip must animate away from this pose and return to the same still pose by the final frame.`
        : params.prompt,
      model: "grok-imagine-video",
    };
    if (loopFrameMode) {
      payload.reference_images = [{ url: params.imageUrl }, { url: params.imageUrl }];
    } else {
      payload.image = { url: params.imageUrl };
    }
    if (params.duration) payload.duration = Number(params.duration);
    const normalizedAspectRatio = normalizeAspectRatio(params.aspectRatio);
    if (normalizedAspectRatio) payload.aspect_ratio = normalizedAspectRatio;
    if (params.resolution) payload.resolution = params.resolution;
    return payload;
  };

  const postPayload = async (payload: Record<string, any>) => {
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
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`invalid grok create response: ${text.slice(0, 180)}`);
    }
    if (!json?.request_id) throw new Error("missing request_id");
    return json.request_id as string;
  };

  if (params.loopFrameMode) {
    try {
      return await postPayload(buildPayload(true));
    } catch (error) {
      console.warn(
        "⚠️ Loop-frame payload rejected, falling back to standard image-to-video:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return postPayload(buildPayload(false));
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
      error: `invalid grok polling response: ${text.slice(0, 180) || "empty response"}`,
    };
  }
  if (data.video?.url) return { status: "completed", url: data.video.url };
  if (data.error || data.status === "failed") {
    return { status: "failed", error: toErrorMessage(data.error ?? data) };
  }
  return { status: "processing" };
}

const VIDEO_GENERATION_TIMEOUT_MS = Number.parseInt(process.env.VIDEO_GENERATION_TIMEOUT_MS || "", 10) || 480000;
const VIDEO_GENERATION_POLL_INTERVAL_MS =
  Number.parseInt(process.env.VIDEO_GENERATION_POLL_INTERVAL_MS || "", 10) || 2000;

async function pollVideoResult(requestId: string, timeoutMs = VIDEO_GENERATION_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchVideoResult(requestId);
    if (result.status === "completed" && result.url) return result.url;
    if (result.status === "failed") throw new Error(toErrorMessage(result.error || "video generation failed"));
    await new Promise((resolve) => setTimeout(resolve, VIDEO_GENERATION_POLL_INTERVAL_MS));
  }
  throw new Error(`video generation timeout after ${Math.round(timeoutMs / 1000)}s`);
}

const REMOVE_BG_TIMEOUT_MS = Number.parseInt(process.env.VIDEO_BG_TIMEOUT_MS || "", 10) || 600000;
const REMOVE_BG_POLL_INTERVAL_MS = Number.parseInt(process.env.VIDEO_BG_POLL_INTERVAL_MS || "", 10) || 3000;

async function pollRemoveBgStatus(
  jobId: string,
  timeoutMs = REMOVE_BG_TIMEOUT_MS,
  uploadedStuckLimit = Math.ceil(90000 / REMOVE_BG_POLL_INTERVAL_MS)
): Promise<string> {
  const startedAt = Date.now();
  let uploadedCount = 0;
  let lastStatus = "unknown";
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

    lastStatus = String(statusJson.status || "unknown");
    if (statusJson.status === "completed") {
      const processedUrl =
        statusJson.processed_video_url ||
        statusJson.processed_png_sequence_url ||
        statusJson.processed_png_zip_url ||
        statusJson.processed_zip_url ||
        statusJson.processed_archive_url ||
        statusJson.processed_url;
      if (processedUrl) return processedUrl;
      throw new Error("remove bg completed without processed url");
    }
    if (statusJson.status === "failed") throw new Error("remove bg failed");
    if (statusJson.status === "uploaded") {
      uploadedCount += 1;
      if (uploadedCount >= uploadedStuckLimit) throw new Error("uploaded_stuck");
    } else {
      uploadedCount = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, REMOVE_BG_POLL_INTERVAL_MS));
  }
  throw new Error(`remove bg timeout after ${Math.round(timeoutMs / 1000)}s (last status: ${lastStatus})`);
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
  const jobJson = (await jobRes.json()) as VideoBgJobResponse;
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
      temporaryUrl = await pollRemoveBgStatus(jobId, REMOVE_BG_TIMEOUT_MS, Math.ceil(90000 / REMOVE_BG_POLL_INTERVAL_MS));
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
        const stylePrompt = DEFAULT_STYLE_PROMPT;
        const imageInput = options?.imageInput || (await ensureImageInputForGeneration(task.sourceImageUrl));
        requestId = await createVideoRequest({
          prompt: `${stylePrompt} ${SLOT_PROMPTS[slotKey]} ${LOOP_PROMPT_SUFFIX}`,
          imageUrl: imageInput,
          aspectRatio: task.sourceAspectRatio,
          resolution: "480p",
          duration: "2",
          preset: "small_movement",
          loopFrameMode: slotKey === "idle" || slotKey === "thinking",
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
