import React from 'react';

interface CreationStep1Props {
    updateConfig: (key: 'name', value: string) => void;
    botName: string;
}

export const CreationStep1: React.FC<CreationStep1Props> = ({ updateConfig, botName }) => {
  return (
    <div className="flex flex-col items-center pt-16 text-center animate-fade-in space-y-6">
      <div className="space-y-2">
        <h3 className="text-2xl font-bold text-[#1E293B]">為您的 AI 機器人命名</h3>
        <p className="text-sm text-slate-500">一個好名字是偉大旅程的開始。</p>
      </div>
      
      <div className="w-full max-w-md">
        <label htmlFor="bot-name" className="sr-only">機器人名稱</label>
        <input 
          type="text"
          id="bot-name"
          value={botName}
          onChange={(e) => updateConfig('name', e.target.value)}
          placeholder="例如：數學解題小能手"
          className="w-full h-12 px-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition text-center text-lg font-semibold placeholder:font-normal"
          autoFocus
        />
      </div>
    </div>
  );
};