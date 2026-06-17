import React from "react";
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
      className="bg-white p-6 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 flex h-full min-h-[260px] flex-col group cursor-pointer hover:-translate-y-1 hover:shadow-xl"
      onClick={onEdit}
    >
      {/* 顶部：头像 + 测试题角标 */}
      <div className="flex items-start justify-between">
        <img
          src={bot.avatarUrl || undefined}
          alt={bot.name}
          className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-sm"
        />

        <div className="flex flex-col items-end gap-2">
          {bot.hasPendingQuiz ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600 shadow-sm">
              測試題
            </span>
          ) : null}
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
      <div className="mt-auto pt-4">
        <p className="text-sm text-slate-500">今日互動 {bot.interactions} 次</p>
      </div>
    </div>
  );
};
