import dotenv from "dotenv";
dotenv.config({ override: false });
console.log("Step1 XAI_API_KEY:", process.env.XAI_API_KEY);
import express from "express";
import cors from "cors";
import animationRoute from "./api/animation.ts";
import generateImageRoute from "./api/generate-image.ts";
import ttsRoute from "./api/tts.ts";
import askRoute from "./api/ask.ts";
import path from "path/win32";

console.log("Step2 XAI_API_KEY:", process.env.XAI_API_KEY);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(cors({ 
  origin: "http://localhost:3000",
  methods: "GET,POST,OPTIONS",
  allowedHeaders: "Content-Type,Authorization"
}));

// Routes
app.use("/api/generate-image", generateImageRoute);
app.use("/api", ttsRoute);
app.use("/api/video", animationRoute);
app.use("/api", askRoute); 
app.use("/uploads", express.static("uploads"));

app.listen(4000, () => {
  console.log("Backend running at http://localhost:4000");
});