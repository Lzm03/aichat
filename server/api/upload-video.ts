import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import path from "path";
import { uploadsDir } from "../lib/uploads-dir.ts";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".mp4";
    const safeExt = ext.toLowerCase();
    cb(null, `video_${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) return cb(null, true);
    cb(new Error("Only video files are allowed"));
  },
});

function getPublicBase(req: express.Request) {
  const envBase = process.env.BACKEND_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

router.post("/", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }

    const publicBase = getPublicBase(req);
    const url = `${publicBase}/uploads/${req.file.filename}`;
    return res.json({ url });
  } catch (err) {
    console.error("❌ Upload video failed:", err);
    return res.status(500).json({ error: "Upload video failed" });
  }
});

export default router;
