import { uiText } from '../../../utils/uiI18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../../icons";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";

interface ImageCropperProps {
  imageUrl: string;
  onApply: (imageUrl: string) => void;
  onCancel: () => void;
}

const aspectRatios: Record<string, number | undefined> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "自由": undefined,
};

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageUrl,
  onApply,
  onCancel,
}) => {
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<string>("16:9");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropSize, setCropSize] = useState({ w: 0, h: 0 });
  const [imageNatural, setImageNatural] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [freeWidthPercent, setFreeWidthPercent] = useState(82);
  const [freeHeightPercent, setFreeHeightPercent] = useState(82);
  const [isApplying, setIsApplying] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number }>({
    active: false,
    startX: 0,
    startY: 0,
  });
  const resizeRef = useRef<{
    active: boolean;
    handle: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  }>({
    active: false,
    handle: "",
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  useBodyScrollLock(true);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImageNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    let rafId = 0;
    let attempts = 0;
    const update = () => {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const next = { w: Math.round(rect.width), h: Math.round(rect.height) };
      if (next.w > 0 && next.h > 0) {
        setViewport(next);
      } else if (attempts < 20) {
        attempts += 1;
        rafId = window.requestAnimationFrame(update);
      }
    };
    update();
    const observer = new ResizeObserver(() => update());
    if (stageRef.current) observer.observe(stageRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const fixedAspect = aspectRatios[aspect];
  const imageScale = useMemo(() => {
    if (!imageNatural.w || !imageNatural.h) return 1;
    const frameW = fixedAspect ? cropSize.w : viewport.w;
    const frameH = fixedAspect ? cropSize.h : viewport.h;
    if (!frameW || !frameH) return 1;
    // Fixed-ratio crops cover the crop box. Free mode keeps the image locked to the
    // preview stage so resizing the crop frame never resizes the image underneath.
    const coverScale = Math.max(frameW / imageNatural.w, frameH / imageNatural.h);
    return coverScale * zoom;
  }, [
    fixedAspect,
    imageNatural.w,
    imageNatural.h,
    cropSize.w,
    cropSize.h,
    viewport.w,
    viewport.h,
    zoom,
  ]);

  const displaySize = useMemo(
    () => ({
      w: imageNatural.w * imageScale,
      h: imageNatural.h * imageScale,
    }),
    [imageNatural.w, imageNatural.h, imageScale]
  );

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextCrop = cropSize) => {
    const maxX = Math.max(0, (displaySize.w - nextCrop.w) / 2);
    const maxY = Math.max(0, (displaySize.h - nextCrop.h) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [cropSize, displaySize.w, displaySize.h]
  );

  const clampCropOffset = useCallback(
    (next: { x: number; y: number }, nextCrop = cropSize) => {
      const maxX = Math.max(0, (viewport.w - nextCrop.w) / 2);
      const maxY = Math.max(0, (viewport.h - nextCrop.h) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [cropSize, viewport.w, viewport.h]
  );

  useEffect(() => {
    if (!viewport.w || !viewport.h || !imageNatural.w || !imageNatural.h) return;
    const maxCropW = Math.max(120, viewport.w * 0.82);
    const maxCropH = Math.max(120, viewport.h * 0.82);

    if (!fixedAspect) {
      const next = {
        w: Math.round(Math.min(maxCropW, viewport.w * (freeWidthPercent / 100))),
        h: Math.round(Math.min(maxCropH, viewport.h * (freeHeightPercent / 100))),
      };
      setCropSize(next);
      setOffset((prev) => clampOffset(prev, next));
      setCropOffset((prev) => clampCropOffset(prev, next));
      return;
    }

    const maxW = maxCropW;
    const maxH = maxCropH;
    let w = maxW;
    let h = w / fixedAspect;
    if (h > maxH) {
      h = maxH;
      w = h * fixedAspect;
    }
    const next = { w: Math.round(w), h: Math.round(h) };
    setCropSize(next);
    setOffset((prev) => clampOffset(prev, next));
    setCropOffset({ x: 0, y: 0 });
  }, [
    viewport.w,
    viewport.h,
    fixedAspect,
    freeWidthPercent,
    freeHeightPercent,
    clampOffset,
    clampCropOffset,
  ]);

  useEffect(() => {
    setOffset((prev) => clampOffset(prev));
  }, [zoom, clampOffset]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current.active) return;
    dragRef.current = { active: true, startX: e.clientX - offset.x, startY: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const next = {
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    };
    setOffset(clampOffset(next));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false;
    resizeRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const startFreeResize = (handle: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (aspect !== "自由") return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: cropSize.w,
      startH: cropSize.h,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onFreeResizeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeRef.current.active || aspect !== "自由" || !viewport.w || !viewport.h) return;
    e.preventDefault();
    e.stopPropagation();
    const { handle, startX, startY, startW, startH } = resizeRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxW = viewport.w * 0.95;
    const maxH = viewport.h * 0.95;
    const minW = Math.min(160, maxW);
    const minH = Math.min(120, maxH);
    const xSign = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const ySign = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    const nextW = Math.max(minW, Math.min(maxW, startW + dx * xSign * 2));
    const nextH = Math.max(minH, Math.min(maxH, startH + dy * ySign * 2));
    setFreeWidthPercent(Math.round((nextW / viewport.w) * 100));
    setFreeHeightPercent(Math.round((nextH / viewport.h) * 100));
    setCropOffset((prev) => clampCropOffset(prev, { w: nextW, h: nextH }));
  };

  const onFreeResizeEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    resizeRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleApply = async () => {
    if (!imageNatural.w || !imageNatural.h || !cropSize.w || !cropSize.h) {
      onApply(imageUrl);
      return;
    }
    setIsApplying(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
        img.src = imageUrl;
      });

      const srcW = cropSize.w / imageScale;
      const srcH = cropSize.h / imageScale;
      const srcX = imageNatural.w / 2 + (cropOffset.x - offset.x - cropSize.w / 2) / imageScale;
      const srcY = imageNatural.h / 2 + (cropOffset.y - offset.y - cropSize.h / 2) / imageScale;
      const safeX = Math.max(0, Math.min(imageNatural.w - srcW, srcX));
      const safeY = Math.max(0, Math.min(imageNatural.h - srcH, srcY));

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(srcW));
      canvas.height = Math.max(1, Math.round(srcH));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas context unavailable");
      ctx.drawImage(
        img,
        safeX,
        safeY,
        srcW,
        srcH,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("export failed");
      onApply(URL.createObjectURL(blob));
    } finally {
      setIsApplying(false);
    }
  };

  const overlayStyle = {
    width: `${cropSize.w}px`,
    height: `${cropSize.h}px`,
    transform: `translate(${cropOffset.x}px, ${cropOffset.y}px)`,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-lg flex flex-col h-[85vh] overflow-hidden">
        <div className="flex flex-col gap-3 p-4 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 text-lg font-bold text-[#1E293B]">{uiText("裁剪背景圖")}</span>
            <div className="flex min-w-0 flex-1 items-center overflow-x-auto bg-slate-100 p-1 rounded-full sm:flex-none">
              {Object.keys(aspectRatios).map((key) => (
                <button
                  key={key}
                  onClick={() => setAspect(key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    aspect === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="whitespace-nowrap px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50"
            >{uiText("取消")}</button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="whitespace-nowrap px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60"
            >
              {isApplying ? uiText("應用中...") : uiText("應用")}
            </button>
          </div>
        </div>

        <div ref={stageRef} className="flex-1 bg-slate-100 p-4 overflow-hidden relative">
          <div
            className={`relative w-full h-full flex items-center justify-center touch-none ${
              aspect === "自由" ? "cursor-default" : "cursor-grab active:cursor-grabbing"
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={imageUrl}
              className="select-none pointer-events-none"
              style={{
                width: `${displaySize.w}px`,
                height: `${displaySize.h}px`,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
              draggable={false}
            />
            {cropSize.w > 0 && cropSize.h > 0 && (
              <div
                className={`absolute border-2 border-white ${aspect === "自由" ? "pointer-events-auto" : "pointer-events-none"}`}
                style={overlayStyle}
              >
                {aspect === "自由" && (
                  <>
                    {[
                      ["n", "left-1/2 top-0 h-4 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"],
                      ["s", "bottom-0 left-1/2 h-4 w-12 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"],
                      ["e", "right-0 top-1/2 h-12 w-4 -translate-y-1/2 translate-x-1/2 cursor-ew-resize"],
                      ["w", "left-0 top-1/2 h-12 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
                      ["ne", "right-0 top-0 h-6 w-6 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize"],
                      ["nw", "left-0 top-0 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"],
                      ["se", "bottom-0 right-0 h-6 w-6 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"],
                      ["sw", "bottom-0 left-0 h-6 w-6 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"],
                    ].map(([handle, className]) => (
                      <button
                        key={handle}
                        type="button"
                        aria-label={uiText("調整裁剪框")}
                        onPointerDown={startFreeResize(handle)}
                        onPointerMove={onFreeResizeMove}
                        onPointerUp={onFreeResizeEnd}
                        onPointerCancel={onFreeResizeEnd}
                        className={`absolute rounded-full border border-white bg-indigo-500/90 shadow-[0_2px_10px_rgba(79,70,229,0.35)] ${className}`}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex flex-col gap-3">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-slate-600 whitespace-nowrap">{uiText("縮放")}</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
          {aspect === "自由" && (
            <p className="text-xs font-semibold text-slate-500">{uiText("自由模式：拖動裁剪框邊緣或角點調整範圍，圖片保持不動。")}</p>
          )}
        </div>
      </div>
    </div>
  );
};
