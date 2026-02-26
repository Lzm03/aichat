import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../icons';

type Tab = '1h' | '1d' | '7d';

const historyData = {
  '1h': [
    { id: 1, icon: Icons.wand, action: '生成 AI 圖片', timestamp: '2024-07-25 14:35:10', cost: 150 },
    { id: 2, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-25 14:10:22', cost: 25 },
  ],
  '1d': [
    { id: 3, icon: Icons.wand, action: '生成 AI 圖片', timestamp: '2024-07-25 14:35:10', cost: 150 },
    { id: 4, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-25 14:10:22', cost: 25 },
    { id: 5, icon: Icons.file, action: '分析文檔 (2MB)', timestamp: '2024-07-25 10:05:41', cost: 500 },
    { id: 6, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-25 09:30:00', cost: 18 },
  ],
  '7d': [
    { id: 7, icon: Icons.wand, action: '生成 AI 圖片', timestamp: '2024-07-25 14:35:10', cost: 150 },
    { id: 8, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-25 14:10:22', cost: 25 },
    { id: 9, icon: Icons.file, action: '分析文檔 (2MB)', timestamp: '2024-07-25 10:05:41', cost: 500 },
    { id: 10, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-25 09:30:00', cost: 18 },
    { id: 11, icon: Icons.voice, action: '文字轉語音 (200字)', timestamp: '2024-07-24 16:20:15', cost: 80 },
    { id: 12, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-24 11:45:30', cost: 42 },
    { id: 13, icon: Icons.report, action: '生成學習報告', timestamp: '2024-07-23 18:00:05', cost: 250 },
    { id: 14, icon: Icons.bot, action: '與 AI 機器人對話', timestamp: '2024-07-22 15:15:15', cost: 15 },
  ],
};

const tabs: { id: Tab; label: string }[] = [
  { id: '1h', label: '1 小時' },
  { id: '1d', label: '1 日' },
  { id: '7d', label: '7 日' },
];

export const TokenDetailModal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('1h');
  const currentHistory = historyData[activeTab];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="absolute top-full right-0 mt-2 w-96 bg-white rounded-3xl shadow-lg border border-slate-200/80 z-30 p-4 origin-top-right"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800">Token 消費歷史</h3>
        <div className="bg-slate-100 p-1 rounded-full flex items-center text-xs font-semibold">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-full transition-all ${
                activeTab === tab.id ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2 -mr-2">
        <ul className="space-y-3">
          {currentHistory.map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                  <item.icon className="w-4 h-4 text-slate-500" />
                </div>
                <div className="truncate">
                  <p className="font-medium text-slate-700 truncate">{item.action}</p>
                  <p className="text-xs text-slate-400">{item.timestamp}</p>
                </div>
              </div>
              <span className="font-semibold text-indigo-600 shrink-0 ml-2">-{item.cost} pts</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
};