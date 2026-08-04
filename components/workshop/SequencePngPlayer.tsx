import React, { useEffect, useMemo, useRef, useState } from "react";

interface SequencePngPlayerProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  folderUrl: string;
  pattern?: string;
  frameCount: number;
  fps: number;
  active?: boolean;
}

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

type PlaybackDirection = 1 | -1;

function advancePingPongFrame(
  frame: number,
  direction: PlaybackDirection,
  frameCount: number,
  steps: number
) {
  if (frameCount <= 1) {
    return { frame: 1, direction: 1 as PlaybackDirection };
  }

  let nextFrame = frame;
  let nextDirection = direction;

  for (let i = 0; i < steps; i += 1) {
    if (nextDirection === 1 && nextFrame >= frameCount) {
      nextDirection = -1;
      nextFrame = frameCount - 1;
    } else if (nextDirection === -1 && nextFrame <= 1) {
      nextDirection = 1;
      nextFrame = 2;
    } else {
      nextFrame += nextDirection;
    }
  }

  return { frame: nextFrame, direction: nextDirection };
}

export const SequencePngPlayer: React.FC<SequencePngPlayerProps> = ({
  folderUrl,
  pattern = "frame_%04d.png",
  frameCount,
  fps,
  active = true,
  className,
  ...imgProps
}) => {
  const [frame, setFrame] = useState(1);
  const [ready, setReady] = useState(false);
  const loadedRef = useRef<Set<number>>(new Set());
  const totalFrameCount = Math.max(1, frameCount);
  const frameDuration = 1000 / Math.max(1, fps);

  const frameUrls = useMemo(
    () =>
      Array.from({ length: totalFrameCount }, (_, idx) => {
        const file = pattern.replace("%04d", pad4(idx + 1));
        return `${folderUrl}/${file}`;
      }),
    [folderUrl, pattern, totalFrameCount]
  );

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = new Set();
    setReady(false);
    setFrame(1);
    const concurrency = 6;
    let cursor = 0;

    const markLoaded = (idx: number) => {
      if (loadedRef.current.has(idx)) return;
      loadedRef.current.add(idx);
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
        if (next > totalFrameCount) return;
        await loadOne(next);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, totalFrameCount) }, () =>
      runWorker()
    );
    Promise.all(workers).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [frameUrls, totalFrameCount]);

  useEffect(() => {
    if (!active || !ready) return;

    let rafId = 0;
    let last = performance.now();
    let current = 1;
    let direction: PlaybackDirection = 1;

    const tick = (now: number) => {
      if (now - last >= frameDuration) {
        const steps = Math.floor((now - last) / frameDuration);
        const next = advancePingPongFrame(
          current,
          direction,
          totalFrameCount,
          steps
        );
        if (loadedRef.current.has(next.frame)) {
          current = next.frame;
          direction = next.direction;
          setFrame(current);
        }
        last += steps * frameDuration;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [active, ready, frameDuration, totalFrameCount]);

  const src = useMemo(() => {
    return frameUrls[Math.max(0, frame - 1)] || frameUrls[0] || "";
  }, [frameUrls, frame]);

  return <img src={src} className={className} draggable={false} {...imgProps} />;
};
