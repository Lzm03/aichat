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
  MessageCircle,
  ChevronDown,
  Camera,
} from "lucide-react";
import { SequencePngPlayer } from "./SequencePngPlayer";
import { API_BASE } from "../../utils/api";
import { usePlatformDialog } from "../../hooks/usePlatformDialog";
import { PlatformDialog } from "../system/PlatformDialog";
import { readAuthSession } from "../../utils/auth";
import { markTrialEndedPopupPending } from "../../utils/trial-popup";

interface PublishSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  botConfig: any;
  onEdit: () => void;
  onDelete: (botId: string) => void;
  isSharedView?: boolean;
}

export const PublishSuccessModal: React.FC<PublishSuccessModalProps> = ({
  isOpen,
  onClose,
  botConfig,
  onEdit,
  onDelete,
  isSharedView = false,
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
    openingMessage: configuredOpeningMessage,
  } = botConfig;

  
  const lastTTS = useRef(0);
  const [messages, setMessages] = useState<{ role: "user" | "bot"; content: string; guidedTitle?: string; guidedBody?: string }[]>([]);

  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [botState, setBotState] = useState<"idle" | "thinking" | "speaking">(
    "idle"
  );
  const [isStopAvailable, setIsStopAvailable] = useState(false);
  const [awaitingAudioGesture, setAwaitingAudioGesture] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [openingReady, setOpeningReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [isMobileClient, setIsMobileClient] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [voiceLimitMessage, setVoiceLimitMessage] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [cameraBackgroundReady, setCameraBackgroundReady] = useState(false);
  const [cameraBackgroundError, setCameraBackgroundError] = useState("");
  const [cameraBackgroundLoading, setCameraBackgroundLoading] = useState(false);
  const [characterScale, setCharacterScale] = useState(0.82);
  const [characterOffset, setCharacterOffset] = useState({ x: 0, y: 0 });
  const [isRecordingScreen, setIsRecordingScreen] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [stagePhotoError, setStagePhotoError] = useState("");
  const [isCapturingStagePhoto, setIsCapturingStagePhoto] = useState(false);

  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [guidedTotalSteps, setGuidedTotalSteps] = useState(0);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();
  const [seqIdle, setSeqIdle] = useState<any>(null);
  const [seqThinking, setSeqThinking] = useState<any>(null);
  const [seqTalking, setSeqTalking] = useState<any>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageCaptureRef = useRef<HTMLDivElement | null>(null);
  const stageBackgroundImageRef = useRef<HTMLImageElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestTokenRef = useRef(0);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenChunksRef = useRef<BlobPart[]>([]);
  const speechMeterStreamRef = useRef<MediaStream | null>(null);
  const speechMeterAudioContextRef = useRef<AudioContext | null>(null);
  const speechMeterAnalyserRef = useRef<AnalyserNode | null>(null);
  const speechMeterFrameRef = useRef<number | null>(null);
  const arStageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const canEditBot = Boolean(readAuthSession()?.user?.id);
  const requestHeaders = isSharedView
    ? {
        "Content-Type": "application/json",
        Authorization: "",
      }
    : {
        "Content-Type": "application/json",
      };
  const pinchStateRef = useRef<{
    distance: number;
    scale: number;
    centerX: number;
    centerY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const mobileDropdownRef = useRef<HTMLDivElement | null>(null);
  const desktopDropdownRef = useRef<HTMLDivElement | null>(null);
  const voicePlaybackEnabledRef = useRef(Boolean(voiceId));
  const voiceLimitNoticeShownRef = useRef(false);
  const interactionRecordedRef = useRef(false);
  const ttsErrorNoticeShownRef = useRef(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/bot/${botConfig.id || ""}`
      : `/bot/${botConfig.id || ""}`;

  const buildDefaultOpeningMessage = React.useCallback(() => {
    return `你好！我是 ${botName}，我們一起開始今天的學習吧。`;
  }, [botName]);
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
  const shouldRequirePermission = Boolean(voiceId) && !voiceLimitMessage && isMobileClient;
  const shouldBlockChat = shouldShowBooting || (shouldRequirePermission && !permissionReady);
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
    if (!inputRef.current) return;
    inputRef.current.style.height = "0px";
    const fullHeight = inputRef.current.scrollHeight;
    const next = Math.min(fullHeight, 128);
    inputRef.current.style.height = `${Math.max(24, next)}px`;
    inputRef.current.style.overflowY = fullHeight > 128 ? "auto" : "hidden";
  }, [inputText]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setIsMobileClient(Boolean(coarse || uaMobile));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setChatPanelOpen(false);
  }, [isOpen, botConfig?.id]);

  useEffect(() => {
    if (!chatPanelOpen || !isMobileClient) return;
    window.requestAnimationFrame(() => {
      if (document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    });
  }, [chatPanelOpen, isMobileClient]);

  useEffect(() => {
    if (!isOpen || !botConfig?.id || interactionRecordedRef.current) return;
    interactionRecordedRef.current = true;
    const baseUrl = API_BASE;
    void fetch(`${baseUrl}/api/bots/${botConfig.id}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "chat_enter" }),
    }).catch(() => undefined);
  }, [isOpen, botConfig?.id]);

  useEffect(() => {
    if (!isOpen) {
      interactionRecordedRef.current = false;
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    voicePlaybackEnabledRef.current = Boolean(voiceId) && !voiceLimitMessage;
  }, [voiceId, voiceLimitMessage]);

  const disableVoicePlayback = React.useCallback((message?: string) => {
    const nextMessage = message?.trim() || "免費語音功能已用完，已自動切換為純文字回覆。";
    voicePlaybackEnabledRef.current = false;
    setVoiceLimitMessage(nextMessage);
    setAwaitingAudioGesture(false);
    setBotState((current) => (current === "speaking" ? "idle" : current));
    if (!voiceLimitNoticeShownRef.current) {
      voiceLimitNoticeShownRef.current = true;
      setMessages((prev) => [...prev, { role: "bot", content: nextMessage }]);
    }
  }, []);

  const resetArCharacterPose = React.useCallback(() => {
    setCharacterScale(0.82);
    setCharacterOffset({ x: 0, y: 0 });
  }, []);

  const clampCharacterScale = React.useCallback((next: number) => {
    return Math.min(1.35, Math.max(0.35, Number(next.toFixed(2))));
  }, []);

  const nudgeCharacterScale = React.useCallback(
    (delta: number) => {
      setCharacterScale((prev) => clampCharacterScale(prev + delta));
    },
    [clampCharacterScale]
  );

  const clampCharacterOffset = React.useCallback((x: number, y: number) => {
    const stageRect = arStageRef.current?.getBoundingClientRect();
    const maxX = stageRect ? stageRect.width * 0.32 : 220;
    const maxUp = stageRect ? stageRect.height * 0.55 : 260;
    const maxDown = stageRect ? stageRect.height * 0.08 : 40;

    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxUp, Math.min(maxDown, y)),
    };
  }, []);

  const handleCharacterPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || isMobileClient) return;
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: characterOffset.x,
        originY: characterOffset.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cameraBackgroundReady, characterOffset.x, characterOffset.y, isMobileClient]
  );

  const handleCharacterPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || isMobileClient || !dragStateRef.current) return;
      if (dragStateRef.current.pointerId !== event.pointerId) return;

      const dx = event.clientX - dragStateRef.current.startX;
      const dy = event.clientY - dragStateRef.current.startY;
      setCharacterOffset(
        clampCharacterOffset(
          dragStateRef.current.originX + dx,
          dragStateRef.current.originY + dy
        )
      );
    },
    [cameraBackgroundReady, clampCharacterOffset, isMobileClient]
  );

  const handleCharacterPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        dragStateRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  const handleCharacterTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || !isMobileClient) return;
      event.preventDefault();

      if (event.touches.length === 2) {
        const [a, b] = Array.from(event.touches);
        pinchStateRef.current = {
          distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
          scale: characterScale,
          centerX: (a.clientX + b.clientX) / 2,
          centerY: (a.clientY + b.clientY) / 2,
          originX: characterOffset.x,
          originY: characterOffset.y,
        };
        dragStateRef.current = null;
        return;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        dragStateRef.current = {
          pointerId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originX: characterOffset.x,
          originY: characterOffset.y,
        };
        pinchStateRef.current = null;
      }
    },
    [cameraBackgroundReady, characterOffset.x, characterOffset.y, characterScale, isMobileClient]
  );

  const handleCharacterTouchMove = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || !isMobileClient) return;
      if (event.touches.length === 2 && pinchStateRef.current) {
        event.preventDefault();
        const [a, b] = Array.from(event.touches);
        const nextDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const scaleRatio = nextDistance / Math.max(1, pinchStateRef.current.distance);
        setCharacterScale(clampCharacterScale(pinchStateRef.current.scale * scaleRatio));

        const nextCenterX = (a.clientX + b.clientX) / 2;
        const nextCenterY = (a.clientY + b.clientY) / 2;
        setCharacterOffset(
          clampCharacterOffset(
            pinchStateRef.current.originX + (nextCenterX - pinchStateRef.current.centerX),
            pinchStateRef.current.originY + (nextCenterY - pinchStateRef.current.centerY)
          )
        );
        return;
      }

      if (event.touches.length === 1 && dragStateRef.current) {
        event.preventDefault();
        const touch = event.touches[0];
        const dx = touch.clientX - dragStateRef.current.startX;
        const dy = touch.clientY - dragStateRef.current.startY;
        setCharacterOffset(
          clampCharacterOffset(
            dragStateRef.current.originX + dx,
            dragStateRef.current.originY + dy
          )
        );
      }
    },
    [cameraBackgroundReady, clampCharacterOffset, clampCharacterScale, isMobileClient]
  );

  const handleCharacterTouchEnd = React.useCallback(() => {
    dragStateRef.current = null;
    pinchStateRef.current = null;
  }, []);

  const stopCameraBackground = React.useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setCameraBackgroundReady(false);
    resetArCharacterPose();
  }, [resetArCharacterPose]);

  const cleanupScreenRecording = React.useCallback(() => {
    screenRecorderRef.current = null;
    screenChunksRef.current = [];
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setIsRecordingScreen(false);
  }, []);

  const stopScreenRecording = React.useCallback(() => {
    const recorder = screenRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    cleanupScreenRecording();
  }, [cleanupScreenRecording]);

  const startScreenRecording = React.useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setRecordingError("當前瀏覽器不支援畫面錄製");
      return;
    }

    setRecordingError("");
    if (isRecordingScreen) {
      stopScreenRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
        },
        audio: false,
      });

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      screenStreamRef.current = stream;
      screenRecorderRef.current = recorder;
      screenChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          screenChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(screenChunksRef.current, { type: recorder.mimeType || "video/webm" });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${botName || "chat-preview"}-${Date.now()}.webm`;
          a.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        cleanupScreenRecording();
      };

      recorder.onerror = () => {
        setRecordingError("錄製失敗，請重新嘗試");
        cleanupScreenRecording();
      };

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenRecording();
        };
      }

      recorder.start(1000);
      setIsRecordingScreen(true);
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "無法開始錄製畫面"
      );
      cleanupScreenRecording();
    }
  }, [botName, cleanupScreenRecording, isRecordingScreen, stopScreenRecording]);

  const captureStagePhoto = React.useCallback(async () => {
    if (isCapturingStagePhoto) return;
    const stageEl = stageCaptureRef.current;
    if (!stageEl || typeof document === "undefined") {
      setStagePhotoError("目前無法拍照");
      return;
    }

    try {
      setIsCapturingStagePhoto(true);
      setStagePhotoError("");
      const rect = stageEl.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const canvas = document.createElement("canvas");
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("無法建立畫布");
      ctx.scale(scale, scale);

      const coverDraw = (
        sourceWidth: number,
        sourceHeight: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number
      ) => {
        const srcRatio = sourceWidth / sourceHeight;
        const dstRatio = dw / dh;
        let sx = 0;
        let sy = 0;
        let sw = sourceWidth;
        let sh = sourceHeight;
        if (srcRatio > dstRatio) {
          sw = sourceHeight * dstRatio;
          sx = (sourceWidth - sw) / 2;
        } else {
          sh = sourceWidth / dstRatio;
          sy = (sourceHeight - sh) / 2;
        }
        return { sx, sy, sw, sh, dx, dy, dw, dh };
      };

      const drawSourceCover = (
        source: CanvasImageSource,
        sourceWidth: number,
        sourceHeight: number
      ) => {
        const box = coverDraw(sourceWidth, sourceHeight, 0, 0, width, height);
        ctx.drawImage(
          source,
          box.sx,
          box.sy,
          box.sw,
          box.sh,
          box.dx,
          box.dy,
          box.dw,
          box.dh
        );
      };

      const getContainDrawBox = (
        sourceWidth: number,
        sourceHeight: number,
        containerX: number,
        containerY: number,
        containerWidth: number,
        containerHeight: number
      ) => {
        const srcRatio = sourceWidth / sourceHeight;
        const dstRatio = containerWidth / containerHeight;

        let drawWidth = containerWidth;
        let drawHeight = containerHeight;

        if (srcRatio > dstRatio) {
          drawHeight = containerWidth / srcRatio;
        } else {
          drawWidth = containerHeight * srcRatio;
        }

        return {
          dx: containerX + (containerWidth - drawWidth) / 2,
          dy: containerY + (containerHeight - drawHeight) / 2,
          dw: drawWidth,
          dh: drawHeight,
        };
      };

      const toCanvasSafeUrl = (rawUrl: string) => {
        try {
          const resolved = new URL(rawUrl, window.location.href);
          const isLocalBackend =
            resolved.hostname === "localhost" || resolved.hostname === "127.0.0.1";
          if (resolved.origin === window.location.origin || isLocalBackend) {
            return resolved.toString();
          }
          return `${API_BASE}/api/media-proxy?url=${encodeURIComponent(resolved.toString())}`;
        } catch {
          return rawUrl;
        }
      };

      const loadSafeImage = async (rawUrl: string) => {
        const safeUrl = toCanvasSafeUrl(rawUrl);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = safeUrl;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("圖片載入失敗"));
        });
        return img;
      };

      if (cameraBackgroundReady && cameraVideoRef.current) {
        const video = cameraVideoRef.current;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (!isMobileClient) {
            ctx.save();
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            drawSourceCover(video, video.videoWidth, video.videoHeight);
            ctx.restore();
          } else {
            drawSourceCover(video, video.videoWidth, video.videoHeight);
          }
        }
      } else if (stageBackgroundImageRef.current) {
        const bgImg = stageBackgroundImageRef.current;
        const bgSrc = bgImg.currentSrc || bgImg.src;
        if (bgSrc) {
          const safeBgImg = await loadSafeImage(bgSrc);
          drawSourceCover(safeBgImg, safeBgImg.naturalWidth, safeBgImg.naturalHeight);
        } else if (bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
          drawSourceCover(bgImg, bgImg.naturalWidth, bgImg.naturalHeight);
        }
      } else {
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(0, 0, width, height);
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(15,23,42,0.08)");
      gradient.addColorStop(1, "rgba(15,23,42,0.28)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const characterNode = Array.from(
        stageEl.querySelectorAll('[data-stage-character="true"]')
      ).find((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const nodeRect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          nodeRect.width > 0 &&
          nodeRect.height > 0
        );
      }) as HTMLElement | undefined;
      if (characterNode) {
        const characterRect = characterNode.getBoundingClientRect();
        const containerX = characterRect.left - rect.left;
        const containerY = characterRect.top - rect.top;
        const containerWidth = characterRect.width;
        const containerHeight = characterRect.height;

        if (characterNode instanceof HTMLVideoElement) {
          if (characterNode.videoWidth > 0 && characterNode.videoHeight > 0) {
            const drawBox = getContainDrawBox(
              characterNode.videoWidth,
              characterNode.videoHeight,
              containerX,
              containerY,
              containerWidth,
              containerHeight
            );
            const safeVideoUrl = characterNode.currentSrc || characterNode.src;
            if (safeVideoUrl) {
              const tempVideo = document.createElement("video");
              tempVideo.muted = true;
              tempVideo.playsInline = true;
              tempVideo.preload = "auto";
              tempVideo.crossOrigin = "anonymous";
              tempVideo.src = toCanvasSafeUrl(safeVideoUrl);

              await new Promise<void>((resolve, reject) => {
                tempVideo.onloadeddata = () => resolve();
                tempVideo.onerror = () => reject(new Error("角色影片載入失敗"));
              });

              if (Number.isFinite(characterNode.currentTime) && characterNode.currentTime > 0) {
                try {
                  await new Promise<void>((resolve, reject) => {
                    tempVideo.onseeked = () => resolve();
                    tempVideo.onerror = () => reject(new Error("角色影片定位失敗"));
                    tempVideo.currentTime = Math.min(
                      characterNode.currentTime,
                      Math.max(0, (tempVideo.duration || characterNode.currentTime) - 0.05)
                    );
                  });
                } catch {
                  // Ignore seek failure and use the closest ready frame.
                }
              }

              if (tempVideo.videoWidth > 0 && tempVideo.videoHeight > 0) {
                ctx.drawImage(
                  tempVideo,
                  drawBox.dx,
                  drawBox.dy,
                  drawBox.dw,
                  drawBox.dh
                );
              }
            } else {
              ctx.drawImage(
                characterNode,
                drawBox.dx,
                drawBox.dy,
                drawBox.dw,
                drawBox.dh
              );
            }
          }
        } else if (characterNode instanceof HTMLImageElement) {
          const safeCharacterSrc = characterNode.currentSrc || characterNode.src;
          if (safeCharacterSrc) {
            const safeCharacterImg = await loadSafeImage(safeCharacterSrc);
            const drawBox = getContainDrawBox(
              safeCharacterImg.naturalWidth,
              safeCharacterImg.naturalHeight,
              containerX,
              containerY,
              containerWidth,
              containerHeight
            );
            ctx.drawImage(
              safeCharacterImg,
              drawBox.dx,
              drawBox.dy,
              drawBox.dw,
              drawBox.dh
            );
          } else if (characterNode.naturalWidth > 0 && characterNode.naturalHeight > 0) {
            const drawBox = getContainDrawBox(
              characterNode.naturalWidth,
              characterNode.naturalHeight,
              containerX,
              containerY,
              containerWidth,
              containerHeight
            );
            ctx.drawImage(
              characterNode,
              drawBox.dx,
              drawBox.dy,
              drawBox.dw,
              drawBox.dh
            );
          }
        }
      }

      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${botName || "stage-photo"}-${Date.now()}.png`;
      a.click();
    } catch (error) {
      console.error("Stage capture failed:", error);
      setStagePhotoError(error instanceof Error ? error.message : "拍照失敗");
    } finally {
      window.setTimeout(() => {
        setIsCapturingStagePhoto(false);
      }, 1200);
    }
  }, [botName, cameraBackgroundReady, isCapturingStagePhoto, isMobileClient]);

  const startCameraBackground = React.useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraBackgroundError("當前環境不支援相機背景");
      setCameraBackgroundReady(false);
      return;
    }

    setCameraBackgroundLoading(true);
    setCameraBackgroundError("");
    const requestToken = cameraRequestTokenRef.current + 1;
    cameraRequestTokenRef.current = requestToken;

    try {
      stopCameraBackground();
      let permissionState = "unknown";
      try {
        const perm = await navigator.permissions?.query?.({
          name: "camera" as PermissionName,
        });
        permissionState = perm?.state || "unknown";
      } catch {
        permissionState = "unsupported";
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      if (!videoInputs.length) {
        throw new Error("沒有找到可用攝像頭裝置");
      }

      if (permissionState === "denied") {
        throw new Error("瀏覽器已封鎖相機權限");
      }

      const preferredVideoConstraints = isMobileClient
        ? {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            deviceId: videoInputs[0]?.deviceId
              ? { ideal: videoInputs[0].deviceId }
              : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      const fallbackVideoConstraints = {
        deviceId: videoInputs[0]?.deviceId
          ? { ideal: videoInputs[0].deviceId }
          : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };

      const getStream = async () => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: preferredVideoConstraints,
            audio: false,
          });
        } catch (error) {
          if (!isMobileClient) throw error;
          return await navigator.mediaDevices.getUserMedia({
            video: fallbackVideoConstraints,
            audio: false,
          });
        }
      };

      const stream = await Promise.race([
        getStream(),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("相機權限請求逾時，請檢查瀏覽器權限設定")), 8000)
        ),
      ]);

      if (cameraRequestTokenRef.current !== requestToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      cameraStreamRef.current = stream;

      if (!cameraVideoRef.current) {
        stopCameraBackground();
        return;
      }

      const videoEl = cameraVideoRef.current;
      videoEl.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("相機串流已取得，但畫面未成功載入"));
        }, 5000);

        const cleanup = () => {
          window.clearTimeout(timeout);
          videoEl.onloadedmetadata = null;
          videoEl.oncanplay = null;
          videoEl.onerror = null;
        };

        const markReady = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };

        videoEl.onloadedmetadata = () => {
          void videoEl.play().catch(() => undefined);
          markReady();
        };
        videoEl.oncanplay = markReady;
        videoEl.onerror = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("相機畫面初始化失敗"));
        };
      });

      setCameraBackgroundReady(true);
      setCharacterScale(0.68);
      setCharacterOffset({ x: 0, y: 0 });
      setCameraBackgroundLoading(false);
    } catch (error) {
      setCameraBackgroundReady(false);
      setCameraBackgroundLoading(false);
      setCameraBackgroundError(
        error instanceof Error ? error.message : "相機權限被拒絕或裝置不可用"
      );
      stopCameraBackground();
    }
  }, [isMobileClient, stopCameraBackground]);

  useEffect(() => {
    if (!isOpen) {
      stopCameraBackground();
      stopScreenRecording();
      setCameraBackgroundLoading(false);
      setCameraBackgroundError("");
      setRecordingError("");
      return;
    }

    return () => {
      stopCameraBackground();
      stopScreenRecording();
    };
  }, [isOpen, stopCameraBackground, stopScreenRecording]);

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
    if (shouldRequirePermission && !permissionReady) {
      // Wait for explicit user authorization before booting opening voice.
      setIsBooting(false);
      setMessages([]);
      setBotState("idle");
      setIsStopAvailable(false);
      setOpeningReady(true);
      return;
    }
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
  }, [isOpen, voiceId, permissionReady, shouldRequirePermission]);

  useEffect(() => {
    if (!isOpen) return;
    if (shouldRequirePermission && !permissionReady) {
      stopAllSpeech();
      setMessages([]);
      setBotState("idle");
      setIsStopAvailable(false);
      return;
    }

    ttsSessionRef.current += 1;
    ttsSeq.current = 0;
    nextPlaySeq.current = 0;
    ttsInflight.current = 0;
    ttsTextQueue.current = [];
    ttsAudioMap.current.clear();
    playing.current = false;
    setIsStopAvailable(false);

    const openingMessage =
      String(configuredOpeningMessage || "").trim() || buildDefaultOpeningMessage();
    const sessionId = ttsSessionRef.current;

    if (!voicePlaybackEnabledRef.current) {
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
  }, [botName, configuredOpeningMessage, isOpen, voiceId, permissionReady, shouldRequirePermission, buildDefaultOpeningMessage]);
  
  

  // -----------------------------
  // 🔥 复制链接
  // -----------------------------
  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const playing = useRef(false);
  const activeAudioUrl = useRef<string | null>(null);
  const ttsPlayerRef = useRef<HTMLAudioElement | null>(null);
  const activeRequestController = useRef<AbortController | null>(null);
  const ttsRequestControllers = useRef<Set<AbortController>>(new Set());
  const ttsSessionRef = useRef(0);
  const generationIdRef = useRef(0);
  const ttsSeq = useRef(0);
  const nextPlaySeq = useRef(0);
  const ttsInflight = useRef(0);
  const ttsTextQueue = useRef<{ seq: number; text: string }[]>([]);
  const ttsAudioMap = useRef<Map<number, string>>(new Map());
  const maxTtsInflight = 3;
  const speechRecognitionRef = useRef<any>(null);
  const sttStartingRef = useRef(false);
  const sttWatchdogRef = useRef<number | null>(null);
  const sttSilenceTimerRef = useRef<number | null>(null);
  const sttTypingTokenRef = useRef(0);
  const sttTypingTimerRef = useRef<number | null>(null);
  const sttAutoSendTimerRef = useRef<number | null>(null);
  const audioRetryTimerRef = useRef<number | null>(null);
  const lastUserGestureRef = useRef(0);
  const isListeningRef = useRef(false);
  const botStateRef = useRef<"idle" | "thinking" | "speaking">("idle");

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    botStateRef.current = botState;
  }, [botState]);

