import express from "express";
import fs from "fs";
import path from "path";
import { uploadsDir } from "../lib/uploads-dir.ts";

const router = express.Router();

router.get("/storage", (_req, res) => {
  try {
    const exists = fs.existsSync(uploadsDir);
    const writable = (() => {
      try {
        fs.accessSync(uploadsDir, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    })();

    const files = exists
      ? fs
          .readdirSync(uploadsDir)
          .map((name) => {
            const full = path.join(uploadsDir, name);
            const stat = fs.statSync(full);
            return {
              name,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
            };
          })
          .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
          .slice(0, 20)
      : [];

    return res.json({
      ok: true,
      uploadDir: uploadsDir,
      exists,
      writable,
      fileCount: files.length,
      latestFiles: files,
      env: {
        UPLOAD_DIR: process.env.UPLOAD_DIR || null,
        NODE_ENV: process.env.NODE_ENV || null,
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || null,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "unknown error",
      uploadDir: uploadsDir,
    });
  }
});

export default router;

