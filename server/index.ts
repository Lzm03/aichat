import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import botsRoute from "./api/bots.ts";
import animationRoute from "./api/animation.ts";
import generateImageRoute from "./api/generate-image.ts";
import ttsRoute from "./api/tts.ts";
import askRoute from "./api/ask.ts";
import removeBgRoute from "./api/removeBgvideo.ts";
import uploadImageRoute from "./api/upload-image.ts";
import uploadVideoRoute from "./api/upload-video.ts";
import debugStorageRoute from "./api/debug-storage.ts";
import tokenUsageRoute from "./api/token-usage.ts";
import webmSequenceRoute from "./api/webm-sequence.ts";
import { uploadsDir } from "./lib/uploads-dir.ts";

const app = express();
// ⭐ 專業 CORS 設定：允許所有 localhost 與 Railway
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (origin.startsWith("http://localhost:"))
        return callback(null, true);

      if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)
        return callback(null, true);

      callback(new Error(`CORS blocked: ${origin}`));
    },
    methods: "GET,POST,PUT,DELETE,OPTIONS",
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
app.use("/api/bots", botsRoute);
// Routes
app.use("/api/generate-image", generateImageRoute);
app.use("/api", ttsRoute);
app.use("/api/video", animationRoute);
app.use("/api/video", removeBgRoute);
app.use("/api/video", webmSequenceRoute);
app.use("/api", askRoute);
app.use("/api/upload-image", uploadImageRoute);
app.use("/api/upload-video", uploadVideoRoute);
app.use("/api/debug", debugStorageRoute);
app.use("/api", tokenUsageRoute);
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
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

const server = app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});

const gracefulShutdown = (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
