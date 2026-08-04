import React, { useEffect, useMemo, useState } from "react";
import { SequencePngPlayer } from "../components/workshop/SequencePngPlayer";

type CharacterState = "idle" | "thinking" | "speaking";

export const CharacterStagePage: React.FC<{ botId: string }> = ({ botId }) => {
  const [bot, setBot] = useState<any>(null);
  const [state, setState] = useState<CharacterState>("idle");
  const [error, setError] = useState("");
  const [manifests, setManifests] = useState<Record<string, any>>({});

  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
    fetch(`${base}/api/bots/${encodeURIComponent(botId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "角色不存在");
        setBot(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "角色載入失敗"));
  }, [botId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "modo-character-state") return;
      if (["idle", "thinking", "speaking"].includes(event.data.state)) {
        setState(event.data.state);
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "chopreality-stage-ready", botId }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [botId]);

  useEffect(() => {
    if (!bot) return;
    const entries = [
      ["idle", bot.videoIdle],
      ["thinking", bot.videoThinking],
      ["speaking", bot.videoTalking],
    ];
    entries.forEach(([key, url]) => {
      if (!url || !/\/manifest\.json(?:\?|$)/i.test(url)) return;
      fetch(url).then((response) => response.json()).then((manifest) => {
        setManifests((current) => ({ ...current, [key]: manifest }));
      }).catch(() => undefined);
    });
  }, [bot]);

  const media = useMemo(() => ({
    idle: bot?.videoIdle || "",
    thinking: bot?.videoThinking || bot?.videoIdle || "",
    speaking: bot?.videoTalking || bot?.videoIdle || "",
  }), [bot]);

  if (error && !bot) return <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">{error}</div>;
  if (!bot) return <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">正在載入角色…</div>;

  const renderCharacter = (key: CharacterState) => {
    const manifest = manifests[key];
    const url = media[key];
    if (manifest) {
      return <SequencePngPlayer {...manifest} active={state === key} className="h-full w-full object-contain drop-shadow-2xl" />;
    }
    if (url) {
      return <video src={url} autoPlay loop muted playsInline className="h-full w-full object-contain drop-shadow-2xl" />;
    }
    return <img src={bot.avatarUrl} alt={bot.name} className="h-full w-full object-contain drop-shadow-2xl" />;
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-200">
      {bot.background ? <img src={bot.background} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/5" />
      <div className="absolute inset-0 flex items-end justify-center px-4 pb-5">
        <div className="h-full w-full max-w-[620px]">
          {renderCharacter(state)}
        </div>
      </div>
    </main>
  );
};
