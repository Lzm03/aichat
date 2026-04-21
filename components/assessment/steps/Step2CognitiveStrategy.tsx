import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, BrainCircuit, ListChecks, ArrowRight, ArrowLeft, AlertCircle, HelpCircle } from 'lucide-react';

interface Step2CognitiveStrategyProps {
  onNext: () => void;
  onPrev: () => void;
}

const bloomLevels = [
  {
    id: 'remembering',
    title: '記憶',
    en: 'Remembering',
    desc: '提取、識別和回憶基礎知識',
    tags: ['選擇', '填充'],
    color: 'blue',
    isHighOrder: false,
  },
  {
    id: 'understanding',
    title: '理解',
    en: 'Understanding',
    desc: '從教學訊息中建構意義',
    tags: ['選擇', '簡答'],
    color: 'emerald',
    isHighOrder: false,
  },
  {
    id: 'applying',
    title: '應用',
    en: 'Applying',
    desc: '在給定情境中執行或使用程序',
    tags: ['簡答', '應用'],
    color: 'amber',
    isHighOrder: false,
  },
  {
    id: 'analyzing',
    title: '分析',
    en: 'Analyzing',
    desc: '將材料分解並確定各部分關係',
    tags: ['簡答', '論述'],
    color: 'orange',
    isHighOrder: true,
  },
  {
    id: 'evaluating',
    title: '評價',
    en: 'Evaluating',
    desc: '基於標準和準則做出判斷',
    tags: ['論述'],
    color: 'red',
    isHighOrder: true,
  },
  {
    id: 'creating',
    title: '創造',
    en: 'Creating',
    desc: '將要素重組為新的模式或結構',
    tags: ['寫作', '專題'],
    color: 'purple',
    isHighOrder: true,
  },
];

const questionTypesList = [
  '多項選擇題',
  '填充題',
  '判斷題',
  '簡答題',
  '論述/寫作題',
];

