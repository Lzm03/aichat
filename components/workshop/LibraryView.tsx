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
import { API_BASE } from "../../utils/api";
import type { FeatureEntitlement } from "../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../hooks/usePlatformDialog";
import { PlatformDialog } from "../system/PlatformDialog";
import { TRIAL_ENDED_POPUP_MESSAGE } from "../../utils/trial-popup";
import { readAuthSession } from "../../utils/auth";

interface LibraryViewProps {
  onStartCreation: () => void;
  onEditBot: (botId: string) => void;
  onDeleteBot: (botId: string) => void;
  createBotFeature?: FeatureEntitlement;
  featureLoading?: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onStartCreation,
  onEditBot,
  onDeleteBot,
  createBotFeature,
  featureLoading = false,
}) => {
  const [bots, setBots] = useState<AiBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();

  const normalizeBots = (data: any[]) =>
    data.map((raw: any) => ({
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

  useEffect(() => {
    const baseUrl = API_BASE;
    const session = readAuthSession();
    const cacheKey = session ? `chopreality_bot_cache:${session.user.id}` : "";
    setBotsLoading(true);

    if (typeof window !== "undefined" && cacheKey) {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as AiBot[];
          if (Array.isArray(parsed)) {
            setBots(parsed);
            setBotsLoading(false);
          }
        } catch {
          // ignore bad cache
        }
      }
    }

    fetch(`${baseUrl}/api/bots`)
      .then(res => res.json())
      .then(data => {
        const normalized = normalizeBots(Array.isArray(data) ? data : []);
        console.log("🔥 Normalized bots:", normalized);
        setBots(normalized);
        if (typeof window !== "undefined" && cacheKey) {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(normalized));
        }
      })
      .catch(() => {
        setBots([]);
      })
      .finally(() => {
        setBotsLoading(false);
      });
  }, []);

  const deleteBot = async (botId: string) => {
    const baseUrl = API_BASE;
    const session = readAuthSession();
    const cacheKey = session ? `chopreality_bot_cache:${session.user.id}` : "";

    await fetch(`${baseUrl}/api/bots/${botId}`, {
      method: "DELETE",
    });

    setBots(prev => {
      const next = prev.filter(b => b.id !== botId);
      if (typeof window !== "undefined" && cacheKey) {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(next));
      }
      return next;
    });

    onDeleteBot?.(botId);
  };
  
  const creationLockedByLoading = featureLoading || botsLoading;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

        {/* --------------------------- */}
        {/* ⭐ 创建新机器人按钮 */}
        {/* --------------------------- */}
        <button
          onClick={() => {
            if (creationLockedByLoading) {
              return;
            }
            if (createBotFeature?.locked) {
              showAlert({
                title: "創建角色已用完",
                message: TRIAL_ENDED_POPUP_MESSAGE,
              });
              return;
            }
            onStartCreation();
          }}
          className={`group flex flex-col items-center justify-center p-6 border-2 border-dashed transition rounded-3xl min-h-[260px] ${
            creationLockedByLoading || createBotFeature?.locked
              ? "bg-slate-50 border-slate-200 opacity-70"
              : "bg-white border-slate-300 hover:border-indigo-500 hover:bg-indigo-50"
          }`}
        >
          <div className="w-20 h-20 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center">
            <Icons.add className="w-10 h-10 text-slate-400 group-hover:text-indigo-500" />
          </div>
          <p className="mt-4 text-lg font-semibold text-[#1E293B] group-hover:text-indigo-600">
            創建新機器人
          </p>
          <p className="text-sm text-slate-500">
            {creationLockedByLoading ? "正在載入帳戶資料..." : "開始打造您的 AI 夥伴"}
          </p>
          {createBotFeature && (
            <p className={`mt-2 text-xs font-semibold ${createBotFeature.locked ? "text-rose-600" : "text-indigo-600"}`}>
              {createBotFeature.unlimited
                ? "無限制"
                : `${createBotFeature.used}/${createBotFeature.limit} ${createBotFeature.countUnit}`}
            </p>
          )}
        </button>

        {/* --------------------------- */}
        {/* ⭐ 显示所有机器人卡片 */}
        {/* --------------------------- */}
        {bots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            onEdit={() => onEditBot(bot.id)}
          />
        ))}
      </div>
      <PlatformDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        tone={dialog.tone}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm || undefined}
      />
    </div>
  );
};
