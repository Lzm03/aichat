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
app.use("/api/bots", botsRoute);
// Routes
app.use("/api/generate-image", generateImageRoute);
app.use("/api", ttsRoute);
app.use("/api/video", animationRoute);
app.use("/api/video", removeBgRoute);
app.use("/api", askRoute);
app.use("/api/upload-image", uploadImageRoute);
app.use(
  "/uploads",
  express.static("uploads", {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".png")) res.set("Content-Type", "image/png");
      if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
        res.set("Content-Type", "image/jpeg");
      if (filePath.endsWith(".webp")) res.set("Content-Type", "image/webp");
    },
  })
);

// ⭐ Railway 會動態提供 PORT
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});