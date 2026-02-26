import React from 'react';
import { IosToggle } from '../shared/IosToggle';
import { Icons } from '../icons';
import type { AiBot } from '../../types';

interface BotCardProps {
  bot: AiBot;
  onEdit: () => void;
}

const colorMap = {
  indigo: 'bg-indigo-100 text-indigo-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
};

export const BotCard: React.FC<BotCardProps> = ({ bot, onEdit }) => {
  return (
    <div 
      className="bg-white p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between">
        <img src={bot.avatarUrl || undefined} alt={bot.name} className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-sm" />
        <div onClick={(e) => e.stopPropagation()}>
          <IosToggle initialValue={bot.isVisible} label="公開可見" />
        </div>
      </div>
      
      <div className="mt-4">
        <h3 className="text-lg font-bold text-[#1E293B] group-hover:text-indigo-600">{bot.name}</h3>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${colorMap[bot.subjectColor]}`}>{bot.subject}</span>
      </div>
      
      <div className="mt-auto pt-4 border-t border-slate-100">
        <p className="text-sm text-slate-500">昨日互動 {bot.interactions} 次</p>
      </div>
    </div>
  );
};