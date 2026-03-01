import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../../icons';

// -----------------------------
// Section Wrapper
// -----------------------------
const Section: React.FC<{ title: string; children: React.ReactNode; subtitle?: string }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="border border-slate-200/80 rounded-3xl p-6 space-y-4">
    <h4 className="text-lg font-bold text-slate-800">{title}</h4>
    {subtitle && <p className="text-xs text-slate-500 -mt-3">{subtitle}</p>}
    {children}
  </div>
);

// -----------------------------
// Permission Card
// -----------------------------
type SharingMode = 'group' | 'link';

const PermissionCard: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}> = ({ icon: Icon, title, description, isSelected, onClick }) => (
  <motion.div
    onClick={onClick}
    className="relative p-4 border rounded-2xl cursor-pointer transition-colors duration-200 flex items-center space-x-4"
    animate={{
      borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
      backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
      borderWidth: isSelected ? '2px' : '1px',
    }}
    whileHover={{ borderColor: isSelected ? '#4F46E5' : '#CBD5E1' }}
    transition={{ duration: 0.2 }}
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

// -----------------------------
// Filter Card (3 Levels Only)
// -----------------------------
type FilterLevel = 'standard' | 'strict' | 'custom';

const FilterCard: React.FC<{
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}> = ({ title, description, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={`p-6 border rounded-3xl cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
      isSelected ? 'border-indigo-500 border-2 bg-indigo-50/50' : 'border-slate-200 bg-white'
    }`}
  >
    <div className="flex justify-between items-center mb-2">
      <h5 className="font-bold text-slate-800">{title}</h5>
      {isSelected && <Icons.success className="w-6 h-6 text-indigo-600" />}
    </div>
    <p className="text-xs text-slate-500">{description}</p>
  </div>
);

// -----------------------------
// MAIN COMPONENT
// -----------------------------
export const CreationStep4: React.FC<{
  onSecurityChange?: (securityPrompt: string) => void;
}> = ({ onSecurityChange }) => {
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
  };

  // -----------------------------
  // Build Safety Prompt (3 Levels)
  // -----------------------------
  const buildSecurityPrompt = () => {
    let base = `
你正在與小學至高中學生互動，必須遵守以下安全規範：

【一、禁止回答的內容】
- 色情、性暗示、成人內容
- 暴力、武器製作、傷害方法
- 自殺、自殘、精神健康診斷
- 仇恨、歧視、霸凌
- 政治敏感立場或煽動內容
- 賭博、酒精、毒品
- 要求學生提供個人資料（電話、住址、學校、家長資料）
- 協助作弊、代做功課或代寫文章

【二、敏感話題處理方式】
- 若學生提問涉及上述內容：請「禮貌拒絕 + 提供安全替代方向」。
`;

    if (filterLevel === 'strict') {
      base += `
【模式：嚴格】
- 只要偵測到不適當內容，請立即停止回答。
- 回覆：「這個問題不適合討論，我們可以聊聊其他主題喔！」`;
    }

    if (filterLevel === 'custom' && customWords.trim()) {
      base += `
【自定義禁用詞彙】
以下詞彙不得出現在回答中，也不得提供任何相關資訊：
${customWords
  .split(',')
  .map((w) => w.trim())
  .filter((w) => w.length > 0)
  .map((w) => `- ${w}`)
  .join('\n')}
`;
    }

    return base.trim();
  };

  // 回傳安全 prompt 給外層 CreationFlow
  useEffect(() => {
    if (onSecurityChange) onSecurityChange(buildSecurityPrompt());
  }, [filterLevel, customWords]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">5. 安全與權限</h3>
        <p className="text-sm text-slate-500">
          設定機器人的使用對象與內容安全級別，保護學生安全。
        </p>
      </div>

      {/* Permission Sharing */}
      <Section title="權限分享模式">
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
            description="組織內使用者可憑連結存取"
            isSelected={sharingMode === 'link'}
            onClick={() => setSharingMode('link')}
          />
        </div>

        {sharingMode === 'link' && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center space-x-2 p-2 pl-4 bg-slate-100 rounded-xl mt-4 cursor-pointer"
            onClick={handleLinkBoxClick}
          >
            <input
              type="text"
              readOnly
              value={shareableLink}
              className="flex-1 bg-transparent text-sm text-slate-600 pointer-events-none"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition ${
                isCopied ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isCopied ? <Icons.success className="w-4 h-4" /> : <Icons.copy className="w-4 h-4" />}
              <span>{isCopied ? '已複製' : '複製連結'}</span>
            </button>
          </motion.div>
        )}
      </Section>

      {/* Safety Filter */}
      <Section
        title="安全過濾強度"
        subtitle="系統會自動過濾不適當內容，包括色情、暴力、歧視、自殘話題等"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FilterCard
            title="標準"
            description="教育場景預設濾網，適度引導學生"
            isSelected={filterLevel === 'standard'}
            onClick={() => setFilterLevel('standard')}
          />
          <FilterCard
            title="嚴格"
            description="偵測到敏感內容將停止回答"
            isSelected={filterLevel === 'strict'}
            onClick={() => setFilterLevel('strict')}
          />
          <FilterCard
            title="自定義"
            description="輸入你額外想封鎖的詞彙"
            isSelected={filterLevel === 'custom'}
            onClick={() => setFilterLevel('custom')}
          />
        </div>

        {filterLevel === 'custom' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-3"
          >
            <textarea
              rows={4}
              maxLength={500}
              value={customWords}
              onChange={(e) => setCustomWords(e.target.value)}
              placeholder="例如：暴力, 色情, 烏煙瘴氣（使用逗號分隔）"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition resize-none"
            />
            <p className="text-right text-xs text-slate-500 mt-1">
              {customWords.length} / 500
            </p>
          </motion.div>
        )}
      </Section>
    </div>
  );
};