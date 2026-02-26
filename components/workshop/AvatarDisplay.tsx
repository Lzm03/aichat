'use client';
import React, { useEffect, useRef, useState } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';

interface AvatarDisplayProps {
  avatarUrl: string;
  state: 'idle' | 'thinking' | 'speaking';
}

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  avatarUrl,
  state,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert avatar image to Base64 for API
  const fetchBase64 = (url: string) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject();

        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });

  // // Fetch video from server
  // useEffect(() => {
  //   const fetchAnimation = async () => {
  //     setError(null);
  //     setIsLoaded(false);

  //     try {
  //       const imageBase64 = await fetchBase64(avatarUrl);

  //       const res = await fetch('http://localhost:4000/api/animation', {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({
  //           state,
  //           imageBase64,
  //         }),
  //       });

  //       if (!res.ok) {
  //         const data = await res.json();
  //         throw new Error(data.error || 'Video generation failed');
  //       }

  //       const blob = await res.blob();
  //       const url = URL.createObjectURL(blob);

  //       setVideoUrl((prev) => {
  //         if (prev) URL.revokeObjectURL(prev);
  //         return url;
  //       });
  //     } catch (e: any) {
  //       console.error('Animation error:', e);
  //       setError(e.message);
  //     }
  //   };

  //   fetchAnimation();

  //   return () => {
  //     setVideoUrl((prev) => {
  //       if (prev) URL.revokeObjectURL(prev);
  //       return null;
  //     });
  //   };
  // }, [state, avatarUrl]);

  // Segmentation pipeline
  useEffect(() => {
    if (!videoUrl || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    selfieSegmentation.setOptions({
      modelSelection: 1,
      selfieMode: false,
    });

    selfieSegmentation.onResults((results) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        results.segmentationMask,
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = 'source-over';
    });

    let frameId: number;

    const loop = async () => {
      if (!video || video.paused || video.ended) return;
      await selfieSegmentation.send({ image: video });
      frameId = requestAnimationFrame(loop);
    };

    video.onplay = () => loop();
    video.onloadeddata = () => setIsLoaded(true);

    return () => {
      cancelAnimationFrame(frameId);
      selfieSegmentation.close();
    };
  }, [videoUrl]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          className="hidden"
          loop
          muted
          playsInline
          autoPlay
        />
      )}

      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-red-500 p-2 bg-red-100 rounded-lg border">
            {error}
          </p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        width={360}
        height={640}
      />
    </div>
  );
};