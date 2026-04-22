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
    if (!imageNatural.w || !imageNatural.h || !cropSize.w || !cropSize.h) return 1;
    // Use "cover" against crop box to avoid tiny image-in-the-middle.
    const coverScale = Math.max(cropSize.w / imageNatural.w, cropSize.h / imageNatural.h);
    return coverScale * zoom;
  }, [imageNatural.w, imageNatural.h, cropSize.w, cropSize.h, zoom]);

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
  }, [
    viewport.w,
    viewport.h,
    fixedAspect,
    freeWidthPercent,
    freeHeightPercent,
    clampOffset,
  ]);

  useEffect(() => {
    setOffset((prev) => clampOffset(prev));
  }, [zoom, clampOffset]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
      const srcX = imageNatural.w / 2 + (-offset.x - cropSize.w / 2) / imageScale;
      const srcY = imageNatural.h / 2 + (-offset.y - cropSize.h / 2) / imageScale;
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
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-lg flex flex-col h-[85vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold text-[#1E293B]">裁剪背景圖</span>
            <div className="flex items-center bg-slate-100 p-1 rounded-full">
              {Object.keys(aspectRatios).map((key) => (
                <button
                  key={key}
                  onClick={() => setAspect(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
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
          <div className="flex items-center space-x-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60"
            >
              {isApplying ? "應用中..." : "應用"}
            </button>
          </div>
        </div>

        <div ref={stageRef} className="flex-1 bg-slate-100 p-4 overflow-hidden relative">
          <div
            className="relative w-full h-full flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
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
                className="absolute border-2 border-white pointer-events-none"
                style={overlayStyle}
              />
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex flex-col gap-3">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-slate-600 whitespace-nowrap">縮放</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-slate-600 whitespace-nowrap">裁剪寬度</span>
                <input
                  type="range"
                  min="40"
                  max="95"
                  step="1"
                  value={freeWidthPercent}
                  onChange={(e) => setFreeWidthPercent(parseInt(e.target.value, 10))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-slate-600 whitespace-nowrap">裁剪高度</span>
                <input
                  type="range"
                  min="40"
                  max="95"
                  step="1"
                  value={freeHeightPercent}
                  onChange={(e) => setFreeHeightPercent(parseInt(e.target.value, 10))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
