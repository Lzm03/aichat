import { uiText } from '../../utils/uiI18n';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeartPulse, AlertTriangle, MessageSquareWarning, ShieldAlert, HelpCircle, Check, Edit2, RefreshCw } from 'lucide-react';
import { Icons } from '../icons';

const scenarios = [
  {
    id: 'wellbeing',
    tabLabel: '身心安全',
    theme: { 
      bg: 'bg-rose-50', 
      text: 'text-rose-700', 
      border: 'border-rose-200', 
      borderLeft: 'border-l-rose-500',
      tabActive: 'bg-rose-100 text-rose-800 border-rose-200' 
    },
    icon: HeartPulse,
    alertTitle: '🚨 關懷提示',
    alertMessage: '系統留意到作答中包含較為負面或不安的情緒描寫，建議進一步關注學生的身心狀況。',
    mockAnswer: '最近覺得壓力很大，活著好像沒什麼意義，根本不想寫作業...',
  },
  {
    id: 'academic',
    tabLabel: '非原創/AI',
    theme: { 
      bg: 'bg-amber-50', 
      text: 'text-amber-700', 
      border: 'border-amber-200', 
      borderLeft: 'border-l-amber-500',
      tabActive: 'bg-amber-100 text-amber-800 border-amber-200' 
    },
    icon: AlertTriangle,
    alertTitle: '⚠️ 學術提示',
    alertMessage: '此份作答的語言特徵異常，可能包含非原創或 AI 生成內容，建議核實。',
    mockAnswer: 'In conclusion, the social structure of Peach Blossom Spring represents an idealized utopian society...',
  },
  {
    id: 'inappropriate',
    tabLabel: '不當言論',
    theme: { 
      bg: 'bg-orange-50', 
      text: 'text-orange-700', 
      border: 'border-orange-200', 
      borderLeft: 'border-l-orange-500',
      tabActive: 'bg-orange-100 text-orange-800 border-orange-200' 
    },
    icon: MessageSquareWarning,
    alertTitle: '⚠️ 內容提示',
    alertMessage: '作答中疑似包含攻擊性或不適宜的詞彙，請檢視內容並酌情引導。',
    mockAnswer: '這題目真的有夠蠢，不想寫，出題的老師腦袋有洞吧。',
  },
  {
    id: 'privacy',
    tabLabel: '私隱洩漏',
    theme: { 
      bg: 'bg-blue-50', 
      text: 'text-blue-700', 
      border: 'border-blue-200', 
      borderLeft: 'border-l-blue-500',
      tabActive: 'bg-blue-100 text-blue-800 border-blue-200' 
    },
    icon: ShieldAlert,
    alertTitle: '🛡️ 私隱提示',
    alertMessage: '作答中疑似包含敏感的個人或家庭私隱資訊，請妥善保護數據。',
    mockAnswer: '我爸爸最近失業了，我們家住在九龍旺角彌敦道123號5樓，電話是98765432，所以很煩惱。',
  },
  {
    id: 'effort',
    tabLabel: '敷衍/偏題',
    theme: { 
      bg: 'bg-slate-100', 
      text: 'text-slate-600', 
      border: 'border-slate-200', 
      borderLeft: 'border-l-slate-500',
      tabActive: 'bg-slate-200 text-slate-800 border-slate-300' 
    },
    icon: HelpCircle,
    alertTitle: '💡 狀態提示',
    alertMessage: '作答內容與題目嚴重偏離或出現無意義字元，可能反映學生遇到學習困難。',
    mockAnswer: 'asdfasdfasdf 不知道 不知道 不知道',
  }
];

