import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const router = express.Router();

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".png";
    const safeExt = ext.toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed"));
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
    console.error("❌ Upload image failed:", err);
    return res.status(500).json({ error: "Upload image failed" });
  }
});

export default router;
