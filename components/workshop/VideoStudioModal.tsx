"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { SequencePngPlayer } from "./SequencePngPlayer";
import { Icons } from "../icons";
import type { FeatureEntitlement } from "../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../hooks/usePlatformDialog";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { PlatformDialog } from "../system/PlatformDialog";
import { API_BASE } from "../../utils/api";

interface Props {
  onClose: () => void;
  avatarUrl: string;
  task?: {
    id: string;
    status: string;
    slots?: Record<string, any>;
  } | null;
  feature?: FeatureEntitlement;
  onConsumeFeature?: (key: string, amount?: number, meta?: Record<string, unknown>) => Promise<any>;
  onFeatureRefresh?: () => Promise<any>;
  onTaskChange?: (task: any) => void;
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
const LOOP_PROMPT_SUFFIX =
  "Create a seamless looping animation. The final frame must return as close as possible to the first frame, with matching body pose, head angle, character position, camera framing, subject scale, and overall composition. Motion must form a smooth closed cycle with no visible jump when the clip restarts. Do not end with a hold, stop, reset, or abrupt pose change. Keep the camera fully locked and keep body translation near zero so the ending flows naturally back into the beginning. Favor very small, smooth, low-amplitude motion over expressive or dramatic movement.";

const isSequenceManifest = (url?: string | null) =>
  Boolean(url && /\/manifest\.json(\?|$)/i.test(url));

const SequenceOrVideo: React.FC<{ src: string }> = ({ src }) => {
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
  task,
  feature,
  onConsumeFeature,
  onFeatureRefresh,
  onTaskChange,
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
  const FIXED_PRESET = "small_movement";
  const FIXED_STYLE_PROMPT =
    "Use the small-movement style. Keep the animation extremely restrained and natural. Allow only tiny micro-movements in the face, mouth, and head, with minimal pose variation. Avoid expressive gestures, large motion arcs, exaggerated acting, or noticeable body movement.";
  const phaseMilestones = [18, 33, 48, 63, 78, 93];

  // ===== 左侧面板 UI =====
  const [sourceAspectRatio, setSourceAspectRatio] = useState<string>("16:9");
  const [videoSourceImage, setVideoSourceImage] = useState<string>("");
  const [videoSourceRemoteUrl, setVideoSourceRemoteUrl] = useState<string>("");
  const [studioTaskId, setStudioTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<any>(task || null);

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
  const [hintPosition, setHintPosition] = useState({ top: 0, left: 0 });
  const { dialog, closeDialog, showAlert, showConfirm } = usePlatformDialog();
  const hintButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTaskIdRef = useRef<string | null>(task?.id || null);
  const onVideoProgressRef = useRef(onVideoProgress);
  const onVideosGeneratedRef = useRef(onVideosGenerated);
  const isUnlimitedFeature = Boolean(feature?.unlimited);
  const PROGRESS_REFRESH_MS = 300;
  const SLOT_ESTIMATE_MS = 90000;

  useBodyScrollLock(true);

  useEffect(() => {
    const nextTaskId = task?.id || null;
    if (nextTaskId !== lastTaskIdRef.current) {
      setActiveTask(task || null);
      setStudioTaskId(nextTaskId);
      lastTaskIdRef.current = nextTaskId;
    }
  }, [task?.id]);

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
    setVideoSourceImage(avatarUrl || "");
    setVideoSourceRemoteUrl(avatarUrl || "");
  }, [avatarUrl]);

  useEffect(() => {
    onVideoProgressRef.current = onVideoProgress;
  }, [onVideoProgress]);

  useEffect(() => {
    onVideosGeneratedRef.current = onVideosGenerated;
  }, [onVideosGenerated]);