const requestTTSAudio = async (text: string, sessionId: number) => {

  if (!voicePlaybackEnabledRef.current || !voiceId || !text.trim()) return;
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
      headers: requestHeaders,
      body: JSON.stringify({
        text,
        voiceId,
        usageType: "chat_voice",
        sharedBotId: isSharedView ? botConfig.id : undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const message = data?.error || `TTS failed: ${res.status}`;
      if (res.status === 402) {
        disableVoicePlayback(message);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        disableVoicePlayback("語音回覆需要登入狀態，請重新登入後再試。");
        return;
      }
      throw new Error(message);
    }
    if (sessionId !== ttsSessionRef.current) return;

    const blob = await res.blob();
    if (sessionId !== ttsSessionRef.current) return;
    return URL.createObjectURL(blob);

  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    console.error("TTS error:", e);
    if (!ttsErrorNoticeShownRef.current) {
      ttsErrorNoticeShownRef.current = true;
      showAlert({
        title: "語音暫時不可用",
        message: "目前語音服務發生錯誤，系統已先以文字回覆。請稍後再試。",
      });
    }
  } finally {
    ttsRequestControllers.current.delete(controller);
  }
};

const enqueueSpeak = (text: string) => {
  if (!voicePlaybackEnabledRef.current || !voiceId || !text.trim()) return;
  const seq = ttsSeq.current++;
  ttsTextQueue.current.push({ seq, text });
  pumpTTSRequests();
  return seq;
};

