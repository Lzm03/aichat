// import React from 'react';
// import { BotCard } from './BotCard';
// import { Icons } from '../icons';
// import type { AiBot } from '../../types';

// const mockBots: AiBot[] = [
//   { id: '1', name: '5A 班英文口語教練', subject: '英文', subjectColor: 'emerald', avatarUrl: 'https://i.pravatar.cc/150?u=bot1', interactions: 124, accuracy: 0, isVisible: true },
//   { id: '2', name: '中三數學解難', subject: '數學', subjectColor: 'indigo', avatarUrl: 'https://i.pravatar.cc/150?u=bot2', interactions: 88, accuracy: 0, isVisible: true },
//   { id: '3', name: '常識科探索號', subject: '常識', subjectColor: 'amber', avatarUrl: 'https://i.pravatar.cc/150?u=bot3', interactions: 45, accuracy: 0, isVisible: false },
// ];

// interface LibraryViewProps {
//   onStartCreation: () => void;
//   onEditBot: (botId: string) => void;
// }

// export const LibraryView: React.FC<LibraryViewProps> = ({ onStartCreation, onEditBot }) => {
//   return (
//     <div>
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
//         <button
//           onClick={onStartCreation}
//           className="group flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-300 rounded-3xl min-h-[260px]"
//         >
//           <div className="w-20 h-20 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors duration-300">
//             <Icons.add className="w-10 h-10 text-slate-400 group-hover:text-indigo-500 transition-colors duration-300" />
//           </div>
//           <p className="mt-4 text-lg font-semibold text-[#1E293B] group-hover:text-indigo-600 transition-colors duration-300">創建新機器人</p>
//           <p className="text-sm text-slate-500">開始打造您的 AI 夥伴</p>
//         </button>
//         {mockBots.map(bot => (
//           <BotCard key={bot.id} bot={bot} onEdit={() => onEditBot(bot.id)} />
//         ))}
//       </div>
//     </div>
//   );
// };

import React, { useEffect, useState } from "react";
import { BotCard } from "./BotCard";
import { Icons } from "../icons";
import type { AiBot } from "../../types";

interface LibraryViewProps {
  onStartCreation: () => void;
  onEditBot: (botId: string) => void;
  onDeleteBot: (botId: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onStartCreation,
  onEditBot,
  onDeleteBot,
}) => {
  const [bots, setBots] = useState<AiBot[]>([]);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

    fetch(`${baseUrl}/api/bots`)
      .then(res => res.json())
      .then(data => {

  const normalized = data.map((raw: any) => ({
    id: raw.id,
    name: raw.name,
    subject: raw.subject,
    subjectColor: raw.subjectColor,
    avatarUrl: raw.avatarUrl,
    background: raw.background,
    animation: raw.animation,

    knowledgeBase: raw.knowledgeBase,
    securityPrompt: raw.securityPrompt,

    videoIdle: raw.videoIdle,
    videoThinking: raw.videoThinking,
    videoTalking: raw.videoTalking,
    voiceId: raw.voiceId,

    interactions: raw.interactions,
    accuracy: raw.accuracy,
    isVisible: raw.isVisible,
  }));

        console.log("🔥 Normalized bots:", normalized);
        setBots(normalized);
      });
  }, []);

  const deleteBot = async (botId: string) => {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

    await fetch(`${baseUrl}/api/bots/${botId}`, {
      method: "DELETE",
    });

    setBots(prev => prev.filter(b => b.id !== botId));

    onDeleteBot?.(botId);
  };
  
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

        {/* --------------------------- */}
        {/* ⭐ 创建新机器人按钮 */}
        {/* --------------------------- */}
        <button
          onClick={onStartCreation}
          className="group flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 transition rounded-3xl min-h-[260px]"
        >
          <div className="w-20 h-20 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center">
            <Icons.add className="w-10 h-10 text-slate-400 group-hover:text-indigo-500" />
          </div>
          <p className="mt-4 text-lg font-semibold text-[#1E293B] group-hover:text-indigo-600">
            創建新機器人
          </p>
          <p className="text-sm text-slate-500">開始打造您的 AI 夥伴</p>
        </button>

        {/* --------------------------- */}
        {/* ⭐ 显示所有机器人卡片 */}
        {/* --------------------------- */}
        {bots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            onEdit={() => onEditBot(bot.id)}
            onDelete={() => deleteBot(bot.id)}
          />
        ))}
      </div>
    </div>
  );
};