  useEffect(() => {
    if (!activeTask) return;

    const nextTaskId = activeTask.id || null;
    setStudioTaskId((prev) => (prev === nextTaskId ? prev : nextTaskId));
    const nextIdle = activeTask.slots?.idle?.resultUrl || null;
    const nextSpeaking = activeTask.slots?.speaking?.resultUrl || null;
    const nextThinking = activeTask.slots?.thinking?.resultUrl || null;

    setIdleWebm((prev) => (prev === nextIdle ? prev : nextIdle));
    setSpeakingWebm((prev) => (prev === nextSpeaking ? prev : nextSpeaking));
    setThinkingWebm((prev) => (prev === nextThinking ? prev : nextThinking));
    setPreviewStatus((prev) => {
      const next = {
        idle: activeTask.slots?.idle?.status || "waiting",
        speaking: activeTask.slots?.speaking?.status || "waiting",
        thinking: activeTask.slots?.thinking?.status || "waiting",
      };
      if (
        prev.idle === next.idle &&
        prev.speaking === next.speaking &&
        prev.thinking === next.thinking
      ) {
        return prev;
      }
      return next;
    });

    onVideoProgressRef.current?.({
      idleUrl: nextIdle || undefined,
      speakingUrl: nextSpeaking || undefined,
      thinkingUrl: nextThinking || undefined,
    });

    if (nextIdle && nextSpeaking && nextThinking && activeTask.status === "ready") {
      onVideosGeneratedRef.current?.({
        idleUrl: nextIdle,
        speakingUrl: nextSpeaking,
        thinkingUrl: nextThinking,
      });
    }
  }, [activeTask]);