const colorMap: Record<string, { bg: string; selectedBg: string; border: string; text: string; tagBg: string; tagText: string }> = {
  blue: { bg: 'bg-blue-50/50', selectedBg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-800', tagBg: 'bg-blue-100', tagText: 'text-blue-700' },
  emerald: { bg: 'bg-emerald-50/50', selectedBg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-800', tagBg: 'bg-emerald-100', tagText: 'text-emerald-700' },
  amber: { bg: 'bg-amber-50/50', selectedBg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-800', tagBg: 'bg-amber-100', tagText: 'text-amber-700' },
  orange: { bg: 'bg-orange-50/50', selectedBg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-800', tagBg: 'bg-orange-100', tagText: 'text-orange-700' },
  red: { bg: 'bg-red-50/50', selectedBg: 'bg-red-50', border: 'border-red-500', text: 'text-red-800', tagBg: 'bg-red-100', tagText: 'text-red-700' },
  purple: { bg: 'bg-purple-50/50', selectedBg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-800', tagBg: 'bg-purple-100', tagText: 'text-purple-700' },
};

export const Step2CognitiveStrategy: React.FC<Step2CognitiveStrategyProps> = ({ onNext, onPrev }) => {
  const [isBloomEnabled, setIsBloomEnabled] = useState(true);
  const [selectedBlooms, setSelectedBlooms] = useState<Set<string>>(new Set(['remembering', 'understanding']));
  const [selectedQTypes, setSelectedQTypes] = useState<Set<string>>(new Set(['多項選擇題', '簡答題']));
  const [hoveredBloom, setHoveredBloom] = useState<string | null>(null);

  const toggleBloom = (id: string) => {
    const newSet = new Set(selectedBlooms);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedBlooms(newSet);
  };

  const toggleQType = (type: string) => {
    const newSet = new Set(selectedQTypes);
    if (newSet.has(type)) {
      newSet.delete(type);
    } else {
      newSet.add(type);
    }
    setSelectedQTypes(newSet);
  };

  const needsEssayHint = isBloomEnabled && (selectedBlooms.has('evaluating') || selectedBlooms.has('creating')) && !selectedQTypes.has('論述/寫作題');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full flex flex-col space-y-6"
    >
      {/* 模塊 A：布魯姆認知層級 */}
      <div className="bg-white rounded-[24px] p-6 md:p-8 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 relative group">
                <h2 className="text-xl font-bold text-slate-800">布魯姆認知層級 (Bloom's Taxonomy)</h2>
                <HelpCircle className="w-[18px] h-[18px] text-slate-400 hover:text-indigo-500 cursor-help transition-colors" />
                
                {/* Hover Tooltip */}
                <div className="absolute left-0 bottom-full mb-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="bg-slate-800 text-white w-72 p-4 rounded-xl shadow-xl relative">
                    <h4 className="font-bold text-indigo-300 mb-2">🧠 什麼是布魯姆認知層級？</h4>
                    <p className="text-sm text-slate-200 leading-relaxed mb-3">
                      這是一個教育心理學模型，將學生的思考過程由淺入深分為六個階梯。從最基礎的「死記硬背」到最高階的「創新應用」。
                    </p>
                    <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg">
                      💡 建議：日常練習多選基礎層級；段考或進階評測可加入高階層級。
                    </p>
                    {/* Pointer */}
                    <div className="absolute -bottom-1.5 left-8 w-3 h-3 bg-slate-800 rotate-45"></div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-1">選擇本次測驗希望評估的認知能力層次</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${isBloomEnabled ? 'text-indigo-600' : 'text-slate-400'}`}>
              {isBloomEnabled ? '已開啟' : '已關閉'}
            </span>
            <button
              onClick={() => setIsBloomEnabled(!isBloomEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                isBloomEnabled ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  isBloomEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-300 ${isBloomEnabled ? '' : 'opacity-40 pointer-events-none grayscale-[50%]'}`}>
          {bloomLevels.map((level) => {
            const isSelected = selectedBlooms.has(level.id);
            const colors = colorMap[level.color];
            const isHovered = hoveredBloom === level.id;

            return (
              <div 
                key={level.id}
                className="relative"
                onMouseEnter={() => setHoveredBloom(level.id)}
                onMouseLeave={() => setHoveredBloom(null)}
              >
                {/* 懸停提示 (Tooltip) */}
                <AnimatePresence>
                  {isHovered && level.isHighOrder && (
                    <motion.div
                      initial={{ opacity: 0, y: 5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 5, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute -top-14 left-1/2 -translate-x-1/2 w-[220px] bg-slate-800/95 backdrop-blur-sm text-white text-xs p-2.5 rounded-xl shadow-xl z-50 pointer-events-none text-center leading-relaxed"
                    >
                      💡 提示：小學三年級較難掌握此層級，建議謹慎選擇或提供充足鷹架。
                      {/* Tooltip Arrow */}
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800/95 rotate-45"></div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleBloom(level.id)}
                  className={`h-full p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col ${
                    isSelected 
                      ? `${colors.selectedBg} ${colors.border} shadow-sm` 
                      : `${colors.bg} border-transparent hover:border-${level.color}-200`
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className={`text-lg font-bold ${colors.text}`}>{level.title}</h3>
                      <span className={`text-xs font-medium opacity-70 ${colors.text}`}>{level.en}</span>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      isSelected ? colors.border + ' bg-white border' : 'bg-white/50'
                    }`}>
                      {isSelected && <Check className={`w-3.5 h-3.5 ${colors.text}`} strokeWidth={3} />}
                    </div>
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-4 flex-1 leading-relaxed">
                    {level.desc}
                  </p>
                  
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {level.tags.map(tag => (
                      <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colors.tagBg} ${colors.tagText}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 模塊 B：題型偏好 */}
      <div className="bg-white rounded-[24px] p-6 md:p-8 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col relative z-0">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">題型偏好</h2>
            <p className="text-sm text-slate-500">選擇要在測驗中包含的題目類型（可多選）</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {questionTypesList.map((type) => {
            const isSelected = selectedQTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleQType(type)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* 智能聯動提示 */}
        <AnimatePresence>
          {needsEssayHint && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 20 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-amber-50 border border-amber-100 text-amber-700 text-sm p-4 rounded-xl flex items-start gap-3 leading-relaxed">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold">智能提示：</span>
                  您在上方選擇了「評價」或「創造」等高階認知層級，建議在題型中加入<span className="font-bold">「論述/寫作題」</span>，以更好地評估學生的深度思考與表達能力。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部導航 */}
      <div className="flex items-center justify-between pt-4">
        <button 
          onClick={onPrev}
          className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          返回上一步
        </button>
        <button 
          onClick={onNext}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-8 py-3.5 rounded-full font-bold hover:shadow-lg hover:shadow-indigo-200/50 hover:-translate-y-0.5 transition-all active:scale-95"
        >
          下一步：預覽與發佈
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};
