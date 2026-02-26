import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Send, Sparkles } from 'lucide-react';

export const PublishSuccessModal = ({ isOpen, onClose, botConfig }) => {
  const { name: botName = "孔夫子 (AI 助教)" } = botConfig || {};
  const [copied, setCopied] = useState(false);
  const [inputText, setInputText] = useState('');
  const [botState, setBotState] = useState('idle'); // 'idle' | 'thinking' | 'speaking'
  const [messages, setMessages] = useState([
    { role: 'bot', content: `你好！我是${botName}，我已經準備好與學生們互動了！` }
  ]);

  const mockShareUrl = "https://smartedu.hk/bot/abcd-1234";
  
  // 模擬的背景與全身數字人素材
  const mockBgUrl = "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2000&auto=format&fit=crop"; // 教室背景
  const mockAvatarUrl = "https://cdn3d.iconscout.com/3d/premium/thumb/teacher-holding-pointer-4993685-4161041.png"; // 3D 全身教師

  const handleCopy = () => {
    navigator.clipboard.writeText(mockShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: inputText }]);
    setInputText('');
    setBotState('thinking');
    
    setTimeout(() => {
      setBotState('speaking');
      setMessages(prev => [...prev, { role: 'bot', content: '這是一個非常好的問題！讓我用我剛學到的知識來為你解答...' }]);
      setTimeout(() => setBotState('idle'), 3000);
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      { isOpen &&
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* 彈窗主體 (加大尺寸) */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-6xl h-[85vh] bg-white rounded-[32px] shadow-2xl flex overflow-hidden z-10"
        >
          {/* 關閉按鈕 */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 z-50 p-2 bg-black/10 hover:bg-black/20 backdrop-blur-md rounded-full text-slate-700 transition-colors"
          >
            <X size={24} />
          </button>

          {/* ================= 左側：4:3 全景沉浸展示區 ================= */}
          <div className="relative w-3/5 bg-slate-100 flex-shrink-0 overflow-hidden">
            {/* 1. 背景圖 */}
            <img 
              src={mockBgUrl} 
              alt="Bot Background" 
              className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
            
            {/* 2. 數字人全身形象 (根據狀態切換微動效) */}
            <motion.div 
              className="absolute inset-0 flex items-end justify-center pb-12"
              animate={{
                thinking: { y: [0, 8, 0], scale: [1, 1.02, 1] },
                speaking: { y: [0, -4, 0] },
                idle: { y: 0, scale: 1 }
              }[botState]}
              transition={{ repeat: botState !== 'idle' ? Infinity : 0, duration: 2, ease: "easeInOut" }}
            >
              <img 
                src={mockAvatarUrl} 
                alt="Bot Full Body" 
                className="h-[85%] object-contain drop-shadow-2xl"
              />
            </motion.div>

            {/* 3. 懸浮資訊卡 (Glassmorphism) */}
            <div className="absolute bottom-8 left-8 right-8 bg-white/70 backdrop-blur-xl border border-white/40 p-5 rounded-[24px] shadow-lg flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800">{botName}</h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-600 text-sm rounded-full font-bold border border-emerald-500/20">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  已發佈上線
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2 bg-white/80 rounded-xl border border-white/50 shadow-sm">
                <input 
                  type="text" 
                  readOnly 
                  value={mockShareUrl}
                  className="flex-1 bg-transparent text-sm text-slate-600 outline-none px-2 font-medium"
                />
                <button 
                  onClick={handleCopy}
                  className={`p-2 rounded-lg transition-colors ${copied ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* ================= 右側：聊天測試區 ================= */}
          <div className="flex-1 flex flex-col bg-slate-50 relative z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.05)]">
            <div className="p-6 border-b border-slate-200 bg-white">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Sparkles size={20} className="text-indigo-500"/>
                開始對話測試
              </h3>
            </div>
            
            {/* 聊天記錄 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-[20px] rounded-br-sm' 
                      : 'bg-white border border-slate-100 text-slate-700 rounded-[20px] rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              
              {/* 思考中狀態氣泡 */}
              {botState === 'thinking' && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 text-slate-400 p-4 rounded-[20px] rounded-bl-sm flex items-center gap-2 shadow-sm">
                    <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* 底部輸入框 */}
            <div className="p-6 bg-white border-t border-slate-100">
              <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-full border border-slate-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 transition-all">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="輸入訊息測試..."
                  className="flex-1 bg-transparent border-none outline-none px-4 text-slate-700"
                />
                <button 
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[2px] shadow-sm transition-all"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      }
    </AnimatePresence>
  );
};
