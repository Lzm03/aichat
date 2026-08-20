import React, { useEffect, useRef, useState } from "react";
import type { AiBot } from "../../types";
import { SequencePngPlayer } from "./SequencePngPlayer";

interface BotCardProps {
  bot: AiBot;
  onOpen: () => void;
  onEdit: () => void;
  onShowSubjectHelp?: () => void;
}

const colorMap: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  sky: "bg-sky-100 text-sky-800",
  rose: "bg-rose-100 text-rose-800",
};

type IdleSequenceManifest = {
  folderUrl: string;
  pattern?: string;
  frameCount: number;
  fps: number;
};

export const BotCard: React.FC<BotCardProps> = ({ bot, onOpen, onEdit, onShowSubjectHelp }) => {
  const [isPreviewingIdle, setIsPreviewingIdle] = useState(false);
  const [idleVideoFailed, setIdleVideoFailed] = useState(false);
  const [idleSequence, setIdleSequence] = useState<IdleSequenceManifest | null>(null);
  const [idleSequenceFailed, setIdleSequenceFailed] = useState(false);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const idleVideoUrl = bot.videoIdle?.trim() || "";
  const isIdleSequence = /\/manifest\.json(?:\?|$)/i.test(idleVideoUrl);
  const canShowIdlePreview = Boolean(
    isPreviewingIdle &&
    idleVideoUrl &&
    (isIdleSequence ? idleSequence && !idleSequenceFailed : !idleVideoFailed)
  );

  useEffect(() => {
    setIdleVideoFailed(false);
    setIdleSequence(null);
    setIdleSequenceFailed(false);
  }, [idleVideoUrl]);

  useEffect(() => {
    if (!isPreviewingIdle || !isIdleSequence || idleSequence || idleSequenceFailed) return;
    let cancelled = false;
    fetch(idleVideoUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error("idle sequence manifest unavailable");
        return response.json();
      })
      .then((manifest) => {
        if (cancelled) return;
        if (!manifest?.folderUrl || !Number(manifest?.frameCount) || !Number(manifest?.fps)) {
          throw new Error("invalid idle sequence manifest");
        }
        setIdleSequence({
          folderUrl: String(manifest.folderUrl),
          pattern: String(manifest.pattern || "frame_%04d.png"),
          frameCount: Number(manifest.frameCount),
          fps: Number(manifest.fps),
        });
      })
      .catch(() => {
        if (!cancelled) setIdleSequenceFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [idleSequence, idleSequenceFailed, idleVideoUrl, isIdleSequence, isPreviewingIdle]);

  useEffect(() => {
    if (!isPreviewingIdle || !idleVideoUrl || isIdleSequence || idleVideoFailed) return;
    let animationFrame = 0;
    const keepIdleLooping = () => {
      const video = idleVideoRef.current;
      if (
        video &&
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.currentTime >= video.duration - 0.12
      ) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
      animationFrame = window.requestAnimationFrame(keepIdleLooping);
    };
    animationFrame = window.requestAnimationFrame(keepIdleLooping);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [idleVideoFailed, idleVideoUrl, isIdleSequence, isPreviewingIdle]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`開啟 ${bot.name}`}
      data-idle-preview={idleVideoUrl ? "available" : "unavailable"}
      data-thinking-preview={bot.videoThinking?.trim() ? "available" : "unavailable"}
      data-talking-preview={bot.videoTalking?.trim() ? "available" : "unavailable"}
      className="group flex min-h-[340px] cursor-pointer flex-col rounded-[28px] border border-slate-100 bg-white p-7 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      onClick={onOpen}
      onMouseEnter={() => setIsPreviewingIdle(true)}
      onMouseLeave={() => setIsPreviewingIdle(false)}
      onFocus={() => setIsPreviewingIdle(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsPreviewingIdle(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {/* 顶部：头像 + 测试题角标 */}
      <div className="flex items-start justify-between">
        <div className="relative h-[140px] w-[140px] overflow-hidden rounded-full bg-white">
          <img src={bot.avatarUrl || undefined} alt={bot.name} className={`h-full w-full rounded-full object-cover transition-opacity duration-200 ${canShowIdlePreview ? "opacity-0" : "opacity-100"}`} />
          {isPreviewingIdle && isIdleSequence && idleSequence && !idleSequenceFailed ? (
            <SequencePngPlayer
              folderUrl={idleSequence.folderUrl}
              pattern={idleSequence.pattern}
              frameCount={idleSequence.frameCount}
              fps={idleSequence.fps}
              active
              startWhenBuffered
              aria-label={`${bot.name} 待機動畫`}
              className="absolute inset-0 h-full w-full rounded-full bg-white object-contain"
            />
          ) : null}
          {isPreviewingIdle && !isIdleSequence && idleVideoUrl && !idleVideoFailed ? (
            <video
              ref={idleVideoRef}
              key={idleVideoUrl}
              src={idleVideoUrl}
              autoPlay
              muted
              playsInline
              preload="metadata"
              poster={bot.avatarUrl || undefined}
              aria-label={`${bot.name} 待機動畫`}
              onError={() => setIdleVideoFailed(true)}
              onEnded={(event) => {
                if (!isPreviewingIdle) return;
                event.currentTarget.currentTime = 0;
                void event.currentTarget.play().catch(() => undefined);
              }}
              className="absolute inset-0 h-full w-full rounded-full bg-white object-contain"
            />
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {bot.hasPendingQuiz ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600 shadow-sm">
              測試題
            </span>
          ) : null}
        </div>
      </div>

      {/* 标题 + 科目标签 */}
      <div className="mt-[18px] space-y-2">
        <h3 className="text-[19px] font-extrabold text-slate-950 transition-colors group-hover:text-indigo-600">
          {bot.name}
        </h3>

        {/* 学科颜色 - 你可以改为用户自定义 */}
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${colorMap[bot.subjectColor] || colorMap.indigo}`}>{bot.subject}</span>
          {onShowSubjectHelp ? <button type="button" aria-label="科目標籤說明" onClick={(event) => { event.stopPropagation(); onShowSubjectHelp(); }} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-extrabold text-slate-400">?</button> : null}
        </div>
      </div>

      {/* 底部：互动次数 */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-[18px]">
        <p className="text-[13px] text-slate-400">今日互動 {bot.interactions || 0} 次</p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className="rounded-lg px-2 py-1 text-[13px] font-bold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          編輯 →
        </button>
      </div>
    </div>
  );
};
