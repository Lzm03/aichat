import React from 'react';
import { Icons } from '@/components/icons';
import { motion } from 'framer-motion';

// FIX: Define props interface and use React.FC to correctly handle the 'key' prop.
interface GlassMedalProps {
    icon: React.ElementType;
    title: string;
    color: {
        from: string;
        to: string;
    };
}

const GlassMedal: React.FC<GlassMedalProps> = ({ icon: Icon, title, color }) => (
    <motion.div 
        className="relative w-40 h-48 rounded-3xl p-4 flex flex-col items-center justify-between cursor-pointer"
        style={{ transformStyle: 'preserve-3d' }}
        whileHover={{ rotateY: 180, scale: 1.05 }}
        transition={{ duration: 0.6 }}
    >
        {/* Front of the card */}
        <motion.div className="absolute inset-0 bg-white/30 backdrop-blur-lg border border-white/20 rounded-3xl flex flex-col items-center justify-center p-4" style={{ backfaceVisibility: 'hidden' }}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center bg-gradient-to-br ${color.from} ${color.to} shadow-lg`}>
                <Icon className="w-10 h-10 text-white" />
            </div>
            <p className="mt-4 font-bold text-slate-800 text-center">{title}</p>
        </motion.div>

        {/* Back of the card */}
        <motion.div className="absolute inset-0 bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl flex flex-col items-center justify-center p-2" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
             <p className="text-xs text-slate-600 text-center">解鎖於 2024-07-21，在「孔子的論語課」中獲得。</p>
        </motion.div>
    </motion.div>
);

const medalData = [
    { icon: Icons.bot, title: "AI 初探者", color: { from: 'from-indigo-400', to: 'to-indigo-600' } },
    { icon: Icons.brain, title: "數學小天才", color: { from: 'from-violet-400', to: 'to-violet-600' } },
    { icon: Icons.sparkles, title: "創意之星", color: { from: 'from-amber-400', to: 'to-amber-600' } },
    { icon: Icons.shieldCheck, title: "安全小衛士", color: { from: 'from-orange-400', to: 'to-orange-600' } },
];

export default function AchievementsPage() {
  return (
    <div className="p-8 bg-white/80 rounded-3xl h-full">
        <h1 className="text-3xl font-black text-slate-800">成就博物館</h1>
        <p className="text-slate-500 mt-1">記錄你的每一次進步與榮耀！</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-12">
            <div className="lg:col-span-2 p-8 bg-slate-100 rounded-2xl flex items-center justify-center">
                <p className="font-bold text-slate-400">技能雷達圖 Placeholder</p>
            </div>

            <div className="lg:col-span-2">
                <h2 className="font-bold text-xl mb-4">我的勳章牆</h2>
                <div className="grid grid-cols-2 gap-6">
                    {medalData.map(medal => <GlassMedal key={medal.title} {...medal} />)}
                </div>
            </div>
        </div>
    </div>
  );
}
