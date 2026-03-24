import React, { useEffect, useRef } from "react";

interface ChromaKeyVideoProps {
  src: string;
  className?: string;
  active?: boolean;
}

export const ChromaKeyVideo: React.FC<ChromaKeyVideoProps> = ({
  src,
  className,
  active = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !active) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const render = () => {
      if (!video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;

      // Basic chroma key: remove green-ish pixels.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (g > 95 && g > r * 1.25 && g > b * 1.25) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(frame, 0, 0);
      rafRef.current = requestAnimationFrame(render);
    };

    const onCanPlay = () => {
      void video.play().catch(() => undefined);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(render);
    };

    video.addEventListener("canplay", onCanPlay);
    onCanPlay();

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [src, active]);

  return (
    <div className={className}>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="hidden"
      />
      <canvas ref={canvasRef} className="h-full w-full object-contain drop-shadow-xl" />
    </div>
  );
};

