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
  const [preset, setPreset] = useState("cinematic");
  const [duration, setDuration] = useState("10");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1080p");

  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [loading, setLoading] = useState(false);

  /* ⭐ 新增：三个生成结果 URL */
  const [idleUrl, setIdleUrl] = useState<string | null>(null);
  const [speakingUrl, setSpeakingUrl] = useState<string | null>(null);
  const [thinkingUrl, setThinkingUrl] = useState<string | null>(null);

  const API_BASE =
    process.env.NODE_ENV === "development"
      ? "http://localhost:4000"
      : process.env.NEXT_PUBLIC_API_BASE;

  const prompts = {
    idle: "角色保持静止并微微眨眼的待机动画",
    speaking: "角色张嘴说话的自然口型动画",
    thinking: "角色抬头或皱眉的思考动作动画",
  };

  /* ========= 单个视频生成 ========= */
  async function requestOneVideo(type: "idle" | "speaking" | "thinking") {
    setLoadingText(`正在生成：${type}...`);

    let imageBase64 = avatarUrl;
    if (avatarUrl.startsWith("blob:")) {
      imageBase64 = await blobUrlToBase64(avatarUrl);
    }

    const payload = {
      prompt: prompts[type],
      duration,
      aspectRatio,
      resolution,
      imageUrl: imageBase64,
    };

    const res = await axios.post(`${API_BASE}/api/video/generate`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    const requestId = res.data.request_id;
    return await pollResult(requestId, type);
  }

  /* ========= 轮询结果 ========= */
  async function pollResult(requestId: string, type: string) {
    let attempts = 0;

    return new Promise<string>((resolve, reject) => {
      const timer = setInterval(async () => {
        attempts++;

        try {
          const res = await axios.get(
            `${API_BASE}/api/video/result/${requestId}`
          );
          const data = res.data;

          if (data.progress) setProgress(Math.min(100, data.progress));

          if (data.status === "completed") {
            clearInterval(timer);
            resolve(data.url);
          }

          if (data.status === "failed") {
            clearInterval(timer);
            reject(new Error(`${type} 生成失败`));
          }

          if (attempts > 120) {
            clearInterval(timer);
            reject(new Error(`${type} 超时`));
          }
        } catch (err) {
          clearInterval(timer);
          reject(err);
        }
      }, 2000);
    });
  }

  /* ========= 一键生成全部动画 ========= */
  async function generateAll() {
    setLoading(true);
    setProgress(2);

    try {
      const idle = await requestOneVideo("idle");
      setIdleUrl(idle);
      setProgress(35);

      const speak = await requestOneVideo("speaking");
      setSpeakingUrl(speak);
      setProgress(65);

      const think = await requestOneVideo("thinking");
      setThinkingUrl(think);
      setProgress(100);

      onVideosGenerated({
        idleUrl: idle,
        speakingUrl: speak,
        thinkingUrl: think,
      });

      setLoading(false);
    } catch (err) {
      setLoading(false);
      alert("生成失败，请稍后再试");
    }
  }

  /* ======================================
     UI 开始
  ====================================== */
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[90vw] h-[90vh] bg-white rounded-xl shadow-xl flex overflow-hidden">
        
        {/* 左侧设置面板 */}
        <aside className="w-[360px] bg-white p-6 border-r overflow-y-auto">
          <h2 className="text-xl font-bold">影片工作室</h2>
          <p className="text-gray-500 text-sm mb-4">電影級 AI 影片生成 · 快速預覽</p>

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

          {/* 高级设置 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold">長度</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option value="2">2 sec</option>
                <option value="5">5 sec</option>
                <option value="10">10 sec</option>
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
              🎬 生成三種動畫
            </button>

            <button onClick={onClose} className="mt-3 w-full py-3 rounded-xl border">
              取消
            </button>
          </div>
        </aside>

        {/* 右侧内容：初始 / Loading / 视频预览 */}
        <main className="flex-1 bg-gray-50 p-6 overflow-y-auto">

          {/* 初始状态 */}
          {!loading && !idleUrl && !speakingUrl && !thinkingUrl && (
            <div className="text-gray-500 text-center mt-20">
              <div className="text-4xl mb-3">🎬</div>
              <div className="font-semibold text-lg">影片準備開始</div>
              <div>設定左側參數並點擊「生成三種動畫」</div>
            </div>
          )}

          {/* 加载中 */}
          {loading && (
            <div className="text-center mt-20">
              <div className="animate-spin w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4"></div>
              <div className="font-bold text-lg">{loadingText}</div>
              <div className="text-gray-500 mt-1">{progress}%</div>
            </div>
          )}

          {/* 生成成功：三个视频预览 */}
          {!loading && idleUrl && speakingUrl && thinkingUrl && (
            <div className="space-y-10">

              <div>
                <h3 className="text-lg font-semibold mb-2 text-slate-700">✨ Idle（待機動畫）</h3>
                <video className="w-full rounded-xl shadow" controls src={idleUrl} />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 text-slate-700">🗣 Speaking（說話動畫）</h3>
                <video className="w-full rounded-xl shadow" controls src={speakingUrl} />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 text-slate-700">🤔 Thinking（思考動畫）</h3>
                <video className="w-full rounded-xl shadow" controls src={thinkingUrl} />
              </div>

            </div>
          )}
        </main>

      </div>
    </div>
  );
}