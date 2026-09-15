import React from 'react';

/** 圓形進度環（覆蓋/掌握）。covered 0..total，total<=0 時畫空環。 */
export const ProgressRing: React.FC<{ covered: number; total: number; size?: number; stroke?: number }> = ({
  covered,
  total,
  size = 20,
  stroke = 3,
}) => {
  const pct = total > 0 ? Math.min(1, covered / total) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#6366F1"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className="transition-all duration-500"
      />
    </svg>
  );
};
