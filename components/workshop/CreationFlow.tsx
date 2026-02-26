import React, { useState } from 'react';
import { Stepper } from './Stepper';
import { Icons } from '../icons';
import { CreationStep1 } from './steps/CreationStep1';
import { CreationStep2 } from './steps/CreationStep2';
import { CreationStep3 } from './steps/CreationStep3';
import { CreationStep4 } from './steps/CreationStep4';
import { CreationStepSoundAnimation } from './steps/CreationStepSoundAnimation';
import { ChatPreview } from './ChatPreview';
import { motion, AnimatePresence } from 'framer-motion';
import { PublishSuccessModal } from './PublishSuccessModal';

interface CreationFlowProps {
  onBack: () => void;
  botId: string | null;
}

const steps = ["基礎設定", "形象與人格", "聲音與動畫", "知識餵養", "安全與權限"];

export const CreationFlow: React.FC<CreationFlowProps> = ({ onBack, botId }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isPublishSuccessModalOpen, setIsPublishSuccessModalOpen] = useState(false);
  
  const [botConfig, setBotConfig] = useState({
    name: botId ? "5A 班英文口語教練" : "我的 AI 機器人",
    avatar: botId ? "https://i.pravatar.cc/150?u=bot1" : "https://api.dicebear.com/8.x/bottts/svg?seed=new_bot",
    background: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=2832&auto=format&fit=crop",
    animation: '點頭回應',
    knowledgeBase: "", 
  });

  const updateConfig = <K extends keyof typeof botConfig>(key: K, value: typeof botConfig[K]) => {
    setBotConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClosePublishModal = () => {
    setIsPublishSuccessModalOpen(false);
    setCurrentStep(1); // Reset for next creation
    onBack(); // Go back to library
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <CreationStep1 updateConfig={updateConfig} botName={botConfig.name} />;
      case 2: 
        return (
          <CreationStep3 
            updateConfig={updateConfig}
            botConfig={botConfig} 
          />
        );
      case 3: return <CreationStepSoundAnimation updateConfig={updateConfig} animation={botConfig.animation} avatarUrl={botConfig.avatar} />;
      case 4:
        return (
          <CreationStep2
            onGenerated={(desc) => updateConfig("knowledgeBase", desc)}
          />
        );
      case 5: return <CreationStep4 />;
      default: return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-6 transition-colors">
        <Icons.back className="w-4 h-4 mr-2" />
        返回我的機器人庫
      </button>
      
      <Stepper steps={steps} currentStep={currentStep} setCurrentStep={setCurrentStep}/>
      
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        <div className="lg:col-span-3">
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] min-h-[600px]">
            {renderStep()}
          </div>
        </div>

        <div className="hidden lg:block lg:col-span-2 lg:sticky top-28">
            <ChatPreview currentStep={currentStep} botConfig={botConfig} isEditing={!!botId} />
        </div>
      </div>
      
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsPreviewModalOpen(true)}
          className="w-16 h-16 bg-white/40 backdrop-blur-md border border-white/20 text-slate-800 rounded-full shadow-lg flex items-center justify-center"
          aria-label="Open chat preview"
        >
          <Icons.visible className="w-8 h-8" />
        </motion.button>
      </div>

      <AnimatePresence>
        {isPreviewModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-full max-w-lg h-[85vh] max-h-[700px]"
            >
              <ChatPreview currentStep={currentStep} botConfig={botConfig} isEditing={!!botId} />
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="absolute top-4 right-4 z-[80] w-8 h-8 bg-black/20 rounded-full flex items-center justify-center shadow-md transition-colors hover:bg-black/40"
                aria-label="Close chat preview"
              >
                <Icons.close className="w-5 h-5 text-white" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PublishSuccessModal 
        isOpen={isPublishSuccessModalOpen}
        onClose={handleClosePublishModal}
        botConfig={botConfig}
      />

      <div className={`mt-8 flex items-center ${currentStep > 1 ? 'justify-between' : 'justify-end'}`}>
        {currentStep > 1 && (
          <button 
            onClick={handlePrev} 
            className="px-6 py-3 rounded-xl text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
          >
            上一步
          </button>
        )}
        {currentStep < steps.length ? (
          <button 
            onClick={handleNext}
            className="px-6 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition-all"
          >
            下一步
          </button>
        ) : (
          <button onClick={() => setIsPublishSuccessModalOpen(true)} className="px-6 py-3 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition-all">
            {botId ? '更新機器人' : '完成並發布'}
          </button>
        )}
      </div>
    </div>
  );
};