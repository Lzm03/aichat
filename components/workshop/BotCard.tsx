import React from "react";
import { IosToggle } from "../shared/IosToggle";
import type { AiBot } from "../../types";

interface BotCardProps {
  bot: AiBot;
  onEdit: () => void;
}

const colorMap: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  sky: "bg-sky-100 text-sky-800",
  rose: "bg-rose-100 text-rose-800",
};

export const BotCard: React.FC<BotCardProps> = ({ bot, onEdit }) => {
  return (
    <div
      className="
        bg-white p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)]
        hover:-translate-y-1 hover:shadow-xl transition-all duration-300
        flex flex-col cursor-pointer group
      "
      onClick={onEdit}
    >
      {/* 顶部：头像 + 可见开关 */}
      <div className="flex items-start justify-between">
        <img
          src={bot.avatarUrl || undefined}
          alt={bot.name}
          className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-sm"
        />

        {/* ⭐ 阻止冒泡，不进入编辑模式 */}
        <div onClick={(e) => e.stopPropagation()}>
          <IosToggle initialValue={bot.isVisible} label="公開可見" botId={bot.id} />
        </div>
      </div>

      {/* 标题 + 科目标签 */}
      <div className="mt-4 space-y-2">
        <h3 className="text-lg font-bold text-[#1E293B] group-hover:text-indigo-600 transition-colors">
          {bot.name}
        </h3>

        {/* 学科颜色 - 你可以改为用户自定义 */}
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            colorMap[bot.subjectColor] || colorMap.indigo
          }`}
        >
          {bot.subject}
        </span>
      </div>

      {/* 底部：互动次数 */}
      <div className="mt-auto pt-4 border-t border-slate-100">
        <p className="text-sm text-slate-500">昨日互動 {bot.interactions} 次</p>
      </div>
    </div>
  );
};