// api/removeBgVideo.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { uploadsDir } from "../lib/uploads-dir.ts";

const router = express.Router();
const upload = multer({ dest: uploadsDir });

const API_KEY = process.env.VIDEO_BG_REMOVER_KEY;
const PUBLIC_BASE = process.env.BACKEND_URL; // e.g. https://xxxx.ngrok-free.app

if (!API_KEY) console.error("❌ Missing VIDEO_BG_REMOVER_KEY");
if (!PUBLIC_BASE) console.error("❌ Missing BACKEND_URL");

/* ---------------- Poll Status ---------------- */
async function pollStatus(
  jobId: string,
  timeoutMs = 120000,
  uploadedStuckLimit = 25
): Promise<string> {
  const startedAt = Date.now();
  let uploadedCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const statusRes = await fetch(
      `https://api.videobgremover.com/v1/jobs/${jobId}/status`,
      { headers: { "X-Api-Key": API_KEY! } }
    );
    const raw = await statusRes.text();
    let statusJson: any = null;
    try {
      statusJson = JSON.parse(raw);
    } catch {
      console.log("⚠️ Status non-JSON response, keep polling");
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    if (statusJson.status === "completed") {
      console.log("✅ Remove BG Done");
      return (
        statusJson.processed_video_url ||
        statusJson.processed_png_sequence_url ||
        statusJson.processed_png_zip_url ||
        statusJson.processed_zip_url ||
        statusJson.processed_archive_url ||
        statusJson.processed_url
      ); // ⚠️ 臨時 URL
    }

    if (statusJson.status === "failed") {
      throw new Error("❌ Remove BG Failed");
    }

    if (statusJson.status === "uploaded") {
      uploadedCount += 1;
      if (uploadedCount >= uploadedStuckLimit) {
        throw new Error("uploaded_stuck");
      }
    } else {
      uploadedCount = 0;
    }

    console.log("⏳ Processing:", statusJson.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Remove BG polling timeout");
}

/* ---------------- Download video and save locally ---------------- */
async function downloadToLocal(url: string) {
  console.log("⬇️ Downloading processed video:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error("❌ Failed to download processed video");

  const buffer = Buffer.from(await res.arrayBuffer());

  const filename = `video_${Date.now()}.webm`;
  const savePath = path.join(uploadsDir, filename);

  // Save to local /uploads folder
  fs.writeFileSync(savePath, buffer);

  // Permanent public URL
  const publicUrl = `${PUBLIC_BASE}/uploads/${filename}`;

  console.log("📦 Saved to:", savePath);
  console.log("🌍 Public URL:", publicUrl);

  return publicUrl;
}

async function downloadZipAndExtractToSequence(url: string, publicBase: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("❌ Failed to download processed zip");
  const buffer = Buffer.from(await res.arrayBuffer());

  const seqId = crypto.createHash("md5").update(`${url}|${Date.now()}`).digest("hex");
  const seqRoot = path.join(uploadsDir, "sequences", seqId);
  const framesDir = path.join(seqRoot, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const zipPath = path.join(seqRoot, "sequence.zip");
  fs.writeFileSync(zipPath, buffer);

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(framesDir, true);
  } catch (e) {
    throw new Error(`zip extract failed: ${e instanceof Error ? e.message : "unknown"}`);
  }

  const frameFiles = fs
    .readdirSync(framesDir)
    .filter((f) => /\.(png)$/i.test(f))
    .sort();
  if (!frameFiles.length) throw new Error("No PNG frames found in zip");

  // Rename frames to standard pattern for simpler playback.
  frameFiles.forEach((file, idx) => {
    const next = `frame_${String(idx + 1).padStart(4, "0")}.png`;
    const from = path.join(framesDir, file);
    const to = path.join(framesDir, next);
    if (from !== to) fs.renameSync(from, to);
  });

  const manifest = {
    id: seqId,
    fps: 15,
    frameCount: frameFiles.length,
    folderUrl: `${publicBase}/uploads/sequences/${seqId}/frames`,
    pattern: "frame_%04d.png",
  };

  const manifestPath = path.join(seqRoot, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return `${publicBase}/uploads/sequences/${seqId}/manifest.json`;
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
        return res.status(500).json({ error: "Missing BACKEND_URL" });
      }

      // ⚠️ MUST use your BACKEND_URL for public access
      videoUrl = `${PUBLIC_BASE}/uploads/${path.basename(tempFilePath)}`;
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

    /* ---------- 开始处理（先试 png_sequence，失败回退 webm） ---------- */
    const startJob = async (transparentFormat: string) => {
      const r = await fetch(`https://api.videobgremover.com/v1/jobs/${jobId}/start`, {
        method: "POST",
        headers: {
          "X-Api-Key": API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          background: {
            type: "transparent",
            transparent_format: transparentFormat,
          },
        }),
      });
      const text = await r.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return { ok: r.ok, status: r.status, json };
    };

    let mode: "png_sequence" | "webm_vp9" = "png_sequence";
    let startResp = await startJob(mode);
    if (!startResp.ok) {
      console.log("⚠️ png_sequence start failed, fallback to webm_vp9", startResp);
        mode = "webm_vp9";
        startResp = await startJob(mode);
      }
    if (!startResp.ok) {
      return res.status(500).json({
        error: "Failed to start processing",
        detail: startResp,
      });
    }

    console.log(`🌀 Processing started with mode: ${mode}`);

    /* ---------- 轮询 ---------- */
    let temporaryUrl: string;
    try {
      temporaryUrl = await pollStatus(jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "uploaded_stuck" && mode === "png_sequence") {
        console.log("⚠️ uploaded stuck in zip mode, retry start with webm_vp9");
        const retry = await startJob("webm_vp9");
        if (!retry.ok) {
          return res.status(500).json({
            error: "Processing stuck and fallback start failed",
            detail: retry,
          });
        }
        mode = "webm_vp9";
        temporaryUrl = await pollStatus(jobId, 120000, 25);
      } else {
        throw e;
      }
    }

    /* ---------- 删除临时上传文件 ---------- */
    if (tempFilePath) {
      fs.unlink(tempFilePath, () =>
        console.log("🧹 Deleted temp:", tempFilePath)
      );
    }

    /* ---------- ⚡ 下載到後端，生成永久網址 ---------- */
    const isZip = /\.zip($|\?)/i.test(temporaryUrl);
    if (isZip) {
      const sequenceManifestUrl = await downloadZipAndExtractToSequence(temporaryUrl, PUBLIC_BASE!);
      return res.json({ sequenceManifestUrl, transparentUrl: "" });
    }

    if (mode === "png_sequence") {
      // Some providers return a folder/listing endpoint for png sequence.
      // Persist as-is so frontend can request manifest/sequence conversion if needed.
      return res.json({ sequenceManifestUrl: temporaryUrl, transparentUrl: "" });
    }

    const permanentUrl = await downloadToLocal(temporaryUrl);
    return res.json({ transparentUrl: permanentUrl, sequenceManifestUrl: null });
  } catch (err) {
    console.error("❌ Remove background failed:", err);
    res.status(500).json({ error: "Remove background failed" });
  }
});

export default router;
