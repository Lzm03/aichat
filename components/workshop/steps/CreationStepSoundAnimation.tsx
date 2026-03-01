"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Icons } from "../../icons";
import VideoStudioModal from "../VideoStudioModal";

// ============ Section Wrapper ============
const Section = ({ title, children }: any) => (
  <div className="pt-6">
    <h4 className="text-md font-bold text-[#1E293B] mb-3">{title}</h4>
    {children}
  </div>
);

// ============ 声线工具 ============
const getPinyin = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ============ 声线选择组件 ============
const VoiceSelect = ({ voices, selected, onSelect }: any) => {
  const [keyword, setKeyword] = useState("");

  const grouped = useMemo(() => {
    const filtered = voices.filter((v: any) => {
      const text = (v.voice_name + v.voice_id).toLowerCase();
      return text.includes(keyword.toLowerCase());
    });

    filtered.sort((a: any, b: any) =>
      getPinyin(a.voice_name).localeCompare(getPinyin(b.voice_name))
    );

    const groups = { 男聲: [], 女聲: [], 小朋友: [], 卡通角色: [], 其他: [] };

    filtered.forEach((v: any) => {
      const n = v.voice_name || "";
      if (n.includes("男")) groups.男聲.push(v);
      else if (n.includes("女")) groups.女聲.push(v);
      else if (n.includes("童") || n.includes("Boy")) groups.小朋友.push(v);
      else if (n.includes("卡通") || n.includes("Anime")) groups.卡通角色.push(v);
      else groups.其他.push(v);
    });

    return groups;
  }, [voices, keyword]);

  return (
    <div className="w-full">
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜尋聲線"
        className="mb-2 w-full p-2 border rounded-lg text-sm"
      />

      <select
        onChange={(e) => onSelect(e.target.value)}
        value={selected}
        className="w-full p-3 border rounded-xl text-sm"
      >
        <option value="">請選擇聲線</option>

        {Object.entries(grouped).map(([group, list]) =>
          list.length ? (
            <optgroup key={group} label={`—— ${group} ——`}>
              {list.map((v: any) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.voice_name}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
    </div>
  );
};

// ============ 主组件 ============
export const CreationStepSoundAnimation = ({
  updateConfig,
  avatarUrl,
  videoIdle,
  videoThinking,
  videoTalking,
  voiceId,
}: any) => {
  const baseUrl = import.meta.env.VITE_API_URL;

  const [showStudio, setShowStudio] = useState(false);
  const [voiceList, setVoiceList] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(voiceId || "");

  const [auditionText, setAuditionText] = useState("你好，我係你嘅 AI 助手，好高興認識你。");
  const [isAuditioning, setIsAuditioning] = useState(false);

  // ============ 上传动画 loading 状态 ============
  const [uploadState, setUploadState] = useState({
    idle: { loading: false, progress: 0 },
    thinking: { loading: false, progress: 0 },
    talking: { loading: false, progress: 0 },
  });

  // ============ 加载声线 ============
  useEffect(() => {
    (async () => {
      const res = await fetch(`${baseUrl}/api/voices`);
      const data = await res.json();
      setVoiceList(data.voices || []);
    })();
  }, []);

  // ============ 上传并 remove-bg 流程 ============
  async function uploadRemoveBgVideo(file: File, type: "idle" | "thinking" | "talking") {
    setUploadState((s) => ({ ...s, [type]: { loading: true, progress: 1 } }));

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${baseUrl}/api/video/remove-bg`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!data.transparentUrl) {
        alert("RemoveBG 处理失败");
        return;
      }

      setUploadState((s) => ({ ...s, [type]: { loading: false, progress: 100 } }));

      if (type === "idle") updateConfig("videoIdle", data.transparentUrl);
      if (type === "thinking") updateConfig("videoThinking", data.transparentUrl);
      if (type === "talking") updateConfig("videoTalking", data.transparentUrl);
    } catch (err) {
      alert("上传失败");
      setUploadState((s) => ({ ...s, [type]: { loading: false, progress: 0 } }));
    }
  }

  // ============ 本地上传事件 ============
  function handleUpload(e: any, type: "idle" | "thinking" | "talking") {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadRemoveBgVideo(file, type);
  }

  // ============ 试听 TTS ============
  async function handleAudition() {
    if (!selectedVoice) return;

    setIsAuditioning(true);

    try {
      const res = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: auditionText, voiceId: selectedVoice }),
      });

      const audioBlob = await res.blob();
      new Audio(URL.createObjectURL(audioBlob)).play();
    } finally {
      setIsAuditioning(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ================== 声音 ================== */}
      <Section title="聲音製作">
        <VoiceSelect
          voices={voiceList}
          selected={selectedVoice}
          onSelect={(v:any) => {
            setSelectedVoice(v);
            updateConfig("voiceId", v);   // ⭐ 保存到 botConfig
          }}
        />

        <textarea
          value={auditionText}
          onChange={(e) => setAuditionText(e.target.value)}
          className="w-full p-3 border rounded-xl mt-3"
          rows={2}
        />

        <button
          onClick={handleAudition}
          disabled={!selectedVoice}
          className="w-full px-4 py-2 bg-white border rounded-xl text-sm mt-2"
        >
          {isAuditioning ? "合成中…" : "試聽"}
        </button>
      </Section>

      {/* ================== 动画 ================== */}
      <Section title="動畫設定">
        <button
          onClick={() => setShowStudio(true)}
          className="px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          🎬 開啟 AI 影片工作室
        </button>

        <div className="mt-6 space-y-5">
          {[
            { key: "idle", label: "Idle（待機動畫）", value: videoIdle },
            { key: "thinking", label: "Thinking（思考動畫）", value: videoThinking },
            { key: "talking", label: "Talking（說話動畫）", value: videoTalking },
          ].map((item: any) => (
            <div key={item.key}>
              <label className="text-sm font-medium">{item.label}</label>

              {/* 上传按钮 */}
              <input type="file" accept="video/*" onChange={(e) => handleUpload(e, item.key)} />

              {/* Loading */}
              {uploadState[item.key].loading ? (
                <div className="text-xs text-blue-600 mt-1">
                  正在移除背景… {uploadState[item.key].progress}%
                </div>
              ) : (
                item.value && (
                  <video
                    src={item.value}
                    className="mt-2 w-40 rounded-xl shadow"
                    autoPlay
                    loop
                    muted
                  />
                )
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ================== AI 自动生成 ================== */}
      {showStudio && (
        <VideoStudioModal
          avatarUrl={avatarUrl}
          onClose={() => setShowStudio(false)}
          onVideosGenerated={(videos: any) => {
            updateConfig("videoIdle", videos.idleUrl);
            updateConfig("videoThinking", videos.thinkingUrl);
            updateConfig("videoTalking", videos.speakingUrl);
          }}
        />
      )}
    </div>
  );
};