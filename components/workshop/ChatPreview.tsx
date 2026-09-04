"use client";

import { uiText } from '../../utils/uiI18n';
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
    securityPrompt?: string;
  };
}

export const ChatPreview: React.FC<ChatPreviewProps> = ({
  currentStep,
  botConfig,
}) => {
  const [modelProvider, setModelProvider] = useState<"deepseek" | "gemini">("deepseek");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [messages, setMessages] = useState<
    { role: "user" | "bot"; text: string; imagePreviews?: string[] }[]
  >([]);

  const [inputText, setInputText] = useState("");
  const [chatImages, setChatImages] = useState<File[]>([]);
  const [chatImagePreviews, setChatImagePreviews] = useState<string[]>([]);
  const [isChatDragActive, setIsChatDragActive] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const canChat = currentStep > 3;
  const avatarSrc = botConfig.avatarUrl || botConfig.avatar || "";
  const hasBackground = Boolean(botConfig.background);

  useEffect(() => {
    if (!canChat) {
      setMessages([]);
      setInputText("");
      setChatImages([]);
      setChatImagePreviews([]);
    }
  }, [canChat]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Node)) return;
      if ((target as HTMLElement).closest?.("[data-model-menu-root='chat-preview']")) return;
      setShowModelMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  /** ⭐ 新訊息自動滾到底部 */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  async function askLLM(systemPrompt: string, userPrompt: string, images: File[] = []) {
    const baseUrl = API_BASE;
    const usesGeminiImages = modelProvider === "gemini" && images.length > 0;
    const payload = { systemPrompt, userPrompt, stream: false, modelProvider };
    const r = await fetch(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: usesGeminiImages ? undefined : { "Content-Type": "application/json" },
      body: usesGeminiImages
        ? (() => {
            const form = new FormData();
            Object.entries(payload).forEach(([key, value]) => form.append(key, String(value)));
            images.forEach((file) => form.append("images", file));
            return form;
          })()
        : JSON.stringify(payload),
    });

    const raw = await r.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      const reply = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:/, ""))
        .join("")
        .trim();
      data = { reply };
    }
    if (!r.ok) {
      throw new Error(data?.error || `聊天請求失敗：${r.status}`);
    }
    return data.reply;
  }

async function sendMessage() {
  if (!inputText.trim() && chatImages.length === 0) return;

  const text = inputText;     
  const queuedImages = chatImages;
  const queuedPreviews = chatImagePreviews;
  setInputText("");            
  setChatImages([]);
  setChatImagePreviews([]);

  const userMsg = { role: "user" as const, text, imagePreviews: queuedPreviews };
  setMessages((prev) => [...prev, userMsg]);

  try {
    const systemPrompt = [botConfig.knowledgeBase, botConfig.securityPrompt]
      .filter(Boolean)
      .join("\n");
    const reply = await askLLM(systemPrompt, text, queuedImages);
    const botMsg = { role: "bot" as const, text: reply || "（未收到回覆）" };
    setMessages((prev) => [...prev, botMsg]);
  } catch (error: any) {
    const errText = error?.message || "發送失敗，請稍後再試。";
    setMessages((prev) => [...prev, { role: "bot", text: errText }]);
  }
}

function appendChatImages(files: FileList | File[]) {
  const nextFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (!nextFiles.length) return;
  if (chatImages.length + nextFiles.length > 4) {
    window.alert("最多隻能上傳四張圖片");
  }
  const allowed = nextFiles.slice(0, Math.max(0, 4 - chatImages.length));
  if (!allowed.length) return;
  const nextPreviews = allowed.map((file) => URL.createObjectURL(file));
  nextPreviews.forEach((url) => previewUrlsRef.current.add(url));
  setChatImages((prev) => [...prev, ...allowed]);
  setChatImagePreviews((prev) => [...prev, ...nextPreviews]);
}

function removeChatImage(index: number) {
  setChatImages((prev) => prev.filter((_, i) => i !== index));
  setChatImagePreviews((prev) => {
    const target = prev[index];
    if (target) {
      URL.revokeObjectURL(target);
      previewUrlsRef.current.delete(target);
    }
    return prev.filter((_, i) => i !== index);
  });
}

