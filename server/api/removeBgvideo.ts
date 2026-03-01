// api/removeBgVideo.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const API_KEY = process.env.VIDEO_BG_REMOVER_KEY;
const PUBLIC_BASE = process.env.BACKEND_URL;  // ⭐ 加载 ngrok

if (!API_KEY) console.error("❌ Missing VIDEO_BG_REMOVER_KEY");
if (!PUBLIC_BASE) console.error("❌ Missing PUBLIC_BASE_URL");

/* ---------------- Poll Status ---------------- */
async function pollStatus(jobId: string): Promise<string> {
  while (true) {
    const statusRes = await fetch(
      `https://api.videobgremover.com/v1/jobs/${jobId}/status`,
      { headers: { "X-Api-Key": API_KEY! } }
    );
    const statusJson: any = await statusRes.json();

    if (statusJson.status === "completed") {
      console.log("✅ Remove BG Done");
      return statusJson.processed_video_url;
    }
    if (statusJson.status === "failed") {
      throw new Error("❌ Remove BG Failed");
    }

    console.log("⏳ Processing:", statusJson.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/* ---------------- Main Upload Route ---------------- */
router.post("/remove-bg", upload.single("file"), async (req, res) => {
  try {
    let videoUrl: string | null = null;
    let tempFilePath: string | null = null;

    /* ---------- URL 模式 ---------- */
    if (req.body?.url) {
      videoUrl = req.body.url;
      console.log("🔥 URL Mode:", videoUrl);
    }

    /* ---------- 文件模式 ---------- */
    if (req.file) {
      tempFilePath = req.file.path;
      console.log("🔥 File Mode:", tempFilePath);

      if (!PUBLIC_BASE) {
        return res.status(500).json({ error: "Missing PUBLIC_BASE_URL" });
      }

      // ⭐ 关键修改：使用 ngrok URL，而不是 localhost URL
      videoUrl = `${PUBLIC_BASE}/${tempFilePath}`;
      console.log("🌍 Public URL:", videoUrl);
    }

    if (!videoUrl) {
      return res.status(400).json({ error: "Missing video url or file" });
    }

    console.log("🎬 Sending to VideoBGRemover:", videoUrl);

    /* ---------- 创建任务 ---------- */
    const jobRes = await fetch("https://api.videobgremover.com/v1/jobs", {
      method: "POST",
      headers: {
        "X-Api-Key": API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ video_url: videoUrl }),
    });

    const jobJson = await jobRes.json();
    console.log("📥 Job Response:", jobJson);

    if (!jobRes.ok || !jobJson.id) {
      console.error("❌ Create job failed");
      return res.status(500).json(jobJson);
    }

    const jobId = jobJson.id;

    /* ---------- 开始处理 ---------- */
    await fetch(`https://api.videobgremover.com/v1/jobs/${jobId}/start`, {
      method: "POST",
      headers: {
        "X-Api-Key": API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        background: {
          type: "transparent",
          transparent_format: "webm_vp9",
        },
      }),
    });

    console.log("🌀 Processing started…");

    /* ---------- 轮询 ---------- */
    const transparentUrl = await pollStatus(jobId);

    /* ---------- 删除临时文件 ---------- */
    if (tempFilePath) {
      fs.unlink(tempFilePath, () =>
        console.log("🧹 Deleted temp:", tempFilePath)
      );
    }

    /* ---------- 返回透明视频 ---------- */
    return res.json({ transparentUrl });
  } catch (err) {
    console.error("❌ Remove background failed:", err);
    res.status(500).json({ error: "Remove background failed" });
  }
});

export default router;