import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../../icons';

// --- Helper Components ---

const Section: React.FC<{ title: string; children: React.ReactNode; subtitle?: string }> = ({ title, subtitle, children }) => (
  <div className="border border-slate-200/80 rounded-3xl p-6 space-y-4">
    <h4 className="text-lg font-bold text-slate-800">{title}</h4>
    {subtitle && <p className="text-xs text-slate-500 -mt-3">{subtitle}</p>}
    {children}
  </div>
);

// --- Permission Card Component ---

type SharingMode = 'group' | 'link';
interface PermissionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}
const PermissionCard: React.FC<PermissionCardProps> = ({ icon: Icon, title, description, isSelected, onClick }) => {
  return (
    <motion.div
      onClick={onClick}
      className="relative p-4 border rounded-2xl cursor-pointer transition-colors duration-200 flex items-center space-x-4"
      animate={{
        borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
        backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
        borderWidth: isSelected ? '2px' : '1px',
      }}
      transition={{ duration: 0.2 }}
      whileHover={{ borderColor: isSelected ? '#4F46E5' : '#CBD5E1' }}
    >
      <div className={`p-3 rounded-lg ${isSelected ? 'bg-indigo-200' : 'bg-slate-100'}`}>
         <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />
      </div>
      <div>
        <h5 className="font-semibold text-slate-800">{title}</h5>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </motion.div>
  );
};

// --- Filter Card Component (Re-used) ---

type FilterLevel = 'standard' | 'strict' | 'custom';
interface FilterCardProps {
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}
const FilterCard: React.FC<FilterCardProps> = ({ title, description, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={`p-6 border rounded-3xl cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
      isSelected ? 'border-indigo-500 border-2 bg-indigo-50/50' : 'border-slate-200/80 bg-white'
    }`}
  >
    <div className="flex justify-between items-center mb-2">
      <h5 className="font-bold text-slate-800">{title}</h5>
      {isSelected && <Icons.success className="w-6 h-6 text-indigo-600" />}
    </div>
    <p className="text-xs text-slate-500">{description}</p>
  </div>
);

// --- Main Component ---

export const CreationStep4: React.FC = () => {
  const [sharingMode, setSharingMode] = useState<SharingMode>('link');
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('standard');
  const [customWords, setCustomWords] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const shareableLink = 'https://smartedu.hk/bot/share/xYz123';

  const handleCopy = () => {
      navigator.clipboard.writeText(shareableLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handleLinkBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const input = e.currentTarget.querySelector('input');
    input?.select();
    handleCopy();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">5. 安全與權限</h3>
        <p className="text-sm text-slate-500">精細控制您的 AI 機器人，確保它在安全的環境下為指定的學生群體服務。</p>
      </div>
      
      <Section title="權限分享模型">
        <div className="space-y-3">
          <PermissionCard 
            icon={Icons.classes}
            title="特定群組"
            description="僅限指定名單成員存取"
            isSelected={sharingMode === 'group'}
            onClick={() => setSharingMode('group')}
          />
          <PermissionCard 
            icon={Icons.link}
            title="任何擁有連結的人"
            description="組織内成員凴連結存取"
            isSelected={sharingMode === 'link'}
            onClick={() => setSharingMode('link')}
          />
        </div>
        
        {sharingMode === 'link' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center space-x-2 p-2 pl-4 bg-slate-100 rounded-xl mt-4 cursor-pointer"
            onClick={handleLinkBoxClick}
          >
            <input 
              type="text" 
              readOnly 
              value={shareableLink} 
              className="flex-1 bg-transparent text-sm text-slate-600 focus:outline-none pointer-events-none"
            />
            <button 
                onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center space-x-2 shrink-0 ${
                    isCopied ? 'bg-emerald-500 text-white' : 'bg-white hover:bg-slate-200/50 text-slate-600'
                }`}
            >
                {isCopied ? <Icons.success className="w-4 h-4" /> : <Icons.copy className="w-4 h-4" />}
                <span>{isCopied ? '已複製' : '複製連結'}</span>
            </button>
          </motion.div>
        )}
      </Section>
      
      <Section 
        title="安全過濾強度"
        subtitle="平台會自動過濾暴力、色情、政治敏感、自殘話題、個人私隱查詢等內容"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FilterCard title="標準" description="預設過濾級別，觸發時溫和引導話題（推薦）" isSelected={filterLevel === 'standard'} onClick={() => setFilterLevel('standard')} />
            <FilterCard title="嚴格" description="過濾更敏感，觸發時直接終止對話" isSelected={filterLevel === 'strict'} onClick={() => setFilterLevel('strict')} />
            <FilterCard title="自定義" description="在以上過濾的基礎上，額外增加你想封鎖的關鍵詞或話題" isSelected={filterLevel === 'custom'} onClick={() => setFilterLevel('custom')} />
        </div>
        {filterLevel === 'custom' && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              transition={{ duration: 0.3 }}
              className="pt-4"
            >
              <div>
                <textarea 
                  id="custom-words"
                  rows={4}
                  maxLength={500}
                  value={customWords}
                  onChange={(e) => setCustomWords(e.target.value)}
                  placeholder="輸入敏感詞，以逗號隔開..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition resize-none"
                />
                <p className="text-right text-xs text-slate-500 mt-1 pr-1">
                  {customWords.length} / 500
                </p>
              </div>
            </motion.div>
        )}
      </Section>
      
      <div className="p-4 bg-slate-100 rounded-2xl text-center opacity-50 cursor-not-allowed">
        <p className="text-sm font-medium text-slate-600">🔜 進階功能開發中：進階對話邏輯｜自定義出題</p>
      </div>

    </div>
  );
};