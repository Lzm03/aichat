"use client";

import { uiText, uiTemplate } from '../../../utils/uiI18n';
import { useTeacherLang } from '../../../utils/teacherI18n';
import React, { useMemo, useState, useEffect } from "react";
import { Icons } from "../../icons";
import VideoStudioModal from "../VideoStudioModal";
import { SequencePngPlayer } from "../SequencePngPlayer";
import { API_BASE } from "../../../utils/api";
import type { FeatureEntitlement } from "../../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../../hooks/usePlatformDialog";
import { PlatformDialog } from "../../system/PlatformDialog";

// ============ Section Wrapper ============
const Section = ({ title, children }: any) => (
  <div className="pt-6">
    <h4 className="text-md font-bold text-[#1E293B] mb-3">{uiText(title)}</h4>
    {children}
  </div>
);

const isSequenceManifest = (url?: string | null) =>
  Boolean(url && /\/manifest\.json(\?|$)/i.test(url));

const VIDEO_STUDIO_OPEN_KEY = "video-studio-modal-open";
type AnimationUploadKey = "idle" | "thinking" | "talking";

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

// ============ 聲線工具 ============
const getPinyin = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const voiceNameMap: Record<string, string> = {
  "專業男主持": "專業男主持",
  "俊朗男友": "陽光男聲",
  "可愛男童": "可愛男童",
  "抒情男聲": "温和男聲",
  "播報男聲": "播報男聲",
  "活潑男聲": "活潑男聲",
  "温潤男聲": "温潤男聲",
  "電台男主播": "電台男主播",
  "聰明男童": "聰明男童",
  "專業女主持": "專業女主持",
  "可愛女孩": "可愛女孩",
  "善良女聲": "温柔女聲",
  "少女音色": "少女音色",
  "少女音色-beta": "少女音色（測試）",
  "成熟女性音色": "成熟女性音色",
  "成熟女性音色-beta": "成熟女性音色（測試）",
  "新聞女聲": "新聞女聲",
  "清脆少女": "清脆少女",
  "温暖少女": "温暖少女",
  "温柔女聲": "温柔女聲",
  "甜美女聲": "甜美女聲",
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
  n = n.replace(/warm/gi, "温暖");
  n = n.replace(/soft/gi, "柔和");
  n = n.replace(/sweet/gi, "甜美");
  n = n.replace(/cartoon|anime/gi, "卡通");
  n = n.replace(/\bbeta\b/gi, "（測試）");
  // 只保留繁中可讀內容，移除殘留英文/數字
  n = n.replace(/[A-Za-z0-9_-]+/g, "").replace(/\s+/g, " ").trim();
  return n || "標準聲線";
};

