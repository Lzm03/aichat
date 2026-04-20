"use client";
import React, { useState, useEffect, useRef } from "react";
import { Icons } from "../icons";
import { API_BASE } from "../../utils/api";

interface ChatPreviewProps {
  currentStep: number;
  isEditing?: boolean;
  botConfig: {
    name: string;
    avatar?: string;
    avatarUrl?: string;
    background: string;
    knowledgeBase: string;
  };
}

export const ChatPreview: React.FC<ChatPreviewProps> = ({
  currentStep,
  botConfig,
}) => {
  const [messages, setMessages] = useState<
    { role: "user" | "bot"; text: string }[]
  >([]);

  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canChat = currentStep > 3;
  const avatarSrc = botConfig.avatarUrl || botConfig.avatar || "";
  const hasBackground = Boolean(botConfig.background);

  useEffect(() => {
    if (!canChat) {
      setMessages([]);
      setInputText("");
    }
  }, [canChat]);

  /** ⭐ 新訊息自動滾到底部 */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  async function askLLM(systemPrompt: string, userPrompt: string) {
    const baseUrl = API_BASE;

    const r = await fetch(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, userPrompt }),
    });

    const data = await r.json();
    return data.reply;
  }

async function sendMessage() {
  if (!inputText.trim()) return;

  const text = inputText;     
  setInputText("");            

  const userMsg = { role: "user" as const, text };
  setMessages((prev) => [...prev, userMsg]);

  const reply = await askLLM(botConfig.knowledgeBase, text);
  const botMsg = { role: "bot" as const, text: reply };

  setMessages((prev) => [...prev, botMsg]);
}

  return (
    <div className="relative h-[600px] rounded-[2rem] shadow-lg overflow-hidden border border-white/20 bg-[#0a0f1a]">
      {/* Desktop background */}
      <div
        className="absolute inset-0 hidden md:block bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${botConfig.background})` }}
      />

      {/* Mobile faux camera feed */}
      <div className="absolute inset-0 md:hidden">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center bg-no-repeat"
          style={
            hasBackground
              ? { backgroundImage: `url(${botConfig.background})` }
              : {
                  background:
                    "radial-gradient(circle at 20% 20%, #475569 0%, #0f172a 48%, #020617 100%)",
                }
          }
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(2,6,23,0.55))]" />
        <div className="absolute inset-0 opacity-25 mix-blend-screen bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.12)_0,rgba(255,255,255,0.12)_1px,transparent_1px,transparent_6px)]" />
        <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_-120px_120px_rgba(2,6,23,0.5)]" />
      </div>

      {/* Shared overlay */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm md:bg-white/10 md:backdrop-blur-sm" />

      {/* Mobile camera chrome */}
      <div className="absolute inset-x-0 top-0 z-10 px-4 pt-3 md:hidden">
        <div className="flex items-center justify-between text-[11px] font-medium tracking-[0.24em] text-white/90">
          <span>LIVE</span>
          <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] tracking-[0.28em] text-white shadow-[0_0_12px_rgba(239,68,68,0.45)]">
            REC
          </span>
          <span>HD</span>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 md:hidden">
        <div className="absolute left-4 top-16 h-10 w-10 rounded-tl-2xl border-l-2 border-t-2 border-white/70" />
        <div className="absolute right-4 top-16 h-10 w-10 rounded-tr-2xl border-r-2 border-t-2 border-white/70" />
        <div className="absolute bottom-28 left-4 h-10 w-10 rounded-bl-2xl border-b-2 border-l-2 border-white/70" />
        <div className="absolute bottom-28 right-4 h-10 w-10 rounded-br-2xl border-b-2 border-r-2 border-white/70" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
      </div>

      {/* ⭐ 內容 */}
      <div className="relative z-10 flex flex-col h-full">

        {/* 名稱 */}
        <div className="flex justify-center pt-10 md:pt-4 pb-2">
          <span className="px-4 py-1.5 bg-white/80 rounded-full text-xs font-semibold shadow md:bg-white/80 bg-black/35 text-white md:text-slate-900 border border-white/20">
            {botConfig.name}
          </span>
        </div>

        {/* Step1 */}
        {currentStep === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center text-white">
            <Icons.bot className="w-12 h-12 opacity-70 mb-3" />
            <p className="text-base font-medium">角色構建中…</p>
          </div>
        )}

        {/* Step2+ */}
        {currentStep >= 2 && (
          <>
            {/* Avatar */}
            <div className="flex justify-center mt-2 mb-2 md:mb-2 mb-4">
              {avatarSrc && (
                <div className="w-24 h-24 md:w-20 md:h-20 rounded-full overflow-hidden border-2 border-white shadow-[0_18px_40px_rgba(15,23,42,0.32)] bg-white/15 backdrop-blur-sm">
                  <img src={avatarSrc} className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* ⭐ 聊天內容（可滾動） */}
            {canChat && (
              <div
                ref={scrollRef}
                className="
                  flex-1 overflow-y-auto px-4 py-3 space-y-3 
                  custom-scroll
                "
              >
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-white/80 backdrop-blur text-slate-800"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ⭐ 輸入框 */}
            {canChat && (
              <div className="p-4 flex gap-2 bg-white/60 backdrop-blur border-t border-white/30 md:bg-white/60 bg-black/24">
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="輸入訊息測試..."
                  className="flex-1 p-3 rounded-xl text-sm border border-slate-300 focus:ring-2 focus:ring-indigo-300 bg-white/90"
                />
                <button
                  onClick={sendMessage}
                  className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-[0_8px_20px_rgba(79,70,229,0.35)]"
                >
                  <Icons.send className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
