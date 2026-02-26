"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Icons } from "../../icons";
import VideoStudioModal from "../VideoStudioModal";

// --- Helper Components ---
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="pt-6">
    <h4 className="text-md font-bold text-[#1E293B] mb-3">{title}</h4>
    {children}
  </div>
);

const getPinyin = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// --- VoiceSelect ---
const VoiceSelect = ({
  voices,
  selected,
  onSelect,
}: {
  voices: any[];
  selected: string;
  onSelect: (v: string) => void;
}) => {
  const [keyword, setKeyword] = useState("");

  console.log("🎤 VoiceSelect(voices) =", voices); // <--- 必须只看到后端的 10 多个声线

  // --- 分类规则 ---
  const classify = (voice: any) => {
    const name = voice.voice_name || "";
    if (name.includes("男") || name.includes("Man") || name.includes("男声")) return "男聲";
    if (name.includes("女") || name.includes("Lady") || name.includes("女声")) return "女聲";
    if (name.includes("童") || name.includes("Boy") || name.includes("Girl")) return "小朋友";
    if (name.includes("卡通") || name.includes("动漫") || name.includes("Anime") || name.includes("Elf"))
      return "卡通角色";
    return "其他";
  };

  // --- 搜索 + 排序 + 分组 ---
  const grouped = useMemo(() => {
    const filtered = voices.filter((v) => {
      const text = (v.voice_name + v.voice_id).toLowerCase();
      return text.includes(keyword.toLowerCase());
    });

    filtered.sort((a, b) =>
      getPinyin(a.voice_name || "").localeCompare(getPinyin(b.voice_name || ""))
    );

    const groups = {
      男聲: [] as any[],
      女聲: [] as any[],
      小朋友: [] as any[],
      卡通角色: [] as any[],
      其他: [] as any[],
    };

    filtered.forEach((v) => {
      groups[classify(v)].push(v);
    });

    return groups;
  }, [voices, keyword]);

  return (
    <div className="w-full">
      <label className="text-sm font-medium text-slate-600 mb-1 block">
        聲線選擇
      </label>

      <input
        type="text"
        placeholder="搜尋聲線（中文／拼音／英文）"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="mb-2 w-full p-2 px-3 border border-slate-300 rounded-lg text-sm"
      />

      <select
        className="w-full p-3 border border-slate-300 rounded-xl text-sm bg-white"
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          請選擇聲線
        </option>

        {Object.entries(grouped).map(([group, items]) =>
          items.length > 0 ? (
            <optgroup key={group} label={`—— ${group} ——`}>
              {items.map((v) => (
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
// --- Animation Card ---
const AnimationCard = ({
  title,
  description,
  isSelected,
  onClick,
}: {
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    className={`p-6 border rounded-3xl cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
      isSelected
        ? "border-indigo-500 border-2 bg-indigo-50/50"
        : "border-slate-200/80 bg-white"
    }`}
  >
    <div className="flex justify-between items-center mb-2">
      <h5 className="font-bold text-slate-800">{title}</h5>
      {isSelected && <Icons.success className="w-6 h-6 text-indigo-600" />}
    </div>
    <p className="text-xs text-slate-500">{description}</p>
  </div>
);

// --- Main Component ---
export const CreationStepSoundAnimation = ({
  updateConfig,
  animation,
  avatarUrl,
}: {
  updateConfig: (key: any, value: any) => void;
  animation: string;
  avatarUrl: string;
}) => {
  const [showStudio, setShowStudio] = useState(false);
  const [voiceList, setVoiceList] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [auditionText, setAuditionText] = useState(
    "你好，我係你嘅 AI 助手，好高興認識你。"
  );
  const [isAuditioning, setIsAuditioning] = useState(false);

  // ------------------------
  // ① 加载真实 voiceList（来自后台）
  // ------------------------
  useEffect(() => {
    const loadVoices = async () => {
      const baseUrl = import.meta.env.VITE_API_URL;
      const res = await fetch(`${baseUrl}/api/voices`);
      const data = await res.json();
      console.log("🎤 后端返回 voices =", data.voices);
      setVoiceList(data.voices || []);
    };
    loadVoices();
  }, []);

  // ------------------------
  // ② 保证 selectedVoice 永远有效
  // ------------------------
  useEffect(() => {
    if (voiceList.length === 0) return;
    const exists = voiceList.some((v) => v.voice_id === selectedVoice);
    if (!exists) {
      console.log("🔥 Resetting invalid selectedVoice:", selectedVoice);
      setSelectedVoice(voiceList[0].voice_id);
    }
  }, [voiceList]);

  // ------------------------
  // ③ 试听 TTS
  // ------------------------
  const handleAudition = async () => {
    console.log("▶ 选中的 voice =", selectedVoice);

    if (!selectedVoice) return;

    setIsAuditioning(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL;
      const res = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: auditionText,
          voiceId: selectedVoice,
        }),
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      new Audio(url).play();
    } finally {
      setIsAuditioning(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">3. 聲音與動畫</h3>
        <p className="text-sm text-slate-500">
          設定機器人的聲音聲線、語速，以及待機時的微動畫效果。
        </p>
      </div>

      {/* 🔊 Voice Select */}
      <Section title="聲音製作">
        <div className="space-y-4">
          <VoiceSelect
            voices={voiceList} // 🔥 强制只使用后台声线
            selected={selectedVoice}
            onSelect={setSelectedVoice}
          />

          <div>
            <label className="text-sm font-medium text-slate-600">
              試聽文本
            </label>
            <textarea
              value={auditionText}
              onChange={(e) => setAuditionText(e.target.value)}
              className="w-full p-3 text-sm border border-slate-300 rounded-xl"
              rows={2}
            />
          </div>

          <button
            onClick={handleAudition}
            disabled={!selectedVoice || isAuditioning}
            className="w-full flex items-center justify-center px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            {isAuditioning ? (
              <Icons.loading className="w-4 h-4 animate-spin text-indigo-500" />
            ) : (
              <Icons.play className="w-4 h-4 text-indigo-500" />
            )}
            <span>{isAuditioning ? "合成中..." : "試聽"}</span>
          </button>
        </div>
      </Section>

      {/* 🎬 Animation Section */}
      <Section title="動畫設定">
        <button
          onClick={() => setShowStudio(true)}
          className="px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          🎬 開啟影片工作室
        </button>
      </Section>

      {/* ⭐⭐ Modal 放在组件末尾 ⭐⭐ */}
      {showStudio && (
        <VideoStudioModal
          avatarUrl={avatarUrl}
          onClose={() => setShowStudio(false)}
          onVideosGenerated={(videos) => {
            // videos = { idleUrl, speakingUrl, thinkingUrl }

            updateConfig("idleVideo", videos.idleUrl);
            updateConfig("speakingVideo", videos.speakingUrl);
            updateConfig("thinkingVideo", videos.thinkingUrl);
          }}
        />
      )}
    </div>
  );
};
