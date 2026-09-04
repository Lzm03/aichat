import React from 'react';
import { uiText } from '../../utils/uiI18n';
import { Icons } from '../icons';

interface TokenUsageMonitorProps {
    used: number; // in millions
    total: number; // in millions
    resetDate: string;
}

export const TokenUsageMonitor: React.FC<TokenUsageMonitorProps> = ({ used, total, resetDate }) => {
  const percentage = (used / total) * 100;

  let progressBarColor = 'bg-brand-primary';
  let iconColor = 'text-brand-primary';
  if (percentage > 90) {
    progressBarColor = 'bg-brand-danger';
    iconColor = 'text-brand-danger';
  } else if (percentage > 70) {
    progressBarColor = 'bg-brand-warning';
    iconColor = 'text-brand-warning';
  }

  const remainingPercentage = 100 - percentage;
  const tooltipText = `本月 AI 算力剩餘 ${remainingPercentage.toFixed(0)}%，預計 ${resetDate} 重置`;

  return (
    <button
      title={uiText(tooltipText)}
      className="relative flex h-10 items-center gap-1.5 overflow-hidden rounded-full bg-slate-100/80 px-2.5 transition-colors hover:bg-slate-200/80 group cursor-pointer sm:h-11 sm:gap-2 sm:px-4"
    >
      <Icons.cpu className={`h-4 w-4 sm:h-5 sm:w-5 ${iconColor}`} />
      <span className="text-xs font-semibold leading-tight text-slate-700 sm:text-sm">
        <span className="sm:hidden">{used.toFixed(1)}M</span>
        <span className="hidden sm:inline">{used.toFixed(1)}M / {total.toFixed(1)}M</span>
      </span>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-300">
        <div 
          className={`h-full rounded-r-full transition-all duration-500 ${progressBarColor}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </button>
  );
};
