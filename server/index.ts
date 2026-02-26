import dotenv from "dotenv";
dotenv.config({ override: false });

import express from "express";
import cors from "cors";

import animationRoute from "./api/animation.ts";
import generateImageRoute from "./api/generate-image.ts";
import ttsRoute from "./api/tts.ts";
import askRoute from "./api/ask.ts";

const app = express();

// ⭐ 專業 CORS 設定：允許所有 localhost 與 Railway
app.use(
  cors({
    origin: (origin, callback) => {
      // 沒有 origin（如 Postman）→ 允許
      if (!origin) return callback(null, true);

      // 允許所有 localhost:*（開發模式）
      if (origin.startsWith("http://localhost:")) {
        return callback(null, true);
      }

      // 允許環境變數設定的前端網址 (Railway 正式版)
      if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }

      // 其他來源 → 拒絕
      callback(new Error(`CORS blocked: ${origin}`));
    },
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));

// Routes
app.use("/api/generate-image", generateImageRoute);
app.use("/api", ttsRoute);
app.use("/api/video", animationRoute);
app.use("/api", askRoute);
app.use("/uploads", express.static("uploads"));

// ⭐ Railway 會動態提供 PORT
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
