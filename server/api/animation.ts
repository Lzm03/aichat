import express from "express";
import type { Request, Response } from "express";
import fetch from "node-fetch";

/* =======================================================
   类型定义
======================================================= */
interface CreateVideoParams {
  prompt: string;
  imageUrl?: string | null;
  duration?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
}

interface GenerateResponse {
  request_id: string;
}

interface GrokVideoResult {
  status: "completed" | "failed" | "processing";
  url?: string;
  error?: string;
}

const SUPPORTED_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

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

/* =======================================================
   1. 发起 Grok 视频生成
======================================================= */
async function createVideoRequest({
  prompt,
  imageUrl,
  duration,
  aspectRatio,
  resolution,
}: CreateVideoParams): Promise<GenerateResponse> {

  /* ⭐ Grok payload 结构 */
  const payload: Record<string, any> = {
    prompt,
    model: "grok-imagine-video",
  };

  if (imageUrl) {
    payload.image = { url: imageUrl }; // ⭐ 核心
  }
  if (duration) payload.duration = Number(duration);
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedAspectRatio) payload.aspect_ratio = normalizedAspectRatio;
  if (resolution) payload.resolution = resolution;

  console.log("🔥 [Grok Payload Sending]", payload);

  const res = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("❌ Grok API Error:", text);
    throw new Error(text);
  }

  const json = JSON.parse(text);
  console.log("🎉 Grok CreateVideo Response:", json);

  return json as GenerateResponse;
}

/* =======================================================
   2. 获取 Grok 视频生成结果
======================================================= */
async function fetchVideoResult(requestId: string): Promise<GrokVideoResult> {
  const res = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
  });

  const text = await res.text();
  const data = JSON.parse(text);

  console.log("🔍 [Grok Polling]", data);

  if (data.video?.url) {
    return { status: "completed", url: data.video.url };
  }

  if (data.error || data.status === "failed") {
    return { status: "failed", error: data.error ?? "Unknown error" };
  }

  return { status: "processing" };
}

/* =======================================================
   Express Router
======================================================= */
const router = express.Router();

/* -------------------------------------------------------
   POST /api/video/generate
   ⭐ 接收 JSON（不是 multipart）
------------------------------------------------------- */
router.post(
  "/generate",
  async (req: Request<{}, {}, CreateVideoParams>, res: Response) => {
    try {
      console.log("📥 Incoming Generate Request:", req.body);

      const { prompt, duration, aspectRatio, resolution, imageUrl } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }

      const result = await createVideoRequest({
        prompt,
        imageUrl,
        duration,
        aspectRatio,
        resolution,
      });

      return res.json({
        success: true,
        request_id: result.request_id,
      });

    } catch (err: any) {
      console.error("❌ Video Generate Failed:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/* -------------------------------------------------------
   GET /api/video/result/:id
------------------------------------------------------- */
router.get(
  "/result/:id",
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const result = await fetchVideoResult(req.params.id);
      return res.json(result);
    } catch (err: any) {
      console.error("❌ Video Result Error:", err.message);
      return res.status(500).json({ error: "Result fetch failed" });
    }
  }
);

export default router;
