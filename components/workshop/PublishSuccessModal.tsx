import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Copy,
  Check,
  Send,
  Mic,
  Square,
  MoreHorizontal,
  Link as LinkIcon,
  Edit,
  Trash2,
} from "lucide-react";
import { SequencePngPlayer } from "./SequencePngPlayer";
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
  const [isListening, setIsListening] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [botState, setBotState] = useState<"idle" | "thinking" | "speaking">(
    "idle"
  );
  const [isStopAvailable, setIsStopAvailable] = useState(false);
  const [awaitingAudioGesture, setAwaitingAudioGesture] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [openingReady, setOpeningReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [seqIdle, setSeqIdle] = useState<any>(null);
  const [seqThinking, setSeqThinking] = useState<any>(null);
  const [seqTalking, setSeqTalking] = useState<any>(null);
  const mobileDropdownRef = useRef<HTMLDivElement | null>(null);
  const desktopDropdownRef = useRef<HTMLDivElement | null>(null);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/bot/${botConfig.id || ""}`
      : `/bot/${botConfig.id || ""}`;
  const chatStyleRules = `
【回覆格式規則（強制）】
1) 禁止輸出舞台描述或動作描寫，例如「（微笑）」「（拱手）」「*點頭*」。
2) 非用戶明確要求角色扮演時，不要使用文言/古風自稱（如「老夫」「在下」）。
3) 每次回覆控制在 1~3 句，優先短句；除非用戶要求詳細版，否則不超過 120 字。
4) 不要長段落鋪陳，直接回答重點。
`.trim();

  const safeVideoIdle = videoIdle && videoIdle.trim() !== "" ? videoIdle : null;
  const safeVideoThinking =
    videoThinking && videoThinking.trim() !== "" ? videoThinking : null;
  const safeVideoTalking =
    videoTalking && videoTalking.trim() !== "" ? videoTalking : null;
  const isSeqManifest = (url?: string | null) =>
    Boolean(url && /\/manifest\.json(\?|$)/i.test(url));
  const hasAnyVideo = Boolean(safeVideoIdle || safeVideoThinking || safeVideoTalking);
  const shouldShowBooting = isOpen && (!openingReady || !mediaReady);
  const visualState =
    botState === "speaking"
      ? safeVideoTalking
        ? "speaking"
        : safeVideoIdle
        ? "idle"
        : "thinking"
      : botState === "thinking"
      ? safeVideoThinking
        ? "thinking"
        : safeVideoIdle
        ? "idle"
        : "speaking"
      : safeVideoIdle
      ? "idle"
      : safeVideoThinking
      ? "thinking"
      : "speaking";

  // -----------------------------
  // 点击外面自动关闭 dropdown
  // -----------------------------
  useEffect(() => {
    const handleClick = (e: any) => {
      const target = e.target as Node;
      const inMobile = mobileDropdownRef.current?.contains(target);
      const inDesktop = desktopDropdownRef.current?.contains(target);
      if (!inMobile && !inDesktop) {
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
    setMediaReady(false);
    const loadManifest = async (url: string, setter: (v: any) => void) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        setter(json);
      } catch {
        // ignore
      }
    };
    if (isSeqManifest(safeVideoIdle)) void loadManifest(safeVideoIdle!, setSeqIdle);
    if (isSeqManifest(safeVideoThinking)) void loadManifest(safeVideoThinking!, setSeqThinking);
    if (isSeqManifest(safeVideoTalking)) void loadManifest(safeVideoTalking!, setSeqTalking);
  }, [isOpen, safeVideoIdle, safeVideoThinking, safeVideoTalking]);

  useEffect(() => {
    if (!isOpen) return;

    const preloadVideo = (url: string) =>
      new Promise<void>((resolve) => {
        const v = document.createElement("video");
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          v.onloadeddata = null;
          v.onerror = null;
          resolve();
        };
        v.preload = "auto";
        v.muted = true;
        v.src = url;
        v.onloadeddata = finish;
        v.onerror = finish;
        window.setTimeout(finish, 1500);
      });

    const preloadSequenceFirstFrame = async (manifestUrl: string) => {
      try {
        const res = await fetch(manifestUrl);
        if (!res.ok) return;
        const manifest = await res.json();
        const firstFrame = `${manifest.folderUrl}/${String(manifest.pattern || "frame_%04d.png").replace("%04d", "0001")}`;
        await new Promise<void>((resolve) => {
          const img = new Image();
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          img.onload = finish;
          img.onerror = finish;
          img.src = firstFrame;
          window.setTimeout(finish, 1500);
        });
      } catch {
        // ignore
      }
    };

    (async () => {
      const tasks: Promise<void>[] = [];
      [safeVideoIdle, safeVideoThinking, safeVideoTalking]
        .filter((u): u is string => Boolean(u))
        .forEach((url) => {
          if (isSeqManifest(url)) {
            tasks.push(preloadSequenceFirstFrame(url));
          } else {
            tasks.push(preloadVideo(url));
          }
        });
      await Promise.all(tasks);
      setMediaReady(true);
    })();
  }, [isOpen, safeVideoIdle, safeVideoThinking, safeVideoTalking]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    setOpeningReady(false);
    if (voiceId) {
      // Set loading state before first paint to avoid chat UI flashing for 1-2 frames.
      setIsBooting(true);
      setMessages([]);
      setBotState("thinking");
      setIsStopAvailable(false);
    } else {
      setIsBooting(false);
      setOpeningReady(true);
    }
  }, [isOpen, voiceId]);

  useEffect(() => {
    if (!isOpen) return;

    clearProactiveTimer();
    botTurnsSinceUserRef.current = 0;
    proactiveCountRef.current = 0;
    hasUserSpokenRef.current = false;
    ttsSessionRef.current += 1;
    ttsSeq.current = 0;
    nextPlaySeq.current = 0;
    ttsInflight.current = 0;
    ttsTextQueue.current = [];
    ttsAudioMap.current.clear();
    playing.current = false;
    setIsStopAvailable(false);

    const openingMessage = `你好！我是 ${botName}，你現在最想解決什麼？`;
    const sessionId = ttsSessionRef.current;

    if (!voiceId) {
      setIsBooting(false);
      setBotState("idle");
      setMessages([
        {
          role: "bot",
          content: openingMessage,
        },
      ]);
      setOpeningReady(true);
      return;
    }

    setIsBooting(true);
    setBotState("thinking");
    setMessages([]);

    const openingSeq = ttsSeq.current++;
    let openingReady = false;
    requestTTSAudio(openingMessage, sessionId)
      .then((audio) => {
        if (!audio || sessionId !== ttsSessionRef.current) {
          return;
        }
        openingReady = true;
        ttsAudioMap.current.set(openingSeq, audio);
        setMessages([
          {
            role: "bot",
            content: openingMessage,
          },
        ]);
        setIsStopAvailable(true);
        setBotState("speaking");
        setIsBooting(false);
        setOpeningReady(true);
        tryPlayInOrder();
      })
      .catch((e) => {
        console.error("Opening TTS prepare error:", e);
      })
      .finally(() => {
        if (sessionId === ttsSessionRef.current && !openingReady) {
          setIsBooting(false);
          setMessages([
            {
              role: "bot",
              content: openingMessage,
            },
          ]);
          setBotState("idle");
          setOpeningReady(true);
        }
      });
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
  const ttsRequestControllers = useRef<Set<AbortController>>(new Set());
  const ttsSessionRef = useRef(0);
  const generationIdRef = useRef(0);
  const ttsSeq = useRef(0);
  const nextPlaySeq = useRef(0);
  const ttsInflight = useRef(0);
  const ttsTextQueue = useRef<{ seq: number; text: string }[]>([]);
  const ttsAudioMap = useRef<Map<number, HTMLAudioElement>>(new Map());
  const maxTtsInflight = 3;
  const speechRecognitionRef = useRef<any>(null);
  const sttWatchdogRef = useRef<number | null>(null);
  const sttSilenceTimerRef = useRef<number | null>(null);
  const sttTypingTokenRef = useRef(0);
  const sttTypingTimerRef = useRef<number | null>(null);
  const audioRetryTimerRef = useRef<number | null>(null);
  const lastUserGestureRef = useRef(0);
  const proactiveTimerRef = useRef<number | null>(null);
  const botTurnsSinceUserRef = useRef(0);
  const proactiveCountRef = useRef(0);
  const hasUserSpokenRef = useRef(false);
  const isListeningRef = useRef(false);
  const botStateRef = useRef<"idle" | "thinking" | "speaking">("idle");
  const PROACTIVE_INACTIVITY_MS = 15000;
  const PROACTIVE_AFTER_BOT_TURNS = 1;
  const PROACTIVE_MAX_PER_SESSION = 3;

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    botStateRef.current = botState;
  }, [botState]);

const requestTTSAudio = async (text: string, sessionId: number) => {

  if (!voiceId || !text.trim()) return;
  if (sessionId !== ttsSessionRef.current) return;

  const baseUrl = API_BASE;
  const controller = new AbortController();
  ttsRequestControllers.current.add(controller);

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
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    if (sessionId !== ttsSessionRef.current) return;

    const blob = await res.blob();
    if (sessionId !== ttsSessionRef.current) return;

    const audio = new Audio(URL.createObjectURL(blob));
    audio.playbackRate = 1.12;
    return audio;

  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    console.error("TTS error:", e);
  } finally {
    ttsRequestControllers.current.delete(controller);
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

  const seq = nextPlaySeq.current;
  const audio = ttsAudioMap.current.get(seq);
  if (!audio) {
    if (ttsInflight.current === 0 && ttsAudioMap.current.size === 0) {
      setBotState("idle");
      setIsStopAvailable(false);
    }
    return;
  }

  playing.current = true;
  activeAudio.current = audio;
  setBotState("speaking");
  void audio.play()
    .then(() => {
      ttsAudioMap.current.delete(seq);
      setAwaitingAudioGesture(false);
      if (audioRetryTimerRef.current) {
        window.clearTimeout(audioRetryTimerRef.current);
        audioRetryTimerRef.current = null;
      }
    })
    .catch((e) => {
      console.error("Audio play blocked:", e);
      playing.current = false;
      activeAudio.current = null;
      setAwaitingAudioGesture(true);
      setBotState("idle");
      setIsStopAvailable(true);
      if (
        Date.now() - lastUserGestureRef.current < 5000 &&
        !audioRetryTimerRef.current
      ) {
        audioRetryTimerRef.current = window.setTimeout(() => {
          audioRetryTimerRef.current = null;
          tryPlayInOrder();
        }, 250);
      }
    });

  audio.onended = () => {
    URL.revokeObjectURL(audio.src);
    activeAudio.current = null;
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
  audio.onerror = () => {
    URL.revokeObjectURL(audio.src);
    activeAudio.current = null;
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
};

useEffect(() => {
  if (!isOpen) return;
  const resumeAudio = () => {
    lastUserGestureRef.current = Date.now();
    if (!awaitingAudioGesture) return;
    tryPlayInOrder();
  };
  document.addEventListener("pointerdown", resumeAudio);
  document.addEventListener("touchstart", resumeAudio, { passive: true });
  document.addEventListener("keydown", resumeAudio);
  return () => {
    document.removeEventListener("pointerdown", resumeAudio);
    document.removeEventListener("touchstart", resumeAudio);
    document.removeEventListener("keydown", resumeAudio);
  };
}, [isOpen, awaitingAudioGesture]);

const pumpTTSRequests = () => {
  const sessionId = ttsSessionRef.current;
  while (
    ttsInflight.current < maxTtsInflight &&
    ttsTextQueue.current.length > 0
  ) {
    const item = ttsTextQueue.current.shift()!;
    ttsInflight.current += 1;

    requestTTSAudio(item.text, sessionId)
      .then((audio) => {
        if (!audio) return;
        if (sessionId !== ttsSessionRef.current) {
          URL.revokeObjectURL(audio.src);
          return;
        }
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

const clearProactiveTimer = () => {
  if (proactiveTimerRef.current) {
    window.clearTimeout(proactiveTimerRef.current);
    proactiveTimerRef.current = null;
  }
};

const pushProactiveQuestion = () => {
  const candidates = [
    "你想我先幫你整理重點，還是直接給你下一步建議？",
    "如果你願意，我可以先問你兩個關鍵問題再給最貼合的答案。",
    "我可以繼續幫你拆解，你想先從哪一部分開始？",
  ];
  const text = candidates[proactiveCountRef.current % candidates.length];
  setMessages((prev) => [...prev, { role: "bot", content: text }]);
  if (voiceId) {
    setIsStopAvailable(true);
    enqueueSpeak(text);
  }
  proactiveCountRef.current += 1;
  botTurnsSinceUserRef.current = PROACTIVE_AFTER_BOT_TURNS;
  if (proactiveCountRef.current < PROACTIVE_MAX_PER_SESSION) {
    scheduleProactiveCheck();
  }
};

const scheduleProactiveCheck = () => {
  clearProactiveTimer();
  proactiveTimerRef.current = window.setTimeout(() => {
    const shouldTrigger =
      hasUserSpokenRef.current &&
      botTurnsSinceUserRef.current >= PROACTIVE_AFTER_BOT_TURNS &&
      proactiveCountRef.current < PROACTIVE_MAX_PER_SESSION &&
      !shouldShowBooting &&
      !isListeningRef.current &&
      botStateRef.current !== "thinking";

    if (!shouldTrigger) return;
    pushProactiveQuestion();
  }, PROACTIVE_INACTIVITY_MS);
};

const countSentenceLike = (text: string) => {
  const matches = text.match(/[。！？.!?]/g);
  return Math.max(1, matches ? matches.length : 0);
};

const handleBotTurnCommitted = (text: string) => {
  if (!hasUserSpokenRef.current) return;
  botTurnsSinceUserRef.current += countSentenceLike(text);
  if (botTurnsSinceUserRef.current >= PROACTIVE_AFTER_BOT_TURNS) {
    scheduleProactiveCheck();
  }
};

const stopAllSpeech = () => {
  clearProactiveTimer();
  generationIdRef.current += 1;
  ttsSessionRef.current += 1;
  activeRequestController.current?.abort();
  activeRequestController.current = null;
  ttsRequestControllers.current.forEach((controller) => controller.abort());
  ttsRequestControllers.current.clear();

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
  setIsBooting(false);
};

const sendMessage = async (forcedText?: string) => {
  if (shouldShowBooting) return;
  const textToSend = (forcedText ?? inputText).trim();
  if (!textToSend) return;

  hasUserSpokenRef.current = true;
  botTurnsSinceUserRef.current = 0;
  clearProactiveTimer();
  stopAllSpeech();
  setIsStopAvailable(true);
  const userMsg = textToSend;
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

    await displayChain;
    if (currentGenId !== generationIdRef.current) return;
    if (committedReply.trim()) {
      handleBotTurnCommitted(committedReply);
    }

  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error(err);
    setBotState("idle");
  }
};

const stopSpeechInput = () => {
  sttTypingTokenRef.current += 1;
  if (sttWatchdogRef.current) {
    window.clearTimeout(sttWatchdogRef.current);
    sttWatchdogRef.current = null;
  }
  if (sttSilenceTimerRef.current) {
    window.clearTimeout(sttSilenceTimerRef.current);
    sttSilenceTimerRef.current = null;
  }
  if (sttTypingTimerRef.current) {
    window.clearInterval(sttTypingTimerRef.current);
    sttTypingTimerRef.current = null;
  }
  if (speechRecognitionRef.current) {
    try {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current.abort?.();
    } catch {
      // ignore
    }
  }
  setIsListening(false);
};

const startSpeechInput = async () => {
  if (shouldShowBooting) return;
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SR) {
    alert("此瀏覽器不支援語音輸入（建議使用 Chrome）。");
    return;
  }

  if (isListening) {
    stopSpeechInput();
    return;
  }

  // Mic acts as an interrupt: stop current AI speech/stream first, then listen.
  stopAllSpeech();

  if (!navigator.mediaDevices?.getUserMedia) {
    alert("目前環境不支援麥克風權限請求。");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (e: any) {
    const name = e?.name || "UnknownError";
    if (name === "NotAllowedError") {
      alert("麥克風權限被拒絕，請在瀏覽器設定中允許麥克風。");
      return;
    }
    alert("無法使用麥克風，請檢查系統與瀏覽器權限。");
    return;
  }

  const recognition = new SR();
  speechRecognitionRef.current = recognition;
  // Cantonese first for mobile Chrome; fallback handled by browser engine.
  recognition.lang = "yue-Hant-HK";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const clearSttTimers = () => {
    if (sttWatchdogRef.current) {
      window.clearTimeout(sttWatchdogRef.current);
      sttWatchdogRef.current = null;
    }
    if (sttSilenceTimerRef.current) {
      window.clearTimeout(sttSilenceTimerRef.current);
      sttSilenceTimerRef.current = null;
    }
  };

  const bumpSilenceTimer = () => {
    if (sttSilenceTimerRef.current) {
      window.clearTimeout(sttSilenceTimerRef.current);
    }
    sttSilenceTimerRef.current = window.setTimeout(() => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }, 2200);
  };

  recognition.onstart = () => {
    setIsListening(true);
    clearSttTimers();
    // Auto-stop if no result comes back, avoiding "stuck listening" state.
    sttWatchdogRef.current = window.setTimeout(() => {
      if (isListeningRef.current) {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
        setIsListening(false);
      }
    }, 10000);
    bumpSilenceTimer();
  };
  recognition.onsoundstart = bumpSilenceTimer;
  recognition.onspeechstart = bumpSilenceTimer;
  recognition.onspeechend = () => {
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  };
  recognition.onerror = (event: any) => {
    console.error("STT error:", event?.error || event);
    setIsListening(false);
    clearSttTimers();
    if (event?.error === "not-allowed") {
      alert("語音輸入權限被拒絕，請允許麥克風後再試。");
    } else if (event?.error === "no-speech") {
      alert("未偵測到語音，請再說一次。");
    } else if (event?.error === "audio-capture") {
      alert("找不到可用麥克風裝置。");
    }
  };
  recognition.onend = () => {
    setIsListening(false);
    clearSttTimers();
  };

  recognition.onresult = (event: any) => {
    bumpSilenceTimer();
    const results = Array.from(event?.results || []);
    const latestChunk = results
      .map((r: any) => r?.[0]?.transcript || "")
      .join("")
      .trim();
    if (!latestChunk) return;

    const hasFinal = results.some((r: any) => r?.isFinal);
    if (!hasFinal) {
      setInputText(latestChunk);
      return;
    }
    clearSttTimers();
    const transcript = latestChunk;

    sttTypingTokenRef.current += 1;
    const typingToken = sttTypingTokenRef.current;
    if (sttTypingTimerRef.current) {
      window.clearInterval(sttTypingTimerRef.current);
      sttTypingTimerRef.current = null;
    }

    let i = 0;
    setInputText("");
    sttTypingTimerRef.current = window.setInterval(() => {
      if (typingToken !== sttTypingTokenRef.current) {
        if (sttTypingTimerRef.current) {
          window.clearInterval(sttTypingTimerRef.current);
          sttTypingTimerRef.current = null;
        }
        return;
      }

      i += 1;
      const current = transcript.slice(0, i);
      setInputText(current);

      if (i >= transcript.length) {
        if (sttTypingTimerRef.current) {
          window.clearInterval(sttTypingTimerRef.current);
          sttTypingTimerRef.current = null;
        }
        void sendMessage(transcript);
      }
    }, 35);
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("STT start error:", e);
    setIsListening(false);
    clearSttTimers();
    alert("語音輸入啟動失敗，請稍後再試。");
  }
};

  useEffect(() => {
    if (isOpen) return;
    stopAllSpeech();
    setMessages([]);
    setOpeningReady(false);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (audioRetryTimerRef.current) {
        window.clearTimeout(audioRetryTimerRef.current);
        audioRetryTimerRef.current = null;
      }
      stopSpeechInput();
      stopAllSpeech();
    };
  }, []);

  const handleCloseWithInterrupt = () => {
    stopSpeechInput();
    stopAllSpeech();
    onClose();
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(botConfig.id);
  };
  if (!isOpen) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* 背景 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseWithInterrupt}
          />

          {/* 主体 */}
          <div className="relative w-full max-w-6xl h-[88vh] md:h-[85vh] bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div
              className={`h-full w-full flex flex-col md:flex-row transition-opacity duration-300 ${
                shouldShowBooting ? "opacity-0" : "opacity-100"
              }`}
            >
            {/* mobile header */}
            <div className="md:hidden order-2 bg-white border-b p-4 flex justify-between items-center">
              <div className="min-w-0">
                <div className="text-lg font-bold leading-tight break-words">{botName}</div>
                <div className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  已發佈上線
                </div>
              </div>

              <div className="flex items-center">
                <div className="relative" ref={mobileDropdownRef}>
                  <button
                    className="p-2 rounded-full hover:bg-slate-200"
                    onClick={() => setShowDropdown(!showDropdown)}
                  >
                    <MoreHorizontal size={18} />
                  </button>

                  {showDropdown && (
                    <div className="absolute right-0 top-10 z-30 bg-white rounded-xl shadow-xl border p-2 w-56">
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
                        onClick={() => {
                          setShowDropdown(false);
                          setShowDeleteConfirm(true);
                        }}
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

            {/* 左侧背景 + 动画 */}
            {/* 左侧背景 + 动画 */}
            <div className="relative order-1 md:order-none w-full md:w-3/5 h-[42vh] md:h-full bg-slate-200">

              {/* ⭐ 背景圖片：如為空 → 不渲染 img，改用灰底 */}
              {background && background.trim() !== "" ? (
                <img
                  src={background}
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 w-full h-full bg-slate-300 opacity-80" />
              )}

              <motion.div
                className="absolute inset-0 flex items-end justify-center pb-12"
                transition={{ duration: 2, repeat: Infinity }}
              >
                {hasAnyVideo ? (
                  <div className="relative h-full md:h-[80%] w-full">
                    {seqIdle ? (
                      <SequencePngPlayer
                        folderUrl={seqIdle.folderUrl}
                        pattern={seqIdle.pattern}
                        frameCount={seqIdle.frameCount}
                        fps={seqIdle.fps}
                        className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                          visualState === "idle" ? "block" : "hidden"
                        }`}
                        active={visualState === "idle"}
                      />
                    ) : safeVideoIdle && (
                      <video
                        src={safeVideoIdle}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                          visualState === "idle" ? "block" : "hidden"
                        }`}
                      />
                    )}
                    {seqThinking ? (
                      <SequencePngPlayer
                        folderUrl={seqThinking.folderUrl}
                        pattern={seqThinking.pattern}
                        frameCount={seqThinking.frameCount}
                        fps={seqThinking.fps}
                        className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                          visualState === "thinking" ? "block" : "hidden"
                        }`}
                        active={visualState === "thinking"}
                      />
                    ) : safeVideoThinking && (
                      <video
                        src={safeVideoThinking}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                          visualState === "thinking" ? "block" : "hidden"
                        }`}
                      />
                    )}
                    {seqTalking ? (
                      <SequencePngPlayer
                        folderUrl={seqTalking.folderUrl}
                        pattern={seqTalking.pattern}
                        frameCount={seqTalking.frameCount}
                        fps={seqTalking.fps}
                        className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                          visualState === "speaking" ? "block" : "hidden"
                        }`}
                        active={visualState === "speaking"}
                      />
                    ) : safeVideoTalking && (
                      <video
                        src={safeVideoTalking}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                          visualState === "speaking" ? "block" : "hidden"
                        }`}
                      />
                    )}
                  </div>
                ) : (
                  (() => {
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
                  })()
                )}
              </motion.div>
            </div>

            {/* 右侧聊天 */}
            <div className="order-3 w-full md:w-2/5 flex-1 min-h-0 md:h-full md:flex-none flex flex-col bg-slate-50">
              {/* header */}
              <div className="hidden md:flex bg-white border-b p-4 justify-between items-center">
                  <div className="min-w-0">
                  <div className="text-lg font-bold leading-tight break-words">{botName}</div>
                  <div className="text-xs text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    已發佈上線
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="relative" ref={desktopDropdownRef}>
                    <button
                      className="p-2 rounded-full hover:bg-slate-200"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    {showDropdown && (
                      <div className="absolute right-0 top-10 z-30 bg-white rounded-xl shadow-xl border p-2 w-56">
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
                          onClick={() => {
                            setShowDropdown(false);
                            setShowDeleteConfirm(true);
                          }}
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
                      className={`max-w-[86%] md:max-w-[70%] p-3 rounded-2xl text-sm leading-relaxed ${
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
                {awaitingAudioGesture && (
                  <div className="mb-2 text-xs text-amber-600">
                    已收到回覆語音，請點一下畫面以恢復播放。
                  </div>
                )}
                <div className="flex items-center bg-slate-100 rounded-full p-2">
                  <button
                    onClick={startSpeechInput}
                    disabled={shouldShowBooting}
                    className={`p-3 mr-2 rounded-full border ${
                      isListening
                        ? "bg-red-50 border-red-300 text-red-600"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                    } disabled:opacity-40`}
                    title={isListening ? "點擊停止語音輸入" : "語音輸入（廣東話）"}
                  >
                    <Mic size={16} />
                  </button>
                  <input
                    className="flex-1 bg-transparent px-3 text-sm outline-none"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    disabled={shouldShowBooting}
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
                    onClick={() => {
                      void sendMessage();
                    }}
                    disabled={shouldShowBooting || !inputText.trim()}
                    className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
            </div>

            {shouldShowBooting && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                <div className="text-sm text-slate-600">正在載入聊天與語音...</div>
              </div>
            )}
          </div>

          {showDeleteConfirm && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45">
              <div className="w-[92%] max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                <div className="text-base font-semibold text-slate-800">確認刪除這個聊天？</div>
                <div className="mt-2 text-sm text-slate-500">
                  刪除後將無法復原，分享連結也會失效。
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    取消
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={handleConfirmDelete}
                  >
                    確認刪除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
