"use client";
import React, { useState, useEffect, useRef } from "react";
import { Icons } from "../icons";

interface ChatPreviewProps {
  currentStep: number;
  botConfig: {
    name: string;
    avatar: string;
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
    const baseUrl = import.meta.env.VITE_API_URL;

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
    <div className="relative h-[600px] rounded-3xl shadow-lg overflow-hidden">

      {/* ⭐ 背景：固定不動 */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${botConfig.background})` }}
      />

      {/* ⭐ 半透明遮罩 */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>

      {/* ⭐ 內容 */}
      <div className="relative z-10 flex flex-col h-full">

        {/* 名稱 */}
        <div className="flex justify-center pt-4 pb-2">
          <span className="px-4 py-1.5 bg-white/80 rounded-full text-xs font-semibold shadow">
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
            <div className="flex justify-center mt-2 mb-2">
              {botConfig.avatar && (
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-xl">
                  <img src={botConfig.avatar} className="w-full h-full object-cover" />
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
              <div className="p-4 flex gap-2 bg-white/60 backdrop-blur border-t border-white/30">
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="向你的機器人問問題吧…"
                  className="flex-1 p-3 rounded-xl text-sm border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  onClick={sendMessage}
                  className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
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