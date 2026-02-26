import React from 'react';
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
      title={tooltipText}
      className="relative flex items-center space-x-2 bg-slate-100/80 hover:bg-slate-200/80 transition-colors h-11 px-4 rounded-full overflow-hidden group cursor-pointer"
    >
      <Icons.cpu className={`w-5 h-5 ${iconColor}`} />
      <span className="text-sm font-semibold text-slate-700">
        {used.toFixed(1)}M / {total.toFixed(1)}M
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