const waitForAudioReady = (seq: number, timeoutMs = 1000) =>
  new Promise<void>((resolve) => {
    if (!voicePlaybackEnabledRef.current) {
      resolve();
      return;
    }
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
  if (shouldRequirePermission && !permissionReady) return;
  if (playing.current) return;
  if (!ttsPlayerRef.current) {
    ttsPlayerRef.current = new Audio();
    ttsPlayerRef.current.preload = "auto";
  }
  const player = ttsPlayerRef.current;

  const seq = nextPlaySeq.current;
  const audioUrl = ttsAudioMap.current.get(seq);
  if (!audioUrl) {
    if (ttsInflight.current === 0 && ttsAudioMap.current.size === 0) {
      setBotState("idle");
      setIsStopAvailable(false);
    }
    return;
  }

  playing.current = true;
  activeAudioUrl.current = audioUrl;
  player.src = audioUrl;
  player.playbackRate = 1.12;
  setBotState("speaking");
  void player.play()
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
      activeAudioUrl.current = null;
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

  player.onended = () => {
    if (activeAudioUrl.current) {
      URL.revokeObjectURL(activeAudioUrl.current);
      activeAudioUrl.current = null;
    }
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
  player.onerror = () => {
    if (activeAudioUrl.current) {
      URL.revokeObjectURL(activeAudioUrl.current);
      activeAudioUrl.current = null;
    }
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
};

useEffect(() => {
  if (!isOpen) return;
  const resumeAudio = () => {
    lastUserGestureRef.current = Date.now();
    if (isListeningRef.current || sttStartingRef.current) return;
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
      .then((audioUrl) => {
        if (!audioUrl) return;
        if (sessionId !== ttsSessionRef.current) {
          URL.revokeObjectURL(audioUrl);
          return;
        }
        ttsAudioMap.current.set(item.seq, audioUrl);
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
  ttsSessionRef.current += 1;
  activeRequestController.current?.abort();
  activeRequestController.current = null;
  ttsRequestControllers.current.forEach((controller) => controller.abort());
  ttsRequestControllers.current.clear();

  if (ttsPlayerRef.current) {
    ttsPlayerRef.current.pause();
    ttsPlayerRef.current.currentTime = 0;
    ttsPlayerRef.current.onended = null;
    ttsPlayerRef.current.onerror = null;
  }
  if (activeAudioUrl.current) {
    URL.revokeObjectURL(activeAudioUrl.current);
    activeAudioUrl.current = null;
  }

  ttsAudioMap.current.forEach((audioUrl) => {
    URL.revokeObjectURL(audioUrl);
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
  if (shouldBlockChat) return;
  const textToSend = (forcedText ?? inputText).trim();
  if (!textToSend) return;

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
      headers: requestHeaders,
      body: JSON.stringify({
        systemPrompt:
          botConfig.knowledgeBase +
          "\n" +
          botConfig.securityPrompt +
          "\n" +
          chatStyleRules,
        userPrompt: userMsg,
        botId: botConfig.id,
        stream: false,
        teachingHint: guidedMode ? "continue" : "auto",
        usageType: "chat_message",
        sharedBotId: isSharedView ? botConfig.id : undefined,
      }),
      signal: controller.signal,
    });
    activeRequestController.current = null;
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const errorMessage = data?.error || `聊天請求失敗：${response.status}`;
      if (response.status === 402 || /對話次數已用完|請升級到付費版|功能使用次數不足/.test(String(errorMessage))) {
        markTrialEndedPopupPending();
        window.location.href = "/";
        return;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const committedReply = String(data?.reply || "");
    const parseGuidedCard = (text: string) => {
      const normalized = text.trim();
      const m = normalized.match(/^(Step\s+\d+(?:\/\d+)?(?:（[^）]+）)?(?:\s*評估)?)\s*[\n：:]\s*([\s\S]*)$/);
      if (!m) return { title: "", body: normalized };
      return { title: m[1].trim(), body: (m[2] || "").trim() };
    };
    const guidedCard = Boolean(data?.teachingMode) ? parseGuidedCard(committedReply) : { title: "", body: committedReply };
    setGuidedMode(Boolean(data?.teachingMode));
    setGuidedStepIndex(Number(data?.stepIndex || 0));
    setGuidedTotalSteps(Number(data?.totalSteps || 0));
    setMessages(prev => [...prev, { role: "bot", content: "", guidedTitle: guidedCard.title }]);

    const ttsSource = guidedCard.body || committedReply;
    const segments = ttsSource
      .split(/(?<=[。！？!?；;\n])/)
      .map((s) => s.trim())
      .filter(Boolean);
    let progressiveReply = "";
    let progressiveChain = Promise.resolve();

    for (const segment of segments) {
      if (voicePlaybackEnabledRef.current) {
        const seq = enqueueSpeak(segment);
        progressiveChain = progressiveChain.then(async () => {
          if (currentGenId !== generationIdRef.current) return;
          if (typeof seq === "number") {
            await waitForAudioReady(seq, 900);
          }
          if (currentGenId !== generationIdRef.current) return;
          progressiveReply += (progressiveReply ? "\n" : "") + segment;
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { role: "bot", content: progressiveReply, guidedTitle: guidedCard.title, guidedBody: progressiveReply };
            return newMessages;
          });
        });
      } else {
        progressiveReply += (progressiveReply ? "\n" : "") + segment;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: "bot", content: progressiveReply, guidedTitle: guidedCard.title, guidedBody: progressiveReply };
          return newMessages;
        });
      }
    }

    await progressiveChain;
    if (currentGenId !== generationIdRef.current) return;
    setBotState((current) => (current === "thinking" ? "idle" : current));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error(err);
    setBotState("idle");
    setMessages((prev) => [
      ...prev,
      {
        role: "bot",
        content:
          err instanceof Error
            ? err.message
            : "目前無法完成回覆，請稍後再試。",
      },
    ]);
  }
};

const stopSpeechInput = (forceAbort = false) => {
  sttTypingTokenRef.current += 1;
  sttStartingRef.current = false;
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
  if (sttAutoSendTimerRef.current) {
    window.clearTimeout(sttAutoSendTimerRef.current);
    sttAutoSendTimerRef.current = null;
  }
  if (speechRecognitionRef.current) {
    try {
      speechRecognitionRef.current.stop();
      if (forceAbort) {
        speechRecognitionRef.current.abort?.();
      }
    } catch {
      // ignore
    }
    speechRecognitionRef.current = null;
  }
  if (speechMeterFrameRef.current) {
    window.cancelAnimationFrame(speechMeterFrameRef.current);
    speechMeterFrameRef.current = null;
  }
  if (speechMeterStreamRef.current) {
    speechMeterStreamRef.current.getTracks().forEach((track) => track.stop());
    speechMeterStreamRef.current = null;
  }
  if (speechMeterAudioContextRef.current) {
    void speechMeterAudioContextRef.current.close().catch(() => undefined);
    speechMeterAudioContextRef.current = null;
  }
  speechMeterAnalyserRef.current = null;
  setVoiceLevel(0);
  setIsListening(false);
};

const startSpeechInput = async () => {
  if (shouldBlockChat) return;
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SR) {
    showAlert({
      title: "不支援語音輸入",
      message: "此瀏覽器暫不支援語音輸入，建議使用 Chrome。",
    });
    return;
  }

  if (isListening) {
    // If state is stuck on mobile Chrome, force restart instead of just stopping.
    stopSpeechInput(true);
    await new Promise((r) => window.setTimeout(r, 120));
  }

  if (sttStartingRef.current) return;
  sttStartingRef.current = true;
  setAwaitingAudioGesture(false);
  if (audioRetryTimerRef.current) {
    window.clearTimeout(audioRetryTimerRef.current);
    audioRetryTimerRef.current = null;
  }

  // Chrome mobile can keep an internal stale session; hard-reset before each new start.
  if (speechRecognitionRef.current) {
    stopSpeechInput(true);
    await new Promise((r) => window.setTimeout(r, 120));
  }

  // Mic acts as an interrupt: stop current AI speech/stream first, then listen.
  stopAllSpeech();

  if (!navigator.mediaDevices?.getUserMedia) {
    showAlert({
      title: "麥克風不可用",
      message: "目前環境不支援麥克風權限請求。",
      tone: "danger",
    });
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    speechMeterStreamRef.current = stream;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const audioContext = new AudioCtx();
      speechMeterAudioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      speechMeterAnalyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.fftSize);

      const updateLevel = () => {
        const currentAnalyser = speechMeterAnalyserRef.current;
        if (!currentAnalyser) return;
        currentAnalyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const boosted = Math.min(1, rms * 4.2);
        setVoiceLevel(boosted);
        speechMeterFrameRef.current = window.requestAnimationFrame(updateLevel);
      };

      speechMeterFrameRef.current = window.requestAnimationFrame(updateLevel);
    }
  } catch (e: any) {
    sttStartingRef.current = false;
    const name = e?.name || "UnknownError";
    if (name === "NotAllowedError") {
      showAlert({
        title: "麥克風權限被拒絕",
        message: "請在瀏覽器設定中允許麥克風後再試。",
        tone: "danger",
      });
      return;
    }
    showAlert({
      title: "無法使用麥克風",
      message: "請檢查系統與瀏覽器權限後再試。",
      tone: "danger",
    });
    return;
  }

  const recognition = new SR();
  speechRecognitionRef.current = recognition;
  // Force Hong Kong Chinese for better Cantonese behavior on mobile Chrome.
  recognition.lang = "zh-HK";
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
    sttStartingRef.current = false;
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
    sttStartingRef.current = false;
    console.error("STT error:", event?.error || event);
    setIsListening(false);
    clearSttTimers();
    if (event?.error === "not-allowed") {
      showAlert({
        title: "語音輸入權限被拒絕",
        message: "請允許麥克風後再試。",
        tone: "danger",
      });
    } else if (event?.error === "no-speech") {
      showAlert({
        title: "未偵測到語音",
        message: "請再說一次。",
      });
    } else if (event?.error === "audio-capture") {
      showAlert({
        title: "找不到麥克風",
        message: "目前找不到可用的麥克風裝置。",
        tone: "danger",
      });
    }
  };
  recognition.onend = () => {
    sttStartingRef.current = false;
    setIsListening(false);
    clearSttTimers();
    speechRecognitionRef.current = null;
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
    if (sttAutoSendTimerRef.current) {
      window.clearTimeout(sttAutoSendTimerRef.current);
      sttAutoSendTimerRef.current = null;
    }

    let i = 0;
    setInputText("");
    sttAutoSendTimerRef.current = window.setTimeout(() => {
      if (typingToken !== sttTypingTokenRef.current) return;
      sttAutoSendTimerRef.current = null;
      if (sttTypingTimerRef.current) {
        window.clearInterval(sttTypingTimerRef.current);
        sttTypingTimerRef.current = null;
      }
      setInputText(transcript);
      void sendMessage(transcript);
    }, Math.max(220, Math.min(transcript.length * 35 + 120, 900)));

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
        if (sttAutoSendTimerRef.current) {
          window.clearTimeout(sttAutoSendTimerRef.current);
          sttAutoSendTimerRef.current = null;
        }
        void sendMessage(transcript);
      }
    }, 35);
  };

  try {
    recognition.start();
  } catch (e) {
    sttStartingRef.current = false;
    console.error("STT start error:", e);
    // Retry once after a short cooldown for Chrome's intermittent InvalidState cases.
    try {
      await new Promise((r) => window.setTimeout(r, 180));
      recognition.start();
      return;
    } catch (retryErr) {
      console.error("STT retry start error:", retryErr);
      setIsListening(false);
      clearSttTimers();
      showAlert({
        title: "語音輸入啟動失敗",
        message: "請稍後再試。",
        tone: "danger",
      });
    }
  }
};

