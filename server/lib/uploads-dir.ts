import fs from "fs";
import path from "path";

const configured = (process.env.UPLOAD_DIR || "").trim();
const fallback = path.resolve("uploads");

export const uploadsDir = configured || fallback;

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