// ============ 聲線選擇組件 ============
const VoiceSelect = ({ voices, selected, onSelect }: any) => {
  const lang = useTeacherLang();
  const displayVoice = (voice: any) => {
    if (lang !== 'en') return voice.displayName;
    const translated = uiText(voice.voice_name || voice.displayName);
    return /[\u3400-\u9fff]/.test(translated) ? `Voice ${voice.voice_id}` : translated;
  };
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
    if (name.includes("温") || name.includes("柔")) return "warm";
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
      if (!v.searchText.includes(kw) && !displayVoice(v).toLowerCase().includes(kw)) return false;
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
  }, [normalized, genderFilter, keyword, ageFilter, lang]);

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
        >{uiText("全部")}</button>
        <button
          type="button"
          onClick={() => setGenderFilter("male")}
          className={`py-2 text-sm rounded-lg font-semibold ${
            genderFilter === "male" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
          }`}
        >{uiText("男聲")}</button>
        <button
          type="button"
          onClick={() => setGenderFilter("female")}
          className={`py-2 text-sm rounded-lg font-semibold ${
            genderFilter === "female" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
          }`}
        >{uiText("女聲")}</button>
      </div>

      {ageFilter === "senior" && (
        <p className="text-xs text-slate-500">{uiText("建議先使用「全部」查看長者音色，之後再用關鍵字細篩。")}</p>
      )}

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder={uiText("搜尋聲線（名稱或關鍵字）")}
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
            {uiText(item.label)}
          </button>
        ))}
      </div>

      <div className="border rounded-xl bg-white max-h-60 overflow-y-auto">
        {filtered.usedSeniorFallback && (
          <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">{uiText("目前供應商未提供明確「長者」標記聲線，已自動顯示較成熟的替代音色。")}</div>
        )}
        {filtered.male.length === 0 && filtered.female.length === 0 && filtered.other.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">{uiText("找不到符合的聲線，請換個關鍵字。")}</div>
        ) : (
          <div className="p-2 space-y-3">
            {filtered.male.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">{uiText("男聲")}</div>
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
                        <div className="text-sm font-medium">{displayVoice(v)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {uiText(ageLabelMap[v.ageGroup as keyof typeof ageLabelMap]) || uiText("成人")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filtered.female.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">{uiText("女聲")}</div>
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
                        <div className="text-sm font-medium">{displayVoice(v)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {uiText(ageLabelMap[v.ageGroup as keyof typeof ageLabelMap]) || uiText("成人")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {genderFilter === "all" && filtered.other.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">{uiText("其他聲線")}</div>
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
                        <div className="text-sm font-medium">{displayVoice(v)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {uiText(ageLabelMap[v.ageGroup as keyof typeof ageLabelMap]) || uiText("成人")}
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

      <div className="text-xs text-slate-500">{uiText("已選擇：")}{selectedVoice ? displayVoice(selectedVoice) : uiText("未選擇聲線")}
      </div>
    </div>
  );
};

// ============ 主組件 ============
export const CreationStepSoundAnimation = ({
  updateConfig,
  avatarUrl,
  videoIdle,
  videoThinking,
  videoTalking,
  voiceId,
  videoStudioTask,
  onVideoStudioTaskChange,
  voicePreviewFeature,
  videoStudioFeature,
  consumeFeature,
  onFeatureRefresh,
}: any) => {
  const baseUrl = API_BASE;
  const { dialog, closeDialog, showAlert } = usePlatformDialog();

  const [showStudio, setShowStudio] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(VIDEO_STUDIO_OPEN_KEY) === "1";
  });
  const [voiceList, setVoiceList] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(voiceId || "");

  const auditionText = "你好，我係你嘅 AI 助手，好高興認識你。";
  const [isAuditioning, setIsAuditioning] = useState(false);

  // ============ 上傳動畫 loading 狀態 ============
  const [uploadState, setUploadState] = useState({
    idle: { loading: false, progress: 0 },
    thinking: { loading: false, progress: 0 },
    talking: { loading: false, progress: 0 },
  });

  // ============ 加載聲線 ============
  useEffect(() => {
    (async () => {
      const res = await fetch(`${baseUrl}/api/voices`);
      const data = await res.json();
      setVoiceList(data.voices || []);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (showStudio) {
      window.sessionStorage.setItem(VIDEO_STUDIO_OPEN_KEY, "1");
    } else {
      window.sessionStorage.removeItem(VIDEO_STUDIO_OPEN_KEY);
    }
  }, [showStudio]);

  useEffect(() => {
    console.debug("[VideoStudio] showStudio changed:", showStudio);
  }, [showStudio]);

  useEffect(() => {
    console.debug("[VideoStudio] step component mounted");
    return () => {
      console.debug("[VideoStudio] step component unmounted");
    };
  }, []);

  const closeStudio = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(VIDEO_STUDIO_OPEN_KEY);
    }
    setShowStudio(false);
  };

  // ============ 上傳並 remove-bg 流程 ============
  async function uploadRemoveBgVideo(file: File, type: AnimationUploadKey) {
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
        showAlert({
          title: "去背失敗",
          message: "Remove BG 處理失敗，請稍後再試。",
          tone: "danger",
        });
        return;
      }

      setUploadState((s) => ({ ...s, [type]: { loading: false, progress: 100 } }));

      const outputUrl = data.sequenceManifestUrl || data.transparentUrl;
      if (type === "idle") updateConfig("videoIdle", outputUrl);
      if (type === "thinking") updateConfig("videoThinking", outputUrl);
      if (type === "talking") updateConfig("videoTalking", outputUrl);
    } catch (err) {
      showAlert({
        title: "上傳失敗",
        message: "影片上傳失敗，請稍後再試。",
        tone: "danger",
      });
      setUploadState((s) => ({ ...s, [type]: { loading: false, progress: 0 } }));
    }
  }

  // ============ 本地上傳事件 ============
  function handleUpload(e: any, type: AnimationUploadKey) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadRemoveBgVideo(file, type);
  }

  // ============ 試聽 TTS ============
  async function handleAudition() {
    if (voicePreviewFeature?.locked) {
      showAlert({
        title: "聲音預覽已用完",
        message: voicePreviewFeature.upgradeMessage,
      });
      return;
    }
    if (!selectedVoice) return;

    setIsAuditioning(true);

    try {
      const res = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: auditionText,
          voiceId: selectedVoice,
          usageType: "preview_audition",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "試聽失敗");
      }

      const audioBlob = await res.blob();
      new Audio(URL.createObjectURL(audioBlob)).play();
    } catch (error) {
      showAlert({
        title: "試聽失敗",
        message: error instanceof Error ? error.message : "聲音試聽失敗，請稍後再試。",
        tone: "danger",
      });
    } finally {
      setIsAuditioning(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ================== 聲音 ================== */}
      <Section title={uiText("聲音製作")}>
        <VoiceSelect
          voices={voiceList}
          selected={selectedVoice}
          onSelect={(v:any) => {
            setSelectedVoice(v);
            updateConfig("voiceId", v);   // ⭐ 保存到 botConfig
          }}
        />

        <button
          onClick={handleAudition}
          className={`w-full px-4 py-2 border rounded-xl text-sm mt-2 ${
            !selectedVoice || voicePreviewFeature?.locked
              ? "bg-slate-100 border-slate-200 text-slate-400"
              : "bg-white"
          }`}
        >
          {isAuditioning ? uiText("試聽中…") : uiText("試聽")}
        </button>
      </Section>

      {/* ================== 動畫 ================== */}
      <Section title={uiText("動畫設定")}>
        <button
          onClick={() => {
            if (videoStudioFeature?.locked) {
              showAlert({
                title: "影片工作室已用完",
                message: videoStudioFeature.upgradeMessage,
              });
              return;
            }
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(VIDEO_STUDIO_OPEN_KEY, "1");
            }
            setShowStudio(true);
          }}
          className={`px-4 py-3 rounded-xl font-semibold ${
            videoStudioFeature?.locked
              ? "bg-slate-200 text-slate-500"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >{uiText("開啟 AI 影片工作室")}</button>
        {videoStudioFeature && (
          <p className={`mt-2 text-xs ${videoStudioFeature.locked ? "text-rose-600" : "text-slate-500"}`}>
            {videoStudioFeature.unlimited
              ? uiTemplate("{0} 無限制", videoStudioFeature.label)
              : `${videoStudioFeature.label} ${videoStudioFeature.used}/${videoStudioFeature.limit}`}
          </p>
        )}
        {videoStudioTask && videoStudioTask.status !== "ready" && (
          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {videoStudioTask.status === "failed"
              ? uiText("影片工作室任務失敗，重新打開後可再試一次。")
              : uiText("影片正在背景生成中，你可以先繼續後面的步驟，稍後再回來查看進度。")}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { key: "idle", label: "待機動畫", value: videoIdle },
            { key: "thinking", label: "思考動畫", value: videoThinking },
            { key: "talking", label: "説話動畫", value: videoTalking },
          ] satisfies Array<{ key: AnimationUploadKey; label: string; value: string }>).map((item) => (
            <div
              key={item.key}
              className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">{uiText(item.label)}</span>

                {/* 狀態小點點 */}
                {uploadState[item.key].loading ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>{uiText("上傳中")}</span>
                ) : item.value ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>{uiText("已完成")}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-slate-300"></span>{uiText("未上傳")}</span>
                )}
              </div>

              {/* 上傳按鈕 */}
              <label className="mb-3 flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700">{uiText("上傳影片")}<input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleUpload(e, item.key)}
                  className="hidden"
                />
              </label>
              <div className="mb-3 truncate text-[11px] text-slate-500">
                {item.value ? uiText("已選擇影片") : uiText("尚未選擇檔案")}
              </div>

              {/* Loading */}
              {uploadState[item.key].loading ? (
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>{uiText("正在上傳影片…")}</span>
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

      {/* ================== AI 自動生成 ================== */}
      {showStudio && (
        <VideoStudioModal
          avatarUrl={avatarUrl}
          task={videoStudioTask}
          feature={videoStudioFeature}
          onConsumeFeature={consumeFeature}
          onFeatureRefresh={onFeatureRefresh}
          onClose={closeStudio}
          onTaskChange={onVideoStudioTaskChange}
          onVideoProgress={(videos: any) => {
            if ("idleUrl" in videos) updateConfig("videoIdle", videos.idleUrl || "");
            if ("thinkingUrl" in videos) updateConfig("videoThinking", videos.thinkingUrl || "");
            if ("speakingUrl" in videos) updateConfig("videoTalking", videos.speakingUrl || "");
          }}
          onVideosGenerated={(videos: any) => {
            updateConfig("videoIdle", videos.idleUrl);
            updateConfig("videoThinking", videos.thinkingUrl);
            updateConfig("videoTalking", videos.speakingUrl);
          }}
        />
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
  );
};
