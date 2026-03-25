"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Icons } from "../../icons";
import VideoStudioModal from "../VideoStudioModal";
import { SequencePngPlayer } from "../SequencePngPlayer";

// ============ Section Wrapper ============
const Section = ({ title, children }: any) => (
  <div className="pt-6">
    <h4 className="text-md font-bold text-[#1E293B] mb-3">{title}</h4>
    {children}
  </div>
);

const isSequenceManifest = (url?: string | null) =>
  Boolean(url && /\/manifest\.json(\?|$)/i.test(url));

const StepMediaPreview = ({ src }: { src: string }) => {
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
        // ignore; fallback to <video />
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
        className="mt-2 w-full h-40 object-contain rounded-xl shadow bg-black"
        active={true}
      />
    );
  }

  return (
    <video
      src={src}
      className="mt-2 w-full h-40 object-contain rounded-xl shadow bg-black"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
    />
  );
};

// ============ 声线工具 ============
const getPinyin = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const voiceNameMap: Record<string, string> = {
  "专业男主持": "專業男主持",
  "俊朗男友": "陽光男聲",
  "可爱男童": "可愛男童",
  "抒情男声": "溫和男聲",
  "播报男声": "播報男聲",
  "活泼男声": "活潑男聲",
  "温润男声": "溫潤男聲",
  "电台男主播": "電台男主播",
  "聪明男童": "聰明男童",
  "专业女主持": "專業女主持",
  "可爱女孩": "可愛女孩",
  "善良女声": "溫柔女聲",
  "少女音色": "少女音色",
  "少女音色-beta": "少女音色（測試）",
  "成熟女性音色": "成熟女性音色",
  "成熟女性音色-beta": "成熟女性音色（測試）",
  "新闻女声": "新聞女聲",
  "清脆少女": "清脆少女",
  "温暖少女": "溫暖少女",
  "温柔女声": "溫柔女聲",
  "甜美女声": "甜美女聲",
};

const localizeVoiceName = (name: string) => {
  if (!name) return "未命名聲線";
  if (voiceNameMap[name]) return voiceNameMap[name];

  // 英文名稱做基礎本地化
  let n = name;
  n = n.replace(/male/gi, "男聲");
  n = n.replace(/female/gi, "女聲");
  n = n.replace(/boy/gi, "男童");
  n = n.replace(/girl/gi, "女孩");
  n = n.replace(/news/gi, "新聞");
  n = n.replace(/host/gi, "主持");
  n = n.replace(/warm/gi, "溫暖");
  n = n.replace(/soft/gi, "柔和");
  n = n.replace(/sweet/gi, "甜美");
  n = n.replace(/cartoon|anime/gi, "卡通");
  n = n.replace(/\bbeta\b/gi, "（測試）");
  // 只保留繁中可讀內容，移除殘留英文/數字
  n = n.replace(/[A-Za-z0-9_-]+/g, "").replace(/\s+/g, " ").trim();
  return n || "標準聲線";
};

