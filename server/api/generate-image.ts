import express from "express";
import axios from "axios";
import path from "path";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    // 必须在这里读取！
    const XAI_API_KEY = process.env.XAI_API_KEY;

    console.log("API KEY at request:", XAI_API_KEY); // <--- 应该打印真实 key

    if (!XAI_API_KEY) {
      return res.status(500).json({ error: "XAI_API_KEY missing in env" });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
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

    return res.json({ image: imageUrl });
  } catch (err: any) {
    console.error("🔥 Grok Error:", err.response?.data || err.message);
    res.status(500).json({ ...err.response?.data });
  }
});

export default router;