export const AiAlertPlayground: React.FC = () => {
  const [activeTab, setActiveTab] = useState(scenarios[0].id);

  const currentScenario = scenarios.find(s => s.id === activeTab) || scenarios[0];
  const IconComponent = currentScenario.icon;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* 頂部 (Tabs) */}
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.map((scenario) => {
          const isActive = activeTab === scenario.id;
          return (
            <button
              key={scenario.id}
              onClick={() => setActiveTab(scenario.id)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border ${
                isActive 
                  ? scenario.theme.tabActive
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {uiText(scenario.tabLabel)}
            </button>
          );
        })}
      </div>

      {/* 中間 (Banner 區) */}
      <div className="min-h-[80px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScenario.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className={`rounded-2xl p-4 flex items-start gap-3 shadow-sm border-l-4 ${currentScenario.theme.bg} ${currentScenario.theme.border} ${currentScenario.theme.borderLeft}`}
          >
            <IconComponent className={`w-5 h-5 shrink-0 mt-0.5 ${currentScenario.theme.text}`} />
            <div>
              <h3 className={`text-sm font-bold ${currentScenario.theme.text}`}>{uiText(currentScenario.alertTitle)}</h3>
              <p className={`text-sm mt-1 opacity-90 ${currentScenario.theme.text}`}>{uiText(currentScenario.alertMessage)}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部 (模擬批改卡片) */}
      <motion.div layout className="bg-white rounded-[24px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] border border-slate-100">
        <div className="flex gap-4">
          <span className="text-lg font-bold text-slate-400 shrink-0">1.</span>
          <div className="flex-1">
            <p className="text-lg font-medium text-slate-800 mb-4">{uiText("你認為桃花源是一個理想的社會嗎？請結合文本説明你的觀點。")}</p>
            
            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative overflow-hidden">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{uiText("學生作答")}</span>
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={currentScenario.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-slate-700 leading-relaxed"
                  >
                    {currentScenario.mockAnswer}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* AI 草稿區塊 (淺紫色) */}
              <div className="bg-purple-50 rounded-2xl p-5 border border-purple-100 relative mt-8">
                <div className="absolute -top-3 left-5 bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-200 flex items-center gap-1.5 shadow-sm">
                  <Icons.sparkles className="w-3 h-3" />{uiText("AI 預批")}</div>
                
                <div className="flex justify-between items-start mb-4 mt-2">
                  <div className="flex-1 pr-6">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 block">{uiText("草擬評語")}</span>
                    <p className="text-purple-900 font-medium leading-relaxed">{uiText("作答內容未能針對題目進行有效論述，請老師進一步瞭解學生的學習狀況或給予適當引導。")}</p>
                  </div>
                  <div className="text-right shrink-0 bg-white px-4 py-2 rounded-xl shadow-sm border border-purple-100">
                    <span className="text-2xl font-bold text-purple-600">0</span>
                    <span className="text-sm font-medium text-slate-400">{uiText(" / 5 分")}</span>
                  </div>
                </div>
                
                <div className="bg-white/60 p-3 rounded-xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">{uiText("判斷依據")}</span>
                  <p className="text-sm text-slate-500 leading-relaxed">{uiText("根據系統偵測，此作答觸發了「")}{uiText(currentScenario.tabLabel)}{uiText("」的異常警示，因此暫不給予常規評分，建議由教師人工介入處理。")}</p>
                </div>

                {/* 操作列 */}
                <div className="flex items-center gap-3 mt-5 pt-5 border-t border-purple-100/50">
                  <button className="flex items-center gap-2 bg-purple-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-purple-700 hover:shadow-md hover:shadow-purple-200 transition-all active:scale-95">
                    <Check className="w-4 h-4" />{uiText("確認")}</button>
                  <button className="flex items-center gap-2 border-2 border-purple-200 text-purple-600 px-6 py-2.5 rounded-full font-bold hover:bg-purple-100 transition-all active:scale-95">
                    <Edit2 className="w-4 h-4" />{uiText("修改")}</button>
                  <button className="flex items-center gap-2 text-slate-400 hover:text-purple-600 px-4 py-2.5 rounded-full font-medium transition-colors ml-auto">
                    <RefreshCw className="w-4 h-4" />{uiText("重新生成")}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
