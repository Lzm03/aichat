import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/ask", async (req, res) => {
  try {
    const { systemPrompt, userPrompt } = req.body;

    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
      }),
    });

    const data:any = await r.json();
    res.json({ reply: data?.choices?.[0]?.message?.content ?? "（無回答）" });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;