"use client";
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { SequencePngPlayer } from "./SequencePngPlayer";

interface Props {
  onClose: () => void;
  avatarUrl: string;
  onVideosGenerated: (videos: {
    idleUrl: string;
    speakingUrl: string;
    thinkingUrl: string;
  }) => void;
}

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
  onVideosGenerated,
}: Props) {
  const phaseMilestones = [18, 33, 48, 63, 78, 93];

  // ===== 左侧面板 UI =====
  const [preset, setPreset] = useState("cinematic");
  const [sourceAspectRatio, setSourceAspectRatio] = useState<string>("16:9");

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
  const canSave = !!(idleWebm && speakingWebm && thinkingWebm);

  const baseUrl = import.meta.env.VITE_API_URL;
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
    let active = true;

    async function detectSourceRatio() {
      if (!avatarUrl) {
        if (active) setSourceAspectRatio("16:9");
        return;
      }

      if (avatarUrl.startsWith("blob:")) {
        const base64 = await blobUrlToBase64(avatarUrl);
        const ratio = await getImageRatio(base64);
        if (active) setSourceAspectRatio(ratio);
        return;
      }

      const ratio = await getImageRatio(avatarUrl);
      if (active) setSourceAspectRatio(ratio);
    }

    void detectSourceRatio();
    return () => {
      active = false;
    };
  }, [avatarUrl]);

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

  // 动作对应的 prompts
  const prompts = {
    idle: "角色保持静止、自然呼吸、微微眨眼。相機完全固定，不縮放、不前後移動、不平移、不搖晃。只允許角色本身的輕微動作，不要移動取景框。",
    speaking: "角色自然張嘴說話，口型連貫、清晰。相機完全固定，不縮放、不推拉、不運鏡、不搖晃。保持角色在畫面中固定位置，只演示口型與表情。",
    thinking: "角色做出思考動作（抬頭、皱眉、輕微眼球運動）即可。相機固定鎖死，不前後移動、不左右平移、不縮放、不搖鏡。禁止鏡頭動畫，僅允許角色頭部小幅度動作。",
  };

  /* ========= Step 1: 生成原始动画 ========= */
  async function requestOneVideo(type: "idle" | "speaking" | "thinking") {
    setLoadingText(`正在生成：${type} 原始視頻...`);

    let img = avatarUrl;
    const isLocalAsset =
      avatarUrl.startsWith("blob:") ||
      avatarUrl.includes("localhost") ||
      avatarUrl.includes("127.0.0.1");

    // 云端模型无法访问本机 localhost，改用 base64 直传
    if (isLocalAsset) {
      img = await blobUrlToBase64(avatarUrl);
    }

    const rawAspectRatio =
      isLocalAsset ? sourceAspectRatio : await getImageRatio(avatarUrl);
    const selectedAspectRatio = normalizeAspectRatioForApi(rawAspectRatio);

    const payload = {
      prompt: prompts[type],
      duration: "2",
      aspectRatio: selectedAspectRatio,
      resolution: "480p",
      preset,
      imageUrl: img,
    };

    const res = await axios.post(`${baseUrl}/api/video/generate`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    return await pollVideoStatus(res.data.request_id, type);
  }

  async function requestOneVideoWithRetry(
    type: "idle" | "speaking" | "thinking",
    maxRetry = 1
  ) {
    let attempt = 0;
    while (true) {
      try {
        return await requestOneVideo(type);
      } catch (err) {
        if (cancelRef.current) throw err;
        if (attempt >= maxRetry) throw err;
        attempt += 1;
        setLoadingText(`正在重試：${type}（第 ${attempt + 1} 次）...`);
      }
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
    cancelRef.current = false;
    setLoading(true);
    setProgress(1);
    progressRef.current = 1;
    setPhaseIndex(0);

    try {
      // Idle
      beginPhase(0, "gen");
      const idle = await requestOneVideoWithRetry("idle");
      if (cancelRef.current) throw new Error("cancelled");
      completePhase("gen");

      beginPhase(1, "rm");
      const idleWebmUrl = await removeBg(idle);
      if (cancelRef.current) throw new Error("cancelled");
      setIdleWebm(idleWebmUrl);
      completePhase("rm");

      // Speaking
      beginPhase(2, "gen");
      const speak = await requestOneVideoWithRetry("speaking");
      if (cancelRef.current) throw new Error("cancelled");
      completePhase("gen");

      beginPhase(3, "rm");
      const speakWebmUrl = await removeBg(speak);
      if (cancelRef.current) throw new Error("cancelled");
      setSpeakingWebm(speakWebmUrl);
      completePhase("rm");

      // Thinking
      beginPhase(4, "gen");
      const think = await requestOneVideoWithRetry("thinking");
      if (cancelRef.current) throw new Error("cancelled");
      completePhase("gen");

      beginPhase(5, "rm");
      const thinkWebmUrl = await removeBg(think);
      if (cancelRef.current) throw new Error("cancelled");
      setThinkingWebm(thinkWebmUrl);
      completePhase("rm");

      await new Promise((resolve) => setTimeout(resolve, 800));
      setProgress(100);
      progressRef.current = 100;

      setLoading(false);
    } catch (error) {
      console.error("生成失败", error);
      clearPhaseTimer();
      setLoading(false);
      if (!cancelRef.current) {
        alert("生成失败，请稍后再试");
      }
    }
  }

  function handleCancelGenerating() {
    cancelRef.current = true;
    clearPhaseTimer();
    setLoading(false);
  }

  function handleSaveAndClose() {
    if (!canSave) {
      onClose();
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

  /* ========= UI ========= */
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[90vw] h-[90vh] bg-white rounded-xl shadow-xl flex overflow-hidden">

        {/* ================= 左侧设置 ================= */}
        <aside className="w-[360px] p-6 border-r overflow-y-auto">
          <h2 className="text-xl font-bold">影片工作室</h2>
          <p className="text-gray-500 text-sm mb-4">極簡模式</p>

          {/* 风格 */}
          <div className="mt-4">
            <label className="font-semibold text-gray-600">風格</label>
            <div className="flex gap-2 mt-2">
              {["cinematic", "documentary", "dreamy"].map((p) => (
                <button
                  key={p}
                  className={`px-3 py-2 rounded-lg border ${
                    preset === p ? "bg-blue-600 text-white" : ""
                  }`}
                  onClick={() => setPreset(p)}
                >
                  {p === "cinematic"
                    ? "電影感"
                    : p === "documentary"
                    ? "紀錄片"
                    : "夢幻"}
                </button>
              ))}
            </div>
          </div>

          {/* 按钮 */}
          <div className="mt-6">
            <button
              onClick={generateAll}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              🎬 生成三種動畫（透明背景）
            </button>

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
        <main className="flex-1 p-6 overflow-y-auto bg-gray-50">

          {/* Loading UI */}
          {loading && (
            <div
              className="relative h-[72vh] rounded-3xl overflow-hidden"
              style={{
                backgroundColor: "#f3f4f6",
                backgroundImage:
                  "radial-gradient(circle, rgba(148,163,184,0.35) 2px, transparent 2px)",
                backgroundSize: "30px 30px",
              }}
            >
              <div className="absolute inset-0 bg-white/30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-7 py-3 rounded-full bg-gray-700/65 text-white text-2xl font-semibold tracking-wide backdrop-blur-sm shadow-lg flex items-center gap-4">
                  <span>生成中 {Math.max(1, Math.min(100, Math.round(progress)))}%</span>
                  <span className="opacity-70">|</span>
                  <button
                    onClick={handleCancelGenerating}
                    className="text-white/95 hover:text-white"
                  >
                    取消
                  </button>
                </div>
              </div>
              <div className="absolute bottom-6 left-0 right-0 text-center text-sm text-slate-600">
                {loadingText}
              </div>
            </div>
          )}

          {/* 三个透明视频预览 */}
          {!loading && idleWebm && speakingWebm && thinkingWebm && (
            <div className="h-full flex items-center">
              <div className="w-full grid grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-slate-700">Idle</h3>
	                  <div className="rounded-2xl bg-black p-2 shadow">
	                    <SequenceOrVideo src={idleWebm} />
	                  </div>
	                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2 text-slate-700">Speaking</h3>
	                  <div className="rounded-2xl bg-black p-2 shadow">
	                    <SequenceOrVideo src={speakingWebm} />
	                  </div>
	                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2 text-slate-700">Thinking</h3>
	                  <div className="rounded-2xl bg-black p-2 shadow">
	                    <SequenceOrVideo src={thinkingWebm} />
	                  </div>
	                </div>
              </div>
            </div>
          )}

          {/* 初始界面 */}
          {!loading && !idleWebm && (
            <div className="text-gray-500 text-center mt-20">
              <div className="text-4xl mb-3">🎬</div>
              <div className="font-semibold text-lg">影片準備開始</div>
              <div>設定左側參數後開始生成</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