// ============ 声线选择组件 ============
const VoiceSelect = ({ voices, selected, onSelect }: any) => {
  const [keyword, setKeyword] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [ageFilter, setAgeFilter] = useState<
    "all" | "child" | "teen" | "youth" | "adult" | "mature" | "senior"
  >("all");

  const detectGender = (name: string) => {
    const n = (name || "").toLowerCase();
    const maleHit =
      /男|male|boy|man|先生|阿叔|爸爸|叔|伯|哥哥/.test(n);
    const femaleHit =
      /女|female|girl|woman|女士|媽媽|姐姐|妹妹|少女|女性/.test(n);

    if (maleHit && !femaleHit) return "male" as const;
    if (femaleHit && !maleHit) return "female" as const;
    return "other" as const;
  };

  const tagOf = (name: string) => {
    if (name.includes("主持") || name.includes("播報") || name.includes("新聞")) return "formal";
    if (name.includes("溫") || name.includes("柔")) return "warm";
    if (name.includes("可愛") || name.includes("童") || name.includes("少女")) return "youth";
    if (name.includes("活潑") || name.includes("清脆")) return "bright";
    if (name.includes("成熟")) return "mature";
    if (name.includes("卡通")) return "cartoon";
    return "general";
  };

  const detectAgeGroup = (name: string) => {
    const n = (name || "").toLowerCase();
    if (/兒童|童|男童|女孩|小朋友|kid|child/.test(n)) return "child" as const;
    if (/少年|少女|teen|student/.test(n)) return "teen" as const;
    if (/青年|年輕|youth|young/.test(n)) return "youth" as const;
    if (/長者|老人|老年|耆英|elder|elderly|senior|old|grandpa|grandma|grandfather|grandmother|老伯|阿伯|阿公|阿婆|爺爺|奶奶/.test(n)) return "senior" as const;
    if (/成熟|成熟女性|adult/.test(n)) return "mature" as const;
    if (/主持|播報|新聞|電台|男聲|女聲|professional/.test(n)) return "adult" as const;
    return "adult" as const;
  };

  const ageLabelMap = {
    child: "兒童",
    teen: "青少年",
    youth: "青年",
    adult: "成人",
    mature: "成熟",
    senior: "長者",
  } as const;

  const sortByDiverseTag = (list: any[]) => {
    return [...list].sort((a: any, b: any) => {
      const t1 = tagOf(a.displayName);
      const t2 = tagOf(b.displayName);
      if (t1 !== t2) return t1.localeCompare(t2);
      return getPinyin(a.displayName).localeCompare(getPinyin(b.displayName));
    });
  };

  const normalizeVoice = (v: any) => {
    const displayName = localizeVoiceName(v.voice_name || "");
    const rawName = `${v.voice_name || ""}`;
    const rawId = `${v.voice_id || ""}`;
    const raw = `${displayName} ${rawName} ${rawId}`;
    const lower = raw.toLowerCase();

    return {
      ...v,
      displayName,
      gender: detectGender(raw),
      ageGroup: detectAgeGroup(raw),
      searchText: lower,
    };
  };

  const normalized = useMemo(() => {
    const sorted = (voices || [])
      .map(normalizeVoice)
      .sort((a: any, b: any) =>
        getPinyin(a.displayName).localeCompare(getPinyin(b.displayName))
      );

    // 名稱唯一化：避免「標準聲線」大量重複
    const nameCount: Record<string, number> = {};
    return sorted.map((v: any) => {
      const base = v.displayName || "標準聲線";
      const count = (nameCount[base] || 0) + 1;
      nameCount[base] = count;
      return {
        ...v,
        displayName: count === 1 ? base : `${base}（${count}）`,
      };
    });
  }, [voices]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const base = normalized.filter((v: any) => {
      if (!v.searchText.includes(kw)) return false;
      if (ageFilter === "all") return true;
      return v.ageGroup === ageFilter;
    });
    const male = base.filter((v: any) => v.gender === "male");
    const female = base.filter((v: any) => v.gender === "female");
    const other = base.filter((v: any) => v.gender === "other");

    if (genderFilter === "male") {
      return { male: sortByDiverseTag(male), female: [], other: [], usedSeniorFallback: false };
    }
    if (genderFilter === "female") {
      return { male: [], female: sortByDiverseTag(female), other: [], usedSeniorFallback: false };
    }

    const noSeniorResultInAll =
      ageFilter === "senior" && male.length === 0 && female.length === 0 && other.length === 0;

    if (noSeniorResultInAll) {
      const matureBackup = normalized.filter((v: any) => v.ageGroup === "mature");
      const adultBackup = normalized.filter((v: any) => v.ageGroup === "adult");
      const backup = sortByDiverseTag([...matureBackup, ...adultBackup]).slice(0, 20);
      return {
        male: backup.filter((v: any) => v.gender === "male"),
        female: backup.filter((v: any) => v.gender === "female"),
        other: backup.filter((v: any) => v.gender === "other"),
        usedSeniorFallback: true,
      };
    }

    // 全部頁完整展示：男/女/其他分區，避免遺漏
    return {
      male: sortByDiverseTag(male),
      female: sortByDiverseTag(female),
      other: sortByDiverseTag(other),
      usedSeniorFallback: false,
    };
  }, [normalized, genderFilter, keyword, ageFilter]);

  const selectedVoice = normalized.find((v: any) => v.voice_id === selected);

  return (
    <div className="w-full space-y-3">
      <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setGenderFilter("all")}
          className={`py-2 text-sm rounded-lg font-semibold ${
            genderFilter === "all" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
          }`}
        >
          全部
        </button>
        <button
          type="button"
          onClick={() => setGenderFilter("male")}
          className={`py-2 text-sm rounded-lg font-semibold ${
            genderFilter === "male" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
          }`}
        >
          男聲
        </button>
        <button
          type="button"
          onClick={() => setGenderFilter("female")}
          className={`py-2 text-sm rounded-lg font-semibold ${
            genderFilter === "female" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
          }`}
        >
          女聲
        </button>
      </div>

      {ageFilter === "senior" && (
        <p className="text-xs text-slate-500">
          建議先使用「全部」查看長者音色，之後再用關鍵字細篩。
        </p>
      )}

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜尋聲線（名稱或關鍵字）"
        className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-300"
      />

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "全部年齡" },
          { key: "child", label: "兒童" },
          { key: "teen", label: "青少年" },
          { key: "youth", label: "青年" },
          { key: "adult", label: "成人" },
          { key: "mature", label: "成熟" },
          { key: "senior", label: "長者" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setAgeFilter(item.key as typeof ageFilter)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              ageFilter === item.key
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="border rounded-xl bg-white max-h-60 overflow-y-auto">
        {filtered.usedSeniorFallback && (
          <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
            目前供應商未提供明確「長者」標記聲線，已自動顯示較成熟的替代音色。
          </div>
        )}
        {filtered.male.length === 0 && filtered.female.length === 0 && filtered.other.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">找不到符合的聲線，請換個關鍵字。</div>
        ) : (
          <div className="p-2 space-y-3">
            {filtered.male.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">男聲</div>
                <div className="space-y-1">
                  {filtered.male.map((v: any) => {
                    const active = selected === v.voice_id;
                    return (
                      <button
                        key={v.voice_id}
                        type="button"
                        onClick={() => onSelect(v.voice_id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                          active
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-transparent hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-sm font-medium">{v.displayName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {ageLabelMap[v.ageGroup as keyof typeof ageLabelMap] || "成人"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filtered.female.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">女聲</div>
                <div className="space-y-1">
                  {filtered.female.map((v: any) => {
                    const active = selected === v.voice_id;
                    return (
                      <button
                        key={v.voice_id}
                        type="button"
                        onClick={() => onSelect(v.voice_id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                          active
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-transparent hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-sm font-medium">{v.displayName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {ageLabelMap[v.ageGroup as keyof typeof ageLabelMap] || "成人"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {genderFilter === "all" && filtered.other.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">其他聲線</div>
                <div className="space-y-1">
                  {filtered.other.map((v: any) => {
                    const active = selected === v.voice_id;
                    return (
                      <button
                        key={v.voice_id}
                        type="button"
                        onClick={() => onSelect(v.voice_id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                          active
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-transparent hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-sm font-medium">{v.displayName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {ageLabelMap[v.ageGroup as keyof typeof ageLabelMap] || "成人"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        已選擇：{selectedVoice ? selectedVoice.displayName : "未選擇聲線"}
      </div>
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

      if (!data.transparentUrl && !data.sequenceManifestUrl) {
        alert("RemoveBG 处理失败");
        return;
      }

      setUploadState((s) => ({ ...s, [type]: { loading: false, progress: 100 } }));

      const outputUrl = data.sequenceManifestUrl || data.transparentUrl;
      if (type === "idle") updateConfig("videoIdle", outputUrl);
      if (type === "thinking") updateConfig("videoThinking", outputUrl);
      if (type === "talking") updateConfig("videoTalking", outputUrl);
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

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { key: "idle", label: "待機動畫", value: videoIdle },
            { key: "thinking", label: "思考動畫", value: videoThinking },
            { key: "talking", label: "說話動畫", value: videoTalking },
          ].map((item) => (
            <div
              key={item.key}
              className="p-3 border rounded-2xl bg-white shadow-sm hover:shadow-md transition"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs md:text-sm font-semibold">{item.label}</span>

                {/* 狀態小點點 */}
                {uploadState[item.key].loading ? (
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                ) : item.value ? (
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                )}
              </div>

              {/* 上傳按鈕 */}
              <input
                type="file"
                accept="video/*"
                onChange={(e) => handleUpload(e, item.key)}
                className="mb-2 block text-xs"
              />

              {/* Loading */}
              {uploadState[item.key].loading ? (
                <div className="flex items-center gap-2 text-xs text-blue-600 mt-1">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>正在上傳影片…</span>
                </div>
              ) : (
                item.value && (
                  <StepMediaPreview src={item.value} />
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
