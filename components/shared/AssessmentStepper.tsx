import React from 'react';
import { motion } from 'framer-motion';
import { FileText, BrainCircuit, Eye, Check } from 'lucide-react';

interface AssessmentStepperProps {
  currentStep: number;
}

export const AssessmentStepper: React.FC<AssessmentStepperProps> = ({ currentStep }) => {
  const steps = [
    { id: 1, label: '文本與年級', icon: FileText },
    { id: 2, label: '認知策略', icon: BrainCircuit },
    { id: 3, label: '預覽與發佈', icon: Eye },
  ];

  return (
    <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] border border-slate-50 w-full max-w-4xl mx-auto mb-8">
      <div className="relative flex items-center justify-between w-full px-4">
        
        {/* 背景連接線 (未填充狀態) */}
        <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 rounded-full z-0"></div>

        {/* 動態填充連接線 */}
        <motion.div 
          className="absolute top-1/2 left-0 h-1 bg-emerald-500 -translate-y-1/2 rounded-full z-0 origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: (currentStep - 1) / (steps.length - 1) }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />

        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isUpcoming = currentStep < step.id;

          const Icon = isCompleted ? Check : step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-3">
              {/* 步驟圖標容器 */}
              <motion.div
                initial={false}
                animate={{
                  backgroundColor: isCompleted ? '#10B981' : isCurrent ? '#4F46E5' : '#F1F5F9', // Emerald, Indigo, Slate
                  color: isUpcoming ? '#94A3B8' : '#FFFFFF',
                  scale: isCurrent ? 1.1 : 1,
                }}
                transition={{ duration: 0.3 }}
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
                  ${isCurrent ? 'shadow-lg shadow-indigo-200/50 ring-4 ring-indigo-50' : ''}
                  ${isCompleted ? 'shadow-md shadow-emerald-200/50' : ''}
                `}
              >
                <Icon size={20} strokeWidth={isCompleted ? 3 : 2} />
              </motion.div>

              {/* 步驟文字標籤 */}
              <div className={`text-sm tracking-wide transition-colors duration-300 font-['Nunito',_'Noto_Sans_TC']
                ${isCurrent ? 'text-indigo-600 font-bold' : isCompleted ? 'text-slate-700 font-semibold' : 'text-slate-400 font-medium'}
              `}>
                {step.id}. {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
