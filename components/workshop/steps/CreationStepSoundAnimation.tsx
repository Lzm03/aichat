"use client";

import { uiText, uiTemplate } from '../../../utils/uiI18n';
import React, { useMemo, useState, useEffect, useRef } from "react";
import { Icons } from "../../icons";
import VideoStudioModal from "../VideoStudioModal";
import { SequencePngPlayer } from "../SequencePngPlayer";
import { API_BASE } from "../../../utils/api";
import type { FeatureEntitlement } from "../../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../../hooks/usePlatformDialog";
import { PlatformDialog } from "../../system/PlatformDialog";
import { getCachedVoices, preloadVoices, type PlatformVoice } from "../../../utils/voice-api";

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

type CuratedVoice = {
  label: string;
  sourceNames: string[];
  gender: "male" | "female";
  ageGroup: "adult" | "senior" | "child";
};

// Keep the workshop choices intentionally small and recognisable. The source
// names are MiniMax names; the labels are the stable names teachers see.
const CURATED_VOICES: CuratedVoice[] = [
  { label: "穩重男主持", sourceNames: ["专业男主持", "專業男主持"], gender: "male", ageGroup: "adult" },
  { label: "溫潤男老師", sourceNames: ["温润男声", "溫潤男聲"], gender: "male", ageGroup: "adult" },
  { label: "專業女主持", sourceNames: ["专业女主持", "專業女主持"], gender: "female", ageGroup: "adult" },
  { label: "溫柔女老師", sourceNames: ["温柔女声", "溫柔女聲"], gender: "female", ageGroup: "adult" },
  { label: "開朗老爺爺", sourceNames: ["搞笑大爷", "搞笑大爺"], gender: "male", ageGroup: "senior" },
  { label: "慈祥老奶奶", sourceNames: ["花甲奶奶"], gender: "female", ageGroup: "senior" },
  { label: "活潑小男孩", sourceNames: ["可爱男童", "可愛男童"], gender: "male", ageGroup: "child" },
  { label: "甜美小女孩", sourceNames: ["可爱女孩", "可愛女孩"], gender: "female", ageGroup: "child" },
];

// ============ 聲線選擇組件 ============
const VoiceSelect = ({ voices, selected, onSelect, loading }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const normalized = useMemo(() => {
    const available = voices || [];

    return CURATED_VOICES.flatMap((choice) => {
      const match = available.find((voice: any) => {
        const sourceName = `${voice.voice_name || voice.name || ""}`.trim();
        return choice.sourceNames.includes(sourceName);
      });
      if (!match) return [];
      return [{
        ...match,
        displayName: choice.label,
        gender: choice.gender,
        ageGroup: choice.ageGroup,
      }];
    });
  }, [voices]);

  const selectedVoice = normalized.find((v: any) => v.voice_id === selected);
  const voiceMeta = (voice: any) => ({
    gender: voice.gender === "male" ? "男聲" : "女聲",
    age: voice.ageGroup === "senior" ? "長者" : voice.ageGroup === "child" ? "童聲" : "成人",
  });

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative w-full space-y-2">
      <span className="block text-xs font-semibold tracking-wide text-slate-500">
        {uiText("角色聲線（精選 8 款）")}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={loading}
        onClick={() => setIsOpen((open) => !open)}
        className={`group flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3.5 text-left transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
          isOpen
            ? "border-indigo-400 shadow-[0_10px_30px_rgba(79,70,229,0.12)]"
            : "border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md"
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`h-9 w-1 shrink-0 rounded-full ${selectedVoice ? "bg-indigo-500" : "bg-slate-300"}`} />
          <span className="min-w-0">
            <span className={`block truncate text-sm font-semibold ${selectedVoice ? "text-slate-800" : "text-slate-500"}`}>
              {loading
                ? uiText("正在準備角色聲線…")
                : selectedVoice?.displayName || (selected ? uiText("請重新選擇角色聲線") : uiText("請選擇角色聲線"))}
            </span>
            <span className="mt-0.5 block text-xs text-slate-400">
              {selectedVoice
                ? `${uiText(voiceMeta(selectedVoice).gender)} · ${uiText(voiceMeta(selectedVoice).age)}`
                : uiText("每款聲線均標示性別與年齡")}
            </span>
          </span>
        </span>
        {loading ? (
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
        ) : (
          <Icons.down className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-500" : "group-hover:text-indigo-500"}`} />
        )}
      </button>

      <div
        role="listbox"
        aria-label={uiText("角色聲線（精選 8 款）")}
        className={`absolute left-0 right-0 z-30 mt-2 origin-top overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.16)] transition-all duration-200 ${
          isOpen ? "visible translate-y-0 scale-100 opacity-100" : "invisible -translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto pr-1">
          {normalized.map((voice: any) => {
            const active = voice.voice_id === selectedVoice?.voice_id;
            const meta = voiceMeta(voice);
            return (
              <button
                key={voice.voice_id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelect(voice.voice_id);
                  setIsOpen(false);
                }}
                className={`flex min-w-0 items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{voice.displayName}</span>
                  <span className={`mt-1 flex items-center gap-1.5 text-[11px] ${active ? "text-indigo-500" : "text-slate-400"}`}>
                    <span>{uiText(meta.gender)}</span>
                    <span className="text-slate-300">·</span>
                    <span>{uiText(meta.age)}</span>
                  </span>
                </span>
                {active && <Icons.success className="ml-2 h-4 w-4 shrink-0 text-indigo-500" />}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {selectedVoice
          ? `${uiText("已選擇：")}${selectedVoice.displayName}`
          : selected
            ? uiText("原有聲線不在精選名單，請從 8 個角色聲線重新選擇。")
            : uiText("男聲、女聲、長者及少年／童聲各 2 款。")}
      </p>
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
  const cachedVoiceList = getCachedVoices();
  const [voiceList, setVoiceList] = useState<PlatformVoice[]>(cachedVoiceList || []);
  const [voicesLoading, setVoicesLoading] = useState(!cachedVoiceList);
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
    let active = true;
    setVoicesLoading(voiceList.length === 0);
    preloadVoices()
      .then((voices) => {
        if (active) setVoiceList(voices);
      })
      .catch((error) => console.error("Voice list loading failed:", error))
      .finally(() => {
        if (active) setVoicesLoading(false);
      });
    return () => {
      active = false;
    };
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
          loading={voicesLoading}
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