function renderFormattedMessage(text: string) {
  const normalized = text.replace(/「([^」]+)」/g, (_, content) => `**${content}**`);
  return normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    if (match) {
      return <strong key={`${part}-${index}`} className="font-semibold text-slate-900">{match[1]}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

  return (
    <div className={`relative h-[600px] rounded-[2rem] shadow-lg overflow-hidden border ${currentStep <= 2 ? "border-slate-200 bg-white" : "border-white/20 bg-[#0a0f1a]"}`}>
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
          <div className="flex-1 flex flex-col items-center justify-center text-slate-700">
            <Icons.bot className="w-12 h-12 opacity-70 mb-3 text-slate-500" />
            <p className="text-base font-medium">{uiText("角色構建中…")}</p>
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
                          ? m.imagePreviews?.length
                            ? "bg-white/90 text-slate-800 border border-slate-200"
                            : "bg-indigo-600 text-white"
                          : "bg-white/80 backdrop-blur text-slate-800"
                      }`}
                    >
                      {m.imagePreviews?.length ? (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {m.imagePreviews.map((src, index) => (
                            <button
                              key={`${src}-${index}`}
                              type="button"
                              onClick={() => setSelectedPreviewImage(src)}
                              className="overflow-hidden rounded-xl"
                            >
                              <img src={src} className="h-16 w-16 rounded-xl object-cover transition-transform hover:scale-[1.03]" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap">{renderFormattedMessage(m.text)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ⭐ 輸入框 */}
            {canChat && (
              <div className="p-4 flex gap-2 bg-white/60 backdrop-blur border-t border-white/30 md:bg-white/60 bg-black/24">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="relative w-fit" data-model-menu-root="chat-preview">
                    <button
                      type="button"
                      onClick={() => setShowModelMenu((prev) => !prev)}
                      className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      <span>{modelProvider === "deepseek" ? "DeepSeek" : "Gemini"}</span>
                      <span className={`transition-transform ${showModelMenu ? "rotate-180" : ""}`}>⌄</span>
                    </button>
                    {showModelMenu ? (
                      <div className="absolute bottom-full left-0 z-20 mb-2 min-w-[116px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                        {(["deepseek", "gemini"] as const).map((option) => {
                          const active = modelProvider === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setModelProvider(option);
                                setShowModelMenu(false);
                              }}
                              className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                                active ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <span>{option === "deepseek" ? "DeepSeek" : "Gemini"}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  {chatImagePreviews.length ? (
                    <div className="flex flex-wrap gap-2">
                      {chatImagePreviews.map((src, index) => (
                        <div key={`${src}-${index}`} className="relative">
                          <button
                            type="button"
                            onClick={() => setSelectedPreviewImage(src)}
                            className="overflow-hidden rounded-lg"
                          >
                            <img src={src} className="h-14 w-14 rounded-lg object-cover transition-transform hover:scale-[1.03]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeChatImage(index)}
                            className="absolute -right-1 -top-1 rounded-full bg-black/70 px-1 text-[10px] text-white"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    {modelProvider === "gemini" ? (
                      <>
                        <input
                          ref={chatImageInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            appendChatImages(event.target.files || []);
                            event.currentTarget.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => chatImageInputRef.current?.click()}
                          disabled={chatImages.length >= 4}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-lg leading-none text-slate-700 disabled:opacity-40"
                        >
                          +
                        </button>
                      </>
                    ) : null}
                  <input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={uiText("輸入訊息測試...")}
                    className={`w-full flex-1 rounded-xl border p-3 text-sm bg-white/90 ${
                      isChatDragActive ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-300 focus:ring-2 focus:ring-indigo-300"
                    }`}
                    onDragOver={(event) => {
                      if (modelProvider !== "gemini") return;
                      event.preventDefault();
                      setIsChatDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      if (modelProvider !== "gemini") return;
                      event.preventDefault();
                      setIsChatDragActive(false);
                    }}
                    onDrop={(event) => {
                      if (modelProvider !== "gemini") return;
                      event.preventDefault();
                      setIsChatDragActive(false);
                      appendChatImages(event.dataTransfer.files);
                    }}
                  />
                  </div>
                </div>
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim() && chatImages.length === 0}
                  className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-[0_8px_20px_rgba(79,70,229,0.35)]"
                >
                  <Icons.send className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {selectedPreviewImage ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-6"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedPreviewImage(null);
          }}
        >
          <img
            src={selectedPreviewImage}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
