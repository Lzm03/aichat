import express from "express";
import fetch from "node-fetch";
import { pool } from "../db.ts";
import { recordMinimaxTtsUsage } from "../lib/minimax-usage.ts";
import {
  assertUserCanSpend,
  consumeFeatureUsage,
  consumeUserCredits,
  getAuthUser,
  getBearerToken,
  findUserById,
  requireAuth,
  verifyToken,
  ensurePlatformTables,
} from "../lib/platform-auth.ts";

const router = express.Router();
const MOCK_UPSTREAM = /^(1|true|yes|on)$/i.test(String(process.env.MOCK_UPSTREAM || "").trim());

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function resolveTtsActor(req: express.Request, sharedBotId?: string) {
  const token = getBearerToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload?.sub) {
    const user = await findUserById(payload.sub);
    if (user) {
      return { user, shared: false as const };
    }
  }

  const normalizedBotId = String(sharedBotId || "").trim();
  if (!normalizedBotId) {
    const error = new Error("missing bearer token");
    (error as any).status = 401;
    throw error;
  }

  await ensurePlatformTables();
  const result = await pool.query(
    `SELECT owner_id
     FROM bots
     WHERE id=$1
       AND is_visible=true
       AND owner_id IS NOT NULL
     LIMIT 1`,
    [normalizedBotId]
  );
  const ownerId = String(result.rows[0]?.owner_id || "").trim();
  if (!ownerId) {
    const error = new Error("shared bot not found");
    (error as any).status = 404;
    throw error;
  }

  const user = await findUserById(ownerId);
  if (!user) {
    const error = new Error("shared bot owner not found");
    (error as any).status = 404;
    throw error;
  }

  return { user, shared: true as const };
}

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
    if (MOCK_UPSTREAM) {
      return res.json({
        voices: [
          { voice_id: "mock-voice-1", name: "Mock Voice 1" },
          { voice_id: "mock-voice-2", name: "Mock Voice 2" },
        ],
      });
    }
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

router.post("/tts", async (req, res) => {
  try {
    const { text, voiceId, usageType = "chat_voice", sharedBotId = "" } = req.body;
    const actor = await resolveTtsActor(req, String(sharedBotId || ""));
    const authUser = actor.user;
    if (MOCK_UPSTREAM) {
      const delayMs = randomInt(
        Number(process.env.MOCK_UPSTREAM_MIN_DELAY_MS || 300),
        Number(process.env.MOCK_UPSTREAM_MAX_DELAY_MS || 3000)
      );
      const failureRate = Math.max(0, Math.min(1, Number(process.env.MOCK_UPSTREAM_FAILURE_RATE || 0.03)));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (Math.random() < failureRate) {
        throw new Error("Mock upstream timeout");
      }
      const mockAudio = Buffer.from("ID3");
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": mockAudio.length,
      });
      return res.end(mockAudio);
    }
    await assertUserCanSpend(authUser.id, 2);
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
      await consumeFeatureUsage(authUser.id, "voice_audition_preview", 1, {
        voiceId: String(voiceId || ""),
        source: actor.shared ? "shared_bot" : "direct",
      });
    } else {
      await consumeFeatureUsage(authUser.id, "voice_messages", 1, {
        voiceId: String(voiceId || ""),
        source: actor.shared ? "shared_bot" : "direct",
      });
    }
    await consumeUserCredits(authUser.id, "tts", 2, {
      voiceId: String(voiceId || ""),
      textLength: String(text || "").length,
      source: actor.shared ? "shared_bot" : "direct",
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
