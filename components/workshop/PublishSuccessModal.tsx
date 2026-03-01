import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Copy,
  Check,
  Send,
  MoreHorizontal,
  Link as LinkIcon,
  Edit,
  Trash2,
} from "lucide-react";

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

  const [messages, setMessages] = useState([
    { role: "bot", content: `你好！我是 ${botName}，我已經準備好和你聊天了！` },
  ]);

  const [inputText, setInputText] = useState("");
  const [copied, setCopied] = useState(false);
  const [botState, setBotState] = useState<"idle" | "thinking" | "speaking">(
    "idle"
  );

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const shareUrl = "https://smartedu.hk/bot/xxxxx";

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

  // -----------------------------
  // 🔥 复制链接
  // -----------------------------
  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

const sendMessage = async () => {
  if (!inputText.trim()) return;

  const userMsg = inputText;
  setInputText("");

  // 顯示使用者訊息
  setMessages(prev => [...prev, { role: "user", content: userMsg }]);

  // 進入 thinking
  setBotState("thinking");

  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

  try {
    // ========= 🔥 LLM + TTS 同時開始 =========
    const askReq = fetch(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt: botConfig.knowledgeBase + "\n" + botConfig.securityPrompt,
        userPrompt: userMsg,
      }),
    });

    const askRes = await askReq;
    const askData = await askRes.json();
    const reply = askData.reply || "（無回應）";

    // 如果沒有 voiceId → 直接輸出文字
    if (!voiceId) {
      setMessages(prev => [...prev, { role: "bot", content: reply }]);
      setBotState("idle");
      return;
    }

    // ========= 🔥 LLM 回覆後，立即請求 TTS =========
    const ttsReq = fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: reply,
        voiceId,
      }),
    });

    const audioRes = await ttsReq;
    const audioBlob = await audioRes.blob();
    const audio = new Audio(URL.createObjectURL(audioBlob));

    // ========= 🔥 TTS 準備好後 → 一次過開始播放 =========
    setMessages(prev => [...prev, { role: "bot", content: reply }]);
    setBotState("speaking");
    audio.play();

    audio.onended = () => {
      setBotState("idle");
    };

  } catch (error) {
    console.error("❌ 聊天或語音錯誤:", error);
    setBotState("idle");
  }
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
            onClick={onClose}
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
                    onClick={onClose}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                    placeholder="輸入訊息測試..."
                  />
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