const unlockAudioAndMic = async () => {
  if (isUnlocking || permissionReady) return;
  setIsUnlocking(true);
  setPermissionError("");
  if (typeof window === "undefined") {
    setIsUnlocking(false);
    return;
  }
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    }
    // Enter chat immediately once mic permission is granted.
    setPermissionReady(true);
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      await ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.01);
      setTimeout(() => {
        void ctx.close();
      }, 30);
    }
    if (!ttsPlayerRef.current) {
      ttsPlayerRef.current = new Audio();
      ttsPlayerRef.current.preload = "auto";
    }
    ttsPlayerRef.current.muted = true;
    await ttsPlayerRef.current.play().catch(() => {});
    ttsPlayerRef.current.pause();
    ttsPlayerRef.current.muted = false;
  } catch (e: any) {
    const name = e?.name || "UnknownError";
    setPermissionReady(false);
    if (name === "NotAllowedError") {
      setPermissionError("你拒絕了麥克風權限，請在瀏覽器設定中允許後再試。");
    } else {
      setPermissionError("授權失敗，請檢查手機瀏覽器麥克風與音訊權限。");
    }
  } finally {
    setIsUnlocking(false);
  }
};

  useEffect(() => {
    if (isOpen) return;
    stopAllSpeech();
    setMessages([]);
    setOpeningReady(false);
    setVoiceLimitMessage("");
    voiceLimitNoticeShownRef.current = false;
    ttsErrorNoticeShownRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!voiceId || !shouldRequirePermission) {
      setPermissionReady(true);
      setPermissionError("");
      return;
    }
    // Require one explicit tap after each open, then keep unlocked within this session.
    setPermissionReady(false);
  }, [isOpen, voiceId, shouldRequirePermission]);

  useEffect(() => {
    return () => {
      if (audioRetryTimerRef.current) {
        window.clearTimeout(audioRetryTimerRef.current);
        audioRetryTimerRef.current = null;
      }
      stopSpeechInput(true);
      stopAllSpeech();
    };
  }, []);

  const handleCloseWithInterrupt = () => {
    stopSpeechInput(true);
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-white p-4 md:bg-transparent md:p-4">
          {/* 背景 */}
          <div
            className="absolute inset-0 bg-white md:bg-black/50 md:backdrop-blur-sm"
            onClick={handleCloseWithInterrupt}
          />

          {/* 主体 */}
          <div className="relative h-[92svh] w-full max-w-[720px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_22px_80px_rgba(15,23,42,0.16)] md:h-[92vh] md:max-w-7xl md:rounded-3xl md:border-0 md:shadow-2xl">
            <div
              className={`relative h-full w-full overflow-hidden rounded-[1.5rem] bg-[#f8fafc] transition-all duration-300 md:flex md:rounded-3xl ${
                shouldShowBooting ? "opacity-0" : "opacity-100"
              }`}
            >
            {/* 左侧背景 + 动画 */}
            <div
              ref={stageCaptureRef}
              className={`relative h-full w-full bg-slate-200 transition-all duration-300 ${
                chatPanelOpen ? "md:w-[56%]" : "md:w-full"
              }`}
            >
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                crossOrigin="anonymous"
                className={`absolute inset-0 w-full h-full object-cover ${
                  cameraBackgroundReady && !isMobileClient ? "scale-x-[-1]" : ""
                } ${
                  cameraBackgroundReady ? "block" : "hidden"
                }`}
              />

              {!cameraBackgroundReady && background && background.trim() !== "" ? (
                <img
                  ref={stageBackgroundImageRef}
                  src={background}
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                !cameraBackgroundReady && (
                  <div className="absolute inset-0 w-full h-full bg-slate-300 opacity-80" />
                )
              )}

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,16,0.16)_0%,rgba(8,12,16,0.05)_34%,rgba(8,12,16,0.42)_100%)]" />
              <div className="absolute right-4 top-5 z-30 flex flex-col items-center gap-2 md:right-6 md:top-6 md:flex-row md:gap-3">
                <button
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg backdrop-blur transition-all duration-200 ${
                    chatPanelOpen
                      ? "bg-white/22 ring-2 ring-white/65 shadow-[0_8px_24px_rgba(245,158,11,0.24)]"
                      : "bg-black/45 hover:bg-black/60"
                  }`}
                  onClick={() => setChatPanelOpen((prev) => !prev)}
                  title={chatPanelOpen ? "隱藏聊天框" : "顯示聊天框"}
                >
                  <MessageCircle size={20} />
                </button>
                {!chatPanelOpen && (
                  <>
                    <div className="relative" ref={desktopDropdownRef}>
                      <button
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/45 text-white shadow-lg backdrop-blur hover:bg-black/60"
                        onClick={() => setShowDropdown(!showDropdown)}
                      >
                        <MoreHorizontal size={18} />
                      </button>

                      {showDropdown && (
                        <div className="absolute right-0 top-16 z-30 bg-white rounded-xl shadow-xl border p-2 w-56 text-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              if (!canEditBot) return;
                              setShowDropdown(false);
                              onEdit();
                            }}
                            disabled={!canEditBot}
                            className={`flex items-center gap-2 rounded-lg w-full p-2 ${
                              canEditBot
                                ? "hover:bg-slate-100"
                                : "text-slate-300 cursor-not-allowed"
                            }`}
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
                            className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-lg w-full"
                            onClick={() => {
                              setShowDropdown(false);
                              void startScreenRecording();
                            }}
                          >
                            <Copy size={16} /> {isRecordingScreen ? "結束錄製並下載" : "錄製畫面"}
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
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-slate-700 shadow-lg hover:bg-white"
                      onClick={handleCloseWithInterrupt}
                    >
                      <X size={18} />
                    </button>
                  </>
                )}
              </div>
              {cameraBackgroundReady && (
                <>
                  <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.24em] text-white shadow-[0_0_12px_rgba(239,68,68,0.45)]">
                    REC
                  </div>
                  <div className="pointer-events-none absolute right-4 top-4 text-[10px] font-medium tracking-[0.24em] text-white/90">
                    LIVE CAMERA
                  </div>
                  <div className="pointer-events-none absolute inset-0 hidden md:block">
                    <div className="absolute left-5 top-5 h-10 w-10 rounded-tl-2xl border-l-2 border-t-2 border-white/70" />
                    <div className="absolute right-5 top-5 h-10 w-10 rounded-tr-2xl border-r-2 border-t-2 border-white/70" />
                    <div className="absolute bottom-5 left-5 h-10 w-10 rounded-bl-2xl border-b-2 border-l-2 border-white/70" />
                    <div className="absolute bottom-5 right-5 h-10 w-10 rounded-br-2xl border-b-2 border-r-2 border-white/70" />
                  </div>
                </>
              )}

              <div className="absolute bottom-4 left-4 z-10 hidden max-w-[280px] flex-col gap-2 md:flex">
                <button
                  onClick={() => {
                    void startCameraBackground();
                  }}
                  className="rounded-full bg-black/45 px-4 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/60"
                >
                  {cameraBackgroundLoading
                    ? "相機背景啟動中..."
                    : cameraBackgroundReady
                    ? "重新連接相機背景"
                    : isMobileClient
                    ? "開啟手機相機背景"
                    : "開啟相機背景"}
                </button>
                {!cameraBackgroundReady && (
                  <div className="max-w-[280px] rounded-2xl bg-black/35 px-3 py-2 text-[11px] leading-5 text-white/90 backdrop-blur">
                    {cameraBackgroundError
                      ? `相機未啟用：${cameraBackgroundError}`
                      : cameraBackgroundLoading
                      ? "正在請求相機權限..."
                      : "目前使用原本背景圖，點擊上方按鈕可切換為電腦相機畫面。"}
                  </div>
                )}
                {cameraBackgroundReady && (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={stopCameraBackground}
                        className="rounded-full bg-black/45 px-4 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/60"
                      >
                        關閉 AR
                      </button>
                      <button
                        onClick={resetArCharacterPose}
                        className="rounded-full bg-black/45 px-4 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/60"
                      >
                        重置位置
                      </button>
                    </div>
                    {!isMobileClient && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => nudgeCharacterScale(-0.08)}
                          className="rounded-full bg-black/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/60"
                        >
                          縮小
                        </button>
                        <button
                          onClick={() => nudgeCharacterScale(0.08)}
                          className="rounded-full bg-black/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/60"
                        >
                          放大
                        </button>
                        <div className="rounded-full bg-black/35 px-3 py-2 text-[11px] font-semibold text-white/90 backdrop-blur">
                          比例 {Math.round(characterScale * 100)}%
                        </div>
                      </div>
                    )}
                    <div className="max-w-[280px] rounded-2xl bg-black/35 px-3 py-2 text-[11px] leading-5 text-white/90 backdrop-blur">
                      {isMobileClient
                        ? "單指拖動角色，雙指捏合可縮放大小。"
                        : "拖動角色可移動位置，使用縮放按鈕可調整人物大小。"}
                    </div>
                  </>
                )}
                <button
                  onClick={() => {
                    void startScreenRecording();
                  }}
                  className={`rounded-full px-4 py-2 text-xs font-semibold text-white backdrop-blur ${
                    isRecordingScreen ? "bg-red-600/85 hover:bg-red-700/90" : "bg-black/45 hover:bg-black/60"
                  }`}
                >
                  {isRecordingScreen ? "結束錄製並下載" : "開始錄製畫面"}
                </button>
                {recordingError ? (
                  <div className="max-w-[280px] rounded-2xl bg-black/35 px-3 py-2 text-[11px] leading-5 text-white/90 backdrop-blur">
                    錄製未啟用：{recordingError}
                  </div>
                ) : null}
              </div>

              {cameraBackgroundReady ? (
                <div ref={arStageRef} className="absolute inset-0 overscroll-none touch-none">
                  <motion.div
                    className="absolute left-1/2 bottom-12 h-[80%] w-full cursor-grab touch-none select-none active:cursor-grabbing md:w-[80%]"
                    transition={{ duration: 0.2 }}
                    style={{
                      transform: `translate(calc(-50% + ${characterOffset.x}px), ${characterOffset.y}px) scale(${characterScale})`,
                      transformOrigin: "center bottom",
                      touchAction: "none",
                    }}
                    onPointerDown={handleCharacterPointerDown}
                    onPointerMove={handleCharacterPointerMove}
                    onPointerUp={handleCharacterPointerUp}
                    onPointerCancel={handleCharacterPointerUp}
                    onTouchStart={handleCharacterTouchStart}
                    onTouchMove={handleCharacterTouchMove}
                    onTouchEnd={handleCharacterTouchEnd}
                    onTouchCancel={handleCharacterTouchEnd}
                  >
                    {hasAnyVideo ? (
                      <div className="relative h-full w-full">
                        {seqIdle ? (
                          <SequencePngPlayer
                            folderUrl={seqIdle.folderUrl}
                            pattern={seqIdle.pattern}
                            frameCount={seqIdle.frameCount}
                            fps={seqIdle.fps}
                            data-stage-character="true"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "idle" ? "block" : "hidden"
                            }`}
                            active={visualState === "idle"}
                          />
                        ) : safeVideoIdle && (
                          <video
                            data-stage-character="true"
                            src={safeVideoIdle}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
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
                            data-stage-character="true"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "thinking" ? "block" : "hidden"
                            }`}
                            active={visualState === "thinking"}
                          />
                        ) : safeVideoThinking && (
                          <video
                            data-stage-character="true"
                            src={safeVideoThinking}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
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
                            data-stage-character="true"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "speaking" ? "block" : "hidden"
                            }`}
                            active={visualState === "speaking"}
                          />
                        ) : safeVideoTalking && (
                          <video
                            data-stage-character="true"
                            src={safeVideoTalking}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
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
                            data-stage-character="true"
                            src={safeAvatar}
                            crossOrigin="anonymous"
                            className="h-full w-full object-contain drop-shadow-xl"
                          />
                        );
                      })()
                    )}
                  </motion.div>
                </div>
              ) : (
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
                          data-stage-character="true"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "idle" ? "block" : "hidden"
                          }`}
                          active={visualState === "idle"}
                        />
                      ) : safeVideoIdle && (
                        <video
                          data-stage-character="true"
                          src={safeVideoIdle}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
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
                          data-stage-character="true"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "thinking" ? "block" : "hidden"
                          }`}
                          active={visualState === "thinking"}
                        />
                      ) : safeVideoThinking && (
                        <video
                          data-stage-character="true"
                          src={safeVideoThinking}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
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
                          data-stage-character="true"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "speaking" ? "block" : "hidden"
                          }`}
                          active={visualState === "speaking"}
                        />
                      ) : safeVideoTalking && (
                        <video
                          data-stage-character="true"
                          src={safeVideoTalking}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
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
                          data-stage-character="true"
                          src={safeAvatar}
                          crossOrigin="anonymous"
                          className="h-[80%] object-contain drop-shadow-xl"
                        />
                      );
                    })()
                  )}
                </motion.div>
              )}
            </div>

            <div
              className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 transition-all duration-300 ${
                chatPanelOpen ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
              }`}
            >
              <div className="flex w-[calc(100vw-52px)] max-w-[390px] items-end justify-center gap-2.5 md:w-full md:max-w-[420px]">
                <button
                  onClick={startSpeechInput}
                  disabled={shouldBlockChat}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] border text-white backdrop-blur-md transition-all duration-200 ${
                    isListening
                      ? "bg-white/14 border-white/35 shadow-[0_10px_30px_rgba(255,255,255,0.14)]"
                      : "bg-black/45 border-white/15 hover:bg-black/60"
                  } disabled:opacity-40`}
                  title={isListening ? "點擊停止語音輸入" : "語音輸入（廣東話）"}
                >
                  <Mic size={18} />
                </button>
                <div className="flex h-12 min-w-[118px] max-w-[168px] items-center justify-center rounded-[22px] bg-black/45 px-4 text-white/80 backdrop-blur-md">
                  {botState === "thinking" ? (
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <span
                          key={idx}
                          className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce"
                          style={{ animationDelay: `${idx * 0.16}s` }}
                        />
                      ))}
                    </div>
                  ) : isListening ? (
                    <div className="flex h-5 items-center gap-[3px]">
                      {Array.from({ length: 11 }).map((_, idx) => {
                        const mid = Math.abs(5 - idx);
                        const baseHeight = Math.max(6, 14 - mid * 1.4);
                        const lift = Math.max(0, voiceLevel * (10 - mid * 0.9));
                        return (
                          <span
                            key={idx}
                            className="w-[3px] rounded-full bg-white/90 transition-[height] duration-75"
                            style={{
                              height: `${Math.max(4, Math.round(baseHeight + lift))}px`,
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <span key={idx} className="h-1 w-1 rounded-full bg-white/85" />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    void captureStagePhoto();
                  }}
                  disabled={isCapturingStagePhoto}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-900 shadow-lg transition-all ${
                    isCapturingStagePhoto
                      ? "cursor-not-allowed bg-white/70 opacity-70"
                      : "bg-white hover:bg-slate-100"
                  }`}
                  title={isCapturingStagePhoto ? "圖片保存中..." : "拍攝當前舞台"}
                >
                  <Camera size={18} />
                </button>
                {isStopAvailable ? (
                  <button
                    onClick={stopAllSpeech}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-black/45 text-white backdrop-blur-md hover:bg-black/60"
                    title="停止回覆與語音"
                  >
                    <ChevronDown size={18} />
                  </button>
                ) : null}
              </div>
              {stagePhotoError ? (
                <div className="pointer-events-auto mt-2 text-center text-xs text-red-200">
                  {stagePhotoError}
                </div>
              ) : null}
            </div>

            {/* 右侧聊天 */}
            <div
              className={`absolute inset-x-3 bottom-3 top-[38%] z-30 overflow-hidden rounded-[2rem] border border-white/18 bg-[#f7f1e6]/95 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-all duration-300 md:relative md:inset-auto md:h-full md:rounded-none md:border-l md:border-r-0 md:border-t-0 md:border-b-0 md:border-slate-200 md:bg-slate-50 md:shadow-none md:backdrop-blur-0 ${
                chatPanelOpen
                  ? "translate-y-0 opacity-100 md:w-[44%]"
                  : "pointer-events-none translate-y-8 opacity-0 md:pointer-events-auto md:w-0 md:translate-y-0"
              }`}
            >
              <div className={`flex h-full min-w-0 flex-col ${chatPanelOpen ? "" : "md:pointer-events-none"}`}>
              {/* header */}
              <div className="flex items-center justify-between border-b border-[#decfb9] bg-[#fffaf1]/86 p-3.5">
                <div className="min-w-0">
                  <div className="text-base font-bold leading-tight text-[#241b12] break-words">{botName}</div>
                </div>

                <button
                  className="ml-2 rounded-full p-2 text-[#6f604c] hover:bg-[#eadfce]"
                  onClick={() => setChatPanelOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              {/* messages */}
                  <div ref={messagesRef} className="custom-scroll flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,250,241,0.6),rgba(247,241,230,0.92))] p-3.5">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {m.role === "bot" && m.guidedTitle ? (
                      <div className="max-w-[88%]">
                        <div className="mb-1 text-xs font-semibold text-[#7c6a54]">{m.guidedTitle}</div>
                        <div className="rounded-2xl rounded-bl-sm border border-[#e5d8c3] bg-white/88 p-3 text-sm leading-relaxed text-[#2b241b] shadow-sm whitespace-pre-wrap">
                          {(m.guidedBody || m.content).split("\n").map((line, idx) => {
                            const trimmed = line.trim();
                            const isHeading =
                              trimmed === "做得好" || trimmed === "可改進" || trimmed === "下一步";
                            return (
                              <div key={idx} className={isHeading ? "font-semibold text-slate-900" : ""}>
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[88%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                          m.role === "user"
                            ? "rounded-br-sm bg-[#2e2418] text-white"
                            : "rounded-bl-sm border border-[#e5d8c3] bg-white/88 text-[#2b241b]"
                        }`}
                      >
                        {m.content}
                      </div>
                    )}
                  </div>
                ))}

                {/* thinking bubble */}
                {botState === "thinking" && !voiceLimitMessage && (
                  <div className="flex">
                    <div className="flex gap-1 rounded-2xl border border-[#e5d8c3] bg-white/88 p-3">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"></span>
                      <span
                        className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></span>
                    </div>
                  </div>
                )}
              </div>

              {/* input */}
              <div className="border-t border-[#decfb9] bg-[#fffaf1]/92 p-3">
                {guidedMode && (
                  <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-2">
                    <div className="mb-2 text-xs text-amber-800">
                      引導模式進行中 {guidedStepIndex > 0 && guidedTotalSteps > 0 ? `(Step ${guidedStepIndex}/${guidedTotalSteps})` : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void sendMessage("下一步")} className="rounded-lg bg-white px-3 py-1 text-xs text-amber-800 border border-amber-200">下一步</button>
                      <button onClick={() => void sendMessage("重複這一步")} className="rounded-lg bg-white px-3 py-1 text-xs text-amber-800 border border-amber-200">重複這一步</button>
                      <button onClick={() => void sendMessage("給我示例")} className="rounded-lg bg-white px-3 py-1 text-xs text-amber-800 border border-amber-200">給我示例</button>
                      <button onClick={() => void sendMessage("退出引導")} className="rounded-lg bg-white px-3 py-1 text-xs text-rose-700 border border-rose-200">退出引導</button>
                    </div>
                  </div>
                )}
                {awaitingAudioGesture && (
                  <div className="mb-2 text-xs text-amber-600">
                    已收到回覆語音，請點一下畫面以恢復播放。
                  </div>
                )}
                {voiceLimitMessage && (
                  <div className="mb-2 text-xs text-amber-700">
                    {voiceLimitMessage}
                  </div>
                )}
                <div className="flex items-end rounded-[1.35rem] border border-[#e1d4bf] bg-[#ede2cf] p-2">
                  <button
                    onClick={startSpeechInput}
                    disabled={shouldBlockChat}
                    className={`p-3 mr-2 rounded-full border ${
                      isListening
                        ? "bg-red-50 border-red-300 text-red-600"
                        : "bg-white border-[#e1d4bf] text-[#6f604c] hover:bg-[#fffaf1]"
                    } disabled:opacity-40`}
                    title={isListening ? "點擊停止語音輸入" : "語音輸入（廣東話）"}
                  >
                    <Mic size={16} />
                  </button>
                  <textarea
                    ref={inputRef}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm outline-none resize-none max-h-32 overflow-y-hidden leading-6"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={shouldBlockChat}
                    placeholder="輸入訊息，或按麥克風說話..."
                    rows={1}
                  />
                  <button
                    onClick={stopAllSpeech}
                    disabled={!isStopAvailable}
                    className="p-3 mr-2 text-[#6f604c] bg-white rounded-full hover:bg-[#fffaf1] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="停止回覆與語音"
                  >
                    <Square size={16} />
                  </button>
                  <button
                    onClick={() => {
                      void sendMessage();
                    }}
                    disabled={shouldBlockChat || !inputText.trim()}
                    className="p-3 bg-[#2e2418] text-white rounded-full hover:bg-[#463727] disabled:opacity-40"
                  >
                    <Send size={16} />
                  </button>
                </div>
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
            {!shouldShowBooting && shouldRequirePermission && !permissionReady && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 px-6 text-center">
                <div className="text-xl font-semibold text-slate-800">開始體驗前需要一次授權</div>
                <div className="text-sm text-slate-600">
                  點一次即可啟用麥克風與語音播放，之後同一會話可自動語音回覆。
                </div>
                <button
                  onClick={() => {
                    void unlockAudioAndMic();
                  }}
                  disabled={isUnlocking}
                  className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {isUnlocking ? "授權中..." : "開始體驗並授權"}
                </button>
                {permissionError && (
                  <div className="max-w-md text-xs text-red-600">{permissionError}</div>
                )}
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
          <PlatformDialog
            open={dialog.open}
            title={dialog.title}
            message={dialog.message}
            confirmText={dialog.confirmText}
            cancelText={dialog.cancelText}
            tone={dialog.tone}
            onClose={closeDialog}
            onConfirm={dialog.onConfirm || undefined}
          />
        </div>
      )}
    </>
  );
};
