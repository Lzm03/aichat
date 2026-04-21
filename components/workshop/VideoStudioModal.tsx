"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { SequencePngPlayer } from "./SequencePngPlayer";
import { Icons } from "../icons";
import type { FeatureEntitlement } from "../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../hooks/usePlatformDialog";
import { PlatformDialog } from "../system/PlatformDialog";
import { API_BASE } from "../../utils/api";

interface Props {
  onClose: () => void;
  avatarUrl: string;
  feature?: FeatureEntitlement;
  onConsumeFeature?: (key: string, amount?: number, meta?: Record<string, unknown>) => Promise<any>;
  onFeatureRefresh?: () => Promise<any>;
  onVideoProgress?: (videos: {
    idleUrl?: string;
    speakingUrl?: string;
    thinkingUrl?: string;
  }) => void;
  onVideosGenerated: (videos: {
    idleUrl: string;
    speakingUrl: string;
    thinkingUrl: string;
  }) => void;
}

const HINT_VIDEO_SLOTS = {
  idle: "/hint-videos/idle.mp4",
  speaking: "/hint-videos/speaking.mp4",
  thinking: "/hint-videos/thinking.mp4",
} as const;

/* Convert blob: URL → Base64 */
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export default function VideoStudioModal({
  onClose,
  avatarUrl,
  feature,
  onConsumeFeature,
  onFeatureRefresh,
  onVideoProgress,
  onVideosGenerated,
}: Props) {
  type PreviewSlotStatus =
    | "pending"
    | "waiting"
    | "generating"
    | "removing"
    | "remove_bg_done"
    | "ready";
  type PreviewSlotKey = "idle" | "speaking" | "thinking";
  const presetOptions = [
    {
      id: "cinematic",
      label: "電影感",
      hint: "乾淨光影、商業質感",
      stylePrompt: "整體風格偏高級電影感，燈光柔和、質感真實、構圖穩定、人物邊緣乾淨。",
    },
    {
      id: "documentary",
      label: "紀錄片",
      hint: "自然寫實、少修飾",
      stylePrompt: "整體風格偏紀錄片寫實感，自然光線、真實膚色、鏡頭克制、不做誇張特效。",
    },
    {
      id: "dreamy",
      label: "夢幻",
      hint: "柔光、輕微唯美感",
      stylePrompt: "整體風格帶有柔焦與夢幻氛圍，畫面柔和、細節乾淨，但保持人物真實可辨識。",
    },
    {
      id: "studio",
      label: "棚拍",
      hint: "純淨、專業展示",
      stylePrompt: "整體風格偏專業棚拍，光線均勻、主體突出、背景處理乾淨，像產品級展示視頻。",
    },
    {
      id: "teacher",
      label: "教學感",
      hint: "適合教學助理形象",
      stylePrompt: "整體風格偏教育與教學展示，親和、專業、穩定，適合作為老師或助教角色。",
    },
    {
      id: "corporate",
      label: "商務",
      hint: "正式、穩重、簡潔",
      stylePrompt: "整體風格偏商務正式感，專業穩重、服裝與人物姿態端正，適合解說與展示場景。",
    },
  ] as const;
  const phaseMilestones = [18, 33, 48, 63, 78, 93];

  // ===== 左侧面板 UI =====
  const [preset, setPreset] = useState("cinematic");
  const [sourceAspectRatio, setSourceAspectRatio] = useState<string>("16:9");
  const [videoSourceImage, setVideoSourceImage] = useState<string>("");
  const [videoSourceRemoteUrl, setVideoSourceRemoteUrl] = useState<string>("");
  const [videoSourceUploading, setVideoSourceUploading] = useState(false);
  const [studioTaskId, setStudioTaskId] = useState<string | null>(null);
  const [restoringTask, setRestoringTask] = useState(true);
  const videoSourceInputRef = useRef<HTMLInputElement | null>(null);

  // ===== Loading 状态 =====
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef(false);
  const [phaseIndex, setPhaseIndex] = useState(0); // 0..5 (3次生成 + 3次去背景)
  const progressRef = useRef(0);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseStartTimeRef = useRef(0);
  const phaseFromRef = useRef(0);
  const phaseToRef = useRef(0);
  const genEstimateMsRef = useRef(22000);
  const rmEstimateMsRef = useRef(7000);

  // ===== 最终透明版视频 =====
  const [idleWebm, setIdleWebm] = useState<string | null>(null);
  const [speakingWebm, setSpeakingWebm] = useState<string | null>(null);
  const [thinkingWebm, setThinkingWebm] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<Record<PreviewSlotKey, PreviewSlotStatus>>({
    idle: "waiting",
    speaking: "waiting",
    thinking: "waiting",
  });
  const canSave = !!(idleWebm && speakingWebm && thinkingWebm);
  const [featureConsumed, setFeatureConsumed] = useState(Boolean(feature?.used));
  const [showHint, setShowHint] = useState(false);
  const [showUploadHint, setShowUploadHint] = useState(false);
  const [hintPosition, setHintPosition] = useState({ top: 0, left: 0 });
  const [uploadHintPosition, setUploadHintPosition] = useState({ top: 0, left: 0 });
  const { dialog, closeDialog, showAlert, showConfirm } = usePlatformDialog();
  const hintButtonRef = useRef<HTMLButtonElement | null>(null);
  const uploadHintButtonRef = useRef<HTMLButtonElement | null>(null);
  const isUnlimitedFeature = Boolean(feature?.unlimited);

  const baseUrl = API_BASE;
  const SUPPORTED_ASPECTS = new Set(["16:9", "9:16", "1:1"]);

  function simplifyRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(width, height);
    return `${Math.round(width / g)}:${Math.round(height / g)}`;
  }

  async function getImageRatio(url: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(simplifyRatio(img.naturalWidth, img.naturalHeight));
      img.onerror = () => resolve("16:9");
      img.src = url;
    });
  }

  function normalizeAspectRatioForApi(ratio: string): string {
    if (SUPPORTED_ASPECTS.has(ratio)) return ratio;

    const parts = ratio.split(":").map((v) => Number(v));
    if (parts.length !== 2 || !parts[0] || !parts[1]) return "16:9";

    const [w, h] = parts;
    const value = w / h;

    // 接近正方形时优先 1:1，其余按方向映射
    if (Math.abs(value - 1) <= 0.15) return "1:1";
    return value > 1 ? "16:9" : "9:16";
  }

  useEffect(() => {
    setFeatureConsumed(isUnlimitedFeature ? false : Boolean(feature?.used));
  }, [feature?.used, isUnlimitedFeature]);

  useEffect(() => {
    let active = true;
    const restoreTask = async () => {
      setRestoringTask(true);
      try {
        const res = await fetch(`${API_BASE}/api/video/studio-task/latest`);
        const data = await res.json().catch(() => null);
        const task = data?.task;
        if (!active || !task) return;

        setStudioTaskId(task.id);
        setVideoSourceImage(task.sourceImageUrl || "");
        setVideoSourceRemoteUrl(task.sourceImageUrl || "");
        setSourceAspectRatio(task.sourceAspectRatio || "16:9");

        const nextIdle = task.slots?.idle?.resultUrl || null;
        const nextSpeaking = task.slots?.speaking?.resultUrl || null;
        const nextThinking = task.slots?.thinking?.resultUrl || null;

        setIdleWebm(nextIdle);
        setSpeakingWebm(nextSpeaking);
        setThinkingWebm(nextThinking);
        setPreviewStatus({
          idle: task.slots?.idle?.status || "waiting",
          speaking: task.slots?.speaking?.status || "waiting",
          thinking: task.slots?.thinking?.status || "waiting",
        });

        const hasGeneratingSlot = ["idle", "speaking", "thinking"].some((key) => {
          const slot = task.slots?.[key];
          return slot?.status === "generating" && slot?.requestId;
        });

        if (hasGeneratingSlot) {
          setLoading(true);
          await continueTaskFlow(task.id, {
            existingRequests: {
              idle: task.slots?.idle?.status === "generating" ? task.slots?.idle?.requestId || null : null,
              speaking:
                task.slots?.speaking?.status === "generating" ? task.slots?.speaking?.requestId || null : null,
              thinking:
                task.slots?.thinking?.status === "generating" ? task.slots?.thinking?.requestId || null : null,
            },
          });
          if (active) {
            setProgress(100);
            progressRef.current = 100;
            setLoading(false);
          }
        }
      } catch {
        // ignore recovery failure
      } finally {
        if (active) setRestoringTask(false);
      }
    };

    void restoreTask();
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!showHint || !hintButtonRef.current) return;

    const updatePosition = () => {
      const rect = hintButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tooltipWidth = 320;
      const gap = 10;
      const maxLeft = window.innerWidth - tooltipWidth - 16;
      setHintPosition({
        top: rect.bottom + gap,
        left: Math.min(rect.left, Math.max(16, maxLeft)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showHint]);

  useLayoutEffect(() => {
    if (!showUploadHint || !uploadHintButtonRef.current) return;

    const updatePosition = () => {
      const rect = uploadHintButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tooltipWidth = 320;
      const gap = 10;
      const maxLeft = window.innerWidth - tooltipWidth - 16;
      setUploadHintPosition({
        top: rect.bottom + gap,
        left: Math.min(rect.left, Math.max(16, maxLeft)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showUploadHint]);

  useEffect(() => {
    if (!showHint) return;
    const handleClickAway = (event: MouseEvent) => {
      if (hintButtonRef.current?.contains(event.target as Node)) return;
      setShowHint(false);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [showHint]);

  useEffect(() => {
    if (!showUploadHint) return;
    const handleClickAway = (event: MouseEvent) => {
      if (uploadHintButtonRef.current?.contains(event.target as Node)) return;
      setShowUploadHint(false);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [showUploadHint]);

  useEffect(() => {
    let active = true;

    async function detectSourceRatio() {
      if (!videoSourceImage) {
        if (active) setSourceAspectRatio("16:9");
        return;
      }

      if (videoSourceImage.startsWith("blob:")) {
        const base64 = await blobUrlToBase64(videoSourceImage);
        const ratio = await getImageRatio(base64);
        if (active) setSourceAspectRatio(ratio);
        return;
      }

      const ratio = await getImageRatio(videoSourceImage);
      if (active) setSourceAspectRatio(ratio);
    }

    void detectSourceRatio();
    return () => {
      active = false;
    };
  }, [videoSourceImage]);

  useEffect(() => {
    return () => {
      if (videoSourceImage.startsWith("blob:")) {
        URL.revokeObjectURL(videoSourceImage);
      }
    };
  }, [videoSourceImage]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  function clearPhaseTimer() {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }

  function beginPhase(index: number, type: "gen" | "rm") {
    clearPhaseTimer();
    setPhaseIndex(index);

    phaseStartTimeRef.current = Date.now();
    phaseFromRef.current = progressRef.current;
    phaseToRef.current = phaseMilestones[index];
    const estimate = type === "gen" ? genEstimateMsRef.current : rmEstimateMsRef.current;

    phaseTimerRef.current = setInterval(() => {
      if (cancelRef.current) return;
      const elapsed = Date.now() - phaseStartTimeRef.current;
      const t = Math.min(elapsed / estimate, 0.999);
      const next = Math.floor(
        phaseFromRef.current + (phaseToRef.current - phaseFromRef.current) * t
      );
      setProgress((prev) => (next > prev ? next : prev));
    }, 80);
  }

  function completePhase(type: "gen" | "rm") {
    clearPhaseTimer();
    setProgress(phaseToRef.current);
    progressRef.current = phaseToRef.current;

    const actual = Date.now() - phaseStartTimeRef.current;
    if (type === "gen") {
      genEstimateMsRef.current = Math.round(genEstimateMsRef.current * 0.65 + actual * 0.35);
    } else {
      rmEstimateMsRef.current = Math.round(rmEstimateMsRef.current * 0.65 + actual * 0.35);
    }
  }

  function updatePreviewStatus(key: PreviewSlotKey, status: PreviewSlotStatus) {
    setPreviewStatus((prev) => ({ ...prev, [key]: status }));
  }

  function isSlotFinished(key: PreviewSlotKey, src: string | null, status: PreviewSlotStatus) {
    return Boolean(src) && (status === "ready" || status === "remove_bg_done");
  }

  function resolveSlotProgress(slotKey: PreviewSlotKey) {
    if (slotKey === "idle") return { genPhase: 0, rmPhase: 1, nextKey: "speaking" as PreviewSlotKey };
    if (slotKey === "speaking") return { genPhase: 2, rmPhase: 3, nextKey: "thinking" as PreviewSlotKey };
    return { genPhase: 4, rmPhase: 5, nextKey: null as PreviewSlotKey | null };
  }

  async function ensureStudioTask(forceNew = false) {
    if (studioTaskId && !forceNew) return studioTaskId;
    if (!videoSourceRemoteUrl) {
      throw new Error("missing source image url");
    }
    const res = await fetch(`${API_BASE}/api/video/studio-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceImageUrl: videoSourceRemoteUrl,
        preset,
        sourceAspectRatio,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.task?.id) {
      throw new Error(data?.error || "failed to create video studio task");
    }
    setStudioTaskId(data.task.id);
    return data.task.id as string;
  }

  async function patchStudioTaskSlot(
    taskId: string,
    slotKey: PreviewSlotKey,
    patch: Record<string, unknown>,
    taskStatus?: string
  ) {
    await fetch(`${API_BASE}/api/video/studio-task/${taskId}/slot`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotKey, patch, taskStatus }),
    });
  }

  // 动作对应的 prompts
  const prompts = {
    idle: "角色必須原地站定，雙腳固定在同一位置，禁止走動、踏步、位移、轉身移位。角色保持静止、自然呼吸、微微眨眼。相機完全固定，不縮放、不前後移動、不平移、不搖晃。只允許角色本身的輕微動作，不要移動取景框。背景必須始終為純亮綠色綠幕（chroma key green, RGB 0,255,0 附近），整個背景單一純色、均勻填滿、無漸層、無紋理、無雜訊、無陰影、無反光、無光斑、無景深模糊、無任何背景物件。人物身上不得出現綠色溢色、綠色反射或綠邊。人物邊緣清晰完整，頭髮絲、手指、衣服輪廓清楚可分割。",
    speaking: "角色必須原地站定，雙腳固定在同一位置，禁止走動、踏步、位移、轉身移位。角色自然張嘴說話，口型連貫、清晰。相機完全固定，不縮放、不推拉、不運鏡、不搖晃。保持角色在畫面中固定位置，只演示口型與表情。背景必須始終為純亮綠色綠幕（chroma key green, RGB 0,255,0 附近），整個背景單一純色、均勻填滿、無漸層、無紋理、無雜訊、無陰影、無反光、無光斑、無景深模糊、無任何背景物件。人物身上不得出現綠色溢色、綠色反射或綠邊。人物邊緣清晰完整，頭髮絲、手指、衣服輪廓清楚可分割。",
    thinking: "角色必須原地站定，雙腳固定在同一位置，禁止走動、踏步、位移、轉身移位。角色做出思考動作（抬頭、皱眉、輕微眼球運動）即可。相機固定鎖死，不前後移動、不左右平移、不縮放、不搖鏡。禁止鏡頭動畫，僅允許角色頭部小幅度動作。背景必須始終為純亮綠色綠幕（chroma key green, RGB 0,255,0 附近），整個背景單一純色、均勻填滿、無漸層、無紋理、無雜訊、無陰影、無反光、無光斑、無景深模糊、無任何背景物件。人物身上不得出現綠色溢色、綠色反射或綠邊。人物邊緣清晰完整，頭髮絲、手指、衣服輪廓清楚可分割。",
  };

  const selectedPreset =
    presetOptions.find((item) => item.id === preset) || presetOptions[0];

  /* ========= Step 1: 生成原始动画 ========= */
  async function requestOneVideo(type: "idle" | "speaking" | "thinking", taskId: string) {
    setLoadingText(`正在生成：${type} 原始視頻...`);

    let img = videoSourceImage;
    const isLocalAsset =
      videoSourceImage.startsWith("blob:") ||
      videoSourceImage.includes("localhost") ||
      videoSourceImage.includes("127.0.0.1");

    // 云端模型无法访问本机 localhost，改用 base64 直传
    if (isLocalAsset) {
      img = await blobUrlToBase64(videoSourceImage);
    }

    const rawAspectRatio =
      isLocalAsset ? sourceAspectRatio : await getImageRatio(videoSourceImage);
    const selectedAspectRatio = normalizeAspectRatioForApi(rawAspectRatio);

    const payload = {
      prompt: `${selectedPreset.stylePrompt} ${prompts[type]}`,
      duration: "2",
      aspectRatio: selectedAspectRatio,
      resolution: "480p",
      preset,
      imageUrl: img,
    };

    const res = await axios.post(`${baseUrl}/api/video/generate`, payload, {
      headers: { "Content-Type": "application/json" },
    });
    await patchStudioTaskSlot(taskId, type, {
      status: "generating",
      requestId: res.data.request_id,
      error: null,
    }, "generating");

    const url = await pollVideoStatus(res.data.request_id, type);
    return { requestId: res.data.request_id as string, url };
  }

  async function requestOneVideoWithRetry(
    type: "idle" | "speaking" | "thinking",
    taskId: string,
    maxRetry = 1
  ) {
    let attempt = 0;
    while (true) {
      try {
        return await requestOneVideo(type, taskId);
      } catch (err) {
        if (cancelRef.current) throw err;
        if (attempt >= maxRetry) throw err;
        attempt += 1;
        setLoadingText(`正在重試：${type}（第 ${attempt + 1} 次）...`);
      }
    }
  }

  async function finalizeSlot(
    taskId: string,
    slotKey: PreviewSlotKey,
    requestId: string,
    originalVideoUrl: string
  ) {
    const { rmPhase, nextKey } = resolveSlotProgress(slotKey);
    updatePreviewStatus(slotKey, "removing");
    beginPhase(rmPhase, "rm");
    const resultUrl = await removeBg(originalVideoUrl);
    if (cancelRef.current) throw new Error("cancelled");

    if (slotKey === "idle") {
      setIdleWebm(resultUrl);
      onVideoProgress?.({ idleUrl: resultUrl });
    } else if (slotKey === "speaking") {
      setSpeakingWebm(resultUrl);
      onVideoProgress?.({ speakingUrl: resultUrl });
    } else {
      setThinkingWebm(resultUrl);
      onVideoProgress?.({ thinkingUrl: resultUrl });
    }

    await patchStudioTaskSlot(
      taskId,
      slotKey,
      {
        status: "remove_bg_done",
        requestId,
        originalVideoUrl,
        resultUrl,
        error: null,
      },
      slotKey === "thinking" ? "ready" : undefined
    );
    updatePreviewStatus(slotKey, "ready");
    if (nextKey) updatePreviewStatus(nextKey, "generating");
    completePhase("rm");
  }

  async function processSlot(taskId: string, slotKey: PreviewSlotKey, existingRequestId?: string | null) {
    const { genPhase } = resolveSlotProgress(slotKey);
    let requestId = existingRequestId || "";
    let originalVideoUrl = "";

    if (existingRequestId) {
      setLoadingText(`正在恢復：${slotKey} 原始視頻...`);
      beginPhase(genPhase, "gen");
      originalVideoUrl = await pollVideoStatus(existingRequestId, slotKey);
      if (cancelRef.current) throw new Error("cancelled");
      completePhase("gen");
      requestId = existingRequestId;
    } else {
      beginPhase(genPhase, "gen");
      const generated = await requestOneVideoWithRetry(slotKey, taskId);
      if (cancelRef.current) throw new Error("cancelled");
      completePhase("gen");
      requestId = generated.requestId;
      originalVideoUrl = generated.url;
    }

    await finalizeSlot(taskId, slotKey, requestId, originalVideoUrl);
  }

  async function continueTaskFlow(taskId: string, options?: {
    existingRequests?: Partial<Record<PreviewSlotKey, string | null>>;
    resetFinished?: boolean;
  }) {
    const idleDone = !options?.resetFinished && isSlotFinished("idle", idleWebm, previewStatus.idle);
    const speakingDone = !options?.resetFinished && isSlotFinished("speaking", speakingWebm, previewStatus.speaking);
    const thinkingDone = !options?.resetFinished && isSlotFinished("thinking", thinkingWebm, previewStatus.thinking);

    setPreviewStatus({
      idle: idleDone ? previewStatus.idle : "generating",
      speaking: speakingDone ? previewStatus.speaking : idleDone ? "generating" : "waiting",
      thinking: thinkingDone ? previewStatus.thinking : speakingDone ? "generating" : "waiting",
    });

    if (!idleDone) {
      await processSlot(taskId, "idle", options?.existingRequests?.idle || null);
    }
    if (!speakingDone) {
      await processSlot(taskId, "speaking", options?.existingRequests?.speaking || null);
    }
    if (!thinkingDone) {
      await processSlot(taskId, "thinking", options?.existingRequests?.thinking || null);
    }
  }

  /* ========= Step 2: 轮询生成状态 ========= */
  async function pollVideoStatus(requestId: string, type: string) {
    let attempts = 0;

    return new Promise<string>((resolve, reject) => {
      const timer = setInterval(async () => {
        if (cancelRef.current) {
          clearInterval(timer);
          reject(new Error("cancelled"));
          return;
        }
        attempts++;

        try {
          const res = await axios.get(`${baseUrl}/api/video/result/${requestId}`);
          const data = res.data;

          if (data.progress) {
            // 前端改为阶段线性进度，此处不再直接覆盖 UI 进度
          }

          if (data.status === "completed") {
            clearInterval(timer);
            resolve(data.url); // 原始视频地址
          }

          if (data.status === "failed") {
            clearInterval(timer);
            reject(new Error(`${type} 生成失败`));
          }

          if (attempts > 120) {
            clearInterval(timer);
            reject(new Error(`${type} 超时`));
          }
        } catch (error) {
          clearInterval(timer);
          reject(error);
        }
      }, 2000);
    });
  }

  /* ========= Step 3: remove-bg API ========= */
  async function removeBg(inputUrl: string) {
    setLoadingText("正在移除背景…（Remove BG）");

    const res = await axios.post(
      `${baseUrl}/api/video/remove-bg`,
      { url: inputUrl },
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.data?.sequenceManifestUrl) {
      throw new Error("Missing sequenceManifestUrl from remove-bg API");
    }
    return res.data.sequenceManifestUrl; // manifest.json only
  }

  /* ========= Step 4: 完整流程 一键生成所有动画 ========= */
  async function generateAll() {
    if (!isUnlimitedFeature && (feature?.locked || featureConsumed)) {
      showAlert({
        title: "影片工作室已用完",
        message: feature?.upgradeMessage || "免費版影片工作室次數已用完，請升級到付費版。",
      });
      return;
    }
    if (!videoSourceImage) {
      showAlert({
        title: "請先上傳生成照片",
        message: "請先上傳一張用於影片生成的人物照片。",
      });
      return;
    }
    if (videoSourceUploading || !videoSourceRemoteUrl) {
      showAlert({
        title: "圖片仍在準備中",
        message: "請先等待生成照片上傳完成，再開始生成影片。",
      });
      return;
    }
    cancelRef.current = false;
    setLoading(true);
    setProgress(1);
    progressRef.current = 1;
    setPhaseIndex(0);

    try {
      const idleDone = isSlotFinished("idle", idleWebm, previewStatus.idle);
      const speakingDone = isSlotFinished("speaking", speakingWebm, previewStatus.speaking);
      const thinkingDone = isSlotFinished("thinking", thinkingWebm, previewStatus.thinking);
      const restartingFresh = idleDone && speakingDone && thinkingDone;

      if (restartingFresh) {
        setIdleWebm(null);
        setSpeakingWebm(null);
        setThinkingWebm(null);
        setPreviewStatus({
          idle: "waiting",
          speaking: "waiting",
          thinking: "waiting",
        });
      }

      const taskId = await ensureStudioTask(restartingFresh);
      await continueTaskFlow(taskId, { resetFinished: restartingFresh });

      await new Promise((resolve) => setTimeout(resolve, 800));
      setProgress(100);
      progressRef.current = 100;
      if (!isUnlimitedFeature && !featureConsumed) {
        setFeatureConsumed(true);
      }

      setLoading(false);
    } catch (error) {
      console.error("生成失败", error);
      clearPhaseTimer();
      setLoading(false);
      if (!cancelRef.current) {
        showAlert({
          title: "生成失敗",
          message: "影片生成失敗，請稍後再試。",
          tone: "danger",
        });
      }
    }
  }

  function handleCancelGenerating() {
    cancelRef.current = true;
    clearPhaseTimer();
    setLoading(false);
  }

  function requestCancelGenerating() {
    if (!loading) return;
    showConfirm({
      title: "取消生成？",
      message: "目前正在生成影片，現在取消會中止這次流程，已完成的進度不會保留。",
      confirmText: "確認取消",
      cancelText: "繼續生成",
      tone: "danger",
      onConfirm: handleCancelGenerating,
    });
  }

  function requestClose() {
    if (loading) {
      showConfirm({
        title: "關閉影片工作室？",
        message: "影片仍在生成中，現在關閉會中止這次流程。",
        confirmText: "確認關閉",
        cancelText: "繼續生成",
        tone: "danger",
        onConfirm: () => {
          handleCancelGenerating();
          onClose();
        },
      });
      return;
    }
    onClose();
  }

  function handleSaveAndClose() {
    if (!canSave) {
      requestClose();
      return;
    }

    onVideosGenerated({
      idleUrl: idleWebm!,
      speakingUrl: speakingWebm!,
      thinkingUrl: thinkingWebm!,
    });
    onClose();
  }

  const isSequenceManifest = (url?: string | null) =>
    Boolean(url && /\/manifest\.json(\?|$)/i.test(url));

  function handleSelectVideoSource(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showAlert({
        title: "檔案格式不支援",
        message: "請上傳 JPG、PNG 或 WEBP 等人物照片。",
        tone: "danger",
      });
      event.target.value = "";
      return;
    }

    setIdleWebm(null);
    setSpeakingWebm(null);
    setThinkingWebm(null);
    setPreviewStatus({
      idle: "waiting",
      speaking: "waiting",
      thinking: "waiting",
    });
    setProgress(0);
    progressRef.current = 0;
    setStudioTaskId(null);
    setVideoSourceRemoteUrl("");

    setVideoSourceImage((prev) => {
      if (prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return URL.createObjectURL(file);
    });
    setVideoSourceUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    fetch(`${API_BASE}/api/upload-image`, {
      method: "POST",
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || "upload failed");
        }
        setVideoSourceRemoteUrl(data.url);
      })
      .catch((error) => {
        setVideoSourceRemoteUrl("");
        showAlert({
          title: "上傳失敗",
          message: error instanceof Error ? error.message : "圖片上傳失敗，請重試。",
          tone: "danger",
        });
      })
      .finally(() => {
        setVideoSourceUploading(false);
      });
    event.target.value = "";
  }

  function handleRemoveVideoSource() {
    setVideoSourceImage((prev) => {
      if (prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return "";
    });
    setIdleWebm(null);
    setSpeakingWebm(null);
    setThinkingWebm(null);
    setStudioTaskId(null);
    setVideoSourceRemoteUrl("");
    setPreviewStatus({
      idle: "waiting",
      speaking: "waiting",
      thinking: "waiting",
    });
    setProgress(0);
    progressRef.current = 0;
    if (videoSourceInputRef.current) {
      videoSourceInputRef.current.value = "";
    }
  }

  const SequenceOrVideo = ({ src }: { src: string }) => {
    const [manifest, setManifest] = useState<any>(null);

    useEffect(() => {
      let active = true;
      if (!isSequenceManifest(src)) {
        setManifest(null);
        return;
      }
      (async () => {
        try {
          const res = await fetch(src);
          if (!res.ok) return;
          const data = await res.json();
          if (active) setManifest(data);
        } catch {
          // ignore
        }
      })();
      return () => {
        active = false;
      };
    }, [src]);

    if (isSequenceManifest(src) && manifest) {
      return (
        <SequencePngPlayer
          folderUrl={manifest.folderUrl}
          pattern={manifest.pattern}
          frameCount={manifest.frameCount}
          fps={manifest.fps}
          className="w-full h-[260px] object-contain rounded-xl"
          active={true}
        />
      );
    }

    return (
      <video
        className="w-full h-[260px] object-contain rounded-xl"
        autoPlay
        muted
        loop
        src={src}
      />
    );
  };

  const previewCards: Array<{
    key: PreviewSlotKey;
    title: string;
    src: string | null;
  }> = [
    { key: "idle", title: "Idle", src: idleWebm },
    { key: "speaking", title: "Speaking", src: speakingWebm },
    { key: "thinking", title: "Thinking", src: thinkingWebm },
  ];

  const hasPreviewStage = loading || Boolean(idleWebm || speakingWebm || thinkingWebm);

  /* ========= UI ========= */
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex h-[90vh] w-[90vw] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">

        {/* ================= 左侧设置 ================= */}
        <aside className="w-[380px] overflow-y-auto border-r border-slate-200 bg-[#FAFCFF] p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[28px] font-black tracking-[-0.04em] text-[#1E293B]">影片工作室</h2>
                <button
                  ref={hintButtonRef}
                  type="button"
                  onMouseEnter={() => setShowHint(true)}
                  onMouseLeave={() => setShowHint(false)}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[8px] font-bold text-[#64748B] transition hover:border-[#94A3B8] hover:text-[#475569]"
                >
                  i
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="rounded-2xl p-2 text-[#94A3B8] transition hover:bg-white hover:text-[#64748B]"
            >
              ×
            </button>
          </div>


          <div className="mt-6 rounded-[28px] border border-[#E2E8F0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold tracking-[0.01em] text-[#334155]">生成照片</label>
                <button
                  ref={uploadHintButtonRef}
                  type="button"
                  onMouseEnter={() => setShowUploadHint(true)}
                  onMouseLeave={() => setShowUploadHint(false)}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[8px] font-bold text-[#64748B] transition hover:border-[#94A3B8] hover:text-[#475569]"
                >
                  i
                </button>
              </div>
            </div>
            <input
              ref={videoSourceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleSelectVideoSource}
            />
            <div className="mt-4 rounded-[24px] bg-[#F8FBFF] p-3">
              {videoSourceImage ? (
                <div className="relative overflow-hidden rounded-[20px] bg-[#EEF4FB]">
                  <button
                    type="button"
                    onClick={handleRemoveVideoSource}
                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-sm text-[#64748B] shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition hover:bg-white hover:text-[#DC2626]"
                    aria-label="刪除照片"
                  >
                    <Icons.delete className="h-4 w-4" />
                  </button>
                  <img
                    src={videoSourceImage}
                    alt="生成照片預覽"
                    className="h-[220px] w-full object-contain bg-[#EAF1F8]"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-[#F8FBFF] via-[#F8FBFF]/92 to-transparent px-4 py-4">
                    <div>
                      <div className="mt-1 text-sm font-semibold text-[#1E293B]">本次影片生成照片</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => videoSourceInputRef.current?.click()}
                      className="pointer-events-auto rounded-full border border-[#DBEAFE] bg-white px-4 py-2 text-xs font-semibold text-[#2563EB] transition hover:bg-[#EFF6FF]"
                    >
                      更換照片
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoSourceInputRef.current?.click()}
                  className="group flex h-[220px] w-full flex-col items-center justify-center rounded-[20px] border border-dashed border-[#BFDBFE] bg-white text-center transition hover:border-[#93C5FD] hover:bg-[#F8FBFF]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFF6FF] text-xl text-[#2563EB]">↑</div>
                  <div className="mt-5 text-lg font-bold tracking-[-0.03em] text-[#1E293B]">上傳影片生成照片</div>
                  <div className="mt-2 text-sm leading-6 text-[#64748B]">
                    將這張照片作為動畫生成來源
                  </div>
                  <div className="mt-5 rounded-full border border-[#DBEAFE] bg-[#F8FBFF] px-4 py-2 text-xs font-semibold text-[#2563EB] transition group-hover:bg-[#EFF6FF]">
                    選擇照片
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* 风格 */}
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-sm font-semibold tracking-[0.01em] text-[#334155]">風格</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {presetOptions.map((option) => (
                <button
                  key={option.id}
                  className={`rounded-[22px] px-4 py-4 text-left transition-all ${
                    preset === option.id
                      ? "border border-[#3B82F6] bg-[#2563EB] text-white shadow-[0_14px_28px_rgba(37,99,235,0.24)]"
                      : "border border-[#E2E8F0] bg-white text-[#334155] shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:border-[#CBD5E1] hover:bg-[#F8FBFF]"
                  }`}
                  onClick={() => setPreset(option.id)}
                >
                  <div className="text-base font-bold tracking-[-0.02em] leading-5">{option.label}</div>
                  <div className={`mt-1 text-xs leading-5 ${
                    preset === option.id ? "text-white/85" : "text-[#64748B]"
                  }`}>
                    {option.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 按钮 */}
          <div className="mt-7 border-t border-[#E2E8F0] pt-5">
            <button
              onClick={generateAll}
              className={`w-full py-3 rounded-xl font-semibold ${
                loading || restoringTask || videoSourceUploading || (!isUnlimitedFeature && (featureConsumed || feature?.locked)) || !videoSourceImage
                  ? "bg-slate-200 text-slate-500"
                  : "bg-[#2563EB] text-white shadow-[0_14px_28px_rgba(37,99,235,0.2)] hover:bg-[#1D4ED8]"
              }`}
            >
            {videoSourceUploading ? "正在準備照片…" : "生成三種動畫"}
            </button>
            {!videoSourceImage && (
              <div className="mt-2 text-xs leading-5 text-[#64748B]">
                請先在上方上傳一張專門用來生成影片的人物照片。
              </div>
            )}

            <button
              onClick={handleSaveAndClose}
              disabled={loading}
              className={`mt-3 w-full py-3 rounded-xl font-semibold ${
                canSave
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {canSave ? "保存並返回" : "關閉"}
            </button>
          </div>
        </aside>

        {/* ================= 右侧预览区 ================= */}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC] p-6">
          {hasPreviewStage && (
            <div className="space-y-5">
              {loading && (
                <div className="flex items-center justify-between rounded-2xl border border-[#DBEAFE] bg-white px-5 py-4 shadow-sm">
                  <div>
                    <div className="text-sm font-semibold text-[#1E293B]">
                      生成中 {Math.max(1, Math.min(100, Math.round(progress)))}%
                    </div>
                    <div className="mt-1 text-xs text-[#64748B]">{loadingText}</div>
                  </div>
                  <button
                    onClick={requestCancelGenerating}
                    className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
                  >
                    取消
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {previewCards.map((item) => {
                  const status = previewStatus[item.key];
                  const isReady = (status === "ready" || status === "remove_bg_done") && item.src;
                  const statusText =
                    status === "generating"
                      ? "正在生成"
                      : status === "removing"
                      ? "正在去背"
                      : status === "remove_bg_done"
                      ? "已完成"
                      : status === "ready"
                      ? "已完成"
                      : "等待中";

                  return (
                    <div
                      key={item.key}
                      className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3">
                        <h3 className="text-sm font-semibold text-[#334155]">{item.title}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            status === "ready" || status === "remove_bg_done"
                              ? "bg-emerald-50 text-emerald-600"
                              : status === "waiting" || status === "pending"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          {statusText}
                        </span>
                      </div>
                      <div className="p-3">
                        {isReady ? (
                          <div className="rounded-2xl bg-black p-2 shadow">
                            <SequenceOrVideo src={item.src} />
                          </div>
                        ) : (
                          <div className="relative h-[276px] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8F8F6]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.88)_0%,rgba(248,250,252,0.92)_72%,rgba(241,245,249,0.96)_100%)]" />
                            {videoSourceImage ? (
                              <img
                                src={videoSourceImage}
                                alt={`${item.title} loading preview`}
                                className="absolute inset-0 h-full w-full object-contain scale-[1.12] blur-[18px] opacity-[0.72] saturate-[1.08]"
                              />
                            ) : null}
                            <div className="absolute inset-0 bg-white/40" />
                            <div className="absolute inset-0">
                              {Array.from({ length: 84 }).map((_, dotIndex) => {
                                const col = dotIndex % 7;
                                const row = Math.floor(dotIndex / 7);
                                const left = 10 + col * 13.5;
                                const top = 4 + row * 8.1;
                                const size = 4 + (dotIndex % 3);
                                const duration = 2.6 + (dotIndex % 5) * 0.45;
                                const delay = (dotIndex % 11) * 0.18;
                                const opacity = 0.16 + (dotIndex % 4) * 0.06;

                                return (
                                  <span
                                    key={`${item.key}-dot-${dotIndex}`}
                                    className="absolute rounded-full bg-white/80"
                                    style={{
                                      left: `${left}%`,
                                      top: `${top}%`,
                                      width: `${size}px`,
                                      height: `${size}px`,
                                      opacity,
                                      animation: `videoStudioDotPulse ${duration}s ease-in-out ${delay}s infinite`,
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                              <div className="flex items-center gap-3 rounded-full bg-[linear-gradient(180deg,rgba(115,87,72,0.82),rgba(95,72,60,0.86))] px-4 py-2 text-white shadow-[0_18px_36px_rgba(115,87,72,0.2)] backdrop-blur-md">
                                <span className="text-[12px] font-semibold tracking-[0.01em]">
                                  {status === "waiting"
                                    ? "等待中"
                                    : `${status === "generating" ? "生成中" : "處理中"} ${Math.max(
                                        12,
                                        Math.min(96, Math.round(progress))
                                      )}%`}
                                </span>
                                <span className="h-4 w-px bg-white/28" />
                                <span className="text-[11px] font-medium text-white/78">
                                  {status === "waiting" ? "待命" : "取消"}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 初始界面 */}
          {!hasPreviewStage && (
            <div className="text-gray-500 text-center mt-20">
              <div className="text-4xl mb-3">🎬</div>
              <div className="font-semibold text-lg">影片準備開始</div>
              <div>設定左側參數後開始生成</div>
            </div>
          )}
        </main>
      </div>
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
      <style>
        {`
          @keyframes videoStudioDotPulse {
            0%, 100% {
              opacity: 0.1;
              transform: scale(0.92);
              filter: blur(0px);
            }
            50% {
              opacity: 0.75;
              transform: scale(1.12);
              filter: blur(0.2px);
            }
          }
        `}
      </style>
      {showHint && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[120] w-[280px] rounded-2xl border border-[#E2E8F0] bg-white p-3 text-[11px] leading-5 text-[#64748B] shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
              style={{
                top: hintPosition.top,
                left: hintPosition.left,
              }}
            >
              <div className="text-xs font-bold text-[#1E293B]">效果預覽</div>
              <p className="mt-2">
                影片將根據這裡上傳的照片生成，以下為三種動作效果示意。
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  {
                    label: "Idle",
                    className: "scale-100 translate-y-0 rotate-0",
                    videoSrc: HINT_VIDEO_SLOTS.idle,
                  },
                  {
                    label: "Speaking",
                    className: "scale-[1.03] -translate-y-1 rotate-0",
                    videoSrc: HINT_VIDEO_SLOTS.speaking,
                  },
                  {
                    label: "Thinking",
                    className: "scale-100 translate-y-0 -rotate-2",
                    videoSrc: HINT_VIDEO_SLOTS.thinking,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 text-[11px] font-semibold text-[#64748B]">{item.label}</div>
                    <div className="flex h-28 items-end justify-center overflow-hidden rounded-xl bg-black">
                      {item.videoSrc ? (
                        <video
                          src={item.videoSrc}
                          className="h-full w-full object-contain"
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                        />
                      ) : (
                        <img
                          src={avatarUrl}
                          alt={item.label}
                          className={`h-full w-auto object-contain ${item.className}`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
      {showUploadHint && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[120] w-[260px] rounded-2xl border border-[#E2E8F0] bg-white p-3 text-[11px] leading-5 text-[#64748B] shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
              style={{
                top: uploadHintPosition.top,
                left: uploadHintPosition.left,
              }}
            >
              <div className="text-xs font-bold text-[#1E293B]">建議上傳的照片</div>
              <p className="mt-2">
                請上傳單人、正面或接近正面、主體清晰的半身或全身人物照。避免多人入鏡、手臂遮臉、裁切過緊、背景太亂或照片過暗，這樣生成出來的 Idle、Speaking、Thinking 會更穩定。
              </p>
              <div className="mt-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-[10px] leading-4 text-[#64748B]">
                這張照片只會作為影片工作室的生成來源，不會覆蓋你最開始設定的人物圖。
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
