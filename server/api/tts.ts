import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/voices", async (req, res) => {
  try {
    const token = process.env.MINIMAX_TOKEN;

    const result = await fetch("https://api-bj.minimaxi.com/v1/get_voice", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ voice_type: "all" }),
    });

    const data:any = await result.json();
    res.json({ voices: data.system_voice || [] });
  } catch (e) {
    res.status(500).json({ error: "voice list failed" });
  }
});

router.post("/tts", async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    const token = process.env.MINIMAX_TOKEN;

    const result = await fetch(
      "https://api-bj.minimaxi.com/v1/t2a_v2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "speech-2.6-hd",
          text,
          language_boost: "Chinese,Yue",
          voice_setting: {
            voice_id: voiceId,
            speed: 1,
            vol: 1,
            pitch: 0,
            emotion: "calm",
          },
          audio_setting: {
            format: "mp3",
            sample_rate: 44100,
            bitrate: 128000,
            channel: 1,
          },
          output_format: "hex",
        }),
      }
    );

    const data:any = await result.json();

    if (!data?.data?.audio) {
      console.log("TTS ERROR:", data);
      return res.status(500).json({ error: "No audio returned" });
    }

    const buffer = Buffer.from(data.data.audio, "hex");
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: "tts failed" });
  }
});

export default router;