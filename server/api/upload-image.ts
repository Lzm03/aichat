// server/api/upload-image.ts
import express from "express";
import multer from "multer";
import path from "path";

const router = express.Router();

/* -------------------------------------------
   ⭐ 1. 使用 diskStorage → 保留正確副檔名
------------------------------------------- */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    // 取得原始副檔名（png/jpg/webp...）
    const ext = path.extname(file.originalname) || ".png";

    // 設定唯一檔名
    const filename =
      Date.now() + "-" + Math.random().toString(36).slice(2) + ext;

    cb(null, filename);
  },
});

/* -------------------------------------------
   ⭐ 2. Multer 正式初始化
------------------------------------------- */
const upload = multer({ storage });

/* -------------------------------------------
   ⭐ 3. API：回傳完整可公開的 URL
------------------------------------------- */
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // BACKEND_URL = https://xxx.ngrok-free.dev 或 Railway Production URL
  const publicUrl = `${process.env.BACKEND_URL}/uploads/${req.file.filename}`;

  console.log("📤 Uploaded file:", req.file.filename);
  console.log("🌍 Public URL:", publicUrl);

  res.json({ url: publicUrl });
});

export default router;