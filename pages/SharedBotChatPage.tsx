import React, { useEffect, useState } from "react";
import { PublishSuccessModal } from "../components/workshop/PublishSuccessModal";

interface SharedBotChatPageProps {
  botId: string;
}

export const SharedBotChatPage: React.FC<SharedBotChatPageProps> = ({ botId }) => {
  const [botConfig, setBotConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadBot = async () => {
      setLoading(true);
      setError("");
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
        const res = await fetch(`${baseUrl}/api/bots/${botId}`);
        if (!res.ok) {
          throw new Error(`Bot not found (${res.status})`);
        }
        const data = await res.json();
        setBotConfig(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Load bot failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    loadBot();
  }, [botId]);

  useEffect(() => {
    if (!botConfig?.id) return;
    const ua = navigator.userAgent || "";
    const isMobileLike = /iPhone|iPad|iPod|Android/i.test(ua);
    if (!isMobileLike) return;
    const baseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
    const base = baseUrl || "";
    void fetch(`${base}/api/bots/${botConfig.id}/precompute-sequences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fps: 12 }),
    }).catch(() => undefined);
  }, [botConfig?.id]);

  if (loading) {
    return (
      <div className="w-screen min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-500 border-t-white rounded-full animate-spin" />
          <div className="text-sm">正在載入聊天...</div>
        </div>
      </div>
    );
  }

  if (error || !botConfig) {
    return (
      <div className="w-screen min-h-screen bg-slate-900 flex items-center justify-center text-slate-100 p-6">
        <div className="text-sm">無法打開此聊天：{error || "機器人不存在"}</div>
      </div>
    );
  }

  return (
    <PublishSuccessModal
      isOpen={true}
      onClose={() => {
        window.location.href = "/";
      }}
      botConfig={botConfig}
      onEdit={() => {}}
      onDelete={() => {}}
    />
  );
};
