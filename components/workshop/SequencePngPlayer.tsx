import React, { useEffect, useMemo, useState } from "react";

interface SequencePngPlayerProps {
  folderUrl: string;
  pattern?: string;
  frameCount: number;
  fps: number;
  active?: boolean;
  className?: string;
}

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

export const SequencePngPlayer: React.FC<SequencePngPlayerProps> = ({
  folderUrl,
  pattern = "frame_%04d.png",
  frameCount,
  fps,
  active = true,
  className,
}) => {
  const [frame, setFrame] = useState(1);
  const [ready, setReady] = useState(false);
  const safeCount = Math.max(1, frameCount);
  const frameDuration = 1000 / Math.max(1, fps);

  const frameUrls = useMemo(
    () =>
      Array.from({ length: safeCount }, (_, idx) => {
        const file = pattern.replace("%04d", pad4(idx + 1));
        return `${folderUrl}/${file}`;
      }),
    [folderUrl, pattern, safeCount]
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFrame(1);

    // Preload all frames to avoid visible stutter on first playback loop.
    Promise.all(
      frameUrls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          })
      )
    ).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [frameUrls]);

  useEffect(() => {
    if (!active || !ready) return;

    let rafId = 0;
    let last = performance.now();
    let current = 1;

    const tick = (now: number) => {
      if (now - last >= frameDuration) {
        const steps = Math.floor((now - last) / frameDuration);
        current = ((current - 1 + steps) % safeCount) + 1;
        setFrame(current);
        last += steps * frameDuration;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [active, ready, frameDuration, safeCount]);

  const src = useMemo(() => {
    return frameUrls[Math.max(0, frame - 1)] || frameUrls[0] || "";
  }, [frameUrls, frame]);

  return <img src={src} className={className} draggable={false} />;
};
