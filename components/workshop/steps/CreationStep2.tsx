import React, { useState, useEffect, useCallback } from 'react';
import { Icons } from '../../icons';
import { motion } from 'framer-motion';

type UploadMethod = 'file' | 'url' | 'text';

const TipsWidget: React.FC = () => (
  <div className="bg-[#EFF6FF] p-4 rounded-2xl flex items-center space-x-4 border border-blue-200/80">
    <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
      <span className="text-base">💡</span>
    </div>
    <p className="text-sm text-blue-800 leading-relaxed">
      建議上傳至少兩個文件：一個是人物背景設定，一個是具體知識庫，這樣機器人會更懂你。
    </p>
  </div>
);

const SegmentedControl: React.FC<{ selected: UploadMethod; onSelect: (method: UploadMethod) => void; }> = ({ selected, onSelect }) => {
    const tabs: { id: UploadMethod; label: string; icon: React.ElementType }[] = [
        { id: 'file', label: '上傳文檔', icon: Icons.file },
        { id: 'url', label: '導入網址', icon: Icons.link },
        { id: 'text', label: '貼上文字', icon: Icons.task },
    ];
    return (
        <div className="bg-slate-100 p-1 rounded-xl flex items-center">
            {tabs.map(tab => (
                 <button 
                    key={tab.id}
                    onClick={() => onSelect(tab.id)}
                    className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center space-x-2 ${selected === tab.id ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200/50'}`}
                >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
    );
};

interface CreationStep2Props {
  onGenerated: (text: string) => void;
}

export const CreationStep2: React.FC<CreationStep2Props> = ({ onGenerated }) => {
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>('file');
  const [file, setFile] = useState<File | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete'>('idle');
  const [generatedDescription, setGeneratedDescription] = useState('');

  const resetState = () => {
    setFile(null);
    setInputValue('');
    setStatus('idle');
    setGeneratedDescription('');
  };

const handleProcess = async () => {
  if ((uploadMethod === 'file' && !file) || (uploadMethod !== 'file' && !inputValue.trim())) return;
  setStatus('processing');

  let content = "";

  // 文件
  if (uploadMethod === "file" && file) {
    const text = await file.text();
    content = text;
  }

  // URL & 文本
  if (uploadMethod !== "file") {
    content = inputValue;
  }

  const baseUrl = import.meta.env.VITE_API_URL;

  // ===== 调用真正的深度解析 API =====
  const r = await fetch(`${baseUrl}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemPrompt: `
你係一個專門幫人整理混亂資料嘅 AI。

請你閱讀以下提供嘅原始內容，將佢整理成一段
「適合作為 AI 人格設定」嘅描述。

⚠️ 請用 **第一人稱**（例如：我係 / 我平時會 / 我性格係…）

要求：
- 用 3～6 句話
- 必須保持流暢、有角色感
- 風格自然、貼地、有“真係一個人”嘅感覺
- 絕對唔可以逐字抄原文
- 要按原文的精神來創作
- 不要評論原文、不要加入格式、標題或項目符號
- 讓 ChatGPT 之後能用呢段文字嚟扮演角色

請輸出純文字即可。
`,
      userPrompt: content
    })
  });

  const data = await r.json();

  const finalDesc = data.reply || "（解析失敗）";

  setGeneratedDescription(finalDesc);
  onGenerated(finalDesc);
  setStatus("complete");
};

  const handleFileDrop = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  }, []);

  // Effect to trigger processing when file is set
  useEffect(() => {
    if (uploadMethod === 'file' && file && status === 'idle') {
      handleProcess();
    }
  }, [file, uploadMethod, status]);


  const renderInputArea = () => {
    switch(uploadMethod) {
      case 'file':
        return (
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFileDrop(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl bg-slate-50"
          >
            <Icons.upload className="w-12 h-12 mb-4 text-slate-400" />
            <p className="font-semibold text-slate-600">拖拽文件到此處</p>
            <p className="text-sm text-slate-500 mt-1">或</p>
            <label className="mt-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
              選擇文件
              <input type="file" className="hidden" onChange={e => handleFileDrop(e.target.files)} />
            </label>
          </div>
        );
      case 'url':
        return (
           <div className="flex items-center space-x-2">
              <input 
                type="url"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="https://example.com/knowledge.html"
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200"
              />
              <button onClick={handleProcess} className="px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">解析</button>
           </div>
        );
      case 'text':
        return (
          <div className="space-y-2">
            <textarea
              rows={5}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="將知識內容貼到此處..."
              className="w-full p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200"
            />
            <button onClick={handleProcess} className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">解析</button>
          </div>
        )
    }
  };
  
  const renderStatusView = () => {
    if (status === 'processing') {
      return (
        <div className="relative p-8 bg-indigo-50 rounded-2xl overflow-hidden text-center border border-indigo-200/80">
          <style>{`
            .scanner-wave {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: radial-gradient(circle at center, rgba(79, 70, 229, 0.3) 0%, rgba(79, 70, 229, 0) 60%);
              border-radius: 1rem;
              animation: wave 2s infinite ease-out;
              opacity: 0;
            }
            @keyframes wave {
              0% { transform: scale(0); opacity: 0.5; }
              100% { transform: scale(1.5); opacity: 0; }
            }
          `}</style>
          <div className="scanner-wave"></div>
          <div className="scanner-wave" style={{animationDelay: '1s'}}></div>
          <Icons.brain className="w-10 h-10 text-indigo-500 mx-auto animate-pulse" />
          <p className="text-sm font-semibold text-indigo-700 mt-3">AI 解析中，請稍候...</p>
        </div>
      );
    }

    if (status === 'complete') {
      let sourceInfo;
      if (uploadMethod === 'file' && file) {
        sourceInfo = { icon: Icons.file, text: file.name };
      } else if (uploadMethod === 'url') {
        sourceInfo = { icon: Icons.link, text: inputValue };
      } else {
        sourceInfo = { icon: Icons.task, text: "貼上的文字片段" };
      }

      return (
        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <sourceInfo.icon className="w-5 h-5 text-indigo-500 shrink-0" />
                <p className="text-sm font-medium text-slate-700 truncate">{sourceInfo.text}</p>
              </div>
              <button onClick={resetState} className="p-1.5 rounded-full hover:bg-slate-200">
                <Icons.delete className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200/80">
            <h4 className="text-sm font-bold text-emerald-800 mb-2 flex items-center">
                <Icons.sparkles className="w-4 h-4 mr-2 text-emerald-600"/>
                AI 生成的機器人功能描述
            </h4>
            <textarea 
              readOnly
              rows={4}
              value={generatedDescription}
              className="w-full p-2 text-sm text-emerald-900 bg-white/50 rounded-lg border-0 focus:ring-0 resize-none"
            />
          </div>
        </motion.div>
      );
    }
    
    return renderInputArea();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">4. 知識餵養</h3>
        <p className="text-sm text-slate-500">上傳相關文件、網址或文字，AI 將學習這些內容來回答學生的問題。這是建立機器人知識庫的核心步驟。</p>
      </div>

      <TipsWidget />
      
      {status === 'idle' && (
        <SegmentedControl selected={uploadMethod} onSelect={setUploadMethod} />
      )}
      
      <div className="min-h-[160px] flex flex-col justify-center">
        {renderStatusView()}
      </div>

    </div>
  );
};
