"use client";
import React, { useState } from "react";
import { Icons } from "../icons";

interface ChatPreviewProps {
  currentStep: number;
  botConfig: {
    name: string;
    avatar: string;
    background: string;
    knowledgeBase: string;   // ← 第2步产生的 generatedDescription
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

  const canChat = currentStep >= 3; 
  /// <reference types="vite/client" />

  // Deepseek API 调用
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

    const userMsg = { role: "user" as const, text: inputText };
    setMessages((prev) => [...prev, userMsg]);

    const systemPrompt = `
你是一名 AI 助教，具有以下人物设定与知识：

${botConfig.knowledgeBase}

请严格根据以上内容回答问题，保持温柔友善的语气。
`;

    setInputText("");

    const reply = await askLLM(systemPrompt, userMsg.text);

    const botMsg = { role: "bot" as const, text: reply };
    setMessages((prev) => [...prev, botMsg]);
  }

  const hasBackground = botConfig.background?.trim();
  const hasAvatar = botConfig.avatar?.trim();

  return (
    <div className="h-[600px] bg-white rounded-3xl shadow-lg flex flex-col overflow-hidden relative">

      {/* 背景 */}
      {currentStep >= 2 && hasBackground && (
        <img
          src={botConfig.background}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* 名字 */}
      <div className="relative z-20 flex justify-center pt-4 pb-2">
        <span className="px-4 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-full shadow-sm">
          {botConfig.name}
        </span>
      </div>

      {/* Step1 空状态 */}
      {currentStep === 1 && (
        <div className="relative z-20 flex-1 flex flex-col items-center justify-center text-slate-500">
          <Icons.bot className="w-12 h-12 text-slate-400 mb-3" />
          <p className="text-base font-medium">角色構建中…</p>
        </div>
      )}

      {/* Step2+ 显示头像 */}
      {currentStep >= 2 && (
        <div className="relative z-20 flex-1 flex flex-col justify-between">

          {/* Avatar */}
          <div className="flex items-center justify-center mt-3">
            {hasAvatar && (
              <div className="w-20 h-20 rounded-full overflow-hidden shadow border-2 border-white">
                <img
                  src={botConfig.avatar}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Step3 聊天框 */}
          {canChat && (
            <>
              {/* 聊天记录 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-white/70 rounded-xl mx-4 mt-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] p-3 rounded-xl text-sm ${
                        m.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-800"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* 输入框 */}
              <div className="p-4 flex gap-2 relative z-20 bg-white">
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="向你的機器人問問題吧…"
                  className="flex-1 p-3 rounded-xl border border-slate-300 text-sm"
                />
                <button
                  onClick={sendMessage}
                  className="p-3 bg-indigo-600 text-white rounded-xl"
                >
                  <Icons.send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
