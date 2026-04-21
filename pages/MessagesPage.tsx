import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from '../components/icons';

type MessageCategory = 'system' | 'student' | 'admin';

interface MessagePreview {
  id: string;
  category: MessageCategory;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  sender: 'me' | 'other';
  text: string;
  time: string;
}

const mockPreviews: MessagePreview[] = [
  { id: '1', category: 'student', name: '陈小明', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix', lastMessage: '老师，请问这个作业怎么做？', time: '10:30', unreadCount: 2 },
  { id: '2', category: 'system', name: '系统通知', avatar: '', lastMessage: '你的 AI 机器人已成功发布。', time: '昨天', unreadCount: 0 },
  { id: '3', category: 'admin', name: '教务处', avatar: '', lastMessage: '请提交下周的教学计划。', time: '周一', unreadCount: 1 },
  { id: '4', category: 'student', name: '李美华', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka', lastMessage: '谢谢老师！', time: '周一', unreadCount: 0 },
];

const mockChatHistory: Record<string, ChatMessage[]> = {
  '1': [
    { id: 'm1', sender: 'other', text: '老师，请问这个作业怎么做？', time: '10:28' },
    { id: 'm2', sender: 'other', text: '我不太理解第三题的意思。', time: '10:30' },
  ],
  '2': [
    { id: 'm3', sender: 'other', text: '你的 AI 机器人“数学小助手”已成功发布。', time: '昨天' },
  ],
  '3': [
    { id: 'm4', sender: 'other', text: '请提交下周的教学计划。', time: '周一' },
  ],
  '4': [
    { id: 'm5', sender: 'me', text: '这次考试表现不错，继续加油！', time: '周一' },
    { id: 'm6', sender: 'other', text: '谢谢老师！', time: '周一' },
  ],
};

const SegmentedControl: React.FC<{ selected: MessageCategory; onSelect: (cat: MessageCategory) => void }> = ({ selected, onSelect }) => {
  const categories: { id: MessageCategory; label: string }[] = [
    { id: 'system', label: '系统' },
    { id: 'student', label: '学生' },
    { id: 'admin', label: '管理员' },
  ];

  return (
    <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
            selected === cat.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
};

export const MessagesPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<MessageCategory>('student');
  const [selectedChatId, setSelectedChatId] = useState<string | null>('1');
  const [inputText, setInputText] = useState('');

  const filteredPreviews = mockPreviews.filter((preview) => preview.category === selectedCategory);
  const currentChat = selectedChatId ? (mockChatHistory[selectedChatId] || []) : [];
  const currentPreview = mockPreviews.find((preview) => preview.id === selectedChatId) || null;

  const handleSendMessage = () => {
    if (!inputText.trim() || !selectedChatId) return;
    setInputText('');
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      <div className="w-[380px] flex flex-col bg-white rounded-[24px] shadow-sm p-6 shrink-0">
        <h2 className="text-xl font-bold text-slate-800 mb-6">消息中心</h2>
        <SegmentedControl selected={selectedCategory} onSelect={setSelectedCategory} />

        <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
          {filteredPreviews.map((preview) => (
            <div
              key={preview.id}
              onClick={() => setSelectedChatId(preview.id)}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 flex items-center space-x-4 ${
                selectedChatId === preview.id ? 'bg-[#EEF2FF]' : 'hover:bg-slate-50'
              }`}
            >
              <div className="relative shrink-0">
                {preview.avatar ? (
                  <img src={preview.avatar} alt={preview.name} className="w-12 h-12 rounded-[24px] object-cover bg-slate-200" />
                ) : (
                  <div className="w-12 h-12 rounded-[24px] bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                    {preview.name[0]}
                  </div>
                )}
                {preview.unreadCount > 0 ? (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 text-white text-xs font-bold flex items-center justify-center rounded-full border-2 border-white">
                    {preview.unreadCount}
                  </div>
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className={`font-bold truncate ${selectedChatId === preview.id ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {preview.name}
                  </h4>
                  <span className="text-xs text-slate-400 shrink-0">{preview.time}</span>
                </div>
                <p className={`text-sm truncate ${selectedChatId === preview.id ? 'text-indigo-600/80' : 'text-slate-500'}`}>
                  {preview.lastMessage}
                </p>
              </div>
            </div>
          ))}

          {filteredPreviews.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>暂无消息</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[24px] shadow-sm flex flex-col overflow-hidden">
        {selectedChatId && currentPreview ? (
          <>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-[20px] bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                  {currentPreview.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{currentPreview.name}</h3>
                  <p className="text-xs text-slate-500">{currentPreview.category === 'student' ? '学生' : currentPreview.category === 'system' ? '系统' : '管理员'}</p>
                </div>
              </div>
              <button className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <Icons.more className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
              <AnimatePresence initial={false}>
                {currentChat.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] p-4 text-sm leading-relaxed shadow-sm ${
                        msg.sender === 'me'
                          ? 'bg-indigo-600 text-white rounded-[20px] rounded-br-none'
                          : 'bg-slate-100 text-slate-800 rounded-[20px] rounded-bl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="p-6 bg-white border-t border-slate-100">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="输入消息..."
                  className="w-full h-14 pl-6 pr-16 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all text-slate-700 placeholder:text-slate-400"
                />
                <button
                  onClick={handleSendMessage}
                  className="absolute right-2 p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors shadow-md shadow-indigo-200"
                >
                  <Icons.send className="w-5 h-5 translate-x-0.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Icons.bot className="w-16 h-16 mb-4 opacity-20" />
            <p>选择一个对话开始聊天</p>
          </div>
        )}
      </div>
    </div>
  );
};
