import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Copy,
  Check,
  Send,
  Square,
  MoreHorizontal,
  Link as LinkIcon,
  Edit,
  Trash2,
} from "lucide-react";
import { API_BASE } from "../../utils/api";

interface PublishSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  botConfig: any;
  onEdit: () => void;
  onDelete: (botId: string) => void;
}

export const PublishSuccessModal: React.FC<PublishSuccessModalProps> = ({
  isOpen,
  onClose,
  botConfig,
  onEdit,
  onDelete,
}) => {
  if (!botConfig) return null;

  const {
    name: botName = "AI 機器人",
    avatarUrl,
    background,
    videoIdle,
    videoThinking,
    videoTalking,
    voiceId, 
  } = botConfig;

  
  const lastTTS = useRef(0);
  const [messages, setMessages] = useState<{ role: "user" | "bot"; content: string }[]>([]);

  const [inputText, setInputText] = useState("");
  const [copied, setCopied] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [botState, setBotState] = useState<"idle" | "thinking" | "speaking">(
    "idle"
  );
  const [isStopAvailable, setIsStopAvailable] = useState(false);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const shareUrl = "https://smartedu.hk/bot/xxxxx";
  const chatStyleRules = `
【回覆格式規則（強制）】
1) 禁止輸出舞台描述或動作描寫，例如「（微笑）」「（拱手）」「*點頭*」。
2) 非用戶明確要求角色扮演時，不要使用文言/古風自稱（如「老夫」「在下」）。
3) 每次回覆控制在 1~3 句，優先短句；除非用戶要求詳細版，否則不超過 120 字。
4) 不要長段落鋪陳，直接回答重點。
`.trim();

  // -----------------------------
  // 🔥 自动切换三段动画
  // -----------------------------
  const videoSrc =
    botState === "idle"
      ? videoIdle
      : botState === "thinking"
      ? videoThinking
      : videoTalking;

  // -----------------------------
  // 点击外面自动关闭 dropdown
  // -----------------------------
  useEffect(() => {
    const handleClick = (e: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, botState]);

  useEffect(() => {
    if (!isOpen) return;

    ttsSeq.current = 0;
    nextPlaySeq.current = 0;
    ttsInflight.current = 0;
    ttsTextQueue.current = [];
    ttsAudioMap.current.clear();
    playing.current = false;

    const openingMessage = `你好！我是 ${botName}，你現在最想解決什麼？`;

    setMessages([
      {
        role: "bot",
        content: openingMessage,
      },
    ]);

    // 開場提問也走 TTS
    if (voiceId) setIsStopAvailable(true);
    enqueueSpeak(openingMessage);
  }, [botName, isOpen, voiceId]);
  
  

  // -----------------------------
  // 🔥 复制链接
  // -----------------------------
  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const playing = useRef(false);
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const activeRequestController = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);
  const ttsSeq = useRef(0);
  const nextPlaySeq = useRef(0);
  const ttsInflight = useRef(0);
  const ttsTextQueue = useRef<{ seq: number; text: string }[]>([]);
  const ttsAudioMap = useRef<Map<number, HTMLAudioElement>>(new Map());
  const maxTtsInflight = 3;

const requestTTSAudio = async (text: string) => {

  if (!voiceId || !text.trim()) return;

  const baseUrl = API_BASE;

  try {

    // ⭐ 先限流
    const now = Date.now();

    if (now - lastTTS.current < 40) {
      await new Promise(r => setTimeout(r, 40));
    }

    lastTTS.current = Date.now();

    const res = await fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId,
      }),
    });

    const blob = await res.blob();

    const audio = new Audio(URL.createObjectURL(blob));
    audio.playbackRate = 1.12;
    return audio;

  } catch (e) {
    console.error("TTS error:", e);
  }
};

const enqueueSpeak = (text: string) => {
  if (!voiceId || !text.trim()) return;
  const seq = ttsSeq.current++;
  ttsTextQueue.current.push({ seq, text });
  pumpTTSRequests();
  return seq;
};

const waitForAudioReady = (seq: number, timeoutMs = 1000) =>
  new Promise<void>((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const ready = ttsAudioMap.current.has(seq) || seq < nextPlaySeq.current;
      const timeout = Date.now() - start > timeoutMs;
      if (ready || timeout) {
        clearInterval(timer);
        resolve();
      }
    }, 20);
  });

