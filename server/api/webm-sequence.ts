import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import fetch from "node-fetch";
import { execFile } from "child_process";
import { promisify } from "util";
import { uploadsDir } from "../lib/uploads-dir.ts";

const execFileAsync = promisify(execFile);
const router = express.Router();

type SeqManifest = {
  id: string;
  fps: number;
  frameCount: number;
  folderUrl: string;
  pattern: string;
};

export function getPublicBase(req: express.Request) {
  const envBase = process.env.BACKEND_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function resolveLocalVideoPath(videoUrl: string) {
  const base = process.env.BACKEND_URL?.trim()?.replace(/\/$/, "");
  if (base && videoUrl.startsWith(`${base}/uploads/`)) {
    const name = decodeURIComponent(videoUrl.split("/uploads/")[1] || "");
    return path.join(uploadsDir, name);
  }
  if (videoUrl.startsWith("/uploads/")) {
    const name = decodeURIComponent(videoUrl.split("/uploads/")[1] || "");
    return path.join(uploadsDir, name);
  }
  return null;
}

async function ensureVideoLocal(videoUrl: string, workDir: string) {
  const local = resolveLocalVideoPath(videoUrl);
  if (local && fs.existsSync(local)) return local;

  const resp = await fetch(videoUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download video: HTTP ${resp.status}`);
  }
  const buff = Buffer.from(await resp.arrayBuffer());
  const tempPath = path.join(workDir, "source.webm");
  fs.writeFileSync(tempPath, buff);
  return tempPath;
}

export async function getOrCreateWebmSequence(
  videoUrl: string,
  fps: number,
  publicBase: string
): Promise<SeqManifest> {
  const safeFps = Math.max(1, Math.min(30, Math.floor(fps)));
  const id = crypto.createHash("md5").update(`${videoUrl}|${safeFps}`).digest("hex");
  const seqRoot = path.join(uploadsDir, "sequences", id);
  const framesDir = path.join(seqRoot, "frames");
  const manifestPath = path.join(seqRoot, "manifest.json");

  fs.mkdirSync(framesDir, { recursive: true });
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as SeqManifest;
  }

  const sourcePath = await ensureVideoLocal(videoUrl, seqRoot);
  const outputPattern = path.join(framesDir, "frame_%04d.png");
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    `fps=${safeFps},format=rgba`,
    outputPattern,
  ]);

  const frameFiles = fs
    .readdirSync(framesDir)
    .filter((f) => /^frame_\d+\.png$/.test(f))
    .sort();

  const manifest: SeqManifest = {
    id,
    fps: safeFps,
    frameCount: frameFiles.length,
    folderUrl: `${publicBase}/uploads/sequences/${id}/frames`,
    pattern: "frame_%04d.png",
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

router.post("/webm-sequence", async (req, res) => {
  try {
    const videoUrl = String(req.body?.videoUrl || "").trim();
    const fps = Number(req.body?.fps || 12);
    if (!videoUrl) return res.status(400).json({ error: "Missing videoUrl" });
    const manifest = await getOrCreateWebmSequence(videoUrl, fps, getPublicBase(req));
    return res.json({ ok: true, manifest });
  } catch (e) {
    return res.status(500).json({
      error: "ffmpeg failed (ensure ffmpeg installed in runtime)",
      detail: e instanceof Error ? e.message : "unknown",
    });
  }
});

export default router;
