import React from 'react';

interface SkeletonProps {
  /**
   * Colour and radius come from the caller on purpose. Two competing Tailwind
   * utilities on one element resolve by stylesheet order, not by class order, so a
   * baked-in `bg-slate-200` could silently beat the caller's own colour. Teacher
   * pages pass `bg-slate-200/70`, student pages `bg-[var(--bg-subtle-2)]`.
   */
  className?: string;
}

/**
 * A pulsing grey block standing in for content while it loads. Purely decorative —
 * callers keep the real loading text in an `sr-only` span so screen readers still
 * hear the state. The reduced-motion block in globals.css already stops
 * `animate-pulse`, which leaves a still grey block that still reads as "not loaded
 * yet".
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div aria-hidden="true" className={`animate-pulse ${className ?? ''}`} />
);