  useEffect(() => {
    if (!activeTask?.id) return;
    if (activeTask.status === "ready" || activeTask.status === "failed") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/video/studio-task/${activeTask.id}`);
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.task) {
          setActiveTask(data.task);
          onTaskChange?.(data.task);
        }
      } catch {
        // ignore polling failure
      }
    };

    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTask?.id, activeTask?.status, onTaskChange]);

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

  const getLiveProgressFromTask = (taskData: any, nowTs = Date.now()) => {
    const slots = taskData?.slots || {};
    const slotOrder: PreviewSlotKey[] = ["idle", "speaking", "thinking"];
    const perSlot = 33;
    let nextProgress = 0;
    let currentLabel = "準備中";

    for (const key of slotOrder) {
      const slot = slots[key];
      const status = slot?.status;

      if (status === "ready" || status === "remove_bg_done") {
        nextProgress += perSlot;
        continue;
      }

      if (status === "generating") {
        const updatedAtTs = slot?.updatedAt ? new Date(slot.updatedAt).getTime() : nowTs;
        const elapsed = Math.max(0, nowTs - updatedAtTs);
        const t = Math.min(1, elapsed / SLOT_ESTIMATE_MS);
        // generating phase advances smoothly within this slot, reserves final part for completion handoff
        const inSlotProgress = Math.floor(6 + t * 24); // 6..30
        nextProgress += inSlotProgress;
        currentLabel = `正在生成 ${key} 動畫`;
        break;
      }

      if (status === "failed") {
        currentLabel = "生成失敗";
        break;
      }

      currentLabel = `等待 ${key} 動畫`;
      break;
    }

    if (taskData?.status === "ready") {
      nextProgress = 100;
      currentLabel = "三段動畫已完成";
    } else if (taskData?.status === "failed") {
      currentLabel = "背景任務失敗";
    }

    return {
      progress: Math.max(0, Math.min(100, nextProgress)),
      label: currentLabel,
    };
  };

  useEffect(() => {
    if (!activeTask) {
      setLoading(false);
      if (!(idleWebm || speakingWebm || thinkingWebm)) {
        setProgress(0);
        progressRef.current = 0;
      }
      return;
    }

    const initial = getLiveProgressFromTask(activeTask, Date.now());
    setProgress(initial.progress);
    progressRef.current = initial.progress;
    setLoadingText(initial.label);
    setLoading(activeTask.status !== "ready" && activeTask.status !== "failed");

    if (activeTask.status === "ready" || activeTask.status === "failed") {
      return;
    }

    const timer = window.setInterval(() => {
      const live = getLiveProgressFromTask(activeTask, Date.now());
      setProgress((prev) => (live.progress === prev ? prev : live.progress));
      progressRef.current = live.progress;
      setLoadingText((prev) => (prev === live.label ? prev : live.label));
    }, PROGRESS_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTask, idleWebm, speakingWebm, thinkingWebm]);

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
        preset: FIXED_PRESET,
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
    idle:
      "Silent idle only. Character stands in place with both feet planted at exactly the same position. No walking, no stepping, no body translation, and no turn-and-shift. Mouth must stay naturally closed for the entire clip: no speech, no lip-sync, no mouth opening, no visible teeth, no tongue, and no jaw rhythm. Keep the body almost perfectly still. Do not move the head, neck, shoulders, torso, arms, hands, or posture. Do not sway, nod, tilt, lean, gesture, or shift weight. The only allowed motion is tiny eye movement and occasional natural blinking. Breathing must be imperceptible or nearly imperceptible. Keep all motion extremely small and smooth, with no expressive acting. Camera must be fully locked: no zoom, no pan, no dolly, and no shake. Do not move the framing. Background must remain pure bright chroma key green, close to RGB 0,255,0, as a single uniform solid color with no gradient, no texture, no noise, no shadow, no reflection, no glare, no depth-of-field blur, and no background objects. The subject must have no green spill, no green reflection, and no green edge halo. Edges must stay crisp and clean for keying, including hair strands, fingers, and clothing contours.",
    speaking:
      "Speaking mode with restrained lip-sync only. Character stands in place with both feet planted at exactly the same position. No walking, no stepping, no body translation, and no turn-and-shift. Arms, hands, fingers, shoulders, torso, hips, legs, and posture must stay completely still. Do not gesture, wave, raise hands, move arms, shift weight, sway, lean, nod, or perform any body acting. Natural speech lip-sync is allowed only through small, controlled mouth movement. Keep mouth opening narrow and modest: no wide-open mouth, no exaggerated jaw drop, no visible teeth, no tongue, no shouting expression, and no large facial acting. Lips should move subtly as if speaking softly. Only tiny head micro-movements, very small facial changes, and natural blinking are allowed. Camera must be fully locked: no zoom, no push-in, no pull-back, no pan, and no shake. Keep the character fixed in the frame and show only subtle mouth movement. Background must remain pure bright chroma key green, close to RGB 0,255,0, as a single uniform solid color with no gradient, no texture, no noise, no shadow, no reflection, no glare, no depth-of-field blur, and no background objects. The subject must have no green spill, no green reflection, and no green edge halo. Edges must stay crisp and clean for keying, including hair strands, fingers, and clothing contours.",
    thinking:
      "Thinking mode, silent. Character stands in place with both feet planted at exactly the same position. No walking, no stepping, no body translation, and no turn-and-shift. Keep the body almost perfectly still. Do not move the shoulders, torso, arms, hands, or posture. Avoid dramatic pondering, large head turns, obvious nods, expressive gestures, or visible body motion. Allowed actions are only extremely subtle thinking cues: tiny eye movement, a very slight brow change, and a brief soft upward glance. Head movement should be absent or nearly absent, with no visible tilt unless absolutely minimal. Camera must be completely locked: no forward movement, no horizontal movement, no zoom, and no shake. No camera animation is allowed. Background must remain pure bright chroma key green, close to RGB 0,255,0, as a single uniform solid color with no gradient, no texture, no noise, no shadow, no reflection, no glare, no depth-of-field blur, and no background objects. The subject must have no green spill, no green reflection, and no green edge halo. Edges must stay crisp and clean for keying, including hair strands, fingers, and clothing contours.",
  };

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
      prompt: `${FIXED_STYLE_PROMPT} ${prompts[type]} ${LOOP_PROMPT_SUFFIX}`,
      duration: "2",
      aspectRatio: selectedAspectRatio,
      resolution: "480p",
      preset: FIXED_PRESET,
      imageUrl: img,
      loopFrameMode: type === "idle" || type === "thinking",
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
    const maxAttempts = 240;

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

          if (attempts > maxAttempts) {
            clearInterval(timer);
            reject(new Error(`${type} 生成等待超時（約 ${Math.round((maxAttempts * 2) / 60)} 分鐘）`));
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
  async function generateAll(testMode = false) {
    if (!testMode && !isUnlimitedFeature && (feature?.locked || featureConsumed)) {
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
    setLoading(true);
    setLoadingText(testMode ? "測試模式已啟動，不扣 token。" : "背景生成已啟動，稍後會持續更新進度。");

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
        setActiveTask(null);
        onTaskChange?.(null);
        onVideoProgress?.({
          idleUrl: "",
          speakingUrl: "",
          thinkingUrl: "",
        });
      }

      const taskId = await ensureStudioTask(restartingFresh);
      const startRes = await fetch(`${API_BASE}/api/video/studio-task/${taskId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMode }),
      });
      const startData = await startRes.json().catch(() => null);
      if (!startRes.ok || !startData?.task) {
        throw new Error(startData?.error || "failed to start video studio task");
      }

      setActiveTask(startData.task);
      onTaskChange?.(startData.task);
      setProgress(8);
      progressRef.current = 8;
      if (!testMode && !isUnlimitedFeature && !featureConsumed) {
        setFeatureConsumed(true);
      }
      setLoading(false);
    } catch (error) {
      console.error("生成失败", error);
      setLoading(false);
      showAlert({
        title: "生成失敗",
        message: error instanceof Error ? error.message : "影片生成失敗，請稍後再試。",
        tone: "danger",
      });
    }
  }

  function requestClose() {
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

  const previewCards: Array<{
    key: PreviewSlotKey;
    title: string;
    src: string | null;
  }> = [
    { key: "idle", title: "Idle", src: idleWebm },
    { key: "speaking", title: "Speaking", src: speakingWebm },
    { key: "thinking", title: "Thinking", src: thinkingWebm },
  ];

  const hasPreviewStage = loading || Boolean(activeTask || idleWebm || speakingWebm || thinkingWebm);

  /* ========= UI ========= */
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-0">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:h-[90vh] sm:w-[90vw] lg:flex-row">

        {/* ================= 左侧设置 ================= */}
        <aside className="flex max-h-[58vh] w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-[#FAFCFF] lg:h-full lg:max-h-none lg:w-[380px] lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-4 sm:p-7 sm:pb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-[24px] font-black tracking-[-0.04em] text-[#1E293B] sm:text-[28px]">影片工作室</h2>
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


            <div className="mt-5 rounded-[24px] border border-[#E2E8F0] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:mt-6 sm:rounded-[28px] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold tracking-[0.01em] text-[#334155]">生成照片</label>
              </div>
              <div className="mt-4 rounded-[24px] bg-[#F8FBFF] p-3">
                {videoSourceImage ? (
                  <div className="relative overflow-hidden rounded-[20px] bg-[#EEF4FB]">
                    <img
                      src={videoSourceImage}
                      alt="生成照片預覽"
                      className="h-[150px] w-full object-contain bg-[#EAF1F8] sm:h-[220px]"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-[#F8FBFF] via-[#F8FBFF]/92 to-transparent px-4 py-4">
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[150px] w-full flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white px-6 text-center sm:h-[220px]">
                    <div className="text-lg font-bold tracking-[-0.03em] text-[#1E293B]">尚未設定 Avatar</div>
                    <div className="mt-2 text-sm leading-6 text-[#64748B]">
                      請先回到第一步設定角色頭像，影片工作室會直接使用那張照片。
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 按钮 */}
          <div className="shrink-0 border-t border-[#E2E8F0] bg-white/92 p-4 shadow-[0_-12px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5 lg:bg-[#FAFCFF]">
            <button
              onClick={() => generateAll(false)}
              className={`w-full py-3 rounded-xl font-semibold ${
                loading || (!isUnlimitedFeature && (featureConsumed || feature?.locked)) || !videoSourceImage
                  ? "bg-slate-200 text-slate-500"
                  : "bg-[#2563EB] text-white shadow-[0_14px_28px_rgba(37,99,235,0.2)] hover:bg-[#1D4ED8]"
              }`}
            >
            生成三種動畫
            </button>
            {/* <button
              onClick={() => generateAll(true)}
              disabled={loading || !videoSourceImage}
              className={`mt-3 w-full py-3 rounded-xl font-semibold ${
                loading || !videoSourceImage
                  ? "border border-slate-200 bg-slate-100 text-slate-400"
                  : "border border-[#BFDBFE] bg-white text-[#2563EB] hover:bg-[#EFF6FF]"
              }`}
            >
              測試後台生成（不扣 token）
            </button> */}
            {!videoSourceImage && (
              <div className="mt-2 text-xs leading-5 text-[#64748B]">
                請先在上方上傳一張專門用來生成影片的人物照片。
              </div>
            )}

            <button
              onClick={handleSaveAndClose}
              className={`mt-3 w-full py-3 rounded-xl font-semibold ${
                canSave
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border"
              }`}
            >
              {canSave ? "保存並返回" : loading ? "先關閉，去做別的步驟" : "關閉"}
            </button>
          </div>
        </aside>

        {/* ================= 右侧预览区 ================= */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] p-4 sm:p-6">
          {hasPreviewStage && (
            <div className="space-y-5">
              {loading && (
                <div className="flex flex-col gap-3 rounded-2xl border border-[#DBEAFE] bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <div className="text-sm font-semibold text-[#1E293B]">
                      生成中 {Math.max(1, Math.min(100, Math.round(progress)))}%
                    </div>
                    <div className="mt-1 text-xs text-[#64748B]">{loadingText}</div>
                  </div>
                  <div className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#475569]">
                    可先關閉，背景繼續生成
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                          <div className="relative h-[240px] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8F8F6] sm:h-[276px]">
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
            <div className="text-gray-500 text-center mt-12 sm:mt-20">
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
    </div>
  );
}
