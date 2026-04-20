import express from "express";
import axios from "axios";
import path from "path";
import {
  assertUserCanSpend,
  consumeUserCredits,
  ensureFeatureAvailable,
  getAuthUser,
  recordFeatureUsage,
  requireAuth,
} from "../lib/platform-auth.ts";

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    await assertUserCanSpend(authUser!.id, 10);
    // 必须在这里读取！
    const XAI_API_KEY = process.env.XAI_API_KEY;

    console.log("API KEY at request:", XAI_API_KEY); // <--- 应该打印真实 key

    if (!XAI_API_KEY) {
      return res.status(500).json({ error: "XAI_API_KEY missing in env" });
    }

    const { prompt, featureKey } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }
    if (featureKey === "avatar_ai_generate" || featureKey === "background_ai_generate") {
      await ensureFeatureAvailable(authUser!.id, featureKey, 1);
    }

    const response = await axios.post(
      "https://api.x.ai/v1/images/generations",
      {
        model: "grok-imagine-image",
        prompt,
      },
      {
        headers: {
          Authorization: `Bearer ${XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const imageUrl = response.data?.data?.[0]?.url;
    if (featureKey === "avatar_ai_generate" || featureKey === "background_ai_generate") {
      await recordFeatureUsage(authUser!.id, featureKey, 1, {
        promptLength: String(prompt || "").length,
      });
    }
    await consumeUserCredits(authUser!.id, "generate_image", 10, {
      promptLength: String(prompt || "").length,
    });

    return res.json({ image: imageUrl });
  } catch (err: any) {
    console.error("🔥 Grok Error:", err.response?.data || err.message);
    res.status(err?.status || 500).json(err.response?.data || { error: err.message || "image generation failed" });
  }
});

export default router;
