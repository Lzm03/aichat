import React from 'react';
import { Island } from './Island';

// FIX: Define a type for missions to ensure `status` matches the expected union type.
interface Mission {
  id: string;
  name: string;
  difficulty: string;
  status: 'completed' | 'active' | 'locked';
  position: { top: string; left: string; };
}

const missions: Mission[] = [
  { id: 'mission-1', name: '孔子的論語課', difficulty: '簡單', status: 'completed', position: { top: '25%', left: '15%' } },
  { id: 'mission-2', name: '愛因斯坦的物理實驗室', difficulty: '中等', status: 'active', position: { top: '50%', left: '30%' } },
  { id: 'mission-3', name: '莎士比亞的劇場', difficulty: '困難', status: 'locked', position: { top: '30%', left: '55%' } },
  { id: 'mission-4', name: '達文西的發明坊', difficulty: '中等', status: 'locked', position: { top: '65%', left: '70%' } },
];

interface StarMapProps {
    onMissionClick: (missionId: string) => void;
}

export const StarMap: React.FC<StarMapProps> = ({ onMissionClick }) => {
  return (
    <div className="relative w-full h-full bg-white/80 rounded-3xl p-4 overflow-hidden shadow-inner bg-gradient-to-br from-indigo-50/50 to-violet-50/50">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-50"></div>
        
        <svg className="absolute inset-0 w-full h-full" width="100%" height="100%">
            <defs>
                <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                    <circle cx="5" cy="5" r="5" fill="#CBD5E1" />
                </marker>
            </defs>
            <path d="M 18% 30% C 20% 50%, 28% 50%, 32% 55%" stroke="#CBD5E1" strokeWidth="2" fill="none" strokeDasharray="5,5" />
            <path d="M 35% 57% C 45% 45%, 50% 35%, 57% 35%" stroke="#CBD5E1" strokeWidth="2" fill="none" strokeDasharray="5,5" />
            <path d="M 59% 37% C 70% 50%, 70% 65%, 72% 70%" stroke="#CBD5E1" strokeWidth="2" fill="none" strokeDasharray="5,5" />
        </svg>

        {missions.map(mission => (
            <Island key={mission.id} {...mission} onClick={() => onMissionClick(mission.id)} />
        ))}

        {/* 【分級支架】根據學生的學習進度，動態調整任務難度或提供額外輔助。 */}
        <div className="absolute bottom-4 right-4 p-3 bg-white/50 backdrop-blur-md rounded-full text-xs text-slate-600 shadow-md">
            學習路徑：初級冒險家
        </div>
    </div>
  );
};