const tryPlayInOrder = () => {
  if (playing.current) return;

  const audio = ttsAudioMap.current.get(nextPlaySeq.current);
  if (!audio) {
    if (ttsInflight.current === 0 && ttsAudioMap.current.size === 0) {
      setBotState("idle");
      setIsStopAvailable(false);
    }
    return;
  }

  ttsAudioMap.current.delete(nextPlaySeq.current);
  playing.current = true;
  activeAudio.current = audio;
  setBotState("speaking");
  audio.play();

  audio.onended = () => {
    URL.revokeObjectURL(audio.src);
    activeAudio.current = null;
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
};

const pumpTTSRequests = () => {
  while (
    ttsInflight.current < maxTtsInflight &&
    ttsTextQueue.current.length > 0
  ) {
    const item = ttsTextQueue.current.shift()!;
    ttsInflight.current += 1;

    requestTTSAudio(item.text)
      .then((audio) => {
        if (!audio) return;
        ttsAudioMap.current.set(item.seq, audio);
        tryPlayInOrder();
      })
      .finally(() => {
        ttsInflight.current = Math.max(0, ttsInflight.current - 1);
        pumpTTSRequests();
      });
  }
};

const isSentenceEnd = (text: string) => {
  return /[。！？.!?]/.test(text);
};

const stopAllSpeech = () => {
  generationIdRef.current += 1;
  activeRequestController.current?.abort();
  activeRequestController.current = null;

  if (activeAudio.current) {
    activeAudio.current.pause();
    URL.revokeObjectURL(activeAudio.current.src);
    activeAudio.current = null;
  }

  ttsAudioMap.current.forEach((audio) => {
    audio.pause();
    URL.revokeObjectURL(audio.src);
  });

  ttsTextQueue.current = [];
  ttsAudioMap.current.clear();
  ttsInflight.current = 0;
  playing.current = false;
  ttsSeq.current = 0;
  nextPlaySeq.current = 0;
  setBotState("idle");
  setIsStopAvailable(false);
};

const sendMessage = async () => {
  if (!inputText.trim()) return;

  stopAllSpeech();
  setIsStopAvailable(true);
  const userMsg = inputText;
  setInputText("");

  setMessages(prev => [...prev, { role: "user", content: userMsg }]);
  setBotState("thinking");

  const baseUrl = API_BASE;
  const currentGenId = generationIdRef.current;

  try {
    const controller = new AbortController();
    activeRequestController.current = controller;
    const response = await fetch(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemPrompt:
          botConfig.knowledgeBase +
          "\n" +
          botConfig.securityPrompt +
          "\n" +
          chatStyleRules,
        userPrompt: userMsg,
      }),
      signal: controller.signal,
    });
    activeRequestController.current = null;

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    let committedReply = "";
    let segmentBuffer = "";
    let displayChain = Promise.resolve();

    setMessages(prev => [...prev, { role: "bot", content: "" }]);

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      if (currentGenId !== generationIdRef.current) return;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const token = line.replace("data:", "");

        if (!token.trim()) continue;

        segmentBuffer += token;

        const sentenceEnd = isSentenceEnd(segmentBuffer);

        if (sentenceEnd) {
          const sentence = segmentBuffer.trim();
          const segmentText = segmentBuffer;

          if (voiceId && sentence.length > 0) {
            const seq = enqueueSpeak(sentence);
            displayChain = displayChain.then(async () => {
              if (currentGenId !== generationIdRef.current) return;
              if (typeof seq === "number") {
                await waitForAudioReady(seq, 900);
              }
              if (currentGenId !== generationIdRef.current) return;
              committedReply += segmentText;
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "bot",
                  content: committedReply,
                };
                return newMessages;
              });
            });
          } else {
            committedReply += segmentText;
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                role: "bot",
                content: committedReply,
              };
              return newMessages;
            });
          }

          segmentBuffer = "";
        }
      }
    }

    // 最后一段（未遇到句号的尾巴）
    if (segmentBuffer.trim()) {
      const tail = segmentBuffer;
      if (voiceId) {
        const seq = enqueueSpeak(segmentBuffer.trim());
        displayChain = displayChain.then(async () => {
          if (currentGenId !== generationIdRef.current) return;
          if (typeof seq === "number") {
            await waitForAudioReady(seq, 900);
          }
          if (currentGenId !== generationIdRef.current) return;
          committedReply += tail;
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: "bot",
              content: committedReply,
            };
            return newMessages;
          });
        });
      } else {
        committedReply += tail;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "bot",
            content: committedReply,
          };
          return newMessages;
        });
      }
    }

  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error(err);
    setBotState("idle");
  }
};

  useEffect(() => {
    if (isOpen) return;
    stopAllSpeech();
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopAllSpeech();
    };
  }, []);

  const handleCloseWithInterrupt = () => {
    stopAllSpeech();
    onClose();
  };
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* 背景 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseWithInterrupt}
          />

          {/* 主体 */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-6xl h-[85vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex"
          >
            {/* 左侧背景 + 动画 */}
            {/* 左侧背景 + 动画 */}
            <div className="relative w-3/5 bg-slate-200">

              {/* ⭐ 背景圖片：如為空 → 不渲染 img，改用灰底 */}
              {background && background.trim() !== "" ? (
                <img
                  src={background}
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 w-full h-full bg-slate-300 opacity-80" />
              )}

              {/* ⭐ 安全處理三段動畫：空字串 → 不渲染 video */}
              <motion.div
                className="absolute inset-0 flex items-end justify-center pb-12"
                transition={{ duration: 2, repeat: Infinity }}
              >
                {(() => {
                  const safeVideo =
                    videoSrc && videoSrc.trim() !== "" ? videoSrc : null;

                  if (safeVideo) {
                    return (
                      <video
                        src={safeVideo}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-[80%] object-contain drop-shadow-xl"
                      />
                    );
                  }

                  // ⭐ avatarUrl 也要安全 fallback
                  const safeAvatar =
                    avatarUrl && avatarUrl.trim() !== ""
                      ? avatarUrl
                      : "https://via.placeholder.com/400";

                  return (
                    <img
                      src={safeAvatar}
                      className="h-[80%] object-contain drop-shadow-xl"
                    />
                  );
                })()}
              </motion.div>
            </div>

            {/* 右侧聊天 */}
            <div className="w-2/5 flex flex-col bg-slate-50">
              {/* header */}
              <div className="bg-white border-b p-4 flex justify-between items-center">
                <div>
                  <div className="text-lg font-bold">{botName}</div>
                  <div className="text-xs text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    已發佈上線
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="relative" ref={dropdownRef}>
                    <button
                      className="p-2 rounded-full hover:bg-slate-200"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    {showDropdown && (
                      <div className="absolute right-0 top-10 bg-white rounded-xl shadow-xl border p-2 w-56">
                        <button
                          className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-lg w-full"
                          onClick={onEdit}
                        >
                          <Edit size={16} /> 編輯機器人
                        </button>

                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-lg w-full"
                        >
                          {copied ? <Check size={16} /> : <LinkIcon size={16} />}
                          {copied ? "已複製" : "複製分享連結"}
                        </button>

                        <button
                          className="flex items-center gap-2 p-2 hover:bg-red-50 text-red-600 rounded-lg w-full"
                          onClick={() => onDelete(botConfig.id)}
                        >
                          <Trash2 size={16} /> 刪除機器人
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    className="ml-2 p-2 text-slate-500 hover:bg-slate-100 rounded-full"
                    onClick={handleCloseWithInterrupt}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* messages */}
              <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-2xl text-sm ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white rounded-br-sm"
                          : "bg-white border border-slate-200 rounded-bl-sm"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}

                {/* thinking bubble */}
                {botState === "thinking" && (
                  <div className="flex">
                    <div className="bg-white border border-slate-200 p-3 rounded-2xl flex gap-1">
                      <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"></span>
                      <span
                        className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></span>
                    </div>
                  </div>
                )}
              </div>

              {/* input */}
              <div className="p-4 bg-white border-t">
                <div className="flex items-center bg-slate-100 rounded-full p-2">
                  <input
                    className="flex-1 bg-transparent px-3 text-sm outline-none"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="先回答機器人的提問..."
                  />
                  <button
                    onClick={stopAllSpeech}
                    disabled={!isStopAvailable}
                    className="p-3 mr-2 text-slate-600 bg-white rounded-full hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="停止回覆與語音"
                  >
                    <Square size={16} />
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim()}
                    className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
