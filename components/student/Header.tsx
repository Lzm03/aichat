import React from 'react';
import { Icons } from '../icons';
import { motion } from 'framer-motion';
import { TokenUsageMonitor } from '../system/TokenUsageMonitor';

const XpBar = () => {
    const percentage = 75;
    return (
        <div className="relative w-full h-4 bg-slate-200/70 rounded-full overflow-hidden">
            <motion.div 
                className="absolute top-0 left-0 h-full bg-emerald-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
            />
            <motion.div 
                 className="absolute top-0 left-0 h-full w-full opacity-30"
                 style={{
                    backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.4) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.4) 75%, transparent 75%, transparent)',
                    backgroundSize: '40px 40px',
                 }}
                 animate={{ x: [-40, 0] }}
                 transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-800">
                1,250 / 1,500 XP
            </span>
        </div>
    );
}

export const Header = () => {
    return (
        <header className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                    <img src="https://i.pravatar.cc/150?u=student1" alt="Student Avatar" className="w-12 h-12 rounded-full border-2 border-white shadow-md"/>
                    <div>
                        <h1 className="font-bold text-lg text-slate-800">陳同學</h1>
                        <div className="px-2 py-0.5 bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-bold rounded-full inline-block">
                           Lv. 5 冒險家
                        </div>
                    </div>
                </div>
                 <div className="w-64">
                    <XpBar />
                 </div>
            </div>
            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1.5 px-4 py-2 bg-white/60 rounded-full border border-white/30 shadow-sm">
                    <span className="text-xl">🔥</span>
                    <span className="font-bold text-sm text-orange-600">3 天連勝</span>
                </div>
                {/* 【情緒護盾】當學生遇到挫折，可點擊此處獲得 AI 安慰與鼓勵 */}
                <button className="w-11 h-11 flex items-center justify-center bg-white/60 rounded-full border border-white/30 shadow-sm hover:bg-white transition-colors">
                    <Icons.shieldCheck className="w-6 h-6 text-orange-500" />
                </button>
                <TokenUsageMonitor used={3.8} total={5.0} resetDate="3月1日" />
            </div>
        </header>
    );
};
