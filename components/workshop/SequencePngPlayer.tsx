import React, { useEffect, useMemo, useRef, useState } from "react";

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
  const loadedRef = useRef<Set<number>>(new Set());
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
    loadedRef.current = new Set();
    setReady(false);
    setFrame(1);
    const warmupTarget = Math.min(8, safeCount);
    const concurrency = 6;
    let loadedCount = 0;
    let cursor = 0;

    const markLoaded = (idx: number) => {
      if (loadedRef.current.has(idx)) return;
      loadedRef.current.add(idx);
      loadedCount += 1;
      if (!cancelled && loadedCount >= warmupTarget) {
        setReady(true);
      }
    };

    const loadOne = (idx: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          markLoaded(idx);
          resolve();
        };
        img.onerror = () => {
          // Treat failed frame as loaded to avoid deadlock.
          markLoaded(idx);
          resolve();
        };
        img.src = frameUrls[idx - 1];
      });

    const runWorker = async () => {
      while (!cancelled) {
        const next = cursor + 1;
        cursor = next;
        if (next > safeCount) return;
        await loadOne(next);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, safeCount) }, () =>
      runWorker()
    );
    Promise.all(workers).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [frameUrls, safeCount]);

  useEffect(() => {
    if (!active || !ready) return;

    let rafId = 0;
    let last = performance.now();
    let current = 1;

    const tick = (now: number) => {
      if (now - last >= frameDuration) {
        const steps = Math.floor((now - last) / frameDuration);
        const desired = ((current - 1 + steps) % safeCount) + 1;
        let nextFrame = desired;
        if (!loadedRef.current.has(desired)) {
          // Find nearest loaded frame to avoid network-stall pauses.
          for (let i = 1; i <= safeCount; i += 1) {
            const candidate = ((desired - 1 + i) % safeCount) + 1;
            if (loadedRef.current.has(candidate)) {
              nextFrame = candidate;
              break;
            }
          }
        }
        current = nextFrame;
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
