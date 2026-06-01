import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

import express from "express";
import cors from "cors";
import fs from "fs";
import { Readable } from "stream";

import botsRoute from "./api/bots.ts";
import animationRoute from "./api/animation.ts";
import generateImageRoute from "./api/generate-image.ts";
import ttsRoute from "./api/tts.ts";
import askRoute from "./api/ask.ts";
import authRoute from "./api/auth.ts";
import removeBgRoute from "./api/removeBgvideo.ts";
import uploadImageRoute from "./api/upload-image.ts";
import uploadVideoRoute from "./api/upload-video.ts";
import debugStorageRoute from "./api/debug-storage.ts";
import tokenUsageRoute from "./api/token-usage.ts";
import webmSequenceRoute from "./api/webm-sequence.ts";
import { pool } from "./db.ts";
import { uploadsDir } from "./lib/uploads-dir.ts";
import { ensurePlatformTables, maybeAssignLegacyDataByEmail } from "./lib/platform-auth.ts";

const app = express();
const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    ...(process.env.FRONTEND_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    "https://aichat-lilac-six.vercel.app",
  ].filter(Boolean)
);

// CORS: allow localhost plus configured production frontends.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (origin.startsWith("http://localhost:"))
        return callback(null, true);

      if (allowedOrigins.has(origin))
        return callback(null, true);

      callback(new Error(`CORS blocked: ${origin}`));
    },
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));
app.get("/", (_req, res) => {
  res.status(200).send("ok");
});
app.get("/api/health", (_req, res) => {
  const maintenance = /^(1|true|yes|on)$/i.test(
    String(process.env.MAINTENANCE_MODE || "").trim()
  );
  res.json({
    ok: true,
    maintenance,
    now: new Date().toISOString(),
    version: process.env.APP_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA || "dev",
  });
});
app.get("/api/media-proxy", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing url" });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return res.status(400).json({ error: "Unsupported protocol" });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "user-agent": req.get("user-agent") || "Mozilla/5.0",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return res
        .status(upstream.status || 502)
        .json({ error: "Failed to fetch remote media" });
    }

    const contentType = upstream.headers.get("content-type");
    const cacheControl = upstream.headers.get("cache-control");

    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    if (contentType) res.set("Content-Type", contentType);
    res.set("Cache-Control", cacheControl || "public, max-age=3600");

    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (error) {
    console.error("Failed to proxy media:", error);
    res.status(502).json({ error: "Failed to proxy media" });
  }
});
app.use("/api/bots", botsRoute);
// Routes
app.use("/api/generate-image", generateImageRoute);
app.use("/api", ttsRoute);
app.use("/api/video", animationRoute);
app.use("/api/video", removeBgRoute);
app.use("/api/video", webmSequenceRoute);
app.use("/api", askRoute);
app.use("/api/auth", authRoute);
app.use("/api/upload-image", uploadImageRoute);
app.use("/api/upload-video", uploadVideoRoute);
app.use("/api/debug", debugStorageRoute);
app.use("/api", tokenUsageRoute);
app.get("/uploads/sequences/:id/manifest.json", (req, res, next) => {
  const manifestPath = path.join(uploadsDir, "sequences", req.params.id, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return next();
  }

  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const publicBase = (process.env.BACKEND_URL?.trim() || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    res.json({
      ...raw,
      folderUrl: `${publicBase}/uploads/sequences/${req.params.id}/frames`,
    });
  } catch (error) {
    console.error("Failed to serve sequence manifest:", error);
    res.status(500).json({ error: "Failed to read sequence manifest" });
  }
});
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
      if (filePath.endsWith(".png")) res.set("Content-Type", "image/png");
      if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
        res.set("Content-Type", "image/jpeg");
      if (filePath.endsWith(".webp")) res.set("Content-Type", "image/webp");
      if (filePath.endsWith(".mp4")) res.set("Content-Type", "video/mp4");
      if (filePath.endsWith(".webm")) res.set("Content-Type", "video/webm");
      if (filePath.endsWith(".mov")) res.set("Content-Type", "video/quicktime");

      // Sequence assets are immutable; strong cache helps remote playback smoothness.
      if (/\/sequences\//.test(filePath) && /\.(png|json)$/i.test(filePath)) {
        res.set("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/\.(png|jpg|jpeg|webp|mp4|webm|mov)$/i.test(filePath)) {
        res.set("Cache-Control", "public, max-age=86400");
      }
    },
  })
);

// ⭐ Railway 會動態提供 PORT
const PORT = process.env.PORT || 4000;
let server: ReturnType<typeof app.listen> | null = null;

async function start() {
  await ensurePlatformTables();
  try {
    await maybeAssignLegacyDataByEmail("lzm200303@gmail.com");
  } catch (error) {
    // Keep startup healthy even if legacy migration assignment fails.
    console.warn("Legacy account assignment skipped:", error);
  }
  server = app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
  });
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server?.close(async () => {
    await pool.end().catch((error) => {
      console.error("Failed to close database pool:", error);
    });
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000).unref();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

start().catch((error) => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
