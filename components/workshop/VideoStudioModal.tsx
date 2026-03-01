"use client";
import React, { useState } from "react";
import axios from "axios";

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

  // ===== 左侧面板 UI =====
  const [preset, setPreset] = useState("cinematic");
  const [duration, setDuration] = useState("10");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1080p");

  // ===== Loading 状态 =====
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [loading, setLoading] = useState(false);

  // ===== 最终透明版视频 =====
  const [idleWebm, setIdleWebm] = useState<string | null>(null);
  const [speakingWebm, setSpeakingWebm] = useState<string | null>(null);
  const [thinkingWebm, setThinkingWebm] = useState<string | null>(null);

  const baseUrl = import.meta.env.VITE_API_URL;

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
    if (avatarUrl.startsWith("blob:")) {
      img = await blobUrlToBase64(avatarUrl);
    }

    const payload = {
      prompt: prompts[type],
      duration,
      aspectRatio,
      resolution,
      preset,
      imageUrl: img,
    };

    const res = await axios.post(`${baseUrl}/api/video/generate`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    return await pollVideoStatus(res.data.request_id, type);
  }

  /* ========= Step 2: 轮询生成状态 ========= */
  async function pollVideoStatus(requestId: string, type: string) {
    let attempts = 0;

    return new Promise<string>((resolve, reject) => {
      const timer = setInterval(async () => {
        attempts++;

        try {
          const res = await axios.get(`${baseUrl}/api/video/result/${requestId}`);
          const data = res.data;

          if (data.progress) {
            setProgress(Math.min(80, data.progress));
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

    return res.data.transparentUrl; // webm
  }

  /* ========= Step 4: 完整流程 一键生成所有动画 ========= */
  async function generateAll() {
    setLoading(true);
    setProgress(1);

    try {
      // Idle
      const idle = await requestOneVideo("idle");
      setProgress(30);
      const idleWebmUrl = await removeBg(idle);
      setIdleWebm(idleWebmUrl);
      setProgress(50);

      // Speaking
      const speak = await requestOneVideo("speaking");
      setProgress(60);
      const speakWebmUrl = await removeBg(speak);
      setSpeakingWebm(speakWebmUrl);
      setProgress(80);

      // Thinking
      const think = await requestOneVideo("thinking");
      setProgress(85);
      const thinkWebmUrl = await removeBg(think);
      setThinkingWebm(thinkWebmUrl);
      setProgress(100);

      // 返回给外层组件（透明视频）
      onVideosGenerated({
        idleUrl: idleWebmUrl,
        speakingUrl: speakWebmUrl,
        thinkingUrl: thinkWebmUrl,
      });

      setLoading(false);
    } catch (error) {
      console.error("生成失败", error);
      setLoading(false);
      alert("生成失败，请稍后再试");
    }
  }

  /* ========= UI ========= */
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[90vw] h-[90vh] bg-white rounded-xl shadow-xl flex overflow-hidden">

        {/* ================= 左侧设置 ================= */}
        <aside className="w-[360px] p-6 border-r overflow-y-auto">
          <h2 className="text-xl font-bold">影片工作室</h2>
          <p className="text-gray-500 text-sm mb-4">AI 影片生成（透明背景）</p>

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

          {/* 长度 / 比例 / 分辨率 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold">長度</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option value="2">2 秒</option>
                <option value="5">5 秒</option>
                <option value="10">10 秒</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">畫面比例</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option>16:9</option>
                <option>9:16</option>
                <option>1:1</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">解析度</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option>480p</option>
                <option>720p</option>
                <option>1080p</option>
              </select>
            </div>
          </div>

          {/* 按钮 */}
          <div className="mt-6">
            <button
              onClick={generateAll}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              🎬 生成三種動畫（透明背景）
            </button>

            <button
              onClick={onClose}
              className="mt-3 w-full py-3 rounded-xl border"
            >
              取消
            </button>
          </div>
        </aside>

        {/* ================= 右侧预览区 ================= */}
        <main className="flex-1 p-6 overflow-y-auto bg-gray-50">

          {/* Loading UI */}
          {loading && (
            <div className="text-center mt-20">
              <div className="animate-spin w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4" />
              <div className="font-bold text-lg">{loadingText}</div>
              <div className="text-gray-500 mt-1">{progress}%</div>
            </div>
          )}

          {/* 三个透明视频预览 */}
          {!loading && idleWebm && speakingWebm && thinkingWebm && (
            <div className="space-y-10">
              <div>
                <h3 className="text-lg font-semibold mb-2">✨ Idle（透明）</h3>
                <video className="w-full rounded-xl shadow" autoPlay muted loop src={idleWebm} />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">🗣 Speaking（透明）</h3>
                <video className="w-full rounded-xl shadow" autoPlay muted loop src={speakingWebm} />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">🤔 Thinking（透明）</h3>
                <video className="w-full rounded-xl shadow" autoPlay muted loop src={thinkingWebm} />
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
