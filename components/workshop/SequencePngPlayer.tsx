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
  const safeCount = Math.max(1, frameCount);
  const interval = Math.max(16, Math.floor(1000 / Math.max(1, fps)));

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => {
      setFrame((v) => (v >= safeCount ? 1 : v + 1));
    }, interval);
    return () => window.clearInterval(t);
  }, [active, interval, safeCount]);

  const src = useMemo(() => {
    const file = pattern.replace("%04d", pad4(frame));
    return `${folderUrl}/${file}`;
  }, [folderUrl, pattern, frame]);

  return <img src={src} className={className} draggable={false} />;
};

