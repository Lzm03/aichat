import express from "express";
import fetch from "node-fetch";
import { recordMinimaxTtsUsage } from "../lib/minimax-usage.ts";
import {
  assertUserCanSpend,
  consumeUserCredits,
  ensureFeatureAvailable,
  getAuthUser,
  recordFeatureUsage,
  requireAuth,
} from "../lib/platform-auth.ts";

const router = express.Router();

const collectVoices = (node: any, bucket: any[]) => {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === "object") {
        if (item.voice_id || item.voiceId) {
          bucket.push(item);
          continue;
        }
        collectVoices(item, bucket);
      }
    }
    return;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) {
      collectVoices(value, bucket);
    }
  }
};

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
    const collected: any[] = [];
    collectVoices(data, collected);

    const dedupedMap = new Map<string, any>();
    for (const voice of collected) {
      const id = voice.voice_id || voice.voiceId;
      if (!id) continue;
      if (!dedupedMap.has(id)) dedupedMap.set(id, voice);
    }

    const voices = Array.from(dedupedMap.values());
    res.json({ voices });
  } catch (e) {
    res.status(500).json({ error: "voice list failed" });
  }
});

router.post("/tts", requireAuth, async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const { text, voiceId, usageType = "chat_voice" } = req.body;
    await assertUserCanSpend(authUser!.id, 2);
    if (usageType === "preview_audition") {
      await ensureFeatureAvailable(authUser!.id, "voice_audition_preview", 1);
    } else {
      await ensureFeatureAvailable(authUser!.id, "voice_messages", 1);
    }
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
            speed: 1.15,
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

    // Track MiniMax TTS usage for estimated balance visualization.
    recordMinimaxTtsUsage(String(text || ""));
    if (usageType === "preview_audition") {
      await recordFeatureUsage(authUser!.id, "voice_audition_preview", 1, { voiceId: String(voiceId || "") });
    } else {
      await recordFeatureUsage(authUser!.id, "voice_messages", 1, { voiceId: String(voiceId || "") });
    }
    await consumeUserCredits(authUser!.id, "tts", 2, {
      voiceId: String(voiceId || ""),
      textLength: String(text || "").length,
    });

    const buffer = Buffer.from(data.data.audio, "hex");
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  } catch (err) {
    res.status((err as any)?.status || 500).json({ error: (err as any)?.message || "tts failed" });
  }
});

export default router;
