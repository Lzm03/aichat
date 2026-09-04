import { uiText } from '../../utils/uiI18n';
import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Eye, Check } from 'lucide-react';

interface AssessmentStepperProps {
  currentStep: number;
  isDraftMode?: boolean;
}

export const AssessmentStepper: React.FC<AssessmentStepperProps> = ({ currentStep, isDraftMode = false }) => {
  const steps = [
    { id: 1, label: '文本與年級', icon: FileText },
    { id: 2, label: isDraftMode ? '預覽與儲存' : '預覽與發佈', icon: Eye },
  ];
  const progress = steps.length > 1 ? ((currentStep - 1) / (steps.length - 1)) * 100 : 0;

  return (
    <div className="w-full max-w-4xl mx-auto mb-8 rounded-[28px] border border-slate-100 bg-white px-6 py-7 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="relative mx-auto max-w-2xl px-6 sm:px-10">
        <div className="absolute left-12 right-12 top-5 h-[3px] rounded-full bg-slate-100 sm:left-16 sm:right-16" />
        <motion.div
          className="absolute left-12 top-5 h-[3px] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 sm:left-16"
          initial={{ width: 0 }}
          animate={{ width: `calc((100% - 6rem) * ${progress / 100})` }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
        />

        <div className="grid grid-cols-2 items-start">
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const Icon = isCompleted ? Check : step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center text-center">
              <motion.div
                initial={false}
                animate={{
                  backgroundColor: isCompleted ? '#14B8A6' : isCurrent ? '#4F46E5' : '#EEF2FF',
                  color: isCompleted || isCurrent ? '#FFFFFF' : '#64748B',
                  borderColor: isCompleted ? '#99F6E4' : isCurrent ? '#C7D2FE' : '#E2E8F0',
                  scale: isCurrent ? 1.05 : 1,
                }}
                transition={{ duration: 0.3 }}
                className={`flex h-12 w-12 items-center justify-center rounded-full border-[6px] text-lg shadow-sm
                  ${isCurrent ? 'shadow-[0_12px_28px_rgba(79,70,229,0.22)]' : ''}
                  ${isCompleted ? 'shadow-[0_10px_24px_rgba(20,184,166,0.18)]' : ''}
                `}
              >
                <Icon size={20} strokeWidth={isCompleted ? 3 : 2} />
              </motion.div>

              <div className={`mt-3 text-sm tracking-wide transition-colors duration-300 font-['Nunito',_'Noto_Sans_TC']
                ${isCurrent ? 'text-indigo-600 font-bold' : isCompleted ? 'text-slate-700 font-semibold' : 'text-slate-400 font-medium'}
              `}>
                {step.id}. {uiText(step.label